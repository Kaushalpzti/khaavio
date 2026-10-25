-- Refresh the customer-visible plan catalog to describe the currently shipped
-- Khaavio modules. This updates marketing metadata only: prices, active status,
-- entitlements/feature_flags, and existing restaurant subscriptions are untouched.
begin;

update public.subscription_plans
set
  description = case plan_key
    when 'pilot' then 'Legacy pilot access with the current Khaavio restaurant and guest tools.'
    when 'trial' then 'Explore the current Khaavio feature set for 7 days, with no payment required during the trial.'
    when 'starter' then 'Everyday ordering, guest tools and table operations for independent restaurants.'
    when 'starter_yearly' then 'Annual Starter access to everyday ordering, guest tools and table operations.'
    when 'growth' then 'Everything in Starter, plus advanced booking tools, enhanced analytics and priority support during the pilot.'
    when 'growth_yearly' then 'Annual Growth access with advanced booking tools, enhanced analytics and priority support during the pilot.'
    when 'pro' then 'Legacy Pro access for existing subscribers, including the current Khaavio feature set.'
    else description
  end,
  features = case
    when plan_key in ('starter', 'starter_yearly') then jsonb_build_array(
      'Digital menu management and restaurant/table QR codes',
      'QR ordering, customer order tracking and receipts',
      'Orders workspace and Kitchen Display',
      'Basic table-booking management',
      'Table-side service requests: waiter, water, cutlery and bill',
      'Table sessions, final bills and printable invoices',
      'Digital loyalty stamps and rewards',
      'Guest feedback and optional Google review links',
      'Ask Khaavio AI menu assistant in English, Hindi and Hinglish',
      'Basic order analytics, business hours and pause-orders controls'
    )
    when plan_key in ('growth', 'growth_yearly') then jsonb_build_array(
      'Digital menu management and restaurant/table QR codes',
      'QR ordering, customer order tracking and receipts',
      'Orders workspace and Kitchen Display',
      'Basic table-booking management',
      'Table-side service requests: waiter, water, cutlery and bill',
      'Table sessions, final bills and printable invoices',
      'Digital loyalty stamps and rewards',
      'Guest feedback and optional Google review links',
      'Ask Khaavio AI menu assistant in English, Hindi and Hinglish',
      'Basic order analytics, business hours and pause-orders controls',
      'Advanced booking calendar, search and date filters',
      'Booking CSV export',
      'Enhanced analytics and menu performance insights',
      'Priority support during the founding pilot'
    )
    when plan_key in ('pilot', 'trial', 'pro') then jsonb_build_array(
      'Digital menu management and restaurant/table QR codes',
      'QR ordering, customer order tracking and receipts',
      'Orders workspace and Kitchen Display',
      'Table-booking management and advanced booking tools',
      'Table-side service requests: waiter, water, cutlery and bill',
      'Table sessions, final bills and printable invoices',
      'Digital loyalty stamps and rewards',
      'Guest feedback and optional Google review links',
      'Ask Khaavio AI menu assistant in English, Hindi and Hinglish',
      'Basic and enhanced analytics, including menu performance insights',
      'Booking CSV export',
      'Business hours and pause-orders controls',
      'Priority support during the founding pilot'
    )
    else features
  end,
  updated_at = pg_catalog.now()
where plan_key in (
  'pilot', 'trial', 'starter', 'starter_yearly',
  'growth', 'growth_yearly', 'pro'
);

commit;
