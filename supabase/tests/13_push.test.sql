begin;
\ir _helpers.sql
select tests.clear_seed();
-- Sin secreto en Vault salvo donde se indique (el seed crea stocka2_push_url).
delete from vault.secrets where name = 'stocka2_push_url';
select plan(31);

select tests.create_user('admin@stocka2.test', 'admin') as a \gset
select tests.create_user('u1@stocka2.test') as u1 \gset
select tests.create_user('u2@stocka2.test') as u2 \gset
select tests.create_user('x@stocka2.test') as x \gset

-- T (almacén), F1 y F2 (furgonetas); A con 5 en F1; B, C, D y E con 1 en F1
insert into public.locations (id, name, kind) values
  ('00000000-0000-0000-0000-0000000000a1', 'T', 'warehouse'),
  ('00000000-0000-0000-0000-0000000000a2', 'F1', 'vehicle'),
  ('00000000-0000-0000-0000-0000000000a3', 'F2', 'vehicle');
insert into public.location_permissions (user_id, location_id) values
  (:'u1', '00000000-0000-0000-0000-0000000000a2'),
  (:'u2', '00000000-0000-0000-0000-0000000000a3'),
  (:'x',  '00000000-0000-0000-0000-0000000000a2');
update public.profiles set active = false where id = :'x';
insert into public.item_types (id, name) values ('00000000-0000-0000-0000-0000000000b1', 'Fontaneria');
insert into public.items (id, name, type_id) values
  ('00000000-0000-0000-0000-0000000000c1', 'A', '00000000-0000-0000-0000-0000000000b1'),
  ('00000000-0000-0000-0000-0000000000c2', 'B', '00000000-0000-0000-0000-0000000000b1'),
  ('00000000-0000-0000-0000-0000000000c3', 'C', '00000000-0000-0000-0000-0000000000b1'),
  ('00000000-0000-0000-0000-0000000000c4', 'D', '00000000-0000-0000-0000-0000000000b1'),
  ('00000000-0000-0000-0000-0000000000c5', 'E', '00000000-0000-0000-0000-0000000000b1');
insert into public.stock (item_id, location_id, quantity) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a2', 5),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000a2', 1),
  ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000a2', 1),
  ('00000000-0000-0000-0000-0000000000c4', '00000000-0000-0000-0000-0000000000a2', 1),
  ('00000000-0000-0000-0000-0000000000c5', '00000000-0000-0000-0000-0000000000a2', 1);

-- Regla: A en todas las localizaciones, grave 2
insert into public.alert_rules (id, name, all_items, all_locations, warning_threshold, critical_threshold)
  values ('00000000-0000-0000-0000-0000000000d1', 'R1', false, true, null, 2);
insert into public.alert_rule_items values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000c1');

select count(*) as q0 from net.http_request_queue \gset

---------------------------------------------------------------------------
-- Encolado
---------------------------------------------------------------------------
select tests.login_as(:'u1');
select public.perform_operation('consume', '00000000-0000-0000-0000-0000000000a2',
  '[{"item_id":"00000000-0000-0000-0000-0000000000c1","quantity":2}]');
select tests.logout();
select is((select count(*)::int from public.push_outbox), 0, 'A queda en 3 (> grave 2): sin filas');

select tests.login_as(:'u1');
select public.perform_operation('consume', '00000000-0000-0000-0000-0000000000a2',
  '[{"item_id":"00000000-0000-0000-0000-0000000000c1","quantity":1}]') as op2 \gset
select tests.logout();
select results_eq($$select user_id from public.push_outbox order by user_id$$,
  format($$select unnest(array[%L, %L]::uuid[]) order by 1$$, :'a', :'u1'),
  'A queda en 2: filas para a y u1 (ni u2 ni x)');
select is((select count(*)::int from public.push_outbox where operation_id <> :'op2'), 0,
  'las filas son de esa operación');
