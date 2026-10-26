-- Khaavio Razorpay recurring subscription billing.
-- Existing manual/trial subscriptions are preserved; payment fields default to manual.
BEGIN;

CREATE TABLE IF NOT EXISTS public.razorpay_subscription_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  plan_key text NOT NULL REFERENCES public.subscription_plans(plan_key),
  razorpay_plan_id text NOT NULL,
  amount_inr numeric(10,2) NOT NULL CHECK (amount_inr > 0),
  billing_interval text NOT NULL CHECK (billing_interval IN ('monthly', 'yearly')),
  razorpay_subscription_id text UNIQUE,
  razorpay_payment_id text,
  status text NOT NULL DEFAULT 'creating'
    CHECK (status IN ('creating', 'created', 'signature_verified', 'authenticated', 'charged', 'failed', 'cancelled', 'expired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  verified_at timestamptz
);

CREATE INDEX IF NOT EXISTS razorpay_attempts_restaurant_created_idx
  ON public.razorpay_subscription_attempts(restaurant_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS razorpay_one_open_attempt_per_restaurant_idx
  ON public.razorpay_subscription_attempts(restaurant_id)
  WHERE status IN ('creating', 'created', 'signature_verified', 'authenticated');

CREATE TABLE IF NOT EXISTS public.razorpay_subscription_payments (
  razorpay_payment_id text PRIMARY KEY,
  attempt_id uuid NOT NULL REFERENCES public.razorpay_subscription_attempts(id) ON DELETE RESTRICT,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  plan_key text NOT NULL REFERENCES public.subscription_plans(plan_key),
  amount_paise bigint NOT NULL CHECK (amount_paise > 0),
  currency text NOT NULL CHECK (currency = 'INR'),
  payment_status text NOT NULL CHECK (payment_status IN ('captured', 'refunded', 'partially_refunded')),
  webhook_event_id text,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS razorpay_payments_restaurant_paid_idx
  ON public.razorpay_subscription_payments(restaurant_id, paid_at DESC);

CREATE TABLE IF NOT EXISTS public.razorpay_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL UNIQUE,
  event_type text NOT NULL,
  processing_status text NOT NULL DEFAULT 'processing'
    CHECK (processing_status IN ('processing', 'processed', 'failed', 'ignored')),
  error_message text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

ALTER TABLE public.restaurant_subscriptions
  ADD COLUMN IF NOT EXISTS payment_provider text NOT NULL DEFAULT 'manual';
ALTER TABLE public.restaurant_subscriptions
  ADD COLUMN IF NOT EXISTS razorpay_subscription_id text;
ALTER TABLE public.restaurant_subscriptions
  ADD COLUMN IF NOT EXISTS razorpay_payment_id text;
ALTER TABLE public.restaurant_subscriptions
  ADD COLUMN IF NOT EXISTS razorpay_attempt_id uuid REFERENCES public.razorpay_subscription_attempts(id) ON DELETE SET NULL;
ALTER TABLE public.restaurant_subscriptions
  ADD COLUMN IF NOT EXISTS cancel_at_period_end boolean NOT NULL DEFAULT false;

ALTER TABLE public.restaurant_subscriptions
  DROP CONSTRAINT IF EXISTS restaurant_subscriptions_payment_provider_check;
ALTER TABLE public.restaurant_subscriptions
  ADD CONSTRAINT restaurant_subscriptions_payment_provider_check
  CHECK (payment_provider IN ('manual', 'razorpay'));

CREATE UNIQUE INDEX IF NOT EXISTS restaurant_subscriptions_razorpay_subscription_id_idx
  ON public.restaurant_subscriptions(razorpay_subscription_id)
  WHERE razorpay_subscription_id IS NOT NULL;

-- Private billing ledger: browser roles cannot read or mutate billing attempts,
-- webhook deliveries, or verified payment records. Edge Functions use service_role.
ALTER TABLE public.razorpay_subscription_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.razorpay_subscription_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.razorpay_webhook_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.razorpay_subscription_attempts FROM anon, authenticated;
REVOKE ALL ON TABLE public.razorpay_subscription_payments FROM anon, authenticated;
REVOKE ALL ON TABLE public.razorpay_webhook_events FROM anon, authenticated;
GRANT ALL ON TABLE public.razorpay_subscription_attempts TO service_role;
GRANT ALL ON TABLE public.razorpay_subscription_payments TO service_role;
GRANT ALL ON TABLE public.razorpay_webhook_events TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.restaurant_subscriptions TO service_role;
GRANT SELECT ON TABLE public.subscription_plans, public.restaurants TO service_role;

COMMIT;
