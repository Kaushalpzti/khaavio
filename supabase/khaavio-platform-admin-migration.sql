-- Khaavio Platform Admin + Manual Subscription Assignment
-- Apply only after reviewing. This modifies the connected Supabase database.
-- It does not enable payment processing or plan-based feature gating.

begin;

create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default pg_catalog.now()
);

create table if not exists public.platform_admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references auth.users(id) on delete restrict,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  previous_plan_key text,
  previous_status text,
  new_plan_key text not null,
  new_status text not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  created_at timestamptz not null default pg_catalog.now()
);

alter table public.platform_admins enable row level security;
alter table public.platform_admin_audit_logs enable row level security;
revoke all privileges on table public.platform_admins from public, anon, authenticated;
revoke all privileges on table public.platform_admin_audit_logs from public, anon, authenticated;

create or replace function public.platform_admin_list_subscriptions()
returns table (
  restaurant_id uuid,
  restaurant_name text,
  restaurant_slug text,
  owner_id uuid,
  plan_key text,
  plan_name text,
  plan_price_inr numeric,
  billing_interval text,
  subscription_status text,
  starts_at timestamptz,
  ends_at timestamptz,
  subscription_updated_at timestamptz
)
language plpgsql
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
  select
    r.id,
    r.name::text,
    r.slug::text,
    r.owner_id,
    rs.plan_key,
    sp.name::text,
    sp.price_inr,
    sp.billing_interval::text,
    rs.status::text,
    rs.starts_at,
    rs.ends_at,
    rs.updated_at
  from public.restaurants r
  left join public.restaurant_subscriptions rs on rs.restaurant_id = r.id
  left join public.subscription_plans sp on sp.plan_key = rs.plan_key
  order by r.created_at desc nulls last, r.name asc;
end;
$function$;

create or replace function public.platform_admin_assign_plan(
  p_restaurant_id uuid,
  p_plan_key text
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_admin_id uuid := auth.uid();
  v_plan record;
  v_previous_plan_key text;
  v_previous_status text;
  v_new_status text;
  v_starts_at timestamptz := pg_catalog.now();
  v_ends_at timestamptz;
begin
  if v_admin_id is null or not exists (
    select 1 from public.platform_admins pa where pa.user_id = v_admin_id
  ) then
    raise exception 'Platform admin access required.' using errcode = '42501';
  end if;

  if p_restaurant_id is null or p_plan_key is null then
    raise exception 'Restaurant and plan are required.' using errcode = '22023';
  end if;

  select s.plan_key, s.status
    into v_previous_plan_key, v_previous_status
  from public.restaurant_subscriptions s
  where s.restaurant_id = p_restaurant_id
  for update;

  if not exists (select 1 from public.restaurants r where r.id = p_restaurant_id) then
    raise exception 'Restaurant not found.' using errcode = 'P0002';
  end if;

  select p.plan_key, p.name, p.billing_interval, p.duration_days
    into v_plan
  from public.subscription_plans p
  where p.plan_key = p_plan_key
    and p.is_active is true;

  if not found then
    raise exception 'Selected plan does not exist or is inactive.' using errcode = '22023';
  end if;

  if v_plan.plan_key = 'pilot' then
    v_new_status := 'active';
    v_ends_at := null;
  elsif v_plan.plan_key = 'trial' then
    if v_plan.duration_days is null or v_plan.duration_days < 1 then
      raise exception 'Trial plan duration is not configured.' using errcode = '22023';
    end if;
    v_new_status := 'trialing';
    v_ends_at := v_starts_at + pg_catalog.make_interval(days => v_plan.duration_days);
  elsif v_plan.billing_interval in ('monthly', 'yearly') then
    if v_plan.duration_days is null or v_plan.duration_days < 1 then
      raise exception 'Paid plan duration is not configured.' using errcode = '22023';
    end if;
    v_new_status := 'active';
    v_ends_at := v_starts_at + pg_catalog.make_interval(days => v_plan.duration_days);
  else
    raise exception 'This plan cannot be assigned by the manual activation tool.' using errcode = '22023';
  end if;

  insert into public.restaurant_subscriptions (
    restaurant_id, plan_key, status, starts_at, ends_at
  ) values (
    p_restaurant_id, v_plan.plan_key, v_new_status, v_starts_at, v_ends_at
  )
  on conflict (restaurant_id) do update set
    plan_key = excluded.plan_key,
    status = excluded.status,
    starts_at = excluded.starts_at,
    ends_at = excluded.ends_at,
    updated_at = pg_catalog.now();

  insert into public.platform_admin_audit_logs (
    admin_user_id, restaurant_id, previous_plan_key, previous_status,
    new_plan_key, new_status, starts_at, ends_at
  ) values (
    v_admin_id, p_restaurant_id, v_previous_plan_key, v_previous_status,
    v_plan.plan_key, v_new_status, v_starts_at, v_ends_at
  );
end;
$function$;

revoke all on function public.platform_admin_list_subscriptions() from public, anon, authenticated;
revoke all on function public.platform_admin_assign_plan(uuid, text) from public, anon, authenticated;
grant execute on function public.platform_admin_list_subscriptions() to authenticated;
grant execute on function public.platform_admin_assign_plan(uuid, text) to authenticated;

commit;

-- IMPORTANT BOOTSTRAP:
-- After applying this migration, add your own authenticated user as a platform admin.
-- Find your own user UUID in Supabase Dashboard > Authentication > Users, then run separately:
-- insert into public.platform_admins (user_id)
-- values ('YOUR_AUTH_USER_UUID'::uuid)
-- on conflict (user_id) do nothing;
-- The platform_admins table has no direct API grants; only the database project owner can bootstrap admins.
