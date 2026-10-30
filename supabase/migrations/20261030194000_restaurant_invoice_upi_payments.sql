-- Restaurant UPI QR, public invoice snapshots, and staff-verified payment submissions.
-- This migration extends the existing table-session invoice workflow. It does not
-- integrate a payment gateway or move restaurant funds through Khaavio.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS upi_payment_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS counter_payment_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS upi_id text;

DO $restaurant_payment_checks$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.restaurants'::regclass
      AND conname = 'restaurants_upi_id_format_check'
  ) THEN
    ALTER TABLE public.restaurants
      ADD CONSTRAINT restaurants_upi_id_format_check
      CHECK (
        upi_id IS NULL
        OR (
          pg_catalog.char_length(upi_id) BETWEEN 5 AND 320
          AND upi_id ~ '^[[:alnum:]][[:alnum:]._-]{0,255}@[[:alnum:]][[:alnum:].-]{1,63}$'
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.restaurants'::regclass
      AND conname = 'restaurants_upi_enabled_requires_id_check'
  ) THEN
    ALTER TABLE public.restaurants
      ADD CONSTRAINT restaurants_upi_enabled_requires_id_check
      CHECK (upi_payment_enabled IS FALSE OR upi_id IS NOT NULL);
  END IF;
END;
$restaurant_payment_checks$;

CREATE TABLE IF NOT EXISTS public.table_session_invoice_payment_submissions (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES public.table_session_invoices(id) ON DELETE CASCADE,
  payment_reference text NOT NULL
    CHECK (
      pg_catalog.char_length(pg_catalog.btrim(payment_reference)) BETWEEN 6 AND 80
      AND pg_catalog.btrim(payment_reference) ~ '^[A-Za-z0-9-]{6,80}$'
    ),
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'verified', 'rejected')),
  submitted_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  rejection_reason text
    CHECK (rejection_reason IS NULL OR pg_catalog.char_length(rejection_reason) <= 250)
);

CREATE INDEX IF NOT EXISTS table_session_invoice_payment_submissions_restaurant_recent_idx
  ON public.table_session_invoice_payment_submissions (restaurant_id, submitted_at DESC);

CREATE INDEX IF NOT EXISTS table_session_invoice_payment_submissions_invoice_recent_idx
  ON public.table_session_invoice_payment_submissions (invoice_id, submitted_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS table_session_invoice_payment_submissions_one_pending_idx
  ON public.table_session_invoice_payment_submissions (invoice_id)
  WHERE status = 'pending';

CREATE UNIQUE INDEX IF NOT EXISTS table_session_invoice_payment_submissions_reference_idx
  ON public.table_session_invoice_payment_submissions (restaurant_id, pg_catalog.lower(payment_reference));

ALTER TABLE public.table_session_invoice_payment_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS table_session_invoice_payment_submissions_owner_read
  ON public.table_session_invoice_payment_submissions;

CREATE POLICY table_session_invoice_payment_submissions_owner_read
  ON public.table_session_invoice_payment_submissions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.restaurants r
      WHERE r.id = table_session_invoice_payment_submissions.restaurant_id
        AND r.owner_id = (SELECT auth.uid())
    )
  );

-- New public-schema tables are not automatically exposed by the current Supabase
-- Data API defaults. Owners need SELECT only; all writes go through checked RPCs.
REVOKE ALL ON TABLE public.table_session_invoice_payment_submissions
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.table_session_invoice_payment_submissions
  TO authenticated;

