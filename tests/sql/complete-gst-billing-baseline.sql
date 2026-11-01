-- Minimal legacy GST schema for the complete GST migration integration test.
-- The production restaurants/orders tables already contain these columns from
-- the original GST migrations; this fixture adds the same baseline safely.
ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS state text,
  ADD COLUMN IF NOT EXISTS gst_legal_name text,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS postal_code text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS gst_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS gstin text,
  ADD COLUMN IF NOT EXISTS gst_rate numeric(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gst_price_inclusive boolean NOT NULL DEFAULT false;

ALTER TABLE public.restaurant_tables
  ADD COLUMN IF NOT EXISTS table_number text NOT NULL DEFAULT '1';

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS tracking_token uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS discount_amount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gst_enabled_snapshot boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS gstin_snapshot text,
  ADD COLUMN IF NOT EXISTS gst_rate_snapshot numeric(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gst_inclusive_snapshot boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS gst_amount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS grand_total numeric(12,2),
  ADD COLUMN IF NOT EXISTS service_mode text NOT NULL DEFAULT 'dine_in',
  ADD COLUMN IF NOT EXISTS pickup_eta_minutes smallint;

-- Simulate the old, incomplete opt-in so the migration proves it disables
-- legacy tax collection and requires the owner to review the registration.
UPDATE public.restaurants
SET state = 'Bihar',
    gst_enabled = true,
    gstin = '10ABCDE1234F1Z5',
    gst_rate = 5,
    gst_price_inclusive = false
WHERE slug = 'green-table';
