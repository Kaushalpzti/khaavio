import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  calculateGstBreakdown,
  getGstTaxType,
  getIndianGstStateCode,
} from "../src/lib/gstBilling.js";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("Indian state names resolve to GST state codes", () => {
  assert.equal(getIndianGstStateCode("Bihar"), "10");
  assert.equal(getIndianGstStateCode("NCT of Delhi"), "07");
  assert.equal(getIndianGstStateCode("Andhra Pradesh"), "37");
  assert.equal(getIndianGstStateCode("Dadra & Nagar Haveli and Daman & Diu"), "26");
  assert.equal(getIndianGstStateCode("Not a state"), null);
});

test("supplier GSTIN state and restaurant outlet state select CGST-SGST or IGST", () => {
  assert.equal(getGstTaxType({ gstin: "10ABCDE1234F1Z5", placeOfSupplyState: "Bihar" }), "cgst_sgst");
  assert.equal(getGstTaxType({ gstin: "10ABCDE1234F1Z5", placeOfSupplyState: "Delhi" }), "igst");
  assert.equal(getGstTaxType({ gstin: "99ABCDE1234F1Z5", placeOfSupplyState: "Bihar" }), null);
});

test("exclusive GST is added after discounts and split into equal CGST and SGST", () => {
  const result = calculateGstBreakdown({ amount: 900, totalRate: 5, inclusive: false });
  assert.deepEqual(result, {
    taxableAmount: 900, taxAmount: 45,
    cgstRate: 2.5, cgstAmount: 22.5,
    sgstRate: 2.5, sgstAmount: 22.5,
    igstRate: 0, igstAmount: 0,
    grandTotal: 945, inclusive: false,
  });
});

test("inclusive GST is extracted without increasing the menu total", () => {
  const result = calculateGstBreakdown({ amount: 105, totalRate: 5, inclusive: true });
  assert.equal(result.taxableAmount, 100);
  assert.equal(result.taxAmount, 5);
  assert.equal(result.cgstAmount, 2.5);
  assert.equal(result.sgstAmount, 2.5);
  assert.equal(result.grandTotal, 105);
});

test("inter-state supply uses IGST only", () => {
  const result = calculateGstBreakdown({ amount: 100, totalRate: 18, taxType: "igst" });
  assert.equal(result.igstRate, 18);
  assert.equal(result.igstAmount, 18);
  assert.equal(result.cgstAmount, 0);
  assert.equal(result.sgstAmount, 0);
  assert.equal(result.grandTotal, 118);
});

test("invalid rate or tax type cannot silently add tax", () => {
  const badRate = calculateGstBreakdown({ amount: 100, totalRate: 101 });
  const badType = calculateGstBreakdown({ amount: 100, totalRate: 5, taxType: "unknown" });
  assert.equal(badRate.taxAmount, 0);
  assert.equal(badRate.grandTotal, 100);
  assert.equal(badType.taxAmount, 0);
  assert.equal(badType.grandTotal, 100);
});

test("migration snapshots supplier, tax components and preserves legacy invoices", () => {
  const migration = read("../supabase/migrations/20261101150000_complete_gst_billing.sql");
  assert.match(migration, /gst_registration_consistency_check/);
  assert.match(migration, /gst_supplier_name_snapshot/);
  assert.match(migration, /gst_supplier_address_snapshot/);
  assert.match(migration, /khaavio_next_gst_document_number/);
  assert.match(migration, /khaavio_public_invoice_tax_snapshot/);
  assert.equal((migration.match(/CREATE OR REPLACE FUNCTION public\.khaavio_gst_state_code/g) || []).length, 1);
  assert.equal((migration.match(/COMMIT;/g) || []).length, 1);
});
