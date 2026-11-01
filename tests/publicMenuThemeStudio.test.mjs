import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  DEFAULT_PUBLIC_MENU_THEME_ID,
  PUBLIC_MENU_THEMES,
  getPublicMenuTheme,
  getPublicMenuThemeStyle,
  isValidPublicMenuThemeId,
} from "../src/lib/publicMenuThemes.js";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

function getRelativeLuminance(hex) {
  const channels = hex.match(/[0-9A-F]{2}/gi).map((part) => parseInt(part, 16) / 255);
  const [red, green, blue] = channels.map((value) =>
    value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  );
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function getContrastRatio(first, second) {
  const [lighter, darker] = [getRelativeLuminance(first), getRelativeLuminance(second)]
    .sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

test("the Public Menu Studio includes twelve curated palettes with complete colour tokens", () => {
  assert.equal(PUBLIC_MENU_THEMES.length, 12);
  assert.equal(new Set(PUBLIC_MENU_THEMES.map((theme) => theme.id)).size, 12);
  for (const theme of PUBLIC_MENU_THEMES) {
    assert.ok(theme.name);
    assert.ok(theme.description);
    assert.ok(theme.swatches.length >= 5);
    for (const colour of Object.values(theme.colors)) {
      assert.match(colour, /^#[0-9A-F]{6}$/i, theme.id + " has an invalid colour");
    }
  }
});


test("palette text, muted labels and primary action labels meet WCAG AA contrast", () => {
  for (const theme of PUBLIC_MENU_THEMES) {
    assert.ok(
      getContrastRatio(theme.colors.text, theme.colors.surface) >= 4.5,
      theme.id + " text must remain readable on its surface"
    );
    assert.ok(
      getContrastRatio(theme.colors.muted, theme.colors.surface) >= 4.5,
      theme.id + " muted copy must remain readable on its surface"
    );
    assert.ok(
      getContrastRatio(theme.colors.onAccent, theme.colors.accent) >= 4.5,
      theme.id + " accent button label must remain readable"
    );
    assert.ok(
      getContrastRatio(theme.colors.onPrimary, theme.colors.primary) >= 4.5,
      theme.id + " primary label must remain readable"
    );
  }
});

test("the original Khaavio appearance remains the default and unknown IDs fail safely", () => {
  assert.equal(DEFAULT_PUBLIC_MENU_THEME_ID, "original");
  assert.equal(isValidPublicMenuThemeId("original"), true);
  assert.equal(getPublicMenuTheme("original"), null);
  assert.equal(getPublicMenuTheme("not-a-theme"), null);
  assert.equal(isValidPublicMenuThemeId("not-a-theme"), false);
});

test("theme styles expose the Public Menu design tokens without changing QR modules", () => {
  const style = getPublicMenuThemeStyle("warm-mocha");
  assert.equal(style["--khaavio-menu-primary"], "#1A120E");
  assert.equal(style["--khaavio-menu-accent"], "#A88462");
  assert.equal(style["--khaavio-menu-background"], "#1A120E");
  for (const theme of PUBLIC_MENU_THEMES) {
    assert.ok(theme.colors.onAccent);
    assert.ok(theme.colors.onPrimary);
  }
  assert.equal(getPublicMenuThemeStyle("original"), undefined);

  const page = read("../src/pages/PublicMenu.jsx");
  const qrPage = read("../src/pages/TableQRStudio.jsx");
  const app = read("../src/App.jsx");
  const navigation = read("../src/components/RestaurantDashboardLayout.jsx");
  assert.match(page, /khaavio_public_restaurant_menu_theme/);
  assert.match(page, /khaavio:public-menu-theme-preview/);
  assert.match(page, /getThemePreviewParentOrigin/);
  const appearance = read("../src/pages/MenuAppearance.jsx");
  assert.match(appearance, /PUBLIC_SITE_URL/);
  assert.match(appearance, /publicPreviewOrigin \+ "\/menu\//);
  assert.match(app, /path="\/dashboard\/menu-appearance"/);
  assert.match(navigation, /Public menu design/);
  assert.doesNotMatch(page, /TableQRStudio/);
  assert.match(qrPage, /table-qr/);
});

test("theme settings are isolated per restaurant and public reads return only the selected theme ID", () => {
  const migration = read("../supabase/migrations/20261101110000_public_menu_theme_studio.sql");
  const dashboard = read("../src/pages/MenuAppearance.jsx");
  assert.match(migration, /restaurant_id uuid PRIMARY KEY REFERENCES public\.restaurants\(id\)/);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /restaurant_public_menu_themes_owner_insert/);
  assert.match(migration, /khaavio_public_restaurant_menu_theme\(p_slug text\)/);
  assert.match(dashboard, /eq\("owner_id", authData\.user\.id\)/);
  assert.match(dashboard, /onConflict: "restaurant_id"/);
  assert.match(dashboard, /khaavio:public-menu-theme-preview-ready/);
});
