-- Khaavio: automatic table sessions + immutable final invoice (review draft v3)
-- IMPORTANT: review and test in a staging/branch database before production.
-- Historical orders intentionally remain unassigned (session_id = NULL).
-- Session lifecycle: open -> billing (invoice issued, QR ordering blocked) -> closed (invoice paid).
-- The next QR order after payment creates a new session automatically.
-- v3 also freezes session-linked orders after billing starts and requires all
-- non-cancelled orders to be completed before the final invoice is issued.

BEGIN;

-- 1) One session represents one seating / visit at one physical restaurant table.
CREATE TABLE IF NOT EXISTS public.table_sessions (
    id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
    restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
    table_id uuid NOT NULL,
    status text NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'billing', 'closed')),
    opened_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
    closed_at timestamptz,
    closed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    CONSTRAINT table_sessions_table_scope_fkey
        FOREIGN KEY (table_id, restaurant_id)
        REFERENCES public.restaurant_tables(id, restaurant_id)
        ON DELETE RESTRICT,
    CONSTRAINT table_sessions_scope_unique
        UNIQUE (id, restaurant_id, table_id),
    CONSTRAINT table_sessions_close_state_check
        CHECK (
            (status IN ('open', 'billing') AND closed_at IS NULL)
            OR (status = 'closed' AND closed_at IS NOT NULL)
        )
);

-- At most one active lifecycle (open or awaiting invoice payment) per physical table.
DROP INDEX IF EXISTS public.table_sessions_one_open_per_table_uidx;
CREATE UNIQUE INDEX IF NOT EXISTS table_sessions_one_active_per_table_uidx
    ON public.table_sessions (restaurant_id, table_id)
    WHERE status IN ('open', 'billing');

CREATE INDEX IF NOT EXISTS table_sessions_restaurant_opened_idx
    ON public.table_sessions (restaurant_id, opened_at DESC);

-- 2) Add a nullable session reference to orders. Old orders deliberately remain NULL.
ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS session_id uuid;

DO $migration$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_constraint c
        WHERE c.conname = 'orders_session_scope_fkey'
          AND c.conrelid = 'public.orders'::regclass
    ) THEN
        ALTER TABLE public.orders
            ADD CONSTRAINT orders_session_scope_fkey
            FOREIGN KEY (session_id, restaurant_id, table_id)
            REFERENCES public.table_sessions (id, restaurant_id, table_id)
            ON DELETE RESTRICT;
    END IF;
END;
$migration$;

CREATE INDEX IF NOT EXISTS orders_session_created_idx
    ON public.orders (session_id, created_at ASC)
    WHERE session_id IS NOT NULL;

-- 2a) Protect session identity and invoice integrity from the existing broad
-- owner UPDATE policy on orders. Keep status updates available while the session
-- is open; freeze session-linked orders once invoice issuance starts.
-- The order RPC may set total_amount exactly once (0 -> sum of saved order lines).
CREATE OR REPLACE FUNCTION public.khaavio_guard_session_order_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $guard$
declare
    v_session_status text;
    v_items_total numeric(12,2);
begin
    if new.session_id is distinct from old.session_id then
        raise exception 'An order cannot be moved between table sessions.'
            using errcode = '55000';
    end if;

    -- Historical orders stay unassigned and retain existing update behavior.
    if old.session_id is null then
        return new;
    end if;

    if new.restaurant_id is distinct from old.restaurant_id
       or new.table_id is distinct from old.table_id then
        raise exception 'A session order cannot be moved to another restaurant or table.'
            using errcode = '55000';
    end if;

    -- Keep lock ordering aligned with QR order creation and invoice operations:
    -- physical table first, then session.
    perform 1
    from public.restaurant_tables rt
    where rt.id = old.table_id
      and rt.restaurant_id = old.restaurant_id
    for update;

    if not found then
        raise exception 'The order table no longer exists.';
    end if;

    select ts.status
      into v_session_status
    from public.table_sessions ts
    where ts.id = old.session_id
      and ts.restaurant_id = old.restaurant_id
      and ts.table_id = old.table_id
    for update;

    if not found then
        raise exception 'The order table session no longer exists.';
    end if;

    if v_session_status is distinct from 'open' then
        raise exception 'Orders cannot be modified after final billing has started.'
            using errcode = '55000';
    end if;

    if new.total_amount is distinct from old.total_amount then
        if old.total_amount <> 0 then
            raise exception 'The saved order total cannot be changed directly.'
                using errcode = '55000';
        end if;

        select coalesce(sum(oi.line_total), 0)::numeric(12,2)
          into v_items_total
        from public.order_items oi
        where oi.order_id = old.id;

        if new.total_amount is distinct from v_items_total then
            raise exception 'The order total must match its saved order items.'
                using errcode = '55000';
        end if;
    end if;

    return new;
