import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const thermal = read("src/lib/thermalPrinting.js");
const settings = read("src/pages/RestaurantSettings.jsx");
const kitchen = read("src/pages/KitchenDisplay.jsx");
const receipts = read("src/pages/OrderReceipts.jsx");
const sessions = read("src/pages/TableSessions.jsx");
const publicPayment = read("src/components/PublicInvoicePayment.jsx");
const publicPaymentCss = read("src/components/PublicInvoicePayment.css");
const migration = read("supabase/migrations/20261101090000_restaurant_thermal_receipt_settings.sql");

test("restaurant settings persist both supported thermal paper widths with 80mm default", () => {
  assert.match(migration, /receipt_paper_width text NOT NULL DEFAULT '80'/);
  assert.match(migration, /CHECK \(receipt_paper_width IN \('58', '80'\)\)/);
  assert.match(settings, /name="receipt_paper_width"/);
  assert.match(settings, /<option value="58">58mm/);
  assert.match(settings, /<option value="80">80mm/);
  assert.match(settings, /receipt_paper_width: form\.receipt_paper_width/);
});

test("Kitchen Display prints a per-order KOT using the saved width", () => {
  assert.match(kitchen, /printKitchenOrderTicket/);
  assert.match(kitchen, /Print KOT/);
  assert.match(kitchen, /restaurant\?\.receipt_paper_width/);
  const kot = thermal.slice(
    thermal.indexOf("export function printKitchenOrderTicket"),
    thermal.indexOf("export function printCustomerOrderReceipt"),
  );
  assert.match(kot, /KITCHEN ORDER TICKET/);
  assert.doesNotMatch(kot, /formatThermalPrice|Order total|TOTAL/);
  assert.match(thermal, /item\?\.selected_options/);
  assert.match(kot, /order\.notes/);
});

test("Customer order receipts print at 58mm or 80mm and support WhatsApp sharing", () => {
  assert.match(receipts, /printCustomerOrderReceipt/);
  assert.match(receipts, /buildOrderReceiptShareText/);
  assert.match(receipts, /getWhatsAppReceiptUrl/);
  assert.match(receipts, /Share receipt/);
  assert.match(receipts, /name, phone, contact_email, address, city, state, postal_code, receipt_paper_width/);
  assert.match(sessions, /setReceiptWidth\(restaurantData\.receipt_paper_width === "58" \? "58" : "80"\)/);
});

test("Public paid invoices receive the saved thermal width and share action", () => {
  assert.match(migration, /'receipt_paper_width'/);
  assert.match(publicPayment, /paymentSettings\?\.receipt_paper_width/);
  assert.match(publicPayment, /sharePaidReceipt/);
  assert.match(publicPaymentCss, /khaavio-printing-public-invoice-58/);
  assert.match(publicPaymentCss, /khaavio-printing-public-invoice-80/);
});

test("thermal print utility escapes dynamic text and configures the selected paper width", () => {
  assert.match(thermal, /function escapeHtml/);
  assert.match(thermal, /@page\{size:/);
  assert.match(thermal, /normalizeReceiptWidth/);
  assert.match(thermal, /window\.open/);
});
