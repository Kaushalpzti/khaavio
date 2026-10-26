-- Khaavio Starter/Growth feature separation.
-- Preserve subscriptions and customer data; only plan flags, public feature discovery,
-- and entitlement checks are updated. No plan price or subscription period changes.
BEGIN;

-- 1) Expand the canonical plan feature catalog. Starter keeps core operations and a
-- configured Google review link; Growth adds loyalty, private feedback and Ask Khaavio AI.
UPDATE public.subscription_plans sp
SET description = 'Core menu, QR ordering and everyday restaurant operations for a single outlet, with a configured Google review link.',
    features = jsonb_build_array(
      'Mobile-friendly digital menu and menu management',
      'Restaurant and table QR codes',
      'QR ordering, Kitchen Display, order tracking and receipts',
      'Table-side service requests, table sessions, final billing and printable invoices',
      'Basic table-booking management',
      'Basic order analytics, restaurant hours and pause-orders controls',
      'Operational voice alerts for orders, kitchen and service requests',
      'Optional Google Business review link on the public menu'
    ),
    limits = coalesce(sp.limits, '{}'::jsonb) || jsonb_build_object(
      'feature_flags', coalesce(sp.limits -> 'feature_flags', '{}'::jsonb) || jsonb_build_object(
        'loyalty_rewards', false,
        'private_feedback', false,
        'google_review_link', true,
        'ai_menu_assistant', false,
        'voice_alerts_advanced', false
      )
    ),
    updated_at = pg_catalog.now()
WHERE sp.plan_key IN ('starter', 'starter_yearly');

UPDATE public.subscription_plans sp
SET description = 'Everything in Starter, plus advanced booking tools, loyalty, guest feedback and menu assistance.',
    features = jsonb_build_array(
      'Everything in Starter',
      'Advanced booking calendar, search and date filters',
      'Booking CSV export',
      'Enhanced analytics and menu performance insights',
      'Digital loyalty stamps and rewards',
      'Private guest ratings, feedback inbox and review follow-up tools',
      'Ask Khaavio AI menu assistant in English, Hindi and Hinglish (usage limits apply)',
      'Advanced voice alerts for Growth-specific workflows',
      'Priority support during the founding pilot'
    ),
    limits = coalesce(sp.limits, '{}'::jsonb) || jsonb_build_object(
      'feature_flags', coalesce(sp.limits -> 'feature_flags', '{}'::jsonb) || jsonb_build_object(
        'loyalty_rewards', true,
        'private_feedback', true,
        'google_review_link', true,
        'ai_menu_assistant', true,
        'voice_alerts_advanced', true
      )
    ),
    updated_at = pg_catalog.now()
WHERE sp.plan_key IN ('growth', 'growth_yearly');

-- Trial keeps its clear trial messaging while receiving the full Growth entitlement set.
UPDATE public.subscription_plans sp
SET description = 'Full access to Khaavio Growth features for 7 days. No payment is collected during the trial.',
    features = jsonb_build_array(
      'Full access to Starter and Growth features during the 7-day trial',
      'Advanced booking calendar, search and date filters with CSV export',
      'Enhanced analytics and menu performance insights',
      'Digital loyalty stamps and rewards',
      'Private guest ratings, feedback inbox and review follow-up tools',
      'Ask Khaavio AI menu assistant in English, Hindi and Hinglish (usage limits apply)',
      'Advanced voice alerts for Growth-specific workflows'
    ),
    limits = coalesce(sp.limits, '{}'::jsonb) || jsonb_build_object(
      'feature_flags', coalesce(sp.limits -> 'feature_flags', '{}'::jsonb) || jsonb_build_object(
        'loyalty_rewards', true,
        'private_feedback', true,
        'google_review_link', true,
        'ai_menu_assistant', true,
        'voice_alerts_advanced', true
      )
    ),
    updated_at = pg_catalog.now()
WHERE sp.plan_key = 'trial';

