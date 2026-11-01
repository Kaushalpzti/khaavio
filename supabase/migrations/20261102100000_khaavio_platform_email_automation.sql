-- Khaavio platform transactional email automation.
-- Khaavio platform transactional email automation. No external email is sent from SQL triggers.

begin;

-- Supabase Cron invokes the dispatcher on a one-minute schedule. The actual
-- schedule is installed only after Vault secrets are configured (see docs).
create extension if not exists pg_cron;
create extension if not exists pg_net;

create table if not exists public.khaavio_email_outbox (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  template_key text not null check (template_key in (
    'trial_started',
    'subscription_activated',
    'trial_ending_reminder',
    'subscription_renewal_reminder',
    'subscription_payment_issue',
    'subscription_renewal_successful',
    'subscription_cancelled',
    'subscription_expired'
  )),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  recipient_email text not null,
  variables jsonb not null default '{}'::jsonb check (jsonb_typeof(variables) = 'object'),
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'sent', 'dead')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 6 check (max_attempts between 1 and 12),
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  lock_token uuid,
  resend_email_id text,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (char_length(event_key) between 1 and 255),
  check (char_length(recipient_email) between 3 and 254)
);

create index if not exists khaavio_email_outbox_pending_idx
  on public.khaavio_email_outbox (next_attempt_at, created_at)
  where status = 'pending';

create index if not exists khaavio_email_outbox_processing_idx
  on public.khaavio_email_outbox (locked_at)
  where status = 'processing';

alter table public.khaavio_email_outbox enable row level security;
revoke all privileges on table public.khaavio_email_outbox from public, anon, authenticated;
grant select, insert, update, delete on table public.khaavio_email_outbox to service_role;

create or replace function public.khaavio_email_local_date(
  p_timestamp timestamptz,
  p_timezone text
)
returns date
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_timezone text := coalesce(nullif(pg_catalog.btrim(p_timezone), ''), 'Asia/Kolkata');
begin
  if p_timestamp is null then
    return null;
  end if;

  begin
    return (p_timestamp at time zone v_timezone)::date;
  exception when invalid_parameter_value then
    return (p_timestamp at time zone 'Asia/Kolkata')::date;
  end;
end;
$function$;
revoke all on function public.khaavio_email_local_date(timestamptz, text)
  from public, anon, authenticated;

