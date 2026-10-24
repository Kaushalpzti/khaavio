import test from "node:test";
import assert from "node:assert/strict";
import { planHasFeature, resolvePlanFeatureFlags } from "../src/lib/planFeatures.js";

function subscription(plan_key, limits = undefined) {
  return {
    plan_key,
    subscription_plans: limits ? { limits } : null,
  };
}

test("Starter includes daily restaurant operations", () => {
  const starter = subscription("starter");
  for (const feature of [
    "menu_management", "restaurant_qr", "table_qr", "qr_ordering",
    "kitchen_display", "order_tracking", "receipts", "bookings_basic",
    "analytics_basic", "business_hours", "pause_orders",
  ]) {
    assert.equal(planHasFeature(starter, feature), true, `${feature} should be available on Starter`);
  }
});

test("Starter does not include Growth-only tools", () => {
  const starter = subscription("starter_yearly");
  for (const feature of ["booking_advanced", "booking_export", "analytics_advanced", "priority_support"]) {
    assert.equal(planHasFeature(starter, feature), false, `${feature} should be locked on Starter`);
  }
});

test("Trial, Growth and legacy Pilot/Pro retain full feature access", () => {
  for (const key of ["trial", "growth", "growth_yearly", "pilot", "pro"]) {
    const flags = resolvePlanFeatureFlags(subscription(key));
    assert.equal(Object.values(flags).every(Boolean), true, `${key} should retain full feature access`);
  }
});

test("Database feature flags override defaults, including explicit false", () => {
  const plan = subscription("growth", {
    feature_flags: { analytics_advanced: false, booking_export: true },
  });
  assert.equal(planHasFeature(plan, "analytics_advanced"), false);
  assert.equal(planHasFeature(plan, "booking_export"), true);
  assert.equal(planHasFeature(plan, "qr_ordering"), true);
});

test("unknown plans and unknown features fail closed", () => {
  assert.equal(planHasFeature(subscription("mystery"), "qr_ordering"), false);
  assert.equal(planHasFeature(subscription("growth"), "arbitrary_feature"), false);
});
