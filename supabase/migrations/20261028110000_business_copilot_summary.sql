-- Restaurant Business Copilot: Growth-gated, owner-scoped, aggregated insights only.
-- Does not add raw customer exports or cross-restaurant access.
BEGIN;

UPDATE public.subscription_plans sp
SET limits = COALESCE(sp.limits, '{}'::jsonb) || jsonb_build_object(
      'feature_flags',
      COALESCE(sp.limits -> 'feature_flags', '{}'::jsonb) || jsonb_build_object('business_copilot', false)
    ),
    updated_at = pg_catalog.now()
WHERE sp.plan_key IN ('starter', 'starter_yearly');

UPDATE public.subscription_plans sp
SET limits = COALESCE(sp.limits, '{}'::jsonb) || jsonb_build_object(
      'feature_flags',
      COALESCE(sp.limits -> 'feature_flags', '{}'::jsonb) || jsonb_build_object('business_copilot', true)
    ),
    features = CASE
      WHEN COALESCE(sp.features, '[]'::jsonb) @> '["AI Business Copilot for restaurant sales and operations insights (usage limits apply)"]'::jsonb
        THEN sp.features
      ELSE COALESCE(sp.features, '[]'::jsonb) || jsonb_build_array('AI Business Copilot for restaurant sales and operations insights (usage limits apply)')
    END,
    updated_at = pg_catalog.now()
WHERE sp.plan_key IN ('growth', 'growth_yearly', 'trial', 'pilot', 'pro');

