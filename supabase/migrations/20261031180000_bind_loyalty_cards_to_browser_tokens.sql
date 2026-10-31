BEGIN;

-- The browser's random member token, not an unverified phone number, is the bearer
-- credential for a public loyalty card. A phone number can be linked to one token,
-- but cannot be used to retrieve or merge another token's balance or rewards.
CREATE OR REPLACE FUNCTION public.ensure_public_loyalty_member_by_phone(
  p_slug text,
  p_phone text,
  p_member_token uuid,
  p_loyalty_consent boolean,
  p_marketing_opt_in boolean,
  p_update_marketing_consent boolean
)
RETURNS TABLE(
  is_enabled boolean,
  stamps_required integer,
  min_order_amount numeric,
  stamps_balance integer,
  available_rewards jsonb,
  phone_last4 text,
  marketing_opt_in boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_restaurant_id uuid;
  v_enabled boolean := false;
  v_goal integer := 6;
  v_minimum numeric(12,2) := 0;
  v_member_id uuid;
  v_existing_phone text;
  v_balance integer := 0;
  v_rewards jsonb := '[]'::jsonb;
  v_phone text;
  v_marketing boolean := false;
  v_attempts integer;
BEGIN
  IF p_loyalty_consent IS NOT TRUE THEN
    RAISE EXCEPTION 'Loyalty mobile number consent is required.' USING ERRCODE = '42501';
  END IF;
  IF p_member_token IS NULL THEN
    RAISE EXCEPTION 'This Perks card needs its browser token. Enable browser storage and try again.' USING ERRCODE = '42501';
  END IF;
  v_phone := public.khaavio_normalize_indian_mobile(p_phone);
  IF v_phone IS NULL THEN
    RAISE EXCEPTION 'Enter a valid 10-digit Indian mobile number.' USING ERRCODE = '22023';
  END IF;

  SELECT r.id, COALESCE(lp.enabled, false), COALESCE(lp.stamps_required, 6), COALESCE(lp.min_order_amount, 0)
  INTO v_restaurant_id, v_enabled, v_goal, v_minimum
  FROM public.restaurants AS r
  LEFT JOIN public.restaurant_loyalty_programs AS lp ON lp.restaurant_id = r.id
  WHERE r.slug = pg_catalog.btrim(p_slug) AND r.is_published IS TRUE
  LIMIT 1;

  IF v_restaurant_id IS NULL OR v_enabled IS NOT TRUE THEN
    RETURN QUERY SELECT false, v_goal, v_minimum, 0, '[]'::jsonb, pg_catalog.right(v_phone, 4), false;
    RETURN;
  END IF;

  INSERT INTO public.restaurant_loyalty_phone_access_limits AS phone_limit
    (restaurant_id, browser_token, window_started_at, attempts)
  VALUES (v_restaurant_id, p_member_token, pg_catalog.now(), 1)
  ON CONFLICT (restaurant_id, browser_token) DO UPDATE
  SET attempts = CASE
        WHEN phone_limit.window_started_at < pg_catalog.now() - interval '15 minutes' THEN 1
        ELSE phone_limit.attempts + 1
      END,
      window_started_at = CASE
        WHEN phone_limit.window_started_at < pg_catalog.now() - interval '15 minutes' THEN pg_catalog.now()
        ELSE phone_limit.window_started_at
      END
  RETURNING attempts INTO v_attempts;

  IF v_attempts > 12 THEN
    RAISE EXCEPTION 'Too many Perks attempts. Please wait 15 minutes and try again.' USING ERRCODE = 'P0001';
  END IF;

  SELECT lm.id, lm.phone_number
  INTO v_member_id, v_existing_phone
  FROM public.restaurant_loyalty_members AS lm
  WHERE lm.restaurant_id = v_restaurant_id
    AND lm.member_token = p_member_token
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing_phone IS NOT NULL AND v_existing_phone <> v_phone THEN
      RAISE EXCEPTION 'This browser card is linked to a different mobile number. Contact the restaurant team to update it.'
        USING ERRCODE = '42501';
    END IF;

    IF v_existing_phone IS NULL AND EXISTS (
      SELECT 1 FROM public.restaurant_loyalty_members AS other_member
      WHERE other_member.restaurant_id = v_restaurant_id
        AND other_member.phone_number = v_phone
        AND other_member.member_token <> p_member_token
    ) THEN
      RAISE EXCEPTION 'This number is already linked to another Perks card. For your privacy, ask restaurant staff for help.'
        USING ERRCODE = '42501';
    END IF;

    UPDATE public.restaurant_loyalty_members AS lm
    SET phone_number = COALESCE(lm.phone_number, v_phone),
        phone_consent_at = COALESCE(lm.phone_consent_at, pg_catalog.now()),
        last_seen_at = pg_catalog.now(),
        marketing_opt_in = CASE
          WHEN p_update_marketing_consent IS TRUE THEN COALESCE(p_marketing_opt_in, false)
          ELSE lm.marketing_opt_in
        END,
        marketing_opt_in_at = CASE
          WHEN p_update_marketing_consent IS TRUE AND COALESCE(p_marketing_opt_in, false) THEN pg_catalog.now()
          ELSE lm.marketing_opt_in_at
        END,
        marketing_opt_out_at = CASE
          WHEN p_update_marketing_consent IS TRUE AND NOT COALESCE(p_marketing_opt_in, false) AND lm.marketing_opt_in THEN pg_catalog.now()
          ELSE lm.marketing_opt_out_at
        END
    WHERE lm.id = v_member_id;
  ELSE
    IF EXISTS (
      SELECT 1 FROM public.restaurant_loyalty_members AS other_member
      WHERE other_member.restaurant_id = v_restaurant_id
        AND other_member.phone_number = v_phone
    ) THEN
      RAISE EXCEPTION 'This number is already linked to a Perks card on another device. For your privacy, ask restaurant staff for help.'
        USING ERRCODE = '42501';
    END IF;

    INSERT INTO public.restaurant_loyalty_members (
      restaurant_id, member_token, phone_number, phone_consent_at,
      marketing_opt_in, marketing_opt_in_at, last_seen_at
    )
    VALUES (
      v_restaurant_id, p_member_token, v_phone, pg_catalog.now(),
      COALESCE(p_marketing_opt_in, false),
      CASE WHEN COALESCE(p_marketing_opt_in, false) THEN pg_catalog.now() ELSE NULL END,
      pg_catalog.now()
    )
    RETURNING id INTO v_member_id;
  END IF;

  SELECT COALESCE(pg_catalog.sum(l.stamps_delta), 0)::integer
  INTO v_balance
  FROM public.restaurant_loyalty_ledger AS l
  WHERE l.member_id = v_member_id AND l.restaurant_id = v_restaurant_id;

  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', rw.id,
        'created_at', rw.created_at,
        'reward_name', rw.reward_name,
        'status', rw.status
      ) ORDER BY rw.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_rewards
  FROM public.restaurant_loyalty_rewards AS rw
  WHERE rw.member_id = v_member_id
    AND rw.restaurant_id = v_restaurant_id
    AND rw.status = 'available'
    AND rw.revealed_at IS NOT NULL;

  SELECT lm.marketing_opt_in INTO v_marketing
  FROM public.restaurant_loyalty_members AS lm
  WHERE lm.id = v_member_id AND lm.restaurant_id = v_restaurant_id;

  RETURN QUERY SELECT true, v_goal, v_minimum, v_balance, v_rewards,
    pg_catalog.right(v_phone, 4), COALESCE(v_marketing, false);
