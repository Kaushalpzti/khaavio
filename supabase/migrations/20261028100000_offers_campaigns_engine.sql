-- Khaavio Offers Engine v1: server-validated coupons, redemption snapshots and campaign workspace.
-- WhatsApp automation and delivery intentionally remain out of scope.
BEGIN;

CREATE TABLE IF NOT EXISTS public.offers (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (pg_catalog.char_length(pg_catalog.btrim(name)) BETWEEN 2 AND 80),
  description text CHECK (description IS NULL OR pg_catalog.char_length(description) <= 500),
  coupon_code text NOT NULL CHECK (coupon_code ~ '^[A-Z0-9][A-Z0-9_-]{2,23}$'),
  discount_type text NOT NULL CHECK (discount_type IN ('percentage', 'fixed')),
  discount_value numeric(12,2) NOT NULL CHECK (discount_value > 0 AND (discount_type <> 'percentage' OR discount_value <= 100)),
  minimum_order_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (minimum_order_amount >= 0),
  maximum_discount_amount numeric(12,2) CHECK (maximum_discount_amount IS NULL OR maximum_discount_amount > 0),
  starts_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  ends_at timestamptz,
  max_redemptions integer CHECK (max_redemptions IS NULL OR max_redemptions > 0),
  per_customer_limit integer NOT NULL DEFAULT 1 CHECK (per_customer_limit BETWEEN 1 AND 100),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'archived')),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT offers_dates_check CHECK (ends_at IS NULL OR ends_at > starts_at),
  CONSTRAINT offers_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT offers_restaurant_coupon_unique UNIQUE (restaurant_id, coupon_code)
);
CREATE INDEX IF NOT EXISTS offers_restaurant_status_idx ON public.offers (restaurant_id, status, starts_at DESC);

