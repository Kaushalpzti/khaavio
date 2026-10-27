import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  buildPageMetadata,
  createPublicQrDestination,
  createSocialQrImageUrl,
} from "../src/lib/seoMetadata.js";
import { injectPageMetadata } from "../api/_seo-utils.js";
import socialQrHandler from "../api/social-qr.js";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

function mockResponse() {
  return {
    statusCode: 0,
    headers: {},
    body: undefined,
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    end(body) { this.body = body; },
  };
}

test("published restaurant menu metadata is page-specific and uses its own QR image URL", () => {
  const page = buildPageMetadata("/menu/ayushi-cafe", {
    restaurant: {
      id: "public-only-id",
      name: "Ayushi Cafe",
      slug: "ayushi-cafe",
      restaurant_type: "Cafe",
      is_published: true,
      logo_url: "https://example.com/ayushi-logo.png",
    },
  });
  assert.match(page.title, /Ayushi Cafe Menu/);
  assert.match(page.description, /Ayushi Cafe/);
  assert.match(page.keywords, /Ayushi Cafe menu/i);
  assert.match(page.image, /\/api\/social-qr\?/);
  assert.match(page.image, /slug=ayushi-cafe/);
  assert.equal(page.canonical, "https://khaavio.in/menu/ayushi-cafe");
  assert.equal(page.imageWidth, 1200);
  assert.equal(page.imageHeight, 1200);
  assert.match(JSON.stringify(page.structuredData), /"@type":"Restaurant"/);
  assert.doesNotMatch(JSON.stringify(page), /public-only-id/);
});

test("menu QR destination includes the actual URL and optional table token", () => {
  assert.equal(
    createPublicQrDestination("menu", "ayushi-cafe", "table_123"),
    "https://khaavio.in/menu/ayushi-cafe?table=table_123",
  );
  assert.equal(
    createPublicQrDestination("book", "ayushi-cafe"),
    "https://khaavio.in/book/ayushi-cafe",
  );
  assert.equal(createPublicQrDestination("menu", "https://evil.example"), "");
  assert.equal(createPublicQrDestination("unknown", "ayushi-cafe"), "");
  assert.equal(
    createPublicQrDestination("menu", "ayushi-cafe", "https://evil.example"),
    "https://khaavio.in/menu/ayushi-cafe",
  );
});

test("table-specific social preview QR preserves the existing table token", () => {
  const image = createSocialQrImageUrl("menu", "ayushi-cafe", "table_123");
  assert.match(image, /type=menu/);
  assert.match(image, /slug=ayushi-cafe/);
  assert.match(image, /table=table_123/);
});

test("booking metadata uses the restaurant identity without indexing the booking route", () => {
  const page = buildPageMetadata("/book/ayushi-cafe", {
    restaurant: {
      name: "Ayushi Cafe",
      slug: "ayushi-cafe",
      restaurant_type: "Cafe",
      is_published: true,
    },
  });
  assert.match(page.title, /Book a Table at Ayushi Cafe/);
  assert.match(page.description, /Ayushi Cafe/);
  assert.equal(page.indexable, false);
  assert.match(page.image, /type=book/);
});

test("order-tracking metadata stays generic and does not expose the order identifier", () => {
  const page = buildPageMetadata("/track/ayushi-cafe/order-SECRET-123");
  assert.match(page.title, /Track Your Order/);
  assert.match(page.description, /secure tracking link/);
  assert.equal(page.indexable, false);
  assert.doesNotMatch(page.title + page.description, /SECRET-123/);
});

test("server metadata replaces homepage Open Graph tags before returning HTML", () => {
  const html = [
    "<!doctype html><html><head>",
    "<title>Khaavio homepage</title>",
    '<meta name="description" content="Homepage text">',
    '<meta property="og:title" content="Khaavio homepage">',
    '<meta property="og:image" content="https://khaavio.in/khaavio-social-preview.png">',
    '<link rel="canonical" href="https://khaavio.in/">',
    '<script type="application/ld+json">{"@type":"SoftwareApplication"}</script>',
    "</head><body><div id=\"root\"></div></body></html>",
  ].join("");
  const page = buildPageMetadata("/menu/ayushi-cafe", {
    restaurant: {
      name: "Ayushi Cafe",
      slug: "ayushi-cafe",
      restaurant_type: "Cafe",
      is_published: true,
    },
  });
  const result = injectPageMetadata(html, page);
  assert.match(result, /<title>Ayushi Cafe Menu/);
  assert.match(result, /property="og:title" content="Ayushi Cafe Menu/);
  assert.match(result, /property="og:image" content="https:\/\/khaavio\.in\/api\/social-qr\?/);
  assert.match(result, /name="robots" content="index,follow,max-image-preview:large"/);
  assert.match(result, /"@type":"Restaurant"/);
  assert.doesNotMatch(result, /Homepage text/);
});

test("real social QR handler responds with a generated PNG for the actual public URL", async () => {
  const req = {
    method: "GET",
    url: "/api/social-qr?type=menu&slug=ayushi-cafe&table=table_123",
  };
  const res = mockResponse();
  await socialQrHandler(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["content-type"], "image/png");
  assert.equal(res.body.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.match(res.headers["cache-control"], /s-maxage=86400/);
});

test("Vercel serves route-aware HTML without enabling automatic Git deployments", () => {
  const config = JSON.parse(read("../vercel.json"));
  const catchAll = config.rewrites[config.rewrites.length - 1];
  assert.equal(catchAll.destination, "/api/seo?path=/$1");
  assert.equal(catchAll.source, "/((?!api/).*)");
  assert.equal(config.git.deploymentEnabled, false);
  assert.equal(config.functions["api/seo.js"].includeFiles, "dist/index.html");
});

test("client SEO manager loads public menu details on route changes", () => {
  const seoClient = read("../src/components/SeoManager.jsx");
  assert.match(seoClient, /khaavio_public_restaurant_menu/);
  assert.match(seoClient, /buildPageMetadata/);
  assert.match(seoClient, /\[pathname, search\]/);
});
