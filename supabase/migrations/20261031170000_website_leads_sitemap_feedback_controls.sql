BEGIN;

CREATE TABLE IF NOT EXISTS public.platform_contact_leads (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  lead_type text NOT NULL CHECK (lead_type IN ('demo', 'contact')),
  full_name text NOT NULL CHECK (pg_catalog.char_length(pg_catalog.btrim(full_name)) BETWEEN 2 AND 100),
  phone text NOT NULL CHECK (pg_catalog.char_length(phone) BETWEEN 8 AND 24),
  business_name text NOT NULL CHECK (pg_catalog.char_length(pg_catalog.btrim(business_name)) BETWEEN 2 AND 120),
  business_type text NOT NULL CHECK (pg_catalog.char_length(pg_catalog.btrim(business_type)) BETWEEN 2 AND 80),
  city text NOT NULL CHECK (pg_catalog.char_length(pg_catalog.btrim(city)) BETWEEN 2 AND 100),
  email text,
  preferred_time text,
  enquiry_type text,
  message text,
  source text NOT NULL DEFAULT 'khaavio_website',
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'qualified', 'closed', 'spam')),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now()
);

CREATE INDEX IF NOT EXISTS platform_contact_leads_created_idx
  ON public.platform_contact_leads (created_at DESC);
CREATE INDEX IF NOT EXISTS platform_contact_leads_status_created_idx
  ON public.platform_contact_leads (status, created_at DESC);

ALTER TABLE public.platform_contact_leads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.platform_contact_leads FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.platform_contact_leads TO service_role;

CREATE OR REPLACE FUNCTION public.khaavio_public_sitemap_restaurant_slugs()
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
    AND r.slug ~ '^[a-zA-Z0-9][a-zA-Z0-9-]{0,159}$'
  ORDER BY r.slug
  LIMIT 49994;
$function$;

REVOKE ALL ON FUNCTION public.khaavio_public_sitemap_restaurant_slugs() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.khaavio_public_sitemap_restaurant_slugs() TO anon, authenticated;

-- Public feedback writes now pass through a rate-limited Edge Function.
REVOKE ALL ON FUNCTION public.submit_restaurant_feedback(text, integer, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_restaurant_feedback(text, integer, text, text)
  TO service_role;

COMMIT;
