import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");
const migration = read("supabase/migrations/20261028060000_guest_billing_conflict_http_status.sql");
const fixture = read("tests/sql/guest-billing-conflict-fixture.sql");
const workflow = read(".github/workflows/khaavio-ci.yml");
const testGuide = read("docs/guest-billing-conflict-local-test.md");

test("expected guest-billing conflicts use HTTP 409 SQLSTATEs, not internal-error SQLSTATEs", () => {
  assert.match(
    migration,
    /This guest bill is no longer open\. Open My Bill and start a new bill before ordering again\.' USING ERRCODE = 'PT409'/,
  );
  assert.match(
    migration,
    /Complete or cancel all orders for this guest before generating the final bill\.' USING ERRCODE = 'PT409'/,
  );
  assert.equal([...migration.matchAll(/USING ERRCODE = 'PT409'/g)].length, 2);
  assert.doesNotMatch(
    migration,
    /(?:This guest bill is no longer open|Complete or cancel all orders for this guest before generating the final bill\.)[^;]*USING ERRCODE = '55000'/,
  );
});

test("GitHub CI validates the migration on disposable PostgreSQL without requiring local Docker", () => {
  assert.match(workflow, /guest_billing_migration_sql:/);
  assert.match(workflow, /image: postgres:17/);
  assert.match(workflow, /tests\/sql\/guest-billing-conflict-fixture\.sql/);
  assert.match(workflow, /psql -v ON_ERROR_STOP=1 -f supabase\/migrations\/20261028060000_guest_billing_conflict_http_status\.sql/);
  assert.match(workflow, /strpos\(v_order_body, 'PT409'\)/);
  assert.match(workflow, /strpos\(v_finalize_body, 'PT409'\)/);
  assert.match(fixture, /CREATE ROLE anon NOLOGIN/);
  assert.match(fixture, /CREATE ROLE authenticated NOLOGIN/);
  assert.match(fixture, /CREATE TABLE public\.table_session_tabs/);
  assert.ok(testGuide.toLowerCase().includes("do **not** need docker desktop"));
  assert.doesNotMatch(workflow, /db reset --linked|db push|migration repair/i);
});
