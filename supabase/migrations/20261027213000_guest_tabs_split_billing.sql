-- Khaavio: guest tabs and separate invoices per customer.
-- Backwards compatible: existing and new restaurants default to combined table bills.
-- Apply in a reviewed Supabase migration workflow; this file does not execute itself.
BEGIN;

ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS table_billing_mode text NOT NULL DEFAULT 'combined';
DO $billing_mode_constraint$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.restaurants'::regclass
      AND conname = 'restaurants_table_billing_mode_check'
  ) THEN
    ALTER TABLE public.restaurants
      ADD CONSTRAINT restaurants_table_billing_mode_check
      CHECK (table_billing_mode IN ('combined', 'per_guest'));
  END IF;
END;
$billing_mode_constraint$;

-- Snapshot the selected mode for each seating. Existing sessions are preserved as combined.
ALTER TABLE public.table_sessions
  ADD COLUMN IF NOT EXISTS billing_mode text NOT NULL DEFAULT 'combined';
DO $session_billing_mode_constraint$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.table_sessions'::regclass
      AND conname = 'table_sessions_billing_mode_check'
  ) THEN
    ALTER TABLE public.table_sessions
      ADD CONSTRAINT table_sessions_billing_mode_check
      CHECK (billing_mode IN ('combined', 'per_guest'));
  END IF;
END;
$session_billing_mode_constraint$;

CREATE OR REPLACE FUNCTION public.khaavio_snapshot_table_billing_mode()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_mode text;
BEGIN
  SELECT r.table_billing_mode INTO v_mode
  FROM public.restaurants r
  WHERE r.id = NEW.restaurant_id;
  NEW.billing_mode := COALESCE(v_mode, 'combined');
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.khaavio_snapshot_table_billing_mode() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS khaavio_snapshot_table_billing_mode ON public.table_sessions;
CREATE TRIGGER khaavio_snapshot_table_billing_mode
BEFORE INSERT ON public.table_sessions
FOR EACH ROW EXECUTE FUNCTION public.khaavio_snapshot_table_billing_mode();

CREATE TABLE IF NOT EXISTS public.table_session_tabs (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  table_id uuid NOT NULL,
  session_id uuid NOT NULL,
  guest_tab_token uuid NOT NULL,
  display_name text NOT NULL DEFAULT 'Guest'
    CHECK (pg_catalog.char_length(pg_catalog.btrim(display_name)) BETWEEN 1 AND 80),
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'billing', 'closed')),
  opened_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  closed_at timestamptz,
  CONSTRAINT table_session_tabs_session_scope_fkey
    FOREIGN KEY (session_id, restaurant_id, table_id)
    REFERENCES public.table_sessions(id, restaurant_id, table_id) ON DELETE RESTRICT,
  CONSTRAINT table_session_tabs_scope_unique
    UNIQUE (id, restaurant_id, table_id, session_id),
  CONSTRAINT table_session_tabs_restaurant_token_key
    UNIQUE (restaurant_id, guest_tab_token),
  CONSTRAINT table_session_tabs_close_state_check
    CHECK (
      (status IN ('open', 'billing') AND closed_at IS NULL)
      OR (status = 'closed' AND closed_at IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS table_session_tabs_session_status_idx
  ON public.table_session_tabs (session_id, status, opened_at);
CREATE INDEX IF NOT EXISTS table_session_tabs_restaurant_table_idx
  ON public.table_session_tabs (restaurant_id, table_id, opened_at DESC);

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS guest_tab_id uuid;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS guest_order_request_token uuid;
DO $order_guest_tab_fk$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.orders'::regclass
      AND conname = 'orders_guest_tab_scope_fkey'
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_guest_tab_scope_fkey
      FOREIGN KEY (guest_tab_id, restaurant_id, table_id, session_id)
      REFERENCES public.table_session_tabs(id, restaurant_id, table_id, session_id)
      ON DELETE RESTRICT;
  END IF;
END;
$order_guest_tab_fk$;
CREATE INDEX IF NOT EXISTS orders_guest_tab_created_idx
  ON public.orders (guest_tab_id, created_at ASC)
  WHERE guest_tab_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS orders_guest_order_request_uidx
  ON public.orders (restaurant_id, guest_order_request_token)
  WHERE guest_order_request_token IS NOT NULL;

-- Block legacy/stale order RPCs from creating an unassigned order in a per-guest
-- session. Only the validated guest-order RPC enables this transaction-local flag.
CREATE OR REPLACE FUNCTION public.khaavio_guard_per_guest_order_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_billing_mode text;
  v_request_token text;
BEGIN
  v_request_token := NULLIF(pg_catalog.current_setting('app.khaavio_guest_order_request_token', true), '');
  IF v_request_token IS NOT NULL THEN
    NEW.guest_order_request_token := v_request_token::uuid;
  END IF;

  IF NEW.session_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT ts.billing_mode INTO v_billing_mode
  FROM public.table_sessions ts
  WHERE ts.id = NEW.session_id
    AND ts.restaurant_id = NEW.restaurant_id
    AND ts.table_id = NEW.table_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'The order table session is invalid.' USING ERRCODE = '23503';
  END IF;

  IF v_billing_mode = 'per_guest'
     AND COALESCE(pg_catalog.current_setting('app.khaavio_guest_order_workflow', true), '') <> 'on' THEN
    RAISE EXCEPTION 'This table uses separate guest bills. Refresh the menu and try again.' USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.khaavio_guard_per_guest_order_insert() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS khaavio_guard_per_guest_order_insert ON public.orders;
CREATE TRIGGER khaavio_guard_per_guest_order_insert
BEFORE INSERT ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.khaavio_guard_per_guest_order_insert();

ALTER TABLE public.table_session_invoices
  DROP CONSTRAINT IF EXISTS table_session_invoices_session_id_key;
ALTER TABLE public.table_session_invoices
  ADD COLUMN IF NOT EXISTS guest_tab_id uuid;
DO $invoice_guest_tab_fk$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.table_session_invoices'::regclass
      AND conname = 'table_session_invoices_guest_tab_scope_fkey'
  ) THEN
    ALTER TABLE public.table_session_invoices
      ADD CONSTRAINT table_session_invoices_guest_tab_scope_fkey
      FOREIGN KEY (guest_tab_id, restaurant_id, table_id, session_id)
      REFERENCES public.table_session_tabs(id, restaurant_id, table_id, session_id)
      ON DELETE RESTRICT;
  END IF;
END;
$invoice_guest_tab_fk$;

CREATE UNIQUE INDEX IF NOT EXISTS table_session_invoices_one_combined_per_session_uidx
  ON public.table_session_invoices (session_id)
  WHERE guest_tab_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS table_session_invoices_one_per_guest_tab_uidx
  ON public.table_session_invoices (guest_tab_id)
  WHERE guest_tab_id IS NOT NULL;

ALTER TABLE public.table_session_tabs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS table_session_tabs_owner_read ON public.table_session_tabs;
CREATE POLICY table_session_tabs_owner_read
  ON public.table_session_tabs FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.restaurants r
      WHERE r.id = table_session_tabs.restaurant_id
        AND r.owner_id = (SELECT auth.uid())
    )
  );
