-- Ensure authenticated owners can use Supabase upsert's ON CONFLICT
-- DO UPDATE path for both the restaurant key and selected theme.
-- Tenant ownership is still enforced by the table's UPDATE RLS policy.
GRANT UPDATE (restaurant_id, theme_id)
ON TABLE public.restaurant_public_menu_themes
TO authenticated;
