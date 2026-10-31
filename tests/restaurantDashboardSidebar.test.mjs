import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const layout = readFileSync(new URL("../src/components/RestaurantDashboardLayout.jsx", import.meta.url), "utf8");

test("restaurant workspace layout is only added inside the existing protected dashboard guard", () => {
  assert.match(app, /import RestaurantDashboardLayout from ["']\.\/components\/RestaurantDashboardLayout["']/);
  assert.match(app, /<SubscriptionAccessGuard>\s*<RestaurantDashboardLayout>\{children\}<\/RestaurantDashboardLayout>\s*<\/SubscriptionAccessGuard>/s);
  assert.match(app, /<ProtectedPage>\s*<RestaurantDashboardLayout>\s*<Subscription \/>\s*<\/RestaurantDashboardLayout>\s*<\/ProtectedPage>/s);
  assert.match(app, /<SeoManager \/>/);
  assert.match(app, /<ScrollToTop \/>/);
  assert.match(app, /path="\/privacy"/);
  assert.match(app, /path="\/terms"/);
  assert.match(app, /path="\/refund-policy"/);
});

test("sidebar provides active navigation links for every restaurant dashboard route", () => {
  const paths = [
    "/dashboard",
    "/dashboard/settings",
    "/dashboard/menu",
    "/dashboard/qr",
    "/dashboard/table-qr",
    "/dashboard/orders",
    "/dashboard/offers",
    "/dashboard/kitchen",
    "/dashboard/table-sessions",
    "/dashboard/receipts",
    "/dashboard/bookings",
    "/dashboard/analytics",
    "/dashboard/subscription",
  ];
  for (const path of paths) assert.ok(layout.includes(`to: "${path}"`), `Missing sidebar target ${path}`);
  assert.match(layout, /NavLink/);
  assert.match(layout, /isActive/);
  assert.match(layout, /setMobileOpen\(false\)/);
  assert.match(layout, /aria-expanded/);
});

test("sidebar has responsive collapse and mobile drawer support without touching page modules", () => {
  const css = readFileSync(new URL("../src/components/RestaurantDashboardLayout.css", import.meta.url), "utf8");
  assert.match(css, /\.restaurant-dashboard-layout\.is-collapsed/);
  assert.match(css, /is-collapsed \.restaurant-dashboard-collapse-button \{ display: inline-grid/);
  assert.match(css, /@media \(max-width: 780px\)/);
  assert.match(css, /prefers-reduced-motion/);
});


test("Operations appears immediately after Overview and before the Restaurant section", () => {
  const workspaceIndex = layout.indexOf('label: "Workspace"');
  const operationsIndex = layout.indexOf('label: "Operations"');
  const restaurantIndex = layout.indexOf('label: "Restaurant"');
  assert.ok(workspaceIndex >= 0 && operationsIndex > workspaceIndex && restaurantIndex > operationsIndex);
  const operationsBlock = layout.slice(operationsIndex, restaurantIndex);
  const expectedDailyOrder = [
    'label: "Orders"',
    'label: "Kitchen display"',
    'label: "Service requests"',
    'label: "Table sessions & billing"',
    'label: "Bookings"',
    'label: "Order receipts"',
    'label: "Offers & Coupons"',
    'label: "Loyalty & rewards"',
  ];
  let lastIndex = -1;
  for (const item of expectedDailyOrder) {
    const currentIndex = operationsBlock.indexOf(item);
    assert.ok(currentIndex > lastIndex, `Operations item is missing or out of order: ${item}`);
    lastIndex = currentIndex;
  }
});

test("Restaurant navigation is collapsible, remembers preference, and expands for its active routes", () => {
  assert.match(layout, /label: "Restaurant",[\s\S]*?collapsible: true/);
  assert.match(layout, /restaurant-dashboard-nav-label-toggle/);
  assert.match(layout, /aria-expanded=\{!groupCollapsed\}/);
  assert.match(layout, /aria-controls=\{groupId\}/);
  assert.match(layout, /localStorage\.getItem\(RESTAURANT_NAV_STORAGE_KEY\)/);
  assert.match(layout, /localStorage\.setItem\(RESTAURANT_NAV_STORAGE_KEY/);
  assert.match(layout, /if \(isRestaurantRoute\) setRestaurantNavCollapsed\(false\)/);
});


test("collapsible Restaurant heading keeps the same typography as other section labels", () => {
  const css = readFileSync(new URL("../src/components/RestaurantDashboardLayout.css", import.meta.url), "utf8");
  const toggleRule = css.match(/\.restaurant-dashboard-nav-label-toggle\s*\{([^}]+)\}/)?.[1] || "";
  assert.match(toggleRule, /font-family:\s*inherit/);
  assert.doesNotMatch(toggleRule, /font:\s*inherit/);
  assert.match(css, /\.restaurant-dashboard-nav-label\s*\{[\s\S]*?font-size:\s*9px[\s\S]*?font-weight:\s*850[\s\S]*?letter-spacing:\s*1\.25px[\s\S]*?text-transform:\s*uppercase/);
});
