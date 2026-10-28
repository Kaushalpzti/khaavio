import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(path.join(root, file), "utf8");
const migration = read("supabase/migrations/20261028100000_offers_campaigns_engine.sql");
const menu = read("src/pages/PublicMenu.jsx");
const marketing = read("src/pages/MarketingStudio.jsx");
const app = read("src/App.jsx");
const layout = read("src/components/RestaurantDashboardLayout.jsx");
const receipts = read("src/pages/OrderReceipts.jsx");
const tableSessions = read("src/pages/TableSessions.jsx");

test("offer data is restaurant-scoped and owner-protected", () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.offers/i);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.marketing_campaigns/i);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.offer_redemptions/i);
  assert.match(migration, /offers_owner_manage/i);
  assert.match(migration, /marketing_campaigns_owner_manage/i);
  assert.match(migration, /offer_redemptions_owner_read/i);
});

test("discounts are validated by the server and reconciled with table-session invoice totals", () => {
  assert.match(migration, /khaavio_preview_public_offer/i);
  assert.match(migration, /place_public_order_with_offer/i);
  assert.match(migration, /place_public_order_for_guest_with_offer/i);
  assert.match(migration, /app\.khaavio_apply_offer_discount/i);
  assert.match(migration, /The order total must match its saved order items/i);
  assert.match(migration, /khaavio_snapshot_offer_totals_on_invoice/i);
  assert.match(migration, /NEW\.guest_tab_id IS NULL OR o\.guest_tab_id = NEW\.guest_tab_id/i);
  assert.match(migration, /i2\.guest_tab_id IS NULL OR o\.guest_tab_id = i2\.guest_tab_id/i);
  assert.match(migration, /max_redemptions/i);
  assert.match(migration, /per_customer_limit/i);
});

test("public QR checkout previews and applies coupons without trusting client totals", () => {
  assert.match(menu, /khaavio_preview_public_offer/i);
  assert.match(menu, /place_public_order_with_offer/i);
  assert.match(menu, /place_public_order_for_guest_with_offer/i);
  assert.match(menu, /couponAppliedFingerprint/);
  assert.match(menu, /p_coupon_code/);
});

test("Marketing Studio supports offers and manual campaign sharing, not WhatsApp delivery", () => {
  assert.match(marketing, /from\("offers"\)/);
  assert.match(marketing, /from\("marketing_campaigns"\)/);
  assert.match(marketing, /from\("offer_redemptions"\)/);
  assert.match(marketing, /Copy promo text/);
  assert.match(marketing, /Automatic WhatsApp sending is not enabled/);
  assert.doesNotMatch(marketing, /openwa|whatsapp-cloud-api/i);
});

test("Marketing Studio is routed and discoverable in restaurant navigation", () => {
  assert.match(app, /path="\/dashboard\/marketing"/);
  assert.match(layout, /Offers & campaigns/);
});

test("order receipts request and display discount snapshots", () => {
  assert.match(receipts, /subtotal_amount/);
  assert.match(receipts, /discount_amount/);
  assert.match(receipts, /coupon_code/);
  assert.match(receipts, /Number\(selectedOrder\.discount_amount\) > 0 \? Number\(item\.unit_price\) \* Number\(item\.quantity\)/);
  assert.match(tableSessions, /ts-order-discount-summary/);
  assert.match(tableSessions, /subtotal_amount, discount_amount, coupon_code/);
});
