begin;
\ir _helpers.sql
select tests.clear_seed();
select plan(10);

select tests.create_user('a@stocka2.test') as uid \gset
select tests.create_user('boss@stocka2.test', 'admin') as admin_id \gset
insert into public.locations (id, name, kind) values
  ('00000000-0000-0000-0000-0000000000a1', 'Almacen', 'warehouse'),
  ('00000000-0000-0000-0000-0000000000a2', 'Furgoneta', 'vehicle');
insert into public.item_types (id, name) values ('00000000-0000-0000-0000-0000000000b1', 'Tipo');
insert into public.items (id, name, type_id) values
  ('00000000-0000-0000-0000-0000000000c1', 'Tornillo', '00000000-0000-0000-0000-0000000000b1');
insert into public.stock (item_id, location_id, quantity) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a1', 5);
insert into public.operations (id, kind, destination_id, user_id) values
  ('00000000-0000-0000-0000-0000000000d1', 'add', '00000000-0000-0000-0000-0000000000a1', :'uid');

select throws_ok(
  $$update public.stock set quantity = -1$$, '23514', null, 'stock negativo falla');

select throws_ok(
  $$insert into public.operation_lines values ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000c1',0)$$,
  '23514', null, 'linea con cantidad 0 falla');

select throws_ok(
  $$insert into public.operations (kind, origin_id, destination_id, user_id) values
    ('move','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a1',(select id from public.profiles limit 1))$$,
  '23514', null, 'move con origen = destino falla');

select throws_ok(
  $$insert into public.operations (kind, destination_id, reference, user_id) values
    ('add','00000000-0000-0000-0000-0000000000a1','REF',(select id from public.profiles limit 1))$$,
  '23514', null, 'add con reference falla');

insert into public.items (name, type_id) values ('Filtro', '00000000-0000-0000-0000-0000000000b1');
select throws_ok(
  $$insert into public.items (name, type_id) values (' filtró ', '00000000-0000-0000-0000-0000000000b1')$$,
  '23505', null, 'nombre duplicado normalizado falla');

select is(
  (select row(role, active, display_name)::text from public.profiles where id = :'uid'),
  row('user', true, 'a')::text, 'perfil creado por trigger');

select tests.login_as(:'uid');
select is(public.can_operate('00000000-0000-0000-0000-0000000000a1'), false, 'sin permiso: false');
select tests.logout();
insert into public.location_permissions values (:'uid', '00000000-0000-0000-0000-0000000000a1');
select tests.login_as(:'uid');
select is(public.can_operate('00000000-0000-0000-0000-0000000000a1'), true, 'con permiso: true');
select tests.logout();

select tests.login_as(:'admin_id');
select is(public.can_operate('00000000-0000-0000-0000-0000000000a2'), true, 'admin: true');
select tests.logout();
update public.profiles set active = false where id = :'uid';
select tests.login_as(:'uid');
select is(public.can_operate('00000000-0000-0000-0000-0000000000a1'), false, 'inactivo con permiso: false');
select tests.logout();

select * from finish();
rollback;
