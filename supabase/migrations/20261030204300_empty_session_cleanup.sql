-- Khaavio: allow staff to close sessions/tabs that contain no billable orders.
-- Cancelled orders remain linked to the session for audit/history; no order rows are deleted.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE OR REPLACE FUNCTION public.close_empty_guest_tab(p_guest_tab_id uuid)
RETURNS TABLE(guest_tab_id uuid, tab_status text, session_id uuid, session_status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_restaurant_id uuid;
  v_table_id uuid;
  v_session_id uuid;
  v_billing_mode text;
  v_session_status text;
  v_tab_status text;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Authentication is required to close an empty guest tab.'
      USING ERRCODE = '42501';
  END IF;
  IF p_guest_tab_id IS NULL THEN
    RAISE EXCEPTION 'A guest tab is required.'
      USING ERRCODE = '22023';
  END IF;

  -- Resolve ownership without locking the tab first. All billing operations
  -- use table -> session -> tab lock order to avoid deadlocks.
  SELECT t.restaurant_id, t.table_id, t.session_id
    INTO v_restaurant_id, v_table_id, v_session_id
  FROM public.table_session_tabs t
  JOIN public.restaurants r ON r.id = t.restaurant_id
  WHERE t.id = p_guest_tab_id
    AND r.owner_id = (SELECT auth.uid());

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Guest tab not found or access denied.'
      USING ERRCODE = '42501';
  END IF;

  PERFORM 1
  FROM public.restaurant_tables rt
  WHERE rt.id = v_table_id
    AND rt.restaurant_id = v_restaurant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The restaurant table no longer exists.';
  END IF;

  SELECT ts.status, ts.billing_mode
    INTO v_session_status, v_billing_mode
  FROM public.table_sessions ts
  WHERE ts.id = v_session_id
    AND ts.restaurant_id = v_restaurant_id
    AND ts.table_id = v_table_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The table session no longer exists.';
  END IF;

  SELECT t.status
    INTO v_tab_status
  FROM public.table_session_tabs t
  WHERE t.id = p_guest_tab_id
    AND t.session_id = v_session_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The guest tab no longer exists.';
  END IF;

  -- Idempotent retries must not reopen or otherwise alter a closed session.
  IF v_tab_status = 'closed' THEN
    RETURN QUERY SELECT p_guest_tab_id, v_tab_status, v_session_id, v_session_status;
    RETURN;
  END IF;

  IF v_billing_mode <> 'per_guest' THEN
    RAISE EXCEPTION 'Only a separate guest tab can be closed with this action.'
      USING ERRCODE = '55000';
  END IF;
  IF v_session_status = 'closed' THEN
    RAISE EXCEPTION 'This table session is already closed.'
      USING ERRCODE = '55000';
  END IF;
  IF v_tab_status <> 'open' THEN
    RAISE EXCEPTION 'Only an open guest tab can be closed. Review its invoice first.'
      USING ERRCODE = '55000';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.table_session_invoices i
    WHERE i.guest_tab_id = p_guest_tab_id
      AND i.payment_status <> 'void'
  ) THEN
    RAISE EXCEPTION 'This guest tab has an active invoice and cannot be closed as empty.'
      USING ERRCODE = '55000';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.orders o
    WHERE o.guest_tab_id = p_guest_tab_id
      AND o.status <> 'cancelled'
  ) THEN
    RAISE EXCEPTION 'This guest still has billable orders. Complete or cancel them before closing the tab.'
      USING ERRCODE = '55000';
  END IF;

  UPDATE public.table_session_tabs t
  SET status = 'closed',
      closed_at = COALESCE(t.closed_at, pg_catalog.now())
  WHERE t.id = p_guest_tab_id
    AND t.status = 'open';

  -- One empty tab can close without affecting other guests at the same table.
  -- The physical table becomes available only after every guest tab is closed.
  IF EXISTS (
    SELECT 1 FROM public.table_session_tabs t
    WHERE t.session_id = v_session_id
      AND t.status = 'open'
  ) THEN
    UPDATE public.table_sessions ts
    SET status = 'open', closed_at = NULL, closed_by = NULL
    WHERE ts.id = v_session_id;
  ELSIF EXISTS (
    SELECT 1 FROM public.table_session_tabs t
    WHERE t.session_id = v_session_id
      AND t.status = 'billing'
  ) THEN
    UPDATE public.table_sessions ts
    SET status = 'billing', closed_at = NULL, closed_by = NULL
    WHERE ts.id = v_session_id;
  ELSE
    UPDATE public.table_sessions ts
    SET status = 'closed',
        closed_at = COALESCE(ts.closed_at, pg_catalog.now()),
        closed_by = COALESCE(ts.closed_by, (SELECT auth.uid()))
    WHERE ts.id = v_session_id;
  END IF;

  SELECT ts.status INTO v_session_status
  FROM public.table_sessions ts
  WHERE ts.id = v_session_id;

  RETURN QUERY SELECT p_guest_tab_id, 'closed'::text, v_session_id, v_session_status;