END;
$function$;

-- An order can earn stamps only for the same token-bound member card, never
-- by supplying another customer's phone number alone.
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
  v_phone text;
  v_enabled boolean := false;
BEGIN
  SELECT placed.order_id, placed.order_reference, placed.total_amount, placed.tracking_token
  INTO v_order_id, v_order_reference, v_total_amount, v_tracking_token
  FROM public.place_public_order(
    p_slug, p_table_token, p_customer_name, p_customer_phone, p_notes, p_items
  ) AS placed;

  IF p_loyalty_member_token IS NOT NULL
     AND p_loyalty_phone IS NOT NULL
     AND pg_catalog.btrim(p_loyalty_phone) <> '' THEN
    v_phone := public.khaavio_normalize_indian_mobile(p_loyalty_phone);
    IF v_phone IS NULL THEN
      RAISE EXCEPTION 'Invalid loyalty mobile number. Update your Perks card or continue without Loyalty.'
        USING ERRCODE = '22023';
    END IF;

    SELECT o.restaurant_id INTO v_restaurant_id
    FROM public.orders AS o WHERE o.id = v_order_id;
    SELECT COALESCE(lp.enabled, false) INTO v_enabled
    FROM public.restaurant_loyalty_programs AS lp WHERE lp.restaurant_id = v_restaurant_id;

    IF v_enabled IS TRUE THEN
      SELECT lm.id INTO v_member_id
      FROM public.restaurant_loyalty_members AS lm
      WHERE lm.restaurant_id = v_restaurant_id
        AND lm.member_token = p_loyalty_member_token
        AND lm.phone_number = v_phone
      FOR UPDATE;

      IF v_member_id IS NOT NULL THEN
        PERFORM pg_catalog.set_config('app.khaavio_assign_loyalty_member', 'on', true);
        UPDATE public.orders AS o
        SET loyalty_member_id = v_member_id
        WHERE o.id = v_order_id AND o.restaurant_id = v_restaurant_id;
        PERFORM pg_catalog.set_config('app.khaavio_assign_loyalty_member', 'off', true);
      END IF;
    END IF;
  END IF;

  RETURN QUERY SELECT v_order_id, v_order_reference, v_total_amount, v_tracking_token;
END;
$function$;

REVOKE ALL ON FUNCTION public.ensure_public_loyalty_member_by_phone(text, text, uuid, boolean, boolean, boolean)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_public_loyalty_member_by_phone(text, text, uuid, boolean, boolean, boolean)
  TO anon, authenticated;

COMMIT;
