import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("GST is described in settings as a final-bill feature", () => {
  const settings = read("../src/pages/RestaurantSettings.jsx");
  assert.match(settings, /GST will be calculated when the final bill is created/);
});

test("public checkout, tracking and receipts do not add GST to individual orders", () => {
  const checkout = read("../src/pages/PublicMenu.jsx");
  const tracking = read("../src/pages/OrderTracking.jsx");
  const receipts = read("../src/pages/OrderReceipts.jsx");
  assert.doesNotMatch(checkout, /gstAmount|cartGstAmount|khaavio_public_order_tax_snapshot/);
  assert.doesNotMatch(tracking, /gst_amount|grand_total|khaavio_public_order_tax_snapshot/);
  assert.doesNotMatch(receipts, /gst_amount|grand_total|gstin_snapshot/);
});

test("database applies the configured GST only while creating the final invoice", () => {
  const migration = read("../supabase/migrations/20261029065457_gst_final_bill_only.sql");
  assert.match(migration, /DROP TRIGGER IF EXISTS khaavio_snapshot_order_gst ON public\.orders/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.khaavio_snapshot_invoice_gst\(\)/);
  assert.match(migration, /SELECT r\.gst_enabled, r\.gst_rate, r\.gst_price_inclusive, r\.gstin/);
  assert.match(migration, /NEW\.total_amount := v_grand/);
});
