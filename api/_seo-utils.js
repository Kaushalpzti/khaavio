import { buildPageMetadata, normalizeMetadataPath } from "../src/lib/seoMetadata.js";

function escapeAttribute(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function upsertMeta(html, attribute, key, value) {
  const safeKey = String(key).replace(/[^a-z0-9:_-]/gi, "");
  const pattern = new RegExp(
    '<meta\\b(?=[^>]*\\b' + attribute + '\\s*=\\s*["\\x27]' + safeKey + '["\\x27])[^>]*>',
    "i",
  );
  if (value == null || value === "") return html.replace(pattern, "");
  const tag = '<meta ' + attribute + '="' + safeKey + '" content="' + escapeAttribute(value) + '" />';
  if (pattern.test(html)) return html.replace(pattern, tag);
  return html.replace(/<\/head>/i, "    " + tag + "\n</head>");
}

function upsertCanonical(html, href) {
  const pattern = /<link\b(?=[^>]*\brel\s*=\s*["']canonical["'])[^>]*>/i;
  if (!href) return html.replace(pattern, "");
  const tag = '<link rel="canonical" href="' + escapeAttribute(href) + '" />';
  if (pattern.test(html)) return html.replace(pattern, tag);
  return html.replace(/<\/head>/i, "    " + tag + "\n</head>");
}

function upsertTitle(html, title) {
  const tag = "<title>" + escapeAttribute(title) + "</title>";
  if (/<title\b[^>]*>[\s\S]*?<\/title>/i.test(html)) return html.replace(/<title\b[^>]*>[\s\S]*?<\/title>/i, tag);
  return html.replace(/<\/head>/i, "    " + tag + "\n</head>");
}

function upsertStructuredData(html, structuredData) {
  const pattern = /<script\b(?=[^>]*\btype\s*=\s*["']application\/ld\+json["'])[^>]*>[\s\S]*?<\/script>/i;
  if (!structuredData) return html.replace(pattern, "");
  const json = JSON.stringify(structuredData).replace(/</g, "\\u003c");
  const tag = '<script type="application/ld+json">' + json + "</script>";
  if (pattern.test(html)) return html.replace(pattern, tag);
  return html.replace(/<\/head>/i, "    " + tag + "\n</head>");
}

export function injectPageMetadata(html, metadata) {
  let output = upsertTitle(html, metadata.title);
  const tags = [
    ["name", "description", metadata.description],
    ["name", "robots", metadata.indexable ? "index,follow,max-image-preview:large" : "noindex,follow"],
    ["name", "keywords", metadata.keywords],
    ["property", "og:type", "website"],
    ["property", "og:site_name", "Khaavio"],
    ["property", "og:locale", "en_IN"],
    ["property", "og:url", metadata.ogUrl],
    ["property", "og:title", metadata.title],
    ["property", "og:description", metadata.description],
    ["property", "og:image", metadata.image],
    ["property", "og:image:type", metadata.imageType || "image/png"],
    ["property", "og:image:width", String(metadata.imageWidth || 1200)],
    ["property", "og:image:height", String(metadata.imageHeight || 630)],
    ["property", "og:image:alt", metadata.imageAlt || ""],
    ["name", "twitter:card", "summary_large_image"],
    ["name", "twitter:title", metadata.title],
    ["name", "twitter:description", metadata.description],
    ["name", "twitter:image", metadata.image],
  ];
  for (const tag of tags) output = upsertMeta(output, tag[0], tag[1], tag[2]);
  output = upsertCanonical(output, metadata.canonical);
  output = upsertStructuredData(output, metadata.structuredData);
  return output;
}

export { buildPageMetadata, normalizeMetadataPath };
