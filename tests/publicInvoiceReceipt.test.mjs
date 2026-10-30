import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const payment = read("src/components/PublicInvoicePayment.jsx");
const css = read("src/components/PublicInvoicePayment.css");
const menu = read("src/pages/PublicMenu.jsx");

test("paid customer bills expose a receipt download / Save as PDF action", () => {
  assert.match(payment, /invoice\.payment_status === "paid"/);
  assert.match(payment, /Download bill \/ Save PDF/);
  assert.match(payment, /printPaidReceipt/);
  assert.match(payment, /window\.print\(\)/);
  assert.match(payment, /public-invoice-receipt-print-surface/);
  assert.match(payment, /invoice\.invoice_number/);
  assert.match(payment, /invoice\.payment_method/);
  assert.match(payment, /invoice\.paid_at/);
});

test("customer receipt contains item lines, discount, GST and paid total", () => {
  assert.match(payment, /receiptItems/);
  assert.match(payment, /item\.item_name/);
  assert.match(payment, /invoice\.subtotal_amount/);
  assert.match(payment, /invoice\.discount_amount/);
  assert.match(payment, /invoice\.tax_amount/);
  assert.match(payment, /TOTAL PAID/);
  assert.match(payment, /tableNumber/);
  assert.match(payment, /restaurantName/);
});

test("combined and guest bills pass the correct invoice snapshot lines to the receipt", () => {
  assert.match(menu, /receiptItems=\{tableBillSnapshot\.items \|\| \[\]\}/);
  assert.match(menu, /receiptItems=\{\(guestTabSnapshot\.orders \|\| \[\]\)/);
  assert.match(menu, /filter\(\(order\) => order\.status !== "cancelled"\)/);
  assert.match(menu, /restaurantName=\{restaurant\?\.name\}/);
});

test("receipt print stylesheet isolates the receipt from the rest of the customer menu", () => {
  assert.match(css, /khaavio-printing-public-invoice/);
  assert.match(css, /visibility: hidden/);
  assert.match(css, /public-invoice-receipt-print-surface/);
});
