-- Restaurant-owned QR menu coupons. Discounting is applied inside the order RPC
-- transaction so the saved order, table invoice, guest bill, and usage limit agree.
BEGIN;

CREATE TABLE public.restaurant_coupons (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  code text NOT NULL CHECK (
    code = pg_catalog.upper(pg_catalog.btrim(code))
    AND code ~ '^[A-Z0-9][A-Z0-9_-]{2,23}$'
  ),
  title text NOT NULL CHECK (pg_catalog.char_length(pg_catalog.btrim(title)) BETWEEN 2 AND 80),
  discount_type text NOT NULL CHECK (discount_type IN ('percent', 'fixed')),
  discount_value numeric(10,2) NOT NULL CHECK (
    discount_value > 0 AND (discount_type <> 'percent' OR discount_value <= 100)
  ),
  minimum_order_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (minimum_order_amount >= 0),
  maximum_discount_amount numeric(12,2) CHECK (maximum_discount_amount IS NULL OR maximum_discount_amount > 0),
  starts_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  ends_at timestamptz,
  usage_limit integer CHECK (usage_limit IS NULL OR usage_limit > 0),
  used_count integer NOT NULL DEFAULT 0 CHECK (used_count >= 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT restaurant_coupons_restaurant_code_key UNIQUE (restaurant_id, code),
  CONSTRAINT restaurant_coupons_date_range_check CHECK (ends_at IS NULL OR ends_at > starts_at)
);

ALTER TABLE public.orders
  ADD COLUMN coupon_id uuid REFERENCES public.restaurant_coupons(id) ON DELETE SET NULL,
  ADD COLUMN coupon_code text,
  ADD COLUMN discount_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0);

CREATE INDEX restaurant_coupons_restaurant_active_idx
  ON public.restaurant_coupons (restaurant_id, is_active, created_at DESC);
CREATE INDEX orders_coupon_id_created_idx
  ON public.orders (coupon_id, created_at DESC) WHERE coupon_id IS NOT NULL;

ALTER TABLE public.restaurant_coupons ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.restaurant_coupons FROM anon, authenticated;
GRANT SELECT ON public.restaurant_coupons TO authenticated;
GRANT INSERT (restaurant_id, code, title, discount_type, discount_value, minimum_order_amount,
  maximum_discount_amount, starts_at, ends_at, usage_limit, is_active)
  ON public.restaurant_coupons TO authenticated;
GRANT UPDATE (is_active) ON public.restaurant_coupons TO authenticated;

CREATE POLICY restaurant_coupons_owner_select
  ON public.restaurant_coupons FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.restaurants r
    WHERE r.id = restaurant_coupons.restaurant_id AND r.owner_id = (SELECT auth.uid())
  ));
CREATE POLICY restaurant_coupons_owner_insert
  ON public.restaurant_coupons FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.restaurants r
    WHERE r.id = restaurant_coupons.restaurant_id AND r.owner_id = (SELECT auth.uid())
  ));
CREATE POLICY restaurant_coupons_owner_update
  ON public.restaurant_coupons FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.restaurants r
    WHERE r.id = restaurant_coupons.restaurant_id AND r.owner_id = (SELECT auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.restaurants r
    WHERE r.id = restaurant_coupons.restaurant_id AND r.owner_id = (SELECT auth.uid())
  ));

CREATE OR REPLACE FUNCTION public.khaavio_touch_restaurant_coupon_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $function$
BEGIN
  NEW.updated_at := pg_catalog.now();
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS khaavio_touch_restaurant_coupon_updated_at ON public.restaurant_coupons;
CREATE TRIGGER khaavio_touch_restaurant_coupon_updated_at
  BEFORE UPDATE ON public.restaurant_coupons
  FOR EACH ROW EXECUTE FUNCTION public.khaavio_touch_restaurant_coupon_updated_at();
REVOKE ALL ON FUNCTION public.khaavio_touch_restaurant_coupon_updated_at() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.khaavio_guard_session_order_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $guard$
DECLARE
  v_session_status text;
  v_items_total numeric(12,2);
  v_coupon_apply boolean := COALESCE(pg_catalog.current_setting('app.khaavio_coupon_application', true), '') = 'on';
