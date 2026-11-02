begin;
\ir _helpers.sql
select plan(15);

select tests.create_user('u@stocka2.test') as u \gset
select tests.create_user('x@stocka2.test') as x \gset
update public.profiles set active = false where id = :'x';

insert into public.item_types (id, name, active) values
  ('00000000-0000-0000-0000-0000000000b1', 'Tipo', true),
  ('00000000-0000-0000-0000-0000000000b2', 'Viejo', false);

select tests.login_as(:'u');

select public.create_item('  Filtro  ', '00000000-0000-0000-0000-0000000000b1', ' R-1 ') as filtro \gset
select isnt(:'filtro'::uuid, null, 'create_item devuelve el id');
select tests.logout();

select is((select name from public.items where id = :'filtro'), 'Filtro', 'nombre recortado');
select is((select reference from public.items where id = :'filtro'), 'R-1', 'referencia recortada');
select is((select type_id from public.items where id = :'filtro'),
  '00000000-0000-0000-0000-0000000000b1'::uuid, 'tipo guardado');

select tests.login_as(:'u');
select throws_ok(
  $$select public.create_item('filtro', '00000000-0000-0000-0000-0000000000b1')$$,
  'P0001', 'duplicate_name', 'nombre duplicado (mayúsculas)');
select throws_ok(
  $$select public.create_item(' FILTRÓ ', '00000000-0000-0000-0000-0000000000b1')$$,
  'P0001', 'duplicate_name', 'nombre duplicado (acentos y espacios)');
select throws_ok(
  $$select public.create_item('Otro', '00000000-0000-0000-0000-0000000000b2')$$,
  'P0001', 'inactive_type', 'tipo inactivo');
select throws_ok(
  $$select public.create_item('Otro', '00000000-0000-0000-0000-0000000000ff')$$,
  'P0001', 'inactive_type', 'tipo inexistente');
select throws_ok(
  $$select public.create_item('   ', '00000000-0000-0000-0000-0000000000b1')$$,
  'P0001', 'invalid_operation', 'nombre vacío');

select public.create_item('Junta', '00000000-0000-0000-0000-0000000000b1', '  ') as junta \gset
select tests.logout();
select is((select reference from public.items where id = :'junta'), null, 'referencia en blanco se guarda null');

-- Un artículo inactivo no bloquea el nombre
update public.items set active = false where id = :'filtro';
select tests.login_as(:'u');
select isnt(public.create_item('Filtro', '00000000-0000-0000-0000-0000000000b1'), null,
  'nombre de artículo inactivo se puede reutilizar');
select tests.logout();

select tests.login_as(:'x');
select throws_ok(
  $$select public.create_item('Nuevo', '00000000-0000-0000-0000-0000000000b1')$$,
  'P0001', 'forbidden', 'usuario desactivado no puede crear');
select tests.logout();

-- anon: sin permiso de ejecución
select set_config('request.jwt.claims', '', true);
set local role anon;
select throws_ok(
  $$select public.create_item('Nuevo', '00000000-0000-0000-0000-0000000000b1')$$,
  '42501', null, 'anon no puede ejecutar create_item');
select tests.logout();

select ok(not has_function_privilege('anon', 'public.create_item(text, uuid, text)', 'execute'),
  'anon sin execute');
select ok(has_function_privilege('authenticated', 'public.create_item(text, uuid, text)', 'execute'),
  'authenticated con execute');

select * from finish();
rollback;
