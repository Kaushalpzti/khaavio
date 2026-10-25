-- Khaavio Loyalty Phone Identity: new forward migration; no OTP/SMS provider required.
-- Mobile numbers are customer-provided identifiers, NOT verified identities.
-- Public lookup intentionally does not return redemption codes. Staff must confirm ownership before redemption.
BEGIN;

ALTER TABLE public.restaurant_loyalty_members
  ADD COLUMN IF NOT EXISTS phone_number text,
  ADD COLUMN IF NOT EXISTS phone_consent_at timestamptz,
  ADD COLUMN IF NOT EXISTS marketing_opt_in boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS marketing_opt_in_at timestamptz,
  ADD COLUMN IF NOT EXISTS marketing_opt_out_at timestamptz;

ALTER TABLE public.restaurant_loyalty_members
  DROP CONSTRAINT IF EXISTS restaurant_loyalty_members_phone_format_check;
ALTER TABLE public.restaurant_loyalty_members
  ADD CONSTRAINT restaurant_loyalty_members_phone_format_check
  CHECK (phone_number IS NULL OR phone_number ~ '^\+91[6-9][0-9]{9}$');

CREATE UNIQUE INDEX IF NOT EXISTS restaurant_loyalty_members_restaurant_phone_uidx
  ON public.restaurant_loyalty_members (restaurant_id, phone_number)
  WHERE phone_number IS NOT NULL;

GRANT SELECT (phone_number, phone_consent_at, marketing_opt_in, marketing_opt_in_at, marketing_opt_out_at)
  ON TABLE public.restaurant_loyalty_members TO authenticated;

