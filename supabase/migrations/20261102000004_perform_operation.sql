-- RPC de operaciones de stock: add, move, remove, consume.
-- p_location_id es la localización actual: destino en add/move, origen en remove/consume.
-- p_lines: [{ "item_id": uuid, "quantity": int }]
create or replace function public.perform_operation(
  p_kind text,
  p_location_id uuid,
  p_lines jsonb,
  p_origin_id uuid default null,
  p_reference text default null,
  p_notes text default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_reference text := nullif(trim(p_reference), '');
  v_notes text := nullif(trim(p_notes), '');
  v_origin uuid;          -- de dónde sale el stock (null en add)
  v_dest uuid;            -- a dónde llega el stock (null en remove/consume)
  v_locs uuid[];
  v_line jsonb;
  v_item uuid;
  v_qty numeric;
  v_items uuid[] := '{}';
  v_qtys int[] := '{}';
  v_n int;
  v_short json;
  v_op uuid;
begin
  ---------------------------------------------------------------------------
  -- 1. Validar
  ---------------------------------------------------------------------------
  if not exists (select 1 from public.profiles p where p.id = v_uid and p.active)
     or not public.can_operate(p_location_id) then
    raise exception using errcode = 'P0001', message = 'forbidden';
  end if;

  if p_kind is null or p_kind not in ('add', 'move', 'remove', 'consume') or p_location_id is null then
    raise exception using errcode = 'P0001', message = 'invalid_operation';
  end if;

  if p_kind = 'move' then
    if p_origin_id is null or p_origin_id = p_location_id then
      raise exception using errcode = 'P0001', message = 'invalid_operation';
    end if;
    v_origin := p_origin_id;
    v_dest := p_location_id;
  else
    if p_origin_id is not null then
      raise exception using errcode = 'P0001', message = 'invalid_operation';
    end if;
    if p_kind = 'add' then
      v_dest := p_location_id;
    else
      v_origin := p_location_id;
    end if;
  end if;

  if v_reference is not null and p_kind <> 'consume' then
    raise exception using errcode = 'P0001', message = 'invalid_operation';
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception using errcode = 'P0001', message = 'invalid_operation';
  end if;

  for v_line in select e.value from jsonb_array_elements(p_lines) e loop
    if jsonb_typeof(v_line) <> 'object'
       or jsonb_typeof(v_line -> 'item_id') is distinct from 'string'
       or jsonb_typeof(v_line -> 'quantity') is distinct from 'number' then
      raise exception using errcode = 'P0001', message = 'invalid_operation';
    end if;

    v_qty := (v_line ->> 'quantity')::numeric;
    if v_qty <> trunc(v_qty) or v_qty <= 0 or v_qty > 2147483647 then
      raise exception using errcode = 'P0001', message = 'invalid_operation';
    end if;

    begin
      v_item := (v_line ->> 'item_id')::uuid;
    exception when invalid_text_representation then
      raise exception using errcode = 'P0001', message = 'invalid_operation';
    end;

    if v_item = any (v_items) then
      raise exception using errcode = 'P0001', message = 'duplicate_item';
    end if;

    v_items := v_items || v_item;
    v_qtys := v_qtys || v_qty::int;
  end loop;

  -- Localizaciones (incluido el origen) existentes y activas.
  -- for share: impide que se desactiven hasta el final de la transacción.
  v_locs := array_remove(array[v_origin, v_dest], null);
  select count(*) into v_n
  from (select 1 from public.locations l
        where l.id = any (v_locs) and l.active
        order by l.id
        for share) s;
  if v_n <> cardinality(v_locs) then
    raise exception using errcode = 'P0001', message = 'inactive_location';
  end if;

  -- Artículos existentes y activos.
  select count(*) into v_n
  from (select 1 from public.items i
        where i.id = any (v_items) and i.active
        order by i.id
        for share) s;
  if v_n <> cardinality(v_items) then
    raise exception using errcode = 'P0001', message = 'inactive_item';
  end if;

  ---------------------------------------------------------------------------
  -- 2. Bloquear las filas de stock afectadas, siempre en orden (location_id, item_id).
  --    Primero se crean (cantidad 0) las filas de destino que falten, en ese mismo orden,
  --    para que todas las filas que se van a modificar existan y queden bloqueadas aquí.
  --    Si la operación falla, el rollback elimina esas filas.
  ---------------------------------------------------------------------------
  if v_dest is not null then
    insert into public.stock (item_id, location_id, quantity)
    select l.item_id, v_dest, 0
    from unnest(v_items) l(item_id)
    order by l.item_id
    on conflict (item_id, location_id) do nothing;
  end if;

  perform 1
  from public.stock s
  where s.location_id = any (v_locs) and s.item_id = any (v_items)
  order by s.location_id, s.item_id
  for update;

  ---------------------------------------------------------------------------
  -- 3. Faltantes de todas las líneas antes de modificar nada.
  ---------------------------------------------------------------------------
  if v_origin is not null then
    select json_agg(json_build_object(
             'item_id', l.item_id,
             'available', coalesce(s.quantity, 0),
             'requested', l.qty) order by l.ord)
    into v_short
    from unnest(v_items, v_qtys) with ordinality l(item_id, qty, ord)
    left join public.stock s on s.item_id = l.item_id and s.location_id = v_origin
    where coalesce(s.quantity, 0) < l.qty;

    if v_short is not null then
      raise exception using errcode = 'P0001', message = 'insufficient_stock', detail = v_short::text;
    end if;
  end if;

  ---------------------------------------------------------------------------
  -- 4. Cabecera
  ---------------------------------------------------------------------------
  insert into public.operations (kind, origin_id, destination_id, reference, notes, user_id)
  values (p_kind, v_origin, v_dest, v_reference, v_notes, v_uid)
  returning id into v_op;

  ---------------------------------------------------------------------------
  -- 5. Líneas
  ---------------------------------------------------------------------------
  insert into public.operation_lines (operation_id, item_id, quantity)
  select v_op, l.item_id, l.qty
  from unnest(v_items, v_qtys) with ordinality l(item_id, qty, ord)
  order by l.ord;

  ---------------------------------------------------------------------------
  -- 6. Deltas. Las filas de origen existen (si no, habría faltante) y están bloqueadas.
  --    La resta va con update: un insert … on conflict evaluaría el CHECK (quantity >= 0)
  --    sobre la fila propuesta con cantidad negativa antes de resolver el conflicto.
  ---------------------------------------------------------------------------
  if v_origin is not null then
    update public.stock s
    set quantity = s.quantity - l.qty
    from unnest(v_items, v_qtys) l(item_id, qty)
    where s.item_id = l.item_id and s.location_id = v_origin;
  end if;

  if v_dest is not null then
    insert into public.stock (item_id, location_id, quantity)
    select l.item_id, v_dest, l.qty
    from unnest(v_items, v_qtys) l(item_id, qty)
    order by l.item_id
    on conflict (item_id, location_id)
    do update set quantity = public.stock.quantity + excluded.quantity;
  end if;

  return v_op;
end $$;

revoke execute on function public.perform_operation(text, uuid, jsonb, uuid, text, text) from public, anon;
grant execute on function public.perform_operation(text, uuid, jsonb, uuid, text, text) to authenticated;
