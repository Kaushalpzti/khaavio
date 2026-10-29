import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const studio = read("../src/pages/TableQRStudio.jsx");
const studioStyles = read("../src/pages/TableQRStudio.css");
const menuQr = read("../src/pages/QRStudio.jsx");
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

test("restaurant dashboard quick actions link directly to Orders and KDS", () => {
  assert.match(dashboard, /dashboard-quick-actions/);
  assert.match(dashboard, /to="\/dashboard\/orders" className="dashboard-quick-action"[\s\S]*?<strong>Orders<\/strong>/);
  assert.match(dashboard, /to="\/dashboard\/kitchen" className="dashboard-quick-action"[\s\S]*?<strong>KDS<\/strong>/);
  assert.doesNotMatch(dashboard, /<strong>Manage table QR<\/strong>|<strong>Update your menu<\/strong>/);
  assert.match(dashboardStyles, /\.dashboard-quick-action/);
});

test("public home page has the refreshed responsive visual system without altering routes", () => {
  assert.match(homeStyles, /Khaavio homepage refresh/);
  assert.match(homeStyles, /@media \(max-width: 620px\)/);
});


test("table QR card uses a minimal premium layout with aligned branding and table details", () => {
  assert.match(studio, /fillText\("YOUR TABLE\s+·\s+YOUR MENU"/);
  assert.ok(studio.includes("GOOD FOOD  ·  GOOD MOOD"));
  assert.ok(studio.includes("SCAN TO ORDER"));
  assert.ok(studio.includes("VIEW MENU  ·  PLACE ORDER  ·  ENJOY"));
  assert.ok(studio.includes("drawWorkflowIcon"));
  assert.ok(studio.includes("Powered by Khaavio"));
  assert.match(studioStyles, /\.tqr-card-overline/);
  assert.match(studioStyles, /\.tqr-card-scan-intro/);
  assert.match(studioStyles, /\.tqr-card-table-number/);
});

test("print exports keep a high-contrast QR frame and predictable layout spacing", () => {
  assert.match(studio, /const qrFrameY = overlineY \+ 32/);
  assert.match(studio, /const qrSize = Math\.max\(300, Math\.min\(460/);
  assert.match(studio, /imageSmoothingEnabled = false/);
  assert.match(studio, /margin: 4/);
});

test("single and bulk table QR exports are high resolution and printer-friendly", () => {
  assert.match(studio, /const A4_WIDTH = 2480/);
  assert.match(studio, /const A4_HEIGHT = 3508/);
  assert.match(studio, /const width = 1165;\s+const height = 1748;/);
  assert.ok(studio.includes("PDF · A4 sheet · A6 card"));
  assert.ok(studio.includes("A6 card centered on A4 paper"));
  assert.match(studio, /canvas\.width = CARD_WIDTH \* scale/);
  assert.match(studio, /ctx\.scale\(scale, scale\)/);
  assert.match(studio, /function getCardCanvas\(table, scale = 2\)/);
  assert.match(studio, /canvasToJpegBytes\(canvas, 0\.97\)/);
  assert.match(studio, /URL\.revokeObjectURL\(url\), 60000/);
  assert.match(studio, /@page\{size:A4 portrait;margin:0\}/);
  assert.match(studio, /image\.onload = openPrintDialog/);
});


test("table QR defaults to Signature Green while retaining the original table token URL", () => {
  const tableQr = read("../src/pages/TableQRStudio.jsx");
  const tableQrStyles = read("../src/pages/TableQRStudio.css");
  assert.match(tableQr, /template: "signature"/);
  assert.ok(tableQr.includes('id: "signature"'));
  assert.ok(tableQr.includes("table.qr_token"));
  assert.match(tableQrStyles, /\.tqr-card--signature/);
});

test("Table QR Studio matches the workspace palette and keeps page content clear of the sidebar", () => {
  const bannersStyles = read("../src/pages/MenuBannersDashboard.css");
  assert.match(bannersStyles, /restaurant-dashboard-content > \.menu-banners-page\{width:100%;margin:0;padding:clamp\(18px,2\.1vw,28px\) clamp\(24px,2\.5vw,36px\)/);
  assert.match(bannersStyles, /@media\(max-width:600px\)\{#root \.restaurant-dashboard-layout \.restaurant-dashboard-content > \.menu-banners-page\{padding:14px 14px 24px\}/);
  assert.match(studioStyles, /--tqr-accent: #08714f/);
  assert.match(studioStyles, /\.tqr-button--primary \{[\s\S]*?background: linear-gradient\(135deg, #08714f, #075b43\)/);
  assert.match(studioStyles, /\.tqr-template-option\.is-selected \{[\s\S]*?border-color: #08714f/);
});


test("main Menu QR is a branded poster preview and exports the branded print layout", () => {
  const menuQrStyles = read("../src/pages/QRStudio.css");
  assert.ok(menuQr.includes("buildMenuPoster"));
  assert.ok(menuQr.includes("branded-menu-qr.png"));
  assert.ok(menuQr.includes("GOOD FOOD  ·  ONE SCAN AWAY"));
  assert.ok(menuQr.includes("OPEN MENU & ORDER"));
  assert.match(menuQrStyles, /\.qr-poster-preview/);
  assert.match(menuQrStyles, /\.qr-poster-brand/);
  assert.ok(menuQr.includes("restaurant.slug"));
});

test("menu QR poster downloads and prints at high resolution only after publishing", () => {
  assert.match(menuQr, /canvas\.width = 1080 \* posterScale/);
  assert.match(menuQr, /canvas\.height = 1440 \* posterScale/);
  assert.match(menuQr, /ctx\.scale\(posterScale, posterScale\)/);
  assert.match(menuQr, /width: 1200/);
  assert.match(menuQr, /async function printMenuQR/);
  assert.match(menuQr, /Print menu QR/);
  assert.match(menuQr, /disabled=\{!qrImage \|\| qrLoading \|\| !restaurant\?\.is_published\}/);
  assert.match(menuQr, /URL\.revokeObjectURL\(objectUrl\), 60000/);
});
