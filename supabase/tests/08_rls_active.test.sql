begin;
\ir _helpers.sql
select tests.clear_seed();
select plan(19);

-- Un usuario activo y otro desactivado, con el mismo permiso, stock y una operación visibles.
select tests.create_user('u@stocka2.test') as u \gset
select tests.create_user('x@stocka2.test') as x \gset
update public.profiles set active = false where id = :'x';

insert into public.locations (id, name, kind) values
  ('00000000-0000-0000-0000-0000000000a1', 'Almacen', 'warehouse');
insert into public.item_types (id, name) values ('00000000-0000-0000-0000-0000000000b1', 'Tipo');
insert into public.items (id, name, type_id) values
  ('00000000-0000-0000-0000-0000000000c1', 'Tornillo', '00000000-0000-0000-0000-0000000000b1');
insert into public.stock (item_id, location_id, quantity) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a1', 5);
insert into public.location_permissions values
  (:'u', '00000000-0000-0000-0000-0000000000a1'),
  (:'x', '00000000-0000-0000-0000-0000000000a1');
insert into public.operations (id, kind, destination_id, user_id) values
  ('00000000-0000-0000-0000-0000000000d1', 'add', '00000000-0000-0000-0000-0000000000a1', :'u');
insert into public.operation_lines (operation_id, item_id, quantity) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000c1', 5);

create function tests.visible(p_table text) returns int
language plpgsql as $f$
declare n int;
begin execute format('select count(*)::int from public.%I', p_table) into n; return n; end $f$;

grant execute on function tests.visible(text) to authenticated, anon;

-- Activo: ve datos en todas las tablas
select tests.login_as(:'u');
select ok(tests.visible('profiles') > 0, 'activo ve profiles');
select ok(tests.visible('locations') > 0, 'activo ve locations');
select ok(tests.visible('item_types') > 0, 'activo ve item_types');
select ok(tests.visible('items') > 0, 'activo ve items');
select ok(tests.visible('stock') > 0, 'activo ve stock');
select ok(tests.visible('operations') > 0, 'activo ve operations');
select ok(tests.visible('operation_lines') > 0, 'activo ve operation_lines');
select ok(tests.visible('location_permissions') > 0, 'activo ve location_permissions');

-- Desactivado con un JWT aún válido: no ve nada
select tests.login_as(:'x');
select is(tests.visible('profiles'), 0, 'desactivado no ve profiles');
select is(tests.visible('locations'), 0, 'desactivado no ve locations');
select is(tests.visible('item_types'), 0, 'desactivado no ve item_types');
select is(tests.visible('items'), 0, 'desactivado no ve items');
select is(tests.visible('stock'), 0, 'desactivado no ve stock');
select is(tests.visible('operations'), 0, 'desactivado no ve operations');
select is(tests.visible('operation_lines'), 0, 'desactivado no ve operation_lines');
select is(tests.visible('location_permissions'), 0, 'desactivado no ve location_permissions');
select is((select count(*)::int from public.search_operations()), 0,
  'desactivado: search_operations vacío');
select is(public.is_active(), false, 'is_active() es false para el desactivado');

-- anon no puede llamar a is_active
select tests.logout();
set local role anon;
select throws_ok('select public.is_active()', '42501', null, 'anon no ejecuta is_active');
reset role;

select * from finish();
rollback;
