-- Durable, shared rate limiting for the public Ask Khaavio AI endpoint.
-- The table is deliberately outside PostgREST's exposed public schema.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated, service_role;

create table if not exists private.khaavio_ai_rate_limits (
  key_hash text primary key check (key_hash ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz not null,
  request_count integer not null check (request_count >= 1),
  updated_at timestamptz not null default pg_catalog.now()
);

alter table private.khaavio_ai_rate_limits enable row level security;
revoke all on table private.khaavio_ai_rate_limits from public, anon, authenticated, service_role;

create index if not exists khaavio_ai_rate_limits_updated_at_idx
  on private.khaavio_ai_rate_limits (updated_at);

create or replace function public.consume_khaavio_ai_rate_limit(
  p_key_hash text,
  p_limit integer,
  p_window_seconds integer
)
returns table (
  allowed boolean,
  remaining integer,
  reset_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_count integer;
  v_window_started_at timestamptz;
begin
  if p_key_hash is null or p_key_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid rate-limit key';
  end if;

  if p_limit is null or p_limit < 1 or p_limit > 100
     or p_window_seconds is null or p_window_seconds < 1 or p_window_seconds > 3600 then
    raise exception 'Invalid rate-limit parameters';
  end if;

  -- One atomic UPSERT serializes concurrent requests for the same identity.
  insert into private.khaavio_ai_rate_limits as existing (
    key_hash,
    window_started_at,
    request_count,
    updated_at
  )
  values (
    p_key_hash,
    v_now,
    1,
    v_now
  )
  on conflict (key_hash) do update
  set
    window_started_at = case
      when existing.window_started_at <= v_now - pg_catalog.make_interval(secs => p_window_seconds)
        then v_now
      else existing.window_started_at
    end,
    request_count = case
      when existing.window_started_at <= v_now - pg_catalog.make_interval(secs => p_window_seconds)
        then 1
      else least(existing.request_count + 1, p_limit + 1)
    end,
    updated_at = v_now
  returning request_count, window_started_at
  into v_count, v_window_started_at;

  -- Opportunistically prune inactive identities; no raw client IPs are stored.
  if pg_catalog.random() < 0.01 then
    delete from private.khaavio_ai_rate_limits
    where updated_at < v_now - interval '2 days';
  end if;

  return query
    select
      (v_count <= p_limit),
      greatest(p_limit - v_count, 0),
      v_window_started_at + pg_catalog.make_interval(secs => p_window_seconds);
end;
$function$;

-- Only the server-side Edge Function (using the service-role key) may invoke it.
revoke all on function public.consume_khaavio_ai_rate_limit(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_khaavio_ai_rate_limit(text, integer, integer)
  to service_role;
