-- End-to-end checks for the complete restaurant GST billing migration.
DO $legacy_guard$
DECLARE
  v_registration_type text;
  v_enabled boolean;
BEGIN
  SELECT gst_registration_type, gst_enabled
    INTO v_registration_type, v_enabled
  FROM public.restaurants WHERE slug = 'green-table';
  IF v_registration_type IS DISTINCT FROM 'needs_review' OR v_enabled IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'Legacy GST settings must be disabled and marked needs_review';
  END IF;
END;
$legacy_guard$;

UPDATE public.restaurants
SET gst_registration_type = 'regular',
    gst_legal_name = 'The Green Table Hospitality',
    gst_enabled = true,
    gstin = '10ABCDE1234F1Z5',
    gst_rate = 5,
    gst_price_inclusive = false,
    address = '1 Test Market Road',
    city = 'Patna',
    state = 'Bihar'
WHERE slug = 'green-table';

-- Standalone pickup checkout: discounted taxable value is charged GST once,
-- with the tax split persisted on the order and returned to public tracking.
INSERT INTO public.orders (
  id, restaurant_id, table_id, session_id, guest_tab_id, customer_name,
  status, total_amount, discount_amount, service_mode
)
VALUES (
  '00000000-0000-4000-8000-000000000011',
  '00000000-0000-4000-8000-000000000001',
  NULL, NULL, NULL, 'Pickup Customer',
  'pending', 900, 100, 'pickup'
);

DO $standalone$
DECLARE
  v_order public.orders%ROWTYPE;
  v_tax jsonb;
  v_tracking record;
BEGIN
  SELECT * INTO v_order FROM public.orders
  WHERE id = '00000000-0000-4000-8000-000000000011';
  IF v_order.gst_enabled_snapshot IS DISTINCT FROM true
     OR v_order.gst_amount IS DISTINCT FROM 45::numeric
     OR v_order.grand_total IS DISTINCT FROM 945::numeric
     OR v_order.gst_taxable_amount IS DISTINCT FROM 900::numeric
     OR v_order.gst_cgst_amount_snapshot IS DISTINCT FROM 22.50::numeric
     OR v_order.gst_sgst_amount_snapshot IS DISTINCT FROM 22.50::numeric
     OR v_order.gst_igst_amount_snapshot IS DISTINCT FROM 0::numeric
     OR v_order.gst_document_type_snapshot IS DISTINCT FROM 'tax_invoice'
     OR v_order.gst_document_number IS NULL
     OR v_order.gst_supplier_name_snapshot IS DISTINCT FROM 'The Green Table Hospitality' THEN
    RAISE EXCEPTION 'Standalone pickup tax snapshot or automatic CGST/SGST split is incorrect';
  END IF;

  SELECT public.khaavio_public_order_tax_snapshot(
    'green-table',
    v_order.id,
    v_order.tracking_token
  ) INTO v_tax;
  IF v_tax ->> 'document_type' IS DISTINCT FROM 'tax_invoice'
     OR (v_tax ->> 'grand_total')::numeric IS DISTINCT FROM 945::numeric
     OR (v_tax ->> 'cgst_amount')::numeric IS DISTINCT FROM 22.50::numeric
     OR v_tax ->> 'supplier_legal_name' IS DISTINCT FROM 'The Green Table Hospitality' THEN
    RAISE EXCEPTION 'Public pickup tax snapshot is incomplete';
  END IF;

  SELECT * INTO v_tracking
  FROM public.get_public_order_tracking('green-table', v_order.id, v_order.tracking_token);
  IF v_tracking.total_amount IS DISTINCT FROM 945::numeric THEN
    RAISE EXCEPTION 'Public order tracking must show the GST-inclusive payable total';
  END IF;
END;
$standalone$;

-- Table orders remain GST-free while accumulating; GST is calculated only by
-- the final invoice trigger for each combined or split-guest bill.
INSERT INTO public.orders (
  id, restaurant_id, table_id, session_id, guest_tab_id, customer_name,
  status, total_amount, discount_amount
)
VALUES (
  '00000000-0000-4000-8000-000000000012',
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000004',
  NULL, 'Table Customer', 'completed', 100, 0
);