BEGIN
  IF NEW.session_id IS DISTINCT FROM OLD.session_id THEN
    RAISE EXCEPTION 'An order cannot be moved between table sessions.' USING ERRCODE = '55000';
  END IF;
  IF OLD.session_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.restaurant_id IS DISTINCT FROM OLD.restaurant_id OR NEW.table_id IS DISTINCT FROM OLD.table_id THEN
    RAISE EXCEPTION 'A session order cannot be moved to another restaurant or table.' USING ERRCODE = '55000';
  END IF;

  PERFORM 1 FROM public.restaurant_tables rt
  WHERE rt.id = OLD.table_id AND rt.restaurant_id = OLD.restaurant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'The order table no longer exists.'; END IF;

  SELECT ts.status INTO v_session_status FROM public.table_sessions ts
  WHERE ts.id = OLD.session_id AND ts.restaurant_id = OLD.restaurant_id AND ts.table_id = OLD.table_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'The order table session no longer exists.'; END IF;
  IF v_session_status IS DISTINCT FROM 'open' THEN
    RAISE EXCEPTION 'Orders cannot be modified after final billing has started.' USING ERRCODE = '55000';
  END IF;

  IF NEW.total_amount IS DISTINCT FROM OLD.total_amount OR NEW.discount_amount IS DISTINCT FROM OLD.discount_amount THEN
    IF OLD.total_amount <> 0 AND NOT (
      v_coupon_apply AND OLD.coupon_id IS NULL AND NEW.coupon_id IS NOT NULL
      AND OLD.discount_amount = 0 AND NEW.discount_amount > 0
    ) THEN
      RAISE EXCEPTION 'The saved order total cannot be changed directly.' USING ERRCODE = '55000';
    END IF;
    SELECT COALESCE(pg_catalog.sum(oi.line_total), 0)::numeric(12,2) INTO v_items_total
    FROM public.order_items oi WHERE oi.order_id = OLD.id;
    IF NEW.total_amount + NEW.discount_amount IS DISTINCT FROM v_items_total THEN
      RAISE EXCEPTION 'The saved order total and discount must match its order items.' USING ERRCODE = '55000';
    END IF;
  END IF;
  RETURN NEW;
END;
$guard$;

CREATE OR REPLACE FUNCTION public.khaavio_guard_order_coupon_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $guard$
BEGIN
  IF (NEW.coupon_id IS DISTINCT FROM OLD.coupon_id
      OR NEW.coupon_code IS DISTINCT FROM OLD.coupon_code
      OR NEW.discount_amount IS DISTINCT FROM OLD.discount_amount)
     AND COALESCE(pg_catalog.current_setting('app.khaavio_coupon_application', true), '') <> 'on'
     AND NOT (NEW.coupon_id IS NULL AND NEW.coupon_code IS NOT DISTINCT FROM OLD.coupon_code
       AND NEW.discount_amount IS NOT DISTINCT FROM OLD.discount_amount) THEN
    RAISE EXCEPTION 'Applied coupon details cannot be changed directly.' USING ERRCODE = '55000';
  END IF;
  IF OLD.coupon_id IS NOT NULL AND NEW.coupon_id IS NOT NULL AND (
      NEW.coupon_id IS DISTINCT FROM OLD.coupon_id
      OR NEW.coupon_code IS DISTINCT FROM OLD.coupon_code
      OR NEW.discount_amount IS DISTINCT FROM OLD.discount_amount
  ) THEN
    RAISE EXCEPTION 'An applied coupon cannot be replaced or removed.' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$guard$;

DROP TRIGGER IF EXISTS khaavio_guard_order_coupon_update ON public.orders;
CREATE TRIGGER khaavio_guard_order_coupon_update
  BEFORE UPDATE OF coupon_id, coupon_code, discount_amount ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.khaavio_guard_order_coupon_update();
REVOKE ALL ON FUNCTION public.khaavio_guard_order_coupon_update() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.khaavio_guard_session_order_update() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.khaavio_coupon_quote(
  p_restaurant_id uuid, p_code text, p_subtotal numeric, p_lock boolean
)
RETURNS TABLE(is_valid boolean, coupon_id uuid, coupon_code text, discount_amount numeric, message text)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $function$
DECLARE
  v_coupon public.restaurant_coupons%ROWTYPE;
  v_discount numeric(12,2);
