begin;
\ir _helpers.sql
select tests.clear_seed();
select plan(42);

-- Datos: Taller (T), Furgoneta 1 (F1), Furgoneta 2 (F2); artículos A y B
select tests.create_user('u@stocka2.test') as u \gset
select tests.create_user('boss@stocka2.test', 'admin') as admin_id \gset
select tests.create_user('x@stocka2.test') as x \gset

\set t  '00000000-0000-0000-0000-0000000000a1'
\set f1 '00000000-0000-0000-0000-0000000000a2'
\set f2 '00000000-0000-0000-0000-0000000000a3'
\set a  '00000000-0000-0000-0000-0000000000c1'
\set b  '00000000-0000-0000-0000-0000000000c2'

insert into public.locations (id, name, kind) values
  (:'t', 'Taller', 'warehouse'),
  (:'f1', 'Furgoneta 1', 'vehicle'),
  (:'f2', 'Furgoneta 2', 'vehicle');
insert into public.item_types (id, name) values ('00000000-0000-0000-0000-0000000000b1', 'Tipo');
insert into public.items (id, name, type_id) values
  (:'a', 'A', '00000000-0000-0000-0000-0000000000b1'),
  (:'b', 'B', '00000000-0000-0000-0000-0000000000b1');
insert into public.location_permissions values (:'u', :'f1'), (:'x', :'f1');
update public.profiles set active = false where id = :'x';

-- Captura el error de una sentencia como jsonb {state, message, detail}
create function tests.error_of(p_sql text) returns jsonb
language plpgsql as $f$
declare v_state text; v_msg text; v_detail text;
begin
  execute p_sql;
  return null;
exception when others then
  get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text, v_detail = pg_exception_detail;
  return jsonb_build_object('state', v_state, 'message', v_msg, 'detail', v_detail);
end $f$;

create function tests.qty(p_item uuid, p_loc uuid) returns int
language sql as $f$
  select coalesce((select quantity from public.stock where item_id = p_item and location_id = p_loc), 0)
$f$;

-- 1. admin: add en T de A×10 y B×5
select tests.login_as(:'admin_id');
select public.perform_operation('add', :'t',
  format('[{"item_id":"%s","quantity":10},{"item_id":"%s","quantity":5}]', :'a', :'b')::jsonb) as op1 \gset
select tests.logout();

select is(tests.qty(:'a', :'t'), 10, 'add: T A=10');
select is(tests.qty(:'b', :'t'), 5, 'add: T B=5');
select is((select count(*)::int from public.operations where id = :'op1'), 1, 'add: una cabecera');
select is((select count(*)::int from public.operation_lines where operation_id = :'op1'), 2, 'add: dos líneas');
select results_eq(
  format($$select kind, origin_id, destination_id, user_id, reference, notes
           from public.operations where id = '%s'$$, :'op1'),
  format($$values ('add'::text, null::uuid, '%s'::uuid, '%s'::uuid, null::text, null::text)$$, :'t', :'admin_id'),
  'add: cabecera correcta');

-- 2. u: move a F1 desde T de A×3 (u no tiene permiso en T)
select tests.login_as(:'u');
select public.perform_operation('move', :'f1',
  format('[{"item_id":"%s","quantity":3}]', :'a')::jsonb, :'t') as op2 \gset
select tests.logout();

select is(tests.qty(:'a', :'t'), 7, 'move: T A=7');
select is(tests.qty(:'a', :'f1'), 3, 'move: F1 A=3');
select results_eq(
  format($$select kind, origin_id, destination_id, user_id from public.operations where id = '%s'$$, :'op2'),
  format($$values ('move'::text, '%s'::uuid, '%s'::uuid, '%s'::uuid)$$, :'t', :'f1', :'u'),
  'move: cabecera correcta');

-- 3. u: consume en F1 de A×2 con referencia ' OT-1 ' y notas '  '
select tests.login_as(:'u');
select public.perform_operation('consume', :'f1',
  format('[{"item_id":"%s","quantity":2}]', :'a')::jsonb, null, ' OT-1 ', '  ') as op3 \gset
select tests.logout();