REVOKE ALL ON TABLE public.table_session_tabs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.table_session_tabs TO authenticated;

CREATE OR REPLACE FUNCTION public.khaavio_guard_guest_tab_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_mode text;
  v_status text;
BEGIN
  IF NEW.guest_tab_id IS NOT DISTINCT FROM OLD.guest_tab_id THEN RETURN NEW; END IF;
  IF COALESCE(pg_catalog.current_setting('app.khaavio_allow_guest_tab_assignment', true), '') <> 'on' THEN
    RAISE EXCEPTION 'Guest tabs can only be assigned by the validated order workflow.' USING ERRCODE = '42501';
  END IF;
  IF OLD.guest_tab_id IS NOT NULL OR NEW.guest_tab_id IS NULL OR OLD.session_id IS NULL THEN
    RAISE EXCEPTION 'An order cannot be moved between guest tabs.' USING ERRCODE = '55000';
  END IF;
  SELECT ts.billing_mode, ts.status INTO v_mode, v_status
  FROM public.table_sessions ts
  WHERE ts.id = NEW.session_id AND ts.restaurant_id = NEW.restaurant_id AND ts.table_id = NEW.table_id
  FOR UPDATE;
  IF NOT FOUND OR v_mode <> 'per_guest' OR v_status <> 'open' THEN
    RAISE EXCEPTION 'This table session is not accepting guest-tab assignments.' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.khaavio_guard_guest_tab_assignment() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS khaavio_guard_guest_tab_assignment ON public.orders;
CREATE TRIGGER khaavio_guard_guest_tab_assignment
BEFORE UPDATE OF guest_tab_id ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.khaavio_guard_guest_tab_assignment();

CREATE OR REPLACE FUNCTION public.khaavio_guard_split_invoice_mode()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE v_mode text;
BEGIN
  SELECT ts.billing_mode INTO v_mode
  FROM public.table_sessions ts
  WHERE ts.id = NEW.session_id AND ts.restaurant_id = NEW.restaurant_id AND ts.table_id = NEW.table_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Table session not found for invoice.' USING ERRCODE = '23503'; END IF;
  IF v_mode = 'per_guest' AND NEW.guest_tab_id IS NULL THEN
    RAISE EXCEPTION 'This table uses separate guest invoices.' USING ERRCODE = '55000';
  END IF;
  IF v_mode = 'combined' AND NEW.guest_tab_id IS NOT NULL THEN
    RAISE EXCEPTION 'This table uses a combined invoice.' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.khaavio_guard_split_invoice_mode() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS khaavio_guard_split_invoice_mode ON public.table_session_invoices;
CREATE TRIGGER khaavio_guard_split_invoice_mode
BEFORE INSERT ON public.table_session_invoices
FOR EACH ROW EXECUTE FUNCTION public.khaavio_guard_split_invoice_mode();

CREATE OR REPLACE FUNCTION public.khaavio_guard_guest_invoice_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF OLD.guest_tab_id IS NOT NULL
     AND NEW.payment_status IS DISTINCT FROM OLD.payment_status
     AND COALESCE(pg_catalog.current_setting('app.khaavio_guest_invoice_payment', true), '') <> 'on' THEN
    RAISE EXCEPTION 'Use the guest-invoice payment workflow for separate customer bills.' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.khaavio_guard_guest_invoice_payment() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS khaavio_guard_guest_invoice_payment ON public.table_session_invoices;
CREATE TRIGGER khaavio_guard_guest_invoice_payment
BEFORE UPDATE OF payment_status ON public.table_session_invoices
FOR EACH ROW EXECUTE FUNCTION public.khaavio_guard_guest_invoice_payment();

