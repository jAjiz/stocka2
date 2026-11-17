-- Importación de artículos desde la plantilla Excel (spec §8.1). Solo crea artículos: no toca
-- stock ni operaciones. Todo o nada; los nombres ya ocupados por un artículo activo (también los
-- creados entretanto por otro usuario) se saltan y se cuentan en "skipped".
create or replace function public.admin_import_items(p_items jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_total int;
  v_created int;
begin
  if not public.is_admin() then
    raise exception using errcode = 'P0001', message = 'forbidden';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception using errcode = 'P0001', message = 'invalid_input';
  end if;
  v_total := jsonb_array_length(p_items);
  if v_total = 0 or v_total > 2000 then
    raise exception using errcode = 'P0001', message = 'invalid_input';
  end if;

  create temporary table import_rows on commit drop as
  select nullif(trim(x->>'name'), '') as name,
         (x->>'type_id')::uuid as type_id,
         nullif(trim(x->>'reference'), '') as reference,
         n
  from jsonb_array_elements(p_items) with ordinality as e(x, n);

  if exists (select 1 from import_rows where name is null) then
    raise exception using errcode = 'P0001', message = 'invalid_input';
  end if;

  -- Repetidos dentro de la importación según normalize_name (que pliega más que el cliente, p. ej.
  -- comillas tipográficas): se saltan en vez de rechazar todo; gana el primero.
  delete from import_rows r
  using import_rows f
  where public.normalize_name(f.name) = public.normalize_name(r.name) and f.n < r.n;

  -- for share: impide que los tipos se deshabiliten mientras se crean los artículos
  perform 1 from public.item_types t
  where t.id in (select distinct type_id from import_rows) and t.active
  for share;
  if exists (select 1 from import_rows r
             where r.type_id is null
                or not exists (select 1 from public.item_types t where t.id = r.type_id and t.active)) then
    raise exception using errcode = 'P0001', message = 'inactive_type';
  end if;

  insert into public.items (name, type_id, reference)
  select name, type_id, reference from import_rows
  on conflict ((public.normalize_name(name))) where active do nothing;
  get diagnostics v_created = row_count;

  drop table import_rows;
  return jsonb_build_object('created', v_created, 'skipped', v_total - v_created);
end $$;

revoke execute on function public.admin_import_items(jsonb) from public, anon;
grant execute on function public.admin_import_items(jsonb) to authenticated;
