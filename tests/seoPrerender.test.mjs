import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { buildPageMetadata } from "../src/lib/seoMetadata.js";
import {
  extractPrerenderedPages,
  injectPrerenderedContent,
} from "../api/_seo-utils.js";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("built public-page snapshots are extracted and inserted into the root before metadata is returned", () => {
  const pages = {
    "/about": '<main><h1>Better table service</h1><p>One connected workspace.</p></main>',
  };
  const payload = JSON.stringify(pages).replace(/</g, "\\u003c");
  const template = [
    "<!doctype html><html><head>",
    '<script id="khaavio-seo-prerender" type="application/json">' + payload + "</script>",
    "</head><body><div id=\"root\"></div></body></html>",
  ].join("");

  const extracted = extractPrerenderedPages(template);
  assert.deepEqual(extracted.pages, pages);
  assert.doesNotMatch(extracted.html, /khaavio-seo-prerender/);

  const result = injectPrerenderedContent(extracted.html, extracted.pages["/about"]);
  assert.match(result, /<div id="root"><main><h1>Better table service<\/h1>/);
  assert.equal((result.match(/<h1(?:\s|>)/gi) || []).length, 1);
});

test("public prerender build includes every audited marketing and legal route", () => {
  const script = read("../scripts/prerender-seo-pages.mjs");
  for (const route of ["/", "/about", "/contact", "/privacy", "/terms", "/refund-policy"]) {
    assert.ok(script.includes('path: "' + route + '"'), "Missing prerender route " + route);
  }
  assert.match(script, /renderToString/);
  assert.match(script, /MemoryRouter/);
  assert.match(script, /headingCount !== 1/);
});

test("privacy metadata is descriptive while the authenticated dashboard remains noindex", () => {
  const privacy = buildPageMetadata("/privacy");
  assert.ok(privacy.title.length >= 30);
  assert.ok(privacy.description.length >= 70);

  const dashboard = buildPageMetadata("/dashboard");
  assert.ok(dashboard.description.length >= 70);
  assert.equal(dashboard.indexable, false);
  assert.equal(dashboard.canonical, "");
});

test("public restaurant menu uses a stable restaurant H1 and keeps promotional headings secondary", () => {
  const menu = read("../src/pages/PublicMenu.jsx");
  const styles = read("../src/pages/PublicMenuExperience.css");
  assert.ok(menu.includes('<h1 className="public-menu-brand-title">{restaurant.name} Menu</h1>'));
  assert.match(menu, /<h2>[\s\S]*?currentPromoSlide\.titleStart/);
  assert.match(menu, /<h2 id="public-menu-rewards-title"/);
  assert.match(menu, /<h2 id="public-menu-reviews-heading"/);
  assert.match(styles, /\.public-menu-promo-copy h2/);
  assert.match(styles, /\.public-menu-tab-hero h2/);
});
