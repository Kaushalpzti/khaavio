import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("Google review workflow is customer-written and never requests an AI draft", () => {
  const component = read("src/components/PublicReviewsFeedback.jsx");
  const ai = read("supabase/functions/khaavio-ai-chat/index.ts");
  assert.match(component, /Your honest review/);
  assert.match(component, /Write and submit an honest review based on your own visit/);
  assert.doesNotMatch(component, /generateReviewDraft|review_draft|Create an AI draft|Refresh AI draft/);
  assert.match(ai, /AI_REVIEW_DRAFTS_DISABLED/);
  assert.match(ai, /}, 410\)/);
});

test("private public-menu feedback uses the protected Edge Function and a honeypot", () => {
  const component = read("src/components/PublicReviewsFeedback.jsx");
  const migration = read("supabase/migrations/20261031163000_seo_feedback_loyalty_security.sql");
  const fn = read("supabase/functions/khaavio-public-feedback/index.ts");
  assert.match(component, /functions\.invoke\(["']khaavio-public-feedback["']/);
  assert.match(component, /name="website"/);
  assert.match(migration, /submission_count/);
  assert.match(migration, /INTERVAL '10 minutes'/i);
  assert.match(migration, /v_count > 8/);
  assert.match(fn, /cf-connecting-ip/);
  assert.match(fn, /p_ip_hash/);
  assert.match(fn, /RATE_LIMITED/);
});
