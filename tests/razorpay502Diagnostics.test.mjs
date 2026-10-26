import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const shared = readFileSync("supabase/functions/_shared/razorpay.ts", "utf8");
const create = readFileSync("supabase/functions/razorpay-create-subscription/index.ts", "utf8");

test("Razorpay API errors include safe method, endpoint, HTTP status and code diagnostics", () => {
  assert.match(shared, /Razorpay API request failed: \$\{method\} \/v1\/\$\{path\.replace/);
  assert.match(shared, /HTTP \$\{response\.status\}/);
  assert.match(shared, /error\.code/);
  assert.doesNotMatch(shared, /console\.(log|error).*RAZORPAY_KEY_SECRET/);
});

test("subscription create uses a bounded cycle count rather than a far-future end_at", () => {
  assert.match(create, /const totalCount = planConfig\.interval === "monthly" \? 120 : 10/);
  assert.match(create, /total_count: totalCount/);
  assert.doesNotMatch(create, /end_at: endAt/);
});