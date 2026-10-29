-- Qualify INSERT RETURNING columns that collide with RETURNS TABLE output names.

CREATE OR REPLACE FUNCTION public.place_public_order(p_slug text, p_table_token uuid, p_customer_name text, p_customer_phone text, p_notes text, p_items jsonb)
RETURNS TABLE(order_id uuid, order_reference text, total_amount numeric, tracking_token uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE v_restaurant_id uuid; v_table_id uuid; v_session_id uuid; v_session_status text; v_order_id uuid; v_tracking uuid; v_total numeric(12,2); v_name text; v_phone text; v_notes text; v_accepting boolean; v_dine_in_enabled boolean; v_hours jsonb; v_timezone text;
BEGIN
  IF p_slug IS NULL OR pg_catalog.btrim(p_slug) = '' OR p_table_token IS NULL THEN RAISE EXCEPTION 'A valid restaurant table is required.' USING ERRCODE = '22023'; END IF;
  v_name := pg_catalog.btrim(p_customer_name); v_phone := public.khaavio_normalize_indian_mobile(p_customer_phone); v_notes := NULLIF(pg_catalog.btrim(p_notes), '');
  IF v_name IS NULL OR pg_catalog.char_length(v_name) NOT BETWEEN 1 AND 80 THEN RAISE EXCEPTION 'Enter your name (maximum 80 characters).' USING ERRCODE = '22023'; END IF;
  IF v_phone IS NULL THEN RAISE EXCEPTION 'Enter a valid 10-digit Indian mobile number.' USING ERRCODE = '22023'; END IF;
  IF v_notes IS NOT NULL AND pg_catalog.char_length(v_notes) > 500 THEN RAISE EXCEPTION 'Order notes must be 500 characters or fewer.' USING ERRCODE = '22023'; END IF;
  SELECT r.id, rt.id, r.is_accepting_orders, r.dine_in_enabled, r.business_hours, r.timezone INTO v_restaurant_id, v_table_id, v_accepting, v_dine_in_enabled, v_hours, v_timezone
  FROM public.restaurants r JOIN public.restaurant_tables rt ON rt.restaurant_id = r.id
  WHERE r.slug = pg_catalog.btrim(p_slug) AND r.is_published AND rt.qr_token = p_table_token AND rt.is_active FOR SHARE OF r FOR UPDATE OF rt;
  IF NOT FOUND THEN RAISE EXCEPTION 'This table QR is invalid, inactive, or unpublished.' USING ERRCODE = '22023'; END IF;
  IF v_dine_in_enabled IS NOT TRUE THEN RAISE EXCEPTION 'Dine-in ordering is currently disabled at this restaurant.' USING ERRCODE = '55000'; END IF;
  IF NOT public.khaavio_restaurant_subscription_allows_operations(v_restaurant_id) OR v_accepting IS NOT TRUE OR NOT public.khaavio_restaurant_open_at(v_hours, v_timezone, pg_catalog.now()) THEN RAISE EXCEPTION 'Online ordering is not available right now.' USING ERRCODE = '55000'; END IF;
  SELECT ts.id, ts.status INTO v_session_id, v_session_status FROM public.table_sessions ts WHERE ts.restaurant_id = v_restaurant_id AND ts.table_id = v_table_id AND ts.status IN ('open', 'billing') FOR UPDATE;
  IF FOUND AND v_session_status = 'billing' THEN RAISE EXCEPTION 'The final bill is awaiting payment. Ask staff to complete checkout.' USING ERRCODE = '55000'; END IF;
  IF v_session_id IS NULL THEN INSERT INTO public.table_sessions (restaurant_id, table_id, status) VALUES (v_restaurant_id, v_table_id, 'open') RETURNING id INTO v_session_id; END IF;
  INSERT INTO public.orders AS inserted_order (restaurant_id, table_id, session_id, customer_name, customer_phone, notes, status, total_amount, service_mode)
    VALUES (v_restaurant_id, v_table_id, v_session_id, v_name, v_phone, v_notes, 'pending', 0, 'dine_in') RETURNING inserted_order.id, inserted_order.tracking_token INTO v_order_id, v_tracking;
  v_total := public.khaavio_insert_order_item_lines(v_order_id, v_restaurant_id, p_items);
  UPDATE public.orders SET total_amount = v_total WHERE id = v_order_id;
  RETURN QUERY SELECT v_order_id, pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(v_order_id::text, '-', ''), 1, 8)), v_total, v_tracking;
