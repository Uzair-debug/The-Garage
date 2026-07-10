// Cloudflare Pages Function: dynamic share cards for car pages.
// Rewrites <title> and Open Graph tags so a shared car link previews
// with that car's actual name, owner and photo.

const SUPABASE_URL = "https://fwxxuhyjuujdimqlyfys.supabase.co";
const ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ3eHh1aHlqdXVqZGltcWx5ZnlzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyMTMyNzAsImV4cCI6MjA5Nzc4OTI3MH0.AVots0cQi-_g6buANdaXAsZrWD0_LAiDVvZbI1USqaQ";

function esc(s) {
    return String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

export async function onRequest(context) {
    const { request, next } = context;
    const url = new URL(request.url);
    const isCarPage = url.pathname === "/car" || url.pathname === "/car.html";
    const id = url.searchParams.get("id");
    if (!isCarPage || !id) return next();

    const response = await next();
    try {
        const api = await fetch(
            `${SUPABASE_URL}/rest/v1/cars?id=eq.${encodeURIComponent(id)}&select=year,make,model,owner,photos,likes`,
            { headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` } },
        );
        const rows = await api.json();
        const car = rows && rows[0];
        if (!car) return response;

        const name = [car.year, car.make, car.model].filter(Boolean).join(" ") || "A build";
        const title = `${name} – The Garage`;
        const desc = `${car.owner ? `Built by ${car.owner}. ` : ""}${car.likes || 0} reps. Every build has a story.`;
        const img = (car.photos && car.photos[0]) || "https://ourgarage.pages.dev/og.png";

        const tags =
            `<meta property="og:type" content="website">` +
            `<meta property="og:site_name" content="The Garage">` +
            `<meta property="og:title" content="${esc(title)}">` +
            `<meta property="og:description" content="${esc(desc)}">` +
            `<meta property="og:url" content="${esc(url.origin + url.pathname + url.search)}">` +
            `<meta property="og:image" content="${esc(img)}">` +
            `<meta name="twitter:card" content="summary_large_image">`;

        return new HTMLRewriter()
            .on("title", { element(el) { el.setInnerContent(title); } })
            .on('meta[name="description"]', { element(el) { el.setAttribute("content", desc); } })
            .on("head", { element(el) { el.append(tags, { html: true }); } })
            .transform(response);
    } catch (e) {
        return response;
    }
}