select is(tests.qty(:'a', :'f1'), 1, 'consume: F1 A=1');
select is((select reference from public.operations where id = :'op3'), 'OT-1', 'consume: referencia recortada');
select is((select notes from public.operations where id = :'op3'), null, 'consume: notas en blanco -> null');
select results_eq(
  format($$select origin_id, destination_id from public.operations where id = '%s'$$, :'op3'),
  format($$values ('%s'::uuid, null::uuid)$$, :'f1'),
  'consume: origen F1, sin destino');

-- 4. Permisos
select tests.login_as(:'u');
select throws_ok(
  format($$select public.perform_operation('move', '%s', '[{"item_id":"%s","quantity":1}]'::jsonb, '%s')$$,
         :'t', :'a', :'f1'),
  'P0001', 'forbidden', 'u no puede mover a T');
select throws_ok(
  format($$select public.perform_operation('remove', '%s', '[{"item_id":"%s","quantity":1}]'::jsonb)$$,
         :'t', :'a'),
  'P0001', 'forbidden', 'u no puede retirar de T');
select tests.logout();

select tests.login_as(:'x');
select throws_ok(
  format($$select public.perform_operation('consume', '%s', '[{"item_id":"%s","quantity":1}]'::jsonb)$$,
         :'f1', :'a'),
  'P0001', 'forbidden', 'usuario desactivado: forbidden');
select tests.logout();

-- 5. Atomicidad: consume en F1 de A×1 y B×1 (F1 no tiene B)
select count(*)::int as ops_before from public.operations \gset
select count(*)::int as lines_before from public.operation_lines \gset

select tests.login_as(:'u');
select tests.error_of(
  format($$select public.perform_operation('consume', '%s',
           '[{"item_id":"%s","quantity":1},{"item_id":"%s","quantity":1}]'::jsonb)$$,
         :'f1', :'a', :'b')) as err \gset
select tests.logout();

select is(:'err'::jsonb->>'state', 'P0001', 'insufficient_stock: sqlstate P0001');
select is(:'err'::jsonb->>'message', 'insufficient_stock', 'insufficient_stock: mensaje');
select is((:'err'::jsonb->>'detail')::jsonb,
  format('[{"item_id":"%s","available":0,"requested":1}]', :'b')::jsonb,
  'insufficient_stock: detail solo con B (available 0, requested 1)');
select is(tests.qty(:'a', :'f1'), 1, 'atomicidad: F1 A sigue en 1');
select is((select count(*)::int from public.operations), :ops_before, 'atomicidad: no se crean operaciones');
select is((select count(*)::int from public.operation_lines), :lines_before, 'atomicidad: no se crean líneas');
select is((select count(*)::int from public.stock where location_id = :'f1' and item_id = :'b'), 0,
  'atomicidad: no queda fila de stock para B en F1');

-- Todas las líneas que fallan aparecen en el detail
select tests.login_as(:'u');
select tests.error_of(
  format($$select public.perform_operation('consume', '%s',
           '[{"item_id":"%s","quantity":5},{"item_id":"%s","quantity":2}]'::jsonb)$$,
         :'f1', :'a', :'b')) as err2 \gset
select tests.logout();
select is((:'err2'::jsonb->>'detail')::jsonb,
  format('[{"item_id":"%s","available":1,"requested":5},{"item_id":"%s","available":0,"requested":2}]', :'a', :'b')::jsonb,
  'insufficient_stock: detail con todas las líneas que fallan');

-- 6. duplicate_item
select tests.login_as(:'admin_id');
select throws_ok(
  format($$select public.perform_operation('add', '%s',
           '[{"item_id":"%s","quantity":1},{"item_id":"%s","quantity":2}]'::jsonb)$$, :'t', :'a', :'a'),
  'P0001', 'duplicate_item', 'misma línea dos veces -> duplicate_item');

-- 7. invalid_operation, cada caso por separado
select throws_ok(
  format($$select public.perform_operation('add', '%s', '[{"item_id":"%s","quantity":0}]'::jsonb)$$, :'t', :'a'),
  'P0001', 'invalid_operation', 'cantidad 0');
