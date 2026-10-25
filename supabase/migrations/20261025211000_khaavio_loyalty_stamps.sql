-- Khaavio Loyalty Stamps Phase 1: device-bound stamp cards and one-time staff redemption.
-- Scratch-to-reveal campaign mechanics are intentionally deferred to Phase 2.
-- Stamps are only earned when an order is completed AND its table-session invoice is paid.
-- Guest access uses a random UUID bearer token stored in that guest's browser. No phone number is used as an identity.

BEGIN;

CREATE TABLE IF NOT EXISTS public.restaurant_loyalty_programs (
    restaurant_id uuid PRIMARY KEY REFERENCES public.restaurants(id) ON DELETE CASCADE,
    enabled boolean NOT NULL DEFAULT false,
    stamps_required integer NOT NULL DEFAULT 6 CHECK (stamps_required BETWEEN 2 AND 20),
    min_order_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (min_order_amount >= 0),
    reward_name text NOT NULL DEFAULT 'Free treat'
        CHECK (pg_catalog.char_length(pg_catalog.btrim(reward_name)) BETWEEN 2 AND 80),
    created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
    updated_at timestamptz NOT NULL DEFAULT pg_catalog.now()
);

CREATE TABLE IF NOT EXISTS public.restaurant_loyalty_members (
    id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
    restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
    member_token uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
    last_seen_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
    CONSTRAINT restaurant_loyalty_members_restaurant_token_key UNIQUE (restaurant_id, member_token),
    CONSTRAINT restaurant_loyalty_members_id_restaurant_key UNIQUE (id, restaurant_id)
);

CREATE TABLE IF NOT EXISTS public.restaurant_loyalty_ledger (
    id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
    restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
    member_id uuid NOT NULL,
    order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
    entry_type text NOT NULL CHECK (entry_type IN ('stamp_earned', 'reward_unlocked')),
    stamps_delta integer NOT NULL CHECK (stamps_delta <> 0),
    note text,
    created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
    CONSTRAINT restaurant_loyalty_ledger_member_scope_fkey
      FOREIGN KEY (member_id, restaurant_id)
      REFERENCES public.restaurant_loyalty_members(id, restaurant_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.restaurant_loyalty_rewards (
    id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
    restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
    member_id uuid NOT NULL,
    unlock_order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
    reward_name text NOT NULL CHECK (pg_catalog.char_length(pg_catalog.btrim(reward_name)) BETWEEN 2 AND 80),
    redemption_code text NOT NULL,
    status text NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'redeemed')),
    revealed_at timestamptz,
    redeemed_at timestamptz,
    redeemed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
    CONSTRAINT restaurant_loyalty_rewards_member_scope_fkey
      FOREIGN KEY (member_id, restaurant_id)
      REFERENCES public.restaurant_loyalty_members(id, restaurant_id) ON DELETE CASCADE,
    CONSTRAINT restaurant_loyalty_rewards_restaurant_code_key UNIQUE (restaurant_id, redemption_code),
    CONSTRAINT restaurant_loyalty_rewards_redeemed_state_check CHECK (
      (status = 'available' AND redeemed_at IS NULL AND redeemed_by IS NULL)
      OR (status = 'redeemed' AND redeemed_at IS NOT NULL AND redeemed_by IS NOT NULL)
    )
);

ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS loyalty_member_id uuid REFERENCES public.restaurant_loyalty_members(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS restaurant_loyalty_members_restaurant_last_seen_idx
    ON public.restaurant_loyalty_members (restaurant_id, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS restaurant_loyalty_ledger_member_created_idx
    ON public.restaurant_loyalty_ledger (member_id, created_at DESC);
CREATE INDEX IF NOT EXISTS restaurant_loyalty_rewards_restaurant_created_idx
    ON public.restaurant_loyalty_rewards (restaurant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_loyalty_member_created_idx
    ON public.orders (loyalty_member_id, created_at DESC)
    WHERE loyalty_member_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS restaurant_loyalty_ledger_one_stamp_per_order_uidx
    ON public.restaurant_loyalty_ledger (order_id)
    WHERE entry_type = 'stamp_earned' AND order_id IS NOT NULL;

-- Restaurant owners can edit program configuration and view their own loyalty activity.
ALTER TABLE public.restaurant_loyalty_programs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.restaurant_loyalty_programs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.restaurant_loyalty_programs TO authenticated;
DROP POLICY IF EXISTS restaurant_loyalty_programs_owner_select ON public.restaurant_loyalty_programs;
CREATE POLICY restaurant_loyalty_programs_owner_select ON public.restaurant_loyalty_programs
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = restaurant_loyalty_programs.restaurant_id AND r.owner_id = (SELECT auth.uid())));
DROP POLICY IF EXISTS restaurant_loyalty_programs_owner_insert ON public.restaurant_loyalty_programs;
CREATE POLICY restaurant_loyalty_programs_owner_insert ON public.restaurant_loyalty_programs
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = restaurant_loyalty_programs.restaurant_id AND r.owner_id = (SELECT auth.uid())));
DROP POLICY IF EXISTS restaurant_loyalty_programs_owner_update ON public.restaurant_loyalty_programs;
CREATE POLICY restaurant_loyalty_programs_owner_update ON public.restaurant_loyalty_programs
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = restaurant_loyalty_programs.restaurant_id AND r.owner_id = (SELECT auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = restaurant_loyalty_programs.restaurant_id AND r.owner_id = (SELECT auth.uid())));

