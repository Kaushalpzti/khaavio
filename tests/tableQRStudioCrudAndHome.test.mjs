import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const studio = read("../src/pages/TableQRStudio.jsx");
const studioStyles = read("../src/pages/TableQRStudio.css");
const dashboard = read("../src/pages/Dashboard.jsx");
const dashboardStyles = read("../src/pages/Dashboard.css");
const homeStyles = read("../src/pages/Home.css");

test("table QR workspace supports editing while preserving the saved QR token", () => {
  assert.match(studio, /function handleUpdateTable/);
  assert.match(studio, /\.update\(\{ table_number: tableNumber, capacity \}\)/);
  assert.match(studio, /existing QR token is kept/);
  assert.match(studio, /aria-label=\{\`Edit \$\{table\.table_number\}\`\}/);
});

test("table QR workspace supports activation and history-safe deletion", () => {
  assert.match(studio, /function handleToggleTableActive/);
  assert.match(studio, /function handleDeleteTable/);
  assert.match(studio, /from\("table_sessions"\)/);
  assert.match(studio, /from\("table_session_invoices"\)/);
  assert.match(studio, /order or billing history/);
  assert.match(studio, /aria-label=\{\`Delete \$\{table\.table_number\}\`\}/);
});

test("table QR editor has accessible edit dialog and responsive management actions", () => {
  assert.match(studio, /aria-labelledby="tqr-edit-title"/);
  assert.match(studioStyles, /\.tqr-edit-form/);
  assert.match(studioStyles, /@media \(max-width: 620px\)/);
  assert.match(studioStyles, /\.tqr-card-qr-shell/);
});

test("restaurant dashboard exposes quick actions for table QR, menu and kitchen", () => {
  assert.match(dashboard, /dashboard-quick-actions/);
  assert.match(dashboard, /Manage table QR/);
  assert.match(dashboard, /Update your menu/);
  assert.match(dashboard, /Open kitchen display/);
  assert.match(dashboardStyles, /\.dashboard-quick-action/);
});

test("public home page has the refreshed responsive visual system without altering routes", () => {
  assert.match(homeStyles, /Khaavio homepage refresh/);
  assert.match(homeStyles, /@media \(max-width: 620px\)/);
});
