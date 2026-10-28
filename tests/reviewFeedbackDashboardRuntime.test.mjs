import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("../src/pages/ReviewFeedbackDashboard.jsx", import.meta.url),
  "utf8",
);

test("review feedback loader stores the rows returned by Supabase", () => {
  assert.match(source, /if \(feedbackError\) throw feedbackError;[\s\S]*?setFeedback\(data \|\| \[\]\);/);
  assert.doesNotMatch(source, /setFeedback\(nextFeedback\)/);
});
