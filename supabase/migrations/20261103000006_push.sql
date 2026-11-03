-- Suscripciones push y encolado de avisos graves (spec §6, Nivel grave y Suscripciones push).
-- perform_operation encola en push_outbox una notificación por destinatario cuando una
-- operación deja algún artículo en nivel grave en la localización de origen, y avisa a la
-- Edge Function send-push con pg_net (la petición sale tras el commit). El push nunca retrasa
-- ni hace fallar la operación.
create extension if not exists pg_net with schema extensions;

---------------------------------------------------------------------------
-- Tablas
---------------------------------------------------------------------------
-- Un endpoint pertenece a un solo usuario: el último que lo activó.
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

-- Bandeja de salida: solo la escriben y leen funciones security definer (RLS sin políticas).
create table public.push_outbox (
  id bigint generated always as identity primary key,
  operation_id uuid not null references public.operations,
  user_id uuid not null references public.profiles,
  title text not null,
  body text not null,
  url text not null,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index push_outbox_pending_idx on public.push_outbox (created_at) where sent_at is null;

alter table public.push_subscriptions enable row level security;
alter table public.push_outbox enable row level security;

create policy push_subscriptions_select on public.push_subscriptions for select to authenticated
  using (user_id = (select auth.uid()));

---------------------------------------------------------------------------
-- Suscripciones
---------------------------------------------------------------------------
create or replace function public.save_push_subscription(
  p_endpoint text, p_p256dh text, p_auth text, p_user_agent text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_active() then
    raise exception using errcode = 'P0001', message = 'forbidden';
  end if;
  if nullif(trim(p_endpoint), '') is null or nullif(trim(p_p256dh), '') is null
     or nullif(trim(p_auth), '') is null then
    raise exception using errcode = 'P0001', message = 'invalid_input';
  end if;

  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, nullif(trim(p_user_agent), ''))
  on conflict (endpoint) do update
    set user_id = excluded.user_id,
        p256dh = excluded.p256dh,
        auth = excluded.auth,
        user_agent = excluded.user_agent;
end $$;

revoke execute on function public.save_push_subscription(text, text, text, text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text, text) to authenticated;

-- Borra la suscripción solo si es del usuario actual; si no existe, no hace nada.
create or replace function public.delete_push_subscription(p_endpoint text)
returns void
language sql security definer set search_path = ''
as $$
  delete from public.push_subscriptions s
  where s.endpoint = p_endpoint and s.user_id = auth.uid()
$$;

revoke execute on function public.delete_push_subscription(text) from public, anon;
grant execute on function public.delete_push_subscription(text) to authenticated;

---------------------------------------------------------------------------
-- Encolado de avisos graves (solo desde perform_operation)
---------------------------------------------------------------------------
create or replace function public.enqueue_critical_alerts(p_operation_id uuid, p_location_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_lines text[];
  v_n int;
  v_title text;
  v_body text;
  v_url text;
begin
  -- Artículos de la operación que quedan en nivel grave en la localización, por nombre.
  select array_agg(format('%s: quedan %s (umbral %s)', i.name, coalesce(s.quantity, 0), t.critical)
                   order by i.name, i.id)
  into v_lines
  from public.operation_lines ol
  join public.items i on i.id = ol.item_id
  join public.alert_thresholds() t on t.item_id = ol.item_id and t.location_id = p_location_id
  left join public.stock s on s.item_id = ol.item_id and s.location_id = p_location_id
  where ol.operation_id = p_operation_id
    and coalesce(s.quantity, 0) <= t.critical;

  v_n := coalesce(cardinality(v_lines), 0);
  if v_n = 0 then
    return;
  end if;

  select 'Stock crítico en ' || l.name into v_title
  from public.locations l where l.id = p_location_id;

  if v_n > 4 then
    v_body := array_to_string(v_lines[1:3], E'\n') || E'\n' || format('y %s más', v_n - 3);
  else
    v_body := array_to_string(v_lines, E'\n');
  end if;

  -- Una fila por destinatario: perfiles activos administradores o con permiso en la localización.
  insert into public.push_outbox (operation_id, user_id, title, body, url)
  select p_operation_id, p.id, v_title, v_body, '/localizaciones/' || p_location_id
  from public.profiles p
  where p.active
    and (p.role = 'admin'
         or exists (select 1 from public.location_permissions lp
                    where lp.user_id = p.id and lp.location_id = p_location_id));

  if not found then
    return;
  end if;

  -- Avisa a send-push. pg_net encola la petición y la envía tras el commit.
  select ds.decrypted_secret into v_url
  from vault.decrypted_secrets ds where ds.name = 'stocka2_push_url';
  if v_url is not null then
    perform net.http_post(
      url := v_url,
      body := '{}'::jsonb,
      headers := '{"Content-Type":"application/json"}'::jsonb);
  end if;
end $$;

revoke execute on function public.enqueue_critical_alerts(uuid, uuid) from public, anon, authenticated;

---------------------------------------------------------------------------
-- Reclamar la bandeja de salida (Edge Function send-push, con service_role)
---------------------------------------------------------------------------
create or replace function public.claim_push_outbox(p_limit int default 100)
returns table (id bigint, user_id uuid, title text, body text, url text)
language plpgsql security definer set search_path = ''
as $$
begin
  -- Limpieza: filas enviadas hace más de 30 días.
  delete from public.push_outbox o where o.sent_at < now() - interval '30 days';

  return query
  update public.push_outbox o
  set sent_at = now()
  from (select p.id from public.push_outbox p
        where p.sent_at is null
        order by p.created_at, p.id
        limit p_limit
        for update skip locked) c
  where o.id = c.id
  returning o.id, o.user_id, o.title, o.body, o.url;
end $$;

revoke execute on function public.claim_push_outbox(int) from public, anon, authenticated;
grant execute on function public.claim_push_outbox(int) to service_role;

---------------------------------------------------------------------------
-- perform_operation: mismo cuerpo que en 20261102000006 y, al final, el encolado de avisos
-- graves en el origen (solo el origen resta stock). La salida temprana por idempotencia
-- evita encolar dos veces en un reintento.
---------------------------------------------------------------------------
create or replace function public.perform_operation(
  p_kind text,
  p_location_id uuid,
  p_lines jsonb,
  p_origin_id uuid default null,
  p_reference text default null,
  p_notes text default null,
  p_operation_id uuid default null
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
  v_owner uuid;
begin
  ---------------------------------------------------------------------------
  -- 1. Validar
  ---------------------------------------------------------------------------
  if not exists (select 1 from public.profiles p where p.id = v_uid and p.active)
     or not public.can_operate(p_location_id) then
    raise exception using errcode = 'P0001', message = 'forbidden';
  end if;

  -- Idempotencia: si la operación ya existe, se devuelve su id sin aplicar nada.
  -- El lock serializa reintentos concurrentes con el mismo id: el segundo espera
  -- al commit del primero y lo encuentra aquí (read committed, nuevo snapshot).
  if p_operation_id is not null then
    perform pg_advisory_xact_lock(hashtextextended(p_operation_id::text, 0));
    select o.user_id into v_owner from public.operations o where o.id = p_operation_id;
    if found then
      if v_owner = v_uid then
        return p_operation_id;
      end if;
      raise exception using errcode = 'P0001', message = 'invalid_operation';
    end if;
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
  insert into public.operations (id, kind, origin_id, destination_id, reference, notes, user_id)
  values (coalesce(p_operation_id, gen_random_uuid()), p_kind, v_origin, v_dest, v_reference, v_notes, v_uid)
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

  ---------------------------------------------------------------------------
  -- 7. Avisos graves en el origen. Un fallo no hace fallar la operación.
  ---------------------------------------------------------------------------
  if v_origin is not null then
    begin
      perform public.enqueue_critical_alerts(v_op, v_origin);
    exception when others then
      raise warning 'enqueue_critical_alerts: %', sqlerrm;
    end;
  end if;

  return v_op;
end $$;

revoke execute on function public.perform_operation(text, uuid, jsonb, uuid, text, text, uuid) from public, anon;
grant execute on function public.perform_operation(text, uuid, jsonb, uuid, text, text, uuid) to authenticated;
