import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const menuPath = resolve(here, "../src/pages/PublicMenu.jsx");
const menu = readFileSync(menuPath, "utf8");

test("reviews are removed from the menu screen and shown in the dedicated review tab", () => {
  assert.match(menu, /activeBottomTab === "reviews"[\s\S]*?<PublicReviewsFeedback/);
  assert.doesNotMatch(menu, /public-reviews-table-placement/);
  assert.doesNotMatch(menu, /restaurant\?\.id && !tableContext && \(\s*<PublicReviewsFeedback/);
});

test("only one feedback widget is mounted in the dedicated review screen", () => {
  assert.equal((menu.match(/<PublicReviewsFeedback/g) || []).length, 1);
  assert.match(menu, /className="public-menu-tab-view public-menu-reviews-view"[\s\S]*?<PublicReviewsFeedback/);
});
