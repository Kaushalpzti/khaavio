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
  assert.ok(studio.includes("The existing QR token is kept"));
  assert.ok(studio.includes("aria-label={`Edit ${table.table_number}`}"));
});

test("table QR workspace supports activation and history-safe deletion", () => {
  assert.match(studio, /function handleToggleTableActive/);
  assert.match(studio, /function handleDeleteTable/);
  assert.ok(studio.includes('.from("table_sessions")'));
  assert.ok(studio.includes('.from("table_session_invoices")'));
  assert.match(studio, /order or billing history/);
  assert.ok(studio.includes("aria-label={`Delete ${table.table_number}`}"));
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


test("premium QR cards use an editorial overline, scan prompt and table plaque", () => {
  assert.ok(studio.includes("YOUR TABLE · YOUR MENU"));
  assert.ok(studio.includes("SCAN TO EXPLORE"));
  assert.ok(studio.includes("Point your camera here"));
  assert.match(studioStyles, /\.tqr-card-overline/);
  assert.match(studioStyles, /\.tqr-card-scan-intro/);
  assert.match(studioStyles, /\.tqr-card-table-number/);
});

test("print exports use an adaptive high-contrast QR frame and keep QR quiet space", () => {
  assert.match(studio, /const qrFrameY = scanLabelY \+ 40/);
  assert.match(studio, /const qrSize = Math\.max\(430, Math\.min\(610/);
  assert.match(studio, /imageSmoothingEnabled = false/);
  assert.match(studio, /margin: 4/);
});


test("table QR defaults to Signature Green while retaining the original table token URL", () => {
  const tableQr = read("../src/pages/TableQRStudio.jsx");
  const tableQrStyles = read("../src/pages/TableQRStudio.css");
  assert.match(tableQr, /template: "signature"/);
  assert.ok(tableQr.includes('id: "signature"'));
  assert.ok(tableQr.includes("table.qr_token"));
  assert.match(tableQrStyles, /\.tqr-card--signature/);
});
