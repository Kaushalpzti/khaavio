import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/RestaurantWorkspaceDesign.css', import.meta.url), 'utf8');

test('mobile workspace bar is explicitly displayed at phone widths', () => {
  const mediaStart = css.indexOf('@media (max-width: 780px) {');
  assert.notEqual(mediaStart, -1, 'mobile breakpoint should exist');
  const nextMedia = css.indexOf('@media ', mediaStart + 1);
  const mobileBlock = css.slice(mediaStart, nextMedia === -1 ? css.length : nextMedia);
  assert.match(mobileBlock, /\.restaurant-dashboard-mobilebar\s*\{[^}]*display:\s*flex\s*;/s);
});

test('mobile menu trigger has a visible button style in the responsive block', () => {
  const mediaStart = css.indexOf('@media (max-width: 780px) {');
  const nextMedia = css.indexOf('@media ', mediaStart + 1);
  const mobileBlock = css.slice(mediaStart, nextMedia === -1 ? css.length : nextMedia);
  assert.match(mobileBlock, /\.restaurant-dashboard-menu-trigger\s*\{[^}]*width:\s*39px/s);
});
