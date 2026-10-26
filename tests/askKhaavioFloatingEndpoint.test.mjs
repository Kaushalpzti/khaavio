import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ask = readFileSync('src/components/AskKhaavio.jsx', 'utf8');
const askCss = readFileSync('src/components/AskKhaavio.css', 'utf8');
const service = readFileSync('src/components/PublicTableService.jsx', 'utf8');
const serviceCss = readFileSync('src/components/PublicTableService.css', 'utf8');

test('AI localhost endpoint requires explicit development opt-in; hosted Supabase remains default', () => {
  assert.match(ask, /import\.meta\.env\.DEV\s*&&\s*import\.meta\.env\.VITE_KHAAVIO_AI_CHAT_USE_LOCAL\s*===\s*"true"/);
  assert.match(ask, /supabase\.functions\.invoke\("khaavio-ai-chat"/);
  assert.match(ask, /even if an old \.env\.local still contains VITE_KHAAVIO_AI_CHAT_URL=http:\/\/localhost:8000/);
});

test('AI launcher disappears while chat is open, avoiding a duplicate floating X button', () => {
  assert.match(ask, /\{!isOpen\s*&&\s*\(/);
  assert.match(ask, /className="ask-khaavio-close"/); // Keep the accessible close action inside the panel header.
  assert.doesNotMatch(ask, /isOpen\s*\?\s*<X size=\{20\}/);
  assert.doesNotMatch(ask, /ask-khaavio-launcher is-open/);
});

test('Ask Khaavio launcher is compact on desktop and mobile', () => {
  assert.match(askCss, /\.ask-khaavio-launcher\s*\{[^}]*min-height:\s*42px/s);
  assert.match(askCss, /@media \(max-width: 560px\)[\s\S]*?\.ask-khaavio-launcher\s*\{[^}]*min-height:\s*39px/s);
});

test('Need help bubble is compact and moves up when a sticky cart is present', () => {
  assert.match(service, /hasStickyCart\s*=\s*false/);
  assert.match(service, /className=\{`public-table-service\$\{hasStickyCart \? " is-raised" : ""\}`\}/);
  assert.match(serviceCss, /\.public-table-service-fab\s*\{[^}]*min-height:\s*41px/s);
  assert.match(serviceCss, /@media \(max-width: 600px\)[\s\S]*?\.public-table-service-fab\s*\{[^}]*min-height:\s*37px/s);
});