DO $table_order_guard$
BEGIN
  IF (SELECT gst_amount FROM public.orders WHERE id = '00000000-0000-4000-8000-000000000012') <> 0
     OR (SELECT grand_total FROM public.orders WHERE id = '00000000-0000-4000-8000-000000000012') IS NOT NULL THEN
    RAISE EXCEPTION 'Table orders must not receive individual GST snapshots';
  END IF;
END;
$table_order_guard$;

INSERT INTO public.table_sessions (id, restaurant_id, table_id, status, billing_mode)
VALUES ('00000000-0000-4000-8000-000000000020',
        '00000000-0000-4000-8000-000000000001',
        '00000000-0000-4000-8000-000000000002',
        'billing', 'per_guest');
INSERT INTO public.table_session_tabs (
  id, restaurant_id, table_id, session_id, guest_tab_token, status, display_name
)
VALUES (
  '00000000-0000-4000-8000-000000000021',
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000020',
  '00000000-0000-4000-8000-000000000022',
  'billing', 'Guest A'
);
INSERT INTO public.orders (
  id, restaurant_id, table_id, session_id, guest_tab_id, customer_name,
  status, total_amount, discount_amount
)
VALUES (
  '00000000-0000-4000-8000-000000000023',
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000020',
  '00000000-0000-4000-8000-000000000021',
  'Guest A', 'completed', 450, 50
);
INSERT INTO public.table_session_invoices (
  id, restaurant_id, table_id, session_id, guest_tab_id,
  invoice_number, total_amount, order_count, payment_status
)
VALUES (
  '00000000-0000-4000-8000-000000000024',
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000020',
  '00000000-0000-4000-8000-000000000021',
  'KHV-TEST-GUEST-001', 450, 1, 'unpaid'
);

DO $split_guest$
DECLARE
  v_invoice public.table_session_invoices%ROWTYPE;
  v_public jsonb;
BEGIN
  SELECT * INTO v_invoice FROM public.table_session_invoices
  WHERE id = '00000000-0000-4000-8000-000000000024';
  IF v_invoice.subtotal_amount IS DISTINCT FROM 500::numeric
     OR v_invoice.discount_amount IS DISTINCT FROM 50::numeric
     OR v_invoice.taxable_amount IS DISTINCT FROM 450::numeric
     OR v_invoice.tax_amount IS DISTINCT FROM 22.50::numeric
     OR v_invoice.cgst_amount IS DISTINCT FROM 11.25::numeric
     OR v_invoice.sgst_amount IS DISTINCT FROM 11.25::numeric
     OR v_invoice.igst_amount IS DISTINCT FROM 0::numeric
     OR v_invoice.total_amount IS DISTINCT FROM 472.50::numeric
     OR v_invoice.gst_document_type_snapshot IS DISTINCT FROM 'tax_invoice'
     OR v_invoice.gst_document_number IS NULL THEN
    RAISE EXCEPTION 'Split guest final invoice mismatch: subtotal %, discount %, taxable %, tax %, CGST %, SGST %, IGST %, total %, inclusive %, doc type %, doc number %',
      v_invoice.subtotal_amount, v_invoice.discount_amount, v_invoice.taxable_amount,
      v_invoice.tax_amount, v_invoice.cgst_amount, v_invoice.sgst_amount,
      v_invoice.igst_amount, v_invoice.total_amount, v_invoice.gst_inclusive,
      v_invoice.gst_document_type_snapshot, v_invoice.gst_document_number;
  END IF;

  SELECT public.khaavio_public_invoice_tax_snapshot(
    'green-table',
    '00000000-0000-4000-8000-000000000003',
    v_invoice.id,
    '00000000-0000-4000-8000-000000000022'
  ) INTO v_public;
  IF v_public ->> 'document_type' IS DISTINCT FROM 'tax_invoice'
     OR (v_public ->> 'cgst_amount')::numeric IS DISTINCT FROM 11.25::numeric
     OR v_public ->> 'supplier_legal_name' IS DISTINCT FROM 'The Green Table Hospitality' THEN
    RAISE EXCEPTION 'Public split-guest invoice tax snapshot is incomplete';
  END IF;
END;
$split_guest$;

-- Inclusive menu prices extract GST without increasing the customer total.
UPDATE public.restaurants SET gst_price_inclusive = true WHERE slug = 'green-table';
INSERT INTO public.table_sessions (id, restaurant_id, table_id, status, billing_mode)
VALUES ('00000000-0000-4000-8000-000000000030',
        '00000000-0000-4000-8000-000000000001',
        '00000000-0000-4000-8000-000000000002',
        'billing', 'per_guest');
