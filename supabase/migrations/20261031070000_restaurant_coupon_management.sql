-- Allow restaurant owners to edit and delete their own QR-menu coupons.
-- Keep usage counters, ownership and timestamps server-controlled.
BEGIN;

GRANT UPDATE (
  code,
  title,
  discount_type,
  discount_value,
  minimum_order_amount,
  maximum_discount_amount,
  starts_at,
  ends_at,
  usage_limit
) ON public.restaurant_coupons TO authenticated;

GRANT DELETE ON public.restaurant_coupons TO authenticated;

CREATE POLICY restaurant_coupons_owner_delete
  ON public.restaurant_coupons FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.restaurants r
    WHERE r.id = restaurant_coupons.restaurant_id
      AND r.owner_id = (SELECT auth.uid())
  ));

COMMIT;
