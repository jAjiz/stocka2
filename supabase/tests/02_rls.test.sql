begin;
\ir _helpers.sql
select plan(11);

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
select tests.logout();

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
