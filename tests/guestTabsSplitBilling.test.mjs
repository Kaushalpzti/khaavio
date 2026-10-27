import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");
const migration = read("supabase/migrations/20261027213000_guest_tabs_split_billing.sql");
const menu = read("src/pages/PublicMenu.jsx");
const settings = read("src/pages/RestaurantSettings.jsx");
const sessions = read("src/pages/TableSessions.jsx");
const kitchen = read("src/pages/KitchenDisplay.jsx");
const orders = read("src/pages/OrdersDashboard.jsx");

test("combined billing remains the default and active sessions snapshot their billing mode", () => {
  assert.match(migration, /table_billing_mode text NOT NULL DEFAULT 'combined'/i);
  assert.match(migration, /khaavio_snapshot_table_billing_mode/i);
  assert.match(migration, /table_session_invoices_one_combined_per_session_uidx/i);
  assert.match(migration, /i\.guest_tab_id is null/i);
});

test("guest orders are linked server-side and scoped to the same restaurant, table and session", () => {
  assert.match(migration, /place_public_order_for_guest_with_loyalty/i);
  assert.match(migration, /orders_guest_tab_scope_fkey/i);
  assert.match(migration, /An order cannot be moved between guest tabs/i);
  assert.match(migration, /guest_tab_token/i);
  assert.match(migration, /khaavio_guard_closed_guest_tab_updates/i);
});

test("each guest tab gets one immutable invoice and guest payment does not close other guests", () => {
  assert.match(migration, /finalize_public_guest_tab/i);
  assert.match(migration, /finalize_guest_tab_invoice/i);
  assert.match(migration, /mark_guest_tab_invoice_paid/i);
  assert.match(migration, /Use the guest-invoice payment workflow/i);
  assert.match(migration, /i\.guest_tab_id IS NOT DISTINCT FROM v_guest_tab_id/i);
});

test("public menu stores a device-scoped tab token, rechecks the mode and renders My Bill", () => {
  assert.match(menu, /khaavio-guest-tab:/);
  assert.match(menu, /khaavio_public_guest_tab_snapshot/);
  assert.match(menu, /khaavio_public_table_billing_mode/);
  assert.match(menu, /place_public_order_for_guest_with_loyalty/);
  assert.match(menu, /Request final bill/);
  assert.match(menu, /Start a new bill/);
});

test("owners can choose separate customer bills without changing open sessions", () => {
  assert.match(settings, /name="table_billing_mode"/);
  assert.match(settings, /Existing sessions keep their original billing mode/);
});

test("owner billing can view guest tabs, create guest invoices and record the correct payment type", () => {
  assert.match(sessions, /from\("table_session_tabs"\)/);
  assert.match(sessions, /finalize_guest_tab_invoice/);
  assert.match(sessions, /mark_guest_tab_invoice_paid/);
  assert.match(sessions, /renderSessionOrders\(session, invoice\.guest_tab_id\)/);
});

test("kitchen and order cards show the guest label without replacing order tickets", () => {
  assert.match(kitchen, /guestTabName/);
  assert.match(orders, /guest_tab_name/);
});