END;
$function$;

REVOKE ALL ON FUNCTION public.close_empty_guest_tab(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.close_empty_guest_tab(uuid)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.close_empty_table_session(p_session_id uuid)
RETURNS TABLE(session_id uuid, session_status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_restaurant_id uuid;
  v_table_id uuid;
  v_billing_mode text;
  v_session_status text;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Authentication is required to close an empty table session.'
      USING ERRCODE = '42501';
  END IF;
  IF p_session_id IS NULL THEN
    RAISE EXCEPTION 'A table session is required.'
      USING ERRCODE = '22023';
  END IF;

  -- Resolve owner scope before taking locks, then follow table -> session order.
  SELECT ts.restaurant_id, ts.table_id
    INTO v_restaurant_id, v_table_id
  FROM public.table_sessions ts
  JOIN public.restaurants r ON r.id = ts.restaurant_id
  WHERE ts.id = p_session_id
    AND r.owner_id = (SELECT auth.uid());

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Table session not found or access denied.'
      USING ERRCODE = '42501';
  END IF;

  PERFORM 1
  FROM public.restaurant_tables rt
  WHERE rt.id = v_table_id
    AND rt.restaurant_id = v_restaurant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The restaurant table no longer exists.';
  END IF;

  SELECT ts.status, ts.billing_mode
    INTO v_session_status, v_billing_mode
  FROM public.table_sessions ts
  WHERE ts.id = p_session_id
    AND ts.restaurant_id = v_restaurant_id
    AND ts.table_id = v_table_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The table session no longer exists.';
  END IF;

  IF v_session_status = 'closed' THEN
    RETURN QUERY SELECT p_session_id, v_session_status;
    RETURN;
  END IF;
  IF v_session_status <> 'open' THEN
    RAISE EXCEPTION 'Only an open table session can be closed from this workflow.'
      USING ERRCODE = '55000';
  END IF;
  IF v_billing_mode <> 'combined' THEN
    RAISE EXCEPTION 'Separate guest-billing sessions must be closed guest by guest.'
      USING ERRCODE = '55000';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.table_session_invoices i
    WHERE i.session_id = p_session_id
      AND i.payment_status <> 'void'
  ) THEN
    RAISE EXCEPTION 'This table session has an active invoice and cannot be closed as empty.'
      USING ERRCODE = '55000';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.session_id = p_session_id
      AND o.status <> 'cancelled'
  ) THEN
    RAISE EXCEPTION 'This table still has billable orders. Complete or cancel them before closing the session.'
      USING ERRCODE = '55000';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.table_session_tabs t
    WHERE t.session_id = p_session_id
      AND t.status <> 'closed'
  ) THEN
    RAISE EXCEPTION 'This session has active guest tabs and cannot be closed as a combined bill.'
      USING ERRCODE = '55000';
  END IF;

  UPDATE public.table_sessions ts
  SET status = 'closed',
      closed_at = COALESCE(ts.closed_at, pg_catalog.now()),
      closed_by = COALESCE(ts.closed_by, (SELECT auth.uid()))
  WHERE ts.id = p_session_id
    AND ts.restaurant_id = v_restaurant_id
    AND ts.status = 'open';

  RETURN QUERY SELECT p_session_id, 'closed'::text;
END;
$function$;

REVOKE ALL ON FUNCTION public.close_empty_table_session(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.close_empty_table_session(uuid)
  TO authenticated;

COMMIT;