CREATE TABLE IF NOT EXISTS public.marketing_campaigns (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  offer_id uuid,
  campaign_code text NOT NULL DEFAULT pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', ''), 1, 10))
    CHECK (campaign_code ~ '^[A-Z0-9_-]{6,24}$'),
  name text NOT NULL CHECK (pg_catalog.char_length(pg_catalog.btrim(name)) BETWEEN 2 AND 100),
  message_text text NOT NULL CHECK (pg_catalog.char_length(pg_catalog.btrim(message_text)) BETWEEN 1 AND 1000),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'ended')),
  starts_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT marketing_campaigns_dates_check CHECK (ends_at IS NULL OR ends_at > starts_at),
  CONSTRAINT marketing_campaigns_offer_scope_fkey FOREIGN KEY (offer_id, restaurant_id)
    REFERENCES public.offers (id, restaurant_id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX IF NOT EXISTS marketing_campaigns_offer_unique ON public.marketing_campaigns (offer_id) WHERE offer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS marketing_campaigns_restaurant_status_idx ON public.marketing_campaigns (restaurant_id, status, starts_at DESC);

CREATE TABLE IF NOT EXISTS public.offer_redemptions (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  offer_id uuid NOT NULL,
  order_id uuid NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE CASCADE,
  coupon_code text NOT NULL,
  offer_name text NOT NULL,
  subtotal_amount numeric(12,2) NOT NULL CHECK (subtotal_amount >= 0),
  discount_amount numeric(12,2) NOT NULL CHECK (discount_amount > 0),
  total_amount numeric(12,2) NOT NULL CHECK (total_amount >= 0),
  redeemed_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT offer_redemptions_offer_scope_fkey FOREIGN KEY (offer_id, restaurant_id)
    REFERENCES public.offers (id, restaurant_id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS offer_redemptions_restaurant_date_idx ON public.offer_redemptions (restaurant_id, redeemed_at DESC);
CREATE INDEX IF NOT EXISTS offer_redemptions_offer_date_idx ON public.offer_redemptions (offer_id, redeemed_at DESC);

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS subtotal_amount numeric(12,2),
  ADD COLUMN IF NOT EXISTS discount_amount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS offer_id uuid,
  ADD COLUMN IF NOT EXISTS coupon_code text;

DO $offer_order_constraints$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid = 'public.orders'::regclass AND conname = 'orders_offer_scope_fkey') THEN
    ALTER TABLE public.orders ADD CONSTRAINT orders_offer_scope_fkey
      FOREIGN KEY (offer_id, restaurant_id) REFERENCES public.offers (id, restaurant_id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid = 'public.orders'::regclass AND conname = 'orders_offer_discount_nonnegative_check') THEN
    ALTER TABLE public.orders ADD CONSTRAINT orders_offer_discount_nonnegative_check CHECK (discount_amount >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid = 'public.orders'::regclass AND conname = 'orders_offer_subtotal_check') THEN
    ALTER TABLE public.orders ADD CONSTRAINT orders_offer_subtotal_check CHECK (subtotal_amount IS NULL OR (subtotal_amount >= 0 AND discount_amount <= subtotal_amount));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid = 'public.orders'::regclass AND conname = 'orders_offer_snapshot_check') THEN
    ALTER TABLE public.orders ADD CONSTRAINT orders_offer_snapshot_check CHECK (
      (offer_id IS NULL AND coupon_code IS NULL AND discount_amount = 0)
      OR (offer_id IS NOT NULL AND coupon_code IS NOT NULL AND subtotal_amount IS NOT NULL AND discount_amount > 0)
    );
  END IF;
END;
$offer_order_constraints$;

-- Extend immutable combined-invoice snapshots while retaining their existing RPC and workflow.
ALTER TABLE public.table_session_invoices
  ADD COLUMN IF NOT EXISTS subtotal_amount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_amount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS coupon_codes text[] NOT NULL DEFAULT ARRAY[]::text[];

UPDATE public.table_session_invoices i
SET subtotal_amount = rollup.subtotal_amount,
    discount_amount = rollup.discount_amount,
    coupon_codes = rollup.coupon_codes
FROM (
  SELECT ts.id AS session_id,
    COALESCE(SUM(COALESCE(o.subtotal_amount, o.total_amount)), 0)::numeric(12,2) AS subtotal_amount,
    COALESCE(SUM(o.discount_amount), 0)::numeric(12,2) AS discount_amount,
    COALESCE(ARRAY_AGG(DISTINCT o.coupon_code) FILTER (WHERE o.coupon_code IS NOT NULL), ARRAY[]::text[]) AS coupon_codes
  FROM public.table_sessions ts
  LEFT JOIN public.orders o ON o.session_id = ts.id AND o.status <> 'cancelled'
  GROUP BY ts.id
) rollup
WHERE i.session_id = rollup.session_id
  AND i.subtotal_amount = 0 AND i.discount_amount = 0 AND cardinality(i.coupon_codes) = 0;

CREATE OR REPLACE FUNCTION public.khaavio_snapshot_offer_totals_on_invoice()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
BEGIN
  SELECT
    COALESCE(SUM(COALESCE(o.subtotal_amount, o.total_amount)), 0)::numeric(12,2),
    COALESCE(SUM(o.discount_amount), 0)::numeric(12,2),
    COALESCE(ARRAY_AGG(DISTINCT o.coupon_code) FILTER (WHERE o.coupon_code IS NOT NULL), ARRAY[]::text[])
  INTO NEW.subtotal_amount, NEW.discount_amount, NEW.coupon_codes
  FROM public.orders o
  WHERE o.session_id = NEW.session_id AND o.status <> 'cancelled';
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS khaavio_snapshot_offer_totals_on_invoice ON public.table_session_invoices;
CREATE TRIGGER khaavio_snapshot_offer_totals_on_invoice BEFORE INSERT ON public.table_session_invoices
FOR EACH ROW EXECUTE FUNCTION public.khaavio_snapshot_offer_totals_on_invoice();
REVOKE ALL ON FUNCTION public.khaavio_snapshot_offer_totals_on_invoice() FROM PUBLIC, anon, authenticated;

ALTER TABLE public.offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offer_redemptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS offers_owner_manage ON public.offers;
CREATE POLICY offers_owner_manage ON public.offers FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = offers.restaurant_id AND r.owner_id = (SELECT auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = offers.restaurant_id AND r.owner_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS marketing_campaigns_owner_manage ON public.marketing_campaigns;
CREATE POLICY marketing_campaigns_owner_manage ON public.marketing_campaigns FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = marketing_campaigns.restaurant_id AND r.owner_id = (SELECT auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = marketing_campaigns.restaurant_id AND r.owner_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS offer_redemptions_owner_read ON public.offer_redemptions;
CREATE POLICY offer_redemptions_owner_read ON public.offer_redemptions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = offer_redemptions.restaurant_id AND r.owner_id = (SELECT auth.uid())));

REVOKE ALL ON TABLE public.offers FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.offers TO authenticated;
REVOKE ALL ON TABLE public.marketing_campaigns FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.marketing_campaigns TO authenticated;
REVOKE ALL ON TABLE public.offer_redemptions FROM anon, authenticated;
GRANT SELECT ON TABLE public.offer_redemptions TO authenticated;

CREATE OR REPLACE FUNCTION public.khaavio_normalize_offer_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
BEGIN
  NEW.coupon_code := pg_catalog.upper(pg_catalog.btrim(NEW.coupon_code));
  NEW.name := pg_catalog.btrim(NEW.name);
  NEW.description := NULLIF(pg_catalog.btrim(NEW.description), '');
  NEW.updated_at := pg_catalog.now();
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS khaavio_normalize_offer_fields ON public.offers;
CREATE TRIGGER khaavio_normalize_offer_fields BEFORE INSERT OR UPDATE ON public.offers
FOR EACH ROW EXECUTE FUNCTION public.khaavio_normalize_offer_fields();
REVOKE ALL ON FUNCTION public.khaavio_normalize_offer_fields() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.khaavio_normalize_campaign_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
BEGIN
  NEW.campaign_code := pg_catalog.upper(pg_catalog.btrim(NEW.campaign_code));
  NEW.name := pg_catalog.btrim(NEW.name);
  NEW.message_text := pg_catalog.btrim(NEW.message_text);
  NEW.updated_at := pg_catalog.now();
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS khaavio_normalize_campaign_fields ON public.marketing_campaigns;
CREATE TRIGGER khaavio_normalize_campaign_fields BEFORE INSERT OR UPDATE ON public.marketing_campaigns
FOR EACH ROW EXECUTE FUNCTION public.khaavio_normalize_campaign_fields();
REVOKE ALL ON FUNCTION public.khaavio_normalize_campaign_fields() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.khaavio_guard_session_order_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $guard$
declare
    v_session_status text;
    v_items_total numeric(12,2);
begin
    if new.session_id is distinct from old.session_id then
        raise exception 'An order cannot be moved between table sessions.'
            using errcode = '55000';
    end if;

    -- Historical orders stay unassigned and retain existing update behavior.
    if old.session_id is null then
        return new;
    end if;

    if new.restaurant_id is distinct from old.restaurant_id
       or new.table_id is distinct from old.table_id then
        raise exception 'A session order cannot be moved to another restaurant or table.'
            using errcode = '55000';
    end if;

    -- Keep lock ordering aligned with QR order creation and invoice operations:
    -- physical table first, then session.
    perform 1
    from public.restaurant_tables rt
    where rt.id = old.table_id
      and rt.restaurant_id = old.restaurant_id
    for update;

    if not found then
        raise exception 'The order table no longer exists.';
    end if;

    select ts.status
      into v_session_status
    from public.table_sessions ts
    where ts.id = old.session_id
      and ts.restaurant_id = old.restaurant_id
      and ts.table_id = old.table_id
    for update;

    if not found then
        raise exception 'The order table session no longer exists.';
    end if;

    if v_session_status is distinct from 'open' then
        raise exception 'Orders cannot be modified after final billing has started.'
            using errcode = '55000';
    end if;

    if new.total_amount is distinct from old.total_amount then
        -- Coupon RPCs may adjust a new order only after its saved item lines
        -- were discounted in this same transaction. Invoice totals still reconcile.
        if old.total_amount <> 0
           and pg_catalog.current_setting('app.khaavio_apply_offer_discount', true) is distinct from 'on' then
            raise exception 'The saved order total cannot be changed directly.'
                using errcode = '55000';
        end if;

        select coalesce(sum(oi.line_total), 0)::numeric(12,2)
          into v_items_total
        from public.order_items oi
        where oi.order_id = old.id;

        if new.total_amount is distinct from v_items_total then
            raise exception 'The order total must match its saved order items.';
        end if;
    end if;

    return new;
end;
$guard$;


CREATE OR REPLACE FUNCTION public.khaavio_quote_offer(
  p_restaurant_id uuid, p_coupon_code text, p_subtotal numeric, p_customer_phone text DEFAULT NULL
)
RETURNS TABLE (
  is_valid boolean, offer_id uuid, offer_code text, offer_name text,
  subtotal_amount numeric(12,2), discount_amount numeric(12,2), total_amount numeric(12,2), message text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  v_offer public.offers%ROWTYPE;
  v_count integer;
  v_customer_count integer;
  v_discount numeric(12,2);
BEGIN
  is_valid := false; offer_id := NULL; offer_code := NULL; offer_name := NULL;
  subtotal_amount := ROUND(GREATEST(COALESCE(p_subtotal, 0), 0), 2);
  discount_amount := 0; total_amount := subtotal_amount;
  message := 'This coupon is invalid or no longer available.';

  IF p_restaurant_id IS NULL OR p_coupon_code IS NULL
     OR pg_catalog.char_length(pg_catalog.btrim(p_coupon_code)) NOT BETWEEN 3 AND 24
     OR p_subtotal IS NULL OR p_subtotal <= 0 THEN
    message := 'Enter a valid coupon code and cart total.';
    RETURN NEXT; RETURN;
  END IF;

  SELECT o.* INTO v_offer FROM public.offers o
  WHERE o.restaurant_id = p_restaurant_id AND o.coupon_code = pg_catalog.upper(pg_catalog.btrim(p_coupon_code));
  IF NOT FOUND THEN RETURN NEXT; RETURN; END IF;
  IF v_offer.status <> 'active' OR v_offer.starts_at > pg_catalog.now()
     OR (v_offer.ends_at IS NOT NULL AND v_offer.ends_at <= pg_catalog.now()) THEN
    message := 'This coupon is not active at the moment.';
    RETURN NEXT; RETURN;
  END IF;
  IF subtotal_amount < v_offer.minimum_order_amount THEN
    message := 'Your cart does not meet this coupon’s minimum order amount.';
    RETURN NEXT; RETURN;
  END IF;

  SELECT count(*)::integer INTO v_count FROM public.offer_redemptions rd WHERE rd.offer_id = v_offer.id;
  IF v_offer.max_redemptions IS NOT NULL AND v_count >= v_offer.max_redemptions THEN
    message := 'This coupon has reached its usage limit.';
    RETURN NEXT; RETURN;
  END IF;

  IF p_customer_phone IS NOT NULL AND pg_catalog.btrim(p_customer_phone) <> '' THEN
    SELECT count(*)::integer INTO v_customer_count
    FROM public.offer_redemptions rd JOIN public.orders o ON o.id = rd.order_id
    WHERE rd.offer_id = v_offer.id AND o.customer_phone = pg_catalog.btrim(p_customer_phone);
    IF v_customer_count >= v_offer.per_customer_limit THEN
      message := 'This coupon has already reached its limit for this customer.';
      RETURN NEXT; RETURN;
    END IF;
  END IF;

  IF v_offer.discount_type = 'percentage' THEN
    v_discount := ROUND(subtotal_amount * v_offer.discount_value / 100, 2);
    IF v_offer.maximum_discount_amount IS NOT NULL THEN v_discount := LEAST(v_discount, v_offer.maximum_discount_amount); END IF;
  ELSE
    v_discount := LEAST(subtotal_amount, v_offer.discount_value);
  END IF;
  v_discount := LEAST(v_discount, subtotal_amount);
  IF v_discount IS NULL OR v_discount <= 0 THEN
    message := 'This coupon does not produce a discount for this cart.';
    RETURN NEXT; RETURN;
  END IF;

  is_valid := true; offer_id := v_offer.id; offer_code := v_offer.coupon_code; offer_name := v_offer.name;
  discount_amount := v_discount; total_amount := subtotal_amount - v_discount;
  message := 'Coupon applied.';
  RETURN NEXT;
END;
$function$;
REVOKE ALL ON FUNCTION public.khaavio_quote_offer(uuid, text, numeric, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.khaavio_preview_public_offer(p_slug text, p_table_token uuid, p_coupon_code text, p_items jsonb)
RETURNS TABLE (
  is_valid boolean, offer_name text, coupon_code text,
  subtotal_amount numeric(12,2), discount_amount numeric(12,2), total_amount numeric(12,2), message text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  v_restaurant_id uuid; v_item jsonb; v_item_id uuid; v_quantity integer;
  v_price numeric(12,2); v_available boolean; v_subtotal numeric(12,2) := 0; v_quote record;
BEGIN
  is_valid := false; offer_name := NULL; coupon_code := pg_catalog.upper(pg_catalog.btrim(COALESCE(p_coupon_code, '')));
  subtotal_amount := 0; discount_amount := 0; total_amount := 0;
  message := 'This coupon is invalid or no longer available.';

  SELECT r.id INTO v_restaurant_id
  FROM public.restaurants r JOIN public.restaurant_tables rt ON rt.restaurant_id = r.id
  WHERE r.slug = pg_catalog.btrim(p_slug) AND r.is_published IS TRUE
    AND rt.qr_token = p_table_token AND rt.is_active IS TRUE LIMIT 1;
  IF NOT FOUND THEN message := 'Open this menu using an active restaurant table QR to apply a coupon.'; RETURN NEXT; RETURN; END IF;

  IF pg_catalog.jsonb_typeof(p_items) IS DISTINCT FROM 'array'
     OR pg_catalog.jsonb_array_length(p_items) < 1 OR pg_catalog.jsonb_array_length(p_items) > 30 THEN
    message := 'Your cart must contain between 1 and 30 items.'; RETURN NEXT; RETURN;
  END IF;

  FOR v_item IN SELECT e.value FROM pg_catalog.jsonb_array_elements(p_items) AS e(value) LOOP
    BEGIN
      v_item_id := (v_item ->> 'item_id')::uuid;
      v_quantity := (v_item ->> 'quantity')::integer;
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      message := 'A cart item has an invalid ID or quantity.'; RETURN NEXT; RETURN;
    END;
    IF v_item_id IS NULL OR v_quantity IS NULL OR v_quantity NOT BETWEEN 1 AND 20 THEN
      message := 'Each item must have a valid ID and quantity between 1 and 20.'; RETURN NEXT; RETURN;
    END IF;
    SELECT mi.price, mi.is_available INTO v_price, v_available
    FROM public.menu_items mi WHERE mi.id = v_item_id AND mi.restaurant_id = v_restaurant_id;
    IF NOT FOUND OR v_available IS NOT TRUE THEN
      message := 'A dish in your cart is no longer available.'; RETURN NEXT; RETURN;
    END IF;
    v_subtotal := v_subtotal + ROUND(v_price * v_quantity, 2);
  END LOOP;

  SELECT q.* INTO v_quote FROM public.khaavio_quote_offer(v_restaurant_id, p_coupon_code, v_subtotal, NULL) AS q;
  is_valid := v_quote.is_valid; offer_name := v_quote.offer_name; coupon_code := v_quote.offer_code;
  subtotal_amount := v_quote.subtotal_amount; discount_amount := v_quote.discount_amount;
  total_amount := v_quote.total_amount; message := v_quote.message;
  RETURN NEXT;
END;
$function$;
GRANT EXECUTE ON FUNCTION public.khaavio_preview_public_offer(text, uuid, text, jsonb) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.khaavio_apply_offer_to_order(p_order_id uuid, p_coupon_code text)
RETURNS TABLE (
  subtotal_amount numeric(12,2), discount_amount numeric(12,2), total_amount numeric(12,2),
  offer_id uuid, coupon_code text, offer_name text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  v_order public.orders%ROWTYPE; v_locked_offer public.offers%ROWTYPE; v_quote record;
  v_line record; v_count integer; v_index integer := 0;
  v_remaining_discount numeric(12,2); v_line_discount numeric(12,2); v_saved_name text;
BEGIN
  SELECT o.* INTO v_order FROM public.orders o WHERE o.id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'The new order could not be found.'; END IF;

  IF v_order.offer_id IS NOT NULL THEN
    IF v_order.coupon_code IS DISTINCT FROM pg_catalog.upper(pg_catalog.btrim(p_coupon_code)) THEN
      RAISE EXCEPTION 'This order request was already used with a different coupon. Refresh your cart before retrying.' USING ERRCODE = '22023';
    END IF;
    SELECT rd.offer_name INTO v_saved_name FROM public.offer_redemptions rd WHERE rd.order_id = v_order.id;
    RETURN QUERY SELECT v_order.subtotal_amount, v_order.discount_amount, v_order.total_amount,
      v_order.offer_id, v_order.coupon_code, COALESCE(v_saved_name, 'Offer');
    RETURN;
  END IF;

  IF v_order.discount_amount <> 0 OR v_order.coupon_code IS NOT NULL THEN
    RAISE EXCEPTION 'The saved order has an inconsistent coupon snapshot.';
  END IF;
  IF v_order.status <> 'pending' THEN
    RAISE EXCEPTION 'A coupon can only be applied while the order is first being placed.' USING ERRCODE = '55000';
  END IF;

  SELECT o.* INTO v_locked_offer FROM public.offers o
  WHERE o.restaurant_id = v_order.restaurant_id AND o.coupon_code = pg_catalog.upper(pg_catalog.btrim(p_coupon_code))
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'This coupon is invalid or no longer available.' USING ERRCODE = '22023'; END IF;

  SELECT q.* INTO v_quote
  FROM public.khaavio_quote_offer(v_order.restaurant_id, p_coupon_code, v_order.total_amount, v_order.customer_phone) AS q;
  IF v_quote.is_valid IS DISTINCT FROM true THEN
    RAISE EXCEPTION '%', COALESCE(v_quote.message, 'This coupon cannot be applied.') USING ERRCODE = '22023';
  END IF;

  SELECT count(*)::integer INTO v_count FROM public.order_items oi WHERE oi.order_id = v_order.id;
  IF v_count < 1 THEN RAISE EXCEPTION 'This order has no eligible items.'; END IF;

  v_remaining_discount := v_quote.discount_amount;
  FOR v_line IN SELECT oi.id, oi.line_total FROM public.order_items oi WHERE oi.order_id = v_order.id ORDER BY oi.id LOOP
    v_index := v_index + 1;
    IF v_index = v_count THEN
      v_line_discount := LEAST(v_remaining_discount, v_line.line_total);
    ELSE
      v_line_discount := LEAST(ROUND(v_quote.discount_amount * v_line.line_total / v_quote.subtotal_amount, 2),
        v_line.line_total, v_remaining_discount);
    END IF;
    UPDATE public.order_items oi SET line_total = (v_line.line_total - v_line_discount)::numeric(12,2)
    WHERE oi.id = v_line.id AND oi.order_id = v_order.id;
    v_remaining_discount := v_remaining_discount - v_line_discount;
  END LOOP;
  IF v_remaining_discount <> 0 THEN RAISE EXCEPTION 'Could not reconcile the coupon discount with the saved order items.'; END IF;

  PERFORM pg_catalog.set_config('app.khaavio_apply_offer_discount', 'on', true);
  UPDATE public.orders o SET total_amount = v_quote.total_amount, subtotal_amount = v_quote.subtotal_amount,
    discount_amount = v_quote.discount_amount, offer_id = v_quote.offer_id, coupon_code = v_quote.offer_code
  WHERE o.id = v_order.id AND o.restaurant_id = v_order.restaurant_id;
  PERFORM pg_catalog.set_config('app.khaavio_apply_offer_discount', 'off', true);

  INSERT INTO public.offer_redemptions (restaurant_id, offer_id, order_id, coupon_code, offer_name,
    subtotal_amount, discount_amount, total_amount)
  VALUES (v_order.restaurant_id, v_quote.offer_id, v_order.id, v_quote.offer_code, v_quote.offer_name,
    v_quote.subtotal_amount, v_quote.discount_amount, v_quote.total_amount);

  RETURN QUERY SELECT v_quote.subtotal_amount, v_quote.discount_amount, v_quote.total_amount,
    v_quote.offer_id, v_quote.offer_code, v_quote.offer_name;
END;
$function$;
REVOKE ALL ON FUNCTION public.khaavio_apply_offer_to_order(uuid, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.place_public_order_with_offer(
  p_slug text, p_table_token uuid, p_customer_name text, p_customer_phone text,
  p_notes text, p_items jsonb, p_loyalty_member_token uuid, p_loyalty_phone text, p_coupon_code text
)
RETURNS TABLE (
  order_id uuid, order_reference text, total_amount numeric, tracking_token uuid,
  subtotal_amount numeric(12,2), discount_amount numeric(12,2), coupon_code text, offer_name text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE v_base record; v_offer record;
BEGIN
  SELECT p.order_id, p.order_reference, p.total_amount, p.tracking_token INTO v_base
  FROM public.place_public_order_with_loyalty(p_slug, p_table_token, p_customer_name, p_customer_phone,
    p_notes, p_items, p_loyalty_member_token, p_loyalty_phone) AS p;
  SELECT a.subtotal_amount, a.discount_amount, a.total_amount, a.coupon_code, a.offer_name INTO v_offer
  FROM public.khaavio_apply_offer_to_order(v_base.order_id, p_coupon_code) AS a;
  RETURN QUERY SELECT v_base.order_id, v_base.order_reference, v_offer.total_amount, v_base.tracking_token,
    v_offer.subtotal_amount, v_offer.discount_amount, v_offer.coupon_code, v_offer.offer_name;
END;
$function$;

CREATE OR REPLACE FUNCTION public.place_public_order_for_guest_with_offer(
  p_slug text, p_table_token uuid, p_customer_name text, p_customer_phone text,
  p_notes text, p_items jsonb, p_loyalty_member_token uuid, p_loyalty_phone text,
  p_guest_tab_token uuid, p_guest_display_name text, p_guest_order_request_token uuid, p_coupon_code text
)
RETURNS TABLE (
  order_id uuid, order_reference text, total_amount numeric, tracking_token uuid,
  subtotal_amount numeric(12,2), discount_amount numeric(12,2), coupon_code text, offer_name text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  v_base record; v_offer record; v_existing_order_id uuid; v_existing_offer_id uuid; v_existing_coupon_code text; v_existing boolean := false;
BEGIN
  SELECT o.id, o.offer_id, o.coupon_code
    INTO v_existing_order_id, v_existing_offer_id, v_existing_coupon_code
  FROM public.restaurants r
  JOIN public.restaurant_tables rt ON rt.restaurant_id = r.id
  JOIN public.orders o ON o.restaurant_id = r.id AND o.table_id = rt.id
  JOIN public.table_session_tabs tab ON tab.id = o.guest_tab_id
  WHERE r.slug = pg_catalog.btrim(p_slug) AND rt.qr_token = p_table_token AND rt.is_active IS TRUE
    AND o.guest_order_request_token = p_guest_order_request_token AND tab.guest_tab_token = p_guest_tab_token
    AND tab.restaurant_id = r.id AND tab.table_id = rt.id
  LIMIT 1;
  IF FOUND THEN v_existing := true; END IF;
  IF v_existing AND v_existing_offer_id IS NULL THEN
    RAISE EXCEPTION 'This guest order was already submitted without a coupon. Start a fresh order to apply a coupon.' USING ERRCODE = '55000';
  END IF;
  IF v_existing AND v_existing_coupon_code IS DISTINCT FROM pg_catalog.upper(pg_catalog.btrim(p_coupon_code)) THEN
    RAISE EXCEPTION 'This order request was already used with a different coupon. Refresh your cart before retrying.' USING ERRCODE = '22023';
  END IF;

  SELECT p.order_id, p.order_reference, p.total_amount, p.tracking_token INTO v_base
  FROM public.place_public_order_for_guest_with_loyalty(p_slug, p_table_token, p_customer_name, p_customer_phone,
    p_notes, p_items, p_loyalty_member_token, p_loyalty_phone, p_guest_tab_token, p_guest_display_name, p_guest_order_request_token) AS p;
  SELECT a.subtotal_amount, a.discount_amount, a.total_amount, a.coupon_code, a.offer_name INTO v_offer
  FROM public.khaavio_apply_offer_to_order(v_base.order_id, p_coupon_code) AS a;
  RETURN QUERY SELECT v_base.order_id, v_base.order_reference, v_offer.total_amount, v_base.tracking_token,
    v_offer.subtotal_amount, v_offer.discount_amount, v_offer.coupon_code, v_offer.offer_name;
END;
$function$;

REVOKE ALL ON FUNCTION public.place_public_order_with_offer(text, uuid, text, text, text, jsonb, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.place_public_order_with_offer(text, uuid, text, text, text, jsonb, uuid, text, text) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.place_public_order_for_guest_with_offer(text, uuid, text, text, text, jsonb, uuid, text, uuid, text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.place_public_order_for_guest_with_offer(text, uuid, text, text, text, jsonb, uuid, text, uuid, text, uuid, text) TO anon, authenticated;

COMMIT;

COMMENT ON TABLE public.offers IS 'Owner-managed restaurant coupons; redemption constraints are enforced inside the order transaction.';
COMMENT ON TABLE public.marketing_campaigns IS 'Owner-managed campaign drafts tied to a single offer; WhatsApp delivery is deliberately out of scope.';
COMMENT ON TABLE public.offer_redemptions IS 'Order-time coupon snapshots used for usage limits and offer/campaign performance.';
