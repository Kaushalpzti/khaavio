-- Khaavio plan requests, manually verified activation, and canonical trial duration.
-- This migration does not collect payments. Only allowlisted platform admins can
-- record an offline payment as verified and activate a paid subscription.

begin;

-- Keep the launch promise and database behavior aligned. Updating the catalog
-- affects only future trial assignments and manual future assignments; existing
-- subscription end dates are deliberately left untouched.
update public.subscription_plans
set duration_days = 7,
    description = 'Full access to the available Khaavio Growth feature set for 7 days. No payment is collected during the trial.',
    updated_at = pg_catalog.now()
where plan_key = 'trial';

do $block$
begin
  if not exists (
    select 1
    from public.subscription_plans
    where plan_key = 'trial' and is_active is true and duration_days = 7
  ) then
    raise exception 'Khaavio renewal migration stopped: an active 7-day trial plan is required';
  end if;
  if pg_catalog.to_regclass('public.restaurants') is null then
    raise exception 'Khaavio renewal migration stopped: public.restaurants was not found';
  end if;
  if pg_catalog.to_regclass('public.restaurant_subscriptions') is null then
    raise exception 'Khaavio renewal migration stopped: public.restaurant_subscriptions was not found';
  end if;
end;
$block$;

-- The original baseline hard-coded 14 days. Use the plan catalog as the single
-- source of truth so trial duration cannot silently drift again.
create or replace function public.khaavio_assign_trial_subscription()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_trial_days integer;
  v_now timestamptz := pg_catalog.now();
begin
  select sp.duration_days
    into v_trial_days
  from public.subscription_plans sp
  where sp.plan_key = 'trial'
    and sp.is_active is true;

  if v_trial_days is null or v_trial_days < 1 then
    raise exception 'Khaavio trial duration is not configured';
  end if;

  insert into public.restaurant_subscriptions
    (restaurant_id, plan_key, status, starts_at, ends_at)
  values
    (new.id, 'trial', 'trialing', v_now, v_now + pg_catalog.make_interval(days => v_trial_days))
  on conflict (restaurant_id) do nothing;

  return new;
end;
$function$;
revoke all on function public.khaavio_assign_trial_subscription() from public, anon, authenticated;

drop trigger if exists trg_khaavio_assign_trial_subscription on public.restaurants;
create trigger trg_khaavio_assign_trial_subscription
  after insert on public.restaurants
  for each row execute function public.khaavio_assign_trial_subscription();