INSERT INTO public.table_session_tabs (
  id, restaurant_id, table_id, session_id, guest_tab_token, status, display_name
)
VALUES (
  '00000000-0000-4000-8000-000000000031',
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000030',
  '00000000-0000-4000-8000-000000000032',
  'billing', 'Guest B'
);
INSERT INTO public.orders (
  id, restaurant_id, table_id, session_id, guest_tab_id, customer_name,
  status, total_amount, discount_amount
)
VALUES (
  '00000000-0000-4000-8000-000000000033',
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000030',
  '00000000-0000-4000-8000-000000000031',
  'Guest B', 'completed', 105, 0
);
INSERT INTO public.table_session_invoices (
  id, restaurant_id, table_id, session_id, guest_tab_id,
  invoice_number, total_amount, order_count, payment_status
)
VALUES (
  '00000000-0000-4000-8000-000000000034',
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000030',
  '00000000-0000-4000-8000-000000000031',
  'KHV-TEST-GUEST-002', 105, 1, 'unpaid'
);

DO $inclusive$
DECLARE
  v_invoice public.table_session_invoices%ROWTYPE;
BEGIN
  SELECT * INTO v_invoice FROM public.table_session_invoices
  WHERE id = '00000000-0000-4000-8000-000000000034';
  IF v_invoice.taxable_amount IS DISTINCT FROM 100::numeric
     OR v_invoice.tax_amount IS DISTINCT FROM 5::numeric
     OR v_invoice.cgst_amount IS DISTINCT FROM 2.50::numeric
     OR v_invoice.sgst_amount IS DISTINCT FROM 2.50::numeric
     OR v_invoice.total_amount IS DISTINCT FROM 105::numeric
     OR v_invoice.gst_inclusive IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Inclusive GST extraction must not increase the menu total';
  END IF;
END;
$inclusive$;

-- If the supplier GSTIN state and the actual restaurant-service place of
-- supply differ, the invoice uses IGST rather than CGST + SGST.
INSERT INTO public.restaurants (
  id, owner_id, name, slug, is_published, table_billing_mode, state,
  gst_registration_type, gst_legal_name, gst_enabled, gstin, gst_rate,
  gst_price_inclusive, address, city
)
VALUES (
  '00000000-0000-4000-8000-000000000041',
  '00000000-0000-4000-8000-000000000099',
  'Interstate Test Outlet', 'interstate-test', true, 'per_guest', 'Delhi',
  'regular', 'Interstate Hospitality Pvt Ltd', true, '10ABCDE1234F1Z5', 18,
  false, '2 Test Street', 'New Delhi'
);
INSERT INTO public.restaurant_tables (id, restaurant_id, qr_token, is_active, table_number)
VALUES (
  '00000000-0000-4000-8000-000000000042',
  '00000000-0000-4000-8000-000000000041',
  '00000000-0000-4000-8000-000000000043',
  true, '2'
);
INSERT INTO public.table_sessions (id, restaurant_id, table_id, status, billing_mode)
VALUES (
  '00000000-0000-4000-8000-000000000044',
  '00000000-0000-4000-8000-000000000041',
  '00000000-0000-4000-8000-000000000042',
  'billing', 'per_guest'
);
INSERT INTO public.table_session_tabs (
  id, restaurant_id, table_id, session_id, guest_tab_token, status
)
VALUES (
  '00000000-0000-4000-8000-000000000045',
  '00000000-0000-4000-8000-000000000041',
  '00000000-0000-4000-8000-000000000042',
  '00000000-0000-4000-8000-000000000044',
  '00000000-0000-4000-8000-000000000046',
  'billing'
);
INSERT INTO public.orders (
  id, restaurant_id, table_id, session_id, guest_tab_id, customer_name,
  status, total_amount, discount_amount
)
VALUES (
  '00000000-0000-4000-8000-000000000047',
  '00000000-0000-4000-8000-000000000041',
  '00000000-0000-4000-8000-000000000042',
  '00000000-0000-4000-8000-000000000044',
  '00000000-0000-4000-8000-000000000045',
  'Guest C', 'completed', 100, 0
);
INSERT INTO public.table_session_invoices (
  id, restaurant_id, table_id, session_id, guest_tab_id,
  invoice_number, total_amount, order_count, payment_status
)
VALUES (
  '00000000-0000-4000-8000-000000000048',
  '00000000-0000-4000-8000-000000000041',
  '00000000-0000-4000-8000-000000000042',
  '00000000-0000-4000-8000-000000000044',
  '00000000-0000-4000-8000-000000000045',
  'KHV-TEST-IGST-001', 100, 1, 'unpaid'
);

