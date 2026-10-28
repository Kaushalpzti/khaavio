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
  assert.match(sitemap, /https:\/\/khaavio\.in\/about/);
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

test("About page has a public route, metadata and homepage quick link", () => {
  const app = readRoot("src/App.jsx");
  const home = readRoot("src/pages/Home.jsx");
  const about = readRoot("src/pages/About.jsx");
  const seo = readRoot("src/lib/seoMetadata.js");
  assert.ok(app.includes('path="/about"'));
  assert.ok(home.includes('to="/about">About Khaavio</Link>'));
  assert.match(about, /Better table service/);
  assert.match(about, /restaurant/i);
  assert.match(seo, /"\/about":\s*\{/);
  assert.match(seo, /About Khaavio \| Restaurant QR Ordering & Operations/);
});

test("legal policies are reviewed against current Indian privacy and consumer grievance requirements", () => {
  const legal = readRoot("src/pages/LegalPage.jsx");
  assert.match(legal, /28 October 2026/);
  assert.match(legal, /Digital Personal Data Protection Act, 2023/);
  assert.match(legal, /Digital Personal Data Protection Rules, 2025/);
  assert.match(legal, /48 hours/);
  assert.match(legal, /30 days/);
  assert.match(legal, /statutory right or remedy/);
});

test("route navigation resets scroll to the top before paint", () => {
  const app = readRoot("src/App.jsx");
  assert.match(app, /function ScrollToTop\(\)/);
  assert.match(app, /useLayoutEffect\(\(\) => \{\s*window\.scrollTo\(\{ top: 0, left: 0, behavior: "instant" \}\);/);
  assert.match(app, /<ScrollToTop\s*\/>/);
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