CREATE OR REPLACE FUNCTION public.khaavio_plan_has_feature(
  p_restaurant_id uuid,
  p_feature_key text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_plan_key text;
  v_limits jsonb;
  v_flag_text text;
BEGIN
  IF p_restaurant_id IS NULL OR p_feature_key IS NULL THEN
    RETURN false;
  END IF;

  IF p_feature_key NOT IN (
    'menu_management', 'restaurant_qr', 'table_qr', 'qr_ordering',
    'kitchen_display', 'order_tracking', 'receipts', 'bookings_basic',
    'booking_advanced', 'booking_export', 'analytics_basic',
    'analytics_advanced', 'business_hours', 'pause_orders', 'priority_support',
    'loyalty_rewards', 'private_feedback', 'google_review_link',
    'ai_menu_assistant', 'voice_alerts_advanced', 'business_copilot'
  ) THEN
    RETURN false;
  END IF;

  SELECT rs.plan_key, sp.limits
    INTO v_plan_key, v_limits
  FROM public.restaurant_subscriptions rs
  JOIN public.subscription_plans sp ON sp.plan_key = rs.plan_key
  WHERE rs.restaurant_id = p_restaurant_id
    AND rs.status IN ('active', 'trialing')
    AND rs.starts_at <= pg_catalog.now()
    AND (
      (rs.plan_key = 'pilot' AND rs.status = 'active' AND rs.ends_at IS NULL)
      OR (rs.ends_at IS NOT NULL AND rs.ends_at > pg_catalog.now())
    )
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  v_flag_text := v_limits #>> ARRAY['feature_flags', p_feature_key];
  IF v_flag_text IS NOT NULL THEN
    RETURN v_flag_text = 'true';
  END IF;

  IF v_plan_key IN ('pilot', 'trial', 'pro', 'growth', 'growth_yearly') THEN
    RETURN true;
  END IF;

  IF v_plan_key IN ('starter', 'starter_yearly') THEN
    RETURN p_feature_key IN (
      'menu_management', 'restaurant_qr', 'table_qr', 'qr_ordering',
      'kitchen_display', 'order_tracking', 'receipts', 'bookings_basic',
      'analytics_basic', 'business_hours', 'pause_orders', 'google_review_link'
    );
  END IF;

  RETURN false;
END;
$function$;

REVOKE ALL ON FUNCTION public.khaavio_plan_has_feature(uuid, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.khaavio_business_copilot_summary(
  p_restaurant_id uuid,
  p_days integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_restaurant_name text;
  v_now timestamptz := pg_catalog.now();
  v_current_start timestamptz;
  v_previous_start timestamptz;
  v_current_orders integer := 0;
  v_current_completed_orders integer := 0;
  v_current_cancelled_orders integer := 0;
  v_current_sales numeric(12,2) := 0;
  v_current_average_order_value numeric(12,2) := 0;
  v_previous_orders integer := 0;
  v_previous_completed_orders integer := 0;
  v_previous_cancelled_orders integer := 0;
  v_previous_sales numeric(12,2) := 0;
  v_previous_average_order_value numeric(12,2) := 0;
  v_repeat_customers integer := 0;
  v_upcoming_bookings integer := 0;
  v_top_dishes jsonb := '[]'::jsonb;
  v_peak_hours jsonb := '[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication is required for Business Copilot.'
      USING ERRCODE = '42501';
  END IF;

  IF p_restaurant_id IS NULL THEN
    RAISE EXCEPTION 'Choose a restaurant workspace.'
      USING ERRCODE = '22023';
  END IF;

  IF p_days NOT IN (7, 30, 90) THEN
    RAISE EXCEPTION 'Choose a supported reporting period: 7, 30 or 90 days.'
      USING ERRCODE = '22023';
  END IF;

  SELECT r.name
    INTO v_restaurant_name
  FROM public.restaurants r
  WHERE r.id = p_restaurant_id
    AND r.owner_id = (SELECT auth.uid())
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'You do not have access to this restaurant workspace.'
      USING ERRCODE = '42501';
  END IF;

  IF public.khaavio_plan_has_feature(p_restaurant_id, 'business_copilot') IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'KHAAVIO_PLAN_ACCESS_REQUIRED: AI Business Copilot is available on Growth or an eligible trial.'
      USING ERRCODE = '42501';
  END IF;

  v_current_start := v_now - (p_days * interval '1 day');
  v_previous_start := v_now - ((p_days * 2) * interval '1 day');

  SELECT
    count(*)::integer,
    count(*) FILTER (WHERE o.status = 'completed')::integer,
    count(*) FILTER (WHERE o.status = 'cancelled')::integer,
    COALESCE(sum(o.total_amount) FILTER (WHERE o.status = 'completed'), 0)::numeric(12,2),
    COALESCE(pg_catalog.round(avg(o.total_amount) FILTER (WHERE o.status = 'completed'), 2), 0)::numeric(12,2)
  INTO
    v_current_orders, v_current_completed_orders, v_current_cancelled_orders,
    v_current_sales, v_current_average_order_value
  FROM public.orders o
  WHERE o.restaurant_id = p_restaurant_id
    AND o.created_at >= v_current_start
    AND o.created_at <= v_now;

  SELECT
    count(*)::integer,
    count(*) FILTER (WHERE o.status = 'completed')::integer,
    count(*) FILTER (WHERE o.status = 'cancelled')::integer,
    COALESCE(sum(o.total_amount) FILTER (WHERE o.status = 'completed'), 0)::numeric(12,2),
    COALESCE(pg_catalog.round(avg(o.total_amount) FILTER (WHERE o.status = 'completed'), 2), 0)::numeric(12,2)
  INTO
    v_previous_orders, v_previous_completed_orders, v_previous_cancelled_orders,
    v_previous_sales, v_previous_average_order_value
  FROM public.orders o
  WHERE o.restaurant_id = p_restaurant_id
    AND o.created_at >= v_previous_start
    AND o.created_at < v_current_start;

  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'dish', s.item_name,
        'quantity_sold', s.quantity_sold,
        'net_sales_inr', s.net_sales_inr
      )
      ORDER BY s.quantity_sold DESC, s.net_sales_inr DESC, s.item_name
    ),
    '[]'::jsonb
  )
  INTO v_top_dishes
  FROM (
    SELECT
      oi.item_name,
      COALESCE(sum(oi.quantity), 0)::integer AS quantity_sold,
      COALESCE(sum(oi.line_total), 0)::numeric(12,2) AS net_sales_inr
    FROM public.orders o
    JOIN public.order_items oi ON oi.order_id = o.id
    WHERE o.restaurant_id = p_restaurant_id
      AND o.status = 'completed'
      AND o.created_at >= v_current_start
      AND o.created_at <= v_now
    GROUP BY oi.item_name
    ORDER BY quantity_sold DESC, net_sales_inr DESC, oi.item_name
    LIMIT 5
  ) AS s;

  -- Only the number of returning customers is returned; phone numbers never leave SQL.
  SELECT count(*)::integer
    INTO v_repeat_customers
  FROM (
    SELECT pg_catalog.regexp_replace(o.customer_phone, '[^0-9]', '', 'g') AS phone_digits
    FROM public.orders o
    WHERE o.restaurant_id = p_restaurant_id
      AND o.status = 'completed'
      AND o.created_at >= v_current_start
      AND o.created_at <= v_now
      AND o.customer_phone IS NOT NULL
      AND pg_catalog.length(pg_catalog.regexp_replace(o.customer_phone, '[^0-9]', '', 'g')) >= 8
    GROUP BY pg_catalog.regexp_replace(o.customer_phone, '[^0-9]', '', 'g')
    HAVING count(*) >= 2
  ) AS returning_customers;

  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object('hour_ist', h.hour_ist, 'completed_orders', h.completed_orders)
      ORDER BY h.completed_orders DESC, h.hour_ist
    ),
    '[]'::jsonb
  )
  INTO v_peak_hours
  FROM (
    SELECT
      extract(hour FROM (o.created_at AT TIME ZONE 'Asia/Kolkata'))::integer AS hour_ist,
      count(*)::integer AS completed_orders
    FROM public.orders o
    WHERE o.restaurant_id = p_restaurant_id
      AND o.status = 'completed'
      AND o.created_at >= v_current_start
      AND o.created_at <= v_now
    GROUP BY extract(hour FROM (o.created_at AT TIME ZONE 'Asia/Kolkata'))
    ORDER BY completed_orders DESC, hour_ist
    LIMIT 3
  ) AS h;

  SELECT count(*)::integer
    INTO v_upcoming_bookings
  FROM public.bookings b
  WHERE b.restaurant_id = p_restaurant_id
    AND b.booking_time >= v_now
    AND b.booking_time <= v_now + interval '30 days'
    AND b.status IN ('pending', 'confirmed');

  RETURN pg_catalog.jsonb_build_object(
    'restaurant_name', v_restaurant_name,
    'range_days', p_days,
    'period_start', v_current_start,
    'period_end', v_now,
    'current_period', pg_catalog.jsonb_build_object(
      'orders', v_current_orders,
      'completed_orders', v_current_completed_orders,
      'cancelled_orders', v_current_cancelled_orders,
      'completed_sales_inr', v_current_sales,
      'average_order_value_inr', v_current_average_order_value
    ),
    'previous_period', pg_catalog.jsonb_build_object(
      'orders', v_previous_orders,
      'completed_orders', v_previous_completed_orders,
      'cancelled_orders', v_previous_cancelled_orders,
      'completed_sales_inr', v_previous_sales,
      'average_order_value_inr', v_previous_average_order_value
    ),
    'repeat_customers', v_repeat_customers,
    'top_dishes', v_top_dishes,
    'peak_hours_ist', v_peak_hours,
    'upcoming_bookings_next_30_days', v_upcoming_bookings,
    'generated_at', v_now
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.khaavio_business_copilot_summary(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.khaavio_business_copilot_summary(uuid, integer) TO authenticated;

COMMIT;
