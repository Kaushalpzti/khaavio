-- Attach the final-invoice GST snapshot trigger to the established invoice table.
-- The trigger calculates GST once when a combined or split-guest invoice is issued.
BEGIN;
DROP TRIGGER IF EXISTS khaavio_snapshot_invoice_gst ON public.table_session_invoices;
CREATE TRIGGER khaavio_snapshot_invoice_gst
  BEFORE INSERT ON public.table_session_invoices
  FOR EACH ROW EXECUTE FUNCTION public.khaavio_snapshot_invoice_gst();
COMMIT;