DO $igst$
DECLARE
  v_invoice public.table_session_invoices%ROWTYPE;
BEGIN
  SELECT * INTO v_invoice FROM public.table_session_invoices
  WHERE id = '00000000-0000-4000-8000-000000000048';
  IF v_invoice.gst_tax_type_snapshot IS DISTINCT FROM 'igst'
     OR v_invoice.igst_rate IS DISTINCT FROM 18::numeric
     OR v_invoice.igst_amount IS DISTINCT FROM 18::numeric
     OR v_invoice.cgst_amount IS DISTINCT FROM 0::numeric
     OR v_invoice.sgst_amount IS DISTINCT FROM 0::numeric
     OR v_invoice.total_amount IS DISTINCT FROM 118::numeric THEN
    RAISE EXCEPTION 'Cross-state GST registration must use IGST only';
  END IF;
END;
$igst$;

-- Composition scheme customers receive a Bill of Supply with no GST added.
UPDATE public.restaurants
SET gst_registration_type = 'composition',
    gst_enabled = false,
    gst_rate = 0,
    gst_price_inclusive = false
WHERE id = '00000000-0000-4000-8000-000000000001';
INSERT INTO public.table_sessions (id, restaurant_id, table_id, status, billing_mode)
VALUES ('00000000-0000-4000-8000-000000000050',
        '00000000-0000-4000-8000-000000000001',
        '00000000-0000-4000-8000-000000000002',
        'billing', 'per_guest');
INSERT INTO public.table_session_tabs (
  id, restaurant_id, table_id, session_id, guest_tab_token, status
)
VALUES (
  '00000000-0000-4000-8000-000000000051',
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000050',
  '00000000-0000-4000-8000-000000000052',
  'billing'
);
INSERT INTO public.orders (
  id, restaurant_id, table_id, session_id, guest_tab_id, customer_name,
  status, total_amount, discount_amount
)
VALUES (
  '00000000-0000-4000-8000-000000000053',
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000050',
  '00000000-0000-4000-8000-000000000051',
  'Guest D', 'completed', 100, 0
);
INSERT INTO public.table_session_invoices (
  id, restaurant_id, table_id, session_id, guest_tab_id,
  invoice_number, total_amount, order_count, payment_status
)
VALUES (
  '00000000-0000-4000-8000-000000000054',
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000050',
  '00000000-0000-4000-8000-000000000051',
  'KHV-TEST-BOS-001', 100, 1, 'unpaid'
);

DO $composition$
DECLARE
  v_invoice public.table_session_invoices%ROWTYPE;
BEGIN
  SELECT * INTO v_invoice FROM public.table_session_invoices
  WHERE id = '00000000-0000-4000-8000-000000000054';
  IF v_invoice.gst_document_type_snapshot IS DISTINCT FROM 'bill_of_supply'
     OR v_invoice.gstin_snapshot IS DISTINCT FROM '10ABCDE1234F1Z5'
     OR v_invoice.tax_amount IS DISTINCT FROM 0::numeric
     OR v_invoice.total_amount IS DISTINCT FROM 100::numeric THEN
    RAISE EXCEPTION 'Composition scheme must issue a Bill of Supply without collecting GST';
  END IF;
END;
$composition$;

-- The invoice issued before this migration must remain unchanged.
DO $legacy_invoice$
BEGIN
  IF (SELECT total_amount FROM public.table_session_invoices
      WHERE id = '00000000-0000-4000-8000-000000000005') IS DISTINCT FROM 850::numeric
     OR (SELECT tax_amount FROM public.table_session_invoices
         WHERE id = '00000000-0000-4000-8000-000000000005') IS DISTINCT FROM 0::numeric THEN
    RAISE EXCEPTION 'Previously issued invoices must not be recalculated';
  END IF;
END;
$legacy_invoice$;
