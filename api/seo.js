import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildPageMetadata, injectPageMetadata, normalizeMetadataPath } from "./_seo-utils.js";
import { getDomainRedirectTarget } from "../src/lib/domainRouting.js";

const SITE_URL = "https://khaavio.in";

function getSlugFromPath(pathname) {
  const match = pathname.match(/^\/(?:menu|book)\/([^/]+)$/);
  if (!match) return "";
  let slug = "";
  try { slug = decodeURIComponent(match[1]); } catch { return ""; }
  return /^[a-z0-9][a-z0-9-]{0,159}$/i.test(slug) ? slug : "";
}

async function fetchPublicRestaurant(slug) {
  if (!slug) return null;
  const supabaseUrl = String(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const publishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    "";
  if (!supabaseUrl || !publishableKey) return undefined;

  try {
    const response = await fetch(supabaseUrl + "/rest/v1/rpc/khaavio_public_restaurant_menu", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: publishableKey,
        Authorization: "Bearer " + publishableKey,
      },
      body: JSON.stringify({ p_slug: slug }),
      signal: AbortSignal.timeout(2800),
    });
    if (!response.ok) return undefined;
    const data = await response.json();
    if (!data || !data.restaurant || data.restaurant.is_published !== true) return null;
    return data.restaurant;
  } catch (error) {
    console.warn("Social metadata lookup failed for a public restaurant.", error?.name || "FetchError");
    return undefined;
  }
}

function readBuiltHtml() {
  const candidates = [
    resolve(process.cwd(), "dist", "index.html"),
    fileURLToPath(new URL("../dist/index.html", import.meta.url)),
  ];
  for (const candidate of candidates) {
    try {
      if (existsSync(candidate)) return readFileSync(candidate, "utf8");
    } catch {
      // Try the next deployment-safe location.
    }
  }
  throw new Error("Built dist/index.html was not included with the metadata function.");
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    res.statusCode = 405;
    res.end("Method not allowed");
    return;
  }

  try {
    const requestUrl = new URL(req.url || "/", SITE_URL);
    const pathname = normalizeMetadataPath(requestUrl.searchParams.get("path") || "/");
    const forwardedQuery = new URLSearchParams(requestUrl.searchParams);
    forwardedQuery.delete("path");
    const originalSearch = forwardedQuery.toString();
    const requestHost =
      req.headers?.["x-forwarded-host"] || req.headers?.host || "";
    const redirectTarget = getDomainRedirectTarget(
      requestHost,
      pathname,
      originalSearch ? `?${originalSearch}` : "",
    );

    if (redirectTarget) {
      res.statusCode = 308;
      res.setHeader("Location", redirectTarget);
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.end();
      return;
    }

    const slug = getSlugFromPath(pathname);
    const restaurant = slug ? await fetchPublicRestaurant(slug) : null;
    let metadata = buildPageMetadata(pathname, {
      restaurant,
      tableToken: requestUrl.searchParams.get("table") || "",
    });
    const missingRestaurantPage = Boolean(slug) && restaurant === null;
    const notFound = metadata.title === "Page Not Found | Khaavio" || missingRestaurantPage;
    if (notFound) {
      metadata = {
        ...metadata,
        title: "Page Not Found | Khaavio",
        description: "The page may have moved, or the link may be incorrect. Visit Khaavio to explore restaurant menus and tools.",
        indexable: false,
        canonical: "",
        structuredData: null,
      };
    }
    const html = injectPageMetadata(readBuiltHtml(), metadata);

    res.statusCode = notFound ? 404 : 200;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Robots-Tag", metadata.indexable ? "index,follow,max-image-preview:large" : "noindex,follow");
    if (metadata.indexable) {
      res.setHeader("Cache-Control", "public, max-age=0, s-maxage=300, stale-while-revalidate=3600");
      res.setHeader("Vercel-CDN-Cache-Control", "public, s-maxage=300, stale-while-revalidate=3600");
    } else {
      res.setHeader("Cache-Control", "private, no-store, max-age=0");
      res.setHeader("Vercel-CDN-Cache-Control", "no-store");
    }
    res.end(req.method === "HEAD" ? undefined : html);
  } catch (error) {
    console.error("Route metadata handler failed.", error?.message || error);
    res.statusCode = 500;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.end("Unable to prepare page metadata.");
  }
}
