CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;

CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY);

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $function$
  SELECT NULLIF(pg_catalog.current_setting('request.jwt.claim.sub', true), '')::uuid;
$function$;

CREATE TABLE public.restaurants (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL,
  name text NOT NULL,
  slug text NOT NULL,
  is_published boolean NOT NULL DEFAULT false,
  table_billing_mode text NOT NULL DEFAULT 'combined'
);

CREATE TABLE public.restaurant_tables (
  id uuid PRIMARY KEY,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id),
  qr_token uuid NOT NULL,
  is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE public.table_sessions (
  id uuid PRIMARY KEY,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id),
  table_id uuid NOT NULL REFERENCES public.restaurant_tables(id),
  status text NOT NULL,
  billing_mode text NOT NULL,
  opened_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.table_session_tabs (
  id uuid PRIMARY KEY,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id),
  table_id uuid NOT NULL REFERENCES public.restaurant_tables(id),
  session_id uuid NOT NULL REFERENCES public.table_sessions(id),
  guest_tab_token uuid NOT NULL,
  status text NOT NULL,
  display_name text NOT NULL DEFAULT 'Guest',
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz
);

CREATE TABLE public.table_session_invoices (
  id uuid PRIMARY KEY,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id),
  table_id uuid NOT NULL REFERENCES public.restaurant_tables(id),
  session_id uuid NOT NULL REFERENCES public.table_sessions(id),
  guest_tab_id uuid REFERENCES public.table_session_tabs(id),
  invoice_number text NOT NULL,
  total_amount numeric(12,2) NOT NULL,
  subtotal_amount numeric(12,2) NOT NULL DEFAULT 0,
  discount_amount numeric(12,2) NOT NULL DEFAULT 0,
  tax_amount numeric(12,2) NOT NULL DEFAULT 0,
  gstin_snapshot text,
  gst_inclusive boolean NOT NULL DEFAULT false,
  order_count integer NOT NULL DEFAULT 1,
  payment_status text NOT NULL DEFAULT 'unpaid',
  issued_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz,
  payment_method text
);

CREATE TABLE public.orders (
  id uuid PRIMARY KEY,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id),
  table_id uuid REFERENCES public.restaurant_tables(id),
  session_id uuid REFERENCES public.table_sessions(id),
  guest_tab_id uuid REFERENCES public.table_session_tabs(id),
  customer_name text NOT NULL,
  status text NOT NULL DEFAULT 'completed',
  total_amount numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.order_items (
  id uuid PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES public.orders(id),
  item_name text NOT NULL,
  unit_price numeric(12,2) NOT NULL,
  quantity integer NOT NULL,
  line_total numeric(12,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.table_session_invoice_items (
  id uuid PRIMARY KEY,
  invoice_id uuid NOT NULL REFERENCES public.table_session_invoices(id),
  order_id uuid NOT NULL REFERENCES public.orders(id),
  order_reference text NOT NULL,
  order_created_at timestamptz NOT NULL,
  customer_name text NOT NULL,
  item_name text NOT NULL,
  unit_price numeric(12,2) NOT NULL,
  quantity integer NOT NULL,
  line_total numeric(12,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.khaavio_public_table_billing_mode(p_slug text, p_table_token uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT r.table_billing_mode
  FROM public.restaurants r
  JOIN public.restaurant_tables rt ON rt.restaurant_id = r.id
  WHERE r.slug = p_slug AND rt.qr_token = p_table_token AND r.is_published IS TRUE
  LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.mark_table_invoice_paid(p_invoice_id uuid, p_payment_method text)
RETURNS TABLE(invoice_id uuid, invoice_number text, total_amount numeric, payment_status text, paid_at timestamptz, payment_method text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  RETURN QUERY
  UPDATE public.table_session_invoices i
  SET payment_status = 'paid',
      paid_at = pg_catalog.now(),
      payment_method = p_payment_method
  WHERE i.id = p_invoice_id
  RETURNING i.id, i.invoice_number, i.total_amount, i.payment_status, i.paid_at, i.payment_method;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mark_guest_tab_invoice_paid(p_invoice_id uuid, p_payment_method text)
RETURNS TABLE(invoice_id uuid, invoice_number text, total_amount numeric, payment_status text, paid_at timestamptz, payment_method text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  RETURN QUERY
  UPDATE public.table_session_invoices i
  SET payment_status = 'paid',
      paid_at = pg_catalog.now(),
      payment_method = p_payment_method
  WHERE i.id = p_invoice_id
  RETURNING i.id, i.invoice_number, i.total_amount, i.payment_status, i.paid_at, i.payment_method;
END;
$function$;

INSERT INTO auth.users (id)
VALUES ('00000000-0000-4000-8000-000000000099');

INSERT INTO public.restaurants (
  id, owner_id, name, slug, is_published, table_billing_mode
)
VALUES (
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000099',
  'The Green Table',
  'green-table',
  true,
  'combined'
);

INSERT INTO public.restaurant_tables (id, restaurant_id, qr_token, is_active)
VALUES (
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000003',
  true
);

INSERT INTO public.table_sessions (id, restaurant_id, table_id, status, billing_mode)
VALUES (
  '00000000-0000-4000-8000-000000000004',
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002',
  'billing',
  'combined'
);

INSERT INTO public.table_session_invoices (
  id, restaurant_id, table_id, session_id, invoice_number, total_amount,
  subtotal_amount, order_count, payment_status
)
VALUES (
  '00000000-0000-4000-8000-000000000005',
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000004',
  'KHV-TEST-0001',
  850,
  850,
  1,
  'unpaid'
);

INSERT INTO public.orders (id, restaurant_id, table_id, session_id, customer_name, status, total_amount)
VALUES (
  '00000000-0000-4000-8000-000000000006',
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000004',
  'Guest',
  'completed',
  850
);

INSERT INTO public.table_session_invoice_items (
  id, invoice_id, order_id, order_reference, order_created_at, customer_name,
  item_name, unit_price, quantity, line_total
)
VALUES (
  '00000000-0000-4000-8000-000000000007',
  '00000000-0000-4000-8000-000000000005',
  '00000000-0000-4000-8000-000000000006',
  'TEST0001',
  now(),
  'Guest',
  'Masala Dosa',
  850,
  1,
  850
);
