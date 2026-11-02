begin;
\ir _helpers.sql
select tests.clear_seed();
select plan(11);

-- Reintento tras perder la respuesta: el mismo p_operation_id no duplica la operación.
select tests.create_user('u@stocka2.test') as u \gset
select tests.create_user('otro@stocka2.test') as otro \gset

\set f1 '00000000-0000-0000-0000-0000000000a2'
\set a  '00000000-0000-0000-0000-0000000000c1'
\set opid '00000000-0000-4000-8000-00000000d001'

insert into public.locations (id, name, kind) values (:'f1', 'Furgoneta 1', 'vehicle');
insert into public.item_types (id, name) values ('00000000-0000-0000-0000-0000000000b1', 'Tipo');
insert into public.items (id, name, type_id) values (:'a', 'A', '00000000-0000-0000-0000-0000000000b1');
insert into public.location_permissions values (:'u', :'f1'), (:'otro', :'f1');
insert into public.stock (item_id, location_id, quantity) values (:'a', :'f1', 10);

select tests.login_as(:'u');
select public.perform_operation('consume', :'f1',
  format('[{"item_id":"%s","quantity":3}]', :'a')::jsonb,
  null, 'REF-1', null, :'opid') as first_id \gset
select public.perform_operation('consume', :'f1',
  format('[{"item_id":"%s","quantity":3}]', :'a')::jsonb,
  null, 'REF-1', null, :'opid') as second_id \gset
select tests.logout();

select is(:'first_id'::uuid, :'opid'::uuid, 'la cabecera usa el id recibido');
select is(:'second_id'::uuid, :'opid'::uuid, 'el reintento devuelve el mismo id');
select is((select quantity from public.stock where item_id = :'a' and location_id = :'f1'), 7,
  'el stock cambia una sola vez');
select is((select count(*)::int from public.operations), 1, 'una sola operación');
select is((select count(*)::int from public.operation_lines), 1, 'una sola línea');

-- Otro usuario reutilizando el id: invalid_operation, sin cambios.
select tests.login_as(:'otro');
select throws_ok(
  format($$select public.perform_operation('consume', '%s',
    '[{"item_id":"%s","quantity":1}]'::jsonb, null, null, null, '%s')$$, :'f1', :'a', :'opid'),
  'P0001', 'invalid_operation', 'otro usuario con el mismo id: invalid_operation');
select tests.logout();
select is((select quantity from public.stock where item_id = :'a' and location_id = :'f1'), 7,
  'el stock no cambia');

-- Sin p_operation_id: se genera uno nuevo (comportamiento anterior).
select tests.login_as(:'u');
select public.perform_operation('consume', :'f1',
  format('[{"item_id":"%s","quantity":1}]', :'a')::jsonb) as third_id \gset
select tests.logout();
select isnt(:'third_id'::uuid, :'opid'::uuid, 'sin id se genera uno nuevo');
select is((select count(*)::int from public.operations), 2, 'dos operaciones');

-- Una sola firma, solo para authenticated.
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = 'perform_operation'), 1,
  'una sola función perform_operation');
select ok(not has_function_privilege('anon',
  'public.perform_operation(text, uuid, jsonb, uuid, text, text, uuid)', 'execute')
  and has_function_privilege('authenticated',
  'public.perform_operation(text, uuid, jsonb, uuid, text, text, uuid)', 'execute'),
  'execute solo para authenticated');

select * from finish();
rollback;
