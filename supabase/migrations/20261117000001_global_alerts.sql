-- Reglas de aviso globales: comparan los umbrales con el total del artículo en todas las
-- localizaciones activas (spec §6, «Avisos globales»). Son independientes de las reglas por
-- localización: alert_thresholds() (y con ella active_alerts() y el push) solo usa las de
-- alcance 'location'. Los avisos globales nunca envían push.

alter table public.alert_rules
  add column scope text not null default 'location' check (scope in ('location', 'global')),
  add check (scope = 'location' or all_locations);

create or replace function public.alert_thresholds()
returns table (item_id uuid, location_id uuid, warning int, critical int)
language sql stable security definer set search_path = ''
as $$
  select i.id, l.id, max(r.warning_threshold), max(r.critical_threshold)
  from public.alert_rules r
  join public.items i on i.active
  join public.locations l on l.active
  where r.active
    and r.scope = 'location'
    and (r.all_items or exists (
          select 1 from public.alert_rule_items ri where ri.rule_id = r.id and ri.item_id = i.id))
    and (r.all_locations or exists (
          select 1 from public.alert_rule_locations rl where rl.rule_id = r.id and rl.location_id = l.id))
  group by i.id, l.id
$$;

revoke execute on function public.alert_thresholds() from public, anon, authenticated;

-- Avisos globales activos: total = suma en localizaciones activas (0 si no hay stock).
-- Graves primero. Visibles para cualquier perfil activo.
create or replace function public.global_alerts()
returns table (item_id uuid, total int, level text, threshold int)
language sql stable security definer set search_path = ''
as $$
  with t as (
    select i.id as item_id, max(r.warning_threshold) as warning, max(r.critical_threshold) as critical
    from public.alert_rules r
    join public.items i on i.active
    where r.active
      and r.scope = 'global'
      and (r.all_items or exists (
            select 1 from public.alert_rule_items ri where ri.rule_id = r.id and ri.item_id = i.id))
    group by i.id
  ), q as (
    select t.item_id, t.warning, t.critical,
           coalesce((select sum(s.quantity)
                     from public.stock s
                     join public.locations l on l.id = s.location_id and l.active
                     where s.item_id = t.item_id), 0)::int as total
    from t
  )
  select q.item_id, q.total,
         case when q.total <= q.critical then 'critical' else 'warning' end,
         case when q.total <= q.critical then q.critical else q.warning end
  from q
  where public.is_active()
    and (q.total <= q.critical or q.total <= q.warning)
  order by coalesce(q.total <= q.critical, false) desc, q.item_id
$$;

revoke execute on function public.global_alerts() from public, anon;
grant execute on function public.global_alerts() to authenticated;

-- admin_save_alert_rule con alcance. Se sustituye la firma de 6 parámetros; las llamadas
-- de 6 argumentos siguen valiendo por el default de p_scope.
drop function public.admin_save_alert_rule(uuid, text, uuid[], uuid[], int, int);

create function public.admin_save_alert_rule(
  p_id uuid, p_name text, p_item_ids uuid[], p_location_ids uuid[], p_warning int, p_critical int,
  p_scope text default 'location')
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
     or p_scope is null or p_scope not in ('location', 'global')
     or (p_scope = 'global' and p_location_ids is not null)
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
    insert into public.alert_rules (name, scope, all_items, all_locations, warning_threshold, critical_threshold)
    values (v_name, p_scope, p_item_ids is null, p_location_ids is null, p_warning, p_critical)
    returning id into v_id;
  else
    update public.alert_rules
       set name = v_name, scope = p_scope, all_items = p_item_ids is null,
           all_locations = p_location_ids is null,
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

revoke execute on function public.admin_save_alert_rule(uuid, text, uuid[], uuid[], int, int, text)
  from public, anon;
grant execute on function public.admin_save_alert_rule(uuid, text, uuid[], uuid[], int, int, text)
  to authenticated;
