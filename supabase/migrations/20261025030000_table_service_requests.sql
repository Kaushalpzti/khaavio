-- Khaavio Phase 1: secure table service requests (Call Waiter / Water / Bill).
-- Apply only after reviewing the current production schema. This migration does not alter orders or bookings.

BEGIN;

CREATE TABLE IF NOT EXISTS public.table_service_requests (
    id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
    restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
    table_id uuid NOT NULL,
    request_type text NOT NULL
        CHECK (request_type IN ('waiter', 'water', 'bill', 'cutlery', 'other')),
    note text,
    status text NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'accepted', 'served', 'cancelled')),
    created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
    updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
    resolved_at timestamptz,
    resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    CONSTRAINT table_service_requests_table_scope_fkey
        FOREIGN KEY (table_id, restaurant_id)
        REFERENCES public.restaurant_tables(id, restaurant_id)
        ON DELETE CASCADE,
    CONSTRAINT table_service_requests_note_length_check
        CHECK (note IS NULL OR pg_catalog.char_length(note) <= 240),
    CONSTRAINT table_service_requests_other_note_check
        CHECK (request_type <> 'other' OR (note IS NOT NULL AND pg_catalog.btrim(note) <> ''))
);

CREATE INDEX IF NOT EXISTS table_service_requests_restaurant_created_idx
    ON public.table_service_requests (restaurant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS table_service_requests_table_created_idx
    ON public.table_service_requests (table_id, created_at DESC);

-- The same active request is only stored once for one table. A guest can make
-- the same request again after the staff have resolved the earlier request.
CREATE UNIQUE INDEX IF NOT EXISTS table_service_requests_one_active_type_uidx
    ON public.table_service_requests (restaurant_id, table_id, request_type)
    WHERE status IN ('pending', 'accepted');

ALTER TABLE public.table_service_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.table_service_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT, UPDATE ON TABLE public.table_service_requests TO authenticated;

DROP POLICY IF EXISTS table_service_requests_owner_select ON public.table_service_requests;
CREATE POLICY table_service_requests_owner_select
    ON public.table_service_requests
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.restaurants AS r
            WHERE r.id = table_service_requests.restaurant_id
              AND r.owner_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS table_service_requests_owner_update ON public.table_service_requests;
CREATE POLICY table_service_requests_owner_update
    ON public.table_service_requests
    FOR UPDATE TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.restaurants AS r
            WHERE r.id = table_service_requests.restaurant_id
              AND r.owner_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.restaurants AS r
            WHERE r.id = table_service_requests.restaurant_id
              AND r.owner_id = auth.uid()
        )
    );

-- Owners may change only the status, and only through sensible transitions.
CREATE OR REPLACE FUNCTION public.khaavio_guard_table_service_request_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $guard$
BEGIN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.restaurant_id IS DISTINCT FROM OLD.restaurant_id
       OR NEW.table_id IS DISTINCT FROM OLD.table_id
       OR NEW.request_type IS DISTINCT FROM OLD.request_type
       OR NEW.note IS DISTINCT FROM OLD.note
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'Service request details cannot be edited.' USING ERRCODE = '55000';
    END IF;

    IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
        RAISE EXCEPTION 'Update the service request status to process it.' USING ERRCODE = '55000';
    END IF;

    IF OLD.status = 'pending' AND NEW.status NOT IN ('accepted', 'served', 'cancelled') THEN
        RAISE EXCEPTION 'Invalid service request status transition.' USING ERRCODE = '55000';
    ELSIF OLD.status = 'accepted' AND NEW.status NOT IN ('served', 'cancelled') THEN
        RAISE EXCEPTION 'An accepted request can only be completed or cancelled.' USING ERRCODE = '55000';
    ELSIF OLD.status IN ('served', 'cancelled') THEN
        RAISE EXCEPTION 'A resolved service request cannot be changed.' USING ERRCODE = '55000';
    END IF;

    NEW.updated_at := pg_catalog.now();
    IF NEW.status IN ('served', 'cancelled') THEN
        NEW.resolved_at := pg_catalog.now();
        NEW.resolved_by := auth.uid();
    ELSE
        NEW.resolved_at := NULL;
        NEW.resolved_by := NULL;
    END IF;
    RETURN NEW;