END;
$function$;

CREATE OR REPLACE FUNCTION public.place_public_order_for_service_mode(p_slug text, p_customer_name text, p_customer_phone text, p_notes text, p_items jsonb, p_service_mode text, p_pickup_eta_minutes smallint, p_coupon_code text, p_loyalty_phone text DEFAULT NULL)
RETURNS TABLE(order_id uuid, order_reference text, total_amount numeric, tracking_token uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE v_restaurant_id uuid; v_accepting boolean; v_hours jsonb; v_timezone text; v_name text; v_phone text; v_notes text; v_order_id uuid; v_tracking uuid; v_total numeric(12,2); v_final numeric(12,2); v_member uuid; v_loyalty_phone text;
BEGIN
  IF p_service_mode NOT IN ('pickup', 'dine_in') THEN RAISE EXCEPTION 'Choose pickup or dine-in.' USING ERRCODE = '22023'; END IF;
  v_name := pg_catalog.btrim(p_customer_name); v_phone := public.khaavio_normalize_indian_mobile(p_customer_phone); v_notes := NULLIF(pg_catalog.btrim(p_notes), '');
  IF v_name IS NULL OR pg_catalog.char_length(v_name) NOT BETWEEN 1 AND 80 OR v_phone IS NULL THEN RAISE EXCEPTION 'Enter your name and a valid mobile number.' USING ERRCODE = '22023'; END IF;
  IF v_notes IS NOT NULL AND pg_catalog.char_length(v_notes) > 500 THEN RAISE EXCEPTION 'Instructions must be 500 characters or fewer.' USING ERRCODE = '22023'; END IF;
  IF p_service_mode = 'pickup' AND (p_pickup_eta_minutes IS NULL OR p_pickup_eta_minutes NOT IN (0, 15, 30, 45, 60)) THEN RAISE EXCEPTION 'Choose a valid pickup time.' USING ERRCODE = '22023'; END IF;
  IF p_service_mode = 'dine_in' AND p_pickup_eta_minutes IS NOT NULL THEN RAISE EXCEPTION 'Pickup time only applies to pickup.' USING ERRCODE = '22023'; END IF;
  SELECT r.id, r.is_accepting_orders, r.business_hours, r.timezone INTO v_restaurant_id, v_accepting, v_hours, v_timezone FROM public.restaurants r
    WHERE r.slug = pg_catalog.btrim(p_slug) AND r.is_published AND ((p_service_mode = 'pickup' AND r.pickup_enabled) OR (p_service_mode = 'dine_in' AND r.dine_in_enabled)) FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'This order mode is not available.' USING ERRCODE = '22023'; END IF;
  IF NOT public.khaavio_restaurant_subscription_allows_operations(v_restaurant_id) OR v_accepting IS NOT TRUE OR NOT public.khaavio_restaurant_open_at(v_hours, v_timezone, pg_catalog.now()) THEN RAISE EXCEPTION 'Online ordering is not available right now.' USING ERRCODE = '55000'; END IF;
  INSERT INTO public.orders AS inserted_order (restaurant_id, table_id, session_id, customer_name, customer_phone, notes, status, total_amount, service_mode, pickup_eta_minutes)
    VALUES (v_restaurant_id, NULL, NULL, v_name, v_phone, v_notes, 'pending', 0, p_service_mode, CASE WHEN p_service_mode = 'pickup' THEN p_pickup_eta_minutes END) RETURNING inserted_order.id, inserted_order.tracking_token INTO v_order_id, v_tracking;
  v_total := public.khaavio_insert_order_item_lines(v_order_id, v_restaurant_id, p_items);
  UPDATE public.orders SET total_amount = v_total WHERE id = v_order_id;
  v_final := public.khaavio_apply_order_coupon(v_order_id, p_coupon_code);
  IF p_loyalty_phone IS NOT NULL AND pg_catalog.btrim(p_loyalty_phone) <> '' THEN
    v_loyalty_phone := public.khaavio_normalize_indian_mobile(p_loyalty_phone);
    IF v_loyalty_phone IS NULL THEN RAISE EXCEPTION 'Enter a valid Loyalty mobile number or continue without Loyalty.' USING ERRCODE = '22023'; END IF;
    SELECT lm.id INTO v_member FROM public.restaurant_loyalty_members lm JOIN public.restaurant_loyalty_programs lp ON lp.restaurant_id = lm.restaurant_id AND lp.enabled WHERE lm.restaurant_id = v_restaurant_id AND lm.phone_number = v_loyalty_phone;
    IF v_member IS NOT NULL THEN
      PERFORM pg_catalog.set_config('app.khaavio_assign_loyalty_member', 'on', true);
      UPDATE public.orders SET loyalty_member_id = v_member WHERE id = v_order_id;
      PERFORM pg_catalog.set_config('app.khaavio_assign_loyalty_member', 'off', true);
    END IF;
  END IF;
  RETURN QUERY SELECT v_order_id, pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(v_order_id::text, '-', ''), 1, 8)), v_final, v_tracking;
