-- Public SEO sitemap and server-mediated public feedback protection.
-- The public sitemap RPC returns only published restaurant slugs.
-- Feedback writes are moved behind a rate-limited Edge Function.
BEGIN;

CREATE OR REPLACE FUNCTION public.khaavio_public_sitemap_restaurant_slugs()
RETURNS TABLE(slug text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT r.slug::text
  FROM public.restaurants AS r
  WHERE r.is_published IS TRUE
    AND r.slug IS NOT NULL
    AND pg_catalog.btrim(r.slug) <> ''
  ORDER BY r.slug;
$function$;
REVOKE ALL ON FUNCTION public.khaavio_public_sitemap_restaurant_slugs() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.khaavio_public_sitemap_restaurant_slugs() TO anon, authenticated;

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS private.khaavio_public_feedback_rate_limits (
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  ip_hash text NOT NULL CHECK (ip_hash ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  submission_count integer NOT NULL DEFAULT 0 CHECK (submission_count >= 0),
  PRIMARY KEY (restaurant_id, ip_hash)
);
ALTER TABLE private.khaavio_public_feedback_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.khaavio_public_feedback_rate_limits FROM PUBLIC, anon, authenticated, service_role;

-- This function is callable only by the service-role Edge Function. The browser
-- cannot supply its own IP hash or bypass the rate limiter using the old public RPC.
CREATE OR REPLACE FUNCTION public.submit_public_restaurant_feedback_rate_limited(
  p_restaurant_slug text,
  p_rating integer,
  p_category text,
  p_message text,
  p_ip_hash text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_restaurant_id uuid;
  v_category text;
  v_message text;
  v_count integer;
  v_feedback_id uuid;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Service-side feedback submission is required.' USING ERRCODE = '42501';
  END IF;
  IF p_restaurant_slug IS NULL OR pg_catalog.btrim(p_restaurant_slug) = ''
     OR pg_catalog.char_length(p_restaurant_slug) > 160 THEN
    RAISE EXCEPTION 'A valid restaurant menu is required.' USING ERRCODE = '22023';
  END IF;
  IF p_rating IS NULL OR p_rating < 1 OR p_rating > 5 THEN
    RAISE EXCEPTION 'Choose a rating from 1 to 5.' USING ERRCODE = '22023';
  END IF;
  v_category := pg_catalog.lower(pg_catalog.btrim(COALESCE(p_category, 'other')));
  IF v_category NOT IN ('food', 'service', 'ambience', 'other') THEN
    RAISE EXCEPTION 'Choose a valid feedback category.' USING ERRCODE = '22023';
  END IF;
  v_message := NULLIF(pg_catalog.btrim(p_message), '');
  IF pg_catalog.char_length(v_message) > 1000 THEN
    RAISE EXCEPTION 'Feedback must be 1,000 characters or fewer.' USING ERRCODE = '22023';
  END IF;
  IF p_ip_hash IS NULL OR p_ip_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Feedback protection could not verify this request.' USING ERRCODE = '22023';
  END IF;

  SELECT r.id INTO v_restaurant_id
  FROM public.restaurants AS r
  WHERE r.slug = pg_catalog.btrim(p_restaurant_slug)
    AND r.is_published IS TRUE
  LIMIT 1;
  IF v_restaurant_id IS NULL THEN
    RAISE EXCEPTION 'This restaurant menu is not available for feedback.' USING ERRCODE = '22023';
  END IF;

  -- Keep the private limiter bounded; stale pseudonymous buckets are not needed for enforcement.
  DELETE FROM private.khaavio_public_feedback_rate_limits AS stale
  WHERE stale.window_started_at < pg_catalog.now() - interval '1 day';

  INSERT INTO private.khaavio_public_feedback_rate_limits AS limits (
    restaurant_id, ip_hash, window_started_at, submission_count
  ) VALUES (v_restaurant_id, p_ip_hash, pg_catalog.now(), 1)
  ON CONFLICT (restaurant_id, ip_hash) DO UPDATE SET
    submission_count = CASE
      WHEN limits.window_started_at <= pg_catalog.now() - interval '10 minutes' THEN 1
      ELSE limits.submission_count + 1
    END,
    window_started_at = CASE
      WHEN limits.window_started_at <= pg_catalog.now() - interval '10 minutes' THEN pg_catalog.now()
      ELSE limits.window_started_at
    END
  RETURNING submission_count INTO v_count;

  IF v_count > 8 THEN
    RAISE EXCEPTION 'Too many feedback submissions. Please try again later.' USING ERRCODE = '54000';
  END IF;

  INSERT INTO public.restaurant_feedback (restaurant_id, rating, category, message, source)
  VALUES (v_restaurant_id, p_rating::smallint, v_category, v_message, 'public_menu')
  RETURNING id INTO v_feedback_id;
  RETURN v_feedback_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.submit_public_restaurant_feedback_rate_limited(text, integer, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_public_restaurant_feedback_rate_limited(text, integer, text, text, text) TO service_role;

-- Remove direct browser execution of the previous unlimited public write RPC.
REVOKE ALL ON FUNCTION public.submit_restaurant_feedback(text, integer, text, text)
  FROM PUBLIC, anon, authenticated;

-- Phone-only lookup is not identity verification. Keep the historical function
-- definition and historical phone data, but revoke public access until OTP exists.
REVOKE ALL ON FUNCTION public.ensure_public_loyalty_member_by_phone(text, text, uuid, boolean, boolean, boolean)
  FROM PUBLIC, anon, authenticated;

-- Revert dine-in/table Perks association to the random browser bearer token.
-- The legacy phone argument remains in the signature for compatibility and is ignored.
CREATE OR REPLACE FUNCTION public.place_public_order_with_loyalty(
  p_slug text,
  p_table_token uuid,
  p_customer_name text,
  p_customer_phone text,
  p_notes text,
  p_items jsonb,
  p_loyalty_member_token uuid,
  p_loyalty_phone text
)
RETURNS TABLE(order_id uuid, order_reference text, total_amount numeric, tracking_token uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_order_id uuid;
  v_order_reference text;
  v_total_amount numeric;
  v_tracking_token uuid;
  v_restaurant_id uuid;
  v_member_id uuid;
  v_enabled boolean := false;
BEGIN
  SELECT placed.order_id, placed.order_reference, placed.total_amount, placed.tracking_token
  INTO v_order_id, v_order_reference, v_total_amount, v_tracking_token
  FROM public.place_public_order(p_slug, p_table_token, p_customer_name, p_customer_phone, p_notes, p_items) AS placed;

  IF p_loyalty_member_token IS NOT NULL THEN
    SELECT o.restaurant_id INTO v_restaurant_id FROM public.orders AS o WHERE o.id = v_order_id;
    SELECT COALESCE(lp.enabled, false) INTO v_enabled
    FROM public.restaurant_loyalty_programs AS lp WHERE lp.restaurant_id = v_restaurant_id;
    IF v_enabled IS TRUE THEN
      INSERT INTO public.restaurant_loyalty_members (restaurant_id, member_token)
      VALUES (v_restaurant_id, p_loyalty_member_token)
      ON CONFLICT (restaurant_id, member_token)
      DO UPDATE SET last_seen_at = pg_catalog.now()
      RETURNING id INTO v_member_id;
      PERFORM pg_catalog.set_config('app.khaavio_assign_loyalty_member', 'on', true);
      UPDATE public.orders AS o SET loyalty_member_id = v_member_id
      WHERE o.id = v_order_id AND o.restaurant_id = v_restaurant_id;
      PERFORM pg_catalog.set_config('app.khaavio_assign_loyalty_member', 'off', true);
    END IF;
  END IF;

  RETURN QUERY SELECT v_order_id, v_order_reference, v_total_amount, v_tracking_token;
END;
$function$;
REVOKE ALL ON FUNCTION public.place_public_order_with_loyalty(text, uuid, text, text, text, jsonb, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.place_public_order_with_loyalty(text, uuid, text, text, text, jsonb, uuid, text) TO anon, authenticated;

-- Pickup and walk-in orders use the same browser-token Perks identity. The old
-- phone-taking signature is retained but disabled so clients cannot claim a card by number.
CREATE OR REPLACE FUNCTION public.place_public_order_for_service_mode(
  p_slug text,
  p_customer_name text,
  p_customer_phone text,
  p_notes text,
  p_items jsonb,
  p_service_mode text,
  p_pickup_eta_minutes smallint,
  p_coupon_code text,
  p_loyalty_member_token uuid
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
  v_member uuid;
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
    AND r.is_published IS TRUE
    AND ((p_service_mode = 'pickup' AND r.pickup_enabled) OR (p_service_mode = 'dine_in' AND r.dine_in_enabled))
  FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'This order mode is not available.' USING ERRCODE = '22023'; END IF;
  IF NOT public.khaavio_restaurant_subscription_allows_operations(v_restaurant_id)
     OR v_accepting IS NOT TRUE
     OR NOT public.khaavio_restaurant_open_at(v_hours, v_timezone, pg_catalog.now()) THEN
    RAISE EXCEPTION 'Online ordering is not available right now.' USING ERRCODE = '55000';
  END IF;

  INSERT INTO public.orders (restaurant_id, table_id, session_id, customer_name, customer_phone, notes, status, total_amount, service_mode, pickup_eta_minutes)
  VALUES (v_restaurant_id, NULL, NULL, v_name, v_phone, v_notes, 'pending', 0, p_service_mode,
    CASE WHEN p_service_mode = 'pickup' THEN p_pickup_eta_minutes END)
  RETURNING id, tracking_token INTO v_order_id, v_tracking;
  v_total := public.khaavio_insert_order_item_lines(v_order_id, v_restaurant_id, p_items);
  UPDATE public.orders SET total_amount = v_total WHERE id = v_order_id;
  v_final := public.khaavio_apply_order_coupon(v_order_id, p_coupon_code);

  IF p_loyalty_member_token IS NOT NULL THEN
    SELECT COALESCE(lp.enabled, false) INTO v_accepting
    FROM public.restaurant_loyalty_programs AS lp WHERE lp.restaurant_id = v_restaurant_id;
    IF v_accepting IS TRUE THEN
      INSERT INTO public.restaurant_loyalty_members (restaurant_id, member_token)
      VALUES (v_restaurant_id, p_loyalty_member_token)
      ON CONFLICT (restaurant_id, member_token)
      DO UPDATE SET last_seen_at = pg_catalog.now()
      RETURNING id INTO v_member;
      PERFORM pg_catalog.set_config('app.khaavio_assign_loyalty_member', 'on', true);
      UPDATE public.orders SET loyalty_member_id = v_member WHERE id = v_order_id AND restaurant_id = v_restaurant_id;
      PERFORM pg_catalog.set_config('app.khaavio_assign_loyalty_member', 'off', true);
    END IF;
  END IF;

  RETURN QUERY SELECT v_order_id, pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(v_order_id::text, '-', ''), 1, 8)), v_final, v_tracking;
END;
$function$;
REVOKE ALL ON FUNCTION public.place_public_order_for_service_mode(text, text, text, text, jsonb, text, smallint, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.place_public_order_for_service_mode(text, text, text, text, jsonb, text, smallint, text, uuid) TO anon, authenticated;

COMMIT;
