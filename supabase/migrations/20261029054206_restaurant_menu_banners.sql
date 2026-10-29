-- Restaurant-managed public menu carousel banners.
BEGIN;

CREATE TABLE public.restaurant_menu_banners (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  image_path text NOT NULL CHECK (pg_catalog.char_length(image_path) BETWEEN 1 AND 500),
  eyebrow text NOT NULL DEFAULT 'FROM OUR KITCHEN' CHECK (pg_catalog.char_length(pg_catalog.btrim(eyebrow)) BETWEEN 2 AND 32),
  title text NOT NULL CHECK (pg_catalog.char_length(pg_catalog.btrim(title)) BETWEEN 2 AND 80),
  description text NOT NULL DEFAULT '' CHECK (pg_catalog.char_length(description) <= 140),
  sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order BETWEEN 0 AND 4),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT restaurant_menu_banners_restaurant_order_key UNIQUE (restaurant_id, sort_order)
);

CREATE INDEX restaurant_menu_banners_public_idx
  ON public.restaurant_menu_banners (restaurant_id, is_active, sort_order);

ALTER TABLE public.restaurant_menu_banners ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.restaurant_menu_banners FROM anon, authenticated;
GRANT SELECT ON public.restaurant_menu_banners TO authenticated;
GRANT INSERT (restaurant_id, image_path, eyebrow, title, description, sort_order, is_active)
  ON public.restaurant_menu_banners TO authenticated;
GRANT UPDATE (image_path, eyebrow, title, description, sort_order, is_active)
  ON public.restaurant_menu_banners TO authenticated;
GRANT DELETE ON public.restaurant_menu_banners TO authenticated;

CREATE POLICY restaurant_menu_banners_owner_select
  ON public.restaurant_menu_banners FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.restaurants r
    WHERE r.id = restaurant_menu_banners.restaurant_id AND r.owner_id = (SELECT auth.uid())
  ));
CREATE POLICY restaurant_menu_banners_owner_insert
  ON public.restaurant_menu_banners FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.restaurants r
      WHERE r.id = restaurant_menu_banners.restaurant_id AND r.owner_id = (SELECT auth.uid())
    )
    AND pg_catalog.left(image_path, pg_catalog.char_length((SELECT auth.uid())::text || '/' || restaurant_id::text || '/banners/'))
      = (SELECT auth.uid())::text || '/' || restaurant_id::text || '/banners/'
  );
CREATE POLICY restaurant_menu_banners_owner_update
  ON public.restaurant_menu_banners FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.restaurants r
    WHERE r.id = restaurant_menu_banners.restaurant_id AND r.owner_id = (SELECT auth.uid())
  ))
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.restaurants r
      WHERE r.id = restaurant_menu_banners.restaurant_id AND r.owner_id = (SELECT auth.uid())
    )
    AND pg_catalog.left(image_path, pg_catalog.char_length((SELECT auth.uid())::text || '/' || restaurant_id::text || '/banners/'))
      = (SELECT auth.uid())::text || '/' || restaurant_id::text || '/banners/'
  );
CREATE POLICY restaurant_menu_banners_owner_delete
  ON public.restaurant_menu_banners FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.restaurants r
    WHERE r.id = restaurant_menu_banners.restaurant_id AND r.owner_id = (SELECT auth.uid())
  ));

CREATE OR REPLACE FUNCTION public.khaavio_touch_restaurant_menu_banner_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $function$
BEGIN
  NEW.updated_at := pg_catalog.now();
  RETURN NEW;
END;
$function$;
CREATE TRIGGER khaavio_touch_restaurant_menu_banner_updated_at
  BEFORE UPDATE ON public.restaurant_menu_banners
  FOR EACH ROW EXECUTE FUNCTION public.khaavio_touch_restaurant_menu_banner_updated_at();
REVOKE ALL ON FUNCTION public.khaavio_touch_restaurant_menu_banner_updated_at() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.khaavio_public_restaurant_menu_banners(p_slug text)
RETURNS TABLE(id uuid, image_path text, eyebrow text, title text, description text, sort_order integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT b.id, b.image_path, b.eyebrow, b.title, b.description, b.sort_order
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
