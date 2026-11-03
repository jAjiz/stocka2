-- Un usuario desactivado conserva su JWT hasta que caduca (y la Edge Function lo banea para
-- que no pueda refrescarlo). Para que deje de leer datos al instante, todas las políticas
-- select exigen además un perfil activo.
create or replace function public.is_active() returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((select p.active from public.profiles p where p.id = auth.uid()), false)
$$;

revoke execute on function public.is_active() from public, anon;
grant execute on function public.is_active() to authenticated, service_role;

drop policy profiles_select on public.profiles;
drop policy locations_select on public.locations;
drop policy item_types_select on public.item_types;
drop policy items_select on public.items;
drop policy operations_select on public.operations;
drop policy operation_lines_select on public.operation_lines;
drop policy stock_select on public.stock;
drop policy location_permissions_select on public.location_permissions;

create policy profiles_select on public.profiles for select to authenticated
  using ((select public.is_active()));
create policy locations_select on public.locations for select to authenticated
  using ((select public.is_active()));
create policy item_types_select on public.item_types for select to authenticated
  using ((select public.is_active()));
create policy items_select on public.items for select to authenticated
  using ((select public.is_active()));
create policy operations_select on public.operations for select to authenticated
  using ((select public.is_active()));
create policy operation_lines_select on public.operation_lines for select to authenticated
  using ((select public.is_active()));

create policy stock_select on public.stock for select to authenticated
  using ((select public.is_active())
         and exists (select 1 from public.locations l where l.id = stock.location_id and l.active));

create policy location_permissions_select on public.location_permissions for select to authenticated
  using ((select public.is_active())
         and (user_id = (select auth.uid()) or (select public.is_admin())));
