import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const renewalSql = readFileSync(
  resolve(root, "supabase/migrations/20261024230000_subscription_renewal_requests.sql"),
  "utf8",
);
const adminSql = readFileSync(
  resolve(root, "supabase/migrations/20261024150000_platform_admin_and_manual_plan_assignment.sql"),
  "utf8",
);
const baselineSql = readFileSync(
  resolve(root, "supabase/khaavio-subscriptions-migration.sql"),
  "utf8",
);
const trialCatalogMigrationSql = readFileSync(
  resolve(root, "supabase/migrations/20261025010000_align_trial_trigger_with_plan_catalog.sql"),
  "utf8",
);

test("renewal UI RPC functions have versioned SQL definitions", () => {
  for (const name of [
    "request_subscription_renewal",
    "get_my_subscription_renewal_requests",
    "platform_admin_list_renewal_requests",
    "platform_admin_resolve_renewal_request",
  ]) {
    assert.match(renewalSql, new RegExp(`create or replace function public\\.${name}\\(`));
  }
  assert.match(adminSql, /create or replace function public\.platform_admin_list_audit_logs\(/);
  for (const name of [
    "khaavio_restaurant_subscription_allows_operations",
    "khaavio_restaurant_open_at",
    "khaavio_public_restaurant_can_transact",
  ]) {
    assert.match(renewalSql, new RegExp(`create or replace function public\\.${name}\\(`));
  }
});

test("renewal migration matches the live schema contract", () => {
  assert.match(renewalSql, /requested_plan_key text not null references public\.subscription_plans\(plan_key\)/i);
  assert.match(renewalSql, /resolved_by uuid references auth\.users\(id\) on delete set null/i);
  assert.match(renewalSql, /resolved_at timestamptz/i);
  assert.match(renewalSql, /returns table\s*\([\s\S]*?request_status text[\s\S]*?catalog_price_inr numeric[\s\S]*?created_at timestamptz/i);
  assert.doesNotMatch(renewalSql, /reviewed_by|reviewed_at/i);
  assert.doesNotMatch(renewalSql, /rr\.plan_key|q\.plan_key/i);
});

test("renewal requests cannot be directly written by browser roles", () => {
  assert.match(renewalSql, /alter table public\.subscription_renewal_requests enable row level security/i);
  assert.match(renewalSql, /revoke all privileges on table public\.subscription_renewal_requests from public, anon, authenticated/i);
  assert.match(renewalSql, /subscription_renewal_requests_one_pending_per_restaurant_idx[\s\S]*?where status = 'pending'/i);
  assert.match(renewalSql, /subscription_renewal_requests_unique_verified_payment_reference_idx/i);
});

test("request and resolution RPCs enforce authenticated owner/admin checks", () => {
  assert.match(renewalSql, /where r\.owner_id = v_user_id/i);
  assert.match(renewalSql, /select 1 from public\.platform_admins pa where pa\.user_id = v_user_id/i);
  assert.match(renewalSql, /security definer[\s\S]*?set search_path = ''/i);
  assert.match(renewalSql, /grant execute on function public\.platform_admin_resolve_renewal_request\(uuid, text, numeric, text, text\) to authenticated/i);
});

test("new trial assignments use the plan catalog duration instead of a 14-day literal", () => {
  assert.match(renewalSql, /set duration_days = 7/i);
  assert.match(renewalSql, /select sp\.duration_days[\s\S]*?from public\.subscription_plans sp[\s\S]*?where sp\.plan_key = 'trial'/i);
  assert.match(renewalSql, /make_interval\(days => v_trial_days\)/i);
  assert.doesNotMatch(baselineSql, /interval\s+'14 days'/i);
  assert.match(baselineSql, /duration_days, features, limits, is_active, sort_order[\s\S]*?'trial'[\s\S]*?0, 'none', 7,/i);
});


test("forward migration fixes the live trial trigger without changing existing subscriptions", () => {
  assert.match(trialCatalogMigrationSql, /create or replace function public\.khaavio_assign_trial_subscription\(/i);
  assert.match(trialCatalogMigrationSql, /where sp\.plan_key = 'trial'[\s\S]*?and sp\.is_active is true/i);
  assert.match(trialCatalogMigrationSql, /make_interval\(days => v_trial_days\)/i);
  assert.match(trialCatalogMigrationSql, /on conflict \(restaurant_id\) do nothing/i);
  assert.match(trialCatalogMigrationSql, /does not\s*\n-- change any existing restaurant_subscriptions row/i);
  assert.doesNotMatch(trialCatalogMigrationSql, /interval\s+'7 days'/i);
  assert.match(trialCatalogMigrationSql, /revoke all on function public\.khaavio_assign_trial_subscription\(\)[\s\S]*?from public, anon, authenticated/i);
});
