BEGIN;

ALTER TABLE public.restaurants
  ADD COLUMN pickup_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN dine_in_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE public.orders
  ADD COLUMN service_mode text NOT NULL DEFAULT 'dine_in',
  ADD COLUMN pickup_eta_minutes smallint,
  ALTER COLUMN table_id DROP NOT NULL,
  ALTER COLUMN session_id DROP NOT NULL;
ALTER TABLE public.order_items
  ADD COLUMN selected_options jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.orders ADD CONSTRAINT orders_service_mode_check CHECK (service_mode IN ('dine_in', 'pickup'));
ALTER TABLE public.orders ADD CONSTRAINT orders_pickup_eta_check CHECK (
  (service_mode = 'pickup' AND pickup_eta_minutes IN (0, 15, 30, 45, 60))
  OR (service_mode = 'dine_in' AND pickup_eta_minutes IS NULL)
);

CREATE UNIQUE INDEX menu_items_id_restaurant_unique ON public.menu_items (id, restaurant_id);
CREATE TABLE public.menu_item_option_groups (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  menu_item_id uuid NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (pg_catalog.char_length(pg_catalog.btrim(name)) BETWEEN 1 AND 60),
  min_selections smallint NOT NULL DEFAULT 0 CHECK (min_selections BETWEEN 0 AND 10),
  max_selections smallint NOT NULL DEFAULT 1 CHECK (max_selections BETWEEN 1 AND 10),
  sort_order smallint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CHECK (min_selections <= max_selections),
  FOREIGN KEY (menu_item_id, restaurant_id) REFERENCES public.menu_items(id, restaurant_id) ON DELETE CASCADE,
  UNIQUE (id, restaurant_id, menu_item_id),
  UNIQUE (menu_item_id, name)
);
CREATE TABLE public.menu_item_options (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  menu_item_id uuid NOT NULL,
  group_id uuid NOT NULL,
  name text NOT NULL CHECK (pg_catalog.char_length(pg_catalog.btrim(name)) BETWEEN 1 AND 60),
  price_delta numeric(10,2) NOT NULL DEFAULT 0 CHECK (price_delta BETWEEN -100000 AND 100000),
  is_available boolean NOT NULL DEFAULT true,
  sort_order smallint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  FOREIGN KEY (group_id, restaurant_id, menu_item_id)
    REFERENCES public.menu_item_option_groups(id, restaurant_id, menu_item_id) ON DELETE CASCADE,
  UNIQUE (group_id, name),
  UNIQUE (id, restaurant_id, menu_item_id)
);
CREATE INDEX menu_item_option_groups_item_idx ON public.menu_item_option_groups (restaurant_id, menu_item_id, sort_order);
CREATE INDEX menu_item_options_group_idx ON public.menu_item_options (group_id, is_available, sort_order);

ALTER TABLE public.menu_item_option_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_item_options ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.menu_item_option_groups, public.menu_item_options FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.menu_item_option_groups, public.menu_item_options TO authenticated;
CREATE POLICY menu_item_option_groups_owner_manage ON public.menu_item_option_groups
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = restaurant_id AND r.owner_id = (SELECT auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = restaurant_id AND r.owner_id = (SELECT auth.uid())));
CREATE POLICY menu_item_options_owner_manage ON public.menu_item_options
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = restaurant_id AND r.owner_id = (SELECT auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = restaurant_id AND r.owner_id = (SELECT auth.uid())));

