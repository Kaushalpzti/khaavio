import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("classic dashboard page layout and original page styles remain in place", () => {
  for (const [page, style, className] of [
    ["Dashboard.jsx", "Dashboard.css", ".dashboard-module-grid"],
    ["RestaurantSettings.jsx", "RestaurantSettings.css", ".restaurant-settings-page"],
    ["MenuManager.jsx", "MenuManager.css", ".menu-page"],
    ["OrdersDashboard.jsx", "OrdersDashboard.css", ".orders-page"],
    ["BookingsDashboard.jsx", "BookingsDashboard.css", ".bookings-page"],
    ["Analytics.jsx", "Analytics.css", ".analytics-page"],
  ]) {
    const source = read(`../src/pages/${page}`);
    const css = read(`../src/pages/${style}`);
    assert.match(source, new RegExp(style.replace(".", "\\.")));
    assert.ok(css.includes(className), `${style} should keep the original page styles`);
    assert.doesNotMatch(source, /RestaurantWorkspaceDesign\.css/);
  }
});

test("workspace modernization stays subtle and preserves the original green/cream theme", () => {
  const polish = read("../src/components/RestaurantWorkspacePolish.css");
  assert.match(polish, /--workspace-canvas: #f7f8f4/);
  assert.match(polish, /--workspace-paper: #fffefa/);
  assert.match(polish, /transition: border-color 160ms ease, box-shadow 160ms ease, transform 160ms ease/);
  assert.match(polish, /@media \(max-width: 780px\)/);
  assert.doesNotMatch(polish, /radial-gradient\(ellipse/);
});
