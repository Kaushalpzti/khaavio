import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const launcher = readFileSync(new URL("../src/components/PublicHelpLauncher.jsx", import.meta.url), "utf8");
const launcherCss = readFileSync(new URL("../src/components/PublicHelpLauncher.css", import.meta.url), "utf8");
const menu = readFileSync(new URL("../src/pages/PublicMenu.jsx", import.meta.url), "utf8");
const service = readFileSync(new URL("../src/components/PublicTableService.jsx", import.meta.url), "utf8");
const ask = readFileSync(new URL("../src/components/AskKhaavio.jsx", import.meta.url), "utf8");

test("public menu renders one shared floating help launcher for both support paths", () => {
  assert.equal((menu.match(/<PublicHelpLauncher\b/g) || []).length, 1);
  assert.match(menu, /showService=\{Boolean\(slug && tableToken && tableContext\?\.restaurant_id\)\}/);
  assert.match(menu, /showAI=\{canUseAskKhaavio\}/);
  assert.match(menu, /onSelectService=\{\(\) => setActiveFloatingHelpPanel\("service"\)\}/);
  assert.match(menu, /onSelectAI=\{\(\) => setActiveFloatingHelpPanel\("ai"\)\}/);
  assert.match(menu, /<PublicTableService[\s\S]*?launcherHidden[\s\S]*?externalOpen=\{activeFloatingHelpPanel === "service"\}/);
  assert.match(menu, /<AskKhaavio[\s\S]*?launcherHidden[\s\S]*?externalOpen=\{activeFloatingHelpPanel === "ai"\}/);
});

test("the shared launcher offers restaurant service and AI help from one menu", () => {
  assert.match(launcher, /className=\{\x60public-help-launcher/);
  assert.match(launcher, /How can we help\?/);
  assert.match(launcher, /Contact restaurant team/);
  assert.match(launcher, /Ask Khaavio/);
  assert.match(launcher, /aria-haspopup="dialog"/);
  assert.match(launcher, /aria-expanded=\{isOpen\}/);
  assert.match(launcher, /event\.key === "Escape"/);
});

test("child panels hide their own launchers when controlled by the shared help button", () => {
  assert.match(service, /launcherHidden = false/);
  assert.match(service, /!launcherHidden && !isOpen/);
  assert.match(service, /externalOpen/);
  assert.match(ask, /launcherHidden = false/);
  assert.match(ask, /!launcherHidden && !isOpen/);
  assert.match(ask, /externalOpen/);
});

test("one help bubble stays above the mobile safe area and moves up for the sticky cart", () => {
  assert.match(launcherCss, /\.public-help-launcher\s*\{[\s\S]*?position:\s*fixed/);
  assert.match(launcherCss, /\.public-help-launcher\.is-raised\s*\{\s*bottom:\s*calc\(94px\s*\+\s*env\(safe-area-inset-bottom\)\);/);
  assert.match(launcherCss, /@media \(max-width: 600px\)[\s\S]*?\.public-help-launcher\s*\{[\s\S]*?right:\s*12px/);
  assert.match(launcherCss, /\.public-help-launcher\.is-raised\s*\{\s*bottom:\s*calc\(86px\s*\+\s*env\(safe-area-inset-bottom\)\);/);
});
