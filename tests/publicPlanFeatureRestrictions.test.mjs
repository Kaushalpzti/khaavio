import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizePublicFeatureFlags, shouldShowPublicReviewsTab, DEFAULT_PUBLIC_FEATURES } from "../src/lib/publicPlanFeatures.js";
import { planHasFeature, resolvePlanFeatureFlags } from "../src/lib/planFeatures.js";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const migration = read("../supabase/migrations/20261026040000_khaavio_growth_feature_gating.sql");
const publicMenu = read("../src/pages/PublicMenu.jsx");
const reviewWidget = read("../src/components/PublicReviewsFeedback.jsx");
const loyaltyDashboard = read("../src/pages/LoyaltyDashboard.jsx");
const feedbackDashboard = read("../src/pages/ReviewFeedbackDashboard.jsx");
const askKhaavio = read("../src/components/AskKhaavio.jsx");
const aiFunction = read("../supabase/functions/khaavio-ai-chat/index.ts");
const bookingsDashboard = read("../src/pages/BookingsDashboard.jsx");
const homepage = read("../src/pages/Home.jsx");

function subscription(plan_key, limits = undefined) {
  return { plan_key, subscription_plans: limits ? { limits } : null };
}

test("public flags fail closed and accept only explicit true booleans", () => {
  assert.deepEqual(normalizePublicFeatureFlags(null), { ...DEFAULT_PUBLIC_FEATURES });
  assert.deepEqual(normalizePublicFeatureFlags({ loyalty_rewards: true, private_feedback: 1, ai_menu_assistant: "true" }), {
    loyalty_rewards: true,
    private_feedback: false,
    google_review_link: false,
    ai_menu_assistant: false,
    voice_alerts_advanced: false,
  });
});

test("Starter exposes only a configured Google review link, not Rewards or private feedback", () => {
  const starter = subscription("starter");
  assert.equal(planHasFeature(starter, "google_review_link"), true);
  assert.equal(planHasFeature(starter, "loyalty_rewards"), false);
  assert.equal(planHasFeature(starter, "private_feedback"), false);
  assert.equal(planHasFeature(starter, "ai_menu_assistant"), false);
  assert.equal(shouldShowPublicReviewsTab({ private_feedback: false, google_review_link: true }, true), true);
  assert.equal(shouldShowPublicReviewsTab({ private_feedback: false, google_review_link: true }, false), false);
  assert.equal(shouldShowPublicReviewsTab({ private_feedback: false, google_review_link: false }, false, true), true);
  assert.equal(shouldShowPublicReviewsTab({ private_feedback: false, google_review_link: false }, false, false), false);
});

test("Growth, trial and legacy plans retain the Growth feature set", () => {
  for (const plan of ["growth", "growth_yearly", "trial", "pilot", "pro"]) {
    const flags = resolvePlanFeatureFlags(subscription(plan));
    for (const key of ["loyalty_rewards", "private_feedback", "google_review_link", "ai_menu_assistant", "voice_alerts_advanced"]) {
      assert.equal(flags[key], true, `${plan}.${key} should be enabled`);
    }
  }
});

test("public menu uses server feature flags for Rewards, Reviews and Ask Khaavio", () => {
  assert.match(publicMenu, /khaavio_public_restaurant_feature_flags/);
  assert.match(publicMenu, /activeBottomTab === "rewards" && canUseLoyaltyRewards/);
  assert.match(publicMenu, /activeBottomTab === "reviews" && canShowReviewsTab/);
  assert.match(publicMenu, /allowPrivateFeedback=\{canUsePrivateFeedback\}/);
  assert.match(publicMenu, /\(canUseAskKhaavio \|\| Boolean\(slug && tableToken && tableContext\?\.restaurant_id\)\)/);
  assert.match(publicMenu, /aiEnabled=\{canUseAskKhaavio\}/);
  assert.match(publicMenu, /showService=\{Boolean\(slug && tableToken && tableContext\?\.restaurant_id\)\}/);
  assert.match(publicMenu, /shouldShowPublicReviewsTab/);
  assert.match(publicMenu, /hasSocialLinks\(restaurant\?\.social_links\)/);
});

