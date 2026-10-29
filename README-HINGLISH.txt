KHAAVIO HOMEPAGE REDESIGN — FULL CODE PACK (HINGLISH)
=====================================================

FILES INCLUDED
--------------
src/App.jsx                    FULL integrated App.jsx based on the App.jsx you attached
src/pages/Home.jsx             Redesigned homepage
src/pages/Home.css             Homepage style, animation and responsive layout
src/pages/Contact.jsx          Dedicated Contact Us page
src/pages/Contact.css          Contact page style and responsive layout
public/images/khaavio-dashboard-desktop.png
public/images/khaavio-dashboard-mobile.jpg
FILE-MANIFEST.txt

INSTALL INTO YOUR EXISTING KHAAVIO PROJECT
------------------------------------------
1. ZIP ko extract karo.
2. Apne current project folder ka backup ya local Git commit bana lo. Abhi push/deploy mat karo.
3. src/pages/Home.jsx aur Home.css ko existing project ke src/pages/ mein replace karo.
4. src/pages/Contact.jsx aur Contact.css ko existing project ke src/pages/ mein add/copy karo.
5. Included src/App.jsx ko project ke src/App.jsx se replace karo. Ye provided App.jsx par based hai: auth/provider setup, dashboard routes, public customer routes, legal routes, and admin routes retained hain. Contact page ka lazy import aur /contact route added hai. Hash navigation handler is set not to scroll to page top while the homepage resolves an in-page target.
6. Images ko project ke public/images/ folder mein copy karo. Folder na ho toh create kar lo.
7. Existing src/assets/icon.png ko preserve karo; Home.jsx aur Contact.jsx us asset ko use karte hain.
8. Dev server:
      npm run dev
9. Verify manually:
      http://localhost:5173/
      http://localhost:5173/contact
      http://localhost:5173/#book-demo
      http://localhost:5173/#pricing
10. Desktop aur mobile viewport par header, hero mockups, all nav anchors, pricing toggle, mobile menu, demo section, forms and contact footer check karna.

LOCAL CHECKS (RUN IN YOUR PROJECT ROOT)
---------------------------------------
npm test
npm run lint
npm run build
git diff --check
git status --short

FORM BEHAVIOUR — READ BEFORE PRODUCTION
--------------------------------------
The Book a Free Demo and Contact Us forms validate required browser fields, then try to open the visitor's default email app with a prefilled email to khaavioqr@gmail.com. The visitor must press Send in their email app. These forms do NOT save leads to a database, automatically send confirmation email, or reserve a calendar slot. To implement real lead storage or calendar booking, a backend integration and a separately approved data/schema plan will be needed.

NOT DONE / IMPORTANT
--------------------
- No GitHub push and no Vercel deployment has been performed.
- No Supabase schema, data or edge function was changed.
- Full npm test/lint/build was not run here because this pack is not your actual local project with its installed dependencies. JSX syntax and CSS parsing checks were performed on the provided files, but the final verification must run in your local project.
- The desktop dashboard screenshot has the visible account email blurred. The mobile screenshot is used as supplied.
