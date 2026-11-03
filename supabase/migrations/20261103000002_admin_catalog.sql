-- RPC de administración del catálogo: localizaciones, tipos de artículo y artículos.
-- Solo administradores activos. Los bloqueos `for update` sobre la fila se serializan con el
-- `for share` de perform_operation y create_item: no se puede deshabilitar ni borrar algo
-- mientras una operación en curso lo usa, y al obtener el bloqueo ya se ve su stock.

---------------------------------------------------------------------------
-- Localizaciones
---------------------------------------------------------------------------
create or replace function public.admin_save_location(p_id uuid, p_name text, p_kind text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_name text := nullif(trim(p_name), '');
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception using errcode = 'P0001', message = 'forbidden';
  end if;
  if v_name is null or p_kind is null or p_kind not in ('warehouse', 'vehicle') then
    raise exception using errcode = 'P0001', message = 'invalid_input';
  end if;
  if p_id is not null and not exists (select 1 from public.locations l where l.id = p_id) then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;
  if exists (select 1 from public.locations l
             where lower(l.name) = lower(v_name) and l.id is distinct from p_id) then
    raise exception using errcode = 'P0001', message = 'duplicate_location';
  end if;

  begin
    if p_id is null then
      insert into public.locations (name, kind) values (v_name, p_kind) returning id into v_id;
    else
      update public.locations set name = v_name, kind = p_kind where id = p_id returning id into v_id;
    end if;
  exception when unique_violation then
    raise exception using errcode = 'P0001', message = 'duplicate_location';
  end;
  return v_id;
end $$;

create or replace function public.admin_set_location_active(p_id uuid, p_active boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception using errcode = 'P0001', message = 'forbidden';
  end if;
  if p_active is null then
    raise exception using errcode = 'P0001', message = 'invalid_input';
  end if;
  perform 1 from public.locations l where l.id = p_id for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;
  if not p_active and exists (select 1 from public.stock s where s.location_id = p_id and s.quantity > 0) then
    raise exception using errcode = 'P0001', message = 'location_has_stock';
  end if;
  update public.locations set active = p_active where id = p_id;
end $$;

create or replace function public.admin_delete_location(p_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception using errcode = 'P0001', message = 'forbidden';
  end if;
  perform 1 from public.locations l where l.id = p_id for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;
  if exists (select 1 from public.operations o where o.origin_id = p_id or o.destination_id = p_id) then
    raise exception using errcode = 'P0001', message = 'location_in_use';
  end if;
  delete from public.location_permissions where location_id = p_id;
  delete from public.stock where location_id = p_id;
  delete from public.locations where id = p_id;
end $$;

---------------------------------------------------------------------------
-- Tipos de artículo
---------------------------------------------------------------------------
create or replace function public.admin_save_item_type(p_id uuid, p_name text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_name text := nullif(trim(p_name), '');
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception using errcode = 'P0001', message = 'forbidden';
  end if;
  if v_name is null then
    raise exception using errcode = 'P0001', message = 'invalid_input';
  end if;
  if p_id is not null and not exists (select 1 from public.item_types t where t.id = p_id) then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;
  if exists (select 1 from public.item_types t
             where lower(t.name) = lower(v_name) and t.id is distinct from p_id) then
    raise exception using errcode = 'P0001', message = 'duplicate_type';
  end if;

  begin
    if p_id is null then
      insert into public.item_types (name) values (v_name) returning id into v_id;
    else
      update public.item_types set name = v_name where id = p_id returning id into v_id;
    end if;
  exception when unique_violation then
    raise exception using errcode = 'P0001', message = 'duplicate_type';
  end;
  return v_id;
end $$;

-- Sin restricciones: un tipo en uso se deshabilita en lugar de borrarse, y los artículos
-- que ya lo tienen lo conservan (spec §4).
create or replace function public.admin_set_item_type_active(p_id uuid, p_active boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception using errcode = 'P0001', message = 'forbidden';
  end if;
  if p_active is null then
    raise exception using errcode = 'P0001', message = 'invalid_input';
  end if;
  update public.item_types set active = p_active where id = p_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;
end $$;

create or replace function public.admin_delete_item_type(p_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception using errcode = 'P0001', message = 'forbidden';
  end if;
  perform 1 from public.item_types t where t.id = p_id for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;
  if exists (select 1 from public.items i where i.type_id = p_id) then
    raise exception using errcode = 'P0001', message = 'type_in_use';
  end if;
  delete from public.item_types where id = p_id;
end $$;

---------------------------------------------------------------------------
-- Artículos (el alta es create_item, del plan 1)
---------------------------------------------------------------------------
create or replace function public.admin_update_item(p_id uuid, p_name text, p_type_id uuid, p_reference text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_name text := nullif(trim(p_name), '');
  v_reference text := nullif(trim(p_reference), '');
  v_item public.items;
begin
  if not public.is_admin() then
    raise exception using errcode = 'P0001', message = 'forbidden';
  end if;
  if v_name is null or p_type_id is null then
    raise exception using errcode = 'P0001', message = 'invalid_input';
  end if;
  select * into v_item from public.items i where i.id = p_id for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;

  -- Se puede conservar un tipo ya deshabilitado, pero no cambiar a uno.
  if p_type_id <> v_item.type_id then
    perform 1 from public.item_types t where t.id = p_type_id and t.active for share;
    if not found then
      raise exception using errcode = 'P0001', message = 'inactive_type';
    end if;
  end if;

  if v_item.active and exists (
       select 1 from public.items i
       where i.active and i.id <> p_id and public.normalize_name(i.name) = public.normalize_name(v_name)) then
    raise exception using errcode = 'P0001', message = 'duplicate_name';
  end if;

  begin
    update public.items set name = v_name, type_id = p_type_id, reference = v_reference where id = p_id;
  exception when unique_violation then
    raise exception using errcode = 'P0001', message = 'duplicate_name';
  end;
end $$;

create or replace function public.admin_set_item_active(p_id uuid, p_active boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_item public.items;
begin
  if not public.is_admin() then
    raise exception using errcode = 'P0001', message = 'forbidden';
  end if;
  if p_active is null then
    raise exception using errcode = 'P0001', message = 'invalid_input';
  end if;
  select * into v_item from public.items i where i.id = p_id for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;

  if not p_active and exists (select 1 from public.stock s where s.item_id = p_id and s.quantity > 0) then
    raise exception using errcode = 'P0001', message = 'item_has_stock';
  end if;
  if p_active and not v_item.active and exists (
       select 1 from public.items i
       where i.active and i.id <> p_id and public.normalize_name(i.name) = public.normalize_name(v_item.name)) then
    raise exception using errcode = 'P0001', message = 'duplicate_name';
  end if;

  begin
    update public.items set active = p_active where id = p_id;
  exception when unique_violation then
    raise exception using errcode = 'P0001', message = 'duplicate_name';
  end;
end $$;

create or replace function public.admin_delete_item(p_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception using errcode = 'P0001', message = 'forbidden';
  end if;
  perform 1 from public.items i where i.id = p_id for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;
  if exists (select 1 from public.operation_lines ol where ol.item_id = p_id) then
    raise exception using errcode = 'P0001', message = 'item_in_use';
  end if;
  delete from public.stock where item_id = p_id;
  delete from public.items where id = p_id;
end $$;

revoke execute on function
  public.admin_save_location(uuid, text, text),
  public.admin_set_location_active(uuid, boolean),
  public.admin_delete_location(uuid),
  public.admin_save_item_type(uuid, text),
  public.admin_set_item_type_active(uuid, boolean),
  public.admin_delete_item_type(uuid),
  public.admin_update_item(uuid, text, uuid, text),
  public.admin_set_item_active(uuid, boolean),
  public.admin_delete_item(uuid)
from public, anon;

grant execute on function
  public.admin_save_location(uuid, text, text),
  public.admin_set_location_active(uuid, boolean),
  public.admin_delete_location(uuid),
  public.admin_save_item_type(uuid, text),
  public.admin_set_item_type_active(uuid, boolean),
  public.admin_delete_item_type(uuid),
  public.admin_update_item(uuid, text, uuid, text),
  public.admin_set_item_active(uuid, boolean),
  public.admin_delete_item(uuid)
to authenticated;