-- Shared database-side guards referenced by the public ordering flow. Plan
-- checks live in khaavio_plan_has_feature, while the hours helper mirrors the
-- application's weekday/open/close structure and timezone handling.
create or replace function public.khaavio_restaurant_subscription_allows_operations(
  p_restaurant_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce(public.khaavio_plan_has_feature(p_restaurant_id, 'qr_ordering'), false);
$function$;
revoke all on function public.khaavio_restaurant_subscription_allows_operations(uuid) from public, anon, authenticated;

create or replace function public.khaavio_restaurant_open_at(
  p_business_hours jsonb,
  p_timezone text,
  p_timestamp timestamptz
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_local timestamp without time zone;
  v_day_key text;
  v_day jsonb;
  v_open text;
  v_close text;
  v_open_minutes integer;
  v_close_minutes integer;
  v_current_minutes integer;
begin
  -- Match the public UI: an unset schedule does not block ordering, but a
  -- configured schedule must contain a valid open day/time range.
  if p_business_hours is null or pg_catalog.jsonb_typeof(p_business_hours) <> 'object' then
    return true;
  end if;
  if p_timestamp is null then
    return false;
  end if;

  begin
    v_local := p_timestamp at time zone coalesce(nullif(pg_catalog.btrim(p_timezone), ''), 'Asia/Kolkata');
  exception when invalid_parameter_value then
    v_local := p_timestamp at time zone 'Asia/Kolkata';
  end;

  v_day_key := case extract(dow from v_local)::integer
    when 0 then 'sunday'
    when 1 then 'monday'
    when 2 then 'tuesday'
    when 3 then 'wednesday'
    when 4 then 'thursday'
    when 5 then 'friday'
    when 6 then 'saturday'
  end;
  v_day := p_business_hours -> v_day_key;

  if v_day is null or pg_catalog.jsonb_typeof(v_day) <> 'object'
     or v_day -> 'closed' = 'true'::jsonb then
    return false;
  end if;

  v_open := v_day ->> 'open';
  v_close := v_day ->> 'close';
  if v_open is null or v_close is null
     or v_open !~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$'
     or v_close !~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$' then
    return false;
  end if;

  v_open_minutes := split_part(v_open, ':', 1)::integer * 60 + split_part(v_open, ':', 2)::integer;
  v_close_minutes := split_part(v_close, ':', 1)::integer * 60 + split_part(v_close, ':', 2)::integer;
  v_current_minutes := extract(hour from v_local)::integer * 60 + extract(minute from v_local)::integer;

  if v_open_minutes >= v_close_minutes or v_current_minutes < v_open_minutes then
    return false;
  end if;
  if v_close_minutes <> 1439 and v_current_minutes >= v_close_minutes then
    return false;
  end if;

  return true;
end;
$function$;
revoke all on function public.khaavio_restaurant_open_at(jsonb, text, timestamptz) from public, anon, authenticated;

-- Used by both the public menu and booking pages. It reveals only a boolean and
-- does not expose restaurant or subscription records to anonymous callers.
create or replace function public.khaavio_public_restaurant_can_transact(
  p_slug text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce(exists (
    select 1
    from public.restaurants r
    where r.slug = p_slug
      and r.is_published is true
      and (
        public.khaavio_plan_has_feature(r.id, 'qr_ordering')
        or public.khaavio_plan_has_feature(r.id, 'bookings_basic')
      )
  ), false);
$function$;
revoke all on function public.khaavio_public_restaurant_can_transact(text) from public, anon, authenticated;
grant execute on function public.khaavio_public_restaurant_can_transact(text) to anon, authenticated;

-- Renewal requests and manual payment verification. Keep this migration aligned
-- with the deployed schema: requested_plan_key/resolved_by/resolved_at are the
-- canonical column names used by the live RPC contract.
create table if not exists public.subscription_renewal_requests (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete restrict,
  requested_plan_key text not null references public.subscription_plans(plan_key) on delete restrict,
  billing_interval text not null check (billing_interval in ('monthly', 'yearly')),
  catalog_price_inr numeric not null check (catalog_price_inr > 0),
  founding_offer_requested boolean not null default false,
  status text not null default 'pending'
    check (status in ('pending', 'activated', 'rejected')),
  request_note text check (request_note is null or pg_catalog.char_length(request_note) <= 500),
  admin_note text check (admin_note is null or pg_catalog.char_length(admin_note) <= 1000),
  confirmed_amount_inr numeric check (confirmed_amount_inr is null or confirmed_amount_inr > 0),
  payment_reference text check (payment_reference is null or pg_catalog.char_length(payment_reference) <= 160),
  payment_verified_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  check (
    (requested_plan_key in ('starter', 'growth') and billing_interval = 'monthly')
    or (requested_plan_key in ('starter_yearly', 'growth_yearly') and billing_interval = 'yearly')
  )
);

create index if not exists subscription_renewal_requests_restaurant_created_idx
  on public.subscription_renewal_requests (restaurant_id, created_at desc);
create index if not exists subscription_renewal_requests_status_created_idx
  on public.subscription_renewal_requests (status, created_at desc);
create unique index if not exists subscription_renewal_requests_one_pending_per_restaurant_idx
  on public.subscription_renewal_requests (restaurant_id)
  where status = 'pending';
create unique index if not exists subscription_renewal_requests_unique_verified_payment_reference_idx
  on public.subscription_renewal_requests (pg_catalog.lower(pg_catalog.btrim(payment_reference)))
  where status = 'activated' and payment_reference is not null;

alter table public.subscription_renewal_requests enable row level security;
revoke all privileges on table public.subscription_renewal_requests from public, anon, authenticated;

-- Restaurant owner: submit one request for an active paid catalog plan.
create or replace function public.request_subscription_renewal(
  p_plan_key text,
  p_founding_offer_requested boolean default false,
  p_request_note text default null
)
returns table (
  request_id uuid,
  request_status text,
  catalog_price_inr numeric,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_restaurant_id uuid;
  v_plan record;
  v_request_id uuid;
  v_created_at timestamptz;
  v_note text := nullif(pg_catalog.btrim(coalesce(p_request_note, '')), '');
begin
  if v_user_id is null then
    raise exception 'Please sign in to request a subscription.' using errcode = '42501';
  end if;
  if v_note is not null and pg_catalog.char_length(v_note) > 500 then
    raise exception 'Request note must be 500 characters or fewer.' using errcode = '22023';
  end if;

  select r.id into v_restaurant_id
  from public.restaurants as r
  where r.owner_id = v_user_id
  order by r.created_at asc nulls last
  limit 1;

  if v_restaurant_id is null then
    raise exception 'No restaurant workspace is linked to this account.' using errcode = 'P0002';
  end if;

  select p.plan_key, p.name, p.price_inr, p.billing_interval, p.duration_days
    into v_plan
  from public.subscription_plans as p
  where p.plan_key = p_plan_key
    and p.is_active is true
    and p.billing_interval in ('monthly', 'yearly')
    and p.price_inr > 0;

  if not found then
    raise exception 'Select an available paid monthly or yearly plan.' using errcode = '22023';
  end if;
  if p_founding_offer_requested is true and v_plan.billing_interval <> 'yearly' then
    raise exception 'The founding offer is available for annual plans only.' using errcode = '22023';
  end if;
  if v_plan.duration_days is null or v_plan.duration_days < 1 then
    raise exception 'The selected plan is missing a valid duration.' using errcode = '22023';
  end if;

  insert into public.subscription_renewal_requests as request_row (
    restaurant_id, requested_by, requested_plan_key, billing_interval,
    catalog_price_inr, founding_offer_requested, status, request_note
  ) values (
    v_restaurant_id, v_user_id, v_plan.plan_key, v_plan.billing_interval,
    v_plan.price_inr, coalesce(p_founding_offer_requested, false), 'pending', v_note
  ) returning request_row.id, request_row.created_at
    into v_request_id, v_created_at;

  return query select v_request_id, 'pending'::text, v_plan.price_inr, v_created_at;
exception
  when unique_violation then
    raise exception 'You already have a pending subscription request. Wait for Khaavio to review it before submitting another.' using errcode = '23505';
end;
$function$;

-- Restaurant owner: read only requests for restaurants they own.
create or replace function public.get_my_subscription_renewal_requests()
returns table (
  request_id uuid,
  requested_plan_key text,
  plan_name text,
  billing_interval text,
  catalog_price_inr numeric,
  founding_offer_requested boolean,
  status text,
  request_note text,
  admin_note text,
  confirmed_amount_inr numeric,
  payment_reference text,
  payment_verified_at timestamptz,
  created_at timestamptz,
  resolved_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Please sign in to view subscription requests.' using errcode = '42501';
  end if;

  return query
  select q.id, q.requested_plan_key, p.name::text, q.billing_interval,
         q.catalog_price_inr, q.founding_offer_requested, q.status,
         q.request_note, q.admin_note, q.confirmed_amount_inr,
         q.payment_reference, q.payment_verified_at, q.created_at, q.resolved_at
  from public.subscription_renewal_requests as q
  join public.restaurants as r on r.id = q.restaurant_id
  join public.subscription_plans as p on p.plan_key = q.requested_plan_key
  where r.owner_id = v_user_id
  order by q.created_at desc
  limit 20;
end;
$function$;

-- Platform admin: read the full request queue after server-side allowlist check.
create or replace function public.platform_admin_list_renewal_requests()
returns table (
  request_id uuid,
  restaurant_id uuid,
  restaurant_name text,
  restaurant_slug text,
  requested_by uuid,
  requested_plan_key text,
  plan_name text,
  billing_interval text,
  catalog_price_inr numeric,
  founding_offer_requested boolean,
  request_status text,
  request_note text,
  admin_note text,
  confirmed_amount_inr numeric,
  payment_reference text,
  payment_verified_at timestamptz,
  created_at timestamptz,
  resolved_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null or not exists (
    select 1 from public.platform_admins pa where pa.user_id = v_user_id
  ) then
    raise exception 'Platform admin access required.' using errcode = '42501';
  end if;

  return query
  select q.id, r.id, r.name::text, r.slug::text, q.requested_by,
         q.requested_plan_key, p.name::text, q.billing_interval,
         q.catalog_price_inr, q.founding_offer_requested, q.status,
         q.request_note, q.admin_note, q.confirmed_amount_inr,
         q.payment_reference, q.payment_verified_at, q.created_at, q.resolved_at
  from public.subscription_renewal_requests as q
  join public.restaurants as r on r.id = q.restaurant_id
  join public.subscription_plans as p on p.plan_key = q.requested_plan_key
  order by (q.status = 'pending') desc, q.created_at desc;
end;
$function$;

-- Platform admin: resolve a renewal request; verified payment + activation are atomic.
create or replace function public.platform_admin_resolve_renewal_request(
  p_request_id uuid,
  p_decision text,
  p_confirmed_amount_inr numeric default null,
  p_payment_reference text default null,
  p_admin_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_admin_id uuid := auth.uid();
  v_request public.subscription_renewal_requests%rowtype;
  v_admin_note text := nullif(pg_catalog.btrim(coalesce(p_admin_note, '')), '');
  v_payment_reference text := nullif(pg_catalog.btrim(coalesce(p_payment_reference, '')), '');
begin
  if v_admin_id is null or not exists (
    select 1 from public.platform_admins as pa where pa.user_id = v_admin_id
  ) then
    raise exception 'Platform admin access required.' using errcode = '42501';
  end if;
  if p_decision is null or p_decision not in ('activate', 'reject') then
    raise exception 'Decision must be activate or reject.' using errcode = '22023';
  end if;
  if v_admin_note is not null and pg_catalog.char_length(v_admin_note) > 1000 then
    raise exception 'Admin note must be 1000 characters or fewer.' using errcode = '22023';
  end if;

  select q.* into v_request
  from public.subscription_renewal_requests as q
  where q.id = p_request_id
  for update;
  if not found then
    raise exception 'Renewal request not found.' using errcode = 'P0002';
  end if;
  if v_request.status <> 'pending' then
    raise exception 'This renewal request has already been resolved.' using errcode = '55000';
  end if;

  if p_decision = 'reject' then
    update public.subscription_renewal_requests
    set status = 'rejected', admin_note = v_admin_note,
        resolved_by = v_admin_id, resolved_at = pg_catalog.now(), updated_at = pg_catalog.now()
    where id = v_request.id;
    return;
  end if;

  if p_confirmed_amount_inr is null or p_confirmed_amount_inr <= 0
     or p_confirmed_amount_inr > v_request.catalog_price_inr then
    raise exception 'Enter the positive amount received, no greater than the catalog price. Founding discounts must be confirmed manually.' using errcode = '22023';
  end if;
  if v_payment_reference is null or pg_catalog.char_length(v_payment_reference) < 4
     or pg_catalog.char_length(v_payment_reference) > 160 then
    raise exception 'Enter the verified payment reference/UTR (4 to 160 characters).' using errcode = '22023';
  end if;

  perform public.platform_admin_assign_plan(v_request.restaurant_id, v_request.requested_plan_key);

  update public.subscription_renewal_requests
  set status = 'activated',
      confirmed_amount_inr = p_confirmed_amount_inr,
      payment_reference = v_payment_reference,
      payment_verified_at = pg_catalog.now(),
      admin_note = v_admin_note,
      resolved_by = v_admin_id,
      resolved_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
  where id = v_request.id;
end;
$function$;

revoke all on function public.request_subscription_renewal(text, boolean, text) from public, anon, authenticated;
revoke all on function public.get_my_subscription_renewal_requests() from public, anon, authenticated;
revoke all on function public.platform_admin_list_renewal_requests() from public, anon, authenticated;
revoke all on function public.platform_admin_resolve_renewal_request(uuid, text, numeric, text, text) from public, anon, authenticated;
grant execute on function public.request_subscription_renewal(text, boolean, text) to authenticated;
grant execute on function public.get_my_subscription_renewal_requests() to authenticated;
grant execute on function public.platform_admin_list_renewal_requests() to authenticated;
grant execute on function public.platform_admin_resolve_renewal_request(uuid, text, numeric, text, text) to authenticated;

commit;
