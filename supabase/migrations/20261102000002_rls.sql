-- RLS de solo lectura. Las escrituras se harán vía RPC security definer.
alter table public.profiles enable row level security;
alter table public.locations enable row level security;
alter table public.item_types enable row level security;
alter table public.items enable row level security;
alter table public.location_permissions enable row level security;
alter table public.stock enable row level security;
alter table public.operations enable row level security;
alter table public.operation_lines enable row level security;

create policy profiles_select on public.profiles for select to authenticated using (true);
create policy locations_select on public.locations for select to authenticated using (true);
create policy item_types_select on public.item_types for select to authenticated using (true);
create policy items_select on public.items for select to authenticated using (true);
create policy operations_select on public.operations for select to authenticated using (true);
create policy operation_lines_select on public.operation_lines for select to authenticated using (true);

create policy stock_select on public.stock for select to authenticated
  using (exists (select 1 from public.locations l where l.id = stock.location_id and l.active));

create policy location_permissions_select on public.location_permissions for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