CREATE OR REPLACE FUNCTION public.khaavio_public_table_billing_mode(p_slug text, p_table_token uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_restaurant_id uuid;
  v_table_id uuid;
  v_mode text;
BEGIN
  IF p_slug IS NULL OR pg_catalog.btrim(p_slug) = '' OR p_table_token IS NULL THEN RETURN 'combined'; END IF;
  SELECT r.id, rt.id, r.table_billing_mode INTO v_restaurant_id, v_table_id, v_mode
  FROM public.restaurants r
  JOIN public.restaurant_tables rt ON rt.restaurant_id = r.id
  WHERE r.slug = pg_catalog.btrim(p_slug) AND r.is_published IS TRUE
    AND rt.qr_token = p_table_token AND rt.is_active IS TRUE;
  IF NOT FOUND THEN RETURN 'combined'; END IF;
  SELECT ts.billing_mode INTO v_mode
  FROM public.table_sessions ts
  WHERE ts.restaurant_id = v_restaurant_id AND ts.table_id = v_table_id
    AND ts.status IN ('open', 'billing')
  ORDER BY ts.opened_at DESC LIMIT 1;
  IF NOT FOUND THEN
    SELECT r.table_billing_mode INTO v_mode FROM public.restaurants r WHERE r.id = v_restaurant_id;
  END IF;
  RETURN COALESCE(v_mode, 'combined');
END;
$function$;
REVOKE ALL ON FUNCTION public.khaavio_public_table_billing_mode(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.khaavio_public_table_billing_mode(text, uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.khaavio_public_guest_tab_snapshot(p_slug text, p_table_token uuid, p_guest_tab_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_restaurant_id uuid;
  v_table_id uuid;
  v_mode text;
  v_tab public.table_session_tabs%ROWTYPE;
  v_total numeric(12,2);
  v_order_count integer;
  v_invoice jsonb;
  v_orders jsonb;
BEGIN
  IF p_slug IS NULL OR pg_catalog.btrim(p_slug) = '' OR p_table_token IS NULL OR p_guest_tab_token IS NULL THEN
    RAISE EXCEPTION 'A valid restaurant table and guest tab are required.' USING ERRCODE = '22023';
  END IF;
  SELECT r.id, rt.id, r.table_billing_mode INTO v_restaurant_id, v_table_id, v_mode
  FROM public.restaurants r JOIN public.restaurant_tables rt ON rt.restaurant_id = r.id
  WHERE r.slug = pg_catalog.btrim(p_slug) AND r.is_published IS TRUE
    AND rt.qr_token = p_table_token AND rt.is_active IS TRUE;
  IF NOT FOUND THEN RAISE EXCEPTION 'This table QR is invalid, inactive, or unpublished.' USING ERRCODE = '22023'; END IF;

  SELECT * INTO v_tab
  FROM public.table_session_tabs t
  WHERE t.restaurant_id = v_restaurant_id AND t.table_id = v_table_id
    AND t.guest_tab_token = p_guest_tab_token
  ORDER BY t.opened_at DESC LIMIT 1;
  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('mode', public.khaavio_public_table_billing_mode(p_slug, p_table_token), 'exists', false);
  END IF;

  SELECT ts.billing_mode INTO v_mode FROM public.table_sessions ts WHERE ts.id = v_tab.session_id;
  IF v_mode <> 'per_guest' THEN
    RETURN pg_catalog.jsonb_build_object('mode', COALESCE(v_mode, 'combined'), 'exists', false);
  END IF;

  SELECT COALESCE(pg_catalog.sum(o.total_amount) FILTER (WHERE o.status <> 'cancelled'), 0)::numeric(12,2),
         COUNT(*) FILTER (WHERE o.status <> 'cancelled')::integer
    INTO v_total, v_order_count
  FROM public.orders o WHERE o.guest_tab_id = v_tab.id;

  SELECT pg_catalog.jsonb_build_object('id', i.id, 'invoice_number', i.invoice_number,
    'total_amount', i.total_amount, 'order_count', i.order_count, 'payment_status', i.payment_status,
    'issued_at', i.issued_at, 'paid_at', i.paid_at, 'payment_method', i.payment_method)
    INTO v_invoice
  FROM public.table_session_invoices i WHERE i.guest_tab_id = v_tab.id;

  SELECT COALESCE(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'id', o.id, 'reference', pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(o.id::text, '-', ''), 1, 8)),
      'status', o.status, 'total_amount', o.total_amount, 'created_at', o.created_at,
      'items', (
        SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'id', oi.id, 'item_name', oi.item_name, 'unit_price', oi.unit_price,
          'quantity', oi.quantity, 'line_total', oi.line_total
        ) ORDER BY oi.created_at, oi.id), '[]'::jsonb)
        FROM public.order_items oi WHERE oi.order_id = o.id
      )
    ) ORDER BY o.created_at, o.id
  ), '[]'::jsonb) INTO v_orders
  FROM public.orders o WHERE o.guest_tab_id = v_tab.id;

  RETURN pg_catalog.jsonb_build_object(
    'mode', 'per_guest', 'exists', true,
    'tab', pg_catalog.jsonb_build_object('id', v_tab.id, 'display_name', v_tab.display_name,
      'status', v_tab.status, 'opened_at', v_tab.opened_at, 'closed_at', v_tab.closed_at,
      'total_amount', v_total, 'order_count', v_order_count),
    'invoice', COALESCE(v_invoice, 'null'::jsonb), 'orders', v_orders
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.khaavio_public_guest_tab_snapshot(text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.khaavio_public_guest_tab_snapshot(text, uuid, uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.place_public_order_for_guest_with_loyalty(
  p_slug text, p_table_token uuid, p_customer_name text, p_customer_phone text,
  p_notes text, p_items jsonb, p_loyalty_member_token uuid, p_loyalty_phone text,
  p_guest_tab_token uuid, p_guest_display_name text, p_guest_order_request_token uuid
)
RETURNS TABLE(order_id uuid, order_reference text, total_amount numeric, tracking_token uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_order_id uuid;
  v_order_reference text;
  v_total numeric(12,2);
  v_tracking_token uuid;
  v_restaurant_id uuid;
  v_table_id uuid;
  v_session_id uuid;
  v_mode text;
  v_tab public.table_session_tabs%ROWTYPE;
  v_display_name text;
  v_constraint_name text;
BEGIN
  IF p_guest_tab_token IS NULL OR p_guest_order_request_token IS NULL THEN
    RAISE EXCEPTION 'A guest tab and order request token are required. Refresh the menu and try again.' USING ERRCODE = '22023';
  END IF;
  v_display_name := COALESCE(NULLIF(pg_catalog.btrim(p_guest_display_name), ''), NULLIF(pg_catalog.btrim(p_customer_name), ''), 'Guest');
  IF pg_catalog.char_length(v_display_name) > 80 THEN RAISE EXCEPTION 'Guest name must be 80 characters or fewer.' USING ERRCODE = '22023'; END IF;

  SELECT r.id, rt.id INTO v_restaurant_id, v_table_id
  FROM public.restaurants r
  JOIN public.restaurant_tables rt ON rt.restaurant_id = r.id
  WHERE r.slug = pg_catalog.btrim(p_slug)
    AND r.is_published IS TRUE
    AND rt.qr_token = p_table_token
    AND rt.is_active IS TRUE;
  IF NOT FOUND THEN RAISE EXCEPTION 'This table QR is invalid, inactive, or unpublished.' USING ERRCODE = '22023'; END IF;

  -- Fast idempotency path for a retry after the original order was committed.
  SELECT o.id,
    pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(o.id::text, '-', ''), 1, 8)),
    o.total_amount, o.tracking_token
  INTO v_order_id, v_order_reference, v_total, v_tracking_token
  FROM public.orders o
  JOIN public.table_session_tabs t ON t.id = o.guest_tab_id
  WHERE o.restaurant_id = v_restaurant_id
    AND o.table_id = v_table_id
    AND o.guest_order_request_token = p_guest_order_request_token
    AND t.guest_tab_token = p_guest_tab_token
    AND t.restaurant_id = v_restaurant_id
    AND t.table_id = v_table_id
  LIMIT 1;
  IF FOUND THEN
    RETURN QUERY SELECT v_order_id, v_order_reference, v_total, v_tracking_token;
    RETURN;
  END IF;

  -- Concurrent retries race on a unique request id; catch only that constraint
  -- and return the committed order rather than creating a second kitchen ticket.
  BEGIN
    PERFORM pg_catalog.set_config('app.khaavio_guest_order_workflow', 'on', true);
    PERFORM pg_catalog.set_config('app.khaavio_guest_order_request_token', p_guest_order_request_token::text, true);
    SELECT placed.order_id, placed.order_reference, placed.total_amount, placed.tracking_token
      INTO v_order_id, v_order_reference, v_total, v_tracking_token
    FROM public.place_public_order_with_loyalty(
      p_slug, p_table_token, p_customer_name, p_customer_phone, p_notes, p_items,
      p_loyalty_member_token, p_loyalty_phone
    ) AS placed;
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_constraint_name = CONSTRAINT_NAME;
    IF v_constraint_name IS DISTINCT FROM 'orders_guest_order_request_uidx' THEN
      RAISE;
    END IF;
    SELECT o.id,
      pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(o.id::text, '-', ''), 1, 8)),
      o.total_amount, o.tracking_token
    INTO v_order_id, v_order_reference, v_total, v_tracking_token
    FROM public.orders o
    JOIN public.table_session_tabs t ON t.id = o.guest_tab_id
    WHERE o.restaurant_id = v_restaurant_id
      AND o.table_id = v_table_id
      AND o.guest_order_request_token = p_guest_order_request_token
      AND t.guest_tab_token = p_guest_tab_token
      AND t.restaurant_id = v_restaurant_id
      AND t.table_id = v_table_id
    LIMIT 1;
    IF FOUND THEN
      RETURN QUERY SELECT v_order_id, v_order_reference, v_total, v_tracking_token;
      RETURN;
    END IF;
    RAISE EXCEPTION 'This order request token was already used. Refresh the menu and submit a new order.' USING ERRCODE = '23505';
  END;
  PERFORM pg_catalog.set_config('app.khaavio_guest_order_workflow', 'off', true);
  PERFORM pg_catalog.set_config('app.khaavio_guest_order_request_token', '', true);

  SELECT o.restaurant_id, o.table_id, o.session_id, ts.billing_mode
    INTO v_restaurant_id, v_table_id, v_session_id, v_mode
  FROM public.orders o JOIN public.table_sessions ts ON ts.id = o.session_id
  WHERE o.id = v_order_id;
  IF NOT FOUND OR v_mode <> 'per_guest' THEN
    RAISE EXCEPTION 'Separate guest billing is not enabled for this table session. Refresh the menu before ordering.' USING ERRCODE = '55000';
  END IF;

  SELECT * INTO v_tab
  FROM public.table_session_tabs t
  WHERE t.restaurant_id = v_restaurant_id AND t.guest_tab_token = p_guest_tab_token
  FOR UPDATE;
  IF FOUND THEN
    IF v_tab.table_id <> v_table_id OR v_tab.session_id <> v_session_id OR v_tab.status <> 'open' THEN
      RAISE EXCEPTION 'This guest bill is no longer open. Open My Bill and start a new bill before ordering again.' USING ERRCODE = '55000';
    END IF;
  ELSE
    INSERT INTO public.table_session_tabs (restaurant_id, table_id, session_id, guest_tab_token, display_name, status)
    VALUES (v_restaurant_id, v_table_id, v_session_id, p_guest_tab_token, v_display_name, 'open')
    RETURNING * INTO v_tab;
  END IF;

  PERFORM pg_catalog.set_config('app.khaavio_allow_guest_tab_assignment', 'on', true);
  UPDATE public.orders o SET guest_tab_id = v_tab.id
  WHERE o.id = v_order_id AND o.restaurant_id = v_restaurant_id
    AND o.table_id = v_table_id AND o.session_id = v_session_id AND o.guest_tab_id IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Could not attach the order to this guest bill. Please contact staff before retrying.' USING ERRCODE = '55000'; END IF;
  PERFORM pg_catalog.set_config('app.khaavio_allow_guest_tab_assignment', 'off', true);

  RETURN QUERY SELECT v_order_id, v_order_reference, v_total, v_tracking_token;
