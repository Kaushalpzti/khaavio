import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const publicMenu = readFileSync(new URL("../src/pages/PublicMenu.jsx", import.meta.url), "utf8");
const menuManager = readFileSync(new URL("../src/pages/MenuManager.jsx", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/20261030100000_public_menu_food_discovery.sql", import.meta.url), "utf8");
const publicStyles = readFileSync(new URL("../src/pages/PublicMenuExperience.css", import.meta.url), "utf8");

test("menu items have explicit food type, spice, Jain and allergen metadata", () => {
  assert.match(migration, /ADD COLUMN IF NOT EXISTS food_type text NOT NULL DEFAULT 'unspecified'/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS spice_level text NOT NULL DEFAULT 'unspecified'/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS is_jain_friendly boolean NOT NULL DEFAULT false/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS allergens text\[\] NOT NULL DEFAULT ARRAY\[\]::text\[\]/);
  assert.match(migration, /menu_items_food_type_check/);
  assert.match(migration, /menu_items_spice_level_check/);
  assert.match(migration, /menu_items_allergens_check/);
});

test("public menu snapshot exposes only the new, allowlisted discovery fields", () => {
  assert.match(migration, /'food_type', m\.food_type/);
  assert.match(migration, /'spice_level', m\.spice_level/);
  assert.match(migration, /'is_jain_friendly', m\.is_jain_friendly/);
  assert.match(migration, /'allergens', m\.allergens/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.khaavio_public_restaurant_menu\(text\) FROM PUBLIC/);
});

test("restaurant menu editor saves and imports food discovery metadata", () => {
  assert.match(menuManager, /food_type: "unspecified"/);
  assert.match(menuManager, /food_type: form\.food_type/);
  assert.match(menuManager, /spice_level: form\.spice_level/);
  assert.match(menuManager, /is_jain_friendly: form\.is_jain_friendly/);
  assert.match(menuManager, /allergens: Array\.isArray\(form\.allergens\)/);
  assert.match(menuManager, /ALLERGEN_OPTIONS/);
  assert.match(menuManager, /food_type,spice_level,is_jain_friendly,allergens/);
});

test("public menu keeps dietary toggles compact and combines advanced filters", () => {
  assert.match(publicMenu, /dietFilter === "veg"/);
  assert.match(publicMenu, /dietFilter === "non_veg"/);
  for (const filter of ['value: "egg"', 'value: "vegan"', 'value: "jain"', 'value: "under_100"', 'value: "under_200"', 'value: "spicy"']) {
    assert.ok(publicMenu.includes(filter));
  }
  assert.match(publicMenu, /advancedFilters\.every/);
  assert.match(publicMenu, /item\.is_jain_friendly === true/);
  assert.match(publicMenu, /price <= 100/);
  assert.match(publicMenu, /price <= 200/);
  assert.match(publicMenu, /\["medium", "hot"\]\.includes\(spiceLevel\)/);
  assert.match(publicMenu, /role="dialog"/);
  assert.match(publicMenu, /Show \{visibleItems\.length\} dishes/);
  assert.ok(publicStyles.includes(".public-menu-diet-toggle"));
  assert.ok(publicStyles.includes(".public-menu-filter-sheet"));
});

test("public menu only renders explicitly entered dietary/allergen metadata", () => {
  assert.match(publicMenu, /FOOD_TYPE_LABELS\[item\.food_type\]/);
  assert.match(publicMenu, /item\.is_jain_friendly === true/);
  assert.match(publicMenu, /Array\.isArray\(item\.allergens\)/);
  assert.match(publicStyles, /\.public-menu-smart-filter-bar/);
  assert.match(publicStyles, /\.public-menu-food-tag/);
});


test("mobile menu controls use a search/filter row and a category/diet row", () => {
  const toolsStart = publicMenu.indexOf('className="public-menu-tools"');
  const searchStart = publicMenu.indexOf('className="public-menu-search"', toolsStart);
  const filterTrigger = publicMenu.indexOf('className={`public-menu-filter-trigger', toolsStart);
  const sheetStart = publicMenu.indexOf('{isFilterSheetOpen && (', toolsStart);
  const toolbarStart = publicMenu.indexOf('className="public-menu-category-toolbar"');
  const categoriesStart = publicMenu.indexOf('className="public-menu-categories"', toolbarStart);
  const dietStart = publicMenu.indexOf('className="public-menu-smart-filter-bar"', toolbarStart);
  const sectionStart = publicMenu.indexOf('className="public-menu-section-heading"', toolbarStart);

  assert.ok(toolsStart >= 0 && searchStart > toolsStart && filterTrigger > searchStart);
  assert.ok(sheetStart > filterTrigger);
  assert.ok(toolbarStart > sheetStart && categoriesStart > toolbarStart);
  assert.ok(dietStart > categoriesStart && sectionStart > dietStart);
  assert.match(publicMenu, /current === "veg" \? "all" : "veg"/);
  assert.match(publicMenu, /current === "non_veg" \? "all" : "non_veg"/);
  assert.match(publicStyles, /\.public-menu-category-toolbar/);
  assert.match(publicStyles, /\.public-menu-tools\s*\{[^}]*flex-direction:\s*row/s);
});