BEGIN
  IF p_code IS NULL OR pg_catalog.btrim(p_code) = '' THEN
    RETURN QUERY SELECT true, NULL::uuid, NULL::text, 0::numeric, NULL::text;
    RETURN;
  END IF;
  IF p_lock THEN
    SELECT c.* INTO v_coupon FROM public.restaurant_coupons c
    WHERE c.restaurant_id = p_restaurant_id AND c.code = pg_catalog.upper(pg_catalog.btrim(p_code)) FOR UPDATE;
  ELSE
    SELECT c.* INTO v_coupon FROM public.restaurant_coupons c
    WHERE c.restaurant_id = p_restaurant_id AND c.code = pg_catalog.upper(pg_catalog.btrim(p_code));
  END IF;
  IF NOT FOUND OR v_coupon.is_active IS NOT TRUE
     OR v_coupon.starts_at > pg_catalog.now()
     OR (v_coupon.ends_at IS NOT NULL AND v_coupon.ends_at <= pg_catalog.now())
     OR (v_coupon.usage_limit IS NOT NULL AND v_coupon.used_count >= v_coupon.usage_limit) THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::text, 0::numeric, 'This coupon is unavailable or expired.'::text;
    RETURN;
  END IF;
  IF p_subtotal < v_coupon.minimum_order_amount THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::text, 0::numeric,
      pg_catalog.format('Add items worth %s more to use this coupon.',
        pg_catalog.to_char(v_coupon.minimum_order_amount - p_subtotal, 'FM999999990.00'));
    RETURN;
  END IF;
  v_discount := CASE
    WHEN v_coupon.discount_type = 'percent' THEN pg_catalog.round(p_subtotal * v_coupon.discount_value / 100, 2)
    ELSE v_coupon.discount_value
  END;
  IF v_coupon.maximum_discount_amount IS NOT NULL AND v_discount > v_coupon.maximum_discount_amount THEN
    v_discount := v_coupon.maximum_discount_amount;
  END IF;
  IF v_discount > p_subtotal THEN v_discount := p_subtotal; END IF;
  IF v_discount <= 0 THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::text, 0::numeric, 'This coupon does not reduce your cart total.'::text;
    RETURN;
  END IF;
  RETURN QUERY SELECT true, v_coupon.id, v_coupon.code, v_discount, NULL::text;
END;
$function$;
REVOKE ALL ON FUNCTION public.khaavio_coupon_quote(uuid, text, numeric, boolean) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.khaavio_apply_order_coupon(p_order_id uuid, p_code text)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_order public.orders%ROWTYPE;
  v_subtotal numeric(12,2);
  v_quote record;
BEGIN
  SELECT o.* INTO v_order FROM public.orders o WHERE o.id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'The order could not be found.' USING ERRCODE = '55000'; END IF;
  IF v_order.coupon_id IS NOT NULL THEN
    IF p_code IS NOT NULL AND pg_catalog.upper(pg_catalog.btrim(p_code)) <> v_order.coupon_code THEN
      RAISE EXCEPTION 'This order request already used a different coupon.' USING ERRCODE = '55000';
    END IF;
    RETURN v_order.total_amount;
  END IF;
  IF p_code IS NULL OR pg_catalog.btrim(p_code) = '' THEN RETURN v_order.total_amount; END IF;

  SELECT COALESCE(pg_catalog.sum(oi.line_total), 0)::numeric(12,2) INTO v_subtotal
  FROM public.order_items oi WHERE oi.order_id = p_order_id;
  SELECT * INTO v_quote FROM public.khaavio_coupon_quote(v_order.restaurant_id, p_code, v_subtotal, true);
  IF NOT v_quote.is_valid THEN RAISE EXCEPTION '%', v_quote.message USING ERRCODE = '22023'; END IF;

  PERFORM pg_catalog.set_config('app.khaavio_coupon_application', 'on', true);
  UPDATE public.orders o
    SET coupon_id = v_quote.coupon_id,
        coupon_code = v_quote.coupon_code,
        discount_amount = v_quote.discount_amount,
        total_amount = v_subtotal - v_quote.discount_amount
  WHERE o.id = p_order_id;
  UPDATE public.restaurant_coupons c SET used_count = c.used_count + 1, updated_at = pg_catalog.now()
  WHERE c.id = v_quote.coupon_id;
  PERFORM pg_catalog.set_config('app.khaavio_coupon_application', 'off', true);
  RETURN v_subtotal - v_quote.discount_amount;
