-- Complete restaurant GST billing: registration-aware tax, automatic tax split,
-- table/guest final invoices, standalone pickup checkout and tax-document snapshots.
-- Existing issued invoices and historical order totals are never recalculated.
BEGIN;

ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS gst_registration_type text NOT NULL DEFAULT 'unregistered',
  ADD COLUMN IF NOT EXISTS gst_legal_name text;

DO $gst_registration_type$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conname = 'restaurants_gst_registration_type_check'
      AND conrelid = 'public.restaurants'::regclass
  ) THEN
    ALTER TABLE public.restaurants
      ADD CONSTRAINT restaurants_gst_registration_type_check
      CHECK (gst_registration_type IN ('needs_review', 'regular', 'composition', 'unregistered'));
  END IF;
END;
$gst_registration_type$;

-- Do not continue collecting GST from legacy opt-ins whose registration status
-- and full tax-invoice particulars were not confirmed in the earlier settings UI.
UPDATE public.restaurants
SET gst_registration_type = 'needs_review',
    gst_enabled = false
WHERE gst_enabled IS TRUE
  AND gst_registration_type = 'unregistered';

DO $gst_registration_consistency$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conname = 'restaurants_gst_registration_consistency_check'
      AND conrelid = 'public.restaurants'::regclass
  ) THEN
    ALTER TABLE public.restaurants
      ADD CONSTRAINT restaurants_gst_registration_consistency_check
      CHECK (
        (
          gst_registration_type = 'regular'
          AND gst_enabled IS TRUE
          AND gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][A-Z0-9]Z[A-Z0-9]$'
          AND substring(gstin FROM 1 FOR 2) IN
            ('01','02','03','04','05','06','07','08','09','10','11','12','13','14','15','16','17','18','19','20','21','22','23','24','25','26','27','29','30','31','32','33','34','35','36','37','38','97')
          AND gst_rate > 0 AND gst_rate <= 100
          AND NULLIF(pg_catalog.btrim(gst_legal_name), '') IS NOT NULL
          AND NULLIF(pg_catalog.btrim(address), '') IS NOT NULL
          AND NULLIF(pg_catalog.btrim(city), '') IS NOT NULL
          AND NULLIF(pg_catalog.btrim(state), '') IS NOT NULL
        )
        OR (
          gst_registration_type = 'composition'
          AND gst_enabled IS FALSE
          AND gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][A-Z0-9]Z[A-Z0-9]$'
          AND substring(gstin FROM 1 FOR 2) IN
            ('01','02','03','04','05','06','07','08','09','10','11','12','13','14','15','16','17','18','19','20','21','22','23','24','25','26','27','29','30','31','32','33','34','35','36','37','38','97')
          AND NULLIF(pg_catalog.btrim(gst_legal_name), '') IS NOT NULL
          AND NULLIF(pg_catalog.btrim(address), '') IS NOT NULL
          AND NULLIF(pg_catalog.btrim(city), '') IS NOT NULL
          AND NULLIF(pg_catalog.btrim(state), '') IS NOT NULL
        )
        OR (
          gst_registration_type IN ('needs_review', 'unregistered')
          AND gst_enabled IS FALSE
        )
      );
  END IF;
