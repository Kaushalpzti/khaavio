-- Minimal disposable PostgreSQL fixture for Khaavio website trust migrations.
-- These are compile-time contracts only; no production data or secrets are loaded.
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;

CREATE SCHEMA auth;
CREATE TABLE auth.users (
  id uuid PRIMARY KEY
);
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $function$
  SELECT NULL::uuid;
$function$;

CREATE TABLE public.restaurants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  is_published boolean NOT NULL DEFAULT false
);

-- The real feedback RPC is supplied by the earlier product migration.
CREATE OR REPLACE FUNCTION public.submit_restaurant_feedback(
  p_restaurant_slug text,
  p_rating integer,
  p_category text DEFAULT 'other',
  p_message text DEFAULT NULL
)
RETURNS uuid
LANGUAGE sql
AS $function$
  SELECT gen_random_uuid();
$function$;