-- Best-effort per-browser lookup throttle (not a substitute for IP-based WAF protection).
CREATE TABLE IF NOT EXISTS public.restaurant_loyalty_phone_access_limits (
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  browser_token uuid NOT NULL,
  window_started_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  PRIMARY KEY (restaurant_id, browser_token)
);
ALTER TABLE public.restaurant_loyalty_phone_access_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.restaurant_loyalty_phone_access_limits FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.khaavio_normalize_indian_mobile(p_phone text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_digits text;
BEGIN
  v_digits := pg_catalog.regexp_replace(COALESCE(p_phone, ''), '[^0-9]', '', 'g');
  IF pg_catalog.length(v_digits) = 12 AND pg_catalog.left(v_digits, 2) = '91' THEN
    v_digits := pg_catalog.substr(v_digits, 3);
  END IF;
  IF pg_catalog.length(v_digits) <> 10 OR v_digits !~ '^[6-9][0-9]{9}$' THEN
    RETURN NULL;
  END IF;
  RETURN '+91' || v_digits;
END;
$function$;
REVOKE ALL ON FUNCTION public.khaavio_normalize_indian_mobile(text) FROM PUBLIC, anon, authenticated;

-- Safe public program status check for the Rewards sheet before a customer enters a phone number.
CREATE OR REPLACE FUNCTION public.get_public_loyalty_program_status(p_slug text)
RETURNS TABLE(is_enabled boolean, stamps_required integer, min_order_amount numeric, reward_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT COALESCE(lp.enabled, false), COALESCE(lp.stamps_required, 6),
         COALESCE(lp.min_order_amount, 0), COALESCE(lp.reward_name, 'Free treat')
  FROM (SELECT 1) AS seed
  LEFT JOIN public.restaurants r ON r.slug = p_slug AND r.is_published IS TRUE
  LEFT JOIN public.restaurant_loyalty_programs lp ON lp.restaurant_id = r.id
  LIMIT 1;
$function$;
REVOKE ALL ON FUNCTION public.get_public_loyalty_program_status(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_loyalty_program_status(text) TO anon, authenticated;

-- Internal helper: link an existing legacy browser member when possible so old stamps are preserved.
CREATE OR REPLACE FUNCTION public.khaavio_get_or_create_loyalty_member_by_phone(
  p_restaurant_id uuid,
  p_phone text,
  p_member_token uuid,
  p_marketing_opt_in boolean,
  p_update_marketing_consent boolean
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_phone text;
  v_member_id uuid;
  v_token_member_id uuid;
  v_existing_phone text;
  v_token uuid;
BEGIN
  v_phone := public.khaavio_normalize_indian_mobile(p_phone);
  IF v_phone IS NULL THEN
    RAISE EXCEPTION 'Enter a valid 10-digit Indian mobile number.' USING ERRCODE = '22023';
  END IF;

  SELECT lm.id INTO v_member_id
  FROM public.restaurant_loyalty_members lm
  WHERE lm.restaurant_id = p_restaurant_id AND lm.phone_number = v_phone
  FOR UPDATE;

  IF FOUND THEN
    -- If this browser still has a legacy token-only card, merge that card into the phone member
    -- so its ledger and unredeemed rewards are not stranded on the old device token.
    IF p_member_token IS NOT NULL THEN
      SELECT lm.id, lm.phone_number INTO v_token_member_id, v_existing_phone
      FROM public.restaurant_loyalty_members lm
      WHERE lm.restaurant_id = p_restaurant_id AND lm.member_token = p_member_token
      FOR UPDATE;

      IF v_token_member_id IS NOT NULL AND v_token_member_id <> v_member_id AND v_existing_phone IS NULL THEN
        UPDATE public.restaurant_loyalty_ledger
        SET member_id = v_member_id
        WHERE restaurant_id = p_restaurant_id AND member_id = v_token_member_id;

        UPDATE public.restaurant_loyalty_rewards
        SET member_id = v_member_id
        WHERE restaurant_id = p_restaurant_id AND member_id = v_token_member_id;

        PERFORM pg_catalog.set_config('app.khaavio_assign_loyalty_member', 'on', true);
        UPDATE public.orders o
        SET loyalty_member_id = v_member_id
        WHERE o.restaurant_id = p_restaurant_id AND o.loyalty_member_id = v_token_member_id;
        PERFORM pg_catalog.set_config('app.khaavio_assign_loyalty_member', 'off', true);

        DELETE FROM public.restaurant_loyalty_members lm
        WHERE lm.id = v_token_member_id AND lm.restaurant_id = p_restaurant_id;
      END IF;
    END IF;

    UPDATE public.restaurant_loyalty_members lm
    SET last_seen_at = pg_catalog.now(),
        marketing_opt_in = CASE WHEN p_update_marketing_consent THEN COALESCE(p_marketing_opt_in, false) ELSE lm.marketing_opt_in END,
        marketing_opt_in_at = CASE
          WHEN p_update_marketing_consent AND COALESCE(p_marketing_opt_in, false) THEN pg_catalog.now()
          ELSE lm.marketing_opt_in_at
        END,
        marketing_opt_out_at = CASE
          WHEN p_update_marketing_consent AND NOT COALESCE(p_marketing_opt_in, false) AND lm.marketing_opt_in THEN pg_catalog.now()
          ELSE lm.marketing_opt_out_at
        END
    WHERE lm.id = v_member_id;
    RETURN v_member_id;
  END IF;

  IF p_member_token IS NOT NULL THEN
    SELECT lm.id, lm.phone_number INTO v_token_member_id, v_existing_phone
    FROM public.restaurant_loyalty_members lm
    WHERE lm.restaurant_id = p_restaurant_id AND lm.member_token = p_member_token
    FOR UPDATE;
  END IF;

  IF v_token_member_id IS NOT NULL AND v_existing_phone IS NULL THEN
    UPDATE public.restaurant_loyalty_members lm
    SET phone_number = v_phone,
        phone_consent_at = pg_catalog.now(),
        last_seen_at = pg_catalog.now(),
        marketing_opt_in = COALESCE(p_marketing_opt_in, false),
        marketing_opt_in_at = CASE WHEN COALESCE(p_marketing_opt_in, false) THEN pg_catalog.now() ELSE NULL END
    WHERE lm.id = v_token_member_id
    RETURNING lm.id INTO v_member_id;
    RETURN v_member_id;
  ELSIF v_token_member_id IS NOT NULL AND v_existing_phone = v_phone THEN
    RETURN v_token_member_id;
  END IF;

  -- Avoid taking a device token already linked to a different number.
  v_token := COALESCE(p_member_token, pg_catalog.gen_random_uuid());
  IF EXISTS (
    SELECT 1 FROM public.restaurant_loyalty_members lm
    WHERE lm.restaurant_id = p_restaurant_id AND lm.member_token = v_token
  ) THEN
    v_token := pg_catalog.gen_random_uuid();
  END IF;

  BEGIN
    INSERT INTO public.restaurant_loyalty_members (
      restaurant_id, member_token, phone_number, phone_consent_at,
      marketing_opt_in, marketing_opt_in_at, last_seen_at
    ) VALUES (
      p_restaurant_id, v_token, v_phone, pg_catalog.now(),
      COALESCE(p_marketing_opt_in, false),
      CASE WHEN COALESCE(p_marketing_opt_in, false) THEN pg_catalog.now() ELSE NULL END,
      pg_catalog.now()
    ) RETURNING id INTO v_member_id;
  EXCEPTION WHEN unique_violation THEN
    SELECT lm.id INTO v_member_id
    FROM public.restaurant_loyalty_members lm
    WHERE lm.restaurant_id = p_restaurant_id AND lm.phone_number = v_phone
    FOR UPDATE;
    IF v_member_id IS NULL THEN RAISE; END IF;
    UPDATE public.restaurant_loyalty_members lm
    SET last_seen_at = pg_catalog.now()
    WHERE lm.id = v_member_id;
  END;
  RETURN v_member_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.khaavio_get_or_create_loyalty_member_by_phone(uuid, text, uuid, boolean, boolean) FROM PUBLIC, anon, authenticated;

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
  v_balance integer := 0;
  v_rewards jsonb := '[]'::jsonb;
  v_phone text;
  v_marketing boolean := false;
  v_attempts integer;
BEGIN
  IF p_loyalty_consent IS NOT TRUE THEN
    RAISE EXCEPTION 'Loyalty mobile number consent is required.' USING ERRCODE = '42501';
  END IF;
  v_phone := public.khaavio_normalize_indian_mobile(p_phone);
  IF v_phone IS NULL THEN
    RAISE EXCEPTION 'Enter a valid 10-digit Indian mobile number.' USING ERRCODE = '22023';
  END IF;

  SELECT r.id, COALESCE(lp.enabled, false), COALESCE(lp.stamps_required, 6), COALESCE(lp.min_order_amount, 0)
  INTO v_restaurant_id, v_enabled, v_goal, v_minimum
  FROM public.restaurants r
  LEFT JOIN public.restaurant_loyalty_programs lp ON lp.restaurant_id = r.id
  WHERE r.slug = p_slug AND r.is_published IS TRUE
  LIMIT 1;

  IF v_restaurant_id IS NULL OR v_enabled IS NOT TRUE THEN
    RETURN QUERY SELECT false, v_goal, v_minimum, 0, '[]'::jsonb, pg_catalog.right(v_phone, 4), false;
    RETURN;
  END IF;

  IF p_member_token IS NULL THEN
    RAISE EXCEPTION 'Browser storage is required to access Khaavio Perks on this device.' USING ERRCODE = '42501';
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
    RAISE EXCEPTION 'Too many Perks lookup attempts. Please wait 15 minutes and try again.' USING ERRCODE = 'P0001';
  END IF;

  v_member_id := public.khaavio_get_or_create_loyalty_member_by_phone(
    v_restaurant_id, v_phone, p_member_token, COALESCE(p_marketing_opt_in, false), COALESCE(p_update_marketing_consent, false)
  );

  SELECT COALESCE(pg_catalog.sum(l.stamps_delta), 0)::integer INTO v_balance
  FROM public.restaurant_loyalty_ledger l WHERE l.member_id = v_member_id AND l.restaurant_id = v_restaurant_id;

  -- Never expose redemption codes over the unauthenticated phone-only lookup RPC.
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id', rw.id, 'created_at', rw.created_at, 'reward_name', rw.reward_name, 'status', rw.status
    ) ORDER BY rw.created_at DESC), '[]'::jsonb)
  INTO v_rewards
  FROM public.restaurant_loyalty_rewards rw
  WHERE rw.member_id = v_member_id AND rw.restaurant_id = v_restaurant_id AND rw.status = 'available' AND rw.revealed_at IS NOT NULL;

  SELECT lm.marketing_opt_in INTO v_marketing
  FROM public.restaurant_loyalty_members lm WHERE lm.id = v_member_id AND lm.restaurant_id = v_restaurant_id;

  RETURN QUERY SELECT true, v_goal, v_minimum, v_balance, v_rewards, pg_catalog.right(v_phone, 4), COALESCE(v_marketing, false);
END;
$function$;
REVOKE ALL ON FUNCTION public.ensure_public_loyalty_member_by_phone(text, text, uuid, boolean, boolean, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_public_loyalty_member_by_phone(text, text, uuid, boolean, boolean, boolean) TO anon, authenticated;

-- New overload used by the updated client. Orders still use the existing trusted order RPC.
-- Loyalty is attached only if the customer explicitly joined using the same number.
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
  FROM public.place_public_order(p_slug, p_table_token, p_customer_name, p_customer_phone, p_notes, p_items) AS placed;

  IF p_loyalty_phone IS NOT NULL AND pg_catalog.btrim(p_loyalty_phone) <> '' THEN
    v_phone := public.khaavio_normalize_indian_mobile(p_loyalty_phone);
    IF v_phone IS NULL THEN
      RAISE EXCEPTION 'Invalid loyalty mobile number. Update your Perks card or continue without Loyalty.' USING ERRCODE = '22023';
    END IF;

    SELECT o.restaurant_id INTO v_restaurant_id FROM public.orders o WHERE o.id = v_order_id;
    SELECT COALESCE(lp.enabled, false) INTO v_enabled
    FROM public.restaurant_loyalty_programs lp WHERE lp.restaurant_id = v_restaurant_id;
    IF v_enabled IS TRUE THEN
      SELECT lm.id INTO v_member_id
      FROM public.restaurant_loyalty_members lm
      WHERE lm.restaurant_id = v_restaurant_id AND lm.phone_number = v_phone
      FOR UPDATE;

      IF v_member_id IS NOT NULL THEN
        PERFORM pg_catalog.set_config('app.khaavio_assign_loyalty_member', 'on', true);
        UPDATE public.orders o SET loyalty_member_id = v_member_id
        WHERE o.id = v_order_id AND o.restaurant_id = v_restaurant_id;
        PERFORM pg_catalog.set_config('app.khaavio_assign_loyalty_member', 'off', true);
      END IF;
    END IF;
  END IF;

  RETURN QUERY SELECT v_order_id, v_order_reference, v_total_amount, v_tracking_token;
END;
$function$;
REVOKE ALL ON FUNCTION public.place_public_order_with_loyalty(text, uuid, text, text, text, jsonb, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.place_public_order_with_loyalty(text, uuid, text, text, text, jsonb, uuid, text) TO anon, authenticated;

COMMIT;
