import test from "node:test";
import assert from "node:assert/strict";
import { normalizeIndianMobilePhone, summarizeCustomerOrders } from "../src/lib/customerInsights.js";

test("normalizes valid Indian mobile numbers to a consistent +91 format", () => {
  assert.equal(normalizeIndianMobilePhone("9876543210"), "+919876543210");
  assert.equal(normalizeIndianMobilePhone("+91 98765-43210"), "+919876543210");
  assert.equal(normalizeIndianMobilePhone("919876543210"), "+919876543210");
});

test("rejects blank, malformed and non-Indian mobile numbers", () => {
  assert.equal(normalizeIndianMobilePhone(""), "");
  assert.equal(normalizeIndianMobilePhone("1234567890"), "");
  assert.equal(normalizeIndianMobilePhone("98765"), "");
  assert.equal(normalizeIndianMobilePhone("+1 202 555 0123"), "");
});

test("groups customers by normalized phone, excluding cancelled orders", () => {
  const customers = summarizeCustomerOrders([
    { customer_name: "Asha", customer_phone: "9876543210", status: "completed", total_amount: 250, created_at: "2026-10-25T10:00:00Z" },
    { customer_name: "Asha K", customer_phone: "+91 98765-43210", status: "pending", total_amount: 100, created_at: "2026-10-27T10:00:00Z" },
    { customer_name: "Ravi", customer_phone: "9123456789", status: "completed", total_amount: 180, created_at: "2026-10-26T10:00:00Z" },
    { customer_name: "Asha", customer_phone: "9876543210", status: "cancelled", total_amount: 900, created_at: "2026-10-28T10:00:00Z" },
    { customer_name: "Anonymous", customer_phone: null, status: "completed", total_amount: 80, created_at: "2026-10-28T10:00:00Z" },
  ]);
  assert.equal(customers.length, 2);
  assert.deepEqual(customers[0], { phone: "+919876543210", name: "Asha K", orderCount: 2, completedSpend: 250, lastOrderAt: "2026-10-27T10:00:00.000Z", isRepeatCustomer: true });
  assert.equal(customers[1].phone, "+919123456789");
  assert.equal(customers[1].orderCount, 1);
  assert.equal(customers[1].completedSpend, 180);
  assert.equal(customers[1].isRepeatCustomer, false);
});
