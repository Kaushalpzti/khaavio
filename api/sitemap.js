const SITE_URL = "https://khaavio.in";
const STATIC_PATHS = ["/", "/about", "/contact", "/privacy", "/terms", "/refund-policy"];
const SAFE_SLUG = /^[a-z0-9][a-z0-9-]{0,159}$/i;

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

async function getPublishedRestaurantSlugs() {
  const supabaseUrl = String(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const publishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    "";

  if (!supabaseUrl || !publishableKey) return null;

  try {
    const response = await fetch(
      supabaseUrl + "/rest/v1/rpc/khaavio_public_sitemap_slugs",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: publishableKey,
          Authorization: "Bearer " + publishableKey,
        },
        body: "{}",
        signal: AbortSignal.timeout(3500),
      },
    );

    if (!response.ok) {
      console.warn("Sitemap restaurant lookup returned status:", response.status);
      return null;
    }

    const rows = await response.json();
    if (!Array.isArray(rows)) return null;

    return [...new Set(rows
      .map((row) => typeof row === "string" ? row : row?.slug)
      .filter((slug) => typeof slug === "string" && SAFE_SLUG.test(slug)))];
  } catch (error) {
    console.warn("Sitemap restaurant lookup failed.", error?.name || "FetchError");
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    res.statusCode = 405;
    res.end("Method not allowed");
    return;
  }

  const publishedSlugs = await getPublishedRestaurantSlugs();
  const paths = [
    ...STATIC_PATHS,
    ...(publishedSlugs || []).map((slug) => "/menu/" + encodeURIComponent(slug)),
  ];
  const urls = [...new Set(paths)].map((path) => {
    const loc = escapeXml(SITE_URL + path);
    return "  <url>\n    <loc>" + loc + "</loc>\n  </url>";
  });

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    "</urlset>",
    "",
  ].join("\n");

  res.statusCode = 200;
  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Sitemap-Dynamic", publishedSlugs === null ? "static-fallback" : "enabled");
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=300, stale-while-revalidate=3600");
  res.end(req.method === "HEAD" ? undefined : xml);
}
