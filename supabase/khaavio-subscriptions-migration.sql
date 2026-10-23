-- Khaavio Subscription MVP
-- Safe rollout: existing restaurants retain access under the Pilot plan.
-- New restaurants receive a 14-day Trial record automatically.
-- Plan prices and feature limits are informational only in this MVP; no billing or feature gating is enabled.

begin;

create table if not exists public.subscription_plans (
  plan_key text primary key check (plan_key ~ '^[a-z][a-z0-9_-]{1,39}$'),
  name text not null,
  description text not null default '',
  price_inr numeric(10,2) check (price_inr is null or price_inr >= 0),
  billing_interval text not null default 'none'
    check (billing_interval in ('none', 'monthly', 'yearly', 'custom')),
  duration_days integer check (duration_days is null or duration_days > 0),
  features jsonb not null default '[]'::jsonb
    check (pg_catalog.jsonb_typeof(features) = 'array'),
  limits jsonb not null default '{}'::jsonb
    check (pg_catalog.jsonb_typeof(limits) = 'object'),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

create table if not exists public.restaurant_subscriptions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null unique
    references public.restaurants(id) on delete cascade,
  plan_key text not null references public.subscription_plans(plan_key),
  status text not null check (status in ('trialing', 'active', 'past_due', 'expired', 'cancelled')),
  starts_at timestamptz not null default pg_catalog.now(),
  ends_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  check (ends_at is null or ends_at > starts_at)
);

create index if not exists restaurant_subscriptions_status_ends_idx
  on public.restaurant_subscriptions(status, ends_at);

insert into public.subscription_plans
  (plan_key, name, description, price_inr, billing_interval, duration_days, features, limits, is_active, sort_order)
values
  (
    'pilot', 'Pilot Access',
    'Access for existing restaurants during the initial Khaavio pilot.',
    0, 'none', null,
    '["Digital menu and menu management", "Menu QR and table QR codes", "Online ordering and Kitchen Display", "Table bookings", "Order tracking, receipts and basic analytics"]'::jsonb,
    '{}'::jsonb, true, 0
  ),
  (
    'trial', 'Free Trial',
    'A 14-day trial for newly onboarded restaurants.',
    0, 'none', 14,
    '["Digital menu and menu management", "Menu QR and table QR codes", "Online ordering and Kitchen Display", "Table bookings", "Order tracking, receipts and basic analytics"]'::jsonb,
    '{}'::jsonb, true, 1
  ),
  (
    'starter', 'Starter',
    'Starter plan. Pricing and enforceable limits will be finalized before commercial launch.',
    null, 'monthly', null,
    '["Digital menu", "Table QR ordering", "Booking management", "Order tracking"]'::jsonb,
    '{}'::jsonb, true, 2
  ),
  (
    'pro', 'Pro',
    'Pro plan. Pricing and enforceable limits will be finalized before commercial launch.',
    null, 'monthly', null,
    '["All Starter features", "Advanced analytics", "Priority support"]'::jsonb,
    '{}'::jsonb, true, 3
  )
on conflict (plan_key) do nothing;

-- Keep all already-existing restaurants working while subscriptions are introduced.
insert into public.restaurant_subscriptions
  (restaurant_id, plan_key, status, starts_at, ends_at)
select r.id, 'pilot', 'active', coalesce(r.created_at, pg_catalog.now()), null
from public.restaurants r
on conflict (restaurant_id) do nothing;

alter table public.subscription_plans enable row level security;
alter table public.restaurant_subscriptions enable row level security;

-- Remove broad table grants first, then grant only the reads the UI needs.
revoke all privileges on table public.subscription_plans from public, anon, authenticated;
revoke all privileges on table public.restaurant_subscriptions from public, anon, authenticated;
grant select on table public.subscription_plans to anon, authenticated;
grant select on table public.restaurant_subscriptions to authenticated;

drop policy if exists subscription_plans_read_active on public.subscription_plans;
create policy subscription_plans_read_active
  on public.subscription_plans
  for select
  to anon, authenticated
  using (is_active is true);

drop policy if exists restaurant_subscriptions_owner_read on public.restaurant_subscriptions;
create policy restaurant_subscriptions_owner_read
  on public.restaurant_subscriptions
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.restaurants r
      where r.id = restaurant_subscriptions.restaurant_id
        and r.owner_id = (select auth.uid())
    )
  );

create or replace function public.khaavio_set_subscription_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$function$;
revoke all on function public.khaavio_set_subscription_updated_at() from public, anon, authenticated;

drop trigger if exists trg_khaavio_subscription_updated_at on public.restaurant_subscriptions;
create trigger trg_khaavio_subscription_updated_at
  before update on public.restaurant_subscriptions
  for each row execute function public.khaavio_set_subscription_updated_at();

-- Automatically create a trial record for restaurants created after this migration.
create or replace function public.khaavio_assign_trial_subscription()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  insert into public.restaurant_subscriptions
    (restaurant_id, plan_key, status, starts_at, ends_at)
  values
    (new.id, 'trial', 'trialing', pg_catalog.now(), pg_catalog.now() + interval '14 days')
  on conflict (restaurant_id) do nothing;
  return new;
end;
$function$;
revoke all on function public.khaavio_assign_trial_subscription() from public, anon, authenticated;

drop trigger if exists trg_khaavio_assign_trial_subscription on public.restaurants;
create trigger trg_khaavio_assign_trial_subscription
  after insert on public.restaurants
  for each row execute function public.khaavio_assign_trial_subscription();

commit;