select is((select distinct title from public.push_outbox), 'Stock crítico en F1', 'title');
select is((select distinct body from public.push_outbox), 'A: quedan 2 (umbral 2)', 'body');
select is((select distinct url from public.push_outbox),
  '/localizaciones/00000000-0000-0000-0000-0000000000a2', 'url');
select is((select count(*)::int from public.push_outbox where sent_at is not null), 0, 'pendientes');

select tests.login_as(:'u1');
select public.perform_operation('consume', '00000000-0000-0000-0000-0000000000a2',
  '[{"item_id":"00000000-0000-0000-0000-0000000000c1","quantity":1}]', null, null, null,
  '00000000-0000-0000-0000-0000000000e1');
select tests.logout();
select is((select count(*)::int from public.push_outbox), 4, 'A queda en 1: 2 filas nuevas');

select tests.login_as(:'u1');
select public.perform_operation('add', '00000000-0000-0000-0000-0000000000a2',
  '[{"item_id":"00000000-0000-0000-0000-0000000000c1","quantity":1}]');
select tests.logout();
select is((select count(*)::int from public.push_outbox), 4, 'add: ninguna fila nueva');

select tests.login_as(:'u1');
select is(public.perform_operation('consume', '00000000-0000-0000-0000-0000000000a2',
  '[{"item_id":"00000000-0000-0000-0000-0000000000c1","quantity":1}]', null, null, null,
  '00000000-0000-0000-0000-0000000000e1'), '00000000-0000-0000-0000-0000000000e1'::uuid,
  'reintento: mismo id');
select tests.logout();
select is((select count(*)::int from public.push_outbox), 4, 'reintento: ninguna fila nueva');

-- move de F1 a F2 hecho por a: cuenta el origen (F1 queda en 1)
select tests.login_as(:'a');
select public.perform_operation('move', '00000000-0000-0000-0000-0000000000a3',
  '[{"item_id":"00000000-0000-0000-0000-0000000000c1","quantity":1}]',
  '00000000-0000-0000-0000-0000000000a2') as op_move \gset
select tests.logout();
select results_eq(format($$select user_id from public.push_outbox where operation_id = %L order by user_id$$, :'op_move'),
  format($$select unnest(array[%L, %L]::uuid[]) order by 1$$, :'a', :'u1'),
  'move: filas para a y u1, ninguna para u2');
select is((select distinct title from public.push_outbox where operation_id = :'op_move'),
  'Stock crítico en F1', 'move: la localización es el origen');

-- Más de 4 artículos: 3 líneas y "y <n> más"
insert into public.alert_rules (id, name, all_items, all_locations, warning_threshold, critical_threshold)
  values ('00000000-0000-0000-0000-0000000000d2', 'R2', true, false, null, 0);
insert into public.alert_rule_locations values
  ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000a2');
select tests.login_as(:'u1');
select public.perform_operation('consume', '00000000-0000-0000-0000-0000000000a2',
  '[{"item_id":"00000000-0000-0000-0000-0000000000c5","quantity":1},
    {"item_id":"00000000-0000-0000-0000-0000000000c4","quantity":1},
    {"item_id":"00000000-0000-0000-0000-0000000000c3","quantity":1},
    {"item_id":"00000000-0000-0000-0000-0000000000c2","quantity":1},
    {"item_id":"00000000-0000-0000-0000-0000000000c1","quantity":1}]') as op5 \gset
select tests.logout();
select is((select distinct body from public.push_outbox where operation_id = :'op5'),
  E'A: quedan 0 (umbral 2)\nB: quedan 0 (umbral 0)\nC: quedan 0 (umbral 0)\ny 2 más',
  '5 artículos: 3 líneas por nombre y "y 2 más"');

---------------------------------------------------------------------------
-- Llamada a send-push (pg_net)
---------------------------------------------------------------------------
select is((select count(*) from net.http_request_queue), :'q0'::bigint,
  'sin secreto en Vault: ninguna petición encolada');

select vault.create_secret('http://example.test/send-push', 'stocka2_push_url');
select tests.login_as(:'u1');
select public.perform_operation('add', '00000000-0000-0000-0000-0000000000a2',
  '[{"item_id":"00000000-0000-0000-0000-0000000000c1","quantity":1}]');
