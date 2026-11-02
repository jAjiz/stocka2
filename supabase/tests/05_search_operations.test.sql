begin;
\ir _helpers.sql
select plan(19);

select tests.create_user('boss@stocka2.test', 'admin') as admin_id \gset

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
-- Stock inicial en F2 para poder retirar
insert into public.stock (item_id, location_id, quantity) values (:'a', :'f2', 4);

-- 4 operaciones: add en T, move T->F1, consume en F1 (OT-7), remove en F2
select tests.login_as(:'admin_id');
select public.perform_operation('add', :'t',
  format('[{"item_id":"%s","quantity":10},{"item_id":"%s","quantity":5}]', :'a', :'b')::jsonb) as op1 \gset
select public.perform_operation('move', :'f1',
  format('[{"item_id":"%s","quantity":3}]', :'a')::jsonb, :'t') as op2 \gset
select public.perform_operation('consume', :'f1',
  format('[{"item_id":"%s","quantity":2}]', :'a')::jsonb, null, 'OT-7') as op3 \gset
select public.perform_operation('remove', :'f2',
  format('[{"item_id":"%s","quantity":1}]', :'a')::jsonb) as op4 \gset
select tests.logout();

-- now() es constante en la transacción: fija fechas distintas
update public.operations set created_at = '2026-01-01 10:00+00' where id = :'op1';
update public.operations set created_at = '2026-01-01 11:00+00' where id = :'op2';
update public.operations set created_at = '2026-01-01 12:00+00' where id = :'op3';
update public.operations set created_at = '2026-01-01 13:00+00' where id = :'op4';

select tests.login_as(:'admin_id');

-- Sin filtros
select is((select count(*)::int from public.search_operations()), 4, 'sin filtros: 4 filas');
select is((select id from public.search_operations() limit 1), :'op4'::uuid, 'sin filtros: primera = más reciente');
select is((select array_agg(id) from public.search_operations()),
  array[:'op4', :'op3', :'op2', :'op1']::uuid[], 'orden created_at desc');
select is((select total_count from public.search_operations() limit 1), 4::bigint, 'sin filtros: total_count=4');
select is((select line_count from public.search_operations() where id = :'op1'), 2, 'line_count de add = 2');
select results_eq(
  format($$select kind, origin_id, destination_id, reference, user_id from public.search_operations() where id = '%s'$$, :'op3'),
  format($$values ('consume'::text, '%s'::uuid, null::uuid, 'OT-7'::text, '%s'::uuid)$$, :'f1', :'admin_id'),
  'columnas de cabecera');

-- Filtros
select is((select array_agg(id order by created_at) from public.search_operations(p_location_id => :'f1')),
  array[:'op2', :'op3']::uuid[], 'p_location_id=F1: move y consume');
select is((select count(*)::int from public.search_operations(p_location_id => :'t')), 2, 'p_location_id=T: origen o destino');
select is((select id from public.search_operations(p_item_id => :'b')), :'op1'::uuid, 'p_item_id=B: solo el add');
select is((select count(*)::int from public.search_operations(p_item_id => :'a')), 4, 'p_item_id=A: 4');
select is((select id from public.search_operations(p_reference => 'ot-7')), :'op3'::uuid, 'p_reference ilike');
select is((select id from public.search_operations(p_kind => 'move')), :'op2'::uuid, 'p_kind=move');
select is((select id from public.search_operations(p_origin_id => :'t')), :'op2'::uuid, 'p_origin_id=T');
select is((select id from public.search_operations(p_destination_id => :'t')), :'op1'::uuid, 'p_destination_id=T');
select is((select count(*)::int from public.search_operations(p_user_id => :'admin_id')), 4, 'p_user_id');
select is((select array_agg(id order by created_at) from public.search_operations(
    p_from => '2026-01-01 11:00+00', p_to => '2026-01-01 13:00+00')),
  array[:'op2', :'op3']::uuid[], 'p_from inclusivo, p_to exclusivo');

-- Paginación
select results_eq(
  $$select count(*)::int, min(total_count) from public.search_operations(p_limit => 2, p_offset => 2)$$,
  $$values (2, 4::bigint)$$, 'limit 2 offset 2: 2 filas, total_count=4');

select tests.logout();

-- Permisos de ejecución
select ok(not has_function_privilege('anon',
  'public.search_operations(text, uuid, uuid, uuid, uuid, uuid, timestamptz, timestamptz, text, int, int)', 'execute'),
  'anon sin execute');
select ok(has_function_privilege('authenticated',
  'public.search_operations(text, uuid, uuid, uuid, uuid, uuid, timestamptz, timestamptz, text, int, int)', 'execute'),
  'authenticated con execute');

select * from finish();
rollback;
