BEGIN;

-- Public pickup/dine-in orders have no browser-bound Perks token in this flow.
-- Keep the existing RPC signature for client compatibility, but ignore the
-- unverified phone-only loyalty argument. Table QR orders use the token-bound
-- loyalty workflow instead.
CREATE OR REPLACE FUNCTION public.place_public_order_for_service_mode(
  p_slug text,
  p_customer_name text,
  p_customer_phone text,
  p_notes text,
  p_items jsonb,
  p_service_mode text,
  p_pickup_eta_minutes smallint,
  p_coupon_code text,
  p_loyalty_phone text DEFAULT NULL
)
RETURNS TABLE(order_id uuid, order_reference text, total_amount numeric, tracking_token uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_restaurant_id uuid;
  v_accepting boolean;
  v_hours jsonb;
  v_timezone text;
  v_name text;
  v_phone text;
  v_notes text;
  v_order_id uuid;
  v_tracking uuid;
  v_total numeric(12,2);
  v_final numeric(12,2);
BEGIN
  IF p_service_mode NOT IN ('pickup', 'dine_in') THEN
    RAISE EXCEPTION 'Choose pickup or dine-in.' USING ERRCODE = '22023';
  END IF;

  v_name := pg_catalog.btrim(p_customer_name);
  v_phone := public.khaavio_normalize_indian_mobile(p_customer_phone);
  v_notes := NULLIF(pg_catalog.btrim(p_notes), '');

  IF v_name IS NULL OR pg_catalog.char_length(v_name) NOT BETWEEN 1 AND 80 OR v_phone IS NULL THEN
    RAISE EXCEPTION 'Enter your name and a valid mobile number.' USING ERRCODE = '22023';
  END IF;
  IF v_notes IS NOT NULL AND pg_catalog.char_length(v_notes) > 500 THEN
    RAISE EXCEPTION 'Instructions must be 500 characters or fewer.' USING ERRCODE = '22023';
  END IF;
  IF p_service_mode = 'pickup' AND (p_pickup_eta_minutes IS NULL OR p_pickup_eta_minutes NOT IN (0, 15, 30, 45, 60)) THEN
    RAISE EXCEPTION 'Choose a valid pickup time.' USING ERRCODE = '22023';
  END IF;
  IF p_service_mode = 'dine_in' AND p_pickup_eta_minutes IS NOT NULL THEN
    RAISE EXCEPTION 'Pickup time only applies to pickup.' USING ERRCODE = '22023';
  END IF;

  SELECT r.id, r.is_accepting_orders, r.business_hours, r.timezone
  INTO v_restaurant_id, v_accepting, v_hours, v_timezone
  FROM public.restaurants AS r
  WHERE r.slug = pg_catalog.btrim(p_slug)
    AND r.is_published
    AND (
      (p_service_mode = 'pickup' AND r.pickup_enabled)
      OR (p_service_mode = 'dine_in' AND r.dine_in_enabled)
    )
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'This order mode is not available.' USING ERRCODE = '22023';
  END IF;
  IF NOT public.khaavio_restaurant_subscription_allows_operations(v_restaurant_id)
     OR v_accepting IS NOT TRUE
     OR NOT public.khaavio_restaurant_open_at(v_hours, v_timezone, pg_catalog.now()) THEN
    RAISE EXCEPTION 'Online ordering is not available right now.' USING ERRCODE = '55000';
  END IF;

  INSERT INTO public.orders (
    restaurant_id, table_id, session_id, customer_name, customer_phone,
    notes, status, total_amount, service_mode, pickup_eta_minutes
  )
  VALUES (
    v_restaurant_id, NULL, NULL, v_name, v_phone,
    v_notes, 'pending', 0, p_service_mode,
    CASE WHEN p_service_mode = 'pickup' THEN p_pickup_eta_minutes END
  )
  RETURNING id, tracking_token INTO v_order_id, v_tracking;

  v_total := public.khaavio_insert_order_item_lines(v_order_id, v_restaurant_id, p_items);
  UPDATE public.orders SET total_amount = v_total WHERE id = v_order_id;
  v_final := public.khaavio_apply_order_coupon(v_order_id, p_coupon_code);

  RETURN QUERY SELECT
    v_order_id,
    pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(v_order_id::text, '-', ''), 1, 8)),
    v_final,
    v_tracking;
END;
$function$;

REVOKE ALL ON FUNCTION public.place_public_order_for_service_mode(
  text, text, text, text, jsonb, text, smallint, text, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.place_public_order_for_service_mode(
  text, text, text, text, jsonb, text, smallint, text, text
) TO anon, authenticated;

COMMIT;
