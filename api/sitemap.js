import { isSafeRestaurantSlug } from "../src/lib/seoMetadata.js";

const SITE_URL = "https://khaavio.in";
const STATIC_PUBLIC_PATHS = ["/", "/about", "/contact", "/privacy", "/terms", "/refund-policy"];

function escapeXml(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

export function buildSitemapXml(slugs = []) {
  const urls = new Set(STATIC_PUBLIC_PATHS.map((path) => SITE_URL + path));
  for (const row of slugs) {
    const slug = typeof row === "string" ? row : row?.slug;
    if (isSafeRestaurantSlug(slug)) urls.add(SITE_URL + "/menu/" + encodeURIComponent(slug));
  }
  const entries = [...urls].sort().map((url) => "  <url><loc>" + escapeXml(url) + "</loc></url>");
  return '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    entries.join("\n") + "\n</urlset>\n";
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    res.statusCode = 405;
    res.end("Method not allowed");
    return;
  }

  const supabaseUrl = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").replace(/\/+$/, "");
  const publicKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || "";
  if (!supabaseUrl || !publicKey) {
    res.statusCode = 503;
    res.setHeader("Cache-Control", "no-store");
    res.end("Sitemap source is not configured.");
    return;
  }

  try {
    const response = await fetch(supabaseUrl + "/rest/v1/rpc/khaavio_public_sitemap_restaurant_slugs", {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: publicKey, Authorization: "Bearer " + publicKey },
      body: "{}",
      signal: AbortSignal.timeout(4500),
    });
    if (!response.ok) throw new Error("Sitemap restaurant lookup failed: HTTP " + response.status);
    const rows = await response.json();
    if (!Array.isArray(rows)) throw new Error("Sitemap restaurant lookup returned an invalid response.");
    const xml = buildSitemapXml(rows);
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "public, max-age=0, s-maxage=300, stale-while-revalidate=3600");
    res.setHeader("Vercel-CDN-Cache-Control", "public, s-maxage=300, stale-while-revalidate=3600");
    res.end(req.method === "HEAD" ? undefined : xml);
  } catch (error) {
    console.error("Dynamic sitemap generation failed.", error?.message || error);
    res.statusCode = 503;
    res.setHeader("Cache-Control", "no-store");
    res.end("Sitemap is temporarily unavailable.");
  }
}
