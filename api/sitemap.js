const SITE_URL = "https://khaavio.in";
const STATIC_PATHS = ["/", "/about", "/contact", "/privacy", "/terms", "/refund-policy"];

function xmlEscape(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    res.statusCode = 405;
    res.end("Method not allowed");
    return;
  }

  const supabaseUrl = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").replace(/\/+$/, "");
  const publicKey = process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY || "";
  if (!supabaseUrl || !publicKey) {
    res.statusCode = 503;
    res.setHeader("Cache-Control", "no-store");
    res.end("Sitemap source is not configured");
    return;
  }

  try {
    const response = await fetch(supabaseUrl + "/rest/v1/rpc/khaavio_public_sitemap_restaurant_slugs", {
      method: "POST",
      headers: { apikey: publicKey, Authorization: "Bearer " + publicKey, "Content-Type": "application/json" },
      body: "{}",
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) throw new Error("Public sitemap slug query failed: " + response.status);
    const rows = await response.json();
    const slugs = Array.isArray(rows)
      ? rows.map((row) => typeof row?.slug === "string" ? row.slug : "")
          .filter((slug) => /^[a-z0-9][a-z0-9-]{0,159}$/i.test(slug))
      : [];
    const paths = [...STATIC_PATHS, ...slugs.map((slug) => "/menu/" + encodeURIComponent(slug))];
    const urls = paths.map((path) => "  <url><loc>" + xmlEscape(SITE_URL + path) + "</loc></url>").join("\n");
    const xml = '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      urls + "\n</urlset>";
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "public, max-age=0, s-maxage=600, stale-while-revalidate=3600");
    res.end(req.method === "HEAD" ? undefined : xml);
  } catch (error) {
    console.error("Dynamic sitemap generation failed:", error instanceof Error ? error.message : "unknown error");
    res.statusCode = 503;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.end("Sitemap is temporarily unavailable");
  }
}
