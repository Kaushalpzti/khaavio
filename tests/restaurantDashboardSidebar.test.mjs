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