end;
$guard$;

DROP TRIGGER IF EXISTS khaavio_guard_session_order_updates ON public.orders;
CREATE TRIGGER khaavio_guard_session_order_updates
    BEFORE UPDATE ON public.orders
    FOR EACH ROW
    EXECUTE FUNCTION public.khaavio_guard_session_order_update();

REVOKE ALL ON FUNCTION public.khaavio_guard_session_order_update() FROM PUBLIC, anon, authenticated;

-- 3) Final invoice header is a frozen total for the whole session.
-- Line details remain traceable through the session's individual orders/order_items.
CREATE TABLE IF NOT EXISTS public.table_session_invoices (
    id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
    restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
    table_id uuid NOT NULL,
    session_id uuid NOT NULL UNIQUE,
    invoice_number text NOT NULL UNIQUE,
    total_amount numeric(12,2) NOT NULL CHECK (total_amount >= 0),
    order_count integer NOT NULL CHECK (order_count >= 1),
    payment_status text NOT NULL DEFAULT 'unpaid'
        CHECK (payment_status IN ('unpaid', 'paid', 'void')),
    issued_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
    issued_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    paid_at timestamptz,
    payment_method text,
    CONSTRAINT table_session_invoices_session_scope_fkey
        FOREIGN KEY (session_id, restaurant_id, table_id)
        REFERENCES public.table_sessions (id, restaurant_id, table_id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS table_session_invoices_restaurant_issued_idx
    ON public.table_session_invoices (restaurant_id, issued_at DESC);

-- Snapshot invoice lines at issue time so printed bills do not depend on mutable order rows.
CREATE TABLE IF NOT EXISTS public.table_session_invoice_items (
    id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
    invoice_id uuid NOT NULL REFERENCES public.table_session_invoices(id) ON DELETE CASCADE,
    order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
    order_reference text NOT NULL,
    order_created_at timestamptz NOT NULL,
    customer_name text NOT NULL,
    item_name text NOT NULL,
    unit_price numeric(12,2) NOT NULL CHECK (unit_price >= 0),
    quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 20),
    line_total numeric(12,2) NOT NULL CHECK (line_total >= 0),
    created_at timestamptz NOT NULL DEFAULT pg_catalog.now()
);

CREATE INDEX IF NOT EXISTS table_session_invoice_items_invoice_idx
    ON public.table_session_invoice_items (invoice_id, order_created_at, order_id);

-- 4) Keep session and invoice reads restricted to the restaurant owner.
ALTER TABLE public.table_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.table_session_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.table_session_invoice_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS table_sessions_owner_read ON public.table_sessions;
CREATE POLICY table_sessions_owner_read
    ON public.table_sessions
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.restaurants r
            WHERE r.id = table_sessions.restaurant_id
              AND r.owner_id = (SELECT auth.uid())
        )
    );

DROP POLICY IF EXISTS table_session_invoices_owner_read ON public.table_session_invoices;
CREATE POLICY table_session_invoices_owner_read
    ON public.table_session_invoices
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.restaurants r
            WHERE r.id = table_session_invoices.restaurant_id
              AND r.owner_id = (SELECT auth.uid())
        )
    );

