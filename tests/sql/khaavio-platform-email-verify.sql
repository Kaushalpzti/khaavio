-- Exercise trial, reminder, cancellation, past_due and expiry events.
do $verify$
declare
  v_subscription_id uuid := '30000000-0000-4000-8000-000000000003';
  v_owner_id uuid := '10000000-0000-4000-8000-000000000001';
  v_restaurant_id uuid := '20000000-0000-4000-8000-000000000002';
  v_count integer;
  v_local_day date := public.khaavio_email_local_date(now(), 'Asia/Kolkata');
begin
  insert into auth.users (id, email, raw_user_meta_data)
  values (v_owner_id, 'owner@example.test', '{"full_name":"Test Owner"}'::jsonb);

  insert into public.restaurants (id, owner_id, name, timezone)
  values (v_restaurant_id, v_owner_id, 'Test Cafe', 'Asia/Kolkata');

  insert into public.subscription_plans (plan_key, name, billing_interval, is_active, duration_days)
  values
    ('trial', 'Trial', null, true, 7),
    ('starter', 'Starter', 'monthly', true, 30);

  insert into public.restaurant_subscriptions (
    id, restaurant_id, plan_key, status, starts_at, ends_at
  ) values (
    v_subscription_id,
    v_restaurant_id,
    'trial',
    'trialing',
    now(),
    ((v_local_day + 2)::timestamp + time '18:00') at time zone 'Asia/Kolkata'
  );

  select count(*) into v_count
  from public.khaavio_email_outbox
  where template_key = 'trial_started'
    and recipient_email = 'owner@example.test';
  if v_count <> 1 then
    raise exception 'Expected exactly one owner-only trial_started email, found %', v_count;
  end if;

  perform public.khaavio_queue_due_platform_email_events();
  perform public.khaavio_queue_due_platform_email_events();

  select count(*) into v_count
  from public.khaavio_email_outbox
  where template_key = 'trial_ending_reminder';
  if v_count <> 1 then
    raise exception 'Expected one idempotent 2-day trial reminder, found %', v_count;
  end if;

  update public.restaurant_subscriptions
  set plan_key = 'starter',
      status = 'active',
      starts_at = now(),
      ends_at = ((v_local_day + 3)::timestamp + time '18:00') at time zone 'Asia/Kolkata',
      cancel_at_period_end = false
  where id = v_subscription_id;

  perform public.khaavio_queue_due_platform_email_events();
  perform public.khaavio_queue_due_platform_email_events();

  select count(*) into v_count
  from public.khaavio_email_outbox
  where template_key = 'subscription_renewal_reminder';
  if v_count <> 1 then
    raise exception 'Expected one 3-day paid-plan renewal reminder, found %', v_count;
  end if;

  update public.restaurant_subscriptions
  set cancel_at_period_end = true
  where id = v_subscription_id;

  select count(*) into v_count
  from public.khaavio_email_outbox
  where template_key = 'subscription_cancelled';
  if v_count <> 1 then
    raise exception 'Expected one cancellation confirmation, found %', v_count;
  end if;

  perform public.khaavio_queue_due_platform_email_events();
  select count(*) into v_count
  from public.khaavio_email_outbox
  where template_key = 'subscription_renewal_reminder';
  if v_count <> 1 then
    raise exception 'Cancelled paid plan must not receive another renewal reminder';
  end if;

  update public.restaurant_subscriptions
  set status = 'past_due'
  where id = v_subscription_id;

  select count(*) into v_count
  from public.khaavio_email_outbox
  where template_key = 'subscription_payment_issue';
  if v_count <> 1 then
    raise exception 'Expected one past_due payment issue email, found %', v_count;
  end if;

  update public.restaurant_subscriptions
  set ends_at = now() - interval '1 minute'
  where id = v_subscription_id;

  perform public.khaavio_queue_due_platform_email_events();

  select count(*) into v_count
  from public.khaavio_email_outbox
  where template_key = 'subscription_expired';
  if v_count <> 1 then
    raise exception 'Expected one expiry email after access period ended, found %', v_count;
  end if;

  raise notice 'PASS: trial, reminders, cancellation, past_due, expiry, and owner-recipient checks';
end;
$verify$;
