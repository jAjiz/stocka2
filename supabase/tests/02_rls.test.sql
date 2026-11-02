begin;
\ir _helpers.sql
select tests.clear_seed();
select plan(22);

select tests.create_user('u1@stocka2.test') as u1 \gset
select tests.create_user('u2@stocka2.test') as u2 \gset
select tests.create_user('boss@stocka2.test', 'admin') as admin_id \gset

insert into public.locations (id, name, kind, active) values
  ('00000000-0000-0000-0000-0000000000a1', 'Almacen', 'warehouse', true),
  ('00000000-0000-0000-0000-0000000000a3', 'Cerrado', 'warehouse', false);
insert into public.item_types (id, name) values ('00000000-0000-0000-0000-0000000000b1', 'Tipo');
insert into public.items (id, name, type_id) values
  ('00000000-0000-0000-0000-0000000000c1', 'Tornillo', '00000000-0000-0000-0000-0000000000b1');
insert into public.items (id, name, type_id) values
  ('00000000-0000-0000-0000-0000000000c2', 'Tuerca', '00000000-0000-0000-0000-0000000000b1');
insert into public.stock (item_id, location_id, quantity) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a1', 5),
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a3', 7);
insert into public.location_permissions values
  (:'u1', '00000000-0000-0000-0000-0000000000a1'),
  (:'u2', '00000000-0000-0000-0000-0000000000a1');

-- Una operación con su línea (insertada como postgres) para probar que el historial es inmutable.
insert into public.operations (id, kind, destination_id, user_id) values
  ('00000000-0000-0000-0000-0000000000d1', 'add', '00000000-0000-0000-0000-0000000000a1', :'admin_id');
insert into public.operation_lines (operation_id, item_id, quantity) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000c1', 5);

create function tests.rows_affected(p_sql text) returns int
language plpgsql as $f$
declare n int;
begin execute p_sql; get diagnostics n = row_count; return n; end $f$;

-- Usuario normal: sin escrituras
select tests.login_as(:'u1');

select throws_ok(
  format($$insert into public.operations (kind, destination_id, user_id)
           values ('add','00000000-0000-0000-0000-0000000000a1','%s')$$, :'u1'),
  '42501', null, 'usuario no puede insertar en operations');

select throws_ok(
  $$insert into public.stock (item_id, location_id, quantity)
    values ('00000000-0000-0000-0000-0000000000c2','00000000-0000-0000-0000-0000000000a1',1)$$,
  '42501', null, 'usuario no puede insertar en stock');

select throws_ok(
  $$insert into public.items (name, type_id)
    values ('Nuevo','00000000-0000-0000-0000-0000000000b1')$$,
  '42501', null, 'usuario no puede insertar en items');

select is(
  tests.rows_affected('update public.stock set quantity = 99'),
  0, 'update de stock no afecta a ninguna fila');

select is(
  tests.rows_affected('delete from public.stock'),
  0, 'delete de stock no afecta a ninguna fila');

select is(
  (select count(*)::int from public.stock
   where location_id = '00000000-0000-0000-0000-0000000000a3'),
  0, 'stock de localizacion inactiva no es visible');

select is(
  (select count(*)::int from public.stock
   where location_id = '00000000-0000-0000-0000-0000000000a1'),
  1, 'stock de localizacion activa es visible');

select is(
  (select count(*)::int from public.location_permissions),
  1, 'usuario ve solo sus permisos');
select tests.logout();

select tests.login_as(:'admin_id');
select is(
  (select count(*)::int from public.location_permissions),
  2, 'admin ve todos los permisos');

-- Historial inmutable: ni siquiera un admin puede modificarlo o borrarlo directamente.
select is(tests.rows_affected($$update public.operations set notes = 'x'$$), 0,
  'admin: update de operations no afecta a ninguna fila');
select is(tests.rows_affected('delete from public.operations'), 0,
  'admin: delete de operations no afecta a ninguna fila');
select is(tests.rows_affected('update public.operation_lines set quantity = 99'), 0,
  'admin: update de operation_lines no afecta a ninguna fila');
select is(tests.rows_affected('delete from public.operation_lines'), 0,
  'admin: delete de operation_lines no afecta a ninguna fila');
select tests.logout();

select tests.login_as(:'u1');
select is(tests.rows_affected($$update public.operations set notes = 'x'$$), 0,
  'usuario: update de operations no afecta a ninguna fila');
select is(tests.rows_affected('delete from public.operations'), 0,
  'usuario: delete de operations no afecta a ninguna fila');
select is(tests.rows_affected('update public.operation_lines set quantity = 99'), 0,
  'usuario: update de operation_lines no afecta a ninguna fila');
select is(tests.rows_affected('delete from public.operation_lines'), 0,
  'usuario: delete de operation_lines no afecta a ninguna fila');
select tests.logout();

select results_eq(
  $$select o.notes, l.quantity from public.operations o
    join public.operation_lines l on l.operation_id = o.id
    where o.id = '00000000-0000-0000-0000-0000000000d1'$$,
  $$values (null::text, 5)$$,
  'la operación y su línea siguen intactas');

-- Funciones auxiliares: sin execute para anon, sí para authenticated.
select ok(not has_function_privilege('anon', 'public.is_admin()', 'execute')
  and not has_function_privilege('anon', 'public.can_operate(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.normalize_name(text)', 'execute'),
  'anon sin execute en is_admin, can_operate y normalize_name');
select ok(has_function_privilege('authenticated', 'public.is_admin()', 'execute')
  and has_function_privilege('authenticated', 'public.can_operate(uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.normalize_name(text)', 'execute'),
  'authenticated con execute en is_admin, can_operate y normalize_name');

-- anon: sin acceso
select set_config('request.jwt.claims', '', true);
set local role anon;
select is(
  (select count(*)::int from public.stock), 0, 'anon ve 0 filas de stock');
select is(
  (select count(*)::int from public.profiles), 0, 'anon ve 0 perfiles');
select tests.logout();

select * from finish();
rollback;
