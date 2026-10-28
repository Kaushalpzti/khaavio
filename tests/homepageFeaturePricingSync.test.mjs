import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const home = read("../src/pages/Home.jsx");
const homeCss = read("../src/pages/Home.css");
const catalogMigration = read("../supabase/migrations/20261026030000_refresh_public_plan_feature_catalog.sql");
const gatingMigration = read("../supabase/migrations/20261026040000_khaavio_growth_feature_gating.sql");
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
    "Billing that fits the table.",
    "separate guest tabs and bills",
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
  assert.match(publicMenu, /import PublicReviewsFeedback(?:, \{[^}]+\})? from "\.\.\/components\/PublicReviewsFeedback"/);
  assert.match(seoManager, /buildPageMetadata/);
  const seoMetadata = read("../src/lib/seoMetadata.js");
  assert.match(seoMetadata, /Khaavio \| QR Ordering, Menus & Restaurant Operations/);
  assert.match(seoMetadata, /table billing, loyalty rewards, guest feedback and AI menu help/);
  assert.match(indexHtml, /og:title.*QR Ordering, Menus &amp; Restaurant Operations/);
  assert.match(indexHtml, /AI menu help in one workspace/);
});

test("homepage editorial layout keeps marketing copy readable across desktop and mobile", () => {
  assert.match(homeCss, /\.hp-hero-copy > p\s*\{[^}]*font-size:\s*clamp\(16px, 1\.2vw, 18px\)/s);
  assert.match(homeCss, /\.hp-feature-tile p\s*\{[^}]*font-size:\s*13px/s);
  assert.match(homeCss, /\.hp-footer-column > a\s*\{[^}]*font-size:\s*12px/s);
  assert.match(homeCss, /@media \(max-width: 600px\)[\s\S]*?\.hp-hero-copy > p[\s\S]*?font-size:\s*15px/);
  assert.ok(home.includes('className="hp-feature-bento"'));
  assert.ok(home.includes('className="hp-workspace-frame"'));
});

test("homepage Starter and Growth plan copy reflects the current product and tier split", () => {
  for (const phrase of [
    "Table-side service requests: waiter, water, cutlery and bill",
    "Table sessions, final bills and printable invoices",
    "Digital loyalty stamps and rewards",
    "Operational voice alerts for orders, kitchen and service requests",
    "Google Business review link on the public menu (when configured)",
    "Private guest ratings, feedback inbox and review follow-up tools",
    "Ask Khaavio AI menu assistant in English, Hindi and Hinglish (usage limits apply)",
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

test("forward gating migration aligns the live catalog with Starter/Growth entitlements", () => {
  for (const phrase of [
    "Core menu, QR ordering and everyday restaurant operations",
    "Optional Google Business review link on the public menu",
    "Advanced booking calendar, search and date filters",
    "Booking CSV export",
    "Enhanced analytics and menu performance insights",
    "Digital loyalty stamps and rewards",
    "Private guest ratings, feedback inbox and review follow-up tools",
    "Ask Khaavio AI menu assistant in English, Hindi and Hinglish (usage limits apply)",
  ]) {
    assert.ok(gatingMigration.includes(phrase), `forward catalog migration should include ${phrase}`);
  }
  assert.match(gatingMigration, /'loyalty_rewards', false/);
  assert.match(gatingMigration, /'private_feedback', false/);
  assert.match(gatingMigration, /'google_review_link', true/);
  assert.match(gatingMigration, /'ai_menu_assistant', false/);
  assert.doesNotMatch(gatingMigration, /price_inr\s*=/i, "feature gating must not change plan pricing");
});

test("rebuilt homepage feature tiles adapt from four desktop columns to a compact mobile grid", () => {
  assert.match(homeCss, /\.hp-feature-grid\s*\{[^}]*grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/s);
  assert.match(homeCss, /@media\s*\(max-width:\s*1100px\)[\s\S]*?\.hp-feature-grid\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/s);
  assert.match(homeCss, /@media\s*\(max-width:\s*600px\)[\s\S]*?\.hp-feature-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s);
});
