-- Khaavio public menu read path and protected platform billing snapshot.
-- Apply only after reviewing; this file intentionally does not deploy itself.
BEGIN;

-- Return a narrow snapshot only for a published restaurant. This avoids granting
-- anonymous clients direct SELECT access to the private restaurants table.
CREATE OR REPLACE FUNCTION public.khaavio_public_restaurant_menu(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_restaurant jsonb;
  v_restaurant_id uuid;
  v_categories jsonb;
  v_items jsonb;
BEGIN
  IF p_slug IS NULL
     OR pg_catalog.btrim(p_slug) = ''
     OR pg_catalog.char_length(p_slug) > 160 THEN
    RETURN NULL;
  END IF;

  -- Convert the source row to JSON so the public function remains compatible
  -- if an optional branding column is absent in an older schema. The returned
  -- payload below is still explicitly allowlisted field-by-field.
  SELECT pg_catalog.to_jsonb(r)
  INTO v_restaurant
  FROM public.restaurants AS r
  WHERE r.slug = pg_catalog.btrim(p_slug)
    AND r.is_published IS TRUE
  LIMIT 1;

  IF v_restaurant IS NULL THEN
    RETURN NULL;
  END IF;

  v_restaurant_id := (v_restaurant ->> 'id')::uuid;

  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', c.id,
        'name', c.name,
        'restaurant_id', c.restaurant_id
      ) ORDER BY c.name ASC
    ),
    '[]'::jsonb
  )
  INTO v_categories
  FROM public.menu_categories AS c
  WHERE c.restaurant_id = v_restaurant_id;

  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', m.id,
        'name', m.name,
        'description', m.description,
        'price', m.price,
        'image_url', m.image_url,
        'is_available', m.is_available,
        'category_id', m.category_id
      ) ORDER BY m.name ASC
    ),
    '[]'::jsonb
  )
  INTO v_items
  FROM public.menu_items AS m
  WHERE m.restaurant_id = v_restaurant_id
    AND m.is_available IS TRUE;

  RETURN pg_catalog.jsonb_build_object(
    'restaurant',
    pg_catalog.jsonb_build_object(
      'id', v_restaurant -> 'id',
      'name', v_restaurant -> 'name',
      'slug', v_restaurant -> 'slug',
      'restaurant_type', v_restaurant -> 'restaurant_type',
      'address', v_restaurant -> 'address',
      'google_review_url', v_restaurant -> 'google_review_url',
      'is_published', v_restaurant -> 'is_published',
      'is_accepting_orders', v_restaurant -> 'is_accepting_orders',
      'business_hours', v_restaurant -> 'business_hours',
      'timezone', v_restaurant -> 'timezone',
      'logo_url', v_restaurant.logo_url
    ),
    'categories', COALESCE(v_categories, '[]'::jsonb),
    'items', COALESCE(v_items, '[]'::jsonb)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.khaavio_public_restaurant_menu(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.khaavio_public_restaurant_menu(text) TO anon, authenticated;

-- Private Razorpay ledger stays inaccessible to browser table queries. The
-- control app receives only this allowlist-protected, read-only summary.
CREATE OR REPLACE FUNCTION public.platform_admin_razorpay_billing_snapshot()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_payments jsonb;
  v_webhooks jsonb;
BEGIN
  IF v_user_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.platform_admins AS pa
    WHERE pa.user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Platform admin access required.' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'restaurant_id', rows.restaurant_id,
        'restaurant_name', rows.restaurant_name,
        'restaurant_slug', rows.restaurant_slug,
        'plan_key', rows.plan_key,
        'plan_name', rows.plan_name,
        'amount_inr', rows.amount_inr,
        'billing_interval', rows.billing_interval,
        'attempt_status', rows.attempt_status,
        'attempt_created_at', rows.attempt_created_at,
        'attempt_updated_at', rows.attempt_updated_at,
        'verified_at', rows.verified_at,
        'razorpay_subscription_id', rows.razorpay_subscription_id,
        'razorpay_payment_id', rows.razorpay_payment_id,
        'payment_status', rows.payment_status,
        'payment_amount_inr', rows.payment_amount_inr,
        'currency', rows.currency,
        'paid_at', rows.paid_at,
        'subscription_status', rows.subscription_status,
        'subscription_starts_at', rows.subscription_starts_at,
        'subscription_ends_at', rows.subscription_ends_at,
        'cancel_at_period_end', rows.cancel_at_period_end,
        'payment_provider', rows.payment_provider
      ) ORDER BY rows.attempt_created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_payments
  FROM (
    SELECT
      a.restaurant_id,
      r.name::text AS restaurant_name,
      r.slug::text AS restaurant_slug,
      a.plan_key,
      sp.name::text AS plan_name,
      a.amount_inr,
      a.billing_interval,
      a.status::text AS attempt_status,
      a.created_at AS attempt_created_at,
      a.updated_at AS attempt_updated_at,
      a.verified_at,
      COALESCE(a.razorpay_subscription_id, rs.razorpay_subscription_id) AS razorpay_subscription_id,
      COALESCE(p.razorpay_payment_id, a.razorpay_payment_id, rs.razorpay_payment_id) AS razorpay_payment_id,
      p.payment_status,
      CASE WHEN p.amount_paise IS NOT NULL THEN p.amount_paise::numeric / 100 ELSE NULL END AS payment_amount_inr,
      p.currency,
      p.paid_at,
      rs.status::text AS subscription_status,
      rs.starts_at AS subscription_starts_at,
      rs.ends_at AS subscription_ends_at,
      COALESCE(rs.cancel_at_period_end, false) AS cancel_at_period_end,
      COALESCE(rs.payment_provider, 'razorpay') AS payment_provider
    FROM public.razorpay_subscription_attempts AS a
    JOIN public.restaurants AS r ON r.id = a.restaurant_id
    LEFT JOIN public.subscription_plans AS sp ON sp.plan_key = a.plan_key
    LEFT JOIN public.restaurant_subscriptions AS rs ON rs.restaurant_id = a.restaurant_id
    LEFT JOIN LATERAL (
      SELECT pay.razorpay_payment_id, pay.payment_status, pay.amount_paise, pay.currency, pay.paid_at
      FROM public.razorpay_subscription_payments AS pay
      WHERE pay.attempt_id = a.id
      ORDER BY pay.paid_at DESC NULLS LAST, pay.created_at DESC
      LIMIT 1
    ) AS p ON true
    ORDER BY a.created_at DESC
    LIMIT 100
  ) AS rows;

  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'event_type', wh.event_type,
        'processing_status', wh.processing_status,
        'received_at', wh.received_at,
        'processed_at', wh.processed_at,
        'error_summary',
          CASE WHEN wh.processing_status = 'failed'
            THEN 'Webhook processing failed. Inspect protected server logs for details.'
            ELSE NULL
          END
      ) ORDER BY wh.received_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_webhooks
  FROM (
    SELECT event_type, processing_status, received_at, processed_at
    FROM public.razorpay_webhook_events
    ORDER BY received_at DESC
    LIMIT 50
  ) AS wh;

  RETURN pg_catalog.jsonb_build_object(
    'payments', COALESCE(v_payments, '[]'::jsonb),
    'webhooks', COALESCE(v_webhooks, '[]'::jsonb),
    'generated_at', pg_catalog.now()
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.platform_admin_razorpay_billing_snapshot() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_admin_razorpay_billing_snapshot() TO authenticated;

COMMIT;