CREATE OR REPLACE FUNCTION public.khaavio_public_table_invoice_snapshot(
  p_slug text,
  p_table_token uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_restaurant_id uuid;
  v_restaurant_name text;
  v_table_id uuid;
  v_upi_enabled boolean;
  v_upi_id text;
  v_counter_enabled boolean;
  v_session_id uuid;
  v_session_status text;
  v_billing_mode text;
  v_invoice_id uuid;
  v_invoice jsonb;
  v_items jsonb;
  v_payment_submission jsonb;
  v_payment_settings jsonb;
BEGIN
  IF p_slug IS NULL OR pg_catalog.btrim(p_slug) = ''
     OR pg_catalog.char_length(p_slug) > 160
     OR p_table_token IS NULL THEN
    RAISE EXCEPTION 'A valid restaurant and table QR are required.'
      USING ERRCODE = '22023';
  END IF;

  SELECT r.id, r.name, rt.id, r.upi_payment_enabled, r.upi_id, r.counter_payment_enabled
    INTO v_restaurant_id, v_restaurant_name, v_table_id, v_upi_enabled, v_upi_id, v_counter_enabled
  FROM public.restaurants r
  JOIN public.restaurant_tables rt ON rt.restaurant_id = r.id
  WHERE r.slug = pg_catalog.btrim(p_slug)
    AND r.is_published IS TRUE
    AND rt.qr_token = p_table_token
    AND rt.is_active IS TRUE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'This table QR is invalid, inactive, or unpublished.'
      USING ERRCODE = '22023';
  END IF;

  v_payment_settings := pg_catalog.jsonb_build_object(
    'upi_enabled', COALESCE(v_upi_enabled, false) AND v_upi_id IS NOT NULL,
    'upi_id', CASE WHEN COALESCE(v_upi_enabled, false) THEN v_upi_id ELSE NULL END,
    'payee_name', v_restaurant_name,
    'counter_payment_enabled', COALESCE(v_counter_enabled, true)
  );

  SELECT ts.id, ts.status, ts.billing_mode
    INTO v_session_id, v_session_status, v_billing_mode
  FROM public.table_sessions ts
  WHERE ts.restaurant_id = v_restaurant_id
    AND ts.table_id = v_table_id
  ORDER BY ts.opened_at DESC
  LIMIT 1;

  IF NOT FOUND OR v_session_status = 'open' OR v_billing_mode <> 'combined' THEN
    RETURN pg_catalog.jsonb_build_object(
      'exists', false,
      'session_status', COALESCE(v_session_status, 'none'),
      'payment_settings', v_payment_settings
    );
  END IF;

  SELECT i.id
    INTO v_invoice_id
  FROM public.table_session_invoices i
  WHERE i.session_id = v_session_id
    AND i.restaurant_id = v_restaurant_id
    AND i.table_id = v_table_id
    AND i.guest_tab_id IS NULL
    AND i.payment_status <> 'void'
  ORDER BY i.issued_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object(
      'exists', false,
      'session_status', v_session_status,
      'payment_settings', v_payment_settings
    );
  END IF;

  SELECT pg_catalog.jsonb_build_object(
    'id', i.id,
    'invoice_number', i.invoice_number,
    'total_amount', i.total_amount,
    'subtotal_amount', i.subtotal_amount,
    'discount_amount', i.discount_amount,
    'tax_amount', i.tax_amount,
    'gstin_snapshot', i.gstin_snapshot,
    'gst_inclusive', i.gst_inclusive,
    'order_count', i.order_count,
    'payment_status', i.payment_status,
    'issued_at', i.issued_at,
    'paid_at', i.paid_at,
    'payment_method', i.payment_method
  )
  INTO v_invoice
  FROM public.table_session_invoices i
  WHERE i.id = v_invoice_id
    AND i.restaurant_id = v_restaurant_id;

  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', ii.id,
        'order_reference', ii.order_reference,
        'order_created_at', ii.order_created_at,
        'customer_name', ii.customer_name,
        'item_name', ii.item_name,
        'unit_price', ii.unit_price,
        'quantity', ii.quantity,
        'line_total', ii.line_total
      )
      ORDER BY ii.order_created_at, ii.order_id, ii.created_at, ii.id
    ),
    '[]'::jsonb
  )
  INTO v_items
  FROM public.table_session_invoice_items ii
  WHERE ii.invoice_id = v_invoice_id;

  SELECT pg_catalog.jsonb_build_object(
    'status', s.status,
    'submitted_at', s.submitted_at,
    'reviewed_at', s.reviewed_at
  )
  INTO v_payment_submission
  FROM public.table_session_invoice_payment_submissions s
  WHERE s.invoice_id = v_invoice_id
  ORDER BY s.submitted_at DESC
  LIMIT 1;

  RETURN pg_catalog.jsonb_build_object(
    'exists', true,
    'session_status', v_session_status,
    'restaurant', pg_catalog.jsonb_build_object('name', v_restaurant_name),
    'invoice', v_invoice,
    'items', v_items,
    'payment_submission', COALESCE(v_payment_submission, 'null'::jsonb),
    'payment_settings', v_payment_settings
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.khaavio_public_table_invoice_snapshot(text, uuid)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.khaavio_public_table_invoice_snapshot(text, uuid)
  TO anon, authenticated;

-- Keep the guest-tab snapshot as the existing public read path and add only
-- public-safe payment configuration + submission state.
CREATE OR REPLACE FUNCTION public.khaavio_public_guest_tab_snapshot(
  p_slug text,
  p_table_token uuid,
  p_guest_tab_token uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_restaurant_id uuid;
  v_table_id uuid;
  v_mode text;
  v_tab public.table_session_tabs%ROWTYPE;
  v_total numeric(12,2);
  v_order_count integer;
  v_invoice jsonb;
  v_orders jsonb;
  v_payment_settings jsonb;
  v_payment_submission jsonb;
BEGIN
  IF p_slug IS NULL OR pg_catalog.btrim(p_slug) = ''
     OR p_table_token IS NULL OR p_guest_tab_token IS NULL THEN
    RAISE EXCEPTION 'A valid restaurant table and guest tab are required.'
      USING ERRCODE = '22023';
  END IF;

  SELECT r.id, rt.id, r.table_billing_mode
    INTO v_restaurant_id, v_table_id, v_mode
  FROM public.restaurants r
  JOIN public.restaurant_tables rt ON rt.restaurant_id = r.id
  WHERE r.slug = pg_catalog.btrim(p_slug)
    AND r.is_published IS TRUE
    AND rt.qr_token = p_table_token
    AND rt.is_active IS TRUE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'This table QR is invalid, inactive, or unpublished.'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_tab
  FROM public.table_session_tabs t
  WHERE t.restaurant_id = v_restaurant_id
    AND t.table_id = v_table_id
    AND t.guest_tab_token = p_guest_tab_token
  ORDER BY t.opened_at DESC
  LIMIT 1;

  SELECT pg_catalog.jsonb_build_object(
    'upi_enabled', COALESCE(r.upi_payment_enabled, false) AND r.upi_id IS NOT NULL,
    'upi_id', CASE WHEN COALESCE(r.upi_payment_enabled, false) THEN r.upi_id ELSE NULL END,
    'payee_name', r.name,
    'counter_payment_enabled', COALESCE(r.counter_payment_enabled, true)
  )
  INTO v_payment_settings
  FROM public.restaurants r
  WHERE r.id = v_restaurant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Restaurant not found.' USING ERRCODE = 'P0002';
  END IF;

  IF v_tab.id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object(
      'mode', public.khaavio_public_table_billing_mode(p_slug, p_table_token),
      'exists', false,
      'payment_settings', v_payment_settings
    );
  END IF;

  SELECT ts.billing_mode INTO v_mode
  FROM public.table_sessions ts
  WHERE ts.id = v_tab.session_id;

  IF v_mode <> 'per_guest' THEN
    RETURN pg_catalog.jsonb_build_object(
      'mode', COALESCE(v_mode, 'combined'),
      'exists', false,
      'payment_settings', v_payment_settings
    );
  END IF;

  SELECT
    COALESCE(pg_catalog.sum(o.total_amount) FILTER (WHERE o.status <> 'cancelled'), 0)::numeric(12,2),
    COUNT(*) FILTER (WHERE o.status <> 'cancelled')::integer
    INTO v_total, v_order_count
  FROM public.orders o
  WHERE o.guest_tab_id = v_tab.id;

  SELECT pg_catalog.jsonb_build_object(
    'id', i.id,
    'invoice_number', i.invoice_number,
    'total_amount', i.total_amount,
    'subtotal_amount', i.subtotal_amount,
    'discount_amount', i.discount_amount,
    'tax_amount', i.tax_amount,
    'gstin_snapshot', i.gstin_snapshot,
    'gst_inclusive', i.gst_inclusive,
    'order_count', i.order_count,
    'payment_status', i.payment_status,
    'issued_at', i.issued_at,
    'paid_at', i.paid_at,
    'payment_method', i.payment_method
  )
  INTO v_invoice
  FROM public.table_session_invoices i
  WHERE i.guest_tab_id = v_tab.id
    AND i.payment_status <> 'void'
  ORDER BY i.issued_at DESC
  LIMIT 1;

  IF v_invoice IS NOT NULL THEN
    SELECT pg_catalog.jsonb_build_object(
      'status', s.status,
      'submitted_at', s.submitted_at,
      'reviewed_at', s.reviewed_at
    )
    INTO v_payment_submission
    FROM public.table_session_invoice_payment_submissions s
    WHERE s.invoice_id = (v_invoice ->> 'id')::uuid
    ORDER BY s.submitted_at DESC
    LIMIT 1;
  END IF;

  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', o.id,
        'reference', pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(o.id::text, '-', ''), 1, 8)),
        'status', o.status,
        'total_amount', o.total_amount,
        'created_at', o.created_at,
        'items', (
          SELECT COALESCE(
            pg_catalog.jsonb_agg(
              pg_catalog.jsonb_build_object(
                'id', oi.id,
                'item_name', oi.item_name,
                'unit_price', oi.unit_price,
                'quantity', oi.quantity,
                'line_total', oi.line_total
              )
              ORDER BY oi.created_at, oi.id
            ),
            '[]'::jsonb
          )
          FROM public.order_items oi
          WHERE oi.order_id = o.id
        )
      )
      ORDER BY o.created_at, o.id
    ),
    '[]'::jsonb
  )
  INTO v_orders
  FROM public.orders o
  WHERE o.guest_tab_id = v_tab.id;

  RETURN pg_catalog.jsonb_build_object(
    'mode', 'per_guest',
    'exists', true,
    'tab', pg_catalog.jsonb_build_object(
      'id', v_tab.id,
      'display_name', v_tab.display_name,
      'status', v_tab.status,
      'opened_at', v_tab.opened_at,
      'closed_at', v_tab.closed_at,
      'total_amount', v_total,
      'order_count', v_order_count
    ),
    'invoice', COALESCE(v_invoice, 'null'::jsonb),
    'orders', v_orders,
    'payment_submission', COALESCE(v_payment_submission, 'null'::jsonb),
    'payment_settings', v_payment_settings
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.khaavio_public_guest_tab_snapshot(text, uuid, uuid)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.khaavio_public_guest_tab_snapshot(text, uuid, uuid)
  TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.khaavio_submit_public_invoice_upi_payment(
  p_slug text,
  p_table_token uuid,
  p_invoice_id uuid,
  p_guest_tab_token uuid,
  p_payment_reference text
)
RETURNS TABLE(submission_id uuid, status text, submitted_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_restaurant_id uuid;
  v_table_id uuid;
  v_upi_enabled boolean;
  v_upi_id text;
  v_session_id uuid;
  v_session_status text;
  v_billing_mode text;
  v_guest_tab_id uuid;
  v_invoice_status text;
  v_invoice_total numeric(12,2);
  v_reference text;
  v_submission_id uuid;
  v_submitted_at timestamptz;
  v_recent_count integer;
BEGIN
  IF p_slug IS NULL OR pg_catalog.btrim(p_slug) = ''
     OR pg_catalog.char_length(p_slug) > 160
     OR p_table_token IS NULL OR p_invoice_id IS NULL THEN
    RAISE EXCEPTION 'A valid restaurant, table QR and invoice are required.'
      USING ERRCODE = '22023';
  END IF;

  v_reference := pg_catalog.btrim(COALESCE(p_payment_reference, ''));
  IF pg_catalog.char_length(v_reference) NOT BETWEEN 6 AND 80
     OR v_reference !~ '^[A-Za-z0-9-]{6,80}$' THEN
    RAISE EXCEPTION 'Enter a valid UPI transaction reference (6 to 80 letters or numbers).'
      USING ERRCODE = '22023';
  END IF;

  SELECT r.id, rt.id, r.upi_payment_enabled, r.upi_id
    INTO v_restaurant_id, v_table_id, v_upi_enabled, v_upi_id
  FROM public.restaurants r
  JOIN public.restaurant_tables rt ON rt.restaurant_id = r.id
  WHERE r.slug = pg_catalog.btrim(p_slug)
    AND r.is_published IS TRUE
    AND rt.qr_token = p_table_token
    AND rt.is_active IS TRUE
  FOR SHARE OF r
  FOR UPDATE OF rt;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'This table QR is invalid, inactive, or unpublished.'
      USING ERRCODE = '22023';
  END IF;
  IF v_upi_enabled IS NOT TRUE OR v_upi_id IS NULL THEN
    RAISE EXCEPTION 'This restaurant has not enabled UPI payments.'
      USING ERRCODE = '55000';
  END IF;

  SELECT i.session_id, i.guest_tab_id, i.payment_status, i.total_amount,
         ts.status, ts.billing_mode
    INTO v_session_id, v_guest_tab_id, v_invoice_status, v_invoice_total,
         v_session_status, v_billing_mode
  FROM public.table_session_invoices i
  JOIN public.table_sessions ts
    ON ts.id = i.session_id
   AND ts.restaurant_id = i.restaurant_id
   AND ts.table_id = i.table_id
  WHERE i.id = p_invoice_id
    AND i.restaurant_id = v_restaurant_id
    AND i.table_id = v_table_id
  FOR UPDATE OF i, ts;

  IF NOT FOUND OR v_invoice_status <> 'unpaid' THEN
    RAISE EXCEPTION 'This invoice is not available for UPI payment.'
      USING ERRCODE = '55000';
  END IF;

  IF v_guest_tab_id IS NULL THEN
    IF p_guest_tab_token IS NOT NULL
       OR v_billing_mode <> 'combined'
       OR v_session_status <> 'billing' THEN
      RAISE EXCEPTION 'This invoice does not match the table bill.'
        USING ERRCODE = '42501';
    END IF;
  ELSE
    IF p_guest_tab_token IS NULL
       OR v_billing_mode <> 'per_guest'
       OR NOT EXISTS (
         SELECT 1
         FROM public.table_session_tabs t
         WHERE t.id = v_guest_tab_id
           AND t.restaurant_id = v_restaurant_id
           AND t.table_id = v_table_id
           AND t.session_id = v_session_id
           AND t.guest_tab_token = p_guest_tab_token
           AND t.status = 'billing'
       ) THEN
      RAISE EXCEPTION 'This guest invoice does not match the guest bill on this device.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT COUNT(*)::integer
    INTO v_recent_count
  FROM public.table_session_invoice_payment_submissions s
  WHERE s.invoice_id = p_invoice_id
    AND s.submitted_at >= pg_catalog.now() - interval '1 hour';

  IF v_recent_count >= 5 THEN
    RAISE EXCEPTION 'Too many payment references were submitted. Please ask restaurant staff for help.'
      USING ERRCODE = '54000';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.table_session_invoice_payment_submissions s
    WHERE s.invoice_id = p_invoice_id
      AND pg_catalog.lower(s.payment_reference) = pg_catalog.lower(v_reference)
  ) THEN
    RAISE EXCEPTION 'This UPI transaction reference has already been submitted for this bill.'
      USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.table_session_invoice_payment_submissions (
    restaurant_id, invoice_id, payment_reference, amount
  )
  VALUES (
    v_restaurant_id, p_invoice_id, v_reference, v_invoice_total
  )
  RETURNING id, table_session_invoice_payment_submissions.submitted_at
    INTO v_submission_id, v_submitted_at;

  RETURN QUERY SELECT v_submission_id, 'pending'::text, v_submitted_at;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'A UPI payment reference is already awaiting verification for this bill.'
      USING ERRCODE = '23505';
END;
$function$;

REVOKE ALL ON FUNCTION public.khaavio_submit_public_invoice_upi_payment(text, uuid, uuid, uuid, text)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.khaavio_submit_public_invoice_upi_payment(text, uuid, uuid, uuid, text)
  TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.khaavio_verify_invoice_upi_payment(p_submission_id uuid)
RETURNS TABLE(submission_id uuid, invoice_id uuid, payment_status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_restaurant_id uuid;
  v_table_id uuid;
  v_invoice_id uuid;
  v_guest_tab_id uuid;
  v_invoice_total numeric(12,2);
  v_invoice_status text;
  v_submission_status text;
  v_submission_amount numeric(12,2);
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication is required to verify UPI payments.'
      USING ERRCODE = '42501';
  END IF;
  IF p_submission_id IS NULL THEN
    RAISE EXCEPTION 'A payment submission is required.'
      USING ERRCODE = '22023';
  END IF;

  SELECT s.restaurant_id, i.table_id, i.id, i.guest_tab_id
    INTO v_restaurant_id, v_table_id, v_invoice_id, v_guest_tab_id
  FROM public.table_session_invoice_payment_submissions s
  JOIN public.table_session_invoices i ON i.id = s.invoice_id
  JOIN public.restaurants r ON r.id = s.restaurant_id
  WHERE s.id = p_submission_id
    AND i.restaurant_id = s.restaurant_id
    AND r.owner_id = (SELECT auth.uid());

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment submission not found or access denied.'
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

  SELECT i.total_amount, i.payment_status
    INTO v_invoice_total, v_invoice_status
  FROM public.table_session_invoices i
  WHERE i.id = v_invoice_id
    AND i.restaurant_id = v_restaurant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The invoice no longer exists.';
  END IF;

  SELECT s.status, s.amount
    INTO v_submission_status, v_submission_amount
  FROM public.table_session_invoice_payment_submissions s
  WHERE s.id = p_submission_id
    AND s.invoice_id = v_invoice_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The UPI payment submission no longer exists.';
  END IF;

  IF v_submission_status = 'verified' AND v_invoice_status = 'paid' THEN
    RETURN QUERY SELECT p_submission_id, v_invoice_id, 'paid'::text;
    RETURN;
  END IF;
  IF v_submission_status <> 'pending' OR v_invoice_status <> 'unpaid' THEN
    RAISE EXCEPTION 'This UPI submission is no longer awaiting verification.'
      USING ERRCODE = '55000';
  END IF;
  IF v_submission_amount <> v_invoice_total THEN
    RAISE EXCEPTION 'The submitted payment amount no longer matches the invoice. Review the bill before confirming.'
      USING ERRCODE = '55000';
  END IF;

  UPDATE public.table_session_invoice_payment_submissions s
  SET status = 'verified',
      reviewed_at = pg_catalog.now(),
      reviewed_by = (SELECT auth.uid()),
      rejection_reason = NULL
  WHERE s.id = p_submission_id;

  IF v_guest_tab_id IS NULL THEN
    PERFORM 1
    FROM public.mark_table_invoice_paid(v_invoice_id, 'UPI');
  ELSE
    PERFORM 1
    FROM public.mark_guest_tab_invoice_paid(v_invoice_id, 'UPI');
  END IF;

  RETURN QUERY SELECT p_submission_id, v_invoice_id, 'paid'::text;
END;
$function$;

REVOKE ALL ON FUNCTION public.khaavio_verify_invoice_upi_payment(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.khaavio_verify_invoice_upi_payment(uuid)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.khaavio_reject_invoice_upi_payment(
  p_submission_id uuid,
  p_rejection_reason text DEFAULT NULL
)
RETURNS TABLE(submission_id uuid, invoice_id uuid, status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_restaurant_id uuid;
  v_table_id uuid;
  v_invoice_id uuid;
  v_invoice_status text;
  v_submission_status text;
  v_reason text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication is required to reject UPI payments.'
      USING ERRCODE = '42501';
  END IF;
  IF p_submission_id IS NULL THEN
    RAISE EXCEPTION 'A payment submission is required.'
      USING ERRCODE = '22023';
  END IF;

  v_reason := NULLIF(pg_catalog.btrim(COALESCE(p_rejection_reason, '')), '');
  IF v_reason IS NOT NULL AND pg_catalog.char_length(v_reason) > 250 THEN
    RAISE EXCEPTION 'The rejection note must be 250 characters or fewer.'
      USING ERRCODE = '22023';
  END IF;

  SELECT s.restaurant_id, i.table_id, i.id, i.payment_status
    INTO v_restaurant_id, v_table_id, v_invoice_id, v_invoice_status
  FROM public.table_session_invoice_payment_submissions s
  JOIN public.table_session_invoices i ON i.id = s.invoice_id
  JOIN public.restaurants r ON r.id = s.restaurant_id
  WHERE s.id = p_submission_id
    AND i.restaurant_id = s.restaurant_id
    AND r.owner_id = (SELECT auth.uid());

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment submission not found or access denied.'
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

  PERFORM 1
  FROM public.table_session_invoices i
  WHERE i.id = v_invoice_id
    AND i.restaurant_id = v_restaurant_id
    AND i.payment_status = 'unpaid'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only an unpaid invoice can have a UPI submission rejected.'
      USING ERRCODE = '55000';
  END IF;

  SELECT s.status INTO v_submission_status
  FROM public.table_session_invoice_payment_submissions s
  WHERE s.id = p_submission_id
    AND s.invoice_id = v_invoice_id
  FOR UPDATE;
  IF NOT FOUND OR v_submission_status <> 'pending' THEN
    RAISE EXCEPTION 'This UPI submission is no longer awaiting review.'
      USING ERRCODE = '55000';
  END IF;

  UPDATE public.table_session_invoice_payment_submissions s
  SET status = 'rejected',
      reviewed_at = pg_catalog.now(),
      reviewed_by = (SELECT auth.uid()),
      rejection_reason = COALESCE(v_reason, 'Payment could not be confirmed. Please check with restaurant staff.')
  WHERE s.id = p_submission_id;

  RETURN QUERY SELECT p_submission_id, v_invoice_id, 'rejected'::text;
END;
$function$;

REVOKE ALL ON FUNCTION public.khaavio_reject_invoice_upi_payment(uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.khaavio_reject_invoice_upi_payment(uuid, text)
  TO authenticated;

COMMIT;
