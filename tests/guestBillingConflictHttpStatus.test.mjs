import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");
const migration = read("supabase/migrations/20261028060000_guest_billing_conflict_http_status.sql");
const testScript = read("scripts/test-guest-billing-conflict-migration.ps1");
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

test("local SQL replay uses only a disposable Supabase stack and never pushes/resets production", () => {
  assert.match(testScript, /local-schema-baseline\.sql/);
  assert.match(testScript, /20261028060000_guest_billing_conflict_http_status\.sql/);
  assert.match(testScript, /\$SupabaseCli start/);
  assert.match(testScript, /db reset --local --yes/);
  assert.match(testScript, /stop --no-backup/);
  assert.doesNotMatch(testScript, /db reset --linked|db push|migration repair/i);
  assert.match(testGuide, /schema-only/);
  assert.match(testGuide, /does not reset, push to, or modify the linked hosted project/);
});
