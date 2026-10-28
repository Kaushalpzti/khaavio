-- Minimal compile/runtime fixture for the Offers Engine migration.
-- Disposable PostgreSQL only: never used with production data.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;

CREATE TABLE public.restaurants (
  id uuid PRIMARY KEY,
  owner_id uuid,
  slug text UNIQUE,
  is_published boolean NOT NULL DEFAULT false
);
CREATE TABLE public.restaurant_tables (
  id uuid PRIMARY KEY,
  restaurant_id uuid NOT NULL,
  qr_token uuid UNIQUE,
  is_active boolean NOT NULL DEFAULT true
);
CREATE TABLE public.table_sessions (
  id uuid PRIMARY KEY,
  restaurant_id uuid NOT NULL,
  table_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'open'
);
CREATE TABLE public.table_session_tabs (
  id uuid PRIMARY KEY,
  restaurant_id uuid,
  table_id uuid,
  session_id uuid,
  guest_tab_token uuid,
  display_name text,
  status text
);
CREATE TABLE public.orders (
  id uuid PRIMARY KEY,
  restaurant_id uuid NOT NULL,
  table_id uuid,
  session_id uuid,
  guest_tab_id uuid,
  guest_order_request_token uuid,
  customer_phone text,
  total_amount numeric(12,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending'
);
CREATE TABLE public.order_items (
  id uuid PRIMARY KEY,
  order_id uuid NOT NULL,
  menu_item_id uuid,
  item_name text NOT NULL,
  unit_price numeric(12,2) NOT NULL DEFAULT 0,
  quantity integer NOT NULL DEFAULT 1,
  line_total numeric(12,2) NOT NULL DEFAULT 0
);
CREATE TABLE public.menu_items (
  id uuid PRIMARY KEY,
  restaurant_id uuid NOT NULL,
  price numeric(12,2) NOT NULL,
  is_available boolean NOT NULL DEFAULT true
);
CREATE TABLE public.table_session_invoices (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  table_id uuid NOT NULL,
  session_id uuid NOT NULL,
  invoice_number text NOT NULL UNIQUE,
  total_amount numeric(12,2) NOT NULL,
  order_count integer NOT NULL,
  payment_status text NOT NULL DEFAULT 'unpaid',
  issued_at timestamptz NOT NULL DEFAULT pg_catalog.now()
);

CREATE FUNCTION public.khaavio_guard_session_order_update()
RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;
CREATE TRIGGER khaavio_guard_session_order_updates
BEFORE UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.khaavio_guard_session_order_update();

CREATE FUNCTION public.place_public_order_with_loyalty(
  text, uuid, text, text, text, jsonb, uuid, text
) RETURNS TABLE(order_id uuid, order_reference text, total_amount numeric, tracking_token uuid)
LANGUAGE sql AS $$ SELECT NULL::uuid, NULL::text, NULL::numeric, NULL::uuid WHERE false $$;

CREATE FUNCTION public.place_public_order_for_guest_with_loyalty(
  text, uuid, text, text, text, jsonb, uuid, text, uuid, text, uuid
) RETURNS TABLE(order_id uuid, order_reference text, total_amount numeric, tracking_token uuid)
LANGUAGE sql AS $$ SELECT NULL::uuid, NULL::text, NULL::numeric, NULL::uuid WHERE false $$;
