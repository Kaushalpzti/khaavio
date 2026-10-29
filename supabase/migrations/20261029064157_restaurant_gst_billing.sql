-- Optional GST billing. Rates and registration details are supplied by each restaurant.
-- Existing order and invoice totals are preserved; new orders snapshot their tax settings.
BEGIN;

ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS gst_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS gstin text,
  ADD COLUMN IF NOT EXISTS gst_rate numeric(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gst_price_inclusive boolean NOT NULL DEFAULT false;

DO $gst_constraints$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conname = 'restaurants_gst_rate_check' AND conrelid = 'public.restaurants'::regclass) THEN
    ALTER TABLE public.restaurants ADD CONSTRAINT restaurants_gst_rate_check CHECK (gst_rate >= 0 AND gst_rate <= 100);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conname = 'restaurants_gstin_length_check' AND conrelid = 'public.restaurants'::regclass) THEN
    ALTER TABLE public.restaurants ADD CONSTRAINT restaurants_gstin_length_check CHECK (gstin IS NULL OR pg_catalog.char_length(gstin) = 15);
  END IF;
END;
$gst_constraints$;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS gst_enabled_snapshot boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS gstin_snapshot text,
  ADD COLUMN IF NOT EXISTS gst_rate_snapshot numeric(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gst_inclusive_snapshot boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS gst_amount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS grand_total numeric(12,2);

CREATE OR REPLACE FUNCTION public.khaavio_snapshot_order_gst()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $function$
DECLARE
  v_settings record;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT r.gst_enabled, r.gstin, r.gst_rate, r.gst_price_inclusive
      INTO v_settings FROM public.restaurants r WHERE r.id = NEW.restaurant_id;
    NEW.gst_enabled_snapshot := COALESCE(v_settings.gst_enabled, false);
    NEW.gstin_snapshot := v_settings.gstin;
    NEW.gst_rate_snapshot := COALESCE(v_settings.gst_rate, 0);
    NEW.gst_inclusive_snapshot := COALESCE(v_settings.gst_price_inclusive, false);
  ELSE
    NEW.gst_enabled_snapshot := OLD.gst_enabled_snapshot;
    NEW.gstin_snapshot := OLD.gstin_snapshot;
    NEW.gst_rate_snapshot := OLD.gst_rate_snapshot;
    NEW.gst_inclusive_snapshot := OLD.gst_inclusive_snapshot;
  END IF;

  IF NEW.gst_enabled_snapshot IS NOT TRUE OR NEW.gst_rate_snapshot <= 0 THEN
    NEW.gst_amount := 0;
    NEW.grand_total := COALESCE(NEW.total_amount, 0);
  ELSIF NEW.gst_inclusive_snapshot THEN
    NEW.gst_amount := pg_catalog.round(NEW.total_amount * NEW.gst_rate_snapshot / (100 + NEW.gst_rate_snapshot), 2);
    NEW.grand_total := NEW.total_amount;
  ELSE
    NEW.gst_amount := pg_catalog.round(NEW.total_amount * NEW.gst_rate_snapshot / 100, 2);
    NEW.grand_total := NEW.total_amount + NEW.gst_amount;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS khaavio_snapshot_order_gst ON public.orders;
CREATE TRIGGER khaavio_snapshot_order_gst
  BEFORE INSERT OR UPDATE OF total_amount, discount_amount ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.khaavio_snapshot_order_gst();
REVOKE ALL ON FUNCTION public.khaavio_snapshot_order_gst() FROM PUBLIC, anon, authenticated;

ALTER TABLE public.table_session_invoices
  ADD COLUMN IF NOT EXISTS subtotal_amount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_amount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_amount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gstin_snapshot text,
  ADD COLUMN IF NOT EXISTS gst_inclusive boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.khaavio_snapshot_invoice_gst()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $function$
DECLARE
  v_subtotal numeric(12,2);
  v_discount numeric(12,2);
  v_tax numeric(12,2);
  v_grand numeric(12,2);
  v_inclusive boolean;
BEGIN
  SELECT COALESCE(pg_catalog.sum(o.total_amount + o.discount_amount), 0),
         COALESCE(pg_catalog.sum(o.discount_amount), 0),
         COALESCE(pg_catalog.sum(o.gst_amount), 0),
         COALESCE(pg_catalog.sum(COALESCE(o.grand_total, o.total_amount)), 0)
    INTO v_subtotal, v_discount, v_tax, v_grand
  FROM public.orders o
  WHERE o.status <> 'cancelled'
    AND ((NEW.guest_tab_id IS NOT NULL AND o.guest_tab_id = NEW.guest_tab_id)
      OR (NEW.guest_tab_id IS NULL AND o.session_id = NEW.session_id));

  SELECT o.gstin_snapshot INTO NEW.gstin_snapshot
  FROM public.orders o
  WHERE o.status <> 'cancelled' AND o.gst_enabled_snapshot IS TRUE AND o.gstin_snapshot IS NOT NULL
    AND ((NEW.guest_tab_id IS NOT NULL AND o.guest_tab_id = NEW.guest_tab_id)
      OR (NEW.guest_tab_id IS NULL AND o.session_id = NEW.session_id))
  ORDER BY o.created_at DESC LIMIT 1;

  SELECT COALESCE(pg_catalog.bool_and(o.gst_inclusive_snapshot) FILTER (WHERE o.gst_amount > 0), false)
    INTO v_inclusive
  FROM public.orders o
  WHERE o.status <> 'cancelled'
    AND ((NEW.guest_tab_id IS NOT NULL AND o.guest_tab_id = NEW.guest_tab_id)
      OR (NEW.guest_tab_id IS NULL AND o.session_id = NEW.session_id));

  NEW.subtotal_amount := v_subtotal;
  NEW.discount_amount := v_discount;
  NEW.tax_amount := v_tax;
  NEW.gst_inclusive := v_inclusive;
  NEW.total_amount := v_grand;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS khaavio_snapshot_invoice_gst ON public.table_session_invoices;
CREATE TRIGGER khaavio_snapshot_invoice_gst
  BEFORE INSERT ON public.table_session_invoices
  FOR EACH ROW EXECUTE FUNCTION public.khaavio_snapshot_invoice_gst();
REVOKE ALL ON FUNCTION public.khaavio_snapshot_invoice_gst() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.khaavio_public_restaurant_menu(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE v_restaurant jsonb; v_restaurant_id uuid; v_categories jsonb; v_items jsonb;
BEGIN
  IF p_slug IS NULL OR pg_catalog.btrim(p_slug) = '' OR pg_catalog.char_length(p_slug) > 160 THEN RETURN NULL; END IF;
  SELECT pg_catalog.to_jsonb(r) INTO v_restaurant FROM public.restaurants r
  WHERE r.slug = pg_catalog.btrim(p_slug) AND r.is_published IS TRUE LIMIT 1;
  IF v_restaurant IS NULL THEN RETURN NULL; END IF;
  v_restaurant_id := (v_restaurant ->> 'id')::uuid;
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id', c.id, 'name', c.name, 'restaurant_id', c.restaurant_id) ORDER BY c.name), '[]'::jsonb)
    INTO v_categories FROM public.menu_categories c WHERE c.restaurant_id = v_restaurant_id;
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id', m.id, 'name', m.name, 'description', m.description, 'price', m.price,
    'image_url', m.image_url, 'is_available', m.is_available, 'category_id', m.category_id
  ) ORDER BY m.name), '[]'::jsonb) INTO v_items
  FROM public.menu_items m WHERE m.restaurant_id = v_restaurant_id AND m.is_available IS TRUE;
  RETURN pg_catalog.jsonb_build_object(
    'restaurant', pg_catalog.jsonb_build_object(
      'id', v_restaurant -> 'id', 'name', v_restaurant -> 'name', 'slug', v_restaurant -> 'slug',
      'restaurant_type', v_restaurant -> 'restaurant_type', 'address', v_restaurant -> 'address',
      'google_review_url', v_restaurant -> 'google_review_url', 'social_links', COALESCE(v_restaurant -> 'social_links', '{}'::jsonb),
      'is_published', v_restaurant -> 'is_published', 'is_accepting_orders', v_restaurant -> 'is_accepting_orders',
      'business_hours', v_restaurant -> 'business_hours', 'timezone', v_restaurant -> 'timezone', 'logo_url', v_restaurant -> 'logo_url',
      'gst_enabled', v_restaurant -> 'gst_enabled', 'gst_rate', v_restaurant -> 'gst_rate',
      'gst_price_inclusive', v_restaurant -> 'gst_price_inclusive'
    ),
    'categories', COALESCE(v_categories, '[]'::jsonb), 'items', COALESCE(v_items, '[]'::jsonb)
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.khaavio_public_restaurant_menu(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.khaavio_public_restaurant_menu(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.khaavio_public_guest_tab_snapshot(p_slug text, p_table_token uuid, p_guest_tab_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE v_restaurant_id uuid; v_table_id uuid; v_mode text; v_tab public.table_session_tabs%ROWTYPE;
  v_total numeric(12,2); v_order_count integer; v_invoice jsonb; v_orders jsonb;
BEGIN
  IF p_slug IS NULL OR pg_catalog.btrim(p_slug) = '' OR p_table_token IS NULL OR p_guest_tab_token IS NULL THEN
    RAISE EXCEPTION 'A valid restaurant table and guest tab are required.' USING ERRCODE = '22023';
  END IF;
  SELECT r.id, rt.id, r.table_billing_mode INTO v_restaurant_id, v_table_id, v_mode
  FROM public.restaurants r JOIN public.restaurant_tables rt ON rt.restaurant_id = r.id
  WHERE r.slug = pg_catalog.btrim(p_slug) AND r.is_published IS TRUE AND rt.qr_token = p_table_token AND rt.is_active IS TRUE;
  IF NOT FOUND THEN RAISE EXCEPTION 'This table QR is invalid, inactive, or unpublished.' USING ERRCODE = '22023'; END IF;
  SELECT * INTO v_tab FROM public.table_session_tabs t
  WHERE t.restaurant_id = v_restaurant_id AND t.table_id = v_table_id AND t.guest_tab_token = p_guest_tab_token
  ORDER BY t.opened_at DESC LIMIT 1;
  IF NOT FOUND THEN RETURN pg_catalog.jsonb_build_object('mode', public.khaavio_public_table_billing_mode(p_slug, p_table_token), 'exists', false); END IF;
  SELECT ts.billing_mode INTO v_mode FROM public.table_sessions ts WHERE ts.id = v_tab.session_id;
  IF v_mode <> 'per_guest' THEN RETURN pg_catalog.jsonb_build_object('mode', COALESCE(v_mode, 'combined'), 'exists', false); END IF;

  SELECT COALESCE(pg_catalog.sum(COALESCE(o.grand_total, o.total_amount)) FILTER (WHERE o.status <> 'cancelled'), 0)::numeric(12,2),
         COUNT(*) FILTER (WHERE o.status <> 'cancelled')::integer INTO v_total, v_order_count
  FROM public.orders o WHERE o.guest_tab_id = v_tab.id;
  SELECT pg_catalog.jsonb_build_object('id', i.id, 'invoice_number', i.invoice_number,
    'total_amount', i.total_amount, 'subtotal_amount', i.subtotal_amount, 'discount_amount', i.discount_amount,
    'tax_amount', i.tax_amount, 'gstin_snapshot', i.gstin_snapshot, 'gst_inclusive', i.gst_inclusive, 'order_count', i.order_count,
    'payment_status', i.payment_status, 'issued_at', i.issued_at, 'paid_at', i.paid_at, 'payment_method', i.payment_method)
    INTO v_invoice FROM public.table_session_invoices i
  WHERE i.guest_tab_id = v_tab.id AND i.payment_status <> 'void' ORDER BY i.issued_at DESC LIMIT 1;
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id', o.id, 'reference', pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(o.id::text, '-', ''), 1, 8)),
      'status', o.status, 'total_amount', o.total_amount, 'grand_total', o.grand_total,
      'discount_amount', o.discount_amount, 'gst_amount', o.gst_amount, 'gst_rate', o.gst_rate_snapshot,
      'gst_inclusive', o.gst_inclusive_snapshot, 'created_at', o.created_at,
      'items', (SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', oi.id, 'item_name', oi.item_name, 'unit_price', oi.unit_price, 'quantity', oi.quantity, 'line_total', oi.line_total
      ) ORDER BY oi.created_at, oi.id), '[]'::jsonb) FROM public.order_items oi WHERE oi.order_id = o.id)
    ) ORDER BY o.created_at, o.id), '[]'::jsonb) INTO v_orders
  FROM public.orders o WHERE o.guest_tab_id = v_tab.id;
  RETURN pg_catalog.jsonb_build_object('mode', 'per_guest', 'exists', true,
    'tab', pg_catalog.jsonb_build_object('id', v_tab.id, 'display_name', v_tab.display_name,
      'status', v_tab.status, 'opened_at', v_tab.opened_at, 'closed_at', v_tab.closed_at,
      'total_amount', v_total, 'order_count', v_order_count),
    'invoice', COALESCE(v_invoice, 'null'::jsonb), 'orders', v_orders);
