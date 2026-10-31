import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/20261031070000_restaurant_coupon_management.sql");
const originalMigration = read("supabase/migrations/20261029052442_restaurant_coupons.sql");
const dashboard = read("src/pages/OffersDashboard.jsx");
const styles = read("src/pages/OffersDashboard.css");

test("coupon edits are limited to restaurant owners and cannot alter usage counters or ownership", () => {
  const updateGrant = migration.match(/GRANT UPDATE \(([\s\S]*?)\) ON public\.restaurant_coupons TO authenticated/)?.[1] || "";
  assert.match(updateGrant, /code[\s\S]*?title[\s\S]*?discount_type[\s\S]*?discount_value[\s\S]*?minimum_order_amount[\s\S]*?maximum_discount_amount[\s\S]*?starts_at[\s\S]*?ends_at[\s\S]*?usage_limit/);
  assert.doesNotMatch(updateGrant, /used_count|restaurant_id|is_active|created_at|updated_at/);
  assert.match(originalMigration, /GRANT UPDATE \(is_active\) ON public\.restaurant_coupons TO authenticated/);
  assert.match(originalMigration, /restaurant_coupons_owner_update[\s\S]*?r\.owner_id = \(SELECT auth\.uid\(\)\)/);
});

test("coupon removal uses an owner-checked row-locked RPC and archives coupons with order history", () => {
  const safeRemoval = read("supabase/migrations/20261031100000_restaurant_coupon_safe_archive.sql");
  for (const snippet of [
    "ADD COLUMN is_archived boolean NOT NULL DEFAULT false",
    "CHECK (NOT is_archived OR NOT is_active)",
    "REVOKE DELETE ON public.restaurant_coupons FROM PUBLIC, anon, authenticated",
    "DROP POLICY IF EXISTS restaurant_coupons_owner_delete",
    "CREATE OR REPLACE FUNCTION public.khaavio_remove_restaurant_coupon(p_coupon_id uuid)",
    "r.owner_id = (SELECT auth.uid())",
    "FOR UPDATE OF c",
    "FROM public.orders AS o",
    "o.coupon_id = v_coupon_id",
    "SET is_active = false,",
    "is_archived = true",
    "RETURN 'archived'",
    "DELETE FROM public.restaurant_coupons AS c",
    "RETURN 'deleted'",
    "GRANT EXECUTE ON FUNCTION public.khaavio_remove_restaurant_coupon(uuid)"
  ]) assert.ok(safeRemoval.includes(snippet), `Safe coupon removal migration must contain: ${snippet}`);
  assert.match(originalMigration, /coupon_id uuid REFERENCES public\.restaurant_coupons\(id\) ON DELETE SET NULL/);
  assert.ok(safeRemoval.includes("CREATE OR REPLACE FUNCTION public.khaavio_restore_restaurant_coupon(p_coupon_id uuid)"));
  assert.ok(safeRemoval.includes("SET is_archived = false,"));
  assert.ok(safeRemoval.includes("is_active = false,"));
  assert.ok(safeRemoval.includes("GRANT EXECUTE ON FUNCTION public.khaavio_restore_restaurant_coupon(uuid)"));
});

test("offers dashboard supports editing every editable field and preserves local date-time values", () => {
  assert.match(dashboard, /function editCoupon\(coupon\)/);
  assert.match(dashboard, /setEditingCouponId\(coupon\.id\)/);
  assert.match(dashboard, /toLocalDateTimeInput\(coupon\.starts_at\)/);
  assert.match(dashboard, /toLocalDateTimeInput\(coupon\.ends_at\)/);
  for (const field of ["code", "title", "discount_type", "discount_value", "minimum_order_amount", "maximum_discount_amount", "starts_at", "ends_at", "usage_limit"]) {
    assert.match(dashboard, new RegExp(String.raw`\b${field}:\s*`));
  }
  assert.match(dashboard, /\.update\(couponPayload\)[\s\S]*?\.eq\("id", editingCouponId\)[\s\S]*?\.eq\("restaurant_id", restaurantId\)/);
  assert.match(dashboard, /Save changes/);
  assert.match(dashboard, /Cancel coupon editing/);
});

test("coupon dashboard routes removals and restores through safe RPCs", () => {
  for (const snippet of [
    "async function deleteCoupon(coupon)",
    "Archive coupon",
    "khaavio_remove_restaurant_coupon",
    'removalResult === "archived"',
    "is_active: false, is_archived: true",
    'removalResult === "deleted"',
    "is_archived, created_at",
    "Archived · History kept",
    "async function restoreCoupon(coupon)",
    "khaavio_restore_restaurant_coupon",
    "restored as paused"
  ]) assert.ok(dashboard.includes(snippet), `Offers dashboard must contain: ${snippet}`);
  assert.doesNotMatch(dashboard, /\.from\("restaurant_coupons"\)[\s\S]*?\.delete\(\)/);
  assert.match(dashboard, /offers-delete-button/);
  assert.match(dashboard, /offers-edit-button/);
});

test("coupon controls remain responsive and provide visible edit/delete actions", () => {
  assert.match(styles, /\.offers-coupon-actions/);
  assert.match(styles, /\.offers-edit-button/);
  assert.match(styles, /\.offers-delete-button/);
  assert.match(styles, /@media \(max-width: 560px\)/);
});


test("coupon controls stay in one compact row instead of increasing card height", () => {
  const actionBlock = styles.match(/\.offers-coupon-actions\s*\{([^}]+)\}/)?.[1] || "";
  assert.match(actionBlock, /flex-wrap:\s*nowrap/);
  assert.match(actionBlock, /flex:\s*0 0 auto/);
  assert.match(styles, /\.offers-coupon-top > \.offers-coupon-actions\s*\{[^}]*display:\s*flex/);
  assert.match(styles, /\.offers-coupon-top > \.offers-coupon-actions\s*\{[^}]*flex-direction:\s*row/);
  assert.match(styles, /\.offers-edit-button span,\s*\.offers-delete-button span\s*\{\s*display:\s*none;/);
  assert.match(styles, /\.offers-coupon-card\s*\{[^}]*padding:\s*9px/);
});
