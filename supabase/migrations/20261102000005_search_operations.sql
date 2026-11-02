-- Búsqueda de historial de operaciones. security invoker: la protege RLS (select para authenticated).
-- p_location_id coincide con origen o destino; p_from inclusivo, p_to exclusivo.
create or replace function public.search_operations(
  p_kind text default null,
  p_location_id uuid default null,
  p_origin_id uuid default null,
  p_destination_id uuid default null,
  p_item_id uuid default null,
  p_user_id uuid default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_reference text default null,
  p_limit int default 50,
  p_offset int default 0
) returns table (
  id uuid,
  kind text,
  origin_id uuid,
  destination_id uuid,
  reference text,
  notes text,
  user_id uuid,
  created_at timestamptz,
  line_count int,
  total_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select o.id, o.kind, o.origin_id, o.destination_id, o.reference, o.notes, o.user_id, o.created_at,
         (select count(*)::int from public.operation_lines l where l.operation_id = o.id) as line_count,
         count(*) over () as total_count
  from public.operations o
  where (p_kind is null or o.kind = p_kind)
    and (p_location_id is null or o.origin_id = p_location_id or o.destination_id = p_location_id)
    and (p_origin_id is null or o.origin_id = p_origin_id)
    and (p_destination_id is null or o.destination_id = p_destination_id)
    and (p_item_id is null or exists (
          select 1 from public.operation_lines l where l.operation_id = o.id and l.item_id = p_item_id))
    and (p_user_id is null or o.user_id = p_user_id)
    and (p_from is null or o.created_at >= p_from)
    and (p_to is null or o.created_at < p_to)
    and (p_reference is null or o.reference ilike '%' || p_reference || '%')
  order by o.created_at desc, o.id desc
  limit p_limit offset p_offset
$$;

revoke execute on function public.search_operations(text, uuid, uuid, uuid, uuid, uuid, timestamptz, timestamptz, text, int, int) from public, anon;
grant execute on function public.search_operations(text, uuid, uuid, uuid, uuid, uuid, timestamptz, timestamptz, text, int, int) to authenticated;
