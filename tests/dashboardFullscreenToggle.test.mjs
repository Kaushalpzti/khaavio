import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const layout = readFileSync(new URL("../src/components/RestaurantDashboardLayout.jsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/components/RestaurantDashboardLayout.css", import.meta.url), "utf8");

test("dashboard header exposes an accessible fullscreen toggle on desktop and mobile", () => {
  assert.match(layout, /function FullscreenToggle\(/);
  assert.match(layout, /<FullscreenToggle isFullscreen=\{isFullscreen\}/);
  assert.match(layout, /aria-label=\{label\}/);
  assert.match(layout, /document\.addEventListener\("fullscreenchange"/);
  assert.match(layout, /layoutRef\.current\.requestFullscreen\(\)/);
  assert.match(layout, /document\.exitFullscreen\(\)/);
  assert.match(layout, /ref=\{layoutRef\}/);
  assert.match(styles, /\.restaurant-dashboard-fullscreen-toggle/);
  assert.match(styles, /\.restaurant-dashboard-workspacebar\s*\{[^}]*justify-content:\s*space-between/);
});

test("fullscreen state follows the browser and supports Escape exit", () => {
  assert.match(layout, /setIsFullscreen\(document\.fullscreenElement === layoutRef\.current\)/);
  assert.match(layout, /document\.removeEventListener\("fullscreenchange"/);
  assert.match(layout, /disabled=\{!fullscreenSupported\}/);
});