END;
$gst_registration_consistency$;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS gst_taxable_amount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gst_cgst_rate_snapshot numeric(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gst_cgst_amount_snapshot numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gst_sgst_rate_snapshot numeric(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gst_sgst_amount_snapshot numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gst_igst_rate_snapshot numeric(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gst_igst_amount_snapshot numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gst_registration_type_snapshot text NOT NULL DEFAULT 'unregistered',
  ADD COLUMN IF NOT EXISTS gst_tax_type_snapshot text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS gst_document_type_snapshot text NOT NULL DEFAULT 'receipt',
  ADD COLUMN IF NOT EXISTS gst_supplier_state_code_snapshot text,
  ADD COLUMN IF NOT EXISTS gst_place_of_supply_state_snapshot text,
  ADD COLUMN IF NOT EXISTS gst_place_of_supply_state_code_snapshot text,
  ADD COLUMN IF NOT EXISTS gst_supplier_name_snapshot text,
  ADD COLUMN IF NOT EXISTS gst_supplier_address_snapshot text,
  ADD COLUMN IF NOT EXISTS gst_supplier_city_snapshot text,
  ADD COLUMN IF NOT EXISTS gst_supplier_state_snapshot text,
  ADD COLUMN IF NOT EXISTS gst_supplier_postal_code_snapshot text,
  ADD COLUMN IF NOT EXISTS gst_supplier_phone_snapshot text,
  ADD COLUMN IF NOT EXISTS gst_sac_code_snapshot text NOT NULL DEFAULT '996331',
  ADD COLUMN IF NOT EXISTS gst_document_number text,
  ADD COLUMN IF NOT EXISTS gst_document_issued_at timestamptz;

ALTER TABLE public.table_session_invoices
  ADD COLUMN IF NOT EXISTS taxable_amount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gst_rate_snapshot numeric(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cgst_rate numeric(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cgst_amount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sgst_rate numeric(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sgst_amount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS igst_rate numeric(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS igst_amount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gst_registration_type_snapshot text NOT NULL DEFAULT 'unregistered',
  ADD COLUMN IF NOT EXISTS gst_tax_type_snapshot text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS gst_document_type_snapshot text NOT NULL DEFAULT 'receipt',
  ADD COLUMN IF NOT EXISTS supplier_state_code_snapshot text,
  ADD COLUMN IF NOT EXISTS place_of_supply_state_snapshot text,
  ADD COLUMN IF NOT EXISTS place_of_supply_state_code_snapshot text,
  ADD COLUMN IF NOT EXISTS supplier_legal_name_snapshot text,
  ADD COLUMN IF NOT EXISTS supplier_address_snapshot text,
  ADD COLUMN IF NOT EXISTS supplier_city_snapshot text,
  ADD COLUMN IF NOT EXISTS supplier_state_snapshot text,
  ADD COLUMN IF NOT EXISTS supplier_postal_code_snapshot text,
  ADD COLUMN IF NOT EXISTS supplier_phone_snapshot text,
  ADD COLUMN IF NOT EXISTS sac_code_snapshot text NOT NULL DEFAULT '996331',
  ADD COLUMN IF NOT EXISTS gst_document_number text,
  ADD COLUMN IF NOT EXISTS gst_document_issued_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS orders_restaurant_gst_document_number_uidx
  ON public.orders (restaurant_id, gst_document_number)
  WHERE gst_document_number IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS table_session_invoices_gst_document_number_uidx
  ON public.table_session_invoices (restaurant_id, gst_document_number)
  WHERE gst_document_number IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.restaurant_gst_document_counters (
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  financial_year text NOT NULL,
  last_number bigint NOT NULL DEFAULT 0 CHECK (last_number >= 0),
  PRIMARY KEY (restaurant_id, financial_year)
);
REVOKE ALL ON TABLE public.restaurant_gst_document_counters FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.khaavio_gst_state_code(p_state text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $function$
  SELECT CASE pg_catalog.upper(pg_catalog.regexp_replace(pg_catalog.btrim(COALESCE(p_state, '')), '[.,]', '', 'g'))
    WHEN 'JAMMU AND KASHMIR' THEN '01'
    WHEN 'JAMMU & KASHMIR' THEN '01'
    WHEN 'HIMACHAL PRADESH' THEN '02'
    WHEN 'PUNJAB' THEN '03'
    WHEN 'CHANDIGARH' THEN '04'
    WHEN 'UTTARAKHAND' THEN '05'
    WHEN 'UTTARANCHAL' THEN '05'
    WHEN 'HARYANA' THEN '06'
    WHEN 'DELHI' THEN '07'
    WHEN 'NCT OF DELHI' THEN '07'
    WHEN 'RAJASTHAN' THEN '08'
    WHEN 'UTTAR PRADESH' THEN '09'
    WHEN 'BIHAR' THEN '10'
    WHEN 'SIKKIM' THEN '11'
    WHEN 'ARUNACHAL PRADESH' THEN '12'
    WHEN 'NAGALAND' THEN '13'
    WHEN 'MANIPUR' THEN '14'
    WHEN 'MIZORAM' THEN '15'
    WHEN 'TRIPURA' THEN '16'
    WHEN 'MEGHALAYA' THEN '17'
    WHEN 'ASSAM' THEN '18'
    WHEN 'WEST BENGAL' THEN '19'
    WHEN 'JHARKHAND' THEN '20'
    WHEN 'ODISHA' THEN '21'
    WHEN 'ORISSA' THEN '21'
    WHEN 'CHHATTISGARH' THEN '22'
    WHEN 'MADHYA PRADESH' THEN '23'
    WHEN 'GUJARAT' THEN '24'
    WHEN 'DAMAN AND DIU' THEN '25'
    WHEN 'DADRA AND NAGAR HAVELI' THEN '26'
    WHEN 'DADRA NAGAR HAVELI AND DAMAN DIU' THEN '26'
    WHEN 'DADRA & NAGAR HAVELI AND DAMAN & DIU' THEN '26'
    WHEN 'MAHARASHTRA' THEN '27'
    WHEN 'KARNATAKA' THEN '29'
    WHEN 'GOA' THEN '30'
    WHEN 'LAKSHADWEEP' THEN '31'
    WHEN 'KERALA' THEN '32'
    WHEN 'TAMIL NADU' THEN '33'
    WHEN 'PUDUCHERRY' THEN '34'
    WHEN 'PONDICHERRY' THEN '34'
    WHEN 'ANDAMAN AND NICOBAR ISLANDS' THEN '35'
    WHEN 'TELANGANA' THEN '36'
    WHEN 'ANDHRA PRADESH' THEN '37'
    WHEN 'LADAKH' THEN '38'
    WHEN 'OTHER TERRITORY' THEN '97'
    ELSE NULL
  END;
$function$;
REVOKE ALL ON FUNCTION public.khaavio_gst_state_code(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.khaavio_calculate_restaurant_gst(
  p_registration_type text,
  p_gst_enabled boolean,
  p_gstin text,
  p_gst_rate numeric,
  p_gst_inclusive boolean,
  p_supplier_state text,
  p_amount numeric
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_type text := COALESCE(p_registration_type, 'unregistered');
  v_rate numeric(5,2) := COALESCE(p_gst_rate, 0);
  v_amount numeric(12,2) := pg_catalog.round(GREATEST(COALESCE(p_amount, 0), 0), 2);
  v_gstin text := NULLIF(pg_catalog.upper(pg_catalog.btrim(p_gstin)), '');
  v_supplier_state_code text;
  v_pos_state_code text;
  v_tax_type text := 'none';
  v_document_type text := 'receipt';
  v_tax numeric(12,2) := 0;
  v_taxable numeric(12,2) := v_amount;
  v_grand numeric(12,2) := v_amount;
  v_cgst numeric(12,2) := 0;
  v_sgst numeric(12,2) := 0;
  v_igst numeric(12,2) := 0;
  v_cgst_rate numeric(5,2) := 0;
  v_sgst_rate numeric(5,2) := 0;
  v_igst_rate numeric(5,2) := 0;
BEGIN
  IF v_type NOT IN ('needs_review', 'regular', 'composition', 'unregistered') THEN
    RAISE EXCEPTION 'Choose a valid GST registration type.' USING ERRCODE = '22023';
  END IF;

  v_supplier_state_code := CASE
    WHEN v_gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][A-Z0-9]Z[A-Z0-9]$'
      THEN pg_catalog.substr(v_gstin, 1, 2)
    ELSE NULL
  END;
  IF v_supplier_state_code NOT IN
    ('01','02','03','04','05','06','07','08','09','10','11','12','13','14','15','16','17','18','19','20','21','22','23','24','25','26','27','29','30','31','32','33','34','35','36','37','38','97') THEN
    v_supplier_state_code := NULL;
  END IF;
  v_pos_state_code := public.khaavio_gst_state_code(p_supplier_state);

  IF v_type = 'regular' AND p_gst_enabled IS TRUE THEN
    IF v_supplier_state_code IS NULL THEN
      RAISE EXCEPTION 'A valid 15-character GSTIN is required for regular GST billing.' USING ERRCODE = '22023';
    END IF;
    IF v_rate <= 0 OR v_rate > 100 THEN
      RAISE EXCEPTION 'Enter a valid GST rate greater than zero and no more than 100 percent.' USING ERRCODE = '22023';
    END IF;
    IF v_pos_state_code IS NULL THEN
      RAISE EXCEPTION 'Select a valid restaurant state before enabling GST billing.' USING ERRCODE = '22023';
    END IF;

    v_document_type := 'tax_invoice';
    v_tax_type := CASE WHEN v_supplier_state_code = v_pos_state_code THEN 'cgst_sgst' ELSE 'igst' END;
    v_tax := CASE
      WHEN COALESCE(p_gst_inclusive, false)
        THEN pg_catalog.round(v_amount * v_rate / (100 + v_rate), 2)
      ELSE pg_catalog.round(v_amount * v_rate / 100, 2)
    END;
    v_taxable := CASE WHEN COALESCE(p_gst_inclusive, false) THEN v_amount - v_tax ELSE v_amount END;
    v_grand := CASE WHEN COALESCE(p_gst_inclusive, false) THEN v_amount ELSE v_amount + v_tax END;

    IF v_tax_type = 'cgst_sgst' THEN
      v_cgst_rate := v_rate / 2;
      v_sgst_rate := v_rate / 2;
      v_cgst := pg_catalog.round(v_tax / 2, 2);
      v_sgst := v_tax - v_cgst;
    ELSE
      v_igst_rate := v_rate;
      v_igst := v_tax;
    END IF;
  ELSIF v_type = 'composition' THEN
    IF v_supplier_state_code IS NULL OR v_pos_state_code IS NULL THEN
      RAISE EXCEPTION 'A valid GSTIN and restaurant outlet state are required for a bill of supply.' USING ERRCODE = '22023';
    END IF;
    v_document_type := 'bill_of_supply';
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'registration_type', v_type,
    'document_type', v_document_type,
    'tax_type', v_tax_type,
    'gstin', CASE WHEN v_type IN ('regular', 'composition') THEN v_gstin ELSE NULL END,
    'gst_rate', CASE WHEN v_type = 'regular' AND p_gst_enabled IS TRUE THEN v_rate ELSE 0 END,
    'inclusive', CASE WHEN v_type = 'regular' AND p_gst_enabled IS TRUE THEN COALESCE(p_gst_inclusive, false) ELSE false END,
    'taxable_amount', v_taxable,
    'tax_amount', v_tax,
    'cgst_rate', v_cgst_rate,
    'cgst_amount', v_cgst,
    'sgst_rate', v_sgst_rate,
    'sgst_amount', v_sgst,
    'igst_rate', v_igst_rate,
    'igst_amount', v_igst,
    'grand_total', v_grand,
    'supplier_state_code', v_supplier_state_code,
    'place_of_supply_state', NULLIF(pg_catalog.btrim(p_supplier_state), ''),
    'place_of_supply_state_code', v_pos_state_code,
    'sac_code', '996331'
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.khaavio_calculate_restaurant_gst(text, boolean, text, numeric, boolean, text, numeric) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.khaavio_next_gst_document_number(
  p_restaurant_id uuid,
  p_issued_at timestamptz DEFAULT pg_catalog.now()
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_local_date date := (COALESCE(p_issued_at, pg_catalog.now()) AT TIME ZONE 'Asia/Kolkata')::date;
  v_start_year integer;
  v_financial_year text;
  v_last_number bigint;
BEGIN
  IF p_restaurant_id IS NULL THEN RAISE EXCEPTION 'A restaurant is required for a tax document.'; END IF;
  v_start_year := CASE WHEN EXTRACT(MONTH FROM v_local_date) >= 4
    THEN EXTRACT(YEAR FROM v_local_date)::integer
    ELSE EXTRACT(YEAR FROM v_local_date)::integer - 1
  END;
  v_financial_year := pg_catalog.lpad((v_start_year % 100)::text, 2, '0')
    || '-' || pg_catalog.lpad(((v_start_year + 1) % 100)::text, 2, '0');

  INSERT INTO public.restaurant_gst_document_counters AS counter (
    restaurant_id, financial_year, last_number
  )
  VALUES (p_restaurant_id, v_financial_year, 1)
  ON CONFLICT (restaurant_id, financial_year)
  DO UPDATE SET last_number = counter.last_number + 1
  RETURNING last_number INTO v_last_number;

  RETURN 'KHV/' || v_financial_year || '/' || pg_catalog.lpad(v_last_number::text, 6, '0');
END;
$function$;
REVOKE ALL ON FUNCTION public.khaavio_next_gst_document_number(uuid, timestamptz) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.khaavio_snapshot_invoice_gst()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_subtotal numeric(12,2);
  v_discount numeric(12,2);
  v_net numeric(12,2);
  v_breakdown jsonb;
  v_supplier_name text;
  v_supplier_address text;
  v_supplier_city text;
  v_supplier_state text;
  v_supplier_postal_code text;
  v_supplier_phone text;
BEGIN
  SELECT
    COALESCE(pg_catalog.sum(o.total_amount + o.discount_amount), 0)::numeric(12,2),
    COALESCE(pg_catalog.sum(o.discount_amount), 0)::numeric(12,2),
    COALESCE(pg_catalog.sum(o.total_amount), 0)::numeric(12,2)
  INTO v_subtotal, v_discount, v_net
  FROM public.orders o
  WHERE o.status <> 'cancelled'
    AND (
      (NEW.guest_tab_id IS NOT NULL AND o.guest_tab_id = NEW.guest_tab_id)
      OR (NEW.guest_tab_id IS NULL AND o.session_id = NEW.session_id)
    );

  SELECT public.khaavio_calculate_restaurant_gst(
    r.gst_registration_type, r.gst_enabled, r.gstin, r.gst_rate,
    r.gst_price_inclusive, r.state, v_net
  )
  INTO v_breakdown
  FROM public.restaurants r
  WHERE r.id = NEW.restaurant_id;

  IF v_breakdown IS NULL THEN
    RAISE EXCEPTION 'Restaurant GST settings could not be loaded.' USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(NULLIF(pg_catalog.btrim(r.gst_legal_name), ''), r.name),
         r.address, r.city, r.state, r.postal_code, r.phone
    INTO v_supplier_name, v_supplier_address, v_supplier_city,
         v_supplier_state, v_supplier_postal_code, v_supplier_phone
  FROM public.restaurants r
  WHERE r.id = NEW.restaurant_id;

  NEW.subtotal_amount := v_subtotal;
  NEW.discount_amount := v_discount;
  NEW.taxable_amount := (v_breakdown ->> 'taxable_amount')::numeric;
  NEW.tax_amount := (v_breakdown ->> 'tax_amount')::numeric;
  NEW.gstin_snapshot := v_breakdown ->> 'gstin';
  NEW.gst_rate_snapshot := (v_breakdown ->> 'gst_rate')::numeric;
  NEW.gst_inclusive := COALESCE((v_breakdown ->> 'inclusive')::boolean, false);
  NEW.cgst_rate := (v_breakdown ->> 'cgst_rate')::numeric;
  NEW.cgst_amount := (v_breakdown ->> 'cgst_amount')::numeric;
  NEW.sgst_rate := (v_breakdown ->> 'sgst_rate')::numeric;
  NEW.sgst_amount := (v_breakdown ->> 'sgst_amount')::numeric;
  NEW.igst_rate := (v_breakdown ->> 'igst_rate')::numeric;
  NEW.igst_amount := (v_breakdown ->> 'igst_amount')::numeric;
  NEW.gst_registration_type_snapshot := v_breakdown ->> 'registration_type';
  NEW.gst_tax_type_snapshot := v_breakdown ->> 'tax_type';
  NEW.gst_document_type_snapshot := v_breakdown ->> 'document_type';
  NEW.supplier_state_code_snapshot := v_breakdown ->> 'supplier_state_code';
  NEW.place_of_supply_state_snapshot := v_breakdown ->> 'place_of_supply_state';
  NEW.place_of_supply_state_code_snapshot := v_breakdown ->> 'place_of_supply_state_code';
  NEW.supplier_legal_name_snapshot := v_supplier_name;
  NEW.supplier_address_snapshot := v_supplier_address;
  NEW.supplier_city_snapshot := v_supplier_city;
  NEW.supplier_state_snapshot := v_supplier_state;
  NEW.supplier_postal_code_snapshot := v_supplier_postal_code;
  NEW.supplier_phone_snapshot := v_supplier_phone;
  NEW.sac_code_snapshot := COALESCE(v_breakdown ->> 'sac_code', '996331');
  NEW.total_amount := (v_breakdown ->> 'grand_total')::numeric;

  IF NEW.gst_document_type_snapshot IN ('tax_invoice', 'bill_of_supply')
     AND NEW.gst_document_number IS NULL THEN
    NEW.gst_document_number := public.khaavio_next_gst_document_number(NEW.restaurant_id, NEW.issued_at);
    NEW.gst_document_issued_at := COALESCE(NEW.gst_document_issued_at, NEW.issued_at, pg_catalog.now());
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.khaavio_snapshot_invoice_gst() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS khaavio_snapshot_standalone_order_gst ON public.orders;
CREATE OR REPLACE FUNCTION public.khaavio_snapshot_standalone_order_gst()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_breakdown jsonb;
  v_registration_type text;
  v_gst_enabled boolean;
  v_gstin text;
  v_gst_rate numeric(5,2);
  v_gst_inclusive boolean;
  v_supplier_state text;
  v_supplier_name text;
  v_supplier_address text;
  v_supplier_city text;
  v_supplier_postal_code text;
  v_supplier_phone text;
BEGIN
  -- Table and guest orders receive GST only when their final invoice is issued.
  IF NEW.session_id IS NOT NULL OR NEW.guest_tab_id IS NOT NULL OR NEW.table_id IS NOT NULL THEN
    NEW.gst_enabled_snapshot := false;
    NEW.gstin_snapshot := NULL;
    NEW.gst_rate_snapshot := 0;
    NEW.gst_inclusive_snapshot := false;
    NEW.gst_amount := 0;
    NEW.grand_total := NULL;
    NEW.gst_taxable_amount := 0;
    NEW.gst_cgst_rate_snapshot := 0;
    NEW.gst_cgst_amount_snapshot := 0;
    NEW.gst_sgst_rate_snapshot := 0;
    NEW.gst_sgst_amount_snapshot := 0;
    NEW.gst_igst_rate_snapshot := 0;
    NEW.gst_igst_amount_snapshot := 0;
    NEW.gst_registration_type_snapshot := 'unregistered';
    NEW.gst_tax_type_snapshot := 'none';
    NEW.gst_document_type_snapshot := 'receipt';
    NEW.gst_supplier_state_code_snapshot := NULL;
    NEW.gst_place_of_supply_state_snapshot := NULL;
    NEW.gst_place_of_supply_state_code_snapshot := NULL;
    NEW.gst_supplier_name_snapshot := NULL;
    NEW.gst_supplier_address_snapshot := NULL;
    NEW.gst_supplier_city_snapshot := NULL;
    NEW.gst_supplier_state_snapshot := NULL;
    NEW.gst_supplier_postal_code_snapshot := NULL;
    NEW.gst_supplier_phone_snapshot := NULL;
    NEW.gst_document_number := NULL;
    NEW.gst_document_issued_at := NULL;
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    SELECT r.gst_registration_type, r.gst_enabled, r.gstin, r.gst_rate,
           r.gst_price_inclusive, r.state,
           COALESCE(NULLIF(pg_catalog.btrim(r.gst_legal_name), ''), r.name),
           r.address, r.city, r.postal_code, r.phone
      INTO v_registration_type, v_gst_enabled, v_gstin, v_gst_rate,
           v_gst_inclusive, v_supplier_state, v_supplier_name,
           v_supplier_address, v_supplier_city, v_supplier_postal_code,
           v_supplier_phone
    FROM public.restaurants r
    WHERE r.id = NEW.restaurant_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Restaurant GST settings could not be loaded.'; END IF;
  ELSE
    v_registration_type := OLD.gst_registration_type_snapshot;
    v_gst_enabled := OLD.gst_enabled_snapshot;
    v_gstin := OLD.gstin_snapshot;
    v_gst_rate := OLD.gst_rate_snapshot;
    v_gst_inclusive := OLD.gst_inclusive_snapshot;
    v_supplier_state := OLD.gst_place_of_supply_state_snapshot;
    v_supplier_name := OLD.gst_supplier_name_snapshot;
    v_supplier_address := OLD.gst_supplier_address_snapshot;
    v_supplier_city := OLD.gst_supplier_city_snapshot;
    v_supplier_postal_code := OLD.gst_supplier_postal_code_snapshot;
    v_supplier_phone := OLD.gst_supplier_phone_snapshot;
    NEW.gst_document_number := OLD.gst_document_number;
    NEW.gst_document_issued_at := OLD.gst_document_issued_at;
  END IF;

  v_breakdown := public.khaavio_calculate_restaurant_gst(
    v_registration_type, v_gst_enabled, v_gstin, v_gst_rate,
    v_gst_inclusive, v_supplier_state, NEW.total_amount
  );

  NEW.gst_enabled_snapshot := v_registration_type = 'regular' AND v_gst_enabled IS TRUE;
  NEW.gstin_snapshot := v_breakdown ->> 'gstin';
  NEW.gst_rate_snapshot := (v_breakdown ->> 'gst_rate')::numeric;
  NEW.gst_inclusive_snapshot := COALESCE((v_breakdown ->> 'inclusive')::boolean, false);
  NEW.gst_amount := (v_breakdown ->> 'tax_amount')::numeric;
  NEW.grand_total := (v_breakdown ->> 'grand_total')::numeric;
  NEW.gst_taxable_amount := (v_breakdown ->> 'taxable_amount')::numeric;
  NEW.gst_cgst_rate_snapshot := (v_breakdown ->> 'cgst_rate')::numeric;
  NEW.gst_cgst_amount_snapshot := (v_breakdown ->> 'cgst_amount')::numeric;
  NEW.gst_sgst_rate_snapshot := (v_breakdown ->> 'sgst_rate')::numeric;
  NEW.gst_sgst_amount_snapshot := (v_breakdown ->> 'sgst_amount')::numeric;
  NEW.gst_igst_rate_snapshot := (v_breakdown ->> 'igst_rate')::numeric;
  NEW.gst_igst_amount_snapshot := (v_breakdown ->> 'igst_amount')::numeric;
  NEW.gst_registration_type_snapshot := v_breakdown ->> 'registration_type';
  NEW.gst_tax_type_snapshot := v_breakdown ->> 'tax_type';
  NEW.gst_document_type_snapshot := v_breakdown ->> 'document_type';
  NEW.gst_supplier_state_code_snapshot := v_breakdown ->> 'supplier_state_code';
  NEW.gst_place_of_supply_state_snapshot := v_breakdown ->> 'place_of_supply_state';
  NEW.gst_place_of_supply_state_code_snapshot := v_breakdown ->> 'place_of_supply_state_code';
  NEW.gst_supplier_name_snapshot := v_supplier_name;
  NEW.gst_supplier_address_snapshot := v_supplier_address;
  NEW.gst_supplier_city_snapshot := v_supplier_city;
  NEW.gst_supplier_state_snapshot := v_supplier_state;
  NEW.gst_supplier_postal_code_snapshot := v_supplier_postal_code;
  NEW.gst_supplier_phone_snapshot := v_supplier_phone;
  NEW.gst_sac_code_snapshot := COALESCE(v_breakdown ->> 'sac_code', '996331');

  IF NEW.gst_document_type_snapshot IN ('tax_invoice', 'bill_of_supply')
     AND NEW.gst_document_number IS NULL THEN
    NEW.gst_document_number := public.khaavio_next_gst_document_number(NEW.restaurant_id, NEW.created_at);
    NEW.gst_document_issued_at := COALESCE(NEW.created_at, pg_catalog.now());
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.khaavio_snapshot_standalone_order_gst() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER khaavio_snapshot_standalone_order_gst
  BEFORE INSERT OR UPDATE OF total_amount, discount_amount
  ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.khaavio_snapshot_standalone_order_gst();

CREATE OR REPLACE FUNCTION public.khaavio_public_restaurant_gst_summary(p_slug text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT pg_catalog.jsonb_build_object(
    'registration_type', r.gst_registration_type,
    'gst_enabled', r.gst_registration_type = 'regular' AND r.gst_enabled,
    'gst_rate', CASE WHEN r.gst_registration_type = 'regular' AND r.gst_enabled THEN r.gst_rate ELSE 0 END,
    'gst_inclusive', CASE WHEN r.gst_registration_type = 'regular' AND r.gst_enabled THEN r.gst_price_inclusive ELSE false END,
    'tax_type', CASE
      WHEN r.gst_registration_type = 'regular' AND r.gst_enabled
        THEN CASE
          WHEN pg_catalog.substr(r.gstin, 1, 2) = public.khaavio_gst_state_code(r.state) THEN 'cgst_sgst'
          ELSE 'igst'
        END
      ELSE 'none'
    END,
    'document_type', CASE
      WHEN r.gst_registration_type = 'regular' AND r.gst_enabled THEN 'tax_invoice'
      WHEN r.gst_registration_type = 'composition' THEN 'bill_of_supply'
      ELSE 'receipt'
    END
  )
  FROM public.restaurants r
  WHERE r.slug = pg_catalog.btrim(p_slug) AND r.is_published IS TRUE
  LIMIT 1;
$function$;
REVOKE ALL ON FUNCTION public.khaavio_public_restaurant_gst_summary(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.khaavio_public_restaurant_gst_summary(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.khaavio_public_order_tax_snapshot(
  p_slug text, p_order_id uuid, p_tracking_token uuid
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT pg_catalog.jsonb_build_object(
    'registration_type', o.gst_registration_type_snapshot,
    'document_type', o.gst_document_type_snapshot,
    'document_number', o.gst_document_number,
    'document_issued_at', o.gst_document_issued_at,
    'taxable_amount', o.gst_taxable_amount,
    'gst_rate', o.gst_rate_snapshot,
    'gst_inclusive', o.gst_inclusive_snapshot,
    'tax_amount', o.gst_amount,
    'tax_type', o.gst_tax_type_snapshot,
    'cgst_rate', o.gst_cgst_rate_snapshot,
    'cgst_amount', o.gst_cgst_amount_snapshot,
    'sgst_rate', o.gst_sgst_rate_snapshot,
    'sgst_amount', o.gst_sgst_amount_snapshot,
    'igst_rate', o.gst_igst_rate_snapshot,
    'igst_amount', o.gst_igst_amount_snapshot,
    'gstin_snapshot', o.gstin_snapshot,
    'supplier_state_code', o.gst_supplier_state_code_snapshot,
    'place_of_supply_state', o.gst_place_of_supply_state_snapshot,
    'place_of_supply_state_code', o.gst_place_of_supply_state_code_snapshot,
    'supplier_legal_name', o.gst_supplier_name_snapshot,
    'supplier_address', o.gst_supplier_address_snapshot,
    'supplier_city', o.gst_supplier_city_snapshot,
    'supplier_state', o.gst_supplier_state_snapshot,
    'supplier_postal_code', o.gst_supplier_postal_code_snapshot,
    'supplier_phone', o.gst_supplier_phone_snapshot,
    'sac_code', o.gst_sac_code_snapshot,
    'grand_total', COALESCE(o.grand_total, o.total_amount)
  )
  FROM public.orders o
  JOIN public.restaurants r ON r.id = o.restaurant_id
  WHERE r.slug = pg_catalog.btrim(p_slug)
    AND r.is_published IS TRUE
    AND o.id = p_order_id
    AND o.tracking_token = p_tracking_token
    AND o.session_id IS NULL AND o.guest_tab_id IS NULL AND o.table_id IS NULL
  LIMIT 1;
$function$;
REVOKE ALL ON FUNCTION public.khaavio_public_order_tax_snapshot(text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.khaavio_public_order_tax_snapshot(text, uuid, uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.khaavio_public_invoice_tax_snapshot(
  p_slug text, p_table_token uuid, p_invoice_id uuid, p_guest_tab_token uuid DEFAULT NULL
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
  v_invoice public.table_session_invoices%ROWTYPE;
  v_billing_mode text;
BEGIN
  SELECT r.id, rt.id
    INTO v_restaurant_id, v_table_id
  FROM public.restaurants r
  JOIN public.restaurant_tables rt ON rt.restaurant_id = r.id
  WHERE r.slug = pg_catalog.btrim(p_slug)
    AND r.is_published IS TRUE AND rt.qr_token = p_table_token AND rt.is_active IS TRUE;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT i.* INTO v_invoice
  FROM public.table_session_invoices i
  JOIN public.table_sessions ts
    ON ts.id = i.session_id AND ts.restaurant_id = i.restaurant_id AND ts.table_id = i.table_id
  WHERE i.id = p_invoice_id AND i.restaurant_id = v_restaurant_id
    AND i.table_id = v_table_id AND i.payment_status <> 'void'
  LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT ts.billing_mode INTO v_billing_mode
  FROM public.table_sessions ts
  WHERE ts.id = v_invoice.session_id AND ts.restaurant_id = v_restaurant_id
    AND ts.table_id = v_table_id;

  IF v_invoice.guest_tab_id IS NULL THEN
    IF p_guest_tab_token IS NOT NULL OR v_billing_mode <> 'combined' THEN RETURN NULL; END IF;
  ELSE
    IF p_guest_tab_token IS NULL OR v_billing_mode <> 'per_guest'
       OR NOT EXISTS (
         SELECT 1 FROM public.table_session_tabs t
         WHERE t.id = v_invoice.guest_tab_id
           AND t.restaurant_id = v_restaurant_id AND t.table_id = v_table_id
           AND t.session_id = v_invoice.session_id AND t.guest_tab_token = p_guest_tab_token
       ) THEN
      RETURN NULL;
    END IF;
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'registration_type', v_invoice.gst_registration_type_snapshot,
    'document_type', v_invoice.gst_document_type_snapshot,
    'document_number', v_invoice.gst_document_number,
    'document_issued_at', v_invoice.gst_document_issued_at,
    'taxable_amount', v_invoice.taxable_amount,
    'gst_rate', v_invoice.gst_rate_snapshot,
    'gst_inclusive', v_invoice.gst_inclusive,
    'tax_amount', v_invoice.tax_amount,
    'tax_type', v_invoice.gst_tax_type_snapshot,
    'cgst_rate', v_invoice.cgst_rate, 'cgst_amount', v_invoice.cgst_amount,
    'sgst_rate', v_invoice.sgst_rate, 'sgst_amount', v_invoice.sgst_amount,
    'igst_rate', v_invoice.igst_rate, 'igst_amount', v_invoice.igst_amount,
    'gstin_snapshot', v_invoice.gstin_snapshot,
    'supplier_state_code', v_invoice.supplier_state_code_snapshot,
    'place_of_supply_state', v_invoice.place_of_supply_state_snapshot,
    'place_of_supply_state_code', v_invoice.place_of_supply_state_code_snapshot,
    'supplier_legal_name', v_invoice.supplier_legal_name_snapshot,
    'supplier_address', v_invoice.supplier_address_snapshot,
    'supplier_city', v_invoice.supplier_city_snapshot,
    'supplier_state', v_invoice.supplier_state_snapshot,
    'supplier_postal_code', v_invoice.supplier_postal_code_snapshot,
    'supplier_phone', v_invoice.supplier_phone_snapshot,
    'sac_code', v_invoice.sac_code_snapshot
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.khaavio_public_invoice_tax_snapshot(text, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.khaavio_public_invoice_tax_snapshot(text, uuid, uuid, uuid) TO anon, authenticated;

-- The existing public-order RPC owns validation, inventory, coupon and loyalty
-- handling. This wrapper only returns the server-calculated customer total.
CREATE OR REPLACE FUNCTION public.place_public_order_for_service_mode_with_gst(
  p_slug text,
  p_customer_name text,
  p_customer_phone text,
  p_notes text,
  p_items jsonb,
  p_service_mode text,
  p_pickup_eta_minutes smallint,
  p_coupon_code text,
  p_loyalty_phone text DEFAULT NULL
)
RETURNS TABLE(order_id uuid, order_reference text, total_amount numeric, tracking_token uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_order record;
  v_payable numeric(12,2);
BEGIN
  SELECT * INTO v_order
  FROM public.place_public_order_for_service_mode(
    p_slug, p_customer_name, p_customer_phone, p_notes, p_items,
    p_service_mode, p_pickup_eta_minutes, p_coupon_code, p_loyalty_phone
  );
  IF NOT FOUND OR v_order.order_id IS NULL THEN
    RAISE EXCEPTION 'The public order could not be confirmed.' USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(o.grand_total, o.total_amount)
    INTO v_payable
  FROM public.orders o
  WHERE o.id = v_order.order_id AND o.tracking_token = v_order.tracking_token;
  RETURN QUERY SELECT v_order.order_id, v_order.order_reference, v_payable, v_order.tracking_token;
END;
$function$;
REVOKE ALL ON FUNCTION public.place_public_order_for_service_mode_with_gst(text, text, text, text, jsonb, text, smallint, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.place_public_order_for_service_mode_with_gst(text, text, text, text, jsonb, text, smallint, text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_public_order_tracking(
  p_slug text, p_order_id uuid, p_tracking_token uuid
)
RETURNS TABLE(
  order_id uuid, order_reference text, order_status text, total_amount numeric,
  created_at timestamptz, restaurant_name text, table_number text, items jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT
    o.id,
    pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(o.id::text, '-', ''), 1, 8)),
    o.status::text,
    CASE
      WHEN o.session_id IS NULL AND o.guest_tab_id IS NULL AND o.table_id IS NULL
        THEN COALESCE(o.grand_total, o.total_amount)
      ELSE o.total_amount
    END,
    o.created_at, r.name::text, rt.table_number::text,
    COALESCE(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'name', oi.item_name, 'quantity', oi.quantity,
          'unit_price', oi.unit_price, 'line_total', oi.line_total
        ) ORDER BY oi.id
      ) FILTER (WHERE oi.id IS NOT NULL),
      '[]'::jsonb
    )
  FROM public.orders o
  JOIN public.restaurants r ON r.id = o.restaurant_id
  LEFT JOIN public.restaurant_tables rt ON rt.id = o.table_id AND rt.restaurant_id = o.restaurant_id
  LEFT JOIN public.order_items oi ON oi.order_id = o.id
  WHERE r.slug = p_slug AND r.is_published IS TRUE
    AND o.id = p_order_id AND o.tracking_token = p_tracking_token
  GROUP BY o.id, o.status, o.total_amount, o.grand_total, o.session_id,
           o.guest_tab_id, o.table_id, o.created_at, r.name, rt.table_number;
$function$;
REVOKE ALL ON FUNCTION public.get_public_order_tracking(text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_order_tracking(text, uuid, uuid) TO anon, authenticated;

COMMIT;
