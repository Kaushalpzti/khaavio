/**
 * Khaavio plan feature defaults.
 * Database `subscription_plans.limits.feature_flags` overrides these defaults.
 * Unknown plan keys fail closed; legacy pilot/pro plans retain their existing
 * broad access so this rollout does not unexpectedly break existing customers.
 */
export const PLAN_FEATURE_KEYS = [
  "menu_management",
  "restaurant_qr",
  "table_qr",
  "qr_ordering",
  "kitchen_display",
  "order_tracking",
  "receipts",
  "bookings_basic",
  "booking_advanced",
  "booking_export",
  "analytics_basic",
  "analytics_advanced",
  "business_hours",
  "pause_orders",
  "priority_support",
];

const CORE_FLAGS = Object.freeze({
  menu_management: true,
  restaurant_qr: true,
  table_qr: true,
  qr_ordering: true,
  kitchen_display: true,
  order_tracking: true,
  receipts: true,
  bookings_basic: true,
  booking_advanced: false,
  booking_export: false,
  analytics_basic: true,
  analytics_advanced: false,
  business_hours: true,
  pause_orders: true,
  priority_support: false,
});

const FULL_FLAGS = Object.freeze(
  Object.fromEntries(PLAN_FEATURE_KEYS.map((feature) => [feature, true])),
);

const PLAN_DEFAULTS = Object.freeze({
  pilot: FULL_FLAGS,
  trial: FULL_FLAGS,
  // `pro` is retired from new sales, but existing Pro subscribers must not be
  // unexpectedly downgraded as part of a safe migration.
  pro: FULL_FLAGS,
  starter: CORE_FLAGS,
  starter_yearly: CORE_FLAGS,
  growth: FULL_FLAGS,
  growth_yearly: FULL_FLAGS,
});

export function resolvePlanFeatureFlags(subscription) {
  const planKey = subscription?.plan_key;
  const defaults = PLAN_DEFAULTS[planKey] || {};
  const planRelation = Array.isArray(subscription?.subscription_plans)
    ? subscription.subscription_plans[0]
    : subscription?.subscription_plans;
  const storedFlags = planRelation?.limits?.feature_flags;

  const resolved = {};
  for (const feature of PLAN_FEATURE_KEYS) {
    const storedValue = storedFlags?.[feature];
    if (typeof storedValue === "boolean") {
      resolved[feature] = storedValue;
    } else {
      resolved[feature] = defaults[feature] === true;
    }
  }
  return resolved;
}

export function planHasFeature(subscription, featureKey) {
  if (!PLAN_FEATURE_KEYS.includes(featureKey)) return false;
  return resolvePlanFeatureFlags(subscription)[featureKey] === true;
}
