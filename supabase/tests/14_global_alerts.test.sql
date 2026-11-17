begin;
\ir _helpers.sql
select tests.clear_seed();
delete from vault.secrets where name = 'stocka2_push_url';
select plan(18);

select tests.create_user('admin@stocka2.test', 'admin') as a \gset
select tests.create_user('u@stocka2.test') as u \gset
select tests.create_user('x@stocka2.test') as x \gset
update public.profiles set active = false where id = :'x';

-- T y F1 activas, F2 deshabilitada; A y B activos, C deshabilitado
insert into public.locations (id, name, kind, active) values
  ('00000000-0000-0000-0000-0000000000a1', 'T', 'warehouse', true),
  ('00000000-0000-0000-0000-0000000000a2', 'F1', 'vehicle', true),
  ('00000000-0000-0000-0000-0000000000a3', 'F2', 'vehicle', false);
insert into public.item_types (id, name) values ('00000000-0000-0000-0000-0000000000b1', 'Fontaneria');
insert into public.items (id, name, type_id, active) values
  ('00000000-0000-0000-0000-0000000000c1', 'A', '00000000-0000-0000-0000-0000000000b1', true),
  ('00000000-0000-0000-0000-0000000000c2', 'B', '00000000-0000-0000-0000-0000000000b1', true),
  ('00000000-0000-0000-0000-0000000000c3', 'C', '00000000-0000-0000-0000-0000000000b1', false);
-- A: 3 en T y 2 en F1 (total 5); B: 50 solo en F2 (deshabilitada, total 0); C: nada
insert into public.stock (item_id, location_id, quantity) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a1', 3),
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a2', 2),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000a3', 50);

select has_column('public', 'alert_rules', 'scope', 'alert_rules tiene scope');
select col_default_is('public', 'alert_rules', 'scope', 'location', 'scope por defecto location');

-- G1: global sobre A, leve 10, grave 5
select tests.login_as(:'a');
select public.admin_save_alert_rule(null, 'G1', array['00000000-0000-0000-0000-0000000000c1'::uuid],
  null, 10, 5, 'global') as g1 \gset
select results_eq($$select item_id, total, level, threshold from public.global_alerts()$$,
  $$values ('00000000-0000-0000-0000-0000000000c1'::uuid, 5, 'critical', 5)$$,
  'G1: A con total 5 en grave');

select tests.logout();
update public.stock set quantity = 4
  where item_id = '00000000-0000-0000-0000-0000000000c1' and location_id = '00000000-0000-0000-0000-0000000000a1';
select tests.login_as(:'a');
select results_eq($$select item_id, total, level, threshold from public.global_alerts()$$,
  $$values ('00000000-0000-0000-0000-0000000000c1'::uuid, 6, 'warning', 10)$$,
  'G1: A con total 6 en leve');

-- G2: global sobre todos, leve 12 (gana el umbral más alto)
select public.admin_save_alert_rule(null, 'G2', null, null, 12, null, 'global') as g2 \gset
select results_eq($$select item_id, total, level, threshold from public.global_alerts() order by item_id$$,
  $$values ('00000000-0000-0000-0000-0000000000c1'::uuid, 6, 'warning', 12),
           ('00000000-0000-0000-0000-0000000000c2'::uuid, 0, 'warning', 12)$$,
  'G1+G2: A con umbral leve 12; B con total 0 (su stock está en F2); C no aparece');

select is((select count(*)::int from public.active_alerts()), 0,
  'las reglas globales no generan avisos por localización');

-- Usuario sin permisos y usuario inactivo
select tests.login_as(:'u');
select results_eq($$select item_id, total, level, threshold from public.global_alerts() order by item_id$$,
  $$values ('00000000-0000-0000-0000-0000000000c1'::uuid, 6, 'warning', 12),
           ('00000000-0000-0000-0000-0000000000c2'::uuid, 0, 'warning', 12)$$,
  'un usuario no administrador ve los avisos globales');
select throws_ok($$select public.admin_save_alert_rule(null, 'X', null, null, 1, null, 'global')$$,
  'P0001', 'forbidden', 'solo el administrador guarda reglas');
select tests.login_as(:'x');
select is((select count(*)::int from public.global_alerts()), 0, 'un usuario inactivo no ve nada');

-- Push: un total que baja al umbral grave global no encola nada
select tests.login_as(:'a');
select public.perform_operation('consume', '00000000-0000-0000-0000-0000000000a1',
  '[{"item_id":"00000000-0000-0000-0000-0000000000c1","quantity":2}]');
select results_eq($$select total, level from public.global_alerts()
    where item_id = '00000000-0000-0000-0000-0000000000c1'$$,
  $$values (4, 'critical')$$, 'tras la salida A queda en grave global');
select tests.logout();
select is((select count(*)::int from public.push_outbox), 0, 'los avisos globales no envían push');

-- Validaciones del alcance
select tests.login_as(:'a');
select throws_ok($$select public.admin_save_alert_rule(null, 'X', null,
    array['00000000-0000-0000-0000-0000000000a1'::uuid], 1, null, 'global')$$,
  'P0001', 'invalid_input', 'una regla global no admite localizaciones');
select throws_ok($$select public.admin_save_alert_rule(null, 'X', null, null, 1, null, 'otro')$$,
  'P0001', 'invalid_input', 'alcance desconocido');
select throws_ok($$select public.admin_save_alert_rule(null, 'X', null, null, 1, null, null)$$,
  'P0001', 'invalid_input', 'alcance nulo');

-- Las llamadas de 6 argumentos siguen creando reglas por localización
select public.admin_save_alert_rule(null, 'L1', null,
  array['00000000-0000-0000-0000-0000000000a2'::uuid], 3, null) as l1 \gset
select tests.logout();
select is((select scope from public.alert_rules where id = :'l1'), 'location',
  'sin p_scope la regla es por localización');

-- Pasar L1 a global descarta sus localizaciones
select tests.login_as(:'a');
select public.admin_save_alert_rule(:'l1', 'L1', null, null, 3, null, 'global');
select tests.logout();
select results_eq($$select scope, all_locations from public.alert_rules where id = '$$ || :'l1' || $$'$$,
  $$values ('global'::text, true)$$, 'L1 pasa a global con todas las localizaciones');
select is((select count(*)::int from public.alert_rule_locations where rule_id = :'l1'), 0,
  'L1 ya no tiene localizaciones guardadas');

select throws_ok($$insert into public.alert_rules (name, all_items, all_locations, warning_threshold, scope)
    values ('X', true, false, 1, 'global')$$,
  '23514', null, 'una regla global siempre tiene all_locations');

select * from finish();
rollback;
