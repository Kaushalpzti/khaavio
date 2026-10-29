KHAAVIO — FINAL HOMEPAGE / CONTACT / LEGAL FIX PACK (v2)

Extract this ZIP directly into the Khaavio project root, for example:
C:\Users\kaush\khaavio

When Windows asks whether to replace files, choose Replace/Overwrite for the files in this pack.
The ZIP already uses the correct project-relative paths (src/pages, public/images, tests).

WHAT THIS PACK UPDATES
- Modern responsive homepage with product feature sections and aligned Starter/Growth feature copy.
- Clearer desktop/mobile typography and compact mobile footer.
- Instagram vector icon + WhatsApp contact link in the homepage footer.
- Dedicated Contact Us page and its route.
- Updated legal pages with the 29 October 2026 review date.
- Added exact privacy-policy wording for public menu order phone processing, repeat-visit/order trends, and the distinction between order processing and marketing consent.
- Clarified that the policy does not exclude a statutory right or remedy that cannot lawfully be excluded.
- Updated homepage/legal tests for the redesigned kh2 layout and for ScrollToTop's existing hash-aware behavior.
- Dashboard screenshots used by the homepage mockups.

SAFETY NOTES
- No database schema, Supabase migrations, authentication logic, customer order flows, restaurant dashboard route paths, or billing workflows are intentionally changed by this pack.
- src/App.jsx is included with the Contact route and the existing authentication, protected dashboard, menu, QR, orders, bookings, kitchen, loyalty, feedback and billing routes retained.
- The contact and demo forms prepare an email in the visitor's email app. The visitor still needs to press Send; these forms do not silently store enquiries or reserve a calendar slot.

AFTER EXTRACTION (IN YOUR KHAAVIO TERMINAL)
1. npm test
2. npm run lint
3. npm run build
4. git diff --check

Do not push or deploy until those checks pass and you have visually reviewed the homepage and Contact Us page on desktop and mobile.
