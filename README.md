# Khaavio

Khaavio is a restaurant operations platform built with React and Vite, with Supabase for authentication, database, storage, and server-side functions. It provides public QR menus and ordering, table and booking workflows, and a restaurant management dashboard.

## Product features

### Customer experience

- Public restaurant menus with categories, search, offers, coupons, and image banners.
- Pickup and dine-in ordering modes, controlled by each restaurant's settings.
- Customers using the regular menu can select a table and continue to its table-linked menu while keeping their cart.
- Table QR ordering with configurable item add-ons and price adjustments.
- Order tracking, restaurant bookings, table-service requests, and loyalty rewards. Perks cards use a random browser token and are not recovered by an unverified phone number.
- Private feedback through a server-side, rate-limited endpoint; customers can write their own Google reviews and open the restaurant's Google review page. Khaavio does not generate, filter or publish Google reviews.
- A phone number is required for public orders, but it is not verified by SMS or OTP.
- Restaurant food orders are submitted to the restaurant; Khaavio does not collect payment for those orders at checkout.

### Restaurant dashboard

- Restaurant profile, ordering-mode, menu, add-on, banner, coupon, and QR-code management.
- Order dashboard and Kitchen Display System (KDS).
- Table sessions, combined or per-guest tabs, final invoices, and GST settings.
- Bookings, service requests, reviews and private feedback, loyalty, and analytics.
- Subscription and plan management, including a seven-day trial for eligible new trial assignments.
- Razorpay recurring checkout for paid Khaavio subscriptions when its server-side credentials and plan IDs are configured. Legacy manual plan requests remain available for admin review.

## Tech stack

- React 19, Vite 8, and React Router
- Supabase JS for the application backend
- Supabase Edge Functions for AI chat, public feedback protection, and subscription billing
- Vercel API functions for public SEO metadata and QR image generation
- Node.js and npm

## Local development

Use Node.js **20.19+** or **22.12+** (Node 22 LTS is recommended).

1. Create **.env.local** from **.env.example**.
2. Set **VITE_SUPABASE_URL** and **VITE_SUPABASE_PUBLISHABLE_KEY** for your Supabase project.
3. Optionally set **VITE_KHAAVIO_SUPPORT_EMAIL** and **VITE_KHAAVIO_SUPPORT_WHATSAPP**.
4. Set **VITE_GA4_MEASUREMENT_ID** only when a Google Analytics 4 property is configured. The analytics script remains off until the visitor accepts optional analytics.
4. Install the locked dependencies and start Vite:

~~~sh
npm ci
npm run dev
~~~

Vite serves the app at **http://localhost:5173** by default. On Windows PowerShell, use **npm.cmd** if the **npm** script launcher is blocked.

Useful commands:

~~~sh
npm test       # Run the Node test suite
npm run lint   # Run Oxlint
npm run build  # Build the production app into dist/
npm run preview
~~~

Never put a Supabase service-role key, Razorpay secret, or other server credential in a variable exposed to the browser or in browser code. The main browser app uses only the Supabase publishable key.

## Supabase setup

### Database and migrations

The numbered SQL files in supabase/migrations/ are incremental migrations for an existing Khaavio application schema. They do not create every core table from scratch. The core restaurants, restaurant_tables, orders, order_items, menu_items, and bookings tables, plus some booking safeguards and RPCs, are expected to exist before all migrations can run.

In particular, the repository does not currently define the booking triggers khaavio_prevent_booking_conflicts_before_write and khaavio_validate_booking_hours_before_write, or the get_public_booking_tables and create_public_booking RPCs. The subscription-entitlement migration checks for the booking triggers and stops if they are missing. Set up and verify the core schema and booking objects in a development or staging project first. A fresh supabase db reset is not a complete from-zero installation yet.

For a project that does not have the subscription baseline, review and apply supabase/khaavio-subscriptions-migration.sql once before the numbered migrations. Then apply the numbered migrations in timestamp order. First compare repository migration files with the target project's migration history; do not blindly reapply SQL or mark a migration applied without checking its contents.

