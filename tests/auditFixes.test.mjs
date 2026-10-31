import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const read = (path) => readFile(join(root, path), "utf8");

test("unknown routes render the dedicated 404 and server-render a real 404 status", async () => {
  const app = await read("src/App.jsx");
  const handler = await read("api/seo.js");
  const notFound = await read("src/pages/NotFound.jsx");
  const metadata = await read("src/lib/seoMetadata.js");
  assert.match(app, /<Route path="\*" element={<NotFound \/>} \/>/);
  assert.match(handler, /res\.statusCode = notFound \? 404 : 200/);
  assert.match(handler, /X-Robots-Tag/);
  assert.match(notFound, /We couldn’t find that page/);
  assert.doesNotMatch(metadata, /if \(path\.startsWith\("\/dashboard\/"\)\)/);
});

test("dynamic sitemap lists only public marketing routes and published menus", async () => {
  const handler = await read("api/sitemap.js");
  const sql = await read("supabase/migrations/20261031170000_website_leads_sitemap_feedback_controls.sql");
  const vercel = JSON.parse(await read("vercel.json"));
  assert.match(handler, /khaavio_public_sitemap_restaurant_slugs/);
  assert.match(handler, /\/menu\//);
  assert.match(sql, /r\.is_published IS TRUE/);
  assert.match(sql, /LIMIT 49994/);
  assert.equal(vercel.rewrites[0].source, "/sitemap.xml");
  assert.match(await read("public/robots.txt"), /Sitemap: https:\/\/khaavio\.in\/sitemap\.xml/);
});

test("demo and contact forms store a lead before showing the thank-you route", async () => {
  const home = await read("src/pages/Home.jsx");
  const contact = await read("src/pages/Contact.jsx");
  const leads = await read("api/leads.js");
  const sql = await read("supabase/migrations/20261031170000_website_leads_sitemap_feedback_controls.sql");
  const app = await read("src/App.jsx");
  const thankYou = await read("src/pages/ThankYou.jsx");
  assert.match(home, /fetch\("\/api\/leads"/);
  assert.match(contact, /fetch\("\/api\/leads"/);
  assert.match(home, /navigate\("\/thank-you\?type=demo"\)/);
  assert.match(contact, /navigate\("\/thank-you\?type=contact"\)/);
  assert.match(leads, /consume_khaavio_ai_rate_limit/);
  assert.match(leads, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(leads, /body\.website/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.platform_contact_leads/);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /GRANT ALL ON TABLE public\.platform_contact_leads TO service_role/);
  assert.match(app, /path="\/thank-you"/);
  assert.match(home, /markLeadConfirmed\("demo"\)/);
  assert.match(contact, /markLeadConfirmed\("contact"\)/);
  assert.match(thankYou, /consumeLeadConfirmation\(leadType\)/);
  assert.match(thankYou, /trackEvent\("generate_lead"/);
});

test("GA4 loads only with a configured measurement ID and explicit analytics consent", async () => {
  const manager = await read("src/components/AnalyticsConsentManager.jsx");
  const analytics = await read("src/lib/analytics.js");
  const privacy = await read("src/pages/LegalPage.jsx");
  assert.match(manager, /VITE_GA4_MEASUREMENT_ID/);
  assert.match(manager, /consent !== "granted"/);
  assert.match(manager, /Allow analytics/);
  assert.match(manager, /Reject optional/);
  assert.match(manager, /analytics_storage: "denied"/);
  assert.match(analytics, /getItem\(ANALYTICS_CONSENT_KEY\) !== "granted"/);
  assert.match(analytics, /LEAD_CONFIRMATION_KEY/);
  assert.match(privacy, /Google Analytics 4/);
  assert.match(privacy, /privacy choices/);
});

test("public feedback is rate-limited server-side and old anonymous table writes are revoked", async () => {
  const edge = await read("supabase/functions/khaavio-submit-feedback/index.ts");
  const ui = await read("src/components/PublicReviewsFeedback.jsx");
  const sql = await read("supabase/migrations/20261031170000_website_leads_sitemap_feedback_controls.sql");
  assert.match(edge, /consume_khaavio_ai_rate_limit/);
  assert.match(edge, /cf-connecting-ip/);
  assert.match(edge, /HMAC/);
  assert.match(edge, /submit_restaurant_feedback/);
  assert.match(ui, /functions\.invoke\("khaavio-submit-feedback"/);
  assert.match(ui, /public-reviews-honeypot/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.submit_restaurant_feedback[\s\S]*?FROM PUBLIC, anon, authenticated/);
  assert.match(sql, /TO service_role/);
});

test("AI-generated public review drafts are disabled and Google links remain direct", async () => {
  const edge = await read("supabase/functions/khaavio-ai-chat/index.ts");
  const ui = await read("src/components/PublicReviewsFeedback.jsx");
  assert.match(edge, /REVIEW_DRAFTS_DISABLED/);
  assert.doesNotMatch(edge, /Write a short first-person Google review/);
  assert.doesNotMatch(ui, /review_draft|generateReviewDraft|AI draft|reviewDraft/);
  assert.match(ui, /href=\{googleReviewUrl\}/);
});

test("public loyalty lookup and order attachment require the same browser-bound random token", async () => {
  const sql = await read("supabase/migrations/20261031180000_bind_loyalty_cards_to_browser_tokens.sql");
  const serviceMigration = await read("supabase/migrations/20261031190000_disable_phone_only_service_mode_loyalty.sql");
  const component = await read("src/components/PublicLoyaltyClub.jsx");
  const serviceRpc = serviceMigration.match(/CREATE OR REPLACE FUNCTION public\.place_public_order_for_service_mode[\s\S]*?\$function\$;/)?.[0] || "";
  assert.match(sql, /lm\.member_token = p_member_token/);
  assert.match(sql, /lm\.member_token = p_loyalty_member_token/);
  assert.match(sql, /lm\.phone_number = v_phone/);
  assert.match(serviceRpc, /v_final := public\.khaavio_apply_order_coupon/);
  const serviceBody = serviceRpc.split("AS $function$")[1] || "";
  assert.doesNotMatch(serviceBody, /restaurant_loyalty_members|loyalty_member_id|p_loyalty_phone/);
  assert.match(component, /phone number alone cannot restore it/);
});
