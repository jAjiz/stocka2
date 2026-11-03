begin;
\ir _helpers.sql
select tests.clear_seed();
select plan(12);

select tests.create_user('admin@stocka2.test', 'admin') as a \gset
select tests.create_user('u@stocka2.test') as u \gset
select tests.create_user('x@stocka2.test') as x \gset
update public.profiles set active = false where id = :'x';

-- T (almacén), F1 (furgoneta) y F2 (deshabilitada); A y B activos, C deshabilitado
insert into public.locations (id, name, kind, active) values
  ('00000000-0000-0000-0000-0000000000a1', 'T', 'warehouse', true),
  ('00000000-0000-0000-0000-0000000000a2', 'F1', 'vehicle', true),
  ('00000000-0000-0000-0000-0000000000a3', 'F2', 'vehicle', false);
insert into public.item_types (id, name) values ('00000000-0000-0000-0000-0000000000b1', 'Fontaneria');
insert into public.items (id, name, type_id, active) values
  ('00000000-0000-0000-0000-0000000000c1', 'A', '00000000-0000-0000-0000-0000000000b1', true),
  ('00000000-0000-0000-0000-0000000000c2', 'B', '00000000-0000-0000-0000-0000000000b1', true),
  ('00000000-0000-0000-0000-0000000000c3', 'C', '00000000-0000-0000-0000-0000000000b1', false);
insert into public.stock (item_id, location_id, quantity) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a2', 4),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000a2', 10);

-- R1: A en F1, leve 5, grave 2
insert into public.alert_rules (id, name, all_items, all_locations, warning_threshold, critical_threshold)
  values ('00000000-0000-0000-0000-0000000000d1', 'R1', false, false, 5, 2);
insert into public.alert_rule_items values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000c1');
insert into public.alert_rule_locations values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000a2');

select tests.login_as(:'a');
select results_eq($$select item_id, location_id, quantity, level, threshold from public.active_alerts()$$,
  $$values ('00000000-0000-0000-0000-0000000000c1'::uuid, '00000000-0000-0000-0000-0000000000a2'::uuid, 4, 'warning', 5)$$,
  'R1: A=4 en leve con umbral 5');

select tests.logout();
update public.stock set quantity = 2 where item_id = '00000000-0000-0000-0000-0000000000c1';
select tests.login_as(:'a');
select results_eq($$select quantity, level, threshold from public.active_alerts()$$,
  $$values (2, 'critical', 2)$$, 'R1: A=2 en grave con umbral 2');

select tests.logout();
update public.stock set quantity = 6 where item_id = '00000000-0000-0000-0000-0000000000c1';
select tests.login_as(:'a');
select is((select count(*)::int from public.active_alerts()), 0, 'R1: A=6 sin aviso');

-- R2: todos los artículos en F1, leve 3, grave 1 (gana el umbral más alto)
select tests.logout();
update public.stock set quantity = 4 where item_id = '00000000-0000-0000-0000-0000000000c1';
insert into public.alert_rules (id, name, all_items, all_locations, warning_threshold, critical_threshold)
  values ('00000000-0000-0000-0000-0000000000d2', 'R2', true, false, 3, 1);
insert into public.alert_rule_locations values
  ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000a2');
select tests.login_as(:'a');
select results_eq($$select item_id, quantity, level, threshold from public.active_alerts()$$,
  $$values ('00000000-0000-0000-0000-0000000000c1'::uuid, 4, 'warning', 5)$$,
  'R1+R2: A=4 sigue en leve con umbral 5; B (10) no aparece');

select tests.logout();
update public.stock set quantity = 2 where item_id = '00000000-0000-0000-0000-0000000000c1';
select tests.login_as(:'a');
select results_eq($$select quantity, level, threshold from public.active_alerts()$$,
  $$values (2, 'critical', 2)$$, 'R1+R2: A=2 grave con umbral 2');

-- R3: todos, todas, grave 0
select tests.logout();
insert into public.alert_rules (id, name, all_items, all_locations, warning_threshold, critical_threshold)
  values ('00000000-0000-0000-0000-0000000000d3', 'R3', true, true, null, 0);
select tests.login_as(:'a');
select results_eq($$select item_id, location_id, quantity, level, threshold
    from public.active_alerts() where item_id = '00000000-0000-0000-0000-0000000000c2'$$,
  $$values ('00000000-0000-0000-0000-0000000000c2'::uuid, '00000000-0000-0000-0000-0000000000a1'::uuid, 0, 'critical', 0)$$,
  'R3: B en T sin fila de stock aparece con cantidad 0');
select is((select count(*)::int from public.active_alerts()
           where location_id = '00000000-0000-0000-0000-0000000000a3'
              or item_id = '00000000-0000-0000-0000-0000000000c3'), 0,
  'ni localización ni artículo deshabilitados');
select results_eq($$select level, location_id, item_id from public.active_alerts()$$,
  $$select level, location_id, item_id from public.active_alerts()
    order by (level = 'critical') desc, location_id, item_id$$,
  'orden: graves primero, luego localización y artículo');

-- Deshabilitar R3
select tests.logout();
update public.alert_rules set active = false where id = '00000000-0000-0000-0000-0000000000d3';
select tests.login_as(:'a');
select is((select count(*)::int from public.active_alerts()
           where item_id = '00000000-0000-0000-0000-0000000000c2'), 0, 'R3 deshabilitada: B en T desaparece');

-- Usuarios
select tests.login_as(:'x');
select is((select count(*)::int from public.active_alerts()), 0, 'usuario inactivo: 0 filas');
select tests.login_as(:'u');
select results_eq($$select item_id, location_id, quantity, level, threshold from public.active_alerts()$$,
  $$values ('00000000-0000-0000-0000-0000000000c1'::uuid, '00000000-0000-0000-0000-0000000000a2'::uuid, 2, 'critical', 2)$$,
  'usuario activo ve las mismas filas');

select throws_ok($$select * from public.alert_thresholds()$$, '42501', null,
  'alert_thresholds no es ejecutable por authenticated');

select * from finish();
rollback;
