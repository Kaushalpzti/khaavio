-- Minimal compile-time fixture for the guest-billing conflict migration.
-- This is intentionally not production data or a full application schema.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;

-- PL/pgSQL row-variable declarations require this table's composite type.
CREATE TABLE public.table_session_tabs (
  id uuid PRIMARY KEY,
  restaurant_id uuid,
  table_id uuid,
  session_id uuid,
  guest_tab_token uuid,
  display_name text,
  status text
);