ALTER TABLE public.restaurant_loyalty_members ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.restaurant_loyalty_members FROM PUBLIC, anon, authenticated;
-- The bearer token is intentionally not readable from the dashboard API.
GRANT SELECT (id, restaurant_id, created_at, last_seen_at) ON TABLE public.restaurant_loyalty_members TO authenticated;
DROP POLICY IF EXISTS restaurant_loyalty_members_owner_select ON public.restaurant_loyalty_members;
CREATE POLICY restaurant_loyalty_members_owner_select ON public.restaurant_loyalty_members
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = restaurant_loyalty_members.restaurant_id AND r.owner_id = (SELECT auth.uid())));

ALTER TABLE public.restaurant_loyalty_ledger ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.restaurant_loyalty_ledger FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.restaurant_loyalty_ledger TO authenticated;
DROP POLICY IF EXISTS restaurant_loyalty_ledger_owner_select ON public.restaurant_loyalty_ledger;
CREATE POLICY restaurant_loyalty_ledger_owner_select ON public.restaurant_loyalty_ledger
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = restaurant_loyalty_ledger.restaurant_id AND r.owner_id = (SELECT auth.uid())));

ALTER TABLE public.restaurant_loyalty_rewards ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.restaurant_loyalty_rewards FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.restaurant_loyalty_rewards TO authenticated;
DROP POLICY IF EXISTS restaurant_loyalty_rewards_owner_select ON public.restaurant_loyalty_rewards;
CREATE POLICY restaurant_loyalty_rewards_owner_select ON public.restaurant_loyalty_rewards
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = restaurant_loyalty_rewards.restaurant_id AND r.owner_id = (SELECT auth.uid())));

CREATE OR REPLACE FUNCTION public.khaavio_touch_loyalty_program_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  NEW.updated_at := pg_catalog.now();
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS khaavio_touch_loyalty_program_updated_at ON public.restaurant_loyalty_programs;
CREATE TRIGGER khaavio_touch_loyalty_program_updated_at
  BEFORE UPDATE ON public.restaurant_loyalty_programs
  FOR EACH ROW EXECUTE FUNCTION public.khaavio_touch_loyalty_program_updated_at();
REVOKE ALL ON FUNCTION public.khaavio_touch_loyalty_program_updated_at() FROM PUBLIC, anon, authenticated;

