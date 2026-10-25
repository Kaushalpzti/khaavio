import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const home = read("../src/pages/Home.jsx");
const homeCss = read("../src/pages/Home.css");
const catalogMigration = read("../supabase/migrations/20261026030000_refresh_public_plan_feature_catalog.sql");
const layout = read("../src/components/RestaurantDashboardLayout.jsx");
const publicMenu = read("../src/pages/PublicMenu.jsx");
const seoManager = read("../src/components/SeoManager.jsx");
const indexHtml = read("../index.html");

test("homepage advertises the current shipped restaurant and guest modules", () => {
  for (const phrase of [
    "MENU + QR STUDIO",
    "QR ORDERING + TRACKING",
    "BOOKINGS",
    "ORDERS + INSIGHTS",
    "TABLE-SIDE SERVICE",
    "TABLE SESSIONS + BILLING",
    "LOYALTY + REWARDS",
    "GUEST REVIEWS + FEEDBACK",
    "ASK KHAAVIO AI",
  ]) {
    assert.ok(home.includes(phrase), `homepage should include ${phrase}`);
  }

  for (const component of [
    'label: "Service requests"',
    'label: "Loyalty & rewards"',
    'label: "Table sessions & billing"',
    'label: "Reviews & feedback"',
  ]) {
    assert.ok(layout.includes(component), `workspace should actually contain ${component}`);
  }
  assert.match(publicMenu, /import AskKhaavio from "\.\.\/components\/AskKhaavio"/);
  assert.match(publicMenu, /import PublicLoyaltyClub from "\.\.\/components\/PublicLoyaltyClub"/);
  assert.match(publicMenu, /import PublicReviewsFeedback from "\.\.\/components\/PublicReviewsFeedback"/);
  assert.match(seoManager, /Khaavio \| QR Ordering, Menus & Restaurant Operations/);
  assert.match(seoManager, /table billing, loyalty rewards, guest feedback and AI menu help/);
  assert.match(indexHtml, /og:title.*QR Ordering, Menus &amp; Restaurant Operations/);
  assert.match(indexHtml, /AI menu help in one workspace/);
});

test("homepage Starter and Growth plan copy reflects the current product and tier split", () => {
  for (const phrase of [
    "Table-side service requests: waiter, water, cutlery and bill",
    "Table sessions, final bills and printable invoices",
    "Digital loyalty stamps and rewards",
    "Guest feedback and optional Google review links",
    "Ask Khaavio AI menu assistant in English, Hindi and Hinglish",
  ]) {
    assert.ok(home.includes(phrase), `homepage plan copy should include ${phrase}`);
  }
  assert.match(home, /Advanced booking calendar, search and date filters/);
  assert.match(home, /Booking CSV export/);
  assert.match(home, /Enhanced analytics and menu performance insights/);
  assert.match(home, /Priority support during the founding pilot/);
  assert.match(home, /monthlyPrice: "499"/);
  assert.match(home, /yearlyPrice: "4,990"/);
  assert.match(home, /monthlyPrice: "899"/);
  assert.match(home, /yearlyPrice: "8,990"/);
});

test("database plan catalog migration refreshes only plan descriptions and feature lists", () => {
  for (const planKey of [
    "pilot", "trial", "starter", "starter_yearly", "growth", "growth_yearly", "pro",
  ]) {
    assert.ok(catalogMigration.includes(`'${planKey}'`), `catalog migration should cover ${planKey}`);
  }
  for (const phrase of [
    "Table-side service requests: waiter, water, cutlery and bill",
    "Table sessions, final bills and printable invoices",
    "Digital loyalty stamps and rewards",
    "Guest feedback and optional Google review links",
    "Ask Khaavio AI menu assistant in English, Hindi and Hinglish",
    "Advanced booking calendar, search and date filters",
    "Booking CSV export",
    "Enhanced analytics and menu performance insights",
  ]) {
    assert.ok(catalogMigration.includes(phrase), `database catalog should include ${phrase}`);
  }
  assert.doesNotMatch(catalogMigration, /price_inr\s*=/i, "catalog copy update must not change pricing");
  assert.doesNotMatch(catalogMigration, /limits\s*=/i, "catalog copy update must not change plan entitlements");
});

test("expanded homepage feature grid remains responsive", () => {
  assert.match(homeCss, /\.kh-feature-grid\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/s);
  assert.match(homeCss, /@media\s*\(max-width:\s*1080px\)[\s\S]*?\.kh-feature-grid,[\s\S]*?grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(homeCss, /@media\s*\(max-width:\s*760px\)[\s\S]*?\.kh-feature-grid\s*\{\s*grid-template-columns:\s*1fr;/);
});
