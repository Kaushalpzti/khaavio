import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { normalizeKhaavioIndianMobile } from "../src/lib/loyaltyPhone.js";

const root = process.cwd();
const read = (path) => readFile(join(root, path), "utf8");

test("Indian mobile normalization accepts common formats and rejects invalid numbers", () => {
  assert.equal(normalizeKhaavioIndianMobile("9876543210"), "+919876543210");
  assert.equal(normalizeKhaavioIndianMobile("+91 98765-43210"), "+919876543210");
  assert.equal(normalizeKhaavioIndianMobile("1234567890"), "");
  assert.equal(normalizeKhaavioIndianMobile("98765"), "");
});

test("public phone-only Perks lookup is revoked until OTP verification exists", async () => {
  const sql = await read("supabase/migrations/20261031163000_seo_feedback_loyalty_security.sql");
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.ensure_public_loyalty_member_by_phone\([\s\S]*?FROM PUBLIC, anon, authenticated/i);
  assert.match(sql, /Phone-only lookup is not identity verification/i);
});

test("new public Perks flow uses a random browser token rather than mobile number identity", async () => {
  const component = await read("src/components/PublicLoyaltyClub.jsx");
  const menu = await read("src/pages/PublicMenu.jsx");
  const migration = await read("supabase/migrations/20261031163000_seo_feedback_loyalty_security.sql");
  assert.match(component, /getOrCreateKhaavioLoyaltyToken/);
  assert.match(component, /ensure_public_loyalty_member/);
  assert.doesNotMatch(component, /phone_number|p_phone|marketing_opt_in|type="tel"/i);
  assert.doesNotMatch(menu, /const \[loyaltyPhone|handleLoyaltyPhoneChange|getStoredKhaavioLoyaltyPhone/);
  assert.match(menu, /p_loyalty_member_token: payload\.p_loyalty_member_token/);
  assert.match(migration, /p_loyalty_member_token uuid/);
  assert.match(migration, /The legacy phone argument remains in the signature.*is ignored/i);
});

test("feedback is written only through a rate-limited service-side function", async () => {
  const migration = await read("supabase/migrations/20261031163000_seo_feedback_loyalty_security.sql");
  const edge = await read("supabase/functions/khaavio-public-feedback/index.ts");
  const component = await read("src/components/PublicReviewsFeedback.jsx");
  assert.match(migration, /submit_public_restaurant_feedback_rate_limited/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.submit_public_restaurant_feedback_rate_limited[\s\S]*TO service_role/i);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.submit_restaurant_feedback[\s\S]*FROM PUBLIC, anon, authenticated/i);
  assert.match(edge, /cf-connecting-ip/);
  assert.match(edge, /hmacSha256Hex/);
  assert.match(edge, /website/);
  assert.match(edge, /RATE_LIMITED/);
  assert.match(component, /functions\.invoke\("khaavio-public-feedback"/);
  assert.match(component, /name="website"/);
});
