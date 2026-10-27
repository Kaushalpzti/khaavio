import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { hasSocialLinks, normalizeSocialLinks, SOCIAL_LINK_FIELDS, validateSocialLinks } from "../src/lib/restaurantSocialLinks.js";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("supports official restaurant social platforms over HTTPS", () => {
  const result = validateSocialLinks({
    instagram: "https://instagram.com/ayushi.cafe",
    facebook: "https://www.facebook.com/ayushicafe",
    youtube: "https://youtu.be/example",
    tiktok: "https://www.tiktok.com/@ayushicafe",
    x: "https://x.com/ayushicafe",
    whatsapp: "https://wa.me/919876543210",
    website: "https://ayushicafe.example",
  });
  assert.equal(result.ok, true);
  assert.equal(Object.keys(result.value).length, 7);
  assert.equal(SOCIAL_LINK_FIELDS.length, 7);
});

test("rejects unsafe protocols and links on the wrong platform", () => {
  assert.equal(validateSocialLinks({ instagram: "javascript:alert(1)" }).ok, false);
  assert.equal(validateSocialLinks({ instagram: "https://instagram.com.example.org/fake" }).ok, false);
  assert.equal(validateSocialLinks({ facebook: "https://instagram.com/ayushicafe" }).ok, false);
  assert.equal(validateSocialLinks({ website: "http://ayushicafe.example" }).ok, false);
});

test("public normalization omits invalid old values and detects configured links", () => {
  const normal = normalizeSocialLinks({ instagram: "https://instagram.com/ayushicafe", facebook: "javascript:alert(1)" });
  assert.equal(normal.instagram, "https://instagram.com/ayushicafe");
  assert.equal(normal.facebook, "");
  assert.equal(hasSocialLinks(normal), true);
  assert.equal(hasSocialLinks({}), false);
});

test("dashboard and review widget use the social profile fields", () => {
  const settings = read("../src/pages/RestaurantSettings.jsx");
  const publicReviews = read("../src/components/PublicReviewsFeedback.jsx");
  const socialComponent = read("../src/components/PublicRestaurantSocialLinks.jsx");
  assert.ok(settings.includes("social_links: socialValidation.value"));
  assert.ok(settings.includes("SOCIAL_LINK_FIELDS.map"));
  assert.match(publicReviews, /PublicRestaurantSocialLinks/);
  assert.match(socialComponent, /public-reviews-social-icon/);
  assert.doesNotMatch(socialComponent, /FOLLOW ALONG|Find \{restaurantName/);
  assert.match(socialComponent, /rel="noopener noreferrer nofollow"/);
});

test("social links are allowlisted in the published menu RPC", () => {
  const migration = read("../supabase/migrations/20261027203000_restaurant_social_links.sql");
  assert.match(migration, /ADD COLUMN IF NOT EXISTS social_links jsonb/);
  assert.ok(migration.includes("CHECK (pg_catalog.jsonb_typeof(social_links) = 'object')"));
  assert.ok(migration.includes("'social_links', COALESCE(v_restaurant -> 'social_links', '{}'::jsonb)"));
  assert.ok(migration.includes("WHERE r.slug = pg_catalog.btrim(p_slug) AND r.is_published IS TRUE"));
});
