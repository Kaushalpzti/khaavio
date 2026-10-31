-- Remove unused restaurant coupons safely; preserve coupons referenced by historical orders.
-- All removal decisions are serialized with coupon application by locking the coupon row.
BEGIN;

ALTER TABLE public.restaurant_coupons
  ADD COLUMN is_archived boolean NOT NULL DEFAULT false,
  ADD CONSTRAINT restaurant_coupons_archived_must_be_inactive
    CHECK (NOT is_archived OR NOT is_active);

-- Route removals through the owner-checked RPC so an FK SET NULL cannot try to
-- mutate orders that are protected after final billing.
REVOKE DELETE ON public.restaurant_coupons FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS restaurant_coupons_owner_delete ON public.restaurant_coupons;

CREATE OR REPLACE FUNCTION public.khaavio_remove_restaurant_coupon(p_coupon_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_coupon_id uuid;
  v_has_order_history boolean;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Authentication is required to manage coupons.'
      USING ERRCODE = '42501';
  END IF;

  SELECT c.id
    INTO v_coupon_id
  FROM public.restaurant_coupons AS c
  JOIN public.restaurants AS r ON r.id = c.restaurant_id
  WHERE c.id = p_coupon_id
    AND r.owner_id = (SELECT auth.uid())
  FOR UPDATE OF c;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Coupon not found or you do not have permission to manage it.'
      USING ERRCODE = '42501';
  END IF;

  -- Coupon application takes the same row lock in khaavio_coupon_quote(..., true).
  -- After this lock is acquired, no order can race between the history check and removal.
  SELECT EXISTS (
    SELECT 1
    FROM public.orders AS o
    WHERE o.coupon_id = v_coupon_id
  )
  INTO v_has_order_history;

  IF v_has_order_history THEN
    UPDATE public.restaurant_coupons AS c
    SET is_active = false,
        is_archived = true,
        updated_at = pg_catalog.now()
    WHERE c.id = v_coupon_id;

    RETURN 'archived';
  END IF;

  DELETE FROM public.restaurant_coupons AS c
  WHERE c.id = v_coupon_id;

  RETURN 'deleted';
END;
$function$;

REVOKE ALL ON FUNCTION public.khaavio_remove_restaurant_coupon(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.khaavio_remove_restaurant_coupon(uuid)
  TO authenticated;

COMMIT;
