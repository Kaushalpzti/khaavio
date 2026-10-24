import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const projectRoot = new URL("../", import.meta.url);
const readRoot = (path) => readFileSync(new URL(path, projectRoot), "utf8");

test("robots.txt points crawlers to the Khaavio sitemap", () => {
  const robots = readRoot("public/robots.txt");
  assert.match(robots, /User-agent:\s*\*/i);
  assert.match(robots, /Sitemap:\s*https:\/\/khaavio\.in\/sitemap\.xml/i);
});

test("sitemap contains only public canonical marketing and legal pages", () => {
  const sitemap = readRoot("public/sitemap.xml");
  assert.match(sitemap, /https:\/\/khaavio\.in\//);
  assert.match(sitemap, /https:\/\/khaavio\.in\/privacy/);
  assert.match(sitemap, /https:\/\/khaavio\.in\/terms/);
  assert.match(sitemap, /https:\/\/khaavio\.in\/refund-policy/);
  assert.doesNotMatch(sitemap, /\/dashboard|\/login|\/signup|\/track\//);
});

test("HTML includes canonical, description, social preview and software schema", () => {
  const html = readRoot("index.html");
  assert.match(html, /rel="canonical" href="https:\/\/khaavio\.in\/"/);
  assert.match(html, /name="description"/);
  assert.match(html, /property="og:image" content="https:\/\/khaavio\.in\/khaavio-social-preview\.png"/);
  assert.match(html, /name="twitter:card" content="summary_large_image"/);
  assert.match(html, /"@type": "SoftwareApplication"/);
  assert.ok(existsSync(new URL("../public/khaavio-social-preview.png", import.meta.url)));
});

test("application routes and footer expose all legal pages", () => {
  const app = readRoot("src/App.jsx");
  const home = readRoot("src/pages/Home.jsx");
  const auth = readRoot("src/pages/Auth.jsx");
  for (const route of ["/privacy", "/terms", "/refund-policy"]) {
    assert.ok(app.includes(`path="${route}"`), `Missing route ${route}`);
    assert.ok(home.includes(`to="${route}"`), `Missing footer link ${route}`);
    assert.ok(auth.includes(`to="${route}"`), `Missing auth legal link ${route}`);
  }
  assert.match(app, /<SeoManager\s*\/>/);
});

test("legal policies cover privacy handling, subscription terms and refund requests", () => {
  const legal = readRoot("src/pages/LegalPage.jsx");
  assert.match(legal, /Information we may handle/);
  assert.match(legal, /manual subscription payment/);
  assert.match(legal, /7-day free trial/);
  assert.match(legal, /duplicate payment/);
  assert.match(legal, /khaavioqr@gmail\.com/);
  assert.match(legal, /917324883263/);
});
