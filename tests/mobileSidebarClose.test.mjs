import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const component = readFileSync(new URL("../src/components/RestaurantDashboardLayout.jsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/components/RestaurantDashboardLayout.css", import.meta.url), "utf8");

test("mobile sidebar header control closes the drawer instead of toggling desktop collapse", () => {
  assert.match(component, /const handleSidebarControlClick = \(\) => \{[\s\S]*?if \(window\.matchMedia\("\(max-width: 780px\)"\)\.matches\) \{[\s\S]*?setMobileOpen\(false\);[\s\S]*?return;[\s\S]*?\}[\s\S]*?setCollapsed\(\(value\) => !value\);[\s\S]*?\};/);
  assert.match(component, /aria-label=\{isMobileViewport \? "Close dashboard navigation"/);
  assert.match(component, /restaurant-dashboard-mobile-close-icon/);
  assert.match(component, /aria-controls="restaurant-dashboard-sidebar"/);
});

test("mobile layout overrides desktop-collapsed styles and shows a close icon", () => {
  assert.match(css, /\.restaurant-dashboard-layout\.is-collapsed \.restaurant-dashboard-sidebar-header/);
  assert.match(css, /\.restaurant-dashboard-layout\.is-collapsed \.restaurant-dashboard-nav-link/);
  assert.match(css, /\.restaurant-dashboard-desktop-collapse-icon \{ display: none; \}/);
  assert.match(css, /\.restaurant-dashboard-mobile-close-icon \{ display: inline-grid/);
  assert.match(css, /@media \(max-width: 780px\)/);
});