CREATE OR REPLACE FUNCTION public.khaavio_replace_menu_item_options(p_menu_item_id uuid, p_groups jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE v_restaurant_id uuid; v_group jsonb; v_option jsonb; v_group_id uuid; v_min integer; v_max integer; v_count integer;
BEGIN
  SELECT mi.restaurant_id INTO v_restaurant_id FROM public.menu_items mi
  JOIN public.restaurants r ON r.id = mi.restaurant_id
  WHERE mi.id = p_menu_item_id AND r.owner_id = (SELECT auth.uid()) FOR UPDATE OF mi;
  IF v_restaurant_id IS NULL THEN RAISE EXCEPTION 'Menu item not found for this restaurant.' USING ERRCODE = '42501'; END IF;
  IF pg_catalog.jsonb_typeof(p_groups) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Choice groups must be a list.' USING ERRCODE = '22023';
  END IF;
  IF pg_catalog.jsonb_array_length(p_groups) > 10 THEN
    RAISE EXCEPTION 'Add no more than 10 choice groups.' USING ERRCODE = '22023';
  END IF;
  DELETE FROM public.menu_item_option_groups WHERE menu_item_id = p_menu_item_id AND restaurant_id = v_restaurant_id;
  FOR v_group IN SELECT value FROM pg_catalog.jsonb_array_elements(p_groups) LOOP
    v_min := COALESCE((v_group ->> 'min_selections')::integer, 0);
    v_max := COALESCE((v_group ->> 'max_selections')::integer, 1);
    v_count := CASE WHEN pg_catalog.jsonb_typeof(v_group -> 'options') = 'array' THEN pg_catalog.jsonb_array_length(v_group -> 'options') ELSE 0 END;
    IF pg_catalog.char_length(pg_catalog.btrim(v_group ->> 'name')) NOT BETWEEN 1 AND 60 OR v_min NOT BETWEEN 0 AND 10 OR v_max NOT BETWEEN 1 AND 10 OR v_min > v_max OR v_count NOT BETWEEN 1 AND 10 OR v_max > v_count OR v_min > v_count THEN
      RAISE EXCEPTION 'Check each choice group name, limits, and choices.' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.menu_item_option_groups (restaurant_id, menu_item_id, name, min_selections, max_selections, sort_order)
      VALUES (v_restaurant_id, p_menu_item_id, pg_catalog.btrim(v_group ->> 'name'), v_min, v_max, COALESCE((v_group ->> 'sort_order')::smallint, 0)) RETURNING id INTO v_group_id;
    FOR v_option IN SELECT value FROM pg_catalog.jsonb_array_elements(v_group -> 'options') LOOP
      IF pg_catalog.char_length(pg_catalog.btrim(v_option ->> 'name')) NOT BETWEEN 1 AND 60 OR COALESCE((v_option ->> 'price_delta')::numeric, 0) NOT BETWEEN -100000 AND 100000 THEN
        RAISE EXCEPTION 'Check each choice name and price change.' USING ERRCODE = '22023';
      END IF;
      INSERT INTO public.menu_item_options (restaurant_id, menu_item_id, group_id, name, price_delta, is_available, sort_order)
        VALUES (v_restaurant_id, p_menu_item_id, v_group_id, pg_catalog.btrim(v_option ->> 'name'), COALESCE((v_option ->> 'price_delta')::numeric, 0), COALESCE((v_option ->> 'is_available')::boolean, true), COALESCE((v_option ->> 'sort_order')::smallint, 0));
    END LOOP;
  END LOOP;
END;
$function$;
REVOKE ALL ON FUNCTION public.khaavio_replace_menu_item_options(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.khaavio_replace_menu_item_options(uuid, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.khaavio_public_menu_item_options(p_slug text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $function$
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id', g.id, 'menu_item_id', g.menu_item_id, 'name', g.name,
    'min_selections', g.min_selections, 'max_selections', g.max_selections,
    'options', COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id', o.id, 'group_id', o.group_id, 'name', o.name, 'price_delta', o.price_delta
    ) ORDER BY o.sort_order, o.name) FROM public.menu_item_options o WHERE o.group_id = g.id AND o.is_available), '[]'::jsonb)
  ) ORDER BY g.sort_order, g.name), '[]'::jsonb)
  FROM public.menu_item_option_groups g JOIN public.restaurants r ON r.id = g.restaurant_id
  WHERE r.slug = pg_catalog.btrim(p_slug) AND r.is_published AND EXISTS (
    SELECT 1 FROM public.menu_items mi WHERE mi.id = g.menu_item_id AND mi.restaurant_id = g.restaurant_id AND mi.is_available
  );
