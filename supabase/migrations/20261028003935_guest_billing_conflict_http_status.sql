-- Khaavio: return HTTP 409 for expected guest-billing workflow conflicts.
-- PostgREST maps PTxyz SQLSTATE values to the corresponding HTTP status code.
-- The exception still rolls back the RPC transaction; only the response status changes.
BEGIN;

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
    -- A concurrent retry may have won the unique request ID. Return only an
    -- existing order bound to the same QR table and guest token; otherwise
    -- rethrow the original uniqueness error.
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
    RAISE;
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
      RAISE EXCEPTION 'This guest bill is no longer open. Open My Bill and start a new bill before ordering again.' USING ERRCODE = 'PT409';
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
  FROM public.table_session_invoices i
  WHERE i.guest_tab_id = p_guest_tab_id AND i.payment_status <> 'void'
  FOR UPDATE;
  IF FOUND THEN RETURN QUERY SELECT v_invoice_id, v_invoice_number, v_total, v_order_count, v_payment_status; RETURN; END IF;

  IF v_session_status = 'closed' OR v_tab.status <> 'open' THEN RAISE EXCEPTION 'This guest bill is not open.'; END IF;

  SELECT COUNT(*)::integer INTO v_unfinished FROM public.orders o
  WHERE o.guest_tab_id = p_guest_tab_id AND o.status NOT IN ('completed', 'cancelled');
  IF v_unfinished > 0 THEN RAISE EXCEPTION 'Complete or cancel all orders for this guest before generating the final bill.' USING ERRCODE = 'PT409'; END IF;

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

COMMIT;
