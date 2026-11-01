import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("GST settings require registration type and one total rate, not separately entered CGST and SGST", () => {
  const settings = read("../src/pages/RestaurantSettings.jsx");
  assert.match(settings, /GST_REGISTRATION_TYPES\.REGULAR/);
  assert.match(settings, /GST_REGISTRATION_TYPES\.COMPOSITION/);
  assert.match(settings, /GST_REGISTRATION_TYPES\.UNREGISTERED/);
  assert.match(settings, /gst_legal_name/);
  assert.match(settings, /Total GST rate \(%\)/);
  assert.match(settings, /Do not enter CGST and SGST separately/);
  assert.match(settings, /Automatic tax split preview/);
});

test("table and split-guest orders remain tax-free until their final invoice", () => {
  const checkout = read("../src/pages/PublicMenu.jsx");
  const migration = read("../supabase/migrations/20261101150000_complete_gst_billing.sql");
  assert.match(checkout, /GST, if enabled, is calculated once on your final table or guest invoice/);
  assert.match(checkout, /khaavio_public_invoice_tax_snapshot/);
  assert.match(migration, /NEW\.session_id IS NOT NULL OR NEW\.guest_tab_id IS NOT NULL OR NEW\.table_id IS NOT NULL/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.khaavio_snapshot_invoice_gst\(\)/);
  assert.match(migration, /NEW\.total_amount := \(v_breakdown ->> 'grand_total'\)::numeric/);
});

test("standalone pickup checkout uses the GST-aware server RPC and tax tracking snapshot", () => {
  const checkout = read("../src/pages/PublicMenu.jsx");
  const tracking = read("../src/pages/OrderTracking.jsx");
  const migration = read("../supabase/migrations/20261101150000_complete_gst_billing.sql");
  assert.match(checkout, /place_public_order_for_service_mode_with_gst/);
  assert.match(checkout, /khaavio_public_order_tax_snapshot/);
  assert.match(tracking, /khaavio_public_order_tax_snapshot/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.place_public_order_for_service_mode_with_gst/);
  assert.match(migration, /COALESCE\(o\.grand_total, o\.total_amount\)/);
});

test("final invoices and customer receipts expose component-level tax and document particulars", () => {
  const sessions = read("../src/pages/TableSessions.jsx");
  const payment = read("../src/components/PublicInvoicePayment.jsx");
  const tracking = read("../src/pages/OrderTracking.jsx");
  for (const source of [sessions, payment, tracking]) {
    assert.match(source, /CGST/);
    assert.match(source, /SGST/);
    assert.match(source, /IGST/);
    assert.match(source, /Tax Invoice/);
    assert.match(source, /Bill of Supply/);
  }
});

test("legacy GST opt-ins are disabled for owner review; existing invoices are not recalculated", () => {
  const migration = read("../supabase/migrations/20261101150000_complete_gst_billing.sql");
  assert.match(migration, /SET gst_registration_type = 'needs_review',\s+gst_enabled = false/);
  assert.match(migration, /BEFORE INSERT ON public\.table_session_invoices/);
  assert.match(migration, /IF NEW\.gst_document_type_snapshot IN \('tax_invoice', 'bill_of_supply'\)/);
  assert.match(migration, /restaurant_gst_document_counters/);
  assert.doesNotMatch(migration, /UPDATE public\.table_session_invoices\s+SET total_amount/);
});
