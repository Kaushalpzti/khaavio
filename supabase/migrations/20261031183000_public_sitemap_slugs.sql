-- Expose only published restaurant slugs for the public XML sitemap.
-- Do not grant anonymous clients direct SELECT access to restaurant records.
BEGIN;

CREATE OR REPLACE FUNCTION public.khaavio_public_sitemap_slugs()
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
    AND r.slug ~ '^[a-z0-9][a-z0-9-]{0,159}$'
  ORDER BY r.slug ASC;
$function$;

REVOKE ALL ON FUNCTION public.khaavio_public_sitemap_slugs() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.khaavio_public_sitemap_slugs() TO anon;

COMMIT;
