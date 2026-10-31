import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const publicWidget = read("../src/components/PublicReviewsFeedback.jsx");
const feedbackDashboard = read("../src/pages/ReviewFeedbackDashboard.jsx");
const migration = read("../supabase/migrations/20261025040000_restaurant_reviews_feedback.sql");
const abuseControls = read("../supabase/migrations/20261031170000_website_leads_sitemap_feedback_controls.sql");
const feedbackFunction = read("../supabase/functions/khaavio-submit-feedback/index.ts");

test("Google review link remains independent from private feedback rating", () => {
  assert.match(publicWidget, /Write an honest Google review/);
  assert.match(publicWidget, /Share private feedback/);
  assert.match(publicWidget, /useState\(0\)/);
  assert.match(publicWidget, /disabled=\{submitting \|\| !rating\}/);
  assert.match(publicWidget, /isValidGoogleReviewUrl\(googleReviewUrl\)/);
  assert.doesNotMatch(publicWidget, /rating\s*>=\s*4.*google/i);
});

test("public feedback submits through the rate-limited Edge Function", () => {
  assert.match(publicWidget, /functions\.invoke\("khaavio-submit-feedback"/);
  assert.match(feedbackFunction, /submit_restaurant_feedback/);
  assert.match(feedbackFunction, /consume_khaavio_ai_rate_limit/);
  assert.match(feedbackFunction, /cf-connecting-ip/);
  assert.match(abuseControls, /REVOKE ALL ON FUNCTION public\.submit_restaurant_feedback[\s\S]*?FROM PUBLIC, anon, authenticated/);
  assert.match(abuseControls, /GRANT EXECUTE ON FUNCTION public\.submit_restaurant_feedback[\s\S]*?TO service_role/);
  assert.match(migration, /r\.is_published IS TRUE/);
  assert.match(migration, /p_rating < 1 OR p_rating > 5/);
  assert.match(migration, /char_length\(v_message\) > 1000/);
});

test("anonymous role cannot directly read or write the feedback table", () => {
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /REVOKE ALL ON TABLE public\.restaurant_feedback FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /CREATE POLICY restaurant_feedback_owner_select/);
  assert.match(migration, /r\.owner_id = \(SELECT auth\.uid\(\)\)/);
});

test("restaurant dashboard can only update feedback status, not content", () => {
  assert.match(feedbackDashboard, /\.update\(\{ status \}\)/);
  assert.match(migration, /Feedback details cannot be edited/);
  assert.match(migration, /NEW\.rating IS DISTINCT FROM OLD\.rating/);
});

test("review URL must be HTTPS on an allowed Google host", () => {
  assert.match(publicWidget, /url\.protocol === "https:"/);
  assert.match(publicWidget, /GOOGLE_REVIEW_HOSTS/);
  const settings = read("../src/pages/RestaurantSettings.jsx");
  assert.match(settings, /google_review_url/);
});

test("public review section renders social links and dashboard saves validated profiles", () => {
  const socialComponent = read("../src/components/PublicRestaurantSocialLinks.jsx");
  const socialStyles = read("../src/components/PublicReviewsFeedback.css");
  const settings = read("../src/pages/RestaurantSettings.jsx");
  assert.match(publicWidget, /PublicRestaurantSocialLinks/);
  assert.match(publicWidget, /socialLinks = \{\}/);
  assert.match(socialComponent, /normalizeSocialLinks\(socialLinks\)/);
  assert.match(socialComponent, /rel="noopener noreferrer nofollow"/);
  assert.match(socialStyles, /\.public-reviews-social-icons/);
  assert.match(socialStyles, /\.public-reviews-social-icon/);
  assert.ok(publicWidget.lastIndexOf("<PublicRestaurantSocialLinks") > publicWidget.indexOf("{allowPrivateFeedback && isOpen && ("));
  assert.match(settings, /validateSocialLinks\(form\.social_links\)/);
  assert.match(settings, /social_links: socialValidation\.value/);
});

test("AI-generated first-person review drafts are not available in the public review experience", async () => {
  const ai = read("../supabase/functions/khaavio-ai-chat/index.ts");
  assert.doesNotMatch(publicWidget, /review_draft|generateReviewDraft|AI draft|reviewDraft/);
  assert.match(ai, /REVIEW_DRAFTS_DISABLED/);
});
