import test from "node:test";
import assert from "node:assert/strict";

import {
  calculateGstBreakdown,
  getGstTaxType,
  getIndianGstStateCode,
} from "../src/lib/gstBilling.js";

test("Indian state names resolve to GST state codes", () => {
  assert.equal(getIndianGstStateCode("Bihar"), "10");
  assert.equal(getIndianGstStateCode("NCT of Delhi"), "07");
  assert.equal(getIndianGstStateCode("Andhra Pradesh"), "37");
  assert.equal(getIndianGstStateCode("Dadra & Nagar Haveli and Daman & Diu"), "26");
  assert.equal(getIndianGstStateCode("Not a state"), null);
});

test("restaurant outlet place of supply selects CGST and SGST for same-state GSTIN", () => {
  assert.equal(getGstTaxType({ gstin: "10ABCDE1234F1Z5", placeOfSupplyState: "Bihar" }), "cgst_sgst");
});

test("a different supplier registration state selects IGST", () => {
  assert.equal(getGstTaxType({ gstin: "10ABCDE1234F1Z5", placeOfSupplyState: "Delhi" }), "igst");
});

test("exclusive GST adds tax after discounts and splits CGST/SGST equally", () => {
  const result = calculateGstBreakdown({ amount: 900, totalRate: 5, inclusive: false });
  assert.deepEqual(result, {
    taxableAmount: 900,
    taxAmount: 45,
    cgstRate: 2.5,
    cgstAmount: 22.5,
    sgstRate: 2.5,
    sgstAmount: 22.5,
    igstRate: 0,
    igstAmount: 0,
    grandTotal: 945,
    inclusive: false,
  });
});

test("inclusive GST is extracted from the listed total without increasing it", () => {
  const result = calculateGstBreakdown({ amount: 105, totalRate: 5, inclusive: true });
  assert.equal(result.taxableAmount, 100);
  assert.equal(result.taxAmount, 5);
  assert.equal(result.cgstAmount, 2.5);
  assert.equal(result.sgstAmount, 2.5);
  assert.equal(result.grandTotal, 105);
});

test("inter-state supplies use IGST only", () => {
  const result = calculateGstBreakdown({ amount: 100, totalRate: 18, taxType: "igst" });
  assert.equal(result.taxAmount, 18);
  assert.equal(result.igstRate, 18);
  assert.equal(result.igstAmount, 18);
  assert.equal(result.cgstAmount, 0);
  assert.equal(result.sgstAmount, 0);
  assert.equal(result.grandTotal, 118);
});

test("invalid rates and unknown tax types do not charge a customer", () => {
  const invalidRate = calculateGstBreakdown({ amount: 100, totalRate: 0 });
  const invalidMode = calculateGstBreakdown({ amount: 100, totalRate: 5, taxType: "unknown" });
  assert.equal(invalidRate.grandTotal, 100);
  assert.equal(invalidRate.taxAmount, 0);
  assert.equal(invalidMode.grandTotal, 100);
  assert.equal(invalidMode.taxAmount, 0);
});
