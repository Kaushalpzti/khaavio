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
  const css = read("src/RestaurantWorkspaceDesign.css");
  const helpCss = read("src/components/SupportHelpPanel.css");
  assert.match(css, /min-width: 0;[\s\S]*?max-width: 100%/);
  assert.match(css, /\.dashboard-module-grid\s*\{\s*grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(css, /\.menu-publication-panel\s*\{[\s\S]*?flex-wrap: wrap/);
  assert.match(helpCss, /overflow-wrap: anywhere/);
  assert.match(helpCss, /@media \(max-width: 1050px\)/);
});
