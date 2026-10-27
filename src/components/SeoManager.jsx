import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { buildPageMetadata, normalizeMetadataPath } from "../lib/seoMetadata.js";

function upsertMeta(selector, attribute, key, content) {
  let node = document.head.querySelector(selector);
  if (content == null || content === "") {
    node?.remove();
    return;
  }
  if (!node) {
    node = document.createElement("meta");
    node.setAttribute(attribute, key);
    document.head.appendChild(node);
  }
  node.setAttribute("content", content);
}

function upsertCanonical(href) {
  let node = document.head.querySelector('link[rel="canonical"]');
  if (!href) {
    node?.remove();
    return;
  }
  if (!node) {
    node = document.createElement("link");
    node.rel = "canonical";
    document.head.appendChild(node);
  }
  node.href = href;
}

function upsertStructuredData(value) {
  let node = document.head.querySelector('script[type="application/ld+json"]');
  if (!value) {
    node?.remove();
    return;
  }
  if (!node) {
    node = document.createElement("script");
    node.type = "application/ld+json";
    document.head.appendChild(node);
  }
  node.textContent = JSON.stringify(value);
}

async function loadPublicRestaurant(slug) {
  if (!slug) return null;
  try {
    const { data, error } = await supabase.rpc("khaavio_public_restaurant_menu", {
      p_slug: slug,
    });
    if (error || !data?.restaurant || data.restaurant.is_published !== true) return null;
    return data.restaurant;
  } catch {
    return null;
  }
}

export default function SeoManager() {
  const { pathname, search } = useLocation();

  useEffect(() => {
    let active = true;

    async function updateMetadata() {
      const normalizedPath = normalizeMetadataPath(pathname);
      const query = new URLSearchParams(search);
      const tableToken = query.get("table") || "";
      const dynamicMatch = normalizedPath.match(/^\/(menu|book)\/([^/]+)$/);
      let restaurant = null;

      if (dynamicMatch) {
        let slug = "";
        try { slug = decodeURIComponent(dynamicMatch[2]); } catch { slug = ""; }
        if (/^[a-z0-9][a-z0-9-]{0,159}$/i.test(slug)) restaurant = await loadPublicRestaurant(slug);
      }

      if (!active) return;
      const page = buildPageMetadata(normalizedPath, { restaurant, tableToken });
      document.title = page.title;
      upsertMeta('meta[name="description"]', "name", "description", page.description);
      upsertMeta(
        'meta[name="robots"]',
        "name",
        "robots",
        page.indexable ? "index,follow,max-image-preview:large" : "noindex,follow",
      );
      upsertMeta('meta[name="keywords"]', "name", "keywords", page.keywords);
      upsertMeta('meta[property="og:type"]', "property", "og:type", "website");
      upsertMeta('meta[property="og:site_name"]', "property", "og:site_name", "Khaavio");
      upsertMeta('meta[property="og:locale"]', "property", "og:locale", "en_IN");
      upsertMeta('meta[property="og:title"]', "property", "og:title", page.title);
      upsertMeta('meta[property="og:description"]', "property", "og:description", page.description);
      upsertMeta('meta[property="og:url"]', "property", "og:url", page.ogUrl);
      upsertMeta('meta[property="og:image"]', "property", "og:image", page.image);
      upsertMeta('meta[property="og:image:type"]', "property", "og:image:type", page.imageType);
      upsertMeta('meta[property="og:image:width"]', "property", "og:image:width", String(page.imageWidth));
      upsertMeta('meta[property="og:image:height"]', "property", "og:image:height", String(page.imageHeight));
      upsertMeta('meta[property="og:image:alt"]', "property", "og:image:alt", page.imageAlt);
      upsertMeta('meta[name="twitter:card"]', "name", "twitter:card", "summary_large_image");
      upsertMeta('meta[name="twitter:title"]', "name", "twitter:title", page.title);
      upsertMeta('meta[name="twitter:description"]', "name", "twitter:description", page.description);
      upsertMeta('meta[name="twitter:image"]', "name", "twitter:image", page.image);
      upsertCanonical(page.canonical);
      upsertStructuredData(page.structuredData);
    }

    updateMetadata();
    return () => { active = false; };
  }, [pathname, search]);

  return null;
}
