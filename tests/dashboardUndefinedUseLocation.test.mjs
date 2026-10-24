import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const dashboard = readFileSync(new URL("../src/pages/Dashboard.jsx", import.meta.url), "utf8");

test("Dashboard does not call an undefined useLocation hook", () => {
  assert.doesNotMatch(dashboard, /\buseLocation\s*\(/);
});
