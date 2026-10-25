-- Khaavio Reviews & Feedback Phase 1.
-- Public customers submit private feedback through a validated RPC only.
-- Google review links are optional owner-configured URLs; there are no review incentives.

BEGIN;

ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS google_review_url text;

CREATE TABLE IF NOT EXISTS public.restaurant_feedback (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  category text NOT NULL DEFAULT 'other'
    CHECK (category IN ('food', 'service', 'ambience', 'other')),
  message text,
  status text NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'reviewed', 'resolved')),
  source text NOT NULL DEFAULT 'public_menu'
    CHECK (source = 'public_menu'),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT restaurant_feedback_message_length_check
    CHECK (message IS NULL OR pg_catalog.char_length(message) <= 1000)
);

CREATE INDEX IF NOT EXISTS restaurant_feedback_owner_inbox_idx
  ON public.restaurant_feedback (restaurant_id, status, created_at DESC);

ALTER TABLE public.restaurant_feedback ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.restaurant_feedback FROM PUBLIC, anon, authenticated;
GRANT SELECT, UPDATE ON TABLE public.restaurant_feedback TO authenticated;

DROP POLICY IF EXISTS restaurant_feedback_owner_select ON public.restaurant_feedback;
CREATE POLICY restaurant_feedback_owner_select
  ON public.restaurant_feedback FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.restaurants AS r
      WHERE r.id = restaurant_feedback.restaurant_id
        AND r.owner_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS restaurant_feedback_owner_update ON public.restaurant_feedback;
CREATE POLICY restaurant_feedback_owner_update
  ON public.restaurant_feedback FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.restaurants AS r
      WHERE r.id = restaurant_feedback.restaurant_id
        AND r.owner_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.restaurants AS r
      WHERE r.id = restaurant_feedback.restaurant_id
        AND r.owner_id = (SELECT auth.uid())
    )
  );

CREATE OR REPLACE FUNCTION public.khaavio_guard_restaurant_feedback_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $feedback_guard$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.restaurant_id IS DISTINCT FROM OLD.restaurant_id
    OR NEW.rating IS DISTINCT FROM OLD.rating
    OR NEW.category IS DISTINCT FROM OLD.category
    OR NEW.message IS DISTINCT FROM OLD.message
    OR NEW.source IS DISTINCT FROM OLD.source
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Feedback details cannot be edited.' USING ERRCODE = '55000';
  END IF;

  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Change the feedback status to save.' USING ERRCODE = '55000';
  END IF;
  IF NEW.status NOT IN ('new', 'reviewed', 'resolved') THEN
    RAISE EXCEPTION 'Choose a valid feedback status.' USING ERRCODE = '22023';
  END IF;

  NEW.updated_at := pg_catalog.now();
  IF NEW.status = 'resolved' THEN
    NEW.resolved_at := pg_catalog.now();
    NEW.resolved_by := auth.uid();
  ELSE
    NEW.resolved_at := NULL;
    NEW.resolved_by := NULL;
  END IF;
  RETURN NEW;
END;
$feedback_guard$;

DROP TRIGGER IF EXISTS khaavio_guard_restaurant_feedback_updates ON public.restaurant_feedback;
CREATE TRIGGER khaavio_guard_restaurant_feedback_updates
  BEFORE UPDATE ON public.restaurant_feedback
  FOR EACH ROW EXECUTE FUNCTION public.khaavio_guard_restaurant_feedback_update();
REVOKE ALL ON FUNCTION public.khaavio_guard_restaurant_feedback_update() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.submit_restaurant_feedback(
  p_restaurant_slug text,
  p_rating integer,
  p_category text DEFAULT 'other',
  p_message text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $submit_feedback$
DECLARE
  v_restaurant_id uuid;
  v_category text;
  v_message text;
  v_feedback_id uuid;
BEGIN
  IF p_restaurant_slug IS NULL
    OR pg_catalog.btrim(p_restaurant_slug) = ''
    OR pg_catalog.char_length(p_restaurant_slug) > 120 THEN
    RAISE EXCEPTION 'A valid restaurant menu is required.' USING ERRCODE = '22023';
  END IF;

  IF p_rating IS NULL OR p_rating < 1 OR p_rating > 5 THEN
    RAISE EXCEPTION 'Choose a rating from 1 to 5.' USING ERRCODE = '22023';
  END IF;

  v_category := pg_catalog.lower(pg_catalog.btrim(COALESCE(p_category, 'other')));
  IF v_category NOT IN ('food', 'service', 'ambience', 'other') THEN
    RAISE EXCEPTION 'Choose a valid feedback category.' USING ERRCODE = '22023';
  END IF;

  v_message := NULLIF(pg_catalog.btrim(p_message), '');
  IF pg_catalog.char_length(v_message) > 1000 THEN
    RAISE EXCEPTION 'Feedback must be 1,000 characters or fewer.' USING ERRCODE = '22023';
  END IF;

  SELECT r.id INTO v_restaurant_id
  FROM public.restaurants AS r
  WHERE r.slug = pg_catalog.btrim(p_restaurant_slug)
    AND r.is_published IS TRUE
  LIMIT 1;

  IF v_restaurant_id IS NULL THEN
    RAISE EXCEPTION 'This restaurant menu is not available for feedback.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.restaurant_feedback (restaurant_id, rating, category, message, source)
  VALUES (v_restaurant_id, p_rating::smallint, v_category, v_message, 'public_menu')
  RETURNING id INTO v_feedback_id;

  RETURN v_feedback_id;
END;
$submit_feedback$;

REVOKE ALL ON FUNCTION public.submit_restaurant_feedback(text, integer, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_restaurant_feedback(text, integer, text, text) TO anon, authenticated;

DO $feedback_realtime$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_publication WHERE pubname = 'supabase_realtime')
    AND NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'restaurant_feedback'
    ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.restaurant_feedback';
  END IF;
END;
$feedback_realtime$;

COMMIT;
