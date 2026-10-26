import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path) => readFileSync(resolve(process.cwd(), path), "utf8");

test("Razorpay migration preserves manual rows and creates private billing ledgers", () => {
  const sql = read("supabase/migrations/20261026050000_razorpay_subscription_billing.sql");
  assert.match(sql, /payment_provider text NOT NULL DEFAULT 'manual'/i);
  assert.match(sql, /razorpay_subscription_attempts/);
  assert.match(sql, /razorpay_subscription_payments/);
  assert.match(sql, /razorpay_webhook_events/);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/i);
  assert.match(sql, /REVOKE ALL ON TABLE public\.razorpay_webhook_events FROM anon, authenticated/i);
  assert.match(sql, /razorpay_one_open_attempt_per_restaurant_idx/);
});

test("server maps only approved plan keys to private Razorpay plan ID secrets", () => {
  const helper = read("supabase/functions/_shared/razorpay.ts");
  assert.match(helper, /RAZORPAY_PLAN_STARTER_MONTHLY/);
  assert.match(helper, /RAZORPAY_PLAN_STARTER_YEARLY/);
  assert.match(helper, /RAZORPAY_PLAN_GROWTH_MONTHLY/);
  assert.match(helper, /RAZORPAY_PLAN_GROWTH_YEARLY/);
  assert.match(helper, /amountInr: 499/);
  assert.match(helper, /amountInr: 899/);
});

test("create endpoint checks authenticated restaurant ownership and Razorpay plan price", () => {
  const source = read("supabase/functions/razorpay-create-subscription/index.ts");
  assert.match(source, /authenticateUser\(req\)/);
  assert.match(source, /restaurants\?owner_id=eq\./);
  assert.match(source, /catalogPlan\.billing_interval/);
  assert.match(source, /Number\(item\.amount\) !== planConfig\.amountInr \* 100/);
  assert.match(source, /CHECKOUT_ALREADY_PENDING/);
});

test("checkout verifies subscription signatures and never activates access itself", () => {
  const source = read("supabase/functions/razorpay-verify-subscription/index.ts");
  assert.match(source, /\$\{paymentId\}\|\$\{attempt\.razorpay_subscription_id\}/);
  assert.match(source, /SIGNATURE_INVALID/);
  assert.match(source, /captured subscription charge by webhook/);
  assert.doesNotMatch(source, /body:\s*\{[^}]*status:\s*["']active["']/s);
});

test("webhook verifies raw body, event idempotency and captured amount before enabling plan", () => {
  const source = read("supabase/functions/razorpay-webhook/index.ts");
  assert.match(source, /const rawBody = await req\.text\(\)/);
  assert.match(source, /RAZORPAY_WEBHOOK_SECRET/);
  assert.match(source, /x-razorpay-signature/);
  assert.match(source, /razorpay_webhook_events\?on_conflict=event_id/);
  assert.match(source, /paymentStatus !== "captured"/);
  assert.match(source, /amountPaise !== expectedPaise/);
  assert.match(source, /payment_provider: "razorpay"/);
  assert.match(source, /return json\(\{ error: "WEBHOOK_PROCESSING_FAILED" \}, 500\)/);
});

test("browser checkout does not expose Razorpay secret and calls server endpoints", () => {
  const page = read("src/pages/Subscription.jsx");
  const checkout = read("src/lib/razorpayCheckout.js");
  assert.match(page, /razorpay-create-subscription/);
  assert.match(page, /razorpay-verify-subscription/);
  assert.match(page, /razorpay-cancel-pending-subscription/);
  assert.match(page, /Subscribe & pay/);
  assert.match(page, /Secure Razorpay checkout/);
  assert.match(page, /loadRazorpayCheckout/);
  assert.doesNotMatch(page + checkout, /RAZORPAY_KEY_SECRET|RAZORPAY_WEBHOOK_SECRET/);
  assert.match(checkout, /checkout\.razorpay\.com\/v1\/checkout\.js/);
});

test("Supabase config leaves webhook public-to-Razorpay but protects user endpoints with JWT", () => {
  const config = read("supabase/config.toml");
  assert.match(config, /\[functions\.razorpay-create-subscription\][\s\S]*?verify_jwt = true/);
  assert.match(config, /\[functions\.razorpay-verify-subscription\][\s\S]*?verify_jwt = true/);
  assert.match(config, /\[functions\.razorpay-cancel-pending-subscription\][\s\S]*?verify_jwt = true/);
  assert.match(config, /\[functions\.razorpay-webhook\][\s\S]*?verify_jwt = false/);
});
