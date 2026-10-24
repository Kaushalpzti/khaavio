-- Khaavio commercial launch: canonical plans, 7-day future trials, plan entitlements.
-- Safe rollout notes:
--   * Current subscription rows and expiry dates are preserved.
--   * Existing active Pilot / legacy Pro restaurants keep their current access.
--   * New restaurants receive a 7-day trial after this migration.
--   * This does not collect payments or enable automatic renewal.
--   * New order/booking INSERTS are rejected unless the subscription and relevant
--     feature are active. Existing rows and historical data are not modified.

begin;

-- 1) Canonical launch plans and their human-readable comparison lists.
-- limits.feature_flags is the stable entitlement contract used by the app and DB.
insert into public.subscription_plans
  (plan_key, name, description, price_inr, billing_interval, duration_days, features, limits, is_active, sort_order)
values
  (
    'pilot', 'Pilot Access',
    'Legacy access for restaurants already approved for the Khaavio pilot.',
    0, 'none', null,
    '["Digital menu and menu management", "Restaurant and table QR codes", "QR table ordering and Kitchen Display", "Order tracking and receipts", "Table bookings", "Basic and enhanced analytics", "Advanced booking tools and CSV export", "Restaurant hours and pause-orders controls"]'::jsonb,
    jsonb_build_object('feature_flags', jsonb_build_object(
      'menu_management', true, 'restaurant_qr', true, 'table_qr', true,
      'qr_ordering', true, 'kitchen_display', true, 'order_tracking', true,
      'receipts', true, 'bookings_basic', true, 'booking_advanced', true,
      'booking_export', true, 'analytics_basic', true, 'analytics_advanced', true,
      'business_hours', true, 'pause_orders', true, 'priority_support', true
    )), true, 0
  ),
  (
    'trial', 'Free Trial',
    'Full access to the available Khaavio Growth feature set for 7 days. No payment is collected during the trial.',
    0, 'none', 7,
    '["Full access to all available Khaavio features for 7 days", "Digital menu and menu management", "Restaurant and table QR codes", "QR table ordering and Kitchen Display", "Order tracking and receipts", "Table bookings and advanced booking tools", "CSV export and enhanced analytics", "Restaurant hours and pause-orders controls"]'::jsonb,
    jsonb_build_object('feature_flags', jsonb_build_object(
      'menu_management', true, 'restaurant_qr', true, 'table_qr', true,
      'qr_ordering', true, 'kitchen_display', true, 'order_tracking', true,
      'receipts', true, 'bookings_basic', true, 'booking_advanced', true,
      'booking_export', true, 'analytics_basic', true, 'analytics_advanced', true,
      'business_hours', true, 'pause_orders', true, 'priority_support', true
    )), true, 1
  ),
  (
    'starter', 'Starter',
    'Core menu, QR ordering and everyday restaurant operations for a single outlet.',
    499, 'monthly', 30,
    '["Mobile-friendly digital menu and menu management", "Restaurant and table QR codes", "QR table ordering and Kitchen Display", "Order tracking and receipts", "Basic booking management", "Basic order analytics", "Restaurant hours and pause-orders controls"]'::jsonb,
    jsonb_build_object('feature_flags', jsonb_build_object(
      'menu_management', true, 'restaurant_qr', true, 'table_qr', true,
      'qr_ordering', true, 'kitchen_display', true, 'order_tracking', true,
      'receipts', true, 'bookings_basic', true, 'booking_advanced', false,
      'booking_export', false, 'analytics_basic', true, 'analytics_advanced', false,
      'business_hours', true, 'pause_orders', true, 'priority_support', false
    )), true, 2
  ),
  (
    'starter_yearly', 'Starter',
    'Starter annual plan. Founding first-year price is offered only after manual confirmation.',
    4990, 'yearly', 365,
    '["Mobile-friendly digital menu and menu management", "Restaurant and table QR codes", "QR table ordering and Kitchen Display", "Order tracking and receipts", "Basic booking management", "Basic order analytics", "Restaurant hours and pause-orders controls"]'::jsonb,
    jsonb_build_object('feature_flags', jsonb_build_object(
      'menu_management', true, 'restaurant_qr', true, 'table_qr', true,
      'qr_ordering', true, 'kitchen_display', true, 'order_tracking', true,
      'receipts', true, 'bookings_basic', true, 'booking_advanced', false,
      'booking_export', false, 'analytics_basic', true, 'analytics_advanced', false,
      'business_hours', true, 'pause_orders', true, 'priority_support', false
    )), true, 3
  ),
  (
    'growth', 'Growth',
    'Everything in Starter, plus advanced booking tools and deeper business insights.',
    899, 'monthly', 30,
    '["Everything in Starter", "Advanced booking calendar, search and date filters", "Booking CSV export", "Enhanced analytics and menu performance insights", "Priority support during the founding pilot"]'::jsonb,
    jsonb_build_object('feature_flags', jsonb_build_object(
      'menu_management', true, 'restaurant_qr', true, 'table_qr', true,
      'qr_ordering', true, 'kitchen_display', true, 'order_tracking', true,
      'receipts', true, 'bookings_basic', true, 'booking_advanced', true,
      'booking_export', true, 'analytics_basic', true, 'analytics_advanced', true,
      'business_hours', true, 'pause_orders', true, 'priority_support', true
    )), true, 4
  ),
  (
    'growth_yearly', 'Growth',
    'Growth annual plan. Founding first-year price is offered only after manual confirmation.',
    8990, 'yearly', 365,
    '["Everything in Starter", "Advanced booking calendar, search and date filters", "Booking CSV export", "Enhanced analytics and menu performance insights", "Priority support during the founding pilot"]'::jsonb,
    jsonb_build_object('feature_flags', jsonb_build_object(
      'menu_management', true, 'restaurant_qr', true, 'table_qr', true,
      'qr_ordering', true, 'kitchen_display', true, 'order_tracking', true,
      'receipts', true, 'bookings_basic', true, 'booking_advanced', true,
      'booking_export', true, 'analytics_basic', true, 'analytics_advanced', true,
      'business_hours', true, 'pause_orders', true, 'priority_support', true
    )), true, 5
  )