test("Starter review tab can show Google link but private form is plan gated", () => {
  assert.match(reviewWidget, /allowGoogleReviewLink = true/);
  assert.match(reviewWidget, /allowPrivateFeedback = true/);
  assert.match(reviewWidget, /\{showGoogleReview && \(/);
  assert.match(publicMenu, /canUsePrivateFeedback \? "Your feedback means a lot\." : "Enjoyed your visit\?"/);
  assert.match(reviewWidget, /\{allowPrivateFeedback && \(/);
  assert.match(reviewWidget, /\{allowPrivateFeedback && isOpen && \(/);
});

test("Growth dashboard modules avoid reading restricted data for Starter", () => {
  assert.match(loyaltyDashboard, /hasFeature\("loyalty_rewards"\)/);
  assert.match(loyaltyDashboard, /if \(!canManageLoyalty\)/);
  assert.match(loyaltyDashboard, /PlanUpgradeNotice/);
  assert.match(feedbackDashboard, /hasFeature\("private_feedback"\)/);
  assert.match(feedbackDashboard, /if \(!canManagePrivateFeedback\)/);
  assert.match(feedbackDashboard, /PlanUpgradeNotice/);
  assert.match(feedbackDashboard, /if \(!canManagePrivateFeedback\) \{/);
  assert.match(feedbackDashboard, /useKhaavioOperationalAlerts/);
  assert.match(read("../src/context/KhaavioOperationalAlertsContext.jsx"), /privateFeedbackAllowed/);
  assert.match(loyaltyDashboard, /\}, \[canManageLoyalty\]\)/);
});

test("AI chat requires a published restaurant's server-side Growth entitlement", () => {
  assert.match(askKhaavio, /restaurantSlug: restaurant\?\.slug/);
  assert.match(aiFunction, /hasPublicRestaurantFeature\(restaurantSlug, "ai_menu_assistant"\)/);
  assert.match(aiFunction, /FEATURE_NOT_IN_PLAN/);
  assert.match(aiFunction, /FEATURE_ACCESS_UNAVAILABLE/);
});

test("SQL enforces Growth entitlements without deleting historical data", () => {
  assert.match(migration, /khaavio_public_restaurant_feature_flags/);
  assert.match(migration, /KHAAVIO_PLAN_FEATURE_REQUIRED:private_feedback/);
  assert.match(migration, /KHAAVIO_PLAN_FEATURE_REQUIRED:loyalty_rewards/);
  assert.match(migration, /khaavio_owner_has_feature\(restaurant_feedback\.restaurant_id, 'private_feedback'\)/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.ensure_public_loyalty_member\(text, uuid\) FROM PUBLIC, anon, authenticated/);
  assert.doesNotMatch(migration, /DELETE\s+FROM\s+public\.restaurant_(loyalty|feedback)/i);
});

test("public pricing presents Google review links in Starter and engagement modules in Growth", () => {
  const starterStart = homepage.indexOf('name: "Starter"');
  const growthStart = homepage.indexOf('name: "Growth"');
  assert.ok(starterStart >= 0 && growthStart > starterStart);
  const starterPlan = homepage.slice(starterStart, growthStart);
  const growthPlan = homepage.slice(growthStart, homepage.indexOf('const faqs', growthStart));
  assert.match(starterPlan, /Google Business review link on the public menu/);
  assert.match(starterPlan, /Operational voice alerts for orders, kitchen and service requests/);
  assert.doesNotMatch(starterPlan, /Digital loyalty stamps and rewards|Private guest ratings|Ask Khaavio AI menu assistant/);
  assert.match(growthPlan, /Digital loyalty stamps and rewards/);
  assert.match(growthPlan, /Private guest ratings, feedback inbox/);
  assert.match(growthPlan, /Ask Khaavio AI menu assistant/);
});

test("Starter page shows core voice alerts; booking voice announcements are Growth gated", () => {
  assert.match(homepage, /Operational voice alerts for orders, kitchen and service requests/);
  assert.match(bookingsDashboard, /hasFeature\("voice_alerts_advanced"\)/);
  assert.match(bookingsDashboard, /\{canUseAdvancedVoiceAlerts && \(/);
  assert.match(read("../src/context/KhaavioOperationalAlertsContext.jsx"), /bookingVoiceAllowed/);
});
