import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync("src/pages/Subscription.jsx", "utf8");
const css = readFileSync("src/pages/Subscription.css", "utf8");

test("subscription checkout does not use the native browser confirm dialog", () => {
  assert.doesNotMatch(page, /window\.confirm\s*\(/);
  assert.match(page, /const \[checkoutPlan, setCheckoutPlan\] = useState\(null\)/);
  assert.match(page, /onClick=\{\(\) => setCheckoutPlan\(availablePlan\)\}/);
});

test("checkout confirmation is a branded accessible dialog with plan and recurring amount", () => {
  assert.match(page, /className="subscription-checkout-backdrop"/);
  assert.match(page, /role="dialog"/);
  assert.match(page, /aria-modal="true"/);
  assert.match(page, /aria-labelledby="subscription-checkout-title"/);
  assert.match(page, /\{checkoutPlan\.name\}/);
  assert.match(page, /formatPrice\(checkoutPlan\.price_inr, checkoutPlan\.billing_interval\)/);
  assert.match(page, /This is a recurring subscription/);
  assert.match(page, /Continue to secure checkout/);
  assert.match(page, /setCheckoutPlan\(null\)/);
  assert.match(page, /requestPlan\(checkoutPlan\)/);
});

test("confirmation modal has responsive styling and visible keyboard focus", () => {
  assert.match(css, /\.subscription-checkout-backdrop\s*\{/);
  assert.match(css, /@media \(max-width: 520px\)/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /prefers-reduced-motion/);
});
