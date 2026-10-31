import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const launcher = read("src/components/PublicHelpLauncher.jsx");
const launcherCss = read("src/components/PublicHelpLauncher.css");
const menu = read("src/pages/PublicMenu.jsx");
const menuCss = read("src/pages/PublicMenu.css");
const ask = read("src/components/AskKhaavio.jsx");

test("one icon-only Help bubble opens the help sheet and AI chat separately", () => {
  assert.ok(launcher.includes("<Sparkles size={21}"));
  assert.ok(launcher.includes('title="Get Help"'));
  assert.ok(launcher.includes('role="dialog"'));
  assert.ok(launcher.includes("How can we help you?"));
  assert.ok(launcher.includes("onOpenAI"));
  assert.ok(menu.includes('onOpenAI={() => setActiveFloatingHelpPanel("concierge")}'));
  assert.ok(menu.includes('externalOpen={activeFloatingHelpPanel === "concierge"}'));
});

test("the Help sheet handles service actions while Ask Khaavio stays menu-focused", () => {
  assert.ok(launcher.includes("create_public_table_service_request"));
  assert.ok(launcher.includes('"waiter"'));
  assert.ok(launcher.includes('"water"'));
  assert.ok(launcher.includes('"bill"'));
  assert.ok(launcher.includes('"cutlery"'));
  assert.ok(launcher.includes('"other"'));
  assert.doesNotMatch(ask, /sendServiceRequest|tableActions|create_public_table_service_request/);
  assert.ok(ask.includes("ask-khaavio-concierge-prompts"));
  assert.doesNotMatch(menu, /<PublicTableService/);
});

test("the Help bubble remains round and above the mobile navigation", () => {
  assert.match(launcherCss, /width:\s*46px;[\s\S]*height:\s*46px/);
  assert.match(launcherCss, /border-radius:\s*50%/);
  assert.match(menuCss, /\.public-menu-bottom-navigation~\.public-help-launcher\s*\{[\s\S]*?bottom:\s*calc\(78px \+ env\(safe-area-inset-bottom, 0px\)\)/);
  assert.match(menuCss, /\.public-menu-bottom-navigation~\.public-help-launcher\.is-raised\s*\{[\s\S]*?bottom:\s*calc\(150px \+ env\(safe-area-inset-bottom, 0px\)\)/);
});

test("AI chat panel remains above bottom navigation and sticky cart", () => {
  assert.match(menuCss, /\.public-menu-bottom-navigation~\.ask-khaavio-root \.ask-khaavio-panel\s*\{[\s\S]*?bottom:\s*calc\(145px \+ env\(safe-area-inset-bottom, 0px\)\)/);
  assert.match(menuCss, /\.public-menu-bottom-navigation~\.ask-khaavio-root\.is-raised \.ask-khaavio-panel\s*\{[\s\S]*?bottom:\s*calc\(217px \+ env\(safe-area-inset-bottom, 0px\)\)/);
});
