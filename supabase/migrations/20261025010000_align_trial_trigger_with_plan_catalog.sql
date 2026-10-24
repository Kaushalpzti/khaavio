-- Align the live trial-assignment trigger with the configured plan catalog.
-- This is forward-only: it affects future restaurant inserts and does not
-- change any existing restaurant_subscriptions row or its expiry timestamp.

begin;

do $migration$
begin
  if pg_catalog.to_regclass('public.restaurants') is null then
    raise exception 'Trial trigger migration stopped: public.restaurants was not found';
  end if;
  if pg_catalog.to_regclass('public.subscription_plans') is null then
    raise exception 'Trial trigger migration stopped: public.subscription_plans was not found';
  end if;
  if pg_catalog.to_regclass('public.restaurant_subscriptions') is null then
    raise exception 'Trial trigger migration stopped: public.restaurant_subscriptions was not found';
  end if;
end;
$migration$;

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
  from public.subscription_plans as sp
  where sp.plan_key = 'trial'
    and sp.is_active is true;

  if v_trial_days is null or v_trial_days < 1 then
    raise exception 'Khaavio trial duration is not configured';
  end if;

  insert into public.restaurant_subscriptions
    (restaurant_id, plan_key, status, starts_at, ends_at)
  values
    (
      new.id,
      'trial',
      'trialing',
      v_now,
      v_now + pg_catalog.make_interval(days => v_trial_days)
    )
  on conflict (restaurant_id) do nothing;

  return new;
end;
$function$;

-- Trigger already points at this function; CREATE OR REPLACE updates its body.
-- Keep the existing least-privilege function grants intact.
revoke all on function public.khaavio_assign_trial_subscription()
  from public, anon, authenticated;

commit;
