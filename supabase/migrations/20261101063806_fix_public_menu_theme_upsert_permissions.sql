-- The production permission grant was applied after the theme table already
-- existed. Its migration version predates the original table migration, so
-- keep this historical record safe for clean installs by guarding the grant.
DO $migration$
BEGIN
  IF pg_catalog.to_regclass('public.restaurant_public_menu_themes') IS NOT NULL THEN
    GRANT UPDATE (restaurant_id, theme_id)
      ON TABLE public.restaurant_public_menu_themes TO authenticated;
  END IF;
END;
$migration$;