select public.perform_operation('consume', '00000000-0000-0000-0000-0000000000a2',
  '[{"item_id":"00000000-0000-0000-0000-0000000000c1","quantity":1}]');
select tests.logout();
select is((select count(*) from net.http_request_queue), :'q0'::bigint + 1,
  'con secreto: una petición encolada');
select is((select url from net.http_request_queue order by id desc limit 1),
  'http://example.test/send-push', 'la petición va a la URL del secreto');

---------------------------------------------------------------------------
-- Un fallo al encolar no hace fallar perform_operation
---------------------------------------------------------------------------
alter table public.push_outbox rename to push_outbox_renamed;
select tests.login_as(:'u1');
select public.perform_operation('add', '00000000-0000-0000-0000-0000000000a2',
  '[{"item_id":"00000000-0000-0000-0000-0000000000c1","quantity":1}]');
select isnt(public.perform_operation('consume', '00000000-0000-0000-0000-0000000000a2',
  '[{"item_id":"00000000-0000-0000-0000-0000000000c1","quantity":1}]'), null,
  'enqueue_critical_alerts falla: perform_operation devuelve id');
select tests.logout();
select is((select quantity from public.stock
           where item_id = '00000000-0000-0000-0000-0000000000c1'
             and location_id = '00000000-0000-0000-0000-0000000000a2'), 0,
  'enqueue_critical_alerts falla: el stock cambia');
alter table public.push_outbox_renamed rename to push_outbox;

---------------------------------------------------------------------------
-- Suscripciones
---------------------------------------------------------------------------
select tests.login_as(:'u1');
select public.save_push_subscription('e1', 'k', 's', null);
select tests.login_as(:'u2');
select public.save_push_subscription('e1', 'k2', 's2', 'Firefox');
select tests.logout();
select results_eq($$select user_id, p256dh, auth, user_agent from public.push_subscriptions$$,
  format($$values (%L::uuid, 'k2', 's2', 'Firefox')$$, :'u2'),
  'un endpoint pertenece al último usuario que lo activó');

select tests.login_as(:'u2');
select is((select count(*)::int from public.push_subscriptions), 1, 'u2 ve su suscripción');
select tests.login_as(:'u1');
select is((select count(*)::int from public.push_subscriptions), 0, 'u1 no ve la de u2');
select public.delete_push_subscription('e1');
select tests.logout();
select is((select count(*)::int from public.push_subscriptions), 1, 'u1 no borra la de u2');
select tests.login_as(:'u2');
select public.delete_push_subscription('e1');
select public.delete_push_subscription('no-existe');
select tests.logout();
select is((select count(*)::int from public.push_subscriptions), 0, 'u2 borra la suya');

select tests.login_as(:'x');
select throws_ok($$select public.save_push_subscription('e2', 'k', 's', null)$$,
  'P0001', 'forbidden', 'perfil inactivo: forbidden');
select tests.login_as(:'u1');
select throws_ok($$select public.save_push_subscription('e2', 'k', '', null)$$,
  'P0001', 'invalid_input', 'auth vacío: invalid_input');

---------------------------------------------------------------------------
-- claim_push_outbox
---------------------------------------------------------------------------
select is((select count(*)::int from public.push_outbox), 0, 'authenticated no ve push_outbox');
select throws_ok($$select * from public.claim_push_outbox()$$, '42501', null,
  'claim_push_outbox no es ejecutable por authenticated');
select throws_ok($$select public.enqueue_critical_alerts(null, null)$$, '42501', null,
  'enqueue_critical_alerts no es ejecutable por authenticated');
select tests.logout();

select count(*)::int as pending from public.push_outbox where sent_at is null \gset
set local role service_role;
select is((select count(*)::int from public.claim_push_outbox()), :'pending'::int,
  'service_role reclama las pendientes');
select is((select count(*)::int from public.claim_push_outbox()), 0, 'segunda llamada: 0 filas');
reset role;

select * from finish();
rollback;
