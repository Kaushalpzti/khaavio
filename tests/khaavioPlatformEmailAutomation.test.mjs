import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path) => readFileSync(resolve(process.cwd(), path), "utf8");

const migrationPath = "supabase/migrations/20261102100000_khaavio_platform_email_automation.sql";
const migration = read(migrationPath);
const dispatcher = read("supabase/functions/khaavio-email-dispatch/index.ts");
const webhook = read("supabase/functions/razorpay-webhook/index.ts");
const config = read("supabase/config.toml");
const runbook = read("docs/KHAAVIO-EMAIL-AUTOMATION.md");
const workflow = read(".github/workflows/khaavio-ci.yml");
const sqlFixture = read("tests/sql/khaavio-platform-email-fixture.sql");
const sqlVerify = read("tests/sql/khaavio-platform-email-verify.sql");

test("email outbox is private, event-key idempotent and service-role only", () => {
  assert.match(migration, /create table if not exists public\.khaavio_email_outbox/i);
  assert.match(migration, /event_key text not null unique/i);
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /revoke all privileges on table public\.khaavio_email_outbox from public, anon, authenticated/i);
  assert.match(migration, /grant select, insert, update, delete on table public\.khaavio_email_outbox to service_role/i);
  assert.match(migration, /for update skip locked/i);
});

test("trial and subscription status changes queue owner-only platform events", () => {
  assert.match(migration, /join auth\.users as u on u\.id = r\.owner_id/i);
  assert.match(migration, /'trial_started'/);
  assert.match(migration, /trg_khaavio_queue_trial_started_email/i);
  assert.match(migration, /trg_khaavio_queue_subscription_state_email/i);
  assert.match(migration, /'past_due'/);
  assert.match(migration, /'subscription_cancelled'/);
  assert.match(migration, /'subscription_expired'/);
  assert.doesNotMatch(migration, /net\.http_post|http_post\s*\(/i);
});

test("scheduler expires eligible periods and queues trial and paid-plan reminders", () => {
  assert.match(migration, /create extension if not exists pg_cron/i);
  assert.match(migration, /create extension if not exists pg_net/i);
  assert.match(migration, /khaavio_queue_due_platform_email_events/i);
  assert.match(migration, /in \(1, 2\)/i);
  assert.match(migration, /= 3/i);
  assert.match(migration, /cancel_at_period_end, false\) is false/i);
});

test("dispatcher uses all eight published templates and a separate dispatch secret", () => {
  for (const id of [
    "ff515b79-81a5-49b8-a9f0-b3285cff875b",
    "10647559-15d7-4db0-a6a4-5503ad3bf809",
    "f3c88bed-1e40-467c-be45-1085fbd6edcb",
    "0310d27b-1739-4b54-a415-813208b3e501",
    "1fb9077b-7e6b-43d1-89d7-4572eeaca4fb",
    "842362d0-39d6-4f2a-a00f-c35571c680ea",
    "79cf3cb1-3bfb-4731-a89c-b63526a458ca",
    "13037d3a-f80f-4799-b5ec-5f537ffbf0e5",
  ]) assert.ok(dispatcher.includes(id), `Missing Resend template ID ${id}`);

  assert.match(dispatcher, /KHAAVIO_EMAIL_DISPATCH_SECRET/);
  assert.match(dispatcher, /x-khaavio-dispatch-secret/);
  assert.match(dispatcher, /api\.resend\.com\/emails/);
  assert.match(dispatcher, /template:\s*\{/);
  assert.match(dispatcher, /Idempotency-Key/);
  assert.match(dispatcher, /khaavio_claim_email_outbox/);
  assert.match(dispatcher, /khaavio_finish_email_outbox/);
  assert.match(config, /\[functions\.khaavio-email-dispatch\][\s\S]*?verify_jwt = false/);
});

test("Razorpay email dispatch remains behind raw signature and captured amount validation", () => {
  assert.match(webhook, /const rawBody = await req\.text\(\)/);
  assert.match(webhook, /RAZORPAY_WEBHOOK_SECRET/);
  assert.match(webhook, /paymentStatus !== "captured"/);
  assert.match(webhook, /amountPaise !== expectedPaise/);
  assert.match(webhook, /khaavio_enqueue_platform_email/);
  assert.match(webhook, /subscription-charge:\${paymentId}/);
  assert.match(webhook, /subscription_activated/);
  assert.match(webhook, /subscription_renewal_successful/);
});

test("runbook separates staging review from production deployment and documents Vault/Cron setup", () => {
  assert.match(runbook, /staging Supabase project/i);
  assert.match(runbook, /KHAAVIO_EMAIL_DISPATCH_SECRET/);
  assert.match(runbook, /vault\.create_secret/);
  assert.match(runbook, /cron\.schedule/);
  assert.match(runbook, /Manual\/offline renewal approvals do not send/i);
});


test("GitHub Actions compiles the email migration on disposable PostgreSQL", () => {
  assert.match(workflow, /platform_email_migration_sql/);
  assert.match(workflow, /tests\/sql\/khaavio-platform-email-fixture\.sql/);
  assert.match(workflow, /tests\/sql\/khaavio-platform-email-verify\.sql/);
  assert.match(sqlFixture, /create table public\.restaurants/i);
  assert.match(sqlFixture, /create table public\.restaurant_subscriptions/i);
  assert.match(sqlVerify, /trial_started/);
  assert.match(sqlVerify, /trial_ending_reminder/);
  assert.match(sqlVerify, /subscription_renewal_reminder/);
  assert.match(sqlVerify, /subscription_cancelled/);
  assert.match(sqlVerify, /subscription_payment_issue/);
  assert.match(sqlVerify, /subscription_expired/);
});