The numbered platform-admin migration already includes functionality from the legacy standalone migration files. Do not apply supabase/khaavio-platform-admin-migration.sql or khaavio-superadmin-pwa/supabase/khaavio-superadmin-pwa-migration.sql a second time after the numbered platform-admin migration is present.

The migrations preserve existing subscription rows and their current ends_at values. New trial assignments use the configured seven-day trial. Public ordering also relies on subscription-status and restaurant-hours helper functions supplied by the migrations.

### Edge Functions and secrets

The supabase/functions/ folder contains the Khaavio AI chat and Razorpay subscription functions. Deploy the functions required by the features you enable. Configure server-only secrets in Supabase Edge Function secrets, never in the Vite environment:

- GROQ_API_KEY for Ask Khaavio AI menu assistance.
- The `khaavio-public-feedback` Edge Function uses the Supabase project URL and service-role key supplied by the Edge Function runtime; no extra client-side secret is required.
- RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET for subscription checkout.
- RAZORPAY_WEBHOOK_SECRET for webhook signature verification.
- Razorpay plan IDs: RAZORPAY_PLAN_STARTER_MONTHLY, RAZORPAY_PLAN_STARTER_YEARLY, RAZORPAY_PLAN_GROWTH_MONTHLY, and RAZORPAY_PLAN_GROWTH_YEARLY.

The Supabase Edge Function runtime also needs its project URL and server-side Supabase credentials. Confirm the required secrets are configured before enabling the corresponding production feature.

### Storage

The app uses the menu-images and restaurant-logos Supabase Storage buckets. Public reads are used to display restaurant assets; uploads are restricted to authenticated owners' folders. The menu-images bucket is limited to 5 MB per file and image content types.

### Authentication and production URLs

Local Auth callback URLs are configured for Vite on port 5173. Configure the production site URL and redirect allowlist separately in hosted Supabase Auth settings. Keep local and production callback URLs aligned with the URLs actually used by each environment.

## Khaavio Control PWA

The optional khaavio-superadmin-pwa/ directory contains a separate Vite app. It uses the same Supabase project and its own .env.local, created from khaavio-superadmin-pwa/.env.example.

~~~sh
cd khaavio-superadmin-pwa
npm ci
npm run dev
~~~

Use a trusted, allowlisted admin account only. The PWA calls server-side RPCs that verify membership in public.platform_admins.

To bootstrap your own trusted platform-admin account, sign in and confirm your user UUID in Supabase Dashboard → Authentication → Users, then run this once in the trusted project's SQL editor:

~~~sql
insert into public.platform_admins (user_id)
values ('YOUR_AUTH_USER_UUID'::uuid)
on conflict (user_id) do nothing;
~~~
~~~

### Public SEO, feedback and privacy controls

- `/sitemap.xml` is generated by `api/sitemap.js` and includes static public pages plus currently published restaurant menu slugs. It requires the migration that creates `khaavio_public_sitemap_restaurant_slugs()`.
- Unknown routes return an actual HTTP 404 from the SEO server handler and render the branded Not Found page in the app.
- Public restaurant feedback is submitted through the `khaavio-public-feedback` Edge Function. Apply the migration `20261031163000_seo_feedback_loyalty_security.sql` and deploy the Edge Function before enabling the feedback form in production.
- The same migration revokes public phone-only Perks lookup. Perks now uses a random token in the visitor's browser; clearing browser storage or switching devices does not recover an existing card by phone number.
- Google review hand-off is customer-written only. Ask Khaavio AI menu assistance remains available, but AI-generated Google review drafts return HTTP 410.
- GA4 is optional and requires `VITE_GA4_MEASUREMENT_ID` at build time. Analytics storage is denied by default and the GA script is loaded only after the visitor accepts. Configure the property and deployment environment separately; no tracking ID is bundled in the repository.
