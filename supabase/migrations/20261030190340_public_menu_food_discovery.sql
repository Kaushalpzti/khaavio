-- Smart food discovery metadata for restaurant menu items.
-- Apply this migration to the Khaavio Supabase project before deploying the
-- matching frontend branch.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $preflight$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'menu_items'
      AND column_name = 'item_type'
  ) THEN
    RAISE EXCEPTION 'Expected existing public.menu_items.item_type column is missing';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.menu_items
    WHERE item_type NOT IN ('veg', 'non_veg', 'vegan', 'egg')
  ) THEN
    RAISE EXCEPTION 'Unexpected item_type value found; refusing automatic food_type backfill';
  END IF;
END;
$preflight$;

ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS food_type text NOT NULL DEFAULT 'unspecified',
  ADD COLUMN IF NOT EXISTS spice_level text NOT NULL DEFAULT 'unspecified',
  ADD COLUMN IF NOT EXISTS is_jain_friendly boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS allergens text[] NOT NULL DEFAULT ARRAY[]::text[];

ALTER TABLE public.menu_items
  DROP CONSTRAINT IF EXISTS menu_items_food_type_check,
  DROP CONSTRAINT IF EXISTS menu_items_spice_level_check,
  DROP CONSTRAINT IF EXISTS menu_items_allergens_check;

ALTER TABLE public.menu_items
  ADD CONSTRAINT menu_items_food_type_check
    CHECK (food_type IN ('unspecified', 'vegetarian', 'non_vegetarian', 'egg', 'vegan')),
  ADD CONSTRAINT menu_items_spice_level_check
    CHECK (spice_level IN ('unspecified', 'mild', 'medium', 'hot')),
  ADD CONSTRAINT menu_items_allergens_check
    CHECK (allergens <@ ARRAY['milk', 'peanuts', 'tree_nuts', 'soy', 'gluten', 'sesame', 'egg', 'fish', 'shellfish']::text[]);

-- Backfill only from the restaurant's existing explicit item_type classification.
UPDATE public.menu_items
SET food_type = CASE item_type
  WHEN 'veg' THEN 'vegetarian'
  WHEN 'non_veg' THEN 'non_vegetarian'
  WHEN 'vegan' THEN 'vegan'
  WHEN 'egg' THEN 'egg'
  ELSE 'unspecified'
END
WHERE food_type = 'unspecified';


CREATE INDEX IF NOT EXISTS menu_items_public_dietary_idx
  ON public.menu_items (restaurant_id, food_type, is_available);

CREATE INDEX IF NOT EXISTS menu_items_public_jain_idx
  ON public.menu_items (restaurant_id, is_jain_friendly)
  WHERE is_jain_friendly IS TRUE;

-- Keep the existing least-privilege public snapshot as the only read path.
-- Existing restaurant branding, billing flags, and table choices are retained.
CREATE OR REPLACE FUNCTION public.khaavio_public_restaurant_menu(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_restaurant jsonb;
  v_id uuid;
  v_categories jsonb;
  v_items jsonb;
  v_tables jsonb;
BEGIN
  IF p_slug IS NULL OR pg_catalog.btrim(p_slug) = '' OR pg_catalog.char_length(p_slug) > 160 THEN
    RETURN NULL;
  END IF;

  SELECT pg_catalog.to_jsonb(r)
  INTO v_restaurant
  FROM public.restaurants AS r
  WHERE r.slug = pg_catalog.btrim(p_slug)
    AND r.is_published IS TRUE
  LIMIT 1;

  IF v_restaurant IS NULL THEN
    RETURN NULL;
  END IF;

  v_id := (v_restaurant ->> 'id')::uuid;

  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', c.id,
        'name', c.name,
        'restaurant_id', c.restaurant_id
      )
      ORDER BY c.name
    ),
    '[]'::jsonb
  )
  INTO v_categories
  FROM public.menu_categories AS c
  WHERE c.restaurant_id = v_id;

  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', m.id,
        'name', m.name,
        'description', m.description,
        'price', m.price,
        'image_url', m.image_url,
        'is_available', m.is_available,
        'category_id', m.category_id,
        'food_type', m.food_type,
        'spice_level', m.spice_level,
        'is_jain_friendly', m.is_jain_friendly,
        'allergens', m.allergens
      )
      ORDER BY m.name
    ),
    '[]'::jsonb
  )
  INTO v_items
  FROM public.menu_items AS m
  WHERE m.restaurant_id = v_id
    AND m.is_available IS TRUE;

  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'table_number', rt.table_number,
        'qr_token', rt.qr_token
      )
      ORDER BY rt.table_number
    ),
    '[]'::jsonb
  )
  INTO v_tables
  FROM public.restaurant_tables AS rt
  WHERE rt.restaurant_id = v_id
    AND rt.is_active IS TRUE
    AND COALESCE((v_restaurant ->> 'dine_in_enabled')::boolean, false) IS TRUE;

  RETURN pg_catalog.jsonb_build_object(
    'restaurant', pg_catalog.jsonb_build_object(
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
      'logo_url', v_restaurant -> 'logo_url',
      'gst_enabled', v_restaurant -> 'gst_enabled',
      'gst_rate', v_restaurant -> 'gst_rate',
      'gst_price_inclusive', v_restaurant -> 'gst_price_inclusive',
      'pickup_enabled', v_restaurant -> 'pickup_enabled',
      'dine_in_enabled', v_restaurant -> 'dine_in_enabled'
    ),
    'categories', v_categories,
    'items', v_items,
    'tables', v_tables
  );
END;
$function$;

-- CREATE OR REPLACE preserves the existing execute grants on the public menu RPC.

DO $verify$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.menu_items
    WHERE food_type NOT IN ('unspecified', 'vegetarian', 'non_vegetarian', 'egg', 'vegan')
  ) THEN
    RAISE EXCEPTION 'Food discovery backfill produced an invalid food_type';
  END IF;
END;
$verify$;

COMMIT;
