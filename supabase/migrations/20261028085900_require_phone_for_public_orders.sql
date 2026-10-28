-- Require valid Indian mobile numbers for every public QR order path.
-- Loyalty and guest-tab RPCs call place_public_order, so server validation
-- protects callers that bypass browser form validation. Historical orders remain unchanged.
BEGIN;

CREATE OR REPLACE FUNCTION public.place_public_order(p_slug text, p_table_token uuid, p_customer_name text, p_customer_phone text, p_notes text, p_items jsonb)
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
  v_customer_phone := public.khaavio_normalize_indian_mobile(p_customer_phone);
  if v_customer_phone is null then
    raise exception 'Enter a valid 10-digit Indian mobile number (with optional +91).'
      using errcode = '22023';
  end if;
  v_notes := nullif(pg_catalog.btrim(p_notes), '');

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

COMMENT ON FUNCTION public.place_public_order(text, uuid, text, text, text, jsonb)
IS 'Places a public QR order only when the customer supplies a valid Indian mobile number; stores the number in canonical +91 format.';

COMMIT;
