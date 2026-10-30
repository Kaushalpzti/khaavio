import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const settings = read("src/pages/RestaurantSettings.jsx");
const sessions = read("src/pages/TableSessions.jsx");
const menu = read("src/pages/PublicMenu.jsx");
const payment = read("src/components/PublicInvoicePayment.jsx");
const paymentCss = read("src/components/PublicInvoicePayment.css");
const sessionCss = read("src/pages/TableSessions.css");
const migration = read("supabase/migrations/20261030203552_restaurant_invoice_upi_payments.sql");

test("restaurant owners can enable UPI QR and counter payment without connecting a gateway", () => {
  assert.match(settings, /upi_payment_enabled/);
  assert.match(settings, /counter_payment_enabled/);
  assert.match(settings, /Restaurant UPI ID/);
  assert.match(settings, /UPI QR payment/);
  assert.match(settings, /Pay at counter/);
  assert.match(settings, /isValidUpiId/);
  assert.doesNotMatch(settings, /restaurant food-order gateway/i);
});

test("customer combined and guest bills both use the shared invoice payment component", () => {
  assert.match(menu, /khaavio_public_table_invoice_snapshot/);
  assert.match(menu, /khaavio_public_guest_tab_snapshot/);
  assert.match(menu, /<PublicInvoicePayment/);
  assert.match(menu, /tableBillOpen/);
  assert.match(menu, /guestTabSnapshot\.payment_settings/);
  assert.match(menu, /tableBillSnapshot\.payment_settings/);
});

test("customers submit UPI references but cannot mark an invoice paid", () => {
  assert.match(payment, /khaavio_select_public_invoice_payment_method/);
  assert.match(payment, /Pay via UPI/);
  assert.match(payment, /Pay at counter/);
  assert.match(payment, /khaavio_submit_public_invoice_upi_payment/);
  assert.match(payment, /Submit for verification/);
  assert.match(payment, /does not mark the bill as paid/i);
  assert.match(payment, /Pay at counter/);
  assert.doesNotMatch(payment, /mark_table_invoice_paid|mark_guest_tab_invoice_paid|khaavio_verify_invoice_upi_payment/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.khaavio_verify_invoice_upi_payment/);
});

test("restaurant staff review submitted references and verify through existing paid invoice RPCs", () => {
  assert.match(sessions, /khaavio_verify_invoice_upi_payment/);
  assert.match(sessions, /khaavio_reject_invoice_upi_payment/);
  assert.match(sessions, /checking the credit in the restaurant's UPI or bank app/i);
  assert.match(migration, /public\.mark_table_invoice_paid\(v_invoice_id, 'UPI'\)/);
  assert.match(migration, /public\.mark_guest_tab_invoice_paid\(v_invoice_id, 'UPI'\)/);
});

test("receipt printing is optional and supports 58mm, 80mm and browser Save as PDF", () => {
  assert.match(sessions, /Print \/ Save PDF/);
  assert.match(sessions, /option value="58">58mm/);
  assert.match(sessions, /option value="80">80mm/);
  assert.match(sessionCss, /khaavio-printing-session-invoice-58/);
  assert.match(sessionCss, /khaavio-printing-session-invoice-80/);
  assert.match(paymentCss, /public-invoice-upi-qr/);
});

test("restaurant UPI references are unique per restaurant and submissions are rate limited", () => {
  assert.match(migration, /ON public\.table_session_invoice_payment_submissions \(restaurant_id, pg_catalog\.lower\(payment_reference\)\)/);
  assert.match(migration, /v_recent_count >= 5/);
  assert.match(migration, /one_pending_idx/);
});
