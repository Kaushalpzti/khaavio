import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const launcher = read("src/components/PublicHelpLauncher.jsx");
const launcherCss = read("src/components/PublicHelpLauncher.css");
const menu = read("src/pages/PublicMenu.jsx");
const menuCss = read("src/pages/PublicMenu.css");
const concierge = read("src/components/AskKhaavio.jsx");

test("there is only one icon-only Help launcher and it opens the single concierge", () => {
  assert.match(launcher, /<LifeBuoy size=\{21\}/);
  assert.match(launcher, /aria-label="Open Khaavio Concierge"/);
  assert.match(launcher, /onClick=\{onOpen\}/);
  assert.doesNotMatch(launcher, /How can we help\?|Contact restaurant team|<span>Help<\/span>/);
  assert.match(menu, /<PublicHelpLauncher[\s\S]*?onOpen=\{\(\) => setActiveFloatingHelpPanel\("concierge"\)\}/);
  assert.match(menu, /<AskKhaavio[\s\S]*?externalOpen=\{activeFloatingHelpPanel === "concierge"\}/);
});

test("the concierge combines dish prompts and table actions inside one chat strip", () => {
  assert.match(concierge, /ask-khaavio-concierge-prompts/);
  assert.match(concierge, /copy\.tableActions\.map/);
  assert.match(concierge, /sendServiceRequest\(action\.value\)/);
  assert.doesNotMatch(concierge, /className="ask-khaavio-table-actions"/);
  assert.doesNotMatch(menu, /<PublicTableService/);
});

test("the icon launcher is round, icon-only and above the mobile bottom navigation", () => {
  assert.match(launcherCss, /width:\s*46px;[\s\S]*height:\s*46px/);
  assert.match(launcherCss, /border-radius:\s*50%/);
  assert.match(menuCss, /\.public-menu-bottom-navigation~\.public-help-launcher\s*\{[\s\S]*?bottom:\s*calc\(78px \+ env\(safe-area-inset-bottom, 0px\)\)/);
  assert.match(menuCss, /\.public-menu-bottom-navigation~\.public-help-launcher\.is-raised\s*\{[\s\S]*?bottom:\s*calc\(150px \+ env\(safe-area-inset-bottom, 0px\)\)/);
});

test("the concierge chat panel also sits above the bottom navigation and sticky cart", () => {
  assert.match(menuCss, /\.public-menu-bottom-navigation~\.ask-khaavio-root \.ask-khaavio-panel\s*\{[\s\S]*?bottom:\s*calc\(145px \+ env\(safe-area-inset-bottom, 0px\)\)/);
  assert.match(menuCss, /\.public-menu-bottom-navigation~\.ask-khaavio-root\.is-raised \.ask-khaavio-panel\s*\{[\s\S]*?bottom:\s*calc\(217px \+ env\(safe-area-inset-bottom, 0px\)\)/);
});
