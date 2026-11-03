-- Reglas de aviso de stock: tablas y RPC de administración (spec §6).
-- "Todos los artículos" / "Todas las localizaciones" se guardan como bandera, no como lista,
-- para incluir lo que se dé de alta después. Los `on delete cascade` mantienen funcionando
-- admin_delete_item y admin_delete_location sin cambios.

create table public.alert_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  all_items boolean not null,
  all_locations boolean not null,
  warning_threshold int check (warning_threshold >= 0),
  critical_threshold int check (critical_threshold >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check (warning_threshold is not null or critical_threshold is not null),
  check (warning_threshold is null or critical_threshold is null or critical_threshold < warning_threshold)
);

create table public.alert_rule_items (
  rule_id uuid not null references public.alert_rules (id) on delete cascade,
  item_id uuid not null references public.items (id) on delete cascade,
  primary key (rule_id, item_id)
);

create table public.alert_rule_locations (
  rule_id uuid not null references public.alert_rules (id) on delete cascade,
  location_id uuid not null references public.locations (id) on delete cascade,
  primary key (rule_id, location_id)
);

-- Índices para los borrados en cascada desde items y locations
create index alert_rule_items_item_idx on public.alert_rule_items (item_id);
create index alert_rule_locations_location_idx on public.alert_rule_locations (location_id);

alter table public.alert_rules enable row level security;
alter table public.alert_rule_items enable row level security;
alter table public.alert_rule_locations enable row level security;

create policy alert_rules_select on public.alert_rules for select to authenticated
  using ((select public.is_admin()));
create policy alert_rule_items_select on public.alert_rule_items for select to authenticated
  using ((select public.is_admin()));
create policy alert_rule_locations_select on public.alert_rule_locations for select to authenticated
  using ((select public.is_admin()));

---------------------------------------------------------------------------
-- RPC de administración
---------------------------------------------------------------------------
create or replace function public.admin_save_alert_rule(
  p_id uuid, p_name text, p_item_ids uuid[], p_location_ids uuid[], p_warning int, p_critical int)
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
  if v_name is null
     or (p_item_ids is not null and coalesce(cardinality(p_item_ids), 0) = 0)
     or (p_location_ids is not null and coalesce(cardinality(p_location_ids), 0) = 0) then
    raise exception using errcode = 'P0001', message = 'invalid_input';
  end if;
  if (p_warning is null and p_critical is null)
     or p_warning < 0 or p_critical < 0
     or (p_warning is not null and p_critical is not null and p_critical >= p_warning) then
    raise exception using errcode = 'P0001', message = 'invalid_thresholds';
  end if;
  if p_item_ids is not null and exists (
       select 1 from unnest(p_item_ids) x(id)
       where x.id is null or not exists (select 1 from public.items i where i.id = x.id)) then
    raise exception using errcode = 'P0001', message = 'invalid_input';
  end if;
  if p_location_ids is not null and exists (
       select 1 from unnest(p_location_ids) x(id)
       where x.id is null or not exists (select 1 from public.locations l where l.id = x.id)) then
    raise exception using errcode = 'P0001', message = 'invalid_input';
  end if;

  if p_id is null then
    insert into public.alert_rules (name, all_items, all_locations, warning_threshold, critical_threshold)
    values (v_name, p_item_ids is null, p_location_ids is null, p_warning, p_critical)
    returning id into v_id;
  else
    update public.alert_rules
       set name = v_name, all_items = p_item_ids is null, all_locations = p_location_ids is null,
           warning_threshold = p_warning, critical_threshold = p_critical
     where id = p_id
    returning id into v_id;
    if not found then
      raise exception using errcode = 'P0001', message = 'not_found';
    end if;
    delete from public.alert_rule_items where rule_id = v_id;
    delete from public.alert_rule_locations where rule_id = v_id;
  end if;

  if p_item_ids is not null then
    insert into public.alert_rule_items (rule_id, item_id)
    select distinct v_id, x.id from unnest(p_item_ids) x(id);
  end if;
  if p_location_ids is not null then
    insert into public.alert_rule_locations (rule_id, location_id)
    select distinct v_id, x.id from unnest(p_location_ids) x(id);
  end if;
  return v_id;
end $$;

create or replace function public.admin_set_alert_rule_active(p_id uuid, p_active boolean)
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
  update public.alert_rules set active = p_active where id = p_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;
end $$;

create or replace function public.admin_delete_alert_rule(p_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception using errcode = 'P0001', message = 'forbidden';
  end if;
  delete from public.alert_rules where id = p_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;
end $$;

revoke execute on function
  public.admin_save_alert_rule(uuid, text, uuid[], uuid[], int, int),
  public.admin_set_alert_rule_active(uuid, boolean),
  public.admin_delete_alert_rule(uuid)
from public, anon;

grant execute on function
  public.admin_save_alert_rule(uuid, text, uuid[], uuid[], int, int),
  public.admin_set_alert_rule_active(uuid, boolean),
  public.admin_delete_alert_rule(uuid)
to authenticated;
