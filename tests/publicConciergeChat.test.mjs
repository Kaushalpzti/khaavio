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

test("public menu has one icon-only Help bubble and a separate popup", () => {
  assert.equal((menu.match(/<PublicHelpLauncher\b/g) || []).length, 1);
  assert.ok(launcher.includes("<Sparkles size={21}"));
  assert.ok(launcher.includes('title="Get Help"'));
  assert.ok(launcher.includes('aria-haspopup="dialog"'));
  assert.ok(launcher.includes('role="dialog"'));
  assert.ok(launcher.includes("How can we help you?"));
  assert.ok(launcherCss.includes("border-radius: 50%"));
  assert.ok(launcherCss.includes(".public-help-launcher-scrim"));
});

test("help popup includes waiter, water, bill, cutlery and custom service requests", () => {
  assert.ok(launcher.includes('sendServiceRequest("waiter")'));
  assert.ok(launcher.includes('value: "water"'));
  assert.ok(launcher.includes('value: "bill"'));
  assert.ok(launcher.includes('value: "cutlery"'));
  assert.ok(launcher.includes('sendServiceRequest("other", customNote)'));
  assert.ok(launcher.includes("create_public_table_service_request"));
  assert.ok(launcher.includes("p_slug: slug"));
  assert.ok(launcher.includes("p_table_token: tableToken"));
  assert.ok(menu.includes('onOpenAI={() => setActiveFloatingHelpPanel("concierge")}'));
  assert.ok(menu.includes('externalOpen={activeFloatingHelpPanel === "concierge"}'));
});

test("mobile Help bubble is positioned above bottom navigation and sticky cart", () => {
  assert.match(menuCss, /\.public-menu-bottom-navigation~\.public-help-launcher\s*\{\s*right:\s*12px;\s*bottom:\s*calc\(78px \+ env\(safe-area-inset-bottom, 0px\)\);/);
  assert.match(menuCss, /\.public-menu-bottom-navigation~\.public-help-launcher\.is-raised\s*\{\s*bottom:\s*calc\(150px \+ env\(safe-area-inset-bottom, 0px\)\);/);
  assert.ok(launcherCss.includes("max-height: min(88dvh,780px)"));
});

test("Ask Khaavio is a separate menu-focused chat with four quick prompts", () => {
  assert.ok(ask.includes("What is special today?"));
  assert.ok(ask.includes("Aaj kya special hai?"));
  assert.ok(ask.includes("usedWebResearch: result?.usedWebResearch === true"));
  assert.ok(ask.includes("General dish background checked online"));
  assert.doesNotMatch(ask, /sendServiceRequest|create_public_table_service_request|tableActions|showService/);
  assert.ok(ask.includes("ask-khaavio-concierge-prompts"));
  assert.ok(askCss.includes("Khaavio Concierge visual refresh"));
});

test("AI receives dietary/allergen metadata and keeps restaurant facts menu-grounded", () => {
  assert.match(ask, /\.slice\(0, 120\)/);
  assert.match(ask, /foodType: item\.food_type/);
  assert.match(ask, /spiceLevel: item\.spice_level/);
  assert.match(ask, /isJainFriendly: item\.is_jain_friendly === true/);
  assert.match(ask, /allergens: Array\.isArray\(item\.allergens\)/);
  assert.match(edge, /foodType/);
  assert.match(edge, /spiceLevel/);
  assert.match(edge, /isJainFriendly/);
  assert.match(edge, /allergens/);
  assert.match(edge, /80-150 words/);
  assert.match(edge, /sole authority for this restaurant's exact dish names, prices, availability/);
  assert.match(edge, /Never use generic web results to assert this restaurant's ingredients or allergen status/);
});


test("Ask Khaavio Edge Function returns whether browser research was requested", () => {
  assert.match(edge, /usedWebResearch:\s*useBrowserSearch/);
  assert.match(edge, /return respond\(\{ reply: reply\.slice\(0, 1200\), usedWebResearch: useBrowserSearch \}\)/);
});
