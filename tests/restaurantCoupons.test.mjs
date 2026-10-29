import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/20261029052442_restaurant_coupons.sql");
const publicOffersMigration = read("supabase/migrations/20261029053115_public_restaurant_coupons.sql");
const menuBannerMigration = read("supabase/migrations/20261029054206_restaurant_menu_banners.sql");
const menuBannerImageOnlyMigration = read("supabase/migrations/20261029055945_menu_banner_image_only_mode.sql");
const menu = read("src/pages/PublicMenu.jsx");
const offers = read("src/pages/OffersDashboard.jsx");
const app = read("src/App.jsx");
const layout = read("src/components/RestaurantDashboardLayout.jsx");
const menuBanners = read("src/pages/MenuBannersDashboard.jsx");

test("coupons are restaurant-owned and inaccessible to anonymous table queries", () => {
  assert.match(migration, /CREATE TABLE public\.restaurant_coupons/);
  assert.match(migration, /ALTER TABLE public\.restaurant_coupons ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /GRANT SELECT ON public\.restaurant_coupons TO authenticated/);
  assert.match(migration, /GRANT INSERT \(restaurant_id, code, title[\s\S]*?ON public\.restaurant_coupons TO authenticated/);
  assert.match(migration, /GRANT UPDATE \(is_active\) ON public\.restaurant_coupons TO authenticated/);
  assert.match(migration, /REVOKE ALL ON public\.restaurant_coupons FROM anon/);
  assert.match(migration, /r\.owner_id = \(SELECT auth\.uid\(\)\)/);
  assert.match(migration, /restaurant_coupons_owner_update[\s\S]*?WITH CHECK/);
});

test("coupon use is revalidated and consumed atomically with the saved QR order", () => {
  assert.match(migration, /FOR UPDATE/);
  assert.match(migration, /v_coupon\.used_count >= v_coupon\.usage_limit/);
  assert.match(migration, /used_count = c\.used_count \+ 1/);
  assert.match(migration, /SET coupon_id = v_quote\.coupon_id[\s\S]*?total_amount = v_subtotal - v_quote\.discount_amount/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.khaavio_apply_order_coupon\(uuid, text\) FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /place_public_order_with_coupon_and_loyalty/);
  assert.match(migration, /place_public_order_for_guest_with_coupon/);
  assert.match(migration, /BEGIN;[\s\S]*COMMIT;/);
  assert.doesNotMatch(migration, /\bDROP TABLE\b|\bTRUNCATE\b|\bDELETE FROM\b/i);
});

test("public QR checkout previews coupons and submits them through the server order RPC", () => {
  assert.match(menu, /supabase\.rpc\("khaavio_validate_coupon"/);
  assert.match(menu, /p_coupon_code: activeCoupon\?\.code \|\| null/);
  assert.match(menu, /place_public_order_with_coupon_and_loyalty/);
  assert.match(menu, /place_public_order_for_guest_with_coupon/);
  assert.match(menu, /couponCode: payload\.p_coupon_code/);
  assert.match(menu, /cartFinalTotal/);
  assert.match(menu, /couponRpcNotInstalled[\s\S]*?legacyRpc/);
});

test("published public menus show only current, available coupon offers", () => {
  assert.match(publicOffersMigration, /khaavio_public_restaurant_coupons/);
  assert.match(publicOffersMigration, /r\.is_published IS TRUE/);
  assert.match(publicOffersMigration, /c\.is_active IS TRUE/);
  assert.match(publicOffersMigration, /c\.starts_at <= pg_catalog\.now\(\)/);
  assert.match(publicOffersMigration, /c\.used_count < c\.usage_limit/);
  assert.match(publicOffersMigration, /GRANT EXECUTE ON FUNCTION public\.khaavio_public_restaurant_coupons\(text\) TO anon, authenticated/);
  assert.match(menu, /khaavio_public_restaurant_coupons/);
  assert.match(menu, /public-menu-offers/);
  assert.match(menu, /choosePublicOffer/);
});

test("restaurant owners can upload ordered menu banners and only active banners are public", () => {
  assert.match(menuBannerMigration, /CREATE TABLE public\.restaurant_menu_banners/);
  assert.match(menuBannerMigration, /restaurant_menu_banners_owner_insert[\s\S]*?auth\.uid\(\)/);
  assert.match(menuBannerMigration, /\/banners\//);
  assert.match(menuBannerMigration, /r\.is_published IS TRUE[\s\S]*?b\.is_active IS TRUE/);
  assert.match(menuBannerMigration, /GRANT EXECUTE ON FUNCTION public\.khaavio_public_restaurant_menu_banners\(text\) TO anon, authenticated/);
  assert.match(menuBanners, /const BUCKET = "menu-images"/);
  assert.match(menuBanners, /\.from\("restaurant_menu_banners"\)/);
  assert.match(menuBanners, /Show on public menu/);
  assert.match(app, /path="\/dashboard\/menu-banners"[\s\S]*?<MenuBannersDashboard \/>/);
  assert.match(layout, /label: "Menu banners", to: "\/dashboard\/menu-banners"/);
  assert.match(menu, /khaavio_public_restaurant_menu_banners/);
  assert.match(menu, /uploadedPromoSlides\.length \? uploadedPromoSlides : fallbackPromoSlides/);
});

test("restaurant owners can show uploaded banner artwork without app-rendered text", () => {
  assert.match(menuBannerImageOnlyMigration, /ADD COLUMN display_mode text NOT NULL DEFAULT 'text_overlay'/);
  assert.match(menuBannerImageOnlyMigration, /display_mode IN \('text_overlay', 'image_only'\)/);
  assert.match(menuBannerImageOnlyMigration, /RETURNS TABLE\(id uuid, image_path text, display_mode text/);
  assert.match(menuBanners, /value="image_only"/);
  assert.match(menuBanners, /display_mode: form\.display_mode/);
  assert.match(menuBanners, /display_mode === "image_only" \? "" : title/);
  assert.match(menu, /displayMode: banner\.display_mode \|\| "text_overlay"/);
  assert.match(menu, /data-display-mode=\{currentPromoSlide\.displayMode \|\| "text_overlay"\}/);
  assert.match(menu, /currentPromoSlide\.displayMode !== "image_only"/);
  assert.match(read("src/pages/PublicMenuExperience.css"), /\.public-menu-promo-slider\[data-display-mode="image_only"\]\s+\.public-menu-promo-image \{ inset:0; width:100%; \}/);
});

test("restaurant owners get a protected coupon dashboard and scoped coupon management", () => {
  assert.match(app, /path="\/dashboard\/offers"[\s\S]*?<ProtectedRestaurantPage>[\s\S]*?<OffersDashboard \/>/);
  assert.match(layout, /label: "Offers & Coupons", to: "\/dashboard\/offers"/);
  assert.match(offers, /\.eq\("owner_id", authData\.user\.id\)/);
  assert.match(offers, /\.eq\("restaurant_id", chosenId\)/);
  assert.match(offers, /discount_type: form\.discount_type/);
  assert.match(offers, /maximum_discount_amount/);
  assert.match(offers, /usage_limit: usageLimit/);
  assert.match(offers, /used_count/);
});
