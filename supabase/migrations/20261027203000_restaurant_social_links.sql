-- Khaavio social profiles for restaurant owners and public menu follow links.
-- Apply this migration to the same Supabase project used by Khaavio before deploying this feature.
BEGIN;

ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS social_links jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $social_links_constraint$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.restaurants'::regclass
      AND conname = 'restaurants_social_links_object_check'
  ) THEN
    ALTER TABLE public.restaurants
      ADD CONSTRAINT restaurants_social_links_object_check
      CHECK (pg_catalog.jsonb_typeof(social_links) = 'object');
  END IF;
END;
$social_links_constraint$;

CREATE OR REPLACE FUNCTION public.khaavio_public_restaurant_menu(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_restaurant jsonb;
  v_restaurant_id uuid;
  v_categories jsonb;
  v_items jsonb;
BEGIN
  IF p_slug IS NULL OR pg_catalog.btrim(p_slug) = '' OR pg_catalog.char_length(p_slug) > 160 THEN
    RETURN NULL;
  END IF;

  SELECT pg_catalog.to_jsonb(r) INTO v_restaurant
  FROM public.restaurants AS r
  WHERE r.slug = pg_catalog.btrim(p_slug) AND r.is_published IS TRUE
  LIMIT 1;

  IF v_restaurant IS NULL THEN RETURN NULL; END IF;
  v_restaurant_id := (v_restaurant ->> 'id')::uuid;

  SELECT COALESCE(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object('id', c.id, 'name', c.name, 'restaurant_id', c.restaurant_id)
    ORDER BY c.name ASC
  ), '[]'::jsonb) INTO v_categories
  FROM public.menu_categories AS c WHERE c.restaurant_id = v_restaurant_id;

  SELECT COALESCE(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'id', m.id, 'name', m.name, 'description', m.description, 'price', m.price,
      'image_url', m.image_url, 'is_available', m.is_available, 'category_id', m.category_id
    ) ORDER BY m.name ASC
  ), '[]'::jsonb) INTO v_items
  FROM public.menu_items AS m
  WHERE m.restaurant_id = v_restaurant_id AND m.is_available IS TRUE;

  RETURN pg_catalog.jsonb_build_object(
    'restaurant',
    pg_catalog.jsonb_build_object(
      'id', v_restaurant -> 'id',
      'name', v_restaurant -> 'name',
      'slug', v_restaurant -> 'slug',
      'restaurant_type', v_restaurant -> 'restaurant_type',
      'address', v_restaurant -> 'address',
      'google_review_url', v_restaurant -> 'google_review_url',
      'social_links', COALESCE(v_restaurant -> 'social_links', '{}'::jsonb),
      'is_published', v_restaurant -> 'is_published',
      'is_accepting_orders', v_restaurant -> 'is_accepting_orders',
      'business_hours', v_restaurant -> 'business_hours',
      'timezone', v_restaurant -> 'timezone',
      'logo_url', v_restaurant -> 'logo_url'
    ),
    'categories', COALESCE(v_categories, '[]'::jsonb),
    'items', COALESCE(v_items, '[]'::jsonb)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.khaavio_public_restaurant_menu(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.khaavio_public_restaurant_menu(text) TO anon, authenticated;

COMMIT;
