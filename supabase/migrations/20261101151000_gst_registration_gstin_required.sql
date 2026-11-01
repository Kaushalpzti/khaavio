-- Explicitly prevent a registered/composition status without a recognised GSTIN state.
-- This is separate from the main GST migration so the registration safeguard is
-- independently auditable and migration ordering remains deterministic.
BEGIN;

DO $gst_registration_gstin_required$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conname = 'restaurants_gst_registration_gstin_required_check'
      AND conrelid = 'public.restaurants'::regclass
  ) THEN
    ALTER TABLE public.restaurants
      ADD CONSTRAINT restaurants_gst_registration_gstin_required_check
      CHECK (
        gst_registration_type NOT IN ('regular', 'composition')
        OR (
          gstin IS NOT NULL
          AND substring(gstin FROM 1 FOR 2) IN
            ('01','02','03','04','05','06','07','08','09','10','11','12','13','14','15','16','17','18','19','20','21','22','23','24','25','26','27','29','30','31','32','33','34','35','36','37','38','97')
        )
      );
  END IF;
END;
$gst_registration_gstin_required$;

COMMIT;
