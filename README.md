# Khaavio

Khaavio is a restaurant operations platform built with React and Vite, with Supabase for authentication, database, storage, and server-side functions. It provides public QR menus and ordering, table and booking workflows, and a restaurant management dashboard.

## Product features

### Customer experience

- Public restaurant menus with categories, search, offers, coupons, and image banners.
- Pickup and dine-in ordering modes, controlled by each restaurant's settings.
- Customers using the regular menu can select a table and continue to its table-linked menu while keeping their cart.
- Table QR ordering with configurable item add-ons and price adjustments.
- Order tracking, restaurant bookings, table-service requests, and loyalty rewards.
- Private feedback and Google review drafts. Khaavio can copy the customer's draft and open the restaurant's Google review page; the customer reviews, edits, and submits it themselves. Khaavio does not post reviews on a customer's behalf.
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
- Supabase Edge Functions for AI chat and subscription billing
- Vercel API functions for public SEO metadata and QR image generation
- Node.js and npm

## Local development

Use Node.js **20.19+** or **22.12+** (Node 22 LTS is recommended).

1. Create **.env.local** from **.env.example**.
2. Set **VITE_SUPABASE_URL** and **VITE_SUPABASE_PUBLISHABLE_KEY** for your Supabase project.
3. Optionally set **VITE_KHAAVIO_SUPPORT_EMAIL** and **VITE_KHAAVIO_SUPPORT_WHATSAPP**.
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

- GROQ_API_KEY for AI chat.
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


## Website trust and analytics configuration

The website's demo and contact forms store submitted enquiries in the restricted `platform_contact_leads` table. Configure these server-side Vercel environment variables before enabling the forms:

- `SUPABASE_URL` (or the existing `VITE_SUPABASE_URL`)
- `SUPABASE_SERVICE_ROLE_KEY` — server-side only; never expose this value through a `VITE_*` variable.
- `SUPABASE_PUBLISHABLE_KEY` (or the existing `VITE_SUPABASE_PUBLISHABLE_KEY`) — public key used by the dynamic sitemap endpoint.

Apply these migrations in timestamp order:
1. `20261031170000_website_leads_sitemap_feedback_controls.sql`
2. `20261031180000_bind_loyalty_cards_to_browser_tokens.sql`
3. `20261031190000_disable_phone_only_service_mode_loyalty.sql`

Deploy the public feedback function with `supabase functions deploy khaavio-submit-feedback`.

New demo/contact enquiries are stored in `public.platform_contact_leads`. Review them in Supabase Dashboard → Table Editor; this implementation does not send an email notification or add a CRM screen yet.

To enable optional Google Analytics 4, configure `VITE_GA4_MEASUREMENT_ID` with the site's GA4 measurement ID and rebuild the frontend. GA4 is loaded only after the visitor chooses **Allow analytics**; the privacy choices control remains available for withdrawal. Without this variable, the analytics script and consent banner are not activated. Mark `generate_lead` as a key event in the GA4 property if it should appear as a conversion.

The dynamic sitemap is served through `/sitemap.xml` and includes the marketing pages plus published restaurant menu slugs. Submit that URL in Google Search Console after the application and database migrations are deployed.
