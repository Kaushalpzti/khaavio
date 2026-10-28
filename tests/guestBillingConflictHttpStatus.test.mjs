import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migration = readFileSync(
  path.join(root, "supabase/migrations/20261028060000_guest_billing_conflict_http_status.sql"),
  "utf8",
);

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