END;
$function$;

CREATE OR REPLACE FUNCTION public.khaavio_finalize_guest_tab(p_guest_tab_id uuid)
RETURNS TABLE(invoice_id uuid, invoice_number text, total_amount numeric, order_count integer, payment_status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE v_restaurant_id uuid; v_table_id uuid; v_session_id uuid; v_session_status text; v_mode text;
  v_tab public.table_session_tabs%ROWTYPE; v_invoice_id uuid; v_invoice_number text;
  v_total numeric(12,2); v_items_total numeric(12,2); v_order_count integer; v_unfinished integer; v_payment_status text;
BEGIN
  SELECT t.restaurant_id, t.table_id, t.session_id INTO v_restaurant_id, v_table_id, v_session_id
  FROM public.table_session_tabs t WHERE t.id = p_guest_tab_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Guest bill not found.' USING ERRCODE = 'P0002'; END IF;
  PERFORM 1 FROM public.restaurant_tables rt WHERE rt.id = v_table_id AND rt.restaurant_id = v_restaurant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'The restaurant table no longer exists.'; END IF;
  SELECT ts.status, ts.billing_mode INTO v_session_status, v_mode FROM public.table_sessions ts
  WHERE ts.id = v_session_id AND ts.restaurant_id = v_restaurant_id AND ts.table_id = v_table_id FOR UPDATE;
  IF NOT FOUND OR v_mode <> 'per_guest' THEN RAISE EXCEPTION 'This guest tab does not belong to a separate-billing session.'; END IF;
  SELECT * INTO v_tab FROM public.table_session_tabs t WHERE t.id = p_guest_tab_id AND t.session_id = v_session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Guest bill no longer exists.'; END IF;
  SELECT i.id, i.invoice_number, i.total_amount, i.order_count, i.payment_status
    INTO v_invoice_id, v_invoice_number, v_total, v_order_count, v_payment_status
  FROM public.table_session_invoices i WHERE i.guest_tab_id = p_guest_tab_id AND i.payment_status <> 'void' FOR UPDATE;
  IF FOUND THEN RETURN QUERY SELECT v_invoice_id, v_invoice_number, v_total, v_order_count, v_payment_status; RETURN; END IF;
  IF v_session_status = 'closed' OR v_tab.status <> 'open' THEN RAISE EXCEPTION 'This guest bill is not open.'; END IF;
  SELECT COUNT(*)::integer INTO v_unfinished FROM public.orders o
  WHERE o.guest_tab_id = p_guest_tab_id AND o.status NOT IN ('completed', 'cancelled');
  IF v_unfinished > 0 THEN RAISE EXCEPTION 'Complete or cancel all orders for this guest before generating the final bill.' USING ERRCODE = '55000'; END IF;
  SELECT COUNT(*)::integer, COALESCE(pg_catalog.sum(o.total_amount), 0)::numeric(12,2)
    INTO v_order_count, v_total FROM public.orders o WHERE o.guest_tab_id = p_guest_tab_id AND o.status <> 'cancelled';
  IF v_order_count < 1 THEN RAISE EXCEPTION 'There are no billable orders for this guest yet.'; END IF;
  SELECT COALESCE(pg_catalog.sum(oi.line_total), 0)::numeric(12,2) INTO v_items_total
  FROM public.order_items oi JOIN public.orders o ON o.id = oi.order_id
  WHERE o.guest_tab_id = p_guest_tab_id AND o.status <> 'cancelled';
  IF v_items_total <> (SELECT COALESCE(pg_catalog.sum(o.total_amount + o.discount_amount), 0)
      FROM public.orders o WHERE o.guest_tab_id = p_guest_tab_id AND o.status <> 'cancelled') THEN
    RAISE EXCEPTION 'Guest order totals do not match the saved order items. Please review this bill.';
  END IF;
  v_invoice_number := 'KHV-' || pg_catalog.to_char(pg_catalog.now(), 'YYYYMMDD') || '-' ||
    pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', ''), 1, 8));
  INSERT INTO public.table_session_invoices AS inserted_invoice (restaurant_id, table_id, session_id, guest_tab_id, invoice_number,
    total_amount, order_count, payment_status, issued_by)
  VALUES (v_restaurant_id, v_table_id, v_session_id, p_guest_tab_id, v_invoice_number, v_total, v_order_count, 'unpaid', NULL)
  RETURNING inserted_invoice.id, inserted_invoice.total_amount INTO v_invoice_id, v_total;
  INSERT INTO public.table_session_invoice_items (invoice_id, order_id, order_reference, order_created_at, customer_name,
    item_name, unit_price, quantity, line_total)
  SELECT v_invoice_id, o.id, pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(o.id::text, '-', ''), 1, 8)),
    o.created_at, o.customer_name, oi.item_name, oi.unit_price, oi.quantity, oi.line_total
  FROM public.orders o JOIN public.order_items oi ON oi.order_id = o.id
  WHERE o.guest_tab_id = p_guest_tab_id AND o.status <> 'cancelled' ORDER BY o.created_at, o.id, oi.created_at, oi.id;
  UPDATE public.table_session_tabs SET status = 'billing' WHERE id = p_guest_tab_id AND status = 'open';
  IF NOT EXISTS (SELECT 1 FROM public.table_session_tabs t WHERE t.session_id = v_session_id AND t.status = 'open') THEN
    UPDATE public.table_sessions SET status = 'billing' WHERE id = v_session_id AND status = 'open';
  END IF;
  RETURN QUERY SELECT v_invoice_id, v_invoice_number, v_total, v_order_count, 'unpaid'::text;
