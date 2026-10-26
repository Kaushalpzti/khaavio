import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/components/PublicTableService.css', import.meta.url), 'utf8');

test('desktop help bubble is stacked about 8px above Ask Khaavio', () => {
  assert.match(css, /bottom:\s*calc\(max\(22px,\s*env\(safe-area-inset-bottom\)\)\s*\+\s*50px\);/);
});

test('mobile help bubble is stacked about 8px above Ask Khaavio', () => {
  assert.match(css, /bottom:\s*calc\(max\(16px,\s*env\(safe-area-inset-bottom\)\)\s*\+\s*47px\);/);
});

test('sticky-cart state keeps both bubbles vertically stacked on desktop and mobile', () => {
  assert.match(css, /\.public-table-service\.is-raised\s+\.public-table-service-fab\s*\{\s*bottom:\s*calc\(144px\s*\+\s*env\(safe-area-inset-bottom\)\);\s*\}/);
  assert.match(css, /\.public-table-service\.is-raised\s+\.public-table-service-fab\s*\{\s*bottom:\s*calc\(133px\s*\+\s*env\(safe-area-inset-bottom\)\);\s*\}/);
});
