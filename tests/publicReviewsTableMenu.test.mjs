import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const menuPath = resolve(here, "../src/pages/PublicMenu.jsx");
const menu = readFileSync(menuPath, "utf8");

test("regular public menu keeps reviews in the footer", () => {
  assert.match(
    menu,
    /\{restaurant\?\.id && !tableContext && \(\s*<PublicReviewsFeedback[\s\S]*?googleReviewUrl=\{restaurant\.google_review_url\}/,
  );
});

test("validated table QR menu displays reviews directly after menu items", () => {
  assert.match(
    menu,
    /\{restaurant\?\.id && tableContext && \(\s*<div className="public-reviews-table-placement">\s*<PublicReviewsFeedback[\s\S]*?googleReviewUrl=\{restaurant\.google_review_url\}/,
  );
  const tableReviewIndex = menu.indexOf('className="public-reviews-table-placement"');
  const cartIndex = menu.indexOf("{isCartOpen && (");
  assert.ok(tableReviewIndex > -1 && tableReviewIndex < cartIndex);
});

test("one feedback widget is rendered for each menu mode", () => {
  assert.equal((menu.match(/<PublicReviewsFeedback/g) || []).length, 2);
});
