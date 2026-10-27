import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const publicWidget = read("../src/components/PublicReviewsFeedback.jsx");
const feedbackDashboard = read("../src/pages/ReviewFeedbackDashboard.jsx");
const migration = read("../supabase/migrations/20261025040000_restaurant_reviews_feedback.sql");

test("Google review link is independent from private feedback rating", () => {
  assert.match(publicWidget, /Review us on Google/);
  assert.match(publicWidget, /Share private feedback/);
  assert.match(publicWidget, /useState\(0\)/);
  assert.match(publicWidget, /disabled=\{submitting \|\| rating === 0\}/);
  assert.match(publicWidget, /isValidGoogleReviewUrl\(googleReviewUrl\)/);
  assert.doesNotMatch(publicWidget, /rating\s*>=\s*4.*google/i);
});

test("public feedback submits only through validated RPC", () => {
  assert.match(publicWidget, /submit_restaurant_feedback/);
  assert.match(migration, /r\.is_published IS TRUE/);
  assert.match(migration, /p_rating < 1 OR p_rating > 5/);
  assert.match(migration, /char_length\(v_message\) > 1000/);
});

test("anonymous role cannot directly read or write feedback table", () => {
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
  assert.match(socialStyles, /\.public-reviews-social-links/);
  assert.match(settings, /validateSocialLinks\(form\.social_links\)/);
  assert.match(settings, /social_links: socialValidation\.value/);
});
