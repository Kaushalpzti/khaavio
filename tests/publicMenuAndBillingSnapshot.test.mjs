import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const menu = read("../src/pages/PublicMenu.jsx");
const snapshotMigration = read("../supabase/migrations/20261027010000_public_menu_and_platform_billing_snapshot.sql");
const admin = read("../khaavio-superadmin-pwa/src/App.jsx");
const adminStyles = read("../khaavio-superadmin-pwa/src/styles.css");

test("public menu uses a least-privilege server snapshot instead of browser direct menu-table reads", () => {
  assert.match(menu, /khaavio_public_restaurant_menu/);
  assert.match(menu, /menuSnapshot\?\.restaurant/);
  assert.match(menu, /menuSnapshot\?\.categories/);
  assert.match(menu, /menuSnapshot\?\.items/);
  assert.doesNotMatch(menu, /\.from\("menu_categories"\)/);
  assert.doesNotMatch(menu, /\.from\("menu_items"\)/);
});

test("public menu RPC only returns published restaurants and allowlisted public fields", () => {
  assert.match(snapshotMigration, /khaavio_public_restaurant_menu\(p_slug text\)/);
  assert.match(snapshotMigration, /SECURITY DEFINER/);
  assert.match(snapshotMigration, /SET search_path/);
  assert.match(snapshotMigration, /r\.is_published IS TRUE/);
  assert.match(snapshotMigration, /GRANT EXECUTE ON FUNCTION public\.khaavio_public_restaurant_menu\(text\) TO anon, authenticated/);
  assert.match(snapshotMigration, /logo_url/);
  assert.doesNotMatch(snapshotMigration, /v_restaurant\.logo_url/);
});

test("billing snapshot RPC is restricted to the platform-admin allowlist", () => {
  assert.match(snapshotMigration, /platform_admin_razorpay_billing_snapshot\(\)/);
  assert.match(snapshotMigration, /platform_admins AS pa[\s\S]{0,100}pa\.user_id = v_user_id/);
  assert.match(snapshotMigration, /Platform admin access required/);
  assert.match(snapshotMigration, /REVOKE ALL ON FUNCTION public\.platform_admin_razorpay_billing_snapshot\(\) FROM PUBLIC, anon, authenticated/);
  assert.match(snapshotMigration, /GRANT EXECUTE ON FUNCTION public\.platform_admin_razorpay_billing_snapshot\(\) TO authenticated/);
  assert.match(snapshotMigration, /razorpay_subscription_payments/);
  assert.match(snapshotMigration, /razorpay_webhook_events/);
});

test("Khaavio Control contains a read-only Razorpay billing and webhook view", () => {
  assert.match(admin, /id: "billing", label: "Razorpay billing"/);
  assert.match(admin, /platform_admin_razorpay_billing_snapshot/);
  assert.match(admin, /activeTab === "billing"/);
  assert.match(admin, /Subscription and payment ledger/);
  assert.match(admin, /Webhook health/);
  assert.match(admin, /This is a read-only view/);
  assert.match(adminStyles, /\.billing-record-facts/);
  assert.match(adminStyles, /@media \(max-width: 600px\)[\s\S]*?\.billing-webhook-row/);
});
