begin;
\ir _helpers.sql
select tests.clear_seed();
select plan(18);

select tests.create_user('a@stocka2.test', 'admin') as a \gset
select tests.create_user('u@stocka2.test') as u \gset

insert into public.locations (id, name, kind) values
  ('00000000-0000-0000-0000-0000000000a1', 'Taller', 'warehouse'),
  ('00000000-0000-0000-0000-0000000000a2', 'Furgoneta 1', 'vehicle');
insert into public.location_permissions values (:'u', '00000000-0000-0000-0000-0000000000a2');

select tests.login_as(:'u');
select throws_ok($$select * from public.admin_list_users()$$, 'P0001', 'forbidden',
  'usuario no lista usuarios');
select throws_ok(format($$select public.admin_set_user_active('%s', false)$$, :'u'),
  'P0001', 'forbidden', 'usuario no desactiva usuarios');

select tests.login_as(:'a');
select is((select count(*)::int from public.admin_list_users()), 2, 'admin lista los usuarios');
select is((select email || '|' || array_to_string(location_ids, ',')
           from public.admin_list_users() where id = :'u'),
  'u@stocka2.test|00000000-0000-0000-0000-0000000000a2', 'email y permisos');
select is((select cardinality(location_ids) from public.admin_list_users() where id = :'a'), 0,
  'sin permisos: array vacío');

select public.admin_update_user(:'u', ' Juan ', 'user',
  array['00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a2']::uuid[]);
select is((select display_name from public.profiles where id = :'u'), 'Juan', 'cambia el nombre');
select is((select count(*)::int from public.location_permissions where user_id = :'u'), 2, 'dos permisos');
select public.admin_update_user(:'u', 'Juan', 'user', array['00000000-0000-0000-0000-0000000000a2']::uuid[]);
select results_eq(format($$select location_id from public.location_permissions where user_id = '%s'$$, :'u'),
  $$values ('00000000-0000-0000-0000-0000000000a2'::uuid)$$, 'sustituye los permisos');
select public.admin_update_user(:'u', 'Juan', 'user', '{}');
select is((select count(*)::int from public.location_permissions where user_id = :'u'), 0, 'sin permisos');

select throws_ok(format($$select public.admin_update_user('%s', 'Juan', 'jefe', '{}')$$, :'u'),
  'P0001', 'invalid_input', 'rol no válido');
select throws_ok(format($$select public.admin_update_user('%s', 'Juan', 'user',
    array['00000000-0000-0000-0000-0000000000ff']::uuid[])$$, :'u'),
  'P0001', 'invalid_input', 'localización inexistente');
select throws_ok(format($$select public.admin_update_user('%s', '  ', 'user', '{}')$$, :'u'),
  'P0001', 'invalid_input', 'nombre vacío');

select throws_ok(format($$select public.admin_update_user('%s', 'A', 'user', '{}')$$, :'a'),
  'P0001', 'last_admin', 'el único admin no se quita el rol');
select throws_ok(format($$select public.admin_set_user_active('%s', false)$$, :'a'),
  'P0001', 'last_admin', 'el único admin no se desactiva');

select public.admin_update_user(:'u', 'Juan', 'admin', '{}');
select lives_ok(format($$select public.admin_set_user_active('%s', false)$$, :'a'),
  'con otro admin activo sí se puede desactivar');

-- Perfil propio
select tests.login_as(:'u');
select public.update_my_profile('  Pepe ');
select is((select display_name from public.profiles where id = :'u'), 'Pepe', 'update_my_profile recorta');
select throws_ok($$select public.update_my_profile('')$$, 'P0001', 'invalid_input', 'nombre propio vacío');

select tests.logout();
set local role anon;
select throws_ok($$select * from public.admin_list_users()$$, '42501', null, 'anon no lista usuarios');
reset role;

select * from finish();
rollback;
