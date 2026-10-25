import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const layout = read("../src/components/RestaurantDashboardLayout.jsx");
const layoutCss = read("../src/components/RestaurantDashboardLayout.css");
const polish = read("../src/components/RestaurantWorkspacePolish.css");

const dashboardPages = [
  "Dashboard.jsx",
  "RestaurantSettings.jsx",
  "MenuManager.jsx",
  "QRStudio.jsx",
  "TableQRStudio.jsx",
  "OrdersDashboard.jsx",
  "KitchenDisplay.jsx",
  "TableSessions.jsx",
  "OrderReceipts.jsx",
  "BookingsDashboard.jsx",
  "Analytics.jsx",
  "Subscription.jsx",
];

test("restaurant dashboard uses one shared subtle polish layer while preserving classic page modules", () => {
  assert.match(layout, /import "\.\/RestaurantWorkspacePolish\.css";/);
  assert.doesNotMatch(layout, /RestaurantWorkspaceDesign\.css/);
  for (const file of dashboardPages) {
    const source = read(`../src/pages/${file}`);
    assert.doesNotMatch(
      source,
      /RestaurantWorkspaceDesign\.css/,
      `${file} should keep its original page styles and inherit shared polish from the layout`,
    );
  }
  assert.match(polish, /--workspace-canvas:\s*#f7f8f4/);
  assert.match(polish, /--workspace-paper:\s*#fffefa/);
  assert.match(polish, /@media \(max-width: 780px\)/);
  assert.doesNotMatch(polish, /radial-gradient\(ellipse/);
});

test("restaurant identity stays in the workspace header and Khaavio branding stays in the sidebar footer", () => {
  assert.match(layout, /restaurant-dashboard-workspacebar/);
  assert.match(layout, /restaurant-dashboard-identity-mark/);
  assert.match(layout, /restaurant-dashboard-powered-by/);
  assert.match(layoutCss, /restaurant-dashboard-sidebar/);
  assert.match(polish, /restaurant-dashboard-workspacebar/);
  assert.match(polish, /restaurant-dashboard-powered-by/);
});

test("shared polish keeps mobile navigation and content styles responsive without a dramatic backdrop", () => {
  assert.match(polish, /@media \(max-width: 780px\)/);
  assert.match(polish, /min-width:\s*0/);
  assert.match(layoutCss, /restaurant-dashboard-mobilebar/);
  assert.match(layoutCss, /restaurant-dashboard-menu-trigger/);
  assert.doesNotMatch(polish, /radial-gradient\(ellipse/);
});