REVOKE ALL ON TABLE public.table_sessions FROM anon, authenticated;
GRANT SELECT ON TABLE public.table_sessions TO authenticated;
REVOKE ALL ON TABLE public.table_session_invoices FROM anon, authenticated;
GRANT SELECT ON TABLE public.table_session_invoices TO authenticated;

DROP POLICY IF EXISTS table_session_invoice_items_owner_read ON public.table_session_invoice_items;
CREATE POLICY table_session_invoice_items_owner_read
    ON public.table_session_invoice_items
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.table_session_invoices i
            JOIN public.restaurants r ON r.id = i.restaurant_id
            WHERE i.id = table_session_invoice_items.invoice_id
              AND r.owner_id = (SELECT auth.uid())
        )
    );
REVOKE ALL ON TABLE public.table_session_invoice_items FROM anon, authenticated;
GRANT SELECT ON TABLE public.table_session_invoice_items TO authenticated;

-- 5) Replace the public order RPC with a session-aware version.
-- Lock the physical table row first so concurrent orders for the same table
-- cannot create two active sessions or race with the final-bill action.
CREATE OR REPLACE FUNCTION public.place_public_order(
    p_slug text,
    p_table_token uuid,
    p_customer_name text,
    p_customer_phone text,
    p_notes text,
    p_items jsonb
)
RETURNS TABLE(order_id uuid, order_reference text, total_amount numeric, tracking_token uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
declare
  v_restaurant_id uuid;
  v_table_id uuid;
  v_session_id uuid;
  v_session_status text;
  v_order_id uuid;
  v_tracking_token uuid;
  v_is_accepting_orders boolean;
  v_business_hours jsonb;
  v_timezone text;
  v_customer_name text;
  v_customer_phone text;
  v_notes text;
  v_item jsonb;
  v_item_id uuid;
  v_quantity integer;
  v_menu_item record;
  v_line_total numeric(12,2);
  v_total numeric(12,2) := 0;
begin
  if p_slug is null or pg_catalog.btrim(p_slug) = '' then
    raise exception 'Invalid restaurant.';
  end if;
  if p_table_token is null then
    raise exception 'A valid table QR is required to place an order.';
  end if;

  v_customer_name := pg_catalog.btrim(p_customer_name);
  if v_customer_name is null or pg_catalog.char_length(v_customer_name) not between 1 and 80 then
    raise exception 'Enter your name (maximum 80 characters).';
  end if;
  v_customer_phone := nullif(pg_catalog.btrim(p_customer_phone), '');
  v_notes := nullif(pg_catalog.btrim(p_notes), '');
  if v_customer_phone is not null and pg_catalog.char_length(v_customer_phone) > 25 then
    raise exception 'Phone number is too long.';
  end if;
  if v_notes is not null and pg_catalog.char_length(v_notes) > 500 then
    raise exception 'Order notes must be 500 characters or fewer.';
  end if;
  if pg_catalog.jsonb_typeof(p_items) is distinct from 'array'
     or pg_catalog.jsonb_array_length(p_items) < 1
     or pg_catalog.jsonb_array_length(p_items) > 30 then
    raise exception 'Your cart must contain between 1 and 30 items.';
  end if;

  select r.id, rt.id, r.is_accepting_orders, r.business_hours, r.timezone
    into v_restaurant_id, v_table_id, v_is_accepting_orders, v_business_hours, v_timezone
  from public.restaurants r
  join public.restaurant_tables rt on rt.restaurant_id = r.id
  where r.slug = p_slug
    and r.is_published is true
    and rt.qr_token = p_table_token
    and rt.is_active is true
  limit 1
  for share of r
  for update of rt;

  if not found then
    raise exception 'This table QR is invalid, inactive, or unpublished.';
  end if;
  if not public.khaavio_restaurant_subscription_allows_operations(v_restaurant_id) then
    raise exception 'Online ordering is temporarily unavailable for this restaurant. Please contact the restaurant.' using errcode = '55000';
  end if;
  if v_is_accepting_orders is not true then
    raise exception 'This restaurant has temporarily paused online orders. Please ask the staff for assistance.';
  end if;
  if not public.khaavio_restaurant_open_at(v_business_hours, v_timezone, pg_catalog.now()) then
    raise exception 'Online ordering is currently closed. Please check the restaurant opening hours.';
  end if;

  -- Reuse an open session, but block new QR orders while its final invoice
  -- is unpaid. The table row is locked above, serializing order/finalize/pay.
  select ts.id, ts.status
    into v_session_id, v_session_status
  from public.table_sessions ts
  where ts.restaurant_id = v_restaurant_id
    and ts.table_id = v_table_id
    and ts.status IN ('open', 'billing')
  for update;

  if found then
    if v_session_status = 'billing' then
      raise exception 'The final bill is awaiting payment. Please ask restaurant staff to complete checkout before placing another order.'
        using errcode = '55000';
    end if;
  else
    insert into public.table_sessions (restaurant_id, table_id, status)
    values (v_restaurant_id, v_table_id, 'open')
    returning id into v_session_id;
  end if;

  insert into public.orders as inserted_order (
    restaurant_id, table_id, session_id, customer_name, customer_phone, notes, status, total_amount
  ) values (
    v_restaurant_id, v_table_id, v_session_id, v_customer_name, v_customer_phone, v_notes, 'pending', 0
  ) returning inserted_order.id, inserted_order.tracking_token
    into v_order_id, v_tracking_token;

  for v_item in
    select element.value from pg_catalog.jsonb_array_elements(p_items) as element(value)
  loop
    begin
      v_item_id := (v_item ->> 'item_id')::uuid;
      v_quantity := (v_item ->> 'quantity')::integer;
    exception when invalid_text_representation or numeric_value_out_of_range then
      raise exception 'A cart item has an invalid ID or quantity.';
    end;

    if v_item_id is null or v_quantity is null or v_quantity not between 1 and 20 then
      raise exception 'Each item must have a valid ID and quantity between 1 and 20.';
    end if;

    select mi.id, mi.name, mi.price, mi.is_available into v_menu_item
    from public.menu_items mi
    where mi.id = v_item_id and mi.restaurant_id = v_restaurant_id
    for share;

    if not found then
      raise exception 'A dish in your cart is no longer available.';
    end if;
    if v_menu_item.is_available is not true then
      raise exception 'The dish "%" is currently unavailable.', v_menu_item.name;
    end if;

    v_line_total := pg_catalog.round(v_menu_item.price * v_quantity, 2);
    insert into public.order_items (
      order_id, menu_item_id, item_name, unit_price, quantity, line_total
    ) values (
      v_order_id, v_menu_item.id, v_menu_item.name, v_menu_item.price, v_quantity, v_line_total
    );
    v_total := v_total + v_line_total;
  end loop;

  update public.orders set total_amount = v_total where id = v_order_id;

  return query
  select v_order_id,
    pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(v_order_id::text, '-', ''), 1, 8)),
    v_total,
    v_tracking_token;
