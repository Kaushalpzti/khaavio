import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizeTableNumber } from "../src/lib/tableNumber.js";

const kitchenSource = readFileSync(
  new URL("../src/pages/KitchenDisplay.jsx", import.meta.url),
  "utf8",
);

test("normalizes numeric and string table numbers for display", () => {
  assert.equal(normalizeTableNumber(4), "4");
  assert.equal(normalizeTableNumber("  4  "), "4");
  assert.equal(normalizeTableNumber("Table 4"), "4");
  assert.equal(normalizeTableNumber("table 12"), "12");
  assert.equal(normalizeTableNumber("T-04"), "T-04");
});

test("empty or missing table numbers do not crash the kitchen display", () => {
  assert.equal(normalizeTableNumber(null), "");
  assert.equal(normalizeTableNumber(undefined), "");
  assert.equal(normalizeTableNumber("   "), "");
});

test("KitchenDisplay imports and uses the normalizer it calls", () => {
  assert.match(
    kitchenSource,
    /import \{ normalizeTableNumber \} from ["']\.\.\/lib\/tableNumber\.js?["'];/,
  );
  assert.match(kitchenSource, /normalizeTableNumber\(order\.tableNumber\)/);
});