END;
$function$;
REVOKE ALL ON FUNCTION public.place_public_order_for_guest_with_loyalty(text, uuid, text, text, text, jsonb, uuid, text, uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.place_public_order_for_guest_with_loyalty(text, uuid, text, text, text, jsonb, uuid, text, uuid, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.khaavio_finalize_guest_tab(p_guest_tab_id uuid)
RETURNS TABLE(invoice_id uuid, invoice_number text, total_amount numeric, order_count integer, payment_status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_restaurant_id uuid;
  v_table_id uuid;
  v_session_id uuid;
  v_session_status text;
  v_mode text;
  v_tab public.table_session_tabs%ROWTYPE;
  v_invoice_id uuid;
  v_invoice_number text;
  v_total numeric(12,2);
  v_items_total numeric(12,2);
  v_order_count integer;
  v_unfinished integer;
  v_payment_status text;
BEGIN
  SELECT t.restaurant_id, t.table_id, t.session_id INTO v_restaurant_id, v_table_id, v_session_id
  FROM public.table_session_tabs t WHERE t.id = p_guest_tab_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Guest bill not found.' USING ERRCODE = 'P0002'; END IF;

  PERFORM 1 FROM public.restaurant_tables rt
  WHERE rt.id = v_table_id AND rt.restaurant_id = v_restaurant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'The restaurant table no longer exists.'; END IF;

  SELECT ts.status, ts.billing_mode INTO v_session_status, v_mode
  FROM public.table_sessions ts
  WHERE ts.id = v_session_id AND ts.restaurant_id = v_restaurant_id AND ts.table_id = v_table_id
  FOR UPDATE;
  IF NOT FOUND OR v_mode <> 'per_guest' THEN RAISE EXCEPTION 'This guest tab does not belong to a separate-billing session.'; END IF;

  SELECT * INTO v_tab FROM public.table_session_tabs t WHERE t.id = p_guest_tab_id AND t.session_id = v_session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Guest bill no longer exists.'; END IF;

  SELECT i.id, i.invoice_number, i.total_amount, i.order_count, i.payment_status
    INTO v_invoice_id, v_invoice_number, v_total, v_order_count, v_payment_status
  FROM public.table_session_invoices i WHERE i.guest_tab_id = p_guest_tab_id FOR UPDATE;
  IF FOUND THEN RETURN QUERY SELECT v_invoice_id, v_invoice_number, v_total, v_order_count, v_payment_status; RETURN; END IF;

  IF v_session_status = 'closed' OR v_tab.status <> 'open' THEN RAISE EXCEPTION 'This guest bill is not open.'; END IF;

  SELECT COUNT(*)::integer INTO v_unfinished FROM public.orders o
  WHERE o.guest_tab_id = p_guest_tab_id AND o.status NOT IN ('completed', 'cancelled');
  IF v_unfinished > 0 THEN RAISE EXCEPTION 'Complete or cancel all orders for this guest before generating the final bill.' USING ERRCODE = '55000'; END IF;

  SELECT COUNT(*)::integer, COALESCE(pg_catalog.sum(o.total_amount), 0)::numeric(12,2)
    INTO v_order_count, v_total
  FROM public.orders o WHERE o.guest_tab_id = p_guest_tab_id AND o.status <> 'cancelled';
  IF v_order_count < 1 THEN RAISE EXCEPTION 'There are no billable orders for this guest yet.'; END IF;

  SELECT COALESCE(pg_catalog.sum(oi.line_total), 0)::numeric(12,2)
    INTO v_items_total
  FROM public.order_items oi JOIN public.orders o ON o.id = oi.order_id
  WHERE o.guest_tab_id = p_guest_tab_id AND o.status <> 'cancelled';
  IF v_items_total <> v_total THEN RAISE EXCEPTION 'Guest order totals do not match the saved order items. Please review this bill.'; END IF;

  v_invoice_number := 'KHV-' || pg_catalog.to_char(pg_catalog.now(), 'YYYYMMDD')
    || '-' || pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', ''), 1, 8));

  INSERT INTO public.table_session_invoices (
    restaurant_id, table_id, session_id, guest_tab_id, invoice_number,
    total_amount, order_count, payment_status, issued_by
  ) VALUES (
    v_restaurant_id, v_table_id, v_session_id, p_guest_tab_id, v_invoice_number,
    v_total, v_order_count, 'unpaid', NULL
  ) RETURNING id INTO v_invoice_id;

  INSERT INTO public.table_session_invoice_items (
    invoice_id, order_id, order_reference, order_created_at, customer_name,
    item_name, unit_price, quantity, line_total
  )
  SELECT v_invoice_id, o.id,
    pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(o.id::text, '-', ''), 1, 8)),
    o.created_at, o.customer_name, oi.item_name, oi.unit_price, oi.quantity, oi.line_total
  FROM public.orders o JOIN public.order_items oi ON oi.order_id = o.id
  WHERE o.guest_tab_id = p_guest_tab_id AND o.status <> 'cancelled'
  ORDER BY o.created_at, o.id, oi.created_at, oi.id;

  UPDATE public.table_session_tabs SET status = 'billing'
  WHERE id = p_guest_tab_id AND status = 'open';

  IF NOT EXISTS (SELECT 1 FROM public.table_session_tabs t WHERE t.session_id = v_session_id AND t.status = 'open') THEN
    UPDATE public.table_sessions SET status = 'billing'
    WHERE id = v_session_id AND status = 'open';
  END IF;

  RETURN QUERY SELECT v_invoice_id, v_invoice_number, v_total, v_order_count, 'unpaid'::text;
END;
$function$;
REVOKE ALL ON FUNCTION public.khaavio_finalize_guest_tab(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.finalize_public_guest_tab(p_slug text, p_table_token uuid, p_guest_tab_token uuid)
RETURNS TABLE(invoice_id uuid, invoice_number text, total_amount numeric, order_count integer, payment_status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE v_restaurant_id uuid; v_table_id uuid; v_tab_id uuid;
BEGIN
  SELECT r.id, rt.id INTO v_restaurant_id, v_table_id
  FROM public.restaurants r JOIN public.restaurant_tables rt ON rt.restaurant_id = r.id
  WHERE r.slug = pg_catalog.btrim(p_slug) AND r.is_published IS TRUE
    AND rt.qr_token = p_table_token AND rt.is_active IS TRUE;
  IF NOT FOUND THEN RAISE EXCEPTION 'This table QR is invalid, inactive, or unpublished.'; END IF;
  SELECT t.id INTO v_tab_id FROM public.table_session_tabs t
  WHERE t.restaurant_id = v_restaurant_id AND t.table_id = v_table_id AND t.guest_tab_token = p_guest_tab_token;
  IF NOT FOUND THEN RAISE EXCEPTION 'Your guest bill was not found. Place an order first.'; END IF;
  RETURN QUERY SELECT * FROM public.khaavio_finalize_guest_tab(v_tab_id);
END;
$function$;
REVOKE ALL ON FUNCTION public.finalize_public_guest_tab(text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_public_guest_tab(text, uuid, uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.finalize_guest_tab_invoice(p_guest_tab_id uuid)
RETURNS TABLE(invoice_id uuid, invoice_number text, total_amount numeric, order_count integer, payment_status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.table_session_tabs t JOIN public.restaurants r ON r.id = t.restaurant_id
    WHERE t.id = p_guest_tab_id AND r.owner_id = (SELECT auth.uid())
  ) THEN RAISE EXCEPTION 'Guest bill not found or access denied.' USING ERRCODE = '42501'; END IF;
  RETURN QUERY SELECT * FROM public.khaavio_finalize_guest_tab(p_guest_tab_id);
END;
$function$;
REVOKE ALL ON FUNCTION public.finalize_guest_tab_invoice(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finalize_guest_tab_invoice(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_guest_tab_invoice_paid(p_invoice_id uuid, p_payment_method text)
RETURNS TABLE(invoice_id uuid, invoice_number text, total_amount numeric, payment_status text, paid_at timestamptz, payment_method text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  v_restaurant_id uuid; v_table_id uuid; v_session_id uuid; v_tab_id uuid;
  v_status text; v_paid_at timestamptz; v_method text; v_invoice_number text; v_total numeric(12,2);
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication is required to record invoice payment.' USING ERRCODE = '42501'; END IF;
  v_method := NULLIF(pg_catalog.btrim(p_payment_method), '');
  IF v_method IS NULL OR pg_catalog.char_length(v_method) > 40 THEN RAISE EXCEPTION 'Enter a valid payment method (maximum 40 characters).'; END IF;

  SELECT i.restaurant_id, i.table_id, i.session_id, i.guest_tab_id
    INTO v_restaurant_id, v_table_id, v_session_id, v_tab_id
  FROM public.table_session_invoices i JOIN public.restaurants r ON r.id = i.restaurant_id
  WHERE i.id = p_invoice_id AND r.owner_id = (SELECT auth.uid());
  IF NOT FOUND OR v_tab_id IS NULL THEN RAISE EXCEPTION 'Guest invoice not found or access denied.' USING ERRCODE = '42501'; END IF;

  PERFORM 1 FROM public.restaurant_tables rt WHERE rt.id = v_table_id AND rt.restaurant_id = v_restaurant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'The restaurant table no longer exists.'; END IF;
  PERFORM 1 FROM public.table_sessions ts WHERE ts.id = v_session_id AND ts.restaurant_id = v_restaurant_id AND ts.table_id = v_table_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'The table session no longer exists.'; END IF;
  PERFORM 1 FROM public.table_session_tabs t WHERE t.id = v_tab_id AND t.session_id = v_session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'The guest tab no longer exists.'; END IF;

  SELECT i.payment_status, i.paid_at, i.invoice_number, i.total_amount, i.payment_method
    INTO v_status, v_paid_at, v_invoice_number, v_total, v_method
  FROM public.table_session_invoices i WHERE i.id = p_invoice_id AND i.guest_tab_id = v_tab_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'The guest invoice no longer exists.'; END IF;
  IF v_status = 'void' THEN RAISE EXCEPTION 'A void invoice cannot be marked as paid.'; END IF;

  IF v_status <> 'paid' THEN
    PERFORM pg_catalog.set_config('app.khaavio_guest_invoice_payment', 'on', true);
    UPDATE public.table_session_invoices i SET payment_status = 'paid', paid_at = pg_catalog.now(), payment_method = v_method
    WHERE i.id = p_invoice_id;
    SELECT i.payment_status, i.paid_at, i.payment_method INTO v_status, v_paid_at, v_method
    FROM public.table_session_invoices i WHERE i.id = p_invoice_id;
  END IF;

  UPDATE public.table_session_tabs SET status = 'closed', closed_at = COALESCE(closed_at, pg_catalog.now())
  WHERE id = v_tab_id AND status <> 'closed';

  IF EXISTS (SELECT 1 FROM public.table_session_tabs t WHERE t.session_id = v_session_id AND t.status = 'open') THEN
    UPDATE public.table_sessions SET status = 'open', closed_at = NULL, closed_by = NULL WHERE id = v_session_id;
  ELSIF EXISTS (SELECT 1 FROM public.table_session_tabs t WHERE t.session_id = v_session_id AND t.status = 'billing') THEN
    UPDATE public.table_sessions SET status = 'billing', closed_at = NULL, closed_by = NULL WHERE id = v_session_id;
  ELSE
    UPDATE public.table_sessions SET status = 'closed', closed_at = COALESCE(closed_at, pg_catalog.now()),
      closed_by = COALESCE(closed_by, (SELECT auth.uid())) WHERE id = v_session_id;
  END IF;

  RETURN QUERY SELECT p_invoice_id, v_invoice_number, v_total, v_status, v_paid_at, v_method;
END;
$function$;
REVOKE ALL ON FUNCTION public.mark_guest_tab_invoice_paid(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_guest_tab_invoice_paid(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.khaavio_award_loyalty_stamp_for_order(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_restaurant_id uuid;
  v_session_id uuid;
  v_guest_tab_id uuid;
  v_status text;
  v_total numeric(12,2);
  v_member_id uuid;
  v_enabled boolean;
  v_goal integer;
  v_minimum numeric(12,2);
  v_reward_name text;
  v_balance integer;
  v_code text;
BEGIN
  SELECT o.restaurant_id, o.session_id, o.status, o.total_amount, o.loyalty_member_id, o.guest_tab_id
    INTO v_restaurant_id, v_session_id, v_status, v_total, v_member_id, v_guest_tab_id
  FROM public.orders o WHERE o.id = p_order_id;

  IF NOT FOUND OR v_status <> 'completed' OR v_session_id IS NULL OR v_member_id IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.table_session_invoices i
    WHERE i.restaurant_id = v_restaurant_id
      AND i.session_id = v_session_id
      AND i.guest_tab_id IS NOT DISTINCT FROM v_guest_tab_id
      AND i.payment_status = 'paid'
  ) THEN
    RETURN;
  END IF;

  SELECT lp.enabled, lp.stamps_required, lp.min_order_amount, lp.reward_name
    INTO v_enabled, v_goal, v_minimum, v_reward_name
  FROM public.restaurant_loyalty_programs lp
  WHERE lp.restaurant_id = v_restaurant_id;
  IF NOT FOUND OR v_enabled IS NOT TRUE OR v_total < v_minimum THEN
    RETURN;
  END IF;

  PERFORM 1 FROM public.restaurant_loyalty_members lm
  WHERE lm.id = v_member_id AND lm.restaurant_id = v_restaurant_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;

  IF EXISTS (
    SELECT 1 FROM public.restaurant_loyalty_ledger l
    WHERE l.entry_type = 'stamp_earned' AND l.order_id = p_order_id
  ) THEN
    RETURN;
  END IF;

  INSERT INTO public.restaurant_loyalty_ledger (restaurant_id, member_id, order_id, entry_type, stamps_delta, note)
  VALUES (v_restaurant_id, v_member_id, p_order_id, 'stamp_earned', 1, 'Eligible completed and paid order');

  SELECT COALESCE(pg_catalog.sum(l.stamps_delta), 0)::integer INTO v_balance
  FROM public.restaurant_loyalty_ledger l WHERE l.member_id = v_member_id;

  WHILE v_balance >= v_goal LOOP
    LOOP
      v_code := pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', ''), 1, 10));
      EXIT WHEN NOT EXISTS (
        SELECT 1 FROM public.restaurant_loyalty_rewards rw
        WHERE rw.restaurant_id = v_restaurant_id AND rw.redemption_code = v_code
      );
    END LOOP;

    -- Phase 1: make the unlocked reward immediately visible; no scratch/reveal mechanic yet.
    INSERT INTO public.restaurant_loyalty_rewards (
      restaurant_id, member_id, unlock_order_id, reward_name, redemption_code, revealed_at
    )
    VALUES (v_restaurant_id, v_member_id, p_order_id, v_reward_name, v_code, pg_catalog.now());

    INSERT INTO public.restaurant_loyalty_ledger (restaurant_id, member_id, entry_type, stamps_delta, note)
    VALUES (v_restaurant_id, v_member_id, 'reward_unlocked', -v_goal, 'Stamps used to unlock a reward');
    v_balance := v_balance - v_goal;
  END LOOP;
END;
$function$;
REVOKE ALL ON FUNCTION public.khaavio_award_loyalty_stamp_for_order(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.finalize_table_session(p_session_id uuid)
RETURNS TABLE (
    invoice_id uuid,
    invoice_number text,
    total_amount numeric,
    order_count integer,
    payment_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
declare
    v_restaurant_id uuid;
    v_table_id uuid;
    v_billing_mode text;
    v_session_status text;
    v_payment_status text;
    v_invoice_id uuid;
    v_invoice_number text;
    v_total numeric(12,2);
    v_items_total numeric(12,2);
    v_order_count integer;
    v_unfinished_count integer;
begin
    if auth.uid() is null then
        raise exception 'Authentication is required to finalize a table bill.' using errcode = '42501';
    end if;
    if p_session_id is null then
        raise exception 'A table session is required.';
    end if;

    -- Verify owner access and get the physical table. Do not lock the session yet:
    -- lock order matches place_public_order (table first, session second).
    select ts.restaurant_id, ts.table_id, ts.billing_mode
      into v_restaurant_id, v_table_id, v_billing_mode
    from public.table_sessions ts
    join public.restaurants r on r.id = ts.restaurant_id
    where ts.id = p_session_id
      and r.owner_id = (select auth.uid());

    if not found then
        raise exception 'Table session not found or access denied.' using errcode = '42501';
    end if;
    if v_billing_mode = 'per_guest' then
        raise exception 'This table uses separate guest bills. Finalize each guest tab instead.' using errcode = '55000';
    end if;

    perform 1
    from public.restaurant_tables rt
    where rt.id = v_table_id
      and rt.restaurant_id = v_restaurant_id
    for update;

    if not found then
        raise exception 'The restaurant table no longer exists.';
    end if;

    select ts.status
      into v_session_status
    from public.table_sessions ts
    where ts.id = p_session_id
      and ts.restaurant_id = v_restaurant_id
      and ts.table_id = v_table_id
    for update;

    if not found then
        raise exception 'Table session no longer exists.';
    end if;

    -- Idempotency: if the invoice was already created, return it.
    select i.id, i.invoice_number, i.total_amount, i.order_count, i.payment_status
      into v_invoice_id, v_invoice_number, v_total, v_order_count, v_payment_status
    from public.table_session_invoices i
    where i.session_id = p_session_id
      and i.guest_tab_id is null;

    if found then
        return query
        select v_invoice_id, v_invoice_number, v_total, v_order_count, v_payment_status;
        return;
    end if;

    -- No invoice exists yet, so only an open session can be finalized.
    select ts.status
      into v_session_status
    from public.table_sessions ts
    where ts.id = p_session_id
      and ts.restaurant_id = v_restaurant_id
    for update;

    if v_session_status is distinct from 'open' then
        raise exception 'This table session is already closed and has no invoice.';
    end if;

    -- Prevent locking the final invoice while any non-cancelled order is still
    -- in the kitchen workflow. After issuance, session-linked orders are frozen.
    select count(*)::integer
      into v_unfinished_count
    from public.orders o
    where o.session_id = p_session_id
      and o.status not in ('completed', 'cancelled');

    if v_unfinished_count > 0 then
        raise exception 'Complete or cancel all orders before generating the final bill.'
            using errcode = '55000';
    end if;

    select count(*)::integer, coalesce(sum(o.total_amount), 0)::numeric(12,2)
      into v_order_count, v_total
    from public.orders o
    where o.session_id = p_session_id
      and o.status <> 'cancelled';

    if v_order_count < 1 then
        raise exception 'There are no billable orders in this table session.';
    end if;

    select coalesce(sum(oi.line_total), 0)::numeric(12,2)
      into v_items_total
    from public.order_items oi
    join public.orders o ON o.id = oi.order_id
    where o.session_id = p_session_id
      and o.status <> 'cancelled';

    if v_items_total <> v_total then
        raise exception 'Order totals do not match saved order items. Review the session before issuing its final invoice.';
    end if;

    v_invoice_number := 'KHV-' || pg_catalog.to_char(pg_catalog.now(), 'YYYYMMDD')
        || '-' || pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', ''), 1, 8));

    insert into public.table_session_invoices (
        restaurant_id, table_id, session_id, invoice_number,
        total_amount, order_count, payment_status, issued_by
    ) values (
        v_restaurant_id, v_table_id, p_session_id, v_invoice_number,
        v_total, v_order_count, 'unpaid', (select auth.uid())
    )
    returning id into v_invoice_id;

    insert into public.table_session_invoice_items (
        invoice_id, order_id, order_reference, order_created_at, customer_name,
        item_name, unit_price, quantity, line_total
    )
    select
        v_invoice_id,
        o.id,
        pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(o.id::text, '-', ''), 1, 8)),
        o.created_at,
        o.customer_name,
        oi.item_name,
        oi.unit_price,
        oi.quantity,
        oi.line_total
    from public.orders o
    join public.order_items oi ON oi.order_id = o.id
    where o.session_id = p_session_id
      and o.status <> 'cancelled'
    order by o.created_at, o.id, oi.created_at, oi.id;

    -- An unpaid issued invoice blocks new QR orders for this table.
    update public.table_sessions
    set status = 'billing'
    where id = p_session_id
      and restaurant_id = v_restaurant_id;

    return query
    select v_invoice_id, v_invoice_number, v_total, v_order_count, 'unpaid'::text;
end;
$function$;

-- Once a guest invoice is issued, freeze that guest's source orders even when
-- the shared table session remains open for other guests.
CREATE OR REPLACE FUNCTION public.khaavio_guard_closed_guest_tab_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_tab_status text;
BEGIN
  IF OLD.guest_tab_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT t.status INTO v_tab_status
  FROM public.table_session_tabs t
  WHERE t.id = OLD.guest_tab_id
  FOR UPDATE;
  IF NOT FOUND OR v_tab_status <> 'open' THEN
    RAISE EXCEPTION 'Orders belonging to a guest bill cannot be changed after billing starts.' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.khaavio_guard_closed_guest_tab_updates() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS khaavio_z_guard_closed_guest_tab_updates ON public.orders;
CREATE TRIGGER khaavio_z_guard_closed_guest_tab_updates
BEFORE UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.khaavio_guard_closed_guest_tab_updates();

COMMIT;
