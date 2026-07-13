// Cloudflare Pages Function: RSS feed of recent crew activity.
// Mirrors the merge logic in activity.html (new/updated cars, build
// timeline updates, comments) so the feed matches what's on the page.

const SUPABASE_URL = "https://fwxxuhyjuujdimqlyfys.supabase.co";
const ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ3eHh1aHlqdXVqZGltcWx5ZnlzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyMTMyNzAsImV4cCI6MjA5Nzc4OTI3MH0.AVots0cQi-_g6buANdaXAsZrWD0_LAiDVvZbI1USqaQ";
const SITE = "https://ourgarage.pages.dev";

function esc(s) {
    return String(s == null ? "" : s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

function carName(c) {
    if (!c) return "a build";
    return [c.year, c.make, c.model].filter(Boolean).join(" ").trim() || "a build";
}

async function sbGet(path) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
        headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
    });
    if (!res.ok) return [];
    return res.json();
}

export async function onRequestGet() {
    try {
        const [cars, updates, comments] = await Promise.all([
            sbGet("cars?select=id,year,make,model,owner,status,updated_at&order=updated_at.desc&limit=15"),
            sbGet("car_updates?select=id,title,body,car_id,created_at,cars(year,make,model,owner)&order=created_at.desc&limit=20"),
            sbGet("car_comments?select=id,author,body,car_id,created_at,cars(year,make,model,owner)&order=created_at.desc&limit=20"),
        ]);

        const items = [];

        (cars || []).forEach(c => {
            if (!c.updated_at) return;
            const name = carName(c);
            items.push({
                t: c.updated_at,
                title: `🏁 ${name}${c.owner ? ` — ${c.owner}` : ""}`,
                link: `${SITE}/car.html?id=${c.id}`,
                desc: `${name} was added or updated in The Garage.${c.status ? ` Status: ${c.status}.` : ""}`,
                guid: `car-${c.id}-${c.updated_at}`,
            });
        });

        (updates || []).forEach(u => {
            const name = carName(u.cars);
            const t = new Date(u.created_at).getTime();
            items.push({
                t,
                title: `🔧 Build update on ${name}: ${u.title}`,
                link: `${SITE}/car.html?id=${u.car_id}`,
                desc: u.body || u.title,
                guid: `update-${u.id}`,
            });
        });

        (comments || []).forEach(c => {
            const name = carName(c.cars);
            const t = new Date(c.created_at).getTime();
            items.push({
                t,
                title: `💬 ${c.author || "Someone"} commented on ${name}`,
                link: `${SITE}/car.html?id=${c.car_id}`,
                desc: c.body || "",
                guid: `comment-${c.id}`,
            });
        });

        items.sort((a, b) => b.t - a.t);
        const top = items.slice(0, 30);

        const itemsXml = top.map(i => `
    <item>
      <title>${esc(i.title)}</title>
      <link>${esc(i.link)}</link>
      <guid isPermaLink="false">${esc(i.guid)}</guid>
      <pubDate>${new Date(i.t).toUTCString()}</pubDate>
      <description>${esc(i.desc)}</description>
    </item>`).join("");

        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>The Garage — Crew Activity</title>
    <link>${SITE}/</link>
    <atom:link href="${SITE}/feed.xml" rel="self" type="application/rss+xml"/>
    <description>New builds, mods, updates and comments from The Garage crew.</description>
    <language>en</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>${itemsXml}
  </channel>
</rss>`;

        return new Response(xml, {
            headers: {
                "Content-Type": "application/rss+xml; charset=UTF-8",
                "Cache-Control": "public, max-age=600",
            },
        });
    } catch (e) {
        return new Response("<?xml version=\"1.0\"?><rss version=\"2.0\"><channel><title>The Garage</title></channel></rss>", {
            status: 200,
            headers: { "Content-Type": "application/rss+xml; charset=UTF-8" },
        });
    }
}
