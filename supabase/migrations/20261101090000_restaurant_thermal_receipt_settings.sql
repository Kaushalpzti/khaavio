-- Persist the restaurant's preferred thermal paper width and expose it only
-- through the existing narrow public invoice snapshots.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS receipt_paper_width text NOT NULL DEFAULT '80';

DO $receipt_paper_width_constraint$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.restaurants'::regclass
      AND conname = 'restaurants_receipt_paper_width_check'
  ) THEN
    ALTER TABLE public.restaurants
      ADD CONSTRAINT restaurants_receipt_paper_width_check
      CHECK (receipt_paper_width IN ('58', '80'));
  END IF;
END;
$receipt_paper_width_constraint$;

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
  v_receipt_paper_width text;
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

  SELECT r.id, r.name, r.receipt_paper_width, rt.id,
         r.upi_payment_enabled, r.upi_id, r.counter_payment_enabled
    INTO v_restaurant_id, v_restaurant_name, v_receipt_paper_width, v_table_id,
         v_upi_enabled, v_upi_id, v_counter_enabled
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
    'counter_payment_enabled', COALESCE(v_counter_enabled, true),
    'receipt_paper_width', CASE WHEN v_receipt_paper_width IN ('58', '80') THEN v_receipt_paper_width ELSE '80' END
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
    'payment_method', i.payment_method,
    'payment_choice', i.payment_choice
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

REVOKE ALL ON FUNCTION public.khaavio_public_table_invoice_snapshot(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.khaavio_public_table_invoice_snapshot(text, uuid) TO anon, authenticated;

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
  v_receipt_paper_width text;
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

  SELECT r.id, rt.id, r.table_billing_mode, r.receipt_paper_width
    INTO v_restaurant_id, v_table_id, v_mode, v_receipt_paper_width
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

  SELECT pg_catalog.jsonb_build_object(
    'upi_enabled', COALESCE(r.upi_payment_enabled, false) AND r.upi_id IS NOT NULL,
    'upi_id', CASE WHEN COALESCE(r.upi_payment_enabled, false) THEN r.upi_id ELSE NULL END,
    'payee_name', r.name,
    'counter_payment_enabled', COALESCE(r.counter_payment_enabled, true),
    'receipt_paper_width', CASE WHEN r.receipt_paper_width IN ('58', '80') THEN r.receipt_paper_width ELSE '80' END
  )
  INTO v_payment_settings
  FROM public.restaurants r
  WHERE r.id = v_restaurant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Restaurant not found.' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_tab
  FROM public.table_session_tabs t
  WHERE t.restaurant_id = v_restaurant_id
    AND t.table_id = v_table_id
    AND t.guest_tab_token = p_guest_tab_token
  ORDER BY t.opened_at DESC
  LIMIT 1;

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
    'payment_method', i.payment_method,
    'payment_choice', i.payment_choice
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

REVOKE ALL ON FUNCTION public.khaavio_public_guest_tab_snapshot(text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.khaavio_public_guest_tab_snapshot(text, uuid, uuid) TO anon, authenticated;

COMMIT;
