-- Disposable PostgreSQL fixture for Business Copilot RPC tests.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

CREATE TABLE public.subscription_plans (
  plan_key text PRIMARY KEY,
  limits jsonb NOT NULL DEFAULT '{}'::jsonb,
  features jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.subscription_plans (plan_key, limits, features) VALUES
  ('starter', '{"feature_flags":{"business_copilot":false}}', '[]'),
  ('growth', '{"feature_flags":{"business_copilot":true}}', '[]');

CREATE TABLE public.restaurants (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL,
  name text NOT NULL,
  slug text UNIQUE,
  is_published boolean NOT NULL DEFAULT true
);
CREATE TABLE public.restaurant_subscriptions (
  restaurant_id uuid PRIMARY KEY,
  plan_key text NOT NULL REFERENCES public.subscription_plans(plan_key),
  status text NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz
);
CREATE TABLE public.orders (
  id uuid PRIMARY KEY,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id),
  customer_phone text,
  total_amount numeric(12,2) NOT NULL,
  status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.order_items (
  id uuid PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES public.orders(id),
  item_name text NOT NULL,
  quantity integer NOT NULL,
  line_total numeric(12,2) NOT NULL
);
CREATE TABLE public.bookings (
  id uuid PRIMARY KEY,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id),
  booking_time timestamptz NOT NULL,
  status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
