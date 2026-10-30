import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL("../supabase/migrations/20261030194000_restaurant_invoice_upi_payments.sql", import.meta.url),
  "utf8",
);

test("restaurant payment settings default to counter and keep UPI opt-in", () => {
  assert.match(migration, /upi_payment_enabled boolean NOT NULL DEFAULT false/);
  assert.match(migration, /counter_payment_enabled boolean NOT NULL DEFAULT true/);
  assert.match(migration, /restaurants_upi_enabled_requires_id_check/);
});

test("public UPI submissions are pending until an authenticated owner verifies them", () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.table_session_invoice_payment_submissions/);
  assert.match(migration, /status IN \('pending', 'verified', 'rejected'\)/);
  assert.match(migration, /CREATE POLICY table_session_invoice_payment_submissions_owner_read/);
  assert.match(migration, /REVOKE ALL ON TABLE public\.table_session_invoice_payment_submissions\s+FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /GRANT SELECT ON TABLE public\.table_session_invoice_payment_submissions\s+TO authenticated/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.khaavio_verify_invoice_upi_payment/);
  assert.match(migration, /public\.mark_guest_tab_invoice_paid\(v_invoice_id, 'UPI'\)/);
  assert.match(migration, /public\.mark_table_invoice_paid\(v_invoice_id, 'UPI'\)/);
  assert.doesNotMatch(migration, /GRANT EXECUTE ON FUNCTION public\.khaavio_verify_invoice_upi_payment\(uuid\)\s+TO anon/i);
});

test("public payment submission is scoped to the matching restaurant, table, invoice and guest token", () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.khaavio_submit_public_invoice_upi_payment/);
  assert.match(migration, /rt\.qr_token = p_table_token/);
  assert.match(migration, /i\.id = p_invoice_id/);
  assert.match(migration, /t\.guest_tab_token = p_guest_tab_token/);
  assert.match(migration, /v_recent_count >= 5/);
  assert.match(migration, /one_pending_idx/);
});

test("combined and guest invoices expose only public-safe payment configuration and status", () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.khaavio_public_table_invoice_snapshot/);
  assert.match(migration, /'upi_enabled'/);
  assert.match(migration, /'counter_payment_enabled'/);
  assert.match(migration, /'payment_submission'/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.khaavio_public_guest_tab_snapshot/);
});