-- Existing pilot and legacy Pro subscriptions retain their prior catalog copy/status;
-- only the newly introduced Growth entitlements are explicitly enabled for them.
UPDATE public.subscription_plans sp
SET limits = coalesce(sp.limits, '{}'::jsonb) || jsonb_build_object(
      'feature_flags', coalesce(sp.limits -> 'feature_flags', '{}'::jsonb) || jsonb_build_object(
        'loyalty_rewards', true,
        'private_feedback', true,
        'google_review_link', true,
        'ai_menu_assistant', true,
        'voice_alerts_advanced', true
      )
    ),
    updated_at = pg_catalog.now()
WHERE sp.plan_key IN ('pilot', 'pro');

-- 2) Extend the trusted server-side entitlement resolver. Existing feature keys and
-- current subscription timestamps remain unchanged; unknown features still fail closed.
CREATE OR REPLACE FUNCTION public.khaavio_plan_has_feature(
  p_restaurant_id uuid,
  p_feature_key text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_plan_key text;
  v_limits jsonb;
  v_flag_text text;
BEGIN
  IF p_restaurant_id IS NULL OR p_feature_key IS NULL THEN
    RETURN false;
  END IF;

  IF p_feature_key NOT IN (
    'menu_management', 'restaurant_qr', 'table_qr', 'qr_ordering',
    'kitchen_display', 'order_tracking', 'receipts', 'bookings_basic',
    'booking_advanced', 'booking_export', 'analytics_basic',
    'analytics_advanced', 'business_hours', 'pause_orders', 'priority_support',
    'loyalty_rewards', 'private_feedback', 'google_review_link',
    'ai_menu_assistant', 'voice_alerts_advanced'
  ) THEN
    RETURN false;
  END IF;

  SELECT rs.plan_key, sp.limits
    INTO v_plan_key, v_limits
  FROM public.restaurant_subscriptions rs
  JOIN public.subscription_plans sp ON sp.plan_key = rs.plan_key
  WHERE rs.restaurant_id = p_restaurant_id
    AND rs.status IN ('active', 'trialing')
    AND rs.starts_at <= pg_catalog.now()
    AND (
      (rs.plan_key = 'pilot' AND rs.status = 'active' AND rs.ends_at IS NULL)
      OR (rs.ends_at IS NOT NULL AND rs.ends_at > pg_catalog.now())
    )
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  v_flag_text := v_limits #>> ARRAY['feature_flags', p_feature_key];
  IF v_flag_text IS NOT NULL THEN
    RETURN v_flag_text = 'true';
  END IF;

  IF v_plan_key IN ('pilot', 'trial', 'pro', 'growth', 'growth_yearly') THEN
    RETURN true;
  END IF;

  IF v_plan_key IN ('starter', 'starter_yearly') THEN
    RETURN p_feature_key IN (
      'menu_management', 'restaurant_qr', 'table_qr', 'qr_ordering',
      'kitchen_display', 'order_tracking', 'receipts', 'bookings_basic',
      'analytics_basic', 'business_hours', 'pause_orders', 'google_review_link'
    );
  END IF;

  RETURN false;
END;
$function$;
REVOKE ALL ON FUNCTION public.khaavio_plan_has_feature(uuid, text) FROM PUBLIC, anon, authenticated;

-- Owner-scoped helper for RLS. Callers can only test entitlements for their own restaurant.
CREATE OR REPLACE FUNCTION public.khaavio_owner_has_feature(
  p_restaurant_id uuid,
  p_feature_key text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF auth.uid() IS NULL OR p_restaurant_id IS NULL THEN
    RETURN false;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.restaurants r
    WHERE r.id = p_restaurant_id AND r.owner_id = (SELECT auth.uid())
  ) THEN
    RETURN false;
  END IF;
  RETURN public.khaavio_plan_has_feature(p_restaurant_id, p_feature_key);
END;
$function$;
REVOKE ALL ON FUNCTION public.khaavio_owner_has_feature(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.khaavio_owner_has_feature(uuid, text) TO authenticated;

-- Public menu gets only booleans for customer-visible modules. No plan name,
-- pricing, subscriber details or internal feature catalog is exposed.
CREATE OR REPLACE FUNCTION public.khaavio_public_restaurant_feature_flags(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_restaurant_id uuid;
BEGIN
  IF p_slug IS NULL OR pg_catalog.btrim(p_slug) = '' OR pg_catalog.char_length(p_slug) > 120 THEN
    RETURN jsonb_build_object(
      'loyalty_rewards', false,
      'private_feedback', false,
      'google_review_link', false,
      'ai_menu_assistant', false,
      'voice_alerts_advanced', false
    );
  END IF;

  SELECT r.id INTO v_restaurant_id
  FROM public.restaurants r
  WHERE r.slug = pg_catalog.btrim(p_slug) AND r.is_published IS TRUE
  LIMIT 1;

  IF v_restaurant_id IS NULL THEN
    RETURN jsonb_build_object(
      'loyalty_rewards', false,
      'private_feedback', false,
      'google_review_link', false,
      'ai_menu_assistant', false,
      'voice_alerts_advanced', false
    );
  END IF;

  RETURN jsonb_build_object(
    'loyalty_rewards', public.khaavio_plan_has_feature(v_restaurant_id, 'loyalty_rewards'),
    'private_feedback', public.khaavio_plan_has_feature(v_restaurant_id, 'private_feedback'),
    'google_review_link', public.khaavio_plan_has_feature(v_restaurant_id, 'google_review_link'),
    'ai_menu_assistant', public.khaavio_plan_has_feature(v_restaurant_id, 'ai_menu_assistant'),
    'voice_alerts_advanced', public.khaavio_plan_has_feature(v_restaurant_id, 'voice_alerts_advanced')
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.khaavio_public_restaurant_feature_flags(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.khaavio_public_restaurant_feature_flags(text) TO anon, authenticated, service_role;

-- 3) Loyalty management and stored records are Growth-only. RLS preserves records
-- but prevents Starter owners from reading or changing the private program data.
DROP POLICY IF EXISTS restaurant_loyalty_programs_owner_select ON public.restaurant_loyalty_programs;
CREATE POLICY restaurant_loyalty_programs_owner_select ON public.restaurant_loyalty_programs
  FOR SELECT TO authenticated
  USING (public.khaavio_owner_has_feature(restaurant_loyalty_programs.restaurant_id, 'loyalty_rewards'));
DROP POLICY IF EXISTS restaurant_loyalty_programs_owner_insert ON public.restaurant_loyalty_programs;
CREATE POLICY restaurant_loyalty_programs_owner_insert ON public.restaurant_loyalty_programs
  FOR INSERT TO authenticated
  WITH CHECK (public.khaavio_owner_has_feature(restaurant_loyalty_programs.restaurant_id, 'loyalty_rewards'));
DROP POLICY IF EXISTS restaurant_loyalty_programs_owner_update ON public.restaurant_loyalty_programs;
CREATE POLICY restaurant_loyalty_programs_owner_update ON public.restaurant_loyalty_programs
  FOR UPDATE TO authenticated
  USING (public.khaavio_owner_has_feature(restaurant_loyalty_programs.restaurant_id, 'loyalty_rewards'))
  WITH CHECK (public.khaavio_owner_has_feature(restaurant_loyalty_programs.restaurant_id, 'loyalty_rewards'));

DROP POLICY IF EXISTS restaurant_loyalty_members_owner_select ON public.restaurant_loyalty_members;
CREATE POLICY restaurant_loyalty_members_owner_select ON public.restaurant_loyalty_members
  FOR SELECT TO authenticated
  USING (public.khaavio_owner_has_feature(restaurant_loyalty_members.restaurant_id, 'loyalty_rewards'));
DROP POLICY IF EXISTS restaurant_loyalty_ledger_owner_select ON public.restaurant_loyalty_ledger;
CREATE POLICY restaurant_loyalty_ledger_owner_select ON public.restaurant_loyalty_ledger
  FOR SELECT TO authenticated
  USING (public.khaavio_owner_has_feature(restaurant_loyalty_ledger.restaurant_id, 'loyalty_rewards'));
DROP POLICY IF EXISTS restaurant_loyalty_rewards_owner_select ON public.restaurant_loyalty_rewards;
CREATE POLICY restaurant_loyalty_rewards_owner_select ON public.restaurant_loyalty_rewards
  FOR SELECT TO authenticated
  USING (public.khaavio_owner_has_feature(restaurant_loyalty_rewards.restaurant_id, 'loyalty_rewards'));

CREATE OR REPLACE FUNCTION public.khaavio_guard_growth_loyalty_program()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NOT public.khaavio_plan_has_feature(NEW.restaurant_id, 'loyalty_rewards') THEN
    RAISE EXCEPTION 'KHAAVIO_PLAN_FEATURE_REQUIRED:loyalty_rewards'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.khaavio_guard_growth_loyalty_program() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS khaavio_guard_growth_loyalty_program ON public.restaurant_loyalty_programs;
CREATE TRIGGER khaavio_guard_growth_loyalty_program
  BEFORE INSERT OR UPDATE ON public.restaurant_loyalty_programs
  FOR EACH ROW EXECUTE FUNCTION public.khaavio_guard_growth_loyalty_program();

-- Disable the legacy token-only public RPC. The current public menu uses the phone-consent
-- RPC below; leaving the old entry point public would bypass new plan restrictions.
REVOKE ALL ON FUNCTION public.ensure_public_loyalty_member(text, uuid) FROM PUBLIC, anon, authenticated;

-- The current phone-consent RPC updates this server-only throttle table before it accesses
-- or creates a member. This trigger makes the plan check unskippable for public callers.
CREATE OR REPLACE FUNCTION public.khaavio_guard_public_loyalty_phone_access_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NOT public.khaavio_plan_has_feature(NEW.restaurant_id, 'loyalty_rewards') THEN
    RAISE EXCEPTION 'KHAAVIO_PLAN_FEATURE_REQUIRED:loyalty_rewards'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.khaavio_guard_public_loyalty_phone_access_limit() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS khaavio_guard_public_loyalty_phone_access_limit ON public.restaurant_loyalty_phone_access_limits;
CREATE TRIGGER khaavio_guard_public_loyalty_phone_access_limit
  BEFORE INSERT OR UPDATE ON public.restaurant_loyalty_phone_access_limits
  FOR EACH ROW EXECUTE FUNCTION public.khaavio_guard_public_loyalty_phone_access_limit();

CREATE OR REPLACE FUNCTION public.get_public_loyalty_program_status(p_slug text)
RETURNS TABLE(is_enabled boolean, stamps_required integer, min_order_amount numeric, reward_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT
    COALESCE(public.khaavio_plan_has_feature(r.id, 'loyalty_rewards') AND COALESCE(lp.enabled, false), false),
    CASE WHEN public.khaavio_plan_has_feature(r.id, 'loyalty_rewards') THEN COALESCE(lp.stamps_required, 6) ELSE 6 END,
    CASE WHEN public.khaavio_plan_has_feature(r.id, 'loyalty_rewards') THEN COALESCE(lp.min_order_amount, 0) ELSE 0 END,
    CASE WHEN public.khaavio_plan_has_feature(r.id, 'loyalty_rewards') THEN COALESCE(lp.reward_name, 'Free treat') ELSE 'Free treat' END
  FROM (SELECT 1) AS seed
  LEFT JOIN public.restaurants r ON r.slug = p_slug AND r.is_published IS TRUE
  LEFT JOIN public.restaurant_loyalty_programs lp ON lp.restaurant_id = r.id
  LIMIT 1;
$function$;
REVOKE ALL ON FUNCTION public.get_public_loyalty_program_status(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_loyalty_program_status(text) TO anon, authenticated;

-- Gate stamp accrual server-side, while retaining existing ledger and reward records.
CREATE OR REPLACE FUNCTION public.khaavio_award_loyalty_stamp_for_order(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_restaurant_id uuid;
  v_session_id uuid;
  v_status text;
  v_total numeric(12,2);
  v_member_id uuid;
  v_enabled boolean;
  v_goal integer;
  v_minimum numeric(12,2);
  v_reward_name text;
  v_balance integer;
  v_code text;
BEGIN
  SELECT o.restaurant_id, o.session_id, o.status, o.total_amount, o.loyalty_member_id
    INTO v_restaurant_id, v_session_id, v_status, v_total, v_member_id
  FROM public.orders o WHERE o.id = p_order_id;

  IF NOT FOUND OR v_status <> 'completed' OR v_session_id IS NULL OR v_member_id IS NULL THEN
    RETURN;
  END IF;
  IF NOT public.khaavio_plan_has_feature(v_restaurant_id, 'loyalty_rewards') THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.table_session_invoices i
    WHERE i.restaurant_id = v_restaurant_id
      AND i.session_id = v_session_id
      AND i.payment_status = 'paid'
  ) THEN
    RETURN;
  END IF;

  SELECT lp.enabled, lp.stamps_required, lp.min_order_amount, lp.reward_name
    INTO v_enabled, v_goal, v_minimum, v_reward_name
  FROM public.restaurant_loyalty_programs lp
  WHERE lp.restaurant_id = v_restaurant_id;
  IF NOT FOUND OR v_enabled IS NOT TRUE OR v_total < v_minimum THEN
    RETURN;
  END IF;

  PERFORM 1 FROM public.restaurant_loyalty_members lm
  WHERE lm.id = v_member_id AND lm.restaurant_id = v_restaurant_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;

  IF EXISTS (
    SELECT 1 FROM public.restaurant_loyalty_ledger l
    WHERE l.entry_type = 'stamp_earned' AND l.order_id = p_order_id
  ) THEN
    RETURN;
  END IF;

  INSERT INTO public.restaurant_loyalty_ledger (restaurant_id, member_id, order_id, entry_type, stamps_delta, note)
  VALUES (v_restaurant_id, v_member_id, p_order_id, 'stamp_earned', 1, 'Eligible completed and paid order');

  SELECT COALESCE(pg_catalog.sum(l.stamps_delta), 0)::integer INTO v_balance
  FROM public.restaurant_loyalty_ledger l WHERE l.member_id = v_member_id;

  WHILE v_balance >= v_goal LOOP
    LOOP
      v_code := pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', ''), 1, 10));
      EXIT WHEN NOT EXISTS (
        SELECT 1 FROM public.restaurant_loyalty_rewards rw
        WHERE rw.restaurant_id = v_restaurant_id AND rw.redemption_code = v_code
      );
    END LOOP;

    INSERT INTO public.restaurant_loyalty_rewards (
      restaurant_id, member_id, unlock_order_id, reward_name, redemption_code, revealed_at
    )
    VALUES (v_restaurant_id, v_member_id, p_order_id, v_reward_name, v_code, pg_catalog.now());

    INSERT INTO public.restaurant_loyalty_ledger (restaurant_id, member_id, entry_type, stamps_delta, note)
    VALUES (v_restaurant_id, v_member_id, 'reward_unlocked', -v_goal, 'Stamps used to unlock a reward');
    v_balance := v_balance - v_goal;
  END LOOP;
END;
$function$;
REVOKE ALL ON FUNCTION public.khaavio_award_loyalty_stamp_for_order(uuid) FROM PUBLIC, anon, authenticated;

-- Keep ordering available on Starter even when a stale browser still has a Perks phone
-- saved; simply skip loyalty assignment for this order, rather than failing the order.
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

  SELECT o.restaurant_id INTO v_restaurant_id FROM public.orders o WHERE o.id = v_order_id;
  IF NOT public.khaavio_plan_has_feature(v_restaurant_id, 'loyalty_rewards') THEN
    RETURN QUERY SELECT v_order_id, v_order_reference, v_total_amount, v_tracking_token;
    RETURN;
  END IF;

  IF p_loyalty_phone IS NOT NULL AND pg_catalog.btrim(p_loyalty_phone) <> '' THEN
    v_phone := public.khaavio_normalize_indian_mobile(p_loyalty_phone);
    IF v_phone IS NULL THEN
      RAISE EXCEPTION 'Invalid loyalty mobile number. Update your Perks card or continue without Loyalty.' USING ERRCODE = '22023';
    END IF;

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

-- The old direct insert path is no longer allowed for Starter's private feedback.
CREATE OR REPLACE FUNCTION public.submit_restaurant_feedback(
  p_restaurant_slug text,
  p_rating integer,
  p_category text DEFAULT 'other',
  p_message text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_restaurant_id uuid;
  v_category text;
  v_message text;
  v_feedback_id uuid;
BEGIN
  IF p_restaurant_slug IS NULL
    OR pg_catalog.btrim(p_restaurant_slug) = ''
    OR pg_catalog.char_length(p_restaurant_slug) > 120 THEN
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

  SELECT r.id INTO v_restaurant_id
  FROM public.restaurants r
  WHERE r.slug = pg_catalog.btrim(p_restaurant_slug) AND r.is_published IS TRUE
  LIMIT 1;
  IF v_restaurant_id IS NULL THEN
    RAISE EXCEPTION 'This restaurant menu is not available for feedback.' USING ERRCODE = '22023';
  END IF;
  IF NOT public.khaavio_plan_has_feature(v_restaurant_id, 'private_feedback') THEN
    RAISE EXCEPTION 'KHAAVIO_PLAN_FEATURE_REQUIRED:private_feedback' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.restaurant_feedback (restaurant_id, rating, category, message, source)
  VALUES (v_restaurant_id, p_rating::smallint, v_category, v_message, 'public_menu')
  RETURNING id INTO v_feedback_id;
  RETURN v_feedback_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.submit_restaurant_feedback(text, integer, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_restaurant_feedback(text, integer, text, text) TO anon, authenticated;

DROP POLICY IF EXISTS restaurant_feedback_owner_select ON public.restaurant_feedback;
CREATE POLICY restaurant_feedback_owner_select
  ON public.restaurant_feedback FOR SELECT TO authenticated
  USING (public.khaavio_owner_has_feature(restaurant_feedback.restaurant_id, 'private_feedback'));
DROP POLICY IF EXISTS restaurant_feedback_owner_update ON public.restaurant_feedback;
CREATE POLICY restaurant_feedback_owner_update
  ON public.restaurant_feedback FOR UPDATE TO authenticated
  USING (public.khaavio_owner_has_feature(restaurant_feedback.restaurant_id, 'private_feedback'))
  WITH CHECK (public.khaavio_owner_has_feature(restaurant_feedback.restaurant_id, 'private_feedback'));


-- Redemption is a privileged operation and must enforce plan access even if a caller
-- bypasses the restaurant dashboard UI.
CREATE OR REPLACE FUNCTION public.owner_redeem_loyalty_reward(p_reward_id uuid)
RETURNS TABLE(reward_id uuid, reward_status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_restaurant_id uuid;
  v_status text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication is required to redeem a loyalty reward.' USING ERRCODE = '42501';
  END IF;

  SELECT rw.restaurant_id INTO v_restaurant_id
  FROM public.restaurant_loyalty_rewards rw
  WHERE rw.id = p_reward_id;
  IF NOT FOUND OR NOT EXISTS (
    SELECT 1 FROM public.restaurants r
    WHERE r.id = v_restaurant_id AND r.owner_id = (SELECT auth.uid())
  ) THEN
    RAISE EXCEPTION 'Reward not found or access denied.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.khaavio_plan_has_feature(v_restaurant_id, 'loyalty_rewards') THEN
    RAISE EXCEPTION 'KHAAVIO_PLAN_FEATURE_REQUIRED:loyalty_rewards' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.restaurant_loyalty_rewards rw
  SET status = 'redeemed', redeemed_at = pg_catalog.now(), redeemed_by = (SELECT auth.uid())
  WHERE rw.id = p_reward_id AND rw.restaurant_id = v_restaurant_id
    AND rw.status = 'available' AND rw.revealed_at IS NOT NULL
  RETURNING rw.status INTO v_status;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This reward must be unlocked and still available before redemption.' USING ERRCODE = '55000';
  END IF;

  RETURN QUERY SELECT p_reward_id, v_status;
END;
$function$;
REVOKE ALL ON FUNCTION public.owner_redeem_loyalty_reward(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_redeem_loyalty_reward(uuid) TO authenticated;

COMMIT;
