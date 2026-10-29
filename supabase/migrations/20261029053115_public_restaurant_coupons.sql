-- Expose only currently usable coupon details on published public menus.
BEGIN;

CREATE OR REPLACE FUNCTION public.khaavio_public_restaurant_coupons(p_slug text)
RETURNS TABLE(
  code text,
  title text,
  discount_type text,
  discount_value numeric,
  minimum_order_amount numeric,
  maximum_discount_amount numeric,
  ends_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT c.code, c.title, c.discount_type, c.discount_value,
         c.minimum_order_amount, c.maximum_discount_amount, c.ends_at
  FROM public.restaurant_coupons c
  JOIN public.restaurants r ON r.id = c.restaurant_id
  WHERE r.slug = pg_catalog.btrim(p_slug)
    AND r.is_published IS TRUE
    AND c.is_active IS TRUE
    AND c.starts_at <= pg_catalog.now()
    AND (c.ends_at IS NULL OR c.ends_at > pg_catalog.now())
    AND (c.usage_limit IS NULL OR c.used_count < c.usage_limit)
  ORDER BY c.created_at DESC
  LIMIT 6;
$function$;

REVOKE ALL ON FUNCTION public.khaavio_public_restaurant_coupons(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.khaavio_public_restaurant_coupons(text) TO anon, authenticated;

COMMIT;
