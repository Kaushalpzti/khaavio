import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync("src/pages/Subscription.jsx", "utf8");

test("7-day trial price uses the locale-aware INR formatter", () => {
  assert.match(page, /\{formatCurrency\(0\)\}\s*<span>\s*\/ 7 days\s*<\/span>/);
  assert.doesNotMatch(page, /\u00E2\u201A\u00B90/);
});

test("Growth recommendation badge has clean text encoding", () => {
  assert.match(page, /Best for growing cafes/);
  assert.doesNotMatch(page, /caf\u00C3\u00A9s/);
});

test("pricing footnote describes Razorpay checkout and server-confirmed activation", () => {
  assert.match(page, /Razorpay handles recurring checkout/);
  assert.match(page, /server-side verification of a captured payment/);
  assert.doesNotMatch(page, /payments are handled outside Khaavio and\s*activation is manual/i);
});

test("historical manual request rows are clearly separated from new online billing", () => {
  assert.match(page, /Previous manual requests/);
  assert.match(page, /Older manually reviewed requests remain visible here/);
  assert.doesNotMatch(page, /\u00C2\u00B7/);
});