select throws_ok(
  format($$select public.perform_operation('add', '%s', '[{"item_id":"%s","quantity":1.5}]'::jsonb)$$, :'t', :'a'),
  'P0001', 'invalid_operation', 'cantidad 1.5');
select throws_ok(
  format($$select public.perform_operation('add', '%s', '[{"item_id":"%s","quantity":-2}]'::jsonb)$$, :'t', :'a'),
  'P0001', 'invalid_operation', 'cantidad negativa');
select throws_ok(
  format($$select public.perform_operation('add', '%s', '[{"item_id":"%s","quantity":"2"}]'::jsonb)$$, :'t', :'a'),
  'P0001', 'invalid_operation', 'cantidad como texto');
select throws_ok(
  format($$select public.perform_operation('add', '%s', '[{"quantity":2}]'::jsonb)$$, :'t'),
  'P0001', 'invalid_operation', 'línea sin item_id');
select throws_ok(
  format($$select public.perform_operation('add', '%s', '[]'::jsonb)$$, :'t'),
  'P0001', 'invalid_operation', 'líneas []');
select throws_ok(
  format($$select public.perform_operation('move', '%s', '[{"item_id":"%s","quantity":1}]'::jsonb)$$, :'f1', :'a'),
  'P0001', 'invalid_operation', 'move sin origen');
select throws_ok(
  format($$select public.perform_operation('move', '%s', '[{"item_id":"%s","quantity":1}]'::jsonb, '%s')$$,
         :'f1', :'a', :'f1'),
  'P0001', 'invalid_operation', 'move con origen = destino');
select throws_ok(
  format($$select public.perform_operation('add', '%s', '[{"item_id":"%s","quantity":1}]'::jsonb, null, 'OT-9')$$,
         :'t', :'a'),
  'P0001', 'invalid_operation', 'add con referencia');
select throws_ok(
  format($$select public.perform_operation('add', '%s', '[{"item_id":"%s","quantity":1}]'::jsonb, '%s')$$,
         :'t', :'a', :'f1'),
  'P0001', 'invalid_operation', 'add con origen');
select throws_ok(
  format($$select public.perform_operation('steal', '%s', '[{"item_id":"%s","quantity":1}]'::jsonb)$$, :'t', :'a'),
  'P0001', 'invalid_operation', 'tipo de operación desconocido');
select tests.logout();

-- 8. inactive_location / inactive_item
update public.locations set active = false where id = :'f2';
select tests.login_as(:'u');
select throws_ok(
  format($$select public.perform_operation('move', '%s', '[{"item_id":"%s","quantity":1}]'::jsonb, '%s')$$,
         :'f1', :'a', :'f2'),
  'P0001', 'inactive_location', 'move desde F2 inactiva -> inactive_location');
select tests.logout();

update public.items set active = false where id = :'b';
select tests.login_as(:'admin_id');
select throws_ok(
  format($$select public.perform_operation('add', '%s', '[{"item_id":"%s","quantity":1}]'::jsonb)$$, :'t', :'b'),
  'P0001', 'inactive_item', 'add de B inactivo -> inactive_item');

-- 9. remove: deja el stock a 0
select isnt(
  public.perform_operation('remove', :'t', format('[{"item_id":"%s","quantity":7}]', :'a')::jsonb),
  null, 'remove devuelve id');
select tests.logout();
select is(tests.qty(:'a', :'t'), 0, 'remove: T A=0');

-- 10. anon: sin permiso de ejecución
select set_config('request.jwt.claims', '', true);
set local role anon;
select throws_ok(
  format($$select public.perform_operation('add', '%s', '[{"item_id":"%s","quantity":1}]'::jsonb)$$, :'t', :'a'),
  '42501', null, 'anon no puede ejecutar perform_operation');
select tests.logout();

select ok(not has_function_privilege('anon',
  'public.perform_operation(text, uuid, jsonb, uuid, text, text)', 'execute'), 'anon sin execute');
select ok(has_function_privilege('authenticated',
  'public.perform_operation(text, uuid, jsonb, uuid, text, text)', 'execute'), 'authenticated con execute');

select * from finish();
rollback;
