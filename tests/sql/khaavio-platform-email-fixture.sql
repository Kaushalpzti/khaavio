-- Minimal PostgreSQL fixture for compiling the Khaavio email automation migration.
do $roles$
begin
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end;
$roles$;

create schema if not exists auth;

create table auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb
);

create table public.restaurants (
  id uuid primary key,
  owner_id uuid not null references auth.users(id),
  name text not null,
  timezone text
);

create table public.subscription_plans (
  plan_key text primary key,
  name text not null,
  billing_interval text,
  is_active boolean not null default true,
  duration_days integer
);

create table public.restaurant_subscriptions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null unique references public.restaurants(id),
  plan_key text not null,
  status text not null,
  starts_at timestamptz,
  ends_at timestamptz,
  cancel_at_period_end boolean not null default false,
  updated_at timestamptz not null default now()
);
