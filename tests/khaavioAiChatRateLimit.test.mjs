import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const functionSource = await readFile(
  new URL("../supabase/functions/khaavio-ai-chat/index.ts", import.meta.url),
  "utf8",
);
const migrationSource = await readFile(
  new URL("../supabase/migrations/20261026010000_khaavio_ai_chat_rate_limit.sql", import.meta.url),
  "utf8",
);

test("AI chat uses a durable shared RPC limiter instead of a process-local Map", () => {
  assert.match(functionSource, /consume_khaavio_ai_rate_limit/);
  assert.doesNotMatch(functionSource, /new Map<string,\s*\{\s*count:/);
  assert.match(migrationSource, /on conflict \(key_hash\) do update/i);
});

test("AI chat does not trust caller-provided forwarding headers for identity", () => {
  assert.match(functionSource, /cf-connecting-ip/);
  assert.doesNotMatch(functionSource, /headers\.get\("x-forwarded-for"\)/i);
  assert.doesNotMatch(functionSource, /headers\.get\("x-real-ip"\)/i);
});

test("AI provider calls fail closed when the shared limiter is unavailable", () => {
  const limiterCall = functionSource.indexOf("const rateLimit = await consumeRateLimit(req)");
  const providerCall = functionSource.indexOf("https://api.groq.com/openai/v1/chat/completions");
  assert.notEqual(limiterCall, -1);
  assert.notEqual(providerCall, -1);
  assert.ok(limiterCall < providerCall, "rate limit must be checked before Groq is called");
  assert.match(functionSource, /error: "RATE_LIMIT_UNAVAILABLE"[\s\S]*?\}, 503\)/);
});

test("the limiter RPC is server-only and has a fixed search path", () => {
  assert.match(migrationSource, /security definer\s+set search_path = ''/i);
  assert.match(migrationSource, /revoke all on function public\.consume_khaavio_ai_rate_limit[\s\S]*?from public, anon, authenticated/i);
  assert.match(migrationSource, /grant execute on function public\.consume_khaavio_ai_rate_limit[\s\S]*?to service_role/i);
  assert.match(migrationSource, /alter table private\.khaavio_ai_rate_limits enable row level security/i);
});

test("rate-limit keys are bounded and raw IPs are not stored", () => {
  assert.match(functionSource, /HMAC/);
  assert.match(migrationSource, /key_hash text primary key check \(key_hash ~ '\^\[0-9a-f\]\{64\}\$'\)/);
  assert.match(migrationSource, /p_limit > 100/);
  assert.match(migrationSource, /p_window_seconds > 3600/);
});


test("AI menu context includes the complete public dietary metadata and a bounded full-menu window", () => {
  assert.match(functionSource, /const MAX_MENU_ITEMS = 120/);
  assert.match(functionSource, /const MAX_BODY_LENGTH = 64_000/);
  assert.match(functionSource, /const MAX_BODY_LENGTH = 64_000/);
  assert.match(functionSource, /foodType/);
  assert.match(functionSource, /spiceLevel/);
  assert.match(functionSource, /isJainFriendly/);
  assert.match(functionSource, /allergens/);
  assert.match(functionSource, /Jain friendly/);
});

test("dish overview questions can use Groq browser search, but exact restaurant facts do not", () => {
  assert.match(functionSource, /function shouldUseBrowserSearch/);
  assert.match(functionSource, /dishKnowledgeRequest/);
  assert.match(functionSource, /restaurantFactRequest/);
  assert.match(functionSource, /tools: \[\{ type: "browser_search" \}\]/);
  assert.match(functionSource, /tool_choice: "required"/);
  assert.match(functionSource, /citation_options: "enabled"/);
  assert.match(functionSource, /useBrowserSearch \? "medium" : "low"/);
});

test("web research is clearly separated from restaurant recipe and allergen facts", () => {
  assert.match(functionSource, /general information about the dish, not the restaurant's exact recipe/);
  assert.match(functionSource, /Never use generic web results to assert this restaurant's ingredients or allergen status/);
  assert.match(functionSource, /Ask customers to confirm allergies, ingredients and dietary restrictions with restaurant staff/i);
});
