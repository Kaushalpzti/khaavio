-- Public table picker used by the regular menu's dine-in flow.
-- Only active tables for published restaurants with dine-in enabled are exposed.
CREATE OR REPLACE FUNCTION public.khaavio_public_restaurant_tables(p_slug text)
RETURNS TABLE (table_number text, qr_token uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT rt.table_number, rt.qr_token
  FROM public.restaurant_tables AS rt
  JOIN public.restaurants AS r ON r.id = rt.restaurant_id
  WHERE p_slug IS NOT NULL
    AND pg_catalog.char_length(pg_catalog.btrim(p_slug)) BETWEEN 1 AND 160
    AND r.slug = pg_catalog.btrim(p_slug)
    AND r.is_published IS TRUE
    AND r.dine_in_enabled IS TRUE
    AND rt.is_active IS TRUE
  ORDER BY rt.table_number
  LIMIT 250;
$function$;

REVOKE ALL ON FUNCTION public.khaavio_public_restaurant_tables(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.khaavio_public_restaurant_tables(text) TO anon, authenticated;
