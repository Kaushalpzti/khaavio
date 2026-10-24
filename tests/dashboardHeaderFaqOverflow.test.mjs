import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const layout = read("../src/components/RestaurantDashboardLayout.jsx");
const dashboard = read("../src/pages/Dashboard.jsx");
const workspaceCss = read("../src/RestaurantWorkspaceDesign.css");
const helpCss = read("../src/components/SupportHelpPanel.css");

test("Overview does not render a second workspace navbar; sign-out remains accessible from shared sidebar", () => {
  assert.doesNotMatch(dashboard, /<header className="dashboard-header"/);
  assert.doesNotMatch(dashboard, /function handleSignOut/);
  assert.match(layout, /className="[^"]*restaurant-dashboard-signout-link/);
  assert.match(layout, /supabase\.auth\.signOut\(\)/);
  assert.match(layout, /navigate\("\/login", \{ replace: true \}\)/);
});

test("page headers are styled as content toolbars instead of a second sticky navbar", () => {
  assert.match(workspaceCss, /\.restaurant-dashboard-content \.kitchen-header[\s\S]*?position: static !important/);
  assert.match(workspaceCss, /background: transparent/);
  assert.match(workspaceCss, /backdrop-filter: none/);
});

test("mobile workspace header explicitly keeps hamburger visible and preserves restaurant identity", () => {
  assert.match(layout, /className="restaurant-dashboard-menu-trigger"/);
  assert.match(layout, /className="restaurant-dashboard-mobilebrand"/);
  assert.match(workspaceCss, /restaurant-dashboard-menu-trigger \{[\s\S]*?display: inline-grid !important/);
});

test("FAQ and contact content wrap inside cards and collapse to one column on tablet widths", () => {
  assert.match(helpCss, /\.khaavio-help-layout[\s\S]*?grid-template-columns: minmax\(0, 1\.55fr\) minmax\(0, 0\.8fr\)/);
  assert.match(helpCss, /\.khaavio-help-answer p[\s\S]*?overflow-wrap: anywhere/);
  assert.match(helpCss, /\.khaavio-help-question strong[\s\S]*?overflow-wrap: anywhere/);
  assert.match(helpCss, /@media \(max-width: 1050px\)[\s\S]*?grid-template-columns: minmax\(0, 1fr\)/);
});