$function$;
REVOKE ALL ON FUNCTION public.khaavio_public_menu_item_options(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.khaavio_public_menu_item_options(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.khaavio_insert_order_item_lines(p_order_id uuid, p_restaurant_id uuid, p_items jsonb)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE v_item jsonb; v_id uuid; v_qty integer; v_ids uuid[]; v_count integer; v_item_row record; v_group record; v_chosen integer; v_delta numeric(12,2); v_unit numeric(12,2); v_line numeric(12,2); v_snapshot jsonb; v_total numeric(12,2) := 0;
BEGIN
  IF pg_catalog.jsonb_typeof(p_items) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Your cart must be a list of items.' USING ERRCODE = '22023'; END IF;
  IF pg_catalog.jsonb_array_length(p_items) NOT BETWEEN 1 AND 30 THEN RAISE EXCEPTION 'Your cart must contain between 1 and 30 items.' USING ERRCODE = '22023'; END IF;
  FOR v_item IN SELECT value FROM pg_catalog.jsonb_array_elements(p_items) LOOP
    BEGIN
      v_id := (v_item ->> 'item_id')::uuid; v_qty := (v_item ->> 'quantity')::integer;
      SELECT COALESCE(pg_catalog.array_agg(x::uuid), ARRAY[]::uuid[]) INTO v_ids FROM pg_catalog.jsonb_array_elements_text(CASE WHEN pg_catalog.jsonb_typeof(v_item -> 'option_ids') = 'array' THEN v_item -> 'option_ids' ELSE '[]'::jsonb END) ids(x);
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RAISE EXCEPTION 'A cart item has invalid choices or quantity.' USING ERRCODE = '22023'; END;
    IF v_id IS NULL OR v_qty IS NULL OR v_qty NOT BETWEEN 1 AND 20 OR pg_catalog.cardinality(v_ids) > 30 THEN RAISE EXCEPTION 'Each dish needs a valid quantity and choices.' USING ERRCODE = '22023'; END IF;
    SELECT mi.id, mi.name, mi.price, mi.is_available INTO v_item_row FROM public.menu_items mi WHERE mi.id = v_id AND mi.restaurant_id = p_restaurant_id FOR SHARE;
    IF NOT FOUND OR v_item_row.is_available IS NOT TRUE THEN RAISE EXCEPTION 'A dish in your cart is no longer available.' USING ERRCODE = '22023'; END IF;
    SELECT COUNT(DISTINCT o.id)::integer INTO v_count FROM unnest(v_ids) AS picked(id)
      JOIN public.menu_item_options o ON o.id = picked.id AND o.menu_item_id = v_id AND o.restaurant_id = p_restaurant_id AND o.is_available;
    IF v_count <> pg_catalog.cardinality(v_ids) THEN RAISE EXCEPTION 'A choice is no longer available. Review your dish.' USING ERRCODE = '22023'; END IF;
    FOR v_group IN SELECT g.id, g.name, g.min_selections, g.max_selections FROM public.menu_item_option_groups g WHERE g.menu_item_id = v_id AND g.restaurant_id = p_restaurant_id LOOP
      SELECT COUNT(*)::integer INTO v_chosen FROM public.menu_item_options o WHERE o.group_id = v_group.id AND o.id = ANY(v_ids) AND o.is_available;
      IF v_chosen < v_group.min_selections OR v_chosen > v_group.max_selections THEN RAISE EXCEPTION 'Choose between % and % options for %.', v_group.min_selections, v_group.max_selections, v_group.name USING ERRCODE = '22023'; END IF;
    END LOOP;
    SELECT COALESCE(pg_catalog.sum(o.price_delta), 0), COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id', o.id, 'group_name', g.name, 'name', o.name, 'price_delta', o.price_delta) ORDER BY g.sort_order, o.sort_order, o.name), '[]'::jsonb)
      INTO v_delta, v_snapshot FROM public.menu_item_options o JOIN public.menu_item_option_groups g ON g.id = o.group_id
      WHERE o.id = ANY(v_ids) AND o.menu_item_id = v_id AND o.restaurant_id = p_restaurant_id AND o.is_available;
    v_unit := v_item_row.price + v_delta;
    IF v_unit < 0 THEN RAISE EXCEPTION 'A selected choice makes the price invalid.' USING ERRCODE = '22023'; END IF;
    v_line := pg_catalog.round(v_unit * v_qty, 2);
    INSERT INTO public.order_items (order_id, menu_item_id, item_name, unit_price, quantity, line_total, selected_options) VALUES (p_order_id, v_id, v_item_row.name, v_unit, v_qty, v_line, COALESCE(v_snapshot, '[]'::jsonb));
    v_total := v_total + v_line;
  END LOOP;
  RETURN v_total;
END;
$function$;
REVOKE ALL ON FUNCTION public.khaavio_insert_order_item_lines(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;

-- Existing QR and guest-tab RPCs keep their signatures and continue calling this function.
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
  INSERT INTO public.orders (restaurant_id, table_id, session_id, customer_name, customer_phone, notes, status, total_amount, service_mode)
    VALUES (v_restaurant_id, v_table_id, v_session_id, v_name, v_phone, v_notes, 'pending', 0, 'dine_in') RETURNING id, tracking_token INTO v_order_id, v_tracking;
  v_total := public.khaavio_insert_order_item_lines(v_order_id, v_restaurant_id, p_items);
  UPDATE public.orders SET total_amount = v_total WHERE id = v_order_id;
  RETURN QUERY SELECT v_order_id, pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(v_order_id::text, '-', ''), 1, 8)), v_total, v_tracking;
END;
$function$;
REVOKE ALL ON FUNCTION public.place_public_order(text, uuid, text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.place_public_order(text, uuid, text, text, text, jsonb) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.khaavio_validate_coupon(p_slug text, p_table_token uuid, p_code text, p_items jsonb)
RETURNS TABLE(is_valid boolean, coupon_code text, discount_amount numeric, total_amount numeric, message text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE v_restaurant_id uuid; v_item jsonb; v_id uuid; v_qty integer; v_ids uuid[]; v_count integer; v_group record; v_chosen integer; v_price numeric(12,2); v_available boolean; v_subtotal numeric(12,2) := 0; v_quote record;
BEGIN
  SELECT r.id INTO v_restaurant_id FROM public.restaurants r WHERE r.slug = pg_catalog.btrim(p_slug) AND r.is_published AND ((p_table_token IS NOT NULL AND EXISTS (SELECT 1 FROM public.restaurant_tables t WHERE t.restaurant_id = r.id AND t.qr_token = p_table_token AND t.is_active)) OR (p_table_token IS NULL AND (r.pickup_enabled OR r.dine_in_enabled))) LIMIT 1;
  IF v_restaurant_id IS NULL OR p_code IS NULL OR pg_catalog.btrim(p_code) = '' OR pg_catalog.jsonb_typeof(p_items) IS DISTINCT FROM 'array' THEN RETURN QUERY SELECT false, NULL::text, 0::numeric, 0::numeric, 'Enter a coupon code and check your cart.'::text; RETURN; END IF;
  IF pg_catalog.jsonb_array_length(p_items) NOT BETWEEN 1 AND 30 THEN RETURN QUERY SELECT false, NULL::text, 0::numeric, 0::numeric, 'Your cart needs updating.'::text; RETURN; END IF;
  FOR v_item IN SELECT value FROM pg_catalog.jsonb_array_elements(p_items) LOOP
    BEGIN
      v_id := (v_item ->> 'item_id')::uuid; v_qty := (v_item ->> 'quantity')::integer;
      SELECT COALESCE(pg_catalog.array_agg(x::uuid), ARRAY[]::uuid[]) INTO v_ids FROM pg_catalog.jsonb_array_elements_text(CASE WHEN pg_catalog.jsonb_typeof(v_item -> 'option_ids') = 'array' THEN v_item -> 'option_ids' ELSE '[]'::jsonb END) ids(x);
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RETURN QUERY SELECT false, NULL::text, 0::numeric, 0::numeric, 'Your cart needs updating.'::text; RETURN; END;
    IF v_id IS NULL OR v_qty IS NULL OR v_qty NOT BETWEEN 1 AND 20 THEN RETURN QUERY SELECT false, NULL::text, 0::numeric, 0::numeric, 'Your cart needs updating.'::text; RETURN; END IF;
    SELECT mi.price, mi.is_available INTO v_price, v_available FROM public.menu_items mi WHERE mi.id = v_id AND mi.restaurant_id = v_restaurant_id;
    IF NOT FOUND OR NOT v_available THEN RETURN QUERY SELECT false, NULL::text, 0::numeric, 0::numeric, 'A dish is no longer available.'::text; RETURN; END IF;
    SELECT COUNT(DISTINCT o.id)::integer INTO v_count FROM unnest(v_ids) AS picked(id) JOIN public.menu_item_options o ON o.id = picked.id AND o.menu_item_id = v_id AND o.restaurant_id = v_restaurant_id AND o.is_available;
    IF v_count <> pg_catalog.cardinality(v_ids) THEN RETURN QUERY SELECT false, NULL::text, 0::numeric, 0::numeric, 'A choice is unavailable.'::text; RETURN; END IF;
    FOR v_group IN SELECT g.id, g.name, g.min_selections, g.max_selections FROM public.menu_item_option_groups g WHERE g.menu_item_id = v_id AND g.restaurant_id = v_restaurant_id LOOP
      SELECT COUNT(*)::integer INTO v_chosen FROM public.menu_item_options o WHERE o.group_id = v_group.id AND o.id = ANY(v_ids) AND o.is_available;
      IF v_chosen < v_group.min_selections OR v_chosen > v_group.max_selections THEN RETURN QUERY SELECT false, NULL::text, 0::numeric, 0::numeric, pg_catalog.format('Choose the options for %s first.', v_group.name); RETURN; END IF;
    END LOOP;
    SELECT v_price + COALESCE(pg_catalog.sum(o.price_delta), 0) INTO v_price FROM public.menu_item_options o WHERE o.id = ANY(v_ids) AND o.menu_item_id = v_id AND o.restaurant_id = v_restaurant_id AND o.is_available;
    IF v_price < 0 THEN RETURN QUERY SELECT false, NULL::text, 0::numeric, 0::numeric, 'A choice has an invalid price.'::text; RETURN; END IF;
    v_subtotal := v_subtotal + pg_catalog.round(v_price * v_qty, 2);
  END LOOP;
  SELECT * INTO v_quote FROM public.khaavio_coupon_quote(v_restaurant_id, p_code, v_subtotal, false);
  RETURN QUERY SELECT v_quote.is_valid, v_quote.coupon_code, v_quote.discount_amount, v_subtotal - v_quote.discount_amount, v_quote.message;
END;
$function$;
REVOKE ALL ON FUNCTION public.khaavio_validate_coupon(text, uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.khaavio_validate_coupon(text, uuid, text, jsonb) TO anon, authenticated;

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
  INSERT INTO public.orders (restaurant_id, table_id, session_id, customer_name, customer_phone, notes, status, total_amount, service_mode, pickup_eta_minutes)
    VALUES (v_restaurant_id, NULL, NULL, v_name, v_phone, v_notes, 'pending', 0, p_service_mode, CASE WHEN p_service_mode = 'pickup' THEN p_pickup_eta_minutes END) RETURNING id, tracking_token INTO v_order_id, v_tracking;
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
REVOKE ALL ON FUNCTION public.place_public_order_for_service_mode(text, text, text, text, jsonb, text, smallint, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.place_public_order_for_service_mode(text, text, text, text, jsonb, text, smallint, text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.khaavio_public_restaurant_menu(p_slug text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE v_restaurant jsonb; v_id uuid; v_categories jsonb; v_items jsonb;
BEGIN
  IF p_slug IS NULL OR pg_catalog.btrim(p_slug) = '' THEN RETURN NULL; END IF;
  SELECT pg_catalog.to_jsonb(r) INTO v_restaurant FROM public.restaurants r WHERE r.slug = pg_catalog.btrim(p_slug) AND r.is_published LIMIT 1;
  IF v_restaurant IS NULL THEN RETURN NULL; END IF;
  v_id := (v_restaurant ->> 'id')::uuid;
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id', c.id, 'name', c.name, 'restaurant_id', c.restaurant_id) ORDER BY c.name), '[]'::jsonb) INTO v_categories FROM public.menu_categories c WHERE c.restaurant_id = v_id;
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id', m.id, 'name', m.name, 'description', m.description, 'price', m.price, 'image_url', m.image_url, 'is_available', m.is_available, 'category_id', m.category_id) ORDER BY m.name), '[]'::jsonb) INTO v_items FROM public.menu_items m WHERE m.restaurant_id = v_id AND m.is_available;
  RETURN pg_catalog.jsonb_build_object('restaurant', pg_catalog.jsonb_build_object(
    'id', v_restaurant -> 'id', 'name', v_restaurant -> 'name', 'slug', v_restaurant -> 'slug', 'restaurant_type', v_restaurant -> 'restaurant_type',
    'address', v_restaurant -> 'address', 'google_review_url', v_restaurant -> 'google_review_url', 'social_links', COALESCE(v_restaurant -> 'social_links', '{}'::jsonb),
    'is_published', v_restaurant -> 'is_published', 'is_accepting_orders', v_restaurant -> 'is_accepting_orders', 'business_hours', v_restaurant -> 'business_hours',
    'timezone', v_restaurant -> 'timezone', 'logo_url', v_restaurant -> 'logo_url', 'gst_enabled', v_restaurant -> 'gst_enabled', 'gst_rate', v_restaurant -> 'gst_rate',
    'gst_price_inclusive', v_restaurant -> 'gst_price_inclusive', 'pickup_enabled', v_restaurant -> 'pickup_enabled', 'dine_in_enabled', v_restaurant -> 'dine_in_enabled'),
    'categories', v_categories, 'items', v_items);
END;
$function$;
REVOKE ALL ON FUNCTION public.khaavio_public_restaurant_menu(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.khaavio_public_restaurant_menu(text) TO anon, authenticated;

COMMIT;
