import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  APP_SITE_URL,
  PUBLIC_SITE_URL,
  getAppRedirectUrl,
  getDomainRedirectTarget,
} from "../src/lib/domainRouting.js";
import { createPublicQrDestination } from "../src/lib/seoMetadata.js";

const read = (path) =>
  readFileSync(new URL(path, import.meta.url), "utf8");

test("restaurant dashboard routes use the app subdomain", () => {
  assert.equal(
    getDomainRedirectTarget("khaavio.in", "/dashboard/orders", "?source=home"),
    `${APP_SITE_URL}/dashboard/orders?source=home`,
  );
  assert.equal(
    getDomainRedirectTarget("khaavio.in", "/login", ""),
    `${APP_SITE_URL}/login`,
  );
  assert.equal(
    getDomainRedirectTarget("khaavio.in", "/platform-admin/subscriptions", ""),
    `${APP_SITE_URL}/platform-admin/subscriptions`,
  );
});

test("public restaurant pages stay on the root domain", () => {
  assert.equal(
    getDomainRedirectTarget("app.khaavio.in", "/menu/cafe-one", "?table=table_01"),
    `${PUBLIC_SITE_URL}/menu/cafe-one?table=table_01`,
  );
  assert.equal(
    getDomainRedirectTarget("app.khaavio.in", "/book/cafe-one", ""),
    `${PUBLIC_SITE_URL}/book/cafe-one`,
  );
  assert.equal(
    getDomainRedirectTarget("app.khaavio.in", "/track/cafe-one/order-123", ""),
    `${PUBLIC_SITE_URL}/track/cafe-one/order-123`,
  );
});

test("marketing pages and www canonicalization use the public root domain", () => {
  assert.equal(
    getDomainRedirectTarget("app.khaavio.in", "/contact", "?topic=demo"),
    `${PUBLIC_SITE_URL}/contact?topic=demo`,
  );
  assert.equal(
    getDomainRedirectTarget("www.khaavio.in", "/about", ""),
    `${PUBLIC_SITE_URL}/about`,
  );
  assert.equal(
    getDomainRedirectTarget("www.khaavio.in", "/dashboard", ""),
    `${APP_SITE_URL}/dashboard`,
  );
  assert.equal(
    getDomainRedirectTarget("www.khaavio.in:443", "/", ""),
    `${PUBLIC_SITE_URL}/`,
  );
});

test("canonical routes do not redirect and app root is handled by the router", () => {
  assert.equal(getDomainRedirectTarget("khaavio.in", "/menu/cafe-one", ""), "");
  assert.equal(getDomainRedirectTarget("app.khaavio.in", "/login", ""), "");
  assert.equal(getDomainRedirectTarget("app.khaavio.in", "/dashboard", ""), "");
  assert.equal(getDomainRedirectTarget("app.khaavio.in", "/", ""), "");
  assert.equal(getDomainRedirectTarget("localhost:5173", "/dashboard", ""), "");
});

test("auth callbacks use the app host in production and preserve local preview hosts", () => {
  assert.equal(
    getAppRedirectUrl("/reset-password", "khaavio.in", "https://khaavio.in"),
    `${APP_SITE_URL}/reset-password`,
  );
  assert.equal(
    getAppRedirectUrl("/onboarding", "localhost", "http://localhost:5173"),
    "http://localhost:5173/onboarding",
  );
  assert.equal(
    getAppRedirectUrl("/login", "khaavio-preview.vercel.app", "https://khaavio-preview.vercel.app"),
    "https://khaavio-preview.vercel.app/login",
  );
});

test("menu and table QR links always use the public root domain", () => {
  assert.equal(
    createPublicQrDestination("menu", "cafe-one"),
    `${PUBLIC_SITE_URL}/menu/cafe-one`,
  );
  assert.equal(
    createPublicQrDestination("menu", "cafe-one", "table_01"),
    `${PUBLIC_SITE_URL}/menu/cafe-one?table=table_01`,
  );
});

test("domain separation is wired into routes, auth, QR tools and server metadata", () => {
  const app = read("../src/App.jsx");
  const auth = read("../src/pages/Auth.jsx");
  const qr = read("../src/pages/QRStudio.jsx");
  const tableQr = read("../src/pages/TableQRStudio.jsx");
  const settings = read("../src/pages/RestaurantSettings.jsx");
  const seoApi = read("../api/seo.js");

  assert.match(app, /function DomainRouteBoundary/);
  assert.match(app, /getDomainRedirectTarget/);
  assert.match(app, /isRestaurantAppHost \? \([\s\S]*?\/dashboard/);
  assert.match(auth, /getAppRedirectUrl\("\/onboarding"/);
  assert.match(auth, /href=\{PUBLIC_SITE_URL\}/);
  assert.doesNotMatch(auth, /<Link to="\/" className="auth-(?:brand|back-home|mobile-brand)"/);
  assert.doesNotMatch(auth, /\$\{window\.location\.origin\}\/(?:login|onboarding|reset-password)/);
  for (const source of [qr, tableQr, settings]) {
    assert.match(source, /createPublicQrDestination/);
    assert.doesNotMatch(source, /window\.location\.origin\}\/menu|window\.location\.origin\}\/menu/);
  }
  assert.match(tableQr, /table\.qr_token/);
  assert.doesNotMatch(tableQr, /getPublicAppBase|VITE_PUBLIC_APP_URL/);
  assert.match(seoApi, /getDomainRedirectTarget/);
  assert.match(seoApi, /statusCode = 308/);
});
