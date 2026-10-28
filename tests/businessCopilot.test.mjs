import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const migration = read("../supabase/migrations/20261028110000_business_copilot_summary.sql");
const edge = read("../supabase/functions/khaavio-business-copilot/index.ts");
const page = read("../src/pages/BusinessCopilot.jsx");
const app = read("../src/App.jsx");
const navigation = read("../src/components/RestaurantDashboardLayout.jsx");
const planFeatures = read("../src/lib/planFeatures.js");

test("Business Copilot is Growth gated at database level and owners are isolated", () => {
  assert.match(migration, /business_copilot/i);
  assert.match(migration, /r\.owner_id\s*=\s*\(SELECT auth\.uid\(\)\)/i);
  assert.match(migration, /KHAAVIO_PLAN_ACCESS_REQUIRED/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.khaavio_business_copilot_summary\(uuid, integer\) TO authenticated/i);
  assert.match(migration, /p_days NOT IN \(7, 30, 90\)/);
  assert.match(planFeatures, /"business_copilot"/);
});

test("summary returns aggregates, top dishes, repeat-customer count and upcoming bookings only", () => {
  assert.match(migration, /completed_sales_inr/);
  assert.match(migration, /repeat_customers/);
  assert.match(migration, /top_dishes/);
  assert.match(migration, /peak_hours_ist/);
  assert.match(migration, /upcoming_bookings_next_30_days/);
  assert.doesNotMatch(migration, /jsonb_build_object\('customer_phone'/i);
});

test("Edge Function authenticates, rate limits by user and calls owner-scoped summary before Groq", () => {
  assert.match(edge, /\/auth\/v1\/user/);
  assert.match(edge, /consume_khaavio_ai_rate_limit/);
  assert.match(edge, /hmacIdentity/);
  assert.match(edge, /khaavio_business_copilot_summary/);
  assert.ok(edge.indexOf("khaavio_business_copilot_summary") < edge.indexOf("https://api.groq.com/openai/v1/chat/completions"));
  assert.match(edge, /MAX_QUESTION_LENGTH = 500/);
  assert.match(edge, /SUPABASE_SERVICE_ROLE_KEY/);
});

test("Copilot is routed and discoverable in restaurant navigation", () => {
  assert.match(app, /path="\/dashboard\/copilot"/);
  assert.match(app, /BusinessCopilot/);
  assert.match(navigation, /Business Copilot/);
  assert.match(page, /supabase\.functions\.invoke\("khaavio-business-copilot"/);
});

test("owner-facing answers use a selected reporting window and do not trigger operations", () => {
  assert.match(page, /value: 7/);
  assert.match(page, /value: 30/);
  assert.match(page, /value: 90/);
  assert.match(page, /No actions are taken automatically/);
  assert.match(edge, /Never claim to have changed menu prices, placed orders, sent campaigns, or performed any action/);
});