-- Only the server-side order wrapper may associate an order with a guest's bearer token.
CREATE OR REPLACE FUNCTION public.khaavio_guard_order_loyalty_member_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF NEW.loyalty_member_id IS DISTINCT FROM OLD.loyalty_member_id
     AND COALESCE(pg_catalog.current_setting('app.khaavio_assign_loyalty_member', true), '') <> 'on' THEN
    RAISE EXCEPTION 'Loyalty membership cannot be changed directly.' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS khaavio_guard_order_loyalty_member_link ON public.orders;
CREATE TRIGGER khaavio_guard_order_loyalty_member_link
  BEFORE UPDATE OF loyalty_member_id ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.khaavio_guard_order_loyalty_member_link();
REVOKE ALL ON FUNCTION public.khaavio_guard_order_loyalty_member_link() FROM PUBLIC, anon, authenticated;

-- Public guests can only see their own stamp balance/reward by presenting the random token stored in their browser.
CREATE OR REPLACE FUNCTION public.ensure_public_loyalty_member(
  p_slug text,
  p_member_token uuid
)
RETURNS TABLE(
  is_enabled boolean,
  stamps_required integer,
  min_order_amount numeric,
  stamps_balance integer,
  available_rewards jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_restaurant_id uuid;
  v_member_id uuid;
  v_enabled boolean := false;
  v_goal integer := 6;
  v_minimum numeric(12,2) := 0;
  v_balance integer := 0;
  v_rewards jsonb := '[]'::jsonb;
BEGIN
  IF p_slug IS NULL OR pg_catalog.btrim(p_slug) = '' OR p_member_token IS NULL THEN
    RETURN QUERY SELECT false, 6, 0::numeric, 0, '[]'::jsonb;
    RETURN;
  END IF;

  SELECT r.id, COALESCE(lp.enabled, false), COALESCE(lp.stamps_required, 6), COALESCE(lp.min_order_amount, 0)
    INTO v_restaurant_id, v_enabled, v_goal, v_minimum
  FROM public.restaurants r
  LEFT JOIN public.restaurant_loyalty_programs lp ON lp.restaurant_id = r.id
  WHERE r.slug = p_slug AND r.is_published IS TRUE
  LIMIT 1;

  IF v_restaurant_id IS NULL OR v_enabled IS NOT TRUE THEN
    RETURN QUERY SELECT false, v_goal, v_minimum, 0, '[]'::jsonb;
    RETURN;
  END IF;

  -- Do not create a database member just because someone loaded a public menu.
  -- A member record is created only after the existing order RPC succeeds.
  SELECT lm.id INTO v_member_id
  FROM public.restaurant_loyalty_members lm
  WHERE lm.restaurant_id = v_restaurant_id AND lm.member_token = p_member_token;

  IF NOT FOUND THEN
    RETURN QUERY SELECT true, v_goal, v_minimum, 0, '[]'::jsonb;
    RETURN;
  END IF;

  UPDATE public.restaurant_loyalty_members lm
  SET last_seen_at = pg_catalog.now()
  WHERE lm.id = v_member_id;

  SELECT COALESCE(pg_catalog.sum(l.stamps_delta), 0)::integer
    INTO v_balance
  FROM public.restaurant_loyalty_ledger l
  WHERE l.member_id = v_member_id;

  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', rw.id,
        'created_at', rw.created_at,
        'revealed_at', rw.revealed_at,
        'reward_name', CASE WHEN rw.revealed_at IS NOT NULL THEN rw.reward_name ELSE NULL END,
        'redemption_code', CASE WHEN rw.revealed_at IS NOT NULL THEN rw.redemption_code ELSE NULL END
      ) ORDER BY rw.created_at DESC
    ), '[]'::jsonb
  ) INTO v_rewards
  FROM public.restaurant_loyalty_rewards rw
  WHERE rw.member_id = v_member_id AND rw.status = 'available';

  RETURN QUERY SELECT true, v_goal, v_minimum, v_balance, v_rewards;
