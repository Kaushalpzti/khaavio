import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

const sidebar = read("../src/components/RestaurantDashboardLayout.jsx");
const dashboard = read("../src/pages/Dashboard.jsx");
const supportPanel = read("../src/components/SupportHelpPanel.jsx");
const orders = read("../src/pages/OrdersDashboard.jsx");
const kitchen = read("../src/pages/KitchenDisplay.jsx");

test("sidebar Help & support opens a standalone protected Help Center page", () => {
  const app = read("../src/App.jsx");
  const help = read("../src/pages/HelpCenter.jsx");
  assert.match(sidebar, /to="\/dashboard\/help"/);
  assert.match(app, /path="\/dashboard\/help"/);
  assert.match(app, /import\("\.\/pages\/HelpCenter"\)/);
  assert.doesNotMatch(dashboard, /SupportHelpPanel/);
  assert.match(help, /<SupportHelpPanel/);
  assert.match(supportPanel, /<section id=\{id\}/);
});

test("dashboard modules no longer duplicate Khaavio page-top wordmarks", () => {
  const modulePages = [
    "RestaurantSettings.jsx", "Subscription.jsx", "MenuManager.jsx", "QRStudio.jsx",
    "OrdersDashboard.jsx", "OrderReceipts.jsx", "BookingsDashboard.jsx", "Analytics.jsx",
    "KitchenDisplay.jsx", "TableSessions.jsx",
  ];
  for (const file of modulePages) {
    const source = read(`../src/pages/${file}`);
    assert.doesNotMatch(source, /className="(?:restaurant-settings-brand|subscription-brand|menu-brand|qr-brand|orders-brand|order-receipts-brand|bookings-brand|analytics-brand|kitchen-brand|ts-brand)"/,
      `${file} should not render a duplicated Khaavio brand in its page header`);
  }
  assert.match(sidebar, /restaurant-dashboard-workspacebar/);
  assert.match(sidebar, /restaurant-dashboard-powered-by/);
  assert.match(sidebar, /restaurant-dashboard-mobilebrand/);
});

test("Orders page provides opt-in voice announcements for new realtime orders", () => {
  assert.match(orders, /function toggleVoiceAnnouncements\(\)/);
  assert.match(orders, /announceIncomingOrder\(insertedOrder\)/);
  assert.match(orders, /from\("order_items"\)/);
  assert.match(orders, /from\("restaurant_tables"\)/);
  assert.match(orders, /event: "INSERT"/);
  assert.match(orders, /aria-pressed=\{voiceEnabled\}/);
  assert.match(orders, /className=\{`orders-voice-button/);
  assert.match(kitchen, /function toggleVoiceAnnouncements\(\)/);
});