create or replace function public.khaavio_format_email_date(
  p_timestamp timestamptz,
  p_timezone text
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_timezone text := coalesce(nullif(pg_catalog.btrim(p_timezone), ''), 'Asia/Kolkata');
begin
  if p_timestamp is null then
    return '';
  end if;

  begin
    return pg_catalog.to_char(p_timestamp at time zone v_timezone, 'DD Mon YYYY');
  exception when invalid_parameter_value then
    return pg_catalog.to_char(p_timestamp at time zone 'Asia/Kolkata', 'DD Mon YYYY');
  end;
end;
$function$;
revoke all on function public.khaavio_format_email_date(timestamptz, text)
  from public, anon, authenticated;

-- This function is the only supported path for queuing platform email.
-- Recipient address always comes from the Khaavio account owner in auth.users,
-- never from restaurant customer/contact fields.
create or replace function public.khaavio_enqueue_platform_email(
  p_event_key text,
  p_template_key text,
  p_restaurant_id uuid,
  p_variables jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_owner_email text;
  v_owner_name text;
  v_business_name text;
  v_variables jsonb;
  v_id uuid;
begin
  if p_template_key not in (
    'trial_started',
    'subscription_activated',
    'trial_ending_reminder',
    'subscription_renewal_reminder',
    'subscription_payment_issue',
    'subscription_renewal_successful',
    'subscription_cancelled',
    'subscription_expired'
  ) then
    raise exception 'Unsupported Khaavio email template key';
  end if;

  if p_event_key is null or pg_catalog.char_length(p_event_key) not between 1 and 255 then
    raise exception 'Invalid Khaavio email event key';
  end if;

  if p_variables is not null and pg_catalog.jsonb_typeof(p_variables) <> 'object' then
    raise exception 'Khaavio email variables must be a JSON object';
  end if;

  select
    u.email,
    coalesce(nullif(pg_catalog.btrim(u.raw_user_meta_data ->> 'full_name'), ''), 'there'),
    coalesce(nullif(pg_catalog.btrim(r.name), ''), 'Your Business')
  into v_owner_email, v_owner_name, v_business_name
  from public.restaurants as r
  join auth.users as u on u.id = r.owner_id
  where r.id = p_restaurant_id
  limit 1;

  if v_owner_email is null or pg_catalog.btrim(v_owner_email) = '' then
    return null;
  end if;

  v_variables :=
    pg_catalog.jsonb_build_object(
      'OWNER_NAME', v_owner_name,
      'BUSINESS_NAME', v_business_name,
      'DASHBOARD_URL', 'https://app.khaavio.in/dashboard'
    ) || coalesce(p_variables, '{}'::jsonb);

  insert into public.khaavio_email_outbox (
    event_key,
    template_key,
    restaurant_id,
    recipient_email,
    variables
  )
  values (
    p_event_key,
    p_template_key,
    p_restaurant_id,
    pg_catalog.lower(pg_catalog.btrim(v_owner_email)),
    v_variables
  )
  on conflict (event_key) do nothing
  returning id into v_id;

  return v_id;
end;
$function$;
revoke all on function public.khaavio_enqueue_platform_email(text, text, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.khaavio_enqueue_platform_email(text, text, uuid, jsonb)
  to service_role;

-- Claim rows atomically. Expired locks are recoverable if an Edge Function
-- terminates after claiming but before recording the send result.
create or replace function public.khaavio_claim_email_outbox(p_limit integer default 20)
returns table (
  id uuid,
  event_key text,
  template_key text,
  recipient_email text,
  variables jsonb,
  attempt_count integer,
  lock_token uuid
)
language plpgsql
security definer
set search_path = ''
as $function$
begin
  update public.khaavio_email_outbox as o
  set status = 'dead',
      locked_at = null,
      lock_token = null,
      last_error = coalesce(o.last_error, 'Maximum email delivery attempts reached'),
      updated_at = pg_catalog.now()
  where o.attempt_count >= o.max_attempts
    and (
      (o.status = 'pending' and o.next_attempt_at <= pg_catalog.now())
      or (o.status = 'processing' and o.locked_at < pg_catalog.now() - interval '10 minutes')
    );

  return query
  with picked as (
    select o.id
    from public.khaavio_email_outbox as o
    where o.attempt_count < o.max_attempts
      and (
        (o.status = 'pending' and o.next_attempt_at <= pg_catalog.now())
        or (o.status = 'processing' and o.locked_at < pg_catalog.now() - interval '10 minutes')
      )
    order by o.next_attempt_at, o.created_at
    limit greatest(1, least(coalesce(p_limit, 20), 50))
    for update skip locked
  )
  update public.khaavio_email_outbox as o
  set status = 'processing',
      attempt_count = o.attempt_count + 1,
      locked_at = pg_catalog.now(),
      lock_token = pg_catalog.gen_random_uuid(),
      updated_at = pg_catalog.now()
  from picked
  where o.id = picked.id
  returning
    o.id,
    o.event_key,
    o.template_key,
    o.recipient_email,
    o.variables,
    o.attempt_count,
    o.lock_token;
end;
$function$;
revoke all on function public.khaavio_claim_email_outbox(integer)
  from public, anon, authenticated;
grant execute on function public.khaavio_claim_email_outbox(integer)
  to service_role;

create or replace function public.khaavio_finish_email_outbox(
  p_id uuid,
  p_lock_token uuid,
  p_success boolean,
  p_resend_email_id text default null,
  p_error text default null,
  p_retry_after_seconds integer default 300
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_updated integer;
  v_retry_seconds integer := greatest(60, least(coalesce(p_retry_after_seconds, 300), 21600));
begin
  update public.khaavio_email_outbox as o
  set status = case
        when p_success then 'sent'
        when o.attempt_count >= o.max_attempts then 'dead'
        else 'pending'
      end,
      resend_email_id = case when p_success then p_resend_email_id else o.resend_email_id end,
      sent_at = case when p_success then pg_catalog.now() else o.sent_at end,
      last_error = case when p_success then null else left(coalesce(p_error, 'Email delivery failed'), 1000) end,
      next_attempt_at = case
        when p_success then o.next_attempt_at
        else pg_catalog.now() + pg_catalog.make_interval(secs => v_retry_seconds)
      end,
      locked_at = null,
      lock_token = null,
      updated_at = pg_catalog.now()
  where o.id = p_id
    and o.lock_token = p_lock_token
    and o.status = 'processing';

  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$function$;
revoke all on function public.khaavio_finish_email_outbox(uuid, uuid, boolean, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.khaavio_finish_email_outbox(uuid, uuid, boolean, text, text, integer)
  to service_role;

create or replace function public.khaavio_queue_trial_started_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_timezone text;
begin
  if new.plan_key <> 'trial' or new.status <> 'trialing' then
    return new;
  end if;

  select r.timezone into v_timezone
  from public.restaurants as r
  where r.id = new.restaurant_id;

  perform public.khaavio_enqueue_platform_email(
    'trial-started:' || new.id::text,
    'trial_started',
    new.restaurant_id,
    pg_catalog.jsonb_build_object(
      'TRIAL_START_DATE', public.khaavio_format_email_date(new.starts_at, v_timezone),
      'TRIAL_END_DATE', public.khaavio_format_email_date(new.ends_at, v_timezone)
    )
  );

  return new;
end;
$function$;
revoke all on function public.khaavio_queue_trial_started_email()
  from public, anon, authenticated;

drop trigger if exists trg_khaavio_queue_trial_started_email on public.restaurant_subscriptions;
create trigger trg_khaavio_queue_trial_started_email
  after insert on public.restaurant_subscriptions
  for each row execute function public.khaavio_queue_trial_started_email();

create or replace function public.khaavio_queue_subscription_state_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_plan_name text;
  v_billing_interval text;
  v_timezone text;
  v_event_key text;
  v_variables jsonb;
begin
  if new.status is distinct from old.status and new.status = 'past_due' then
    select sp.name, sp.billing_interval, r.timezone
      into v_plan_name, v_billing_interval, v_timezone
    from public.restaurants as r
    left join public.subscription_plans as sp on sp.plan_key = new.plan_key
    where r.id = new.restaurant_id;

    perform public.khaavio_enqueue_platform_email(
      'subscription-payment-issue:' || new.id::text || ':' || pg_catalog.to_char(new.updated_at, 'YYYYMMDDHH24MISSUS'),
      'subscription_payment_issue',
      new.restaurant_id,
      pg_catalog.jsonb_build_object(
        'PLAN_NAME', coalesce(v_plan_name, new.plan_key),
        'BILLING_INTERVAL', case
          when v_billing_interval = 'yearly' then 'Yearly'
          when v_billing_interval = 'monthly' then 'Monthly'
          else 'Trial'
        end,
        'ISSUE_DATE', public.khaavio_format_email_date(pg_catalog.now(), v_timezone)
      )
    );

  elsif (
    (new.status is distinct from old.status and new.status = 'cancelled')
    or (coalesce(new.cancel_at_period_end, false) is true and coalesce(old.cancel_at_period_end, false) is false)
  ) then
    select sp.name, r.timezone
      into v_plan_name, v_timezone
    from public.restaurants as r
    left join public.subscription_plans as sp on sp.plan_key = new.plan_key
    where r.id = new.restaurant_id;

    v_event_key := 'subscription-cancelled:' || new.id::text || ':' ||
      pg_catalog.to_char(coalesce(new.ends_at, new.updated_at), 'YYYYMMDDHH24MISS');

    perform public.khaavio_enqueue_platform_email(
      v_event_key,
      'subscription_cancelled',
      new.restaurant_id,
      pg_catalog.jsonb_build_object(
        'PLAN_NAME', coalesce(v_plan_name, new.plan_key),
        'CANCELLATION_DATE', public.khaavio_format_email_date(pg_catalog.now(), v_timezone),
        'ACCESS_END_DATE', public.khaavio_format_email_date(
          case
            when new.status = 'cancelled' and coalesce(new.cancel_at_period_end, false) is false
              then pg_catalog.now()
            else coalesce(new.ends_at, pg_catalog.now())
          end,
          v_timezone
        )
      )
    );

  elsif new.status is distinct from old.status and new.status = 'expired' then
    select sp.name, r.timezone
      into v_plan_name, v_timezone
    from public.restaurants as r
    left join public.subscription_plans as sp on sp.plan_key = new.plan_key
    where r.id = new.restaurant_id;

    perform public.khaavio_enqueue_platform_email(
      'subscription-expired:' || new.id::text || ':' ||
        pg_catalog.to_char(coalesce(new.ends_at, new.updated_at), 'YYYYMMDDHH24MISS'),
      'subscription_expired',
      new.restaurant_id,
      pg_catalog.jsonb_build_object(
        'PLAN_NAME', coalesce(v_plan_name, new.plan_key),
        'EXPIRY_DATE', public.khaavio_format_email_date(coalesce(new.ends_at, pg_catalog.now()), v_timezone)
      )
    );
  end if;

  return new;
end;
$function$;
revoke all on function public.khaavio_queue_subscription_state_email()
  from public, anon, authenticated;

drop trigger if exists trg_khaavio_queue_subscription_state_email on public.restaurant_subscriptions;
create trigger trg_khaavio_queue_subscription_state_email
  after update of status, cancel_at_period_end on public.restaurant_subscriptions
  for each row execute function public.khaavio_queue_subscription_state_email();

create or replace function public.khaavio_queue_due_platform_email_events()
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_row record;
  v_days integer;
  v_queued integer := 0;
  v_expired integer := 0;
  v_id uuid;
begin
  -- Expire subscriptions whose access period has actually ended. The state
  -- trigger above queues the matching expiry email in the same transaction.
  update public.restaurant_subscriptions as s
  set status = 'expired',
      updated_at = pg_catalog.now()
  where s.status in ('trialing', 'active', 'past_due')
    and s.ends_at is not null
    and s.ends_at <= pg_catalog.now();

  get diagnostics v_expired = row_count;

  -- Trial reminders on the local calendar dates two days and one day before end.
  for v_row in
    select
      s.id,
      s.restaurant_id,
      s.starts_at,
      s.ends_at,
      s.plan_key,
      sp.name as plan_name,
      r.timezone
    from public.restaurant_subscriptions as s
    join public.restaurants as r on r.id = s.restaurant_id
    left join public.subscription_plans as sp on sp.plan_key = s.plan_key
    where s.status = 'trialing'
      and s.plan_key = 'trial'
      and s.ends_at > pg_catalog.now()
      and (
        public.khaavio_email_local_date(s.ends_at, r.timezone)
        - public.khaavio_email_local_date(pg_catalog.now(), r.timezone)
      ) in (1, 2)
  loop
    v_days :=
      public.khaavio_email_local_date(v_row.ends_at, v_row.timezone)
      - public.khaavio_email_local_date(pg_catalog.now(), v_row.timezone);

    v_id := public.khaavio_enqueue_platform_email(
      'trial-ending:' || v_row.id::text || ':' || v_days::text || ':' ||
        pg_catalog.to_char(v_row.ends_at, 'YYYYMMDD'),
      'trial_ending_reminder',
      v_row.restaurant_id,
      pg_catalog.jsonb_build_object(
        'DAYS_REMAINING', case when v_days = 1 then '1 day' else '2 days' end,
        'TRIAL_END_DATE', public.khaavio_format_email_date(v_row.ends_at, v_row.timezone)
      )
    );

    if v_id is not null then
      v_queued := v_queued + 1;
    end if;
  end loop;

  -- Paid-plan reminders three local calendar days before the period ends.
  -- A period-end cancellation is deliberately excluded.
  for v_row in
    select
      s.id,
      s.restaurant_id,
      s.ends_at,
      s.plan_key,
      sp.name as plan_name,
      sp.billing_interval,
      r.timezone
    from public.restaurant_subscriptions as s
    join public.restaurants as r on r.id = s.restaurant_id
    left join public.subscription_plans as sp on sp.plan_key = s.plan_key
    where s.status = 'active'
      and s.plan_key <> 'trial'
      and coalesce(s.cancel_at_period_end, false) is false
      and s.ends_at > pg_catalog.now()
      and (
        public.khaavio_email_local_date(s.ends_at, r.timezone)
        - public.khaavio_email_local_date(pg_catalog.now(), r.timezone)
      ) = 3
  loop
    v_id := public.khaavio_enqueue_platform_email(
      'subscription-renewal-reminder:' || v_row.id::text || ':' ||
        pg_catalog.to_char(v_row.ends_at, 'YYYYMMDD'),
      'subscription_renewal_reminder',
      v_row.restaurant_id,
      pg_catalog.jsonb_build_object(
        'PLAN_NAME', coalesce(v_row.plan_name, v_row.plan_key),
        'BILLING_INTERVAL', case
          when v_row.billing_interval = 'yearly' then 'Yearly'
          else 'Monthly'
        end,
        'DAYS_REMAINING', '3 days',
        'RENEWAL_DATE', public.khaavio_format_email_date(v_row.ends_at, v_row.timezone)
      )
    );

    if v_id is not null then
      v_queued := v_queued + 1;
    end if;
  end loop;

  return v_queued + v_expired;
end;
$function$;
revoke all on function public.khaavio_queue_due_platform_email_events()
  from public, anon, authenticated;
grant execute on function public.khaavio_queue_due_platform_email_events()
  to service_role;

commit;