END;
$function$;
REVOKE ALL ON FUNCTION public.ensure_public_loyalty_member(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_public_loyalty_member(text, uuid) TO anon, authenticated;

-- Use the existing order RPC as the source of truth. This wrapper attaches the guest's Perks member only
-- after the normal order validation/insert has succeeded, so old orders and non-Perks menus still work.
CREATE OR REPLACE FUNCTION public.place_public_order_with_loyalty(
  p_slug text,
  p_table_token uuid,
  p_customer_name text,
  p_customer_phone text,
  p_notes text,
  p_items jsonb,
  p_loyalty_member_token uuid
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
    SELECT o.restaurant_id INTO v_restaurant_id
    FROM public.orders o WHERE o.id = v_order_id;

    SELECT lp.enabled INTO v_enabled
    FROM public.restaurant_loyalty_programs lp
    WHERE lp.restaurant_id = v_restaurant_id;

    IF v_enabled IS TRUE THEN
      INSERT INTO public.restaurant_loyalty_members (restaurant_id, member_token)
      VALUES (v_restaurant_id, p_loyalty_member_token)
      ON CONFLICT (restaurant_id, member_token) DO UPDATE SET last_seen_at = pg_catalog.now()
      RETURNING id INTO v_member_id;

      PERFORM pg_catalog.set_config('app.khaavio_assign_loyalty_member', 'on', true);
      UPDATE public.orders
      SET loyalty_member_id = v_member_id
      WHERE id = v_order_id AND restaurant_id = v_restaurant_id;
      PERFORM pg_catalog.set_config('app.khaavio_assign_loyalty_member', 'off', true);
    END IF;
  END IF;

  RETURN QUERY SELECT v_order_id, v_order_reference, v_total_amount, v_tracking_token;
END;
$function$;
REVOKE ALL ON FUNCTION public.place_public_order_with_loyalty(text, uuid, text, text, text, jsonb, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.place_public_order_with_loyalty(text, uuid, text, text, text, jsonb, uuid) TO anon, authenticated;

-- Award a single stamp after both conditions are true: order completed and session invoice paid.
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

    -- Phase 1: make the unlocked reward immediately visible; no scratch/reveal mechanic yet.
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

CREATE OR REPLACE FUNCTION public.khaavio_order_loyalty_stamp_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  PERFORM public.khaavio_award_loyalty_stamp_for_order(NEW.id);
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS khaavio_award_order_loyalty_stamp ON public.orders;
CREATE TRIGGER khaavio_award_order_loyalty_stamp
  AFTER UPDATE OF status, loyalty_member_id ON public.orders
  FOR EACH ROW
  WHEN (NEW.status = 'completed' OR NEW.loyalty_member_id IS DISTINCT FROM OLD.loyalty_member_id)
  EXECUTE FUNCTION public.khaavio_order_loyalty_stamp_trigger();
REVOKE ALL ON FUNCTION public.khaavio_order_loyalty_stamp_trigger() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.khaavio_invoice_paid_loyalty_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_order_id uuid;
BEGIN
  IF NEW.payment_status = 'paid' AND OLD.payment_status IS DISTINCT FROM NEW.payment_status THEN
    FOR v_order_id IN
      SELECT o.id FROM public.orders o
      WHERE o.restaurant_id = NEW.restaurant_id AND o.session_id = NEW.session_id AND o.status = 'completed'
    LOOP
      PERFORM public.khaavio_award_loyalty_stamp_for_order(v_order_id);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS khaavio_award_invoice_loyalty_stamps ON public.table_session_invoices;
CREATE TRIGGER khaavio_award_invoice_loyalty_stamps
  AFTER UPDATE OF payment_status ON public.table_session_invoices
  FOR EACH ROW
  WHEN (NEW.payment_status = 'paid' AND OLD.payment_status IS DISTINCT FROM NEW.payment_status)
  EXECUTE FUNCTION public.khaavio_invoice_paid_loyalty_trigger();
REVOKE ALL ON FUNCTION public.khaavio_invoice_paid_loyalty_trigger() FROM PUBLIC, anon, authenticated;

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
