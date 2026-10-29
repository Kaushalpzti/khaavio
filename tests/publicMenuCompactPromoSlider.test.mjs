import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const menu = readFileSync(new URL("../src/pages/PublicMenu.jsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/pages/PublicMenuExperience.css", import.meta.url), "utf8");

test("oversized intro hero is replaced by a compact three-slide food banner", () => {
  assert.match(menu, /className="public-menu-promo-slider"/);
  assert.match(menu, /const fallbackPromoSlides = \[/);
  assert.match(menu, /uploadedPromoSlides\.length \? uploadedPromoSlides : fallbackPromoSlides/);
  assert.match(menu, /const slideCount = menuBanners\.length \|\| 3/);
  assert.doesNotMatch(menu, /className="public-menu-hero"/);
  assert.doesNotMatch(menu, /public-menu-hero-status/);
  assert.match(styles, /\.public-menu-promo-slider\s*\{/);
  assert.match(styles, /height: clamp\(130px, 40vw, 151px\)/);
});

test("banner slides use real menu photos and do not invent discount prices", () => {
  assert.match(menu, /promoImageItems = items\.filter\(\(item\) => Boolean\(item\.image_url\)\)/);
  assert.match(menu, /imageItem: promoImageItems\[0\]/);
  assert.match(menu, /Fresh favourites, right at your table\./);
  assert.doesNotMatch(menu, /[0-9]+% OFF|Flat ₹|Save ₹[0-9]/i);
});

test("promo slider has accessible manual controls and auto-rotation pauses outside Menu", () => {
  assert.match(menu, /aria-label="Choose banner"/);
  assert.match(menu, /aria-label=\{`Show banner \$\{index \+ 1\}`\}/);
  assert.match(menu, /if \(activeBottomTab !== "menu"\) return undefined/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
});

test("search and categories appear before the Popular dishes heading", () => {
  const searchAt = menu.indexOf('className="public-menu-search"');
  const categoriesAt = menu.indexOf('className="public-menu-categories"');
  const popularAt = menu.indexOf('className="public-menu-section-heading"');
  const gridAt = menu.indexOf('className="public-menu-grid"');
  assert.ok(searchAt > 0 && categoriesAt > searchAt && popularAt > categoriesAt && gridAt > popularAt);
  assert.match(menu, /<h2>Popular dishes<\/h2>/);
  assert.match(menu, /See all <ChevronRight/);
  assert.match(styles, /\.public-menu-section-heading/);
});