end;
$function$;

-- 6) Issue one combined invoice. Keep the session in 'billing' state until paid,
-- preventing a new QR order from silently opening a second bill for the same guests.
-- Repeated calls return the existing invoice instead of creating duplicates.
CREATE OR REPLACE FUNCTION public.finalize_table_session(p_session_id uuid)
RETURNS TABLE (
    invoice_id uuid,
    invoice_number text,
    total_amount numeric,
    order_count integer,
    payment_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
declare
    v_restaurant_id uuid;
    v_table_id uuid;
    v_session_status text;
    v_payment_status text;
    v_invoice_id uuid;
    v_invoice_number text;
    v_total numeric(12,2);
    v_items_total numeric(12,2);
    v_order_count integer;
    v_unfinished_count integer;
begin
    if auth.uid() is null then
        raise exception 'Authentication is required to finalize a table bill.' using errcode = '42501';
    end if;
    if p_session_id is null then
        raise exception 'A table session is required.';
    end if;

    -- Verify owner access and get the physical table. Do not lock the session yet:
    -- lock order matches place_public_order (table first, session second).
    select ts.restaurant_id, ts.table_id
      into v_restaurant_id, v_table_id
    from public.table_sessions ts
    join public.restaurants r on r.id = ts.restaurant_id
    where ts.id = p_session_id
      and r.owner_id = (select auth.uid());

    if not found then
        raise exception 'Table session not found or access denied.' using errcode = '42501';
    end if;

    perform 1
    from public.restaurant_tables rt
    where rt.id = v_table_id
      and rt.restaurant_id = v_restaurant_id
    for update;

    if not found then
        raise exception 'The restaurant table no longer exists.';
    end if;

    select ts.status
      into v_session_status
    from public.table_sessions ts
    where ts.id = p_session_id
      and ts.restaurant_id = v_restaurant_id
      and ts.table_id = v_table_id
    for update;

    if not found then
        raise exception 'Table session no longer exists.';
    end if;

    -- Idempotency: if the invoice was already created, return it.
    select i.id, i.invoice_number, i.total_amount, i.order_count, i.payment_status
      into v_invoice_id, v_invoice_number, v_total, v_order_count, v_payment_status
    from public.table_session_invoices i
    where i.session_id = p_session_id;

    if found then
        return query
        select v_invoice_id, v_invoice_number, v_total, v_order_count, v_payment_status;
        return;
    end if;

    -- No invoice exists yet, so only an open session can be finalized.
    select ts.status
      into v_session_status
    from public.table_sessions ts
    where ts.id = p_session_id
      and ts.restaurant_id = v_restaurant_id
    for update;

    if v_session_status is distinct from 'open' then
        raise exception 'This table session is already closed and has no invoice.';
    end if;

    -- Prevent locking the final invoice while any non-cancelled order is still
    -- in the kitchen workflow. After issuance, session-linked orders are frozen.
    select count(*)::integer
      into v_unfinished_count
    from public.orders o
    where o.session_id = p_session_id
      and o.status not in ('completed', 'cancelled');

    if v_unfinished_count > 0 then
        raise exception 'Complete or cancel all orders before generating the final bill.'
            using errcode = '55000';
    end if;

    select count(*)::integer, coalesce(sum(o.total_amount), 0)::numeric(12,2)
      into v_order_count, v_total
    from public.orders o
    where o.session_id = p_session_id
      and o.status <> 'cancelled';

    if v_order_count < 1 then
        raise exception 'There are no billable orders in this table session.';
    end if;

    select coalesce(sum(oi.line_total), 0)::numeric(12,2)
      into v_items_total
    from public.order_items oi
    join public.orders o ON o.id = oi.order_id
    where o.session_id = p_session_id
      and o.status <> 'cancelled';

    if v_items_total <> v_total then
        raise exception 'Order totals do not match saved order items. Review the session before issuing its final invoice.';
    end if;

    v_invoice_number := 'KHV-' || pg_catalog.to_char(pg_catalog.now(), 'YYYYMMDD')
        || '-' || pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', ''), 1, 8));

    insert into public.table_session_invoices (
        restaurant_id, table_id, session_id, invoice_number,
        total_amount, order_count, payment_status, issued_by
    ) values (
        v_restaurant_id, v_table_id, p_session_id, v_invoice_number,
        v_total, v_order_count, 'unpaid', (select auth.uid())
    )
    returning id into v_invoice_id;

    insert into public.table_session_invoice_items (
        invoice_id, order_id, order_reference, order_created_at, customer_name,
        item_name, unit_price, quantity, line_total
    )
    select
        v_invoice_id,
        o.id,
        pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(o.id::text, '-', ''), 1, 8)),
        o.created_at,
        o.customer_name,
        oi.item_name,
        oi.unit_price,
        oi.quantity,
        oi.line_total
    from public.orders o
    join public.order_items oi ON oi.order_id = o.id
    where o.session_id = p_session_id
      and o.status <> 'cancelled'
    order by o.created_at, o.id, oi.created_at, oi.id;

    -- An unpaid issued invoice blocks new QR orders for this table.
    update public.table_sessions
    set status = 'billing'
    where id = p_session_id
      and restaurant_id = v_restaurant_id;

    return query
    select v_invoice_id, v_invoice_number, v_total, v_order_count, 'unpaid'::text;