END;
$function$;
REVOKE ALL ON FUNCTION public.khaavio_public_guest_tab_snapshot(text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.khaavio_public_guest_tab_snapshot(text, uuid, uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.khaavio_public_order_tax_snapshot(p_slug text, p_order_id uuid, p_tracking_token uuid)
RETURNS TABLE(gst_enabled boolean, gstin text, gst_rate numeric, gst_inclusive boolean,
  discount_amount numeric, coupon_code text, tax_amount numeric, grand_total numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
  SELECT o.gst_enabled_snapshot, o.gstin_snapshot, o.gst_rate_snapshot, o.gst_inclusive_snapshot,
    o.discount_amount, o.coupon_code, o.gst_amount, o.grand_total
  FROM public.orders o JOIN public.restaurants r ON r.id = o.restaurant_id
  WHERE r.slug = pg_catalog.btrim(p_slug) AND r.is_published IS TRUE
    AND o.id = p_order_id AND o.tracking_token = p_tracking_token
  LIMIT 1;
$function$;
REVOKE ALL ON FUNCTION public.khaavio_public_order_tax_snapshot(text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.khaavio_public_order_tax_snapshot(text, uuid, uuid) TO anon, authenticated;

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
  INSERT INTO public.table_session_invoices (restaurant_id, table_id, session_id, guest_tab_id, invoice_number,
    total_amount, order_count, payment_status, issued_by)
  VALUES (v_restaurant_id, v_table_id, v_session_id, p_guest_tab_id, v_invoice_number, v_total, v_order_count, 'unpaid', NULL)
  RETURNING id, total_amount INTO v_invoice_id, v_total;
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
REVOKE ALL ON FUNCTION public.khaavio_finalize_guest_tab(uuid) FROM PUBLIC, anon, authenticated;

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
  INSERT INTO public.table_session_invoices (restaurant_id, table_id, session_id, invoice_number,
    total_amount, order_count, payment_status, issued_by)
  VALUES (v_restaurant_id, v_table_id, p_session_id, v_invoice_number, v_total, v_order_count, 'unpaid', (SELECT auth.uid()))
  RETURNING id, total_amount INTO v_invoice_id, v_total;
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

COMMIT;
