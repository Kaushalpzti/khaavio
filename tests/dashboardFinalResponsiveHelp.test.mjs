import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

test("Help Center is a standalone protected dashboard page", () => {
  const app = read("src/App.jsx");
  const dashboard = read("src/pages/Dashboard.jsx");
  const layout = read("src/components/RestaurantDashboardLayout.jsx");
  const help = read("src/pages/HelpCenter.jsx");
  assert.match(app, /path="\/dashboard\/help"/);
  assert.match(app, /import\("\.\/pages\/HelpCenter"\)/);
  assert.match(layout, /to="\/dashboard\/help"/);
  assert.doesNotMatch(dashboard, /SupportHelpPanel/);
  assert.match(help, /<SupportHelpPanel/);
  assert.ok(existsSync(new URL("src/pages/HelpCenter.css", root)));
});

test("Published public menu has a visible button-style CTA next to publish controls", () => {
  const dashboard = read("src/pages/Dashboard.jsx");
  const css = read("src/RestaurantWorkspaceDesign.css");
  assert.match(dashboard, /className="menu-publication-public-button"/);
  assert.match(dashboard, /className="menu-publication-actions"/);
  assert.match(dashboard, /Open public menu/);
  assert.match(css, /\.menu-publication-public-button\s*\{[\s\S]*?display: inline-flex/);
  assert.match(css, /\.menu-publication-actions\s*\{[\s\S]*?flex-wrap: wrap/);
});

test("Dashboard cards and help text have responsive overflow guards", () => {
  const css = read("src/components/RestaurantWorkspacePolish.css");
  const helpCss = read("src/components/SupportHelpPanel.css");
  assert.match(css, /min-width: 0;[\s\S]*?max-width: 100%/);
  assert.match(css, /\.dashboard-module-grid\s*\{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.dashboard-quick-actions\s*\{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /@media \(max-width: 360px\)/);
  assert.match(css, /\.menu-publication-panel\s*\{[\s\S]*?flex-wrap: wrap/);
  assert.match(helpCss, /overflow-wrap: anywhere/);
  assert.match(helpCss, /@media \(max-width: 1050px\)/);
});

test("compact workspace keeps navigation and page content dense across breakpoints", () => {
  const css = read("src/components/RestaurantWorkspacePolish.css");
  assert.match(css, /grid-template-columns: 232px minmax\(0, 1fr\)/);
  assert.match(css, /min-height: 112px/);
  assert.match(css, /@media \(max-width: 780px\)/);
  assert.match(css, /@media \(max-width: 1050px\) and \(min-width: 781px\)/);
  assert.match(css, /background: linear-gradient\(180deg, #153b2e 0%, #103326 100%\)/);
  assert.match(css, /width: min\(1360px, calc\(100% - 72px\)\)/);
  assert.match(css, /\.orders-stats, \.bookings-stats, \.analytics-stat-grid, \.ts-stats,[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.service-requests-cards, \.kitchen-order-grid\) \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\)/);
});

test("overview snapshot uses restaurant-scoped read-only daily queries and compact mobile cards", () => {
  const dashboard = read("src/pages/Dashboard.jsx");
  const css = read("src/components/RestaurantWorkspacePolish.css");
  assert.match(dashboard, /from\("orders"\)[\s\S]*?select\("status, total_amount"\)[\s\S]*?eq\("restaurant_id", restaurantId\)/);
  assert.match(dashboard, /from\("bookings"\)[\s\S]*?select\("status"\)[\s\S]*?eq\("restaurant_id", restaurantId\)/);
  assert.match(dashboard, /order\.status === "completed"/);
  assert.match(dashboard, /ACTIVE_ORDER_STATUSES/);
  assert.match(dashboard, /className="dashboard-today"/);
  assert.match(dashboard, /Welcome back,/);
  assert.match(css, /\.dashboard-today \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
});

test("workspace identity and page headings share a compact header rhythm", () => {
  const css = read("src/components/RestaurantWorkspacePolish.css");
  assert.match(css, /One header rhythm: restaurant identity above, page title and controls below/);
  assert.match(css, /\.help-center-page-heading, \.service-requests-header, \.loyalty-dashboard-header,[\s\S]*?border-bottom: 1px solid #e2e9e0/);
  assert.match(css, /\.orders-heading h1, \.bookings-heading h1, \.analytics-heading h1/);
  assert.match(css, /\.loyalty-dashboard-header, \.review-feedback-heading, \.service-requests-header/);
  assert.doesNotMatch(css, /\.review-feedback-header/);
  assert.match(css, /@media \(max-width: 780px\)[\s\S]*?\.help-center-page-heading, \.service-requests-header, \.loyalty-dashboard-header,/);
});
