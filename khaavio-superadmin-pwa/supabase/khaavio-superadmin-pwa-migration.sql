-- Khaavio Control PWA: protected audit trail reader
-- This is additive: it does not modify restaurants, subscriptions, bookings, menus, or orders.
-- Run in the SAME Supabase project already used by Khaavio.

begin;

create or replace function public.platform_admin_list_audit_logs()
returns table (
  id uuid,
  admin_user_id uuid,
  restaurant_id uuid,
  restaurant_name text,
  previous_plan_key text,
  previous_status text,
  new_plan_key text,
  new_status text,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz
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
    select 1 from public.platform_admins as pa where pa.user_id = v_user_id
  ) then
    raise exception 'Platform admin access required.' using errcode = '42501';
  end if;

  return query
  select
    a.id,
    a.admin_user_id,
    a.restaurant_id,
    r.name::text,
    a.previous_plan_key,
    a.previous_status,
    a.new_plan_key,
    a.new_status,
    a.starts_at,
    a.ends_at,
    a.created_at
  from public.platform_admin_audit_logs as a
  join public.restaurants as r on r.id = a.restaurant_id
  order by a.created_at desc
  limit 100;
end;
$function$;

revoke all on function public.platform_admin_list_audit_logs() from public, anon, authenticated;
grant execute on function public.platform_admin_list_audit_logs() to authenticated;

commit;

-- Test after applying: sign in as an approved admin and call
-- supabase.rpc('platform_admin_list_audit_logs') from Khaavio Control.
-- A non-admin should receive SQLSTATE 42501.