END;
$function$;
REVOKE ALL ON FUNCTION public.khaavio_apply_order_coupon(uuid, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.khaavio_validate_coupon(
  p_slug text, p_table_token uuid, p_code text, p_items jsonb
)
RETURNS TABLE(is_valid boolean, coupon_code text, discount_amount numeric, total_amount numeric, message text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_restaurant_id uuid;
  v_item jsonb;
  v_item_id uuid;
  v_quantity integer;
  v_price numeric(12,2);
  v_available boolean;
  v_subtotal numeric(12,2) := 0;
  v_quote record;
BEGIN
  SELECT r.id INTO v_restaurant_id FROM public.restaurants r
  JOIN public.restaurant_tables rt ON rt.restaurant_id = r.id
  WHERE r.slug = pg_catalog.btrim(p_slug) AND r.is_published IS TRUE
    AND rt.qr_token = p_table_token AND rt.is_active IS TRUE LIMIT 1;
  IF v_restaurant_id IS NULL OR p_code IS NULL OR pg_catalog.btrim(p_code) = ''
     OR pg_catalog.jsonb_typeof(p_items) IS DISTINCT FROM 'array' THEN
    RETURN QUERY SELECT false, NULL::text, 0::numeric, 0::numeric, 'Enter a coupon code and check your cart.'::text;
    RETURN;
  END IF;
  IF pg_catalog.jsonb_array_length(p_items) NOT BETWEEN 1 AND 30 THEN
    RETURN QUERY SELECT false, NULL::text, 0::numeric, 0::numeric, 'Your cart needs updating. Please try again.'::text;
    RETURN;
  END IF;

  FOR v_item IN SELECT element.value FROM pg_catalog.jsonb_array_elements(p_items) AS element(value) LOOP
    BEGIN
      v_item_id := (v_item ->> 'item_id')::uuid;
      v_quantity := (v_item ->> 'quantity')::integer;
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      RETURN QUERY SELECT false, NULL::text, 0::numeric, 0::numeric, 'Your cart needs updating. Please try again.'::text;
      RETURN;
    END;
    IF v_item_id IS NULL OR v_quantity NOT BETWEEN 1 AND 20 THEN
      RETURN QUERY SELECT false, NULL::text, 0::numeric, 0::numeric, 'Your cart needs updating. Please try again.'::text;
      RETURN;
    END IF;
    SELECT mi.price, mi.is_available INTO v_price, v_available FROM public.menu_items mi
    WHERE mi.id = v_item_id AND mi.restaurant_id = v_restaurant_id FOR SHARE;
    IF NOT FOUND OR v_available IS NOT TRUE THEN
      RETURN QUERY SELECT false, NULL::text, 0::numeric, 0::numeric, 'A dish in your cart is no longer available.'::text;
      RETURN;
    END IF;
    v_subtotal := v_subtotal + pg_catalog.round(v_price * v_quantity, 2);
  END LOOP;

  SELECT * INTO v_quote FROM public.khaavio_coupon_quote(v_restaurant_id, p_code, v_subtotal, false);
  RETURN QUERY SELECT v_quote.is_valid, v_quote.coupon_code, v_quote.discount_amount,
    v_subtotal - v_quote.discount_amount, v_quote.message;
END;
$function$;
REVOKE ALL ON FUNCTION public.khaavio_validate_coupon(text, uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.khaavio_validate_coupon(text, uuid, text, jsonb) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.place_public_order_with_coupon_and_loyalty(
  p_slug text, p_table_token uuid, p_customer_name text, p_customer_phone text,
  p_notes text, p_items jsonb, p_loyalty_member_token uuid, p_loyalty_phone text, p_coupon_code text
)
RETURNS TABLE(order_id uuid, order_reference text, total_amount numeric, tracking_token uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_order_id uuid;
  v_reference text;
  v_total numeric;
  v_tracking_token uuid;
BEGIN
  SELECT placed.order_id, placed.order_reference, placed.total_amount, placed.tracking_token
  INTO v_order_id, v_reference, v_total, v_tracking_token
  FROM public.place_public_order_with_loyalty(
    p_slug, p_table_token, p_customer_name, p_customer_phone, p_notes, p_items,
    p_loyalty_member_token, p_loyalty_phone
  ) AS placed;
  v_total := public.khaavio_apply_order_coupon(v_order_id, p_coupon_code);
  RETURN QUERY SELECT v_order_id, v_reference, v_total, v_tracking_token;
END;
$function$;
REVOKE ALL ON FUNCTION public.place_public_order_with_coupon_and_loyalty(text, uuid, text, text, text, jsonb, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.place_public_order_with_coupon_and_loyalty(text, uuid, text, text, text, jsonb, uuid, text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.place_public_order_for_guest_with_coupon(
  p_slug text, p_table_token uuid, p_customer_name text, p_customer_phone text,
  p_notes text, p_items jsonb, p_loyalty_member_token uuid, p_loyalty_phone text,
  p_guest_tab_token uuid, p_guest_display_name text, p_guest_order_request_token uuid, p_coupon_code text
)
RETURNS TABLE(order_id uuid, order_reference text, total_amount numeric, tracking_token uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_order_id uuid;
  v_reference text;
  v_total numeric;
  v_tracking_token uuid;
BEGIN
  SELECT placed.order_id, placed.order_reference, placed.total_amount, placed.tracking_token
  INTO v_order_id, v_reference, v_total, v_tracking_token
  FROM public.place_public_order_for_guest_with_loyalty(
    p_slug, p_table_token, p_customer_name, p_customer_phone, p_notes, p_items,
    p_loyalty_member_token, p_loyalty_phone, p_guest_tab_token, p_guest_display_name,
    p_guest_order_request_token
  ) AS placed;
  v_total := public.khaavio_apply_order_coupon(v_order_id, p_coupon_code);
  RETURN QUERY SELECT v_order_id, v_reference, v_total, v_tracking_token;
END;
$function$;
REVOKE ALL ON FUNCTION public.place_public_order_for_guest_with_coupon(text, uuid, text, text, text, jsonb, uuid, text, uuid, text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.place_public_order_for_guest_with_coupon(text, uuid, text, text, text, jsonb, uuid, text, uuid, text, uuid, text) TO anon, authenticated;

COMMIT;
