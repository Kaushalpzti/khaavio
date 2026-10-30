import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const launcher = read("src/components/PublicHelpLauncher.jsx");
const launcherCss = read("src/components/PublicHelpLauncher.css");
const ask = read("src/components/AskKhaavio.jsx");
const askCss = read("src/components/AskKhaavio.css");
const menu = read("src/pages/PublicMenu.jsx");
const menuCss = read("src/pages/PublicMenu.css");
const edge = read("supabase/functions/khaavio-ai-chat/index.ts");

test("public menu has one icon-only floating concierge launcher", () => {
  assert.equal((menu.match(/<PublicHelpLauncher\b/g) || []).length, 1);
  assert.match(launcher, /<LifeBuoy size=\{21\}/);
  assert.match(launcher, /aria-label="Open Khaavio Concierge"/);
  assert.match(launcher, /onClick=\{onOpen\}/);
  assert.doesNotMatch(launcher, /<span>Help<\/span>|Contact restaurant team|Ask Khaavio<\/strong>/);
  assert.match(launcherCss, /width:\s*46px;[\s\S]*height:\s*46px/);
});

test("mobile concierge icon is above the bottom nav and sticky cart", () => {
  assert.match(menuCss, /\.public-menu-bottom-navigation~\.public-help-launcher\s*\{\s*right:\s*12px;\s*bottom:\s*calc\(78px \+ env\(safe-area-inset-bottom, 0px\)\);/);
  assert.match(menuCss, /\.public-menu-bottom-navigation~\.public-help-launcher\.is-raised\s*\{\s*bottom:\s*calc\(150px \+ env\(safe-area-inset-bottom, 0px\)\);/);
});

test("public table assistance and AI run in one concierge chat, with no second service dialog", () => {
  assert.doesNotMatch(menu, /import PublicTableService/);
  assert.doesNotMatch(menu, /<PublicTableService/);
  assert.match(menu, /<AskKhaavio[\s\S]*?aiEnabled=\{canUseAskKhaavio\}[\s\S]*?showService=\{Boolean\(slug && tableToken && tableContext\?\.restaurant_id\)\}/);
  assert.match(ask, /create_public_table_service_request/);
  assert.match(ask, /Call waiter|Waiter bulao/);
  assert.match(ask, /Request bill|Bill mango/);
  assert.match(ask, /Water/);
  assert.match(ask, /setMessages\(\(current\) => \[\.\.\.current, \{/);
});

test("AI receives the full public menu metadata needed for grounded dish answers", () => {
  assert.match(ask, /\.slice\(0, 120\)/);
  assert.match(ask, /foodType: item\.food_type/);
  assert.match(ask, /spiceLevel: item\.spice_level/);
  assert.match(ask, /isJainFriendly: item\.is_jain_friendly === true/);
  assert.match(ask, /allergens: Array\.isArray\(item\.allergens\)/);
  assert.match(edge, /foodType/);
  assert.match(edge, /spiceLevel/);
  assert.match(edge, /isJainFriendly/);
  assert.match(edge, /allergens/);
});

test("dish answers are more detailed while exact restaurant facts remain menu-grounded", () => {
  assert.match(edge, /80-150 words/);
  assert.match(edge, /sole authority for this restaurant's exact dish names, prices, availability/);
  assert.match(edge, /Never invent or infer a restaurant-specific recipe/);
  assert.match(edge, /Never use generic web results to assert this restaurant's ingredients or allergen status/);
  assert.match(askCss, /Khaavio Concierge visual refresh/);
});
