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

test("coupon delete is protected by the restaurant-owner RLS policy", () => {
  assert.match(migration, /GRANT DELETE ON public\.restaurant_coupons TO authenticated/);
  assert.match(migration, /CREATE POLICY restaurant_coupons_owner_delete[\s\S]*?FOR DELETE TO authenticated[\s\S]*?r\.owner_id = \(SELECT auth\.uid\(\)\)/);
  assert.match(originalMigration, /coupon_id uuid REFERENCES public\.restaurant_coupons\(id\) ON DELETE SET NULL/);
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

test("coupon dashboard supports owner-scoped deletion with an explicit confirmation", () => {
  assert.match(dashboard, /async function deleteCoupon\(coupon\)/);
  assert.match(dashboard, /window\.confirm\([\s\S]*?Delete coupon/);
  assert.match(dashboard, /\.delete\(\)[\s\S]*?\.eq\("id", coupon\.id\)[\s\S]*?\.eq\("restaurant_id", restaurantId\)/);
  assert.match(dashboard, /Existing orders keep their saved coupon code and totals/);
  assert.match(dashboard, /offers-delete-button/);
  assert.match(dashboard, /offers-edit-button/);
});

test("coupon controls remain responsive and provide visible edit/delete actions", () => {
  assert.match(styles, /\.offers-coupon-actions/);
  assert.match(styles, /\.offers-edit-button/);
  assert.match(styles, /\.offers-delete-button/);
  assert.match(styles, /@media \(max-width: 560px\)/);
});
