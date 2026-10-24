import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const layout = read("../src/components/RestaurantDashboardLayout.jsx");
const css = read("../src/RestaurantWorkspaceDesign.css");

const dashboardPages = [
  "Dashboard.jsx", "RestaurantSettings.jsx", "MenuManager.jsx", "QRStudio.jsx",
  "TableQRStudio.jsx", "OrdersDashboard.jsx", "KitchenDisplay.jsx",
  "TableSessions.jsx", "OrderReceipts.jsx", "BookingsDashboard.jsx",
  "Analytics.jsx", "Subscription.jsx",
];

test("workspace header displays the owned restaurant identity and Khaavio brand sits in the footer", () => {
  assert.match(layout, /from \"\.\.\/lib\/supabaseClient\"/);
  assert.match(layout, /select\(\"name, logo_url, created_at\"\)/);
  assert.match(layout, /restaurant-dashboard-workspacebar/);
  assert.match(layout, /restaurant-dashboard-identity-mark/);
  assert.match(layout, /restaurant-dashboard-powered-by/);
  assert.doesNotMatch(layout, /className=\"restaurant-dashboard-brand\"/);
  assert.match(css, /restaurant-dashboard-workspacebar/);
  assert.match(css, /restaurant-dashboard-powered-by/);
});

test("every restaurant dashboard page imports the shared visual refresh", () => {
  for (const file of dashboardPages) {
    const source = read(`../src/pages/${file}`);
    assert.match(source, /RestaurantWorkspaceDesign\.css/, `${file} must use the shared dashboard design system`);
  }
});

test("shared redesign keeps the existing theme and adds responsive page-level styling", () => {
  assert.match(css, /--workspace-canvas: #f4f6f1/);
  assert.match(css, /#153c2e/);
  assert.match(css, /@media \(max-width: 780px\)/);
  assert.match(css, /@media \(max-width: 480px\)/);
  for (const selector of [".dashboard-welcome", ".restaurant-settings-section", ".menu-item-card", ".qr-workspace", ".order-card", ".kitchen-order-card", ".ts-session-card", ".booking-card", ".analytics-panel", ".subscription-plan-card"]) {
    assert.ok(css.includes(selector), `Missing page-specific style for ${selector}`);
  }
});
