// Supabase Edge Function: notify-callout
// Triggered by a Database Webhook on INSERT into public.callout_requests.
// Looks up the car owner's email (service role) and the car name, then
// emails the owner via Resend.
//
// Required secrets (set with `supabase secrets set ...`):
//   RESEND_API_KEY   - your Resend API key
//   FROM_EMAIL       - a verified Resend sender, e.g. "The Garage <garage@yourdomain>"
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  try {
    const payload = await req.json();
    const record = payload.record ?? payload; // webhook sends { record: {...} }
    const { owner_id, car_id, requester_email, message } = record;

    if (!owner_id) {
      return new Response("No owner_id", { status: 200 });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Owner email (from auth.users)
    const { data: ownerData, error: ownerErr } = await admin.auth.admin.getUserById(owner_id);
    if (ownerErr || !ownerData?.user?.email) {
      console.error("owner lookup failed", ownerErr);
      return new Response("Owner not found", { status: 200 });
    }
    const ownerEmail = ownerData.user.email;

    // Car name (nice-to-have)
    let carName = "your car";
    const { data: car } = await admin
      .from("cars")
      .select("make,model")
      .eq("id", car_id)
      .single();
    if (car) carName = [car.make, car.model].filter(Boolean).join(" ") || carName;

    const safeMsg = (message || "").toString().slice(0, 1000);
    const html = `
      <div style="font-family:system-ui,sans-serif;max-width:480px">
        <h2 style="color:#e63030;margin:0 0 8px">New callout request 🏁</h2>
        <p><strong>${requester_email ?? "Someone"}</strong> wants a callout on your <strong>${carName}</strong>.</p>
        ${safeMsg ? `<blockquote style="border-left:3px solid #e63030;margin:12px 0;padding:4px 12px;color:#444">${safeMsg}</blockquote>` : ""}
        <p style="color:#888;font-size:13px">Reply directly to ${requester_email ?? "them"} to link up.</p>
      </div>`;

    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${Deno.env.get("RESEND_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: Deno.env.get("FROM_EMAIL"),
        to: ownerEmail,
        reply_to: requester_email,
        subject: `New callout request for your ${carName}`,
        html,
      }),
    });

    if (!resp.ok) {
      console.error("resend error", await resp.text());
      return new Response("Email send failed", { status: 200 });
    }
    return new Response("ok", { status: 200 });
  } catch (e) {
    console.error(e);
    return new Response("error", { status: 200 });
  }
});