end;
$function$;

REVOKE ALL ON FUNCTION public.finalize_table_session(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finalize_table_session(uuid) TO authenticated;

-- 7) Record payment for an issued final invoice. This does not alter the invoice total.
CREATE OR REPLACE FUNCTION public.mark_table_invoice_paid(
    p_invoice_id uuid,
    p_payment_method text
)
RETURNS TABLE (
    invoice_id uuid,
    invoice_number text,
    total_amount numeric,
    payment_status text,
    paid_at timestamptz,
    payment_method text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
declare
    v_restaurant_id uuid;
    v_table_id uuid;
    v_session_id uuid;
    v_status text;
    v_method text;
    v_paid_at timestamptz;
    v_invoice_number text;
    v_total numeric(12,2);
begin
    if auth.uid() is null then
        raise exception 'Authentication is required to record invoice payment.' using errcode = '42501';
    end if;
    if p_invoice_id is null then
        raise exception 'A final invoice is required.';
    end if;

    v_method := nullif(pg_catalog.btrim(p_payment_method), '');
    if v_method is null or pg_catalog.char_length(v_method) > 40 then
        raise exception 'Enter a payment method (maximum 40 characters).';
    end if;

    select i.restaurant_id, i.table_id, i.session_id
      into v_restaurant_id, v_table_id, v_session_id
    from public.table_session_invoices i
    join public.restaurants r on r.id = i.restaurant_id
    where i.id = p_invoice_id
      and r.owner_id = (select auth.uid());

    if not found then
        raise exception 'Final invoice not found or access denied.' using errcode = '42501';
    end if;

    -- Use the same table-first lock order as order placement/finalization.
    perform 1
    from public.restaurant_tables rt
    where rt.id = v_table_id
      and rt.restaurant_id = v_restaurant_id
    for update;

    if not found then
        raise exception 'The restaurant table no longer exists.';
    end if;

    select i.payment_status, i.paid_at, i.invoice_number, i.total_amount
      into v_status, v_paid_at, v_invoice_number, v_total
    from public.table_session_invoices i
    where i.id = p_invoice_id
      and i.restaurant_id = v_restaurant_id
    for update;

    if not found then
        raise exception 'Final invoice no longer exists.';
    end if;

    if v_status = 'void' then
        raise exception 'A void invoice cannot be marked as paid.';
    end if;

    if v_status <> 'paid' then
        update public.table_session_invoices i
        set payment_status = 'paid',
            paid_at = pg_catalog.now(),
            payment_method = v_method
        where i.id = p_invoice_id
          and i.restaurant_id = v_restaurant_id
        returning i.payment_status, i.paid_at, i.payment_method
          into v_status, v_paid_at, v_method;
    else
        select i.payment_method
          into v_method
        from public.table_session_invoices i
        where i.id = p_invoice_id;
    end if;

    -- Only payment completion closes the lifecycle. This is safe to retry.
    update public.table_sessions ts
    set status = 'closed',
        closed_at = coalesce(ts.closed_at, pg_catalog.now()),
        closed_by = coalesce(ts.closed_by, (select auth.uid()))
    where ts.id = v_session_id
      and ts.restaurant_id = v_restaurant_id
      and ts.table_id = v_table_id
      and ts.status = 'billing';

    return query
    select p_invoice_id, v_invoice_number, v_total, v_status, v_paid_at, v_method;
end;
$function$;

REVOKE ALL ON FUNCTION public.mark_table_invoice_paid(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_table_invoice_paid(uuid, text) TO authenticated;

COMMIT;

-- Expected behavior after the migration:
-- * First order on a table auto-creates an open session.
-- * Subsequent orders reuse the open session.
-- * Invoice issuance changes the session to 'billing' and blocks further QR orders.
-- * Marking the invoice paid closes the session; the next QR order creates a new one.
-- * Historical orders remain separate and are not retroactively assigned.
