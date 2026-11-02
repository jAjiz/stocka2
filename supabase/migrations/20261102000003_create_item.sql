-- RPC de alta de artículo
create or replace function public.create_item(p_name text, p_type_id uuid, p_reference text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := nullif(trim(p_name), '');
  v_reference text := nullif(trim(p_reference), '');
  v_id uuid;
begin
  if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.active) then
    raise exception using errcode = 'P0001', message = 'forbidden';
  end if;

  if v_name is null then
    raise exception using errcode = 'P0001', message = 'invalid_operation';
  end if;

  -- for share: impide que el tipo se desactive mientras creamos el artículo
  perform 1 from public.item_types t where t.id = p_type_id and t.active for share;
  if not found then
    raise exception using errcode = 'P0001', message = 'inactive_type';
  end if;

  if exists (select 1 from public.items i
             where i.active and public.normalize_name(i.name) = public.normalize_name(v_name)) then
    raise exception using errcode = 'P0001', message = 'duplicate_name';
  end if;

  begin
    insert into public.items (name, type_id, reference)
    values (v_name, p_type_id, v_reference)
    returning id into v_id;
  exception when unique_violation then
    -- carrera con otra inserción concurrente del mismo nombre
    raise exception using errcode = 'P0001', message = 'duplicate_name';
  end;

  return v_id;
end $$;

revoke execute on function public.create_item(text, uuid, text) from public, anon;
grant execute on function public.create_item(text, uuid, text) to authenticated;