END;
$guard$;

DROP TRIGGER IF EXISTS khaavio_guard_table_service_request_updates ON public.table_service_requests;
CREATE TRIGGER khaavio_guard_table_service_request_updates
    BEFORE UPDATE ON public.table_service_requests
    FOR EACH ROW
    EXECUTE FUNCTION public.khaavio_guard_table_service_request_update();
REVOKE ALL ON FUNCTION public.khaavio_guard_table_service_request_update() FROM PUBLIC, anon, authenticated;

-- Public guests submit through this RPC only. It validates the restaurant and
-- table QR server-side and returns an already-open request instead of duplicating it.
CREATE OR REPLACE FUNCTION public.create_public_table_service_request(
    p_slug text,
    p_table_token uuid,
    p_request_type text,
    p_note text DEFAULT NULL
)
RETURNS TABLE(request_id uuid, request_status text, already_open boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $service_request$
DECLARE
    v_restaurant_id uuid;
    v_table_id uuid;
    v_request_type text;
    v_note text;
    v_existing_id uuid;
    v_existing_status text;
    v_new_id uuid;
    v_new_status text;
BEGIN
    IF p_slug IS NULL OR pg_catalog.btrim(p_slug) = '' OR p_table_token IS NULL THEN
        RAISE EXCEPTION 'A valid restaurant table QR is required.' USING ERRCODE = '22023';
    END IF;

    v_request_type := pg_catalog.lower(pg_catalog.btrim(p_request_type));
    IF v_request_type IS NULL OR v_request_type NOT IN ('waiter', 'water', 'bill', 'cutlery', 'other') THEN
        RAISE EXCEPTION 'Choose a valid service request.' USING ERRCODE = '22023';
    END IF;

    v_note := NULLIF(pg_catalog.btrim(p_note), '');
    IF pg_catalog.char_length(v_note) > 240 THEN
        RAISE EXCEPTION 'Service request note must be 240 characters or fewer.' USING ERRCODE = '22023';
    END IF;
    IF v_request_type = 'other' AND v_note IS NULL THEN
        RAISE EXCEPTION 'Please describe what you need.' USING ERRCODE = '22023';
    END IF;

    SELECT r.id, rt.id
      INTO v_restaurant_id, v_table_id
    FROM public.restaurants AS r
    JOIN public.restaurant_tables AS rt ON rt.restaurant_id = r.id
    WHERE r.slug = p_slug
      AND r.is_published IS TRUE
      AND rt.qr_token = p_table_token
      AND rt.is_active IS TRUE
    LIMIT 1
    FOR SHARE OF r
    FOR UPDATE OF rt;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'This table QR is invalid, inactive, or unpublished.' USING ERRCODE = '22023';
    END IF;

    SELECT sr.id, sr.status
      INTO v_existing_id, v_existing_status
    FROM public.table_service_requests AS sr
    WHERE sr.restaurant_id = v_restaurant_id
      AND sr.table_id = v_table_id
      AND sr.request_type = v_request_type
      AND sr.status IN ('pending', 'accepted')
    ORDER BY sr.created_at DESC
    LIMIT 1;

    IF FOUND THEN
        RETURN QUERY SELECT v_existing_id, v_existing_status, TRUE;
        RETURN;
    END IF;

    INSERT INTO public.table_service_requests (restaurant_id, table_id, request_type, note)
    VALUES (v_restaurant_id, v_table_id, v_request_type, v_note)
    RETURNING id, status INTO v_new_id, v_new_status;

    RETURN QUERY SELECT v_new_id, v_new_status, FALSE;
END;
$service_request$;

REVOKE ALL ON FUNCTION public.create_public_table_service_request(text, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_public_table_service_request(text, uuid, text, text) TO anon, authenticated;

-- Enable Supabase Realtime for the dashboard queue if the managed publication exists.
DO $realtime$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_publication WHERE pubname = 'supabase_realtime')
       AND NOT EXISTS (
           SELECT 1 FROM pg_catalog.pg_publication_tables
           WHERE pubname = 'supabase_realtime'
             AND schemaname = 'public'
             AND tablename = 'table_service_requests'
       ) THEN
        EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.table_service_requests';
    END IF;
END;
$realtime$;

COMMIT;
