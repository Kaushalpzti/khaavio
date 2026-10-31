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
  assert.match(safeRemoval, /ADD COLUMN is_archived boolean NOT NULL DEFAULT false/);
  assert.match(safeRemoval, /CHECK \\(NOT is_archived OR NOT is_active\\)/);
  assert.match(safeRemoval, /REVOKE DELETE ON public\\.restaurant_coupons FROM PUBLIC, anon, authenticated/);
  assert.match(safeRemoval, /DROP POLICY IF EXISTS restaurant_coupons_owner_delete/);
  assert.match(safeRemoval, /CREATE OR REPLACE FUNCTION public\\.khaavio_remove_restaurant_coupon\\(p_coupon_id uuid\\)/);
  assert.match(safeRemoval, /SECURITY DEFINER[\\s\\S]*?SET search_path TO ''/);
  assert.match(safeRemoval, /r\\.owner_id = \\(SELECT auth\\.uid\\(\\)\\)/);
  assert.match(safeRemoval, /FOR UPDATE OF c/);
  assert.match(safeRemoval, /EXISTS \\([\\s\\S]*?FROM public\\.orders AS o[\\s\\S]*?o\\.coupon_id = v_coupon_id/);
  assert.match(safeRemoval, /SET is_active = false,[\\s\\S]*?is_archived = true/);
  assert.match(safeRemoval, /RETURN 'archived'/);
  assert.match(safeRemoval, /DELETE FROM public\\.restaurant_coupons AS c/);
  assert.match(safeRemoval, /RETURN 'deleted'/);
  assert.match(safeRemoval, /GRANT EXECUTE ON FUNCTION public\\.khaavio_remove_restaurant_coupon\\(uuid\\) TO authenticated/);
  assert.match(originalMigration, /coupon_id uuid REFERENCES public\\.restaurant_coupons\\(id\\) ON DELETE SET NULL/);
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

test("coupon dashboard routes removals through the safe archive-or-delete RPC", () => {
  assert.match(dashboard, /async function deleteCoupon\\(coupon\\)/);
  assert.match(dashboard, /window\\.confirm\\([\\s\\S]*?Archive coupon/);
  assert.match(dashboard, /supabase\\.rpc\\([\\s\\S]*?khaavio_remove_restaurant_coupon/);
  assert.match(dashboard, /removalResult === "archived"/);
  assert.match(dashboard, /is_active: false, is_archived: true/);
  assert.match(dashboard, /removalResult === "deleted"/);
  assert.doesNotMatch(dashboard, /\\.from\\("restaurant_coupons"\\)[\\s\\S]*?\\.delete\\(\\)/);
  assert.match(dashboard, /is_archived, created_at/);
  assert.match(dashboard, /coupon\\.is_archived \\? "Archived · History kept"/);
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
