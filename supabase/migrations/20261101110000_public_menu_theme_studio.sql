-- Restaurant-scoped colour themes for the customer-facing Public Menu.
-- QR artwork, table QR templates and QR generation are intentionally independent.
BEGIN;

CREATE TABLE IF NOT EXISTS public.restaurant_public_menu_themes (
  restaurant_id uuid PRIMARY KEY REFERENCES public.restaurants(id) ON DELETE CASCADE,
  theme_id text NOT NULL DEFAULT 'original'
    CHECK (theme_id IN (
      'original',
      'mint',
      'ocean-blue',
      'lavender',
      'violet',
      'rose',
      'sunset',
      'slate',
      'amber',
      'warm-mocha',
      'midnight-pop',
      'forest-sage',
      'royal-berry'
    )),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now()
);

ALTER TABLE public.restaurant_public_menu_themes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.restaurant_public_menu_themes FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.restaurant_public_menu_themes TO authenticated;
GRANT INSERT (restaurant_id, theme_id) ON TABLE public.restaurant_public_menu_themes TO authenticated;
GRANT UPDATE (theme_id) ON TABLE public.restaurant_public_menu_themes TO authenticated;

CREATE POLICY restaurant_public_menu_themes_owner_select
  ON public.restaurant_public_menu_themes FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.restaurants AS r
      WHERE r.id = restaurant_public_menu_themes.restaurant_id
        AND r.owner_id = (SELECT auth.uid())
    )
  );

CREATE POLICY restaurant_public_menu_themes_owner_insert
  ON public.restaurant_public_menu_themes FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.restaurants AS r
      WHERE r.id = restaurant_public_menu_themes.restaurant_id
        AND r.owner_id = (SELECT auth.uid())
    )
  );

CREATE POLICY restaurant_public_menu_themes_owner_update
  ON public.restaurant_public_menu_themes FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.restaurants AS r
      WHERE r.id = restaurant_public_menu_themes.restaurant_id
        AND r.owner_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.restaurants AS r
      WHERE r.id = restaurant_public_menu_themes.restaurant_id
        AND r.owner_id = (SELECT auth.uid())
    )
  );

CREATE OR REPLACE FUNCTION public.khaavio_touch_restaurant_public_menu_theme_updated_at()
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

CREATE TRIGGER khaavio_touch_restaurant_public_menu_theme_updated_at
  BEFORE UPDATE ON public.restaurant_public_menu_themes
  FOR EACH ROW EXECUTE FUNCTION public.khaavio_touch_restaurant_public_menu_theme_updated_at();

REVOKE ALL ON FUNCTION public.khaavio_touch_restaurant_public_menu_theme_updated_at() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.khaavio_public_restaurant_menu_theme(p_slug text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT COALESCE(t.theme_id, 'original')
  FROM public.restaurants AS r
  LEFT JOIN public.restaurant_public_menu_themes AS t
    ON t.restaurant_id = r.id
  WHERE r.slug = pg_catalog.btrim(p_slug)
    AND r.is_published IS TRUE
  LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION public.khaavio_public_restaurant_menu_theme(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.khaavio_public_restaurant_menu_theme(text) TO anon, authenticated;

COMMIT;