END;
$function$;

CREATE OR REPLACE FUNCTION public.finalize_table_session(p_session_id uuid)
RETURNS TABLE(invoice_id uuid, invoice_number text, total_amount numeric, order_count integer, payment_status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE v_restaurant_id uuid; v_table_id uuid; v_billing_mode text; v_session_status text;
  v_payment_status text; v_invoice_id uuid; v_invoice_number text; v_total numeric(12,2);
  v_items_total numeric(12,2); v_order_count integer; v_unfinished_count integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication is required to finalize a table bill.' USING ERRCODE = '42501'; END IF;
  IF p_session_id IS NULL THEN RAISE EXCEPTION 'A table session is required.'; END IF;
  SELECT ts.restaurant_id, ts.table_id, ts.billing_mode INTO v_restaurant_id, v_table_id, v_billing_mode
  FROM public.table_sessions ts JOIN public.restaurants r ON r.id = ts.restaurant_id
  WHERE ts.id = p_session_id AND r.owner_id = (SELECT auth.uid());
  IF NOT FOUND THEN RAISE EXCEPTION 'Table session not found or access denied.' USING ERRCODE = '42501'; END IF;
  IF v_billing_mode = 'per_guest' THEN RAISE EXCEPTION 'This table uses separate guest bills. Finalize each guest tab instead.' USING ERRCODE = '55000'; END IF;
  PERFORM 1 FROM public.restaurant_tables rt WHERE rt.id = v_table_id AND rt.restaurant_id = v_restaurant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'The restaurant table no longer exists.'; END IF;
  SELECT ts.status INTO v_session_status FROM public.table_sessions ts
  WHERE ts.id = p_session_id AND ts.restaurant_id = v_restaurant_id AND ts.table_id = v_table_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Table session no longer exists.'; END IF;
  SELECT i.id, i.invoice_number, i.total_amount, i.order_count, i.payment_status
    INTO v_invoice_id, v_invoice_number, v_total, v_order_count, v_payment_status
  FROM public.table_session_invoices i WHERE i.session_id = p_session_id AND i.guest_tab_id IS NULL;
  IF FOUND THEN RETURN QUERY SELECT v_invoice_id, v_invoice_number, v_total, v_order_count, v_payment_status; RETURN; END IF;
  SELECT ts.status INTO v_session_status FROM public.table_sessions ts
  WHERE ts.id = p_session_id AND ts.restaurant_id = v_restaurant_id FOR UPDATE;
  IF v_session_status IS DISTINCT FROM 'open' THEN RAISE EXCEPTION 'This table session is already closed and has no invoice.'; END IF;
  SELECT COUNT(*)::integer INTO v_unfinished_count FROM public.orders o
  WHERE o.session_id = p_session_id AND o.status NOT IN ('completed', 'cancelled');
  IF v_unfinished_count > 0 THEN RAISE EXCEPTION 'Complete or cancel all orders before generating the final bill.' USING ERRCODE = '55000'; END IF;
  SELECT COUNT(*)::integer, COALESCE(pg_catalog.sum(o.total_amount), 0)::numeric(12,2)
    INTO v_order_count, v_total FROM public.orders o WHERE o.session_id = p_session_id AND o.status <> 'cancelled';
  IF v_order_count < 1 THEN RAISE EXCEPTION 'There are no billable orders in this table session.'; END IF;
  SELECT COALESCE(pg_catalog.sum(oi.line_total), 0)::numeric(12,2) INTO v_items_total
  FROM public.order_items oi JOIN public.orders o ON o.id = oi.order_id
  WHERE o.session_id = p_session_id AND o.status <> 'cancelled';
  IF v_items_total <> (SELECT COALESCE(pg_catalog.sum(o.total_amount + o.discount_amount), 0)
      FROM public.orders o WHERE o.session_id = p_session_id AND o.status <> 'cancelled') THEN
    RAISE EXCEPTION 'Order totals do not match saved order items. Review the session before issuing its final invoice.';
  END IF;
  v_invoice_number := 'KHV-' || pg_catalog.to_char(pg_catalog.now(), 'YYYYMMDD') || '-' ||
    pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', ''), 1, 8));
  INSERT INTO public.table_session_invoices AS inserted_invoice (restaurant_id, table_id, session_id, invoice_number,
    total_amount, order_count, payment_status, issued_by)
  VALUES (v_restaurant_id, v_table_id, p_session_id, v_invoice_number, v_total, v_order_count, 'unpaid', (SELECT auth.uid()))
  RETURNING inserted_invoice.id, inserted_invoice.total_amount INTO v_invoice_id, v_total;
  INSERT INTO public.table_session_invoice_items (invoice_id, order_id, order_reference, order_created_at, customer_name,
    item_name, unit_price, quantity, line_total)
  SELECT v_invoice_id, o.id, pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(o.id::text, '-', ''), 1, 8)),
    o.created_at, o.customer_name, oi.item_name, oi.unit_price, oi.quantity, oi.line_total
  FROM public.orders o JOIN public.order_items oi ON oi.order_id = o.id
  WHERE o.session_id = p_session_id AND o.status <> 'cancelled' ORDER BY o.created_at, o.id, oi.created_at, oi.id;
  UPDATE public.table_sessions SET status = 'billing' WHERE id = p_session_id AND restaurant_id = v_restaurant_id;
  RETURN QUERY SELECT v_invoice_id, v_invoice_number, v_total, v_order_count, 'unpaid'::text;
END;
$function$;
