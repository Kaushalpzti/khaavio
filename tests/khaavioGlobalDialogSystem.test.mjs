import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const targets = [
  ["src/pages/BookingsDashboard.jsx", 1, 0],
  ["src/pages/MenuManager.jsx", 2, 0],
  ["src/pages/OrdersDashboard.jsx", 1, 0],
  ["src/pages/PlatformAdminSubscriptions.jsx", 3, 4],
  ["src/pages/TableSessions.jsx", 2, 0],
];

test("all audited pages use the shared dialog APIs instead of browser confirm/prompt", () => {
  let confirms = 0;
  let prompts = 0;
  for (const [file, expectedConfirms, expectedPrompts] of targets) {
    const source = readFileSync(resolve(root, file), "utf8");
    assert.doesNotMatch(source, /\bwindow\s*\.\s*(?:confirm|prompt|alert)\s*\(/i, `${file} still contains a native popup`);
    assert.match(source, /from ["']\.\.\/components\/KhaavioDialogSystem\.jsx["']/, `${file} must import the shared dialog system`);
    const actualConfirms = (source.match(/await\s+confirmKhaavio\s*\(/g) || []).length;
    const actualPrompts = (source.match(/await\s+promptKhaavio\s*\(/g) || []).length;
    assert.equal(actualConfirms, expectedConfirms, `${file} confirm count`);
    assert.equal(actualPrompts, expectedPrompts, `${file} prompt count`);
    confirms += actualConfirms;
    prompts += actualPrompts;
  }
  assert.equal(confirms, 9);
  assert.equal(prompts, 4);
});

test("shared dialog provides accessible modal semantics, Escape handling, focus management and custom field support", () => {
  const source = readFileSync(resolve(root, "src/components/KhaavioDialogSystem.jsx"), "utf8");
  const css = readFileSync(resolve(root, "src/components/KhaavioDialogSystem.css"), "utf8");
  assert.match(source, /createRoot/);
  assert.match(source, /aria-modal="true"/);
  assert.match(source, /role=\{kind === "confirm" && meta\.danger \? "alertdialog" : "dialog"\}/);
  assert.match(source, /event\.key === "Escape"/);
  assert.match(source, /previouslyFocused\.focus/);
  assert.match(source, /<textarea/);
  assert.match(source, /type=\{meta\.inputType\}/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /max-width: 520px/);
});