on conflict (plan_key) do update set
  name = excluded.name,
  description = excluded.description,
  price_inr = excluded.price_inr,
  billing_interval = excluded.billing_interval,
  duration_days = excluded.duration_days,
  features = excluded.features,
  limits = coalesce(public.subscription_plans.limits, '{}'::jsonb) || excluded.limits,
  is_active = excluded.is_active,
  sort_order = excluded.sort_order,
  updated_at = pg_catalog.now();

-- Stop selling the placeholder Pro plan. Existing subscriptions pointing to Pro
-- are retained and the entitlement helper below treats them as legacy full access.
update public.subscription_plans
set is_active = false,
    updated_at = pg_catalog.now()
where plan_key = 'pro';

-- 2) Trial assignment is already installed in this database and has been
-- verified to grant a 7-day trial with ON CONFLICT DO NOTHING.
-- Preserve the existing trigger/function rather than dropping and recreating it.
-- This avoids changing live onboarding behavior during the entitlement rollout.

-- 3) Single feature-resolution function. It requires an active subscription,
-- keeps the legacy Pilot / Pro behavior, and fails closed for unknown plan keys.
create or replace function public.khaavio_plan_has_feature(
  p_restaurant_id uuid,
  p_feature_key text
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_plan_key text;
  v_limits jsonb;
  v_flag_text text;
begin
  if p_restaurant_id is null or p_feature_key is null then
    return false;
  end if;

  if p_feature_key not in (
    'menu_management', 'restaurant_qr', 'table_qr', 'qr_ordering',
    'kitchen_display', 'order_tracking', 'receipts', 'bookings_basic',
    'booking_advanced', 'booking_export', 'analytics_basic',
    'analytics_advanced', 'business_hours', 'pause_orders', 'priority_support'
  ) then
    return false;
  end if;

  select rs.plan_key, sp.limits
    into v_plan_key, v_limits
  from public.restaurant_subscriptions rs
  join public.subscription_plans sp on sp.plan_key = rs.plan_key
  where rs.restaurant_id = p_restaurant_id
    and rs.status in ('active', 'trialing')
    and rs.starts_at <= pg_catalog.now()
    and (
      (rs.plan_key = 'pilot' and rs.status = 'active' and rs.ends_at is null)
      or (rs.ends_at is not null and rs.ends_at > pg_catalog.now())
    )
  limit 1;

  if not found then
    return false;
  end if;

  v_flag_text := v_limits #>> array['feature_flags', p_feature_key];
  if v_flag_text is not null then
    return v_flag_text = 'true';
  end if;

  if v_plan_key in ('pilot', 'trial', 'pro', 'growth', 'growth_yearly') then
    return true;
  end if;

  if v_plan_key in ('starter', 'starter_yearly') then
    return p_feature_key in (
      'menu_management', 'restaurant_qr', 'table_qr', 'qr_ordering',
      'kitchen_display', 'order_tracking', 'receipts', 'bookings_basic',
      'analytics_basic', 'business_hours', 'pause_orders'
    );
  end if;

  return false;
end;
$function$;
revoke all on function public.khaavio_plan_has_feature(uuid, text) from public, anon, authenticated;

-- 4) Enforce plan/subscription access for new order and booking rows at the DB
-- boundary as well as in the user interface. This covers RPCs that insert rows
-- without requiring us to replace their existing function definitions.
create or replace function public.khaavio_enforce_insert_entitlement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_feature_key text;
begin
  if tg_table_name = 'orders' then
    v_feature_key := 'qr_ordering';
  elsif tg_table_name = 'bookings' then
    v_feature_key := 'bookings_basic';
  else
    raise exception 'KHAAVIO_PLAN_ACCESS_GUARD_UNEXPECTED_TABLE';
  end if;

  if new.restaurant_id is null
    or not public.khaavio_plan_has_feature(new.restaurant_id, v_feature_key) then
    raise exception 'KHAAVIO_PLAN_ACCESS_REQUIRED:%', v_feature_key
      using errcode = 'P0001';
  end if;

  return new;
end;
$function$;
revoke all on function public.khaavio_enforce_insert_entitlement() from public, anon, authenticated;

-- Fail the migration rather than silently omit enforcement if this database's
-- core table names/columns differ from the schema this app uses.
do $block$
begin
  if pg_catalog.to_regclass('public.orders') is null then
    raise exception 'Khaavio plan migration stopped: public.orders was not found';
  end if;
  if pg_catalog.to_regclass('public.bookings') is null then
    raise exception 'Khaavio plan migration stopped: public.bookings was not found';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'orders' and column_name = 'restaurant_id'
  ) then
    raise exception 'Khaavio plan migration stopped: public.orders.restaurant_id was not found';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'bookings' and column_name = 'restaurant_id'
  ) then
    raise exception 'Khaavio plan migration stopped: public.bookings.restaurant_id was not found';
  end if;

  execute 'drop trigger if exists trg_khaavio_plan_entitlement on public.orders';
  execute 'create trigger trg_khaavio_plan_entitlement before insert on public.orders for each row execute function public.khaavio_enforce_insert_entitlement()';
  execute 'drop trigger if exists trg_khaavio_plan_entitlement on public.bookings';
  execute 'create trigger trg_khaavio_plan_entitlement before insert on public.bookings for each row execute function public.khaavio_enforce_insert_entitlement()';
end;
$block$;

commit;
