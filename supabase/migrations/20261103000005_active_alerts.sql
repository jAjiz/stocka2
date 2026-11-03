-- Cálculo de avisos de stock activos a partir de las reglas (spec §6).
-- Un nivel está activo cuando cantidad <= umbral. Con reglas solapadas gana el umbral más alto
-- en cada nivel. Un artículo sin fila de stock en una localización cuenta como cantidad 0.

-- Umbrales efectivos por par (artículo activo, localización activa) cubierto por alguna regla
-- activa. Los umbrales null no cuentan. Solo para otras funciones (active_alerts y el trigger
-- de push): no se concede a authenticated.
create or replace function public.alert_thresholds()
returns table (item_id uuid, location_id uuid, warning int, critical int)
language sql stable security definer set search_path = ''
as $$
  select i.id, l.id, max(r.warning_threshold), max(r.critical_threshold)
  from public.alert_rules r
  join public.items i on i.active
  join public.locations l on l.active
  where r.active
    and (r.all_items or exists (
          select 1 from public.alert_rule_items ri where ri.rule_id = r.id and ri.item_id = i.id))
    and (r.all_locations or exists (
          select 1 from public.alert_rule_locations rl where rl.rule_id = r.id and rl.location_id = l.id))
  group by i.id, l.id
$$;

revoke execute on function public.alert_thresholds() from public, anon, authenticated;

-- Avisos activos ahora mismo: graves primero, después por localización y artículo.
create or replace function public.active_alerts()
returns table (item_id uuid, location_id uuid, quantity int, level text, threshold int)
language sql stable security definer set search_path = ''
as $$
  select t.item_id, t.location_id, q.quantity,
         case when q.quantity <= t.critical then 'critical' else 'warning' end,
         case when q.quantity <= t.critical then t.critical else t.warning end
  from public.alert_thresholds() t
  left join public.stock s on s.item_id = t.item_id and s.location_id = t.location_id
  cross join lateral (select coalesce(s.quantity, 0) as quantity) q
  where public.is_active()
    and (q.quantity <= t.critical or q.quantity <= t.warning)
  order by coalesce(q.quantity <= t.critical, false) desc, t.location_id, t.item_id
$$;

revoke execute on function public.active_alerts() from public, anon;
grant execute on function public.active_alerts() to authenticated;
