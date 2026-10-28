import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const menu = read("../src/pages/PublicMenu.jsx");
const migration = read("../supabase/migrations/20261028123000_require_phone_for_public_orders.sql");
const legal = read("../src/pages/LegalPage.jsx");

test("public QR checkout requires a mobile number and sends its normalized form", () => {
  assert.match(menu, /<span>Mobile number \*<\/span>/);
  assert.match(menu, /autoComplete="tel"/);
  assert.match(menu, /placeholder="10-digit mobile number"[\\s\\S]{0,80}required/);
  assert.match(menu, /const phone = normalizeIndianMobilePhone\(customerPhone\)/);
  assert.match(menu, /p_customer_phone: phone/);
  assert.doesNotMatch(menu, /Phone number \(optional\)/);
});

test("database order function rejects missing or invalid mobile numbers", () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.place_public_order\(/);
  assert.match(migration, /public\.khaavio_normalize_indian_mobile\(p_customer_phone\)/);
  assert.match(migration, /if v_customer_phone is null then[\s\S]{0,200}valid 10-digit Indian mobile number/i);
});

test("privacy policy separates order processing from marketing consent", () => {
  assert.match(legal, /a mobile number for public menu orders/);
  assert.match(legal, /repeat-visit and order trends/);
  assert.match(legal, /submitting an order is not marketing consent/);
});
