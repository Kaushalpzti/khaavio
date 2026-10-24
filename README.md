# Khaavio

Khaavio is a React + Vite restaurant QR menu, ordering, table-session billing, booking, and subscription-management app backed by Supabase.

## Local development

1. Install a supported Node.js LTS release and npm.
2. Create `.env.local` from `.env.example` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` for your own Supabase project.
3. Install dependencies with `npm ci`.
4. Run `npm run dev` (Vite uses `http://localhost:5173` by default).

Useful verification commands:

- `npm test` — runs the repository's Node test suite.
- `npm run lint` — runs Oxlint.
- `npm run build` — creates the production Vite build in `dist/`.

## Supabase database notes

The SQL in this repository assumes the core Khaavio application schema already exists in Supabase. In particular, the core `restaurants`, `restaurant_tables`, `orders`, `order_items`, `menu_items`, and `bookings` tables are not recreated by these incremental migrations. Some booking-specific database objects are also not included: the `khaavio_prevent_booking_conflicts_before_write` and `khaavio_validate_booking_hours_before_write` triggers/functions, plus the `get_public_booking_tables` and `create_public_booking` RPCs. The entitlement migration checks for those two booking triggers and will stop if they are absent. Apply/verify the core app schema and those booking safeguards first in a development/staging project. A fresh `supabase db reset` is not yet a full-from-zero setup until that core schema and helpers are represented as migrations.

For an existing project that has not yet installed subscription tables, review and apply `supabase/khaavio-subscriptions-migration.sql` once before applying the numbered migrations. This baseline SQL is retained for compatibility with the existing setup. Then apply the files in `supabase/migrations/` in timestamp order; do not apply the standalone `supabase/khaavio-platform-admin-migration.sql` or `khaavio-superadmin-pwa/supabase/khaavio-superadmin-pwa-migration.sql` a second time when the numbered platform-admin migration has already been applied.

The latest subscription migration creates the manual plan-request RPCs and enforces a seven-day trial for **new** trial assignments. The numbered platform-admin migration also includes the protected audit-log reader used by Khaavio Control. The latest migration supplies the public subscription-status and ordering-hours helpers referenced by the public QR ordering flow. These migrations deliberately preserve existing subscription rows and their current `ends_at` values. No payment is collected by Khaavio; a platform admin must independently verify an offline payment before activating a paid plan. Local Auth callback URLs are configured for Vite at port 5173; configure the production site URL and allowlist separately in hosted Supabase Auth settings.

To enable the platform-admin panel, bootstrap only your own trusted account after signing in and checking its user UUID in Supabase Dashboard → Authentication → Users:

```sql
insert into public.platform_admins (user_id)
values ('YOUR_AUTH_USER_UUID'::uuid)
on conflict (user_id) do nothing;
```

Never place the Supabase service-role key or other server secrets in `VITE_*` variables or in browser code. The browser should use only the publishable/anon key.

## Khaavio Control PWA

The optional `khaavio-superadmin-pwa/` folder is a separate Vite app. For local development, create `khaavio-superadmin-pwa/.env.local` from its `.env.example`, then run `npm ci` and `npm run dev` from that folder. Use a trusted allowlisted admin account only; the PWA calls server-side RPCs that enforce membership in `public.platform_admins`.
