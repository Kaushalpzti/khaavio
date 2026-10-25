import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { normalizeKhaavioIndianMobile } from "../src/lib/loyaltyPhone.js";

const root = process.cwd();
const read = (path) => readFile(join(root, path), "utf8");

test("phone loyalty migration stores normalized Indian mobile numbers per restaurant", async () => {
  const sql = await read("supabase/migrations/20261025223000_khaavio_loyalty_phone_identity.sql");
  assert.match(sql, /phone_number text/);
  assert.match(sql, /restaurant_loyalty_members_restaurant_phone_uidx/);
  assert.match(sql, /\^\\\+91\[6-9\]\[0-9\]\{9\}\$/);
});

test("public phone lookup requires consent and never returns reward redemption codes", async () => {
  const sql = await read("supabase/migrations/20261025223000_khaavio_loyalty_phone_identity.sql");
  assert.match(sql, /p_loyalty_consent IS NOT TRUE/);
  assert.match(sql, /Never expose redemption codes/);
  assert.doesNotMatch(sql.match(/CREATE OR REPLACE FUNCTION public\.ensure_public_loyalty_member_by_phone[\s\S]*?\$function\$;/)?.[0] || "", /'redemption_code'/);
});

test("Public Menu passes the current loyalty phone to the validated order wrapper", async () => {
  const menu = await read("src/pages/PublicMenu.jsx");
  assert.match(menu, /p_loyalty_phone: loyaltyPhone \|\| null/);
  assert.match(menu, /onPhoneChange=\{handleLoyaltyPhoneChange\}/);
});

test("customer UI labels mobile as unverified and keeps reward codes private", async () => {
  const component = await read("src/components/PublicLoyaltyClub.jsx");
  assert.match(component, /not OTP-verified/);
  assert.match(component, /Staff will confirm the reward/);
  assert.doesNotMatch(component, /reward\.redemption_code/);
});

test("owner dashboard exposes phone and marketing consent for the owner's leads", async () => {
  const dashboard = await read("src/pages/LoyaltyDashboard.jsx");
  assert.match(dashboard, /phone_number, phone_consent_at, marketing_opt_in/);
  assert.match(dashboard, /Offers: opted in \(self-reported\)/);
  assert.match(dashboard, /unlock_order_id/);
});

test("Indian mobile normalization accepts common formats and rejects invalid numbers", () => {
  assert.equal(normalizeKhaavioIndianMobile("9876543210"), "+919876543210");
  assert.equal(normalizeKhaavioIndianMobile("+91 98765-43210"), "+919876543210");
  assert.equal(normalizeKhaavioIndianMobile("1234567890"), "");
  assert.equal(normalizeKhaavioIndianMobile("98765"), "");
});
