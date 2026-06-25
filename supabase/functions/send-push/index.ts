// Supabase Edge Function: send-push
// Triggered by a Database Webhook on INSERT into public.callout_requests.
// Sends a Web Push notification to all of the car owner's registered devices.
//
// Required secrets (set with `supabase secrets set ...`):
//   VAPID_PUBLIC_KEY   - the public key baked into push.js
//   VAPID_PRIVATE_KEY  - the matching private key (keep secret!)
//   VAPID_SUBJECT      - a mailto: or https URL, e.g. "mailto:you@example.com"
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically.

import webpush from "npm:web-push@3.6.7";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

webpush.setVapidDetails(
  Deno.env.get("VAPID_SUBJECT") || "mailto:admin@thegarage.app",
  Deno.env.get("VAPID_PUBLIC_KEY")!,
  Deno.env.get("VAPID_PRIVATE_KEY")!,
);

Deno.serve(async (req) => {
  try {
    const payload = await req.json();
    const record = payload.record ?? payload;
    const old = payload.old_record ?? {};
    const { owner_id, car_id, requester_id, requester_email, message, response, rejected } = record;

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let carName = "your car";
    const { data: car } = await admin.from("cars").select("make,model").eq("id", car_id).single();
    if (car) carName = [car.make, car.model].filter(Boolean).join(" ") || carName;

    // Decide who to notify: owner on a new request, requester on a reply.
    let targetUserId: string | null = null;
    let title = "";
    let body = "";
    const isReply = payload.type === "UPDATE" && response && response !== old.response;
    const isReject = payload.type === "UPDATE" && rejected && !old.rejected;

    if (isReply) {
      targetUserId = requester_id;
      title = "Callout reply 🏁";
      body = `The owner replied about your ${carName}: “${String(response).slice(0, 80)}”`;
    } else if (isReject) {
      targetUserId = requester_id;
      title = "Callout declined";
      body = `The owner declined your callout on ${carName}`;
    } else if (payload.type === "INSERT" || !payload.type) {
      targetUserId = owner_id;
      title = "New callout request 🏁";
      body = `${requester_email ?? "Someone"} wants a callout on your ${carName}` +
        (message ? ` — “${String(message).slice(0, 80)}”` : "");
    }
    if (!targetUserId) return new Response("nothing to send", { status: 200 });

    const { data: subs } = await admin
      .from("push_subscriptions")
      .select("endpoint,p256dh,auth")
      .eq("user_id", targetUserId);
    if (!subs || subs.length === 0) return new Response("no subs", { status: 200 });

    const notification = JSON.stringify({ title, body, url: "callouts.html" });

    await Promise.all(subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          notification,
        );
      } catch (e) {
        // Subscription gone (unsubscribed / expired) -> clean it up
        if (e?.statusCode === 404 || e?.statusCode === 410) {
          await admin.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
        } else {
          console.error("push failed", e?.statusCode, e?.body);
        }
      }
    }));

    return new Response("ok", { status: 200 });
  } catch (e) {
    console.error(e);
    return new Response("error", { status: 200 });
  }
});
