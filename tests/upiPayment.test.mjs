import test from "node:test";
import assert from "node:assert/strict";
import {
  buildUpiIntentUrl,
  isValidUpiId,
  isValidUpiTransactionReference,
  normalizeUpiId,
} from "../src/lib/upiPayment.js";

test("normalizes and validates restaurant UPI IDs", () => {
  assert.equal(normalizeUpiId("  Cafe.Owner@OKAxis "), "cafe.owner@okaxis");
  assert.equal(isValidUpiId("cafe.owner@okaxis"), true);
  assert.equal(isValidUpiId("kaush-01@upi"), true);
  assert.equal(isValidUpiId("not-a-upi-id"), false);
  assert.equal(isValidUpiId("name@"), false);
});

test("validates UPI transaction references without accepting unsafe characters", () => {
  assert.equal(isValidUpiTransactionReference("123456789012"), true);
  assert.equal(isValidUpiTransactionReference("AB12-CD34"), true);
  assert.equal(isValidUpiTransactionReference("123"), false);
  assert.equal(isValidUpiTransactionReference("1234 5678"), false);
  assert.equal(isValidUpiTransactionReference("<script>"), false);
});

test("builds an amount-specific UPI intent for the restaurant invoice", () => {
  const intent = buildUpiIntentUrl({
    upiId: "cafe.owner@okaxis",
    payeeName: "The Green Table",
    amount: 850,
    invoiceNumber: "KHV-20261030-ABCD1234",
  });
  const parsed = new URL(intent);
  assert.equal(parsed.protocol, "upi:");
  assert.equal(parsed.hostname, "pay");
  assert.equal(parsed.searchParams.get("pa"), "cafe.owner@okaxis");
  assert.equal(parsed.searchParams.get("pn"), "The Green Table");
  assert.equal(parsed.searchParams.get("am"), "850.00");
  assert.equal(parsed.searchParams.get("cu"), "INR");
  assert.equal(parsed.searchParams.get("tn"), "Khaavio KHV-20261030-ABCD1234");
});

test("refuses invalid UPI intents instead of generating a misleading QR target", () => {
  assert.throws(() => buildUpiIntentUrl({
    upiId: "invalid",
    payeeName: "Restaurant",
    amount: 100,
    invoiceNumber: "KHV-1",
  }));
  assert.throws(() => buildUpiIntentUrl({
    upiId: "cafe.owner@okaxis",
    payeeName: "Restaurant",
    amount: 0,
    invoiceNumber: "KHV-1",
  }));
});
