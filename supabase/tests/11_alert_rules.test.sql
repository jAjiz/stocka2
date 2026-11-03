begin;
\ir _helpers.sql
select tests.clear_seed();
select plan(26);

select tests.create_user('admin@stocka2.test', 'admin') as a \gset
select tests.create_user('u@stocka2.test') as u \gset

insert into public.locations (id, name, kind) values
  ('00000000-0000-0000-0000-0000000000a1', 'Taller', 'warehouse'),
  ('00000000-0000-0000-0000-0000000000a2', 'Furgoneta 1', 'vehicle');
insert into public.item_types (id, name) values ('00000000-0000-0000-0000-0000000000b1', 'Fontaneria');
insert into public.items (id, name, type_id) values
  ('00000000-0000-0000-0000-0000000000c1', 'A', '00000000-0000-0000-0000-0000000000b1'),
  ('00000000-0000-0000-0000-0000000000c2', 'B', '00000000-0000-0000-0000-0000000000b1');

-- Regla "Todo": todos los artículos y todas las localizaciones
select tests.login_as(:'a');
select public.admin_save_alert_rule(null, 'Todo', null, null, 5, 2) as r1 \gset
select is((select all_items and all_locations from public.alert_rules where id = :'r1'), true,
  'null = todos los artículos y todas las localizaciones');
select is((select count(*)::int from public.alert_rule_items where rule_id = :'r1')
        + (select count(*)::int from public.alert_rule_locations where rule_id = :'r1'), 0,
  'las banderas no guardan filas en las listas');

-- Solo administradores
select tests.login_as(:'u');
select throws_ok($$select public.admin_save_alert_rule(null, 'R', null, null, 5, 2)$$,
  'P0001', 'forbidden', 'usuario no crea reglas');
select throws_ok($$select public.admin_set_alert_rule_active(gen_random_uuid(), false)$$,
  'P0001', 'forbidden', 'usuario no activa reglas');
select throws_ok($$select public.admin_delete_alert_rule(gen_random_uuid())$$,
  'P0001', 'forbidden', 'usuario no borra reglas');
select is((select count(*)::int from public.alert_rules), 0, 'usuario no ve las reglas');

select tests.login_as(:'a');
select is((select count(*)::int from public.alert_rules), 1, 'el admin ve las reglas');

-- Regla con listas
select public.admin_save_alert_rule(null, 'A en F1',
  array['00000000-0000-0000-0000-0000000000c1']::uuid[],
  array['00000000-0000-0000-0000-0000000000a2']::uuid[], null, 1) as r2 \gset
select is((select not all_items and not all_locations from public.alert_rules where id = :'r2'), true,
  'con listas no hay banderas');
select is((select count(*)::int from public.alert_rule_items where rule_id = :'r2'), 1, 'un artículo');
select is((select count(*)::int from public.alert_rule_locations where rule_id = :'r2'), 1, 'una localización');

-- Editar sustituye las listas
select public.admin_save_alert_rule(:'r2', 'A y B',
  array['00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c2']::uuid[],
  null, null, 1);
select is((select count(*)::int from public.alert_rule_items where rule_id = :'r2'), 2, 'sustituye artículos');
select is((select all_locations from public.alert_rules where id = :'r2'), true, 'localizaciones pasan a todas');
select is((select count(*)::int from public.alert_rule_locations where rule_id = :'r2'), 0,
  'y se vacía la lista de localizaciones');
select is((select name from public.alert_rules where id = :'r2'), 'A y B', 'actualiza el nombre');

-- Umbrales no válidos
select throws_ok($$select public.admin_save_alert_rule(null, 'R', null, null, null, null)$$,
  'P0001', 'invalid_thresholds', 'sin umbrales');
select throws_ok($$select public.admin_save_alert_rule(null, 'R', null, null, 2, 2)$$,
  'P0001', 'invalid_thresholds', 'grave igual a leve');
select throws_ok($$select public.admin_save_alert_rule(null, 'R', null, null, 2, 3)$$,
  'P0001', 'invalid_thresholds', 'grave mayor que leve');
select throws_ok($$select public.admin_save_alert_rule(null, 'R', null, null, -1, null)$$,
  'P0001', 'invalid_thresholds', 'umbral negativo');

-- Entradas no válidas
select throws_ok($$select public.admin_save_alert_rule(null, '  ', null, null, 5, 2)$$,
  'P0001', 'invalid_input', 'nombre vacío');
select throws_ok($$select public.admin_save_alert_rule(null, 'R', '{}'::uuid[], null, 5, 2)$$,
  'P0001', 'invalid_input', 'lista de artículos vacía');
select throws_ok($$select public.admin_save_alert_rule(null, 'R',
    array['00000000-0000-0000-0000-0000000000ff']::uuid[], null, 5, 2)$$,
  'P0001', 'invalid_input', 'artículo inexistente');

-- Activar, borrar
select public.admin_set_alert_rule_active(:'r2', false);
select is((select active from public.alert_rules where id = :'r2'), false, 'desactiva la regla');
select public.admin_delete_alert_rule(:'r2');
select is((select count(*)::int from public.alert_rules where id = :'r2')
        + (select count(*)::int from public.alert_rule_items where rule_id = :'r2'), 0,
  'borra la regla y sus listas');
select throws_ok($$select public.admin_delete_alert_rule(gen_random_uuid())$$,
  'P0001', 'not_found', 'regla inexistente');

-- Borrar un artículo sin historial lo quita de las reglas
select public.admin_save_alert_rule(null, 'AB',
  array['00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c2']::uuid[],
  null, 3, null) as r3 \gset
select public.admin_delete_item('00000000-0000-0000-0000-0000000000c2');
select is((select count(*)::int from public.alert_rule_items where rule_id = :'r3'), 1,
  'borrar un artículo lo quita de la regla');

-- anon
select tests.logout();
set local role anon;
select throws_ok($$select public.admin_save_alert_rule(null, 'R', null, null, 5, 2)$$, '42501', null,
  'anon no ejecuta RPC de admin');
reset role;

select * from finish();
rollback;
