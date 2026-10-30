import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const menu = readFileSync(new URL("../src/pages/PublicMenu.jsx", import.meta.url), "utf8");
const menuStyles = readFileSync(new URL("../src/pages/PublicMenuExperience.css", import.meta.url), "utf8");
const booking = readFileSync(new URL("../src/pages/PublicBooking.jsx", import.meta.url), "utf8");
const bookingStyles = readFileSync(new URL("../src/pages/PublicBooking.css", import.meta.url), "utf8");

test("public menu has the requested four in-shell tabs and no Home tab", () => {
  assert.match(menu, /<span>Menu<\/span>/);
  assert.match(menu, /<span>Rewards<\/span>/);
  assert.match(menu, /<span>Book table<\/span>/);
  assert.match(menu, /<span>Ratings & Review<\/span>/);
  assert.doesNotMatch(menu, /<span>Home<\/span>/);
  assert.match(menu, /activeBottomTab === "reviews"/);
});

test("regular dine-in can select a table and continue on its QR menu", () => {
  assert.match(menu, /className="public-menu-table-badge"/);
  assert.match(menu, /<span>Table \{normalizeTableNumber\(tableContext\.table_number\)\}<\/span>/);
  assert.match(menu, /className="public-menu-table-picker"/);
  assert.match(menu, /className="public-menu-table-chooser-continue"/);
  assert.match(menu, /navigate\(`\/menu\/\$\{encodeURIComponent\(slug\)\}\?table=/);
  assert.match(menu, /getPendingTableMenuCartKey\(slug\)/);
});

test("booking is embedded in the public menu while the standalone route remains supported", () => {
  assert.match(menu, /<PublicBooking[\s\S]*?slugOverride=\{slug\}[\s\S]*?embedded/);
  assert.match(booking, /slugOverride \|\| routeParams\.slug/);
  assert.match(booking, /!embedded && \(/);
  assert.match(booking, /onReturnToMenu/);
});

test("private feedback and Google review UI are isolated to the review tab", () => {
  assert.match(menu, /activeBottomTab === "reviews"[\s\S]*?<PublicReviewsFeedback/);
  assert.equal((menu.match(/<PublicReviewsFeedback/g) || []).length, 1);
});

test("Help and Ask Khaavio remain mounted across tab views", () => {
  assert.match(menu, /<PublicHelpLauncher[\s\S]*?<AskKhaavio/);
  assert.match(menu, /activeFloatingHelpPanel === "concierge"/);
  assert.match(menuStyles, /public-menu-bottom-navigation~\.public-help-launcher/);
  assert.match(menuStyles, /public-menu-bottom-navigation~\.ask-khaavio-root/);
});

test("sticky cart is limited to the Menu tab and shared navigation remains responsive", () => {
  assert.match(menu, /activeBottomTab === "menu" && cart\.length > 0 && !orderResult && !isCartOpen/);
  assert.match(menuStyles, /grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(menuStyles, /@media \(max-width: 680px\)/);
});
