-- GST is applied only when a table/guest final invoice is created.
-- Customer orders and their receipts retain the saved order total without GST.
BEGIN;

DROP TRIGGER IF EXISTS khaavio_snapshot_order_gst ON public.orders;
DROP FUNCTION IF EXISTS public.khaavio_snapshot_order_gst();
DROP FUNCTION IF EXISTS public.khaavio_public_order_tax_snapshot(text, uuid, uuid);

CREATE OR REPLACE FUNCTION public.khaavio_snapshot_invoice_gst()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $function$
DECLARE
  v_subtotal numeric(12,2);
  v_discount numeric(12,2);
  v_net numeric(12,2);
  v_tax numeric(12,2);
  v_grand numeric(12,2);
  v_enabled boolean := false;
  v_rate numeric(5,2) := 0;
  v_inclusive boolean := false;
  v_gstin text;
BEGIN
  SELECT COALESCE(pg_catalog.sum(o.total_amount + o.discount_amount), 0),
         COALESCE(pg_catalog.sum(o.discount_amount), 0),
         COALESCE(pg_catalog.sum(o.total_amount), 0)
    INTO v_subtotal, v_discount, v_net
  FROM public.orders o
  WHERE o.status <> 'cancelled'
    AND ((NEW.guest_tab_id IS NOT NULL AND o.guest_tab_id = NEW.guest_tab_id)
      OR (NEW.guest_tab_id IS NULL AND o.session_id = NEW.session_id));

  SELECT r.gst_enabled, r.gst_rate, r.gst_price_inclusive, r.gstin
    INTO v_enabled, v_rate, v_inclusive, v_gstin
  FROM public.restaurants r WHERE r.id = NEW.restaurant_id;

  IF v_enabled IS TRUE AND v_rate > 0 THEN
    IF v_inclusive IS TRUE THEN
      v_tax := pg_catalog.round(v_net * v_rate / (100 + v_rate), 2);
      v_grand := v_net;
    ELSE
      v_tax := pg_catalog.round(v_net * v_rate / 100, 2);
      v_grand := v_net + v_tax;
    END IF;
  ELSE
    v_tax := 0;
    v_grand := v_net;
    v_inclusive := false;
  END IF;

  NEW.subtotal_amount := v_subtotal;
  NEW.discount_amount := v_discount;
  NEW.tax_amount := v_tax;
  NEW.gstin_snapshot := CASE WHEN v_enabled IS TRUE AND v_rate > 0 THEN v_gstin ELSE NULL END;
  NEW.gst_inclusive := COALESCE(v_inclusive, false);
  NEW.total_amount := v_grand;
  RETURN NEW;
END;
$function$;

-- A running guest bill continues to show order totals only. GST appears in the
-- invoice object after the final bill is issued.
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

  SELECT COALESCE(pg_catalog.sum(o.total_amount) FILTER (WHERE o.status <> 'cancelled'), 0)::numeric(12,2),
         COUNT(*) FILTER (WHERE o.status <> 'cancelled')::integer INTO v_total, v_order_count
  FROM public.orders o WHERE o.guest_tab_id = v_tab.id;
  SELECT pg_catalog.jsonb_build_object('id', i.id, 'invoice_number', i.invoice_number,
    'total_amount', i.total_amount, 'subtotal_amount', i.subtotal_amount, 'discount_amount', i.discount_amount,
    'tax_amount', i.tax_amount, 'gstin_snapshot', i.gstin_snapshot, 'gst_inclusive', i.gst_inclusive,
    'order_count', i.order_count, 'payment_status', i.payment_status, 'issued_at', i.issued_at,
    'paid_at', i.paid_at, 'payment_method', i.payment_method)
    INTO v_invoice FROM public.table_session_invoices i
  WHERE i.guest_tab_id = v_tab.id AND i.payment_status <> 'void' ORDER BY i.issued_at DESC LIMIT 1;
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id', o.id, 'reference', pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(o.id::text, '-', ''), 1, 8)),
      'status', o.status, 'total_amount', o.total_amount, 'created_at', o.created_at,
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

COMMIT;
