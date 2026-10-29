-- Let restaurant owners choose between app-rendered text and full-bleed artwork.
BEGIN;

ALTER TABLE public.restaurant_menu_banners
  ADD COLUMN display_mode text NOT NULL DEFAULT 'text_overlay'
  CHECK (display_mode IN ('text_overlay', 'image_only'));

ALTER TABLE public.restaurant_menu_banners
  DROP CONSTRAINT IF EXISTS restaurant_menu_banners_eyebrow_check,
  DROP CONSTRAINT IF EXISTS restaurant_menu_banners_title_check;

ALTER TABLE public.restaurant_menu_banners
  ADD CONSTRAINT restaurant_menu_banners_eyebrow_check
    CHECK (display_mode = 'image_only' OR
      pg_catalog.char_length(pg_catalog.btrim(eyebrow)) BETWEEN 2 AND 32),
  ADD CONSTRAINT restaurant_menu_banners_title_check
    CHECK (display_mode = 'image_only' OR
      pg_catalog.char_length(pg_catalog.btrim(title)) BETWEEN 2 AND 80);

GRANT INSERT (restaurant_id, image_path, display_mode, eyebrow, title, description, sort_order, is_active)
  ON public.restaurant_menu_banners TO authenticated;
GRANT UPDATE (image_path, display_mode, eyebrow, title, description, sort_order, is_active)
  ON public.restaurant_menu_banners TO authenticated;

-- Postgres cannot change a function's OUT column list with CREATE OR REPLACE.
DROP FUNCTION public.khaavio_public_restaurant_menu_banners(text);
CREATE FUNCTION public.khaavio_public_restaurant_menu_banners(p_slug text)
RETURNS TABLE(id uuid, image_path text, display_mode text, eyebrow text, title text, description text, sort_order integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT b.id, b.image_path, b.display_mode, b.eyebrow, b.title, b.description, b.sort_order
  FROM public.restaurant_menu_banners b
  JOIN public.restaurants r ON r.id = b.restaurant_id
  WHERE r.slug = pg_catalog.btrim(p_slug)
    AND r.is_published IS TRUE
    AND b.is_active IS TRUE
  ORDER BY b.sort_order ASC, b.created_at DESC
  LIMIT 5;
$function$;
REVOKE ALL ON FUNCTION public.khaavio_public_restaurant_menu_banners(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.khaavio_public_restaurant_menu_banners(text) TO anon, authenticated;

COMMIT;
