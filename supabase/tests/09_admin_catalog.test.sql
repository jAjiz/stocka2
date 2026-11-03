begin;
\ir _helpers.sql
select tests.clear_seed();
select plan(35);

select tests.create_user('admin@stocka2.test', 'admin') as a \gset
select tests.create_user('u@stocka2.test') as u \gset

insert into public.locations (id, name, kind) values
  ('00000000-0000-0000-0000-0000000000a1', 'Taller', 'warehouse'),
  ('00000000-0000-0000-0000-0000000000a2', 'Furgoneta 1', 'vehicle');
insert into public.item_types (id, name) values ('00000000-0000-0000-0000-0000000000b1', 'Fontaneria');
insert into public.items (id, name, type_id) values
  ('00000000-0000-0000-0000-0000000000c1', 'A', '00000000-0000-0000-0000-0000000000b1'),
  ('00000000-0000-0000-0000-0000000000c2', 'B', '00000000-0000-0000-0000-0000000000b1');

select tests.login_as(:'a');
select public.perform_operation('add', '00000000-0000-0000-0000-0000000000a1',
  '[{"item_id":"00000000-0000-0000-0000-0000000000c1","quantity":2}]');

-- Solo administradores
select tests.login_as(:'u');
select throws_ok($$select public.admin_save_location(null, 'X', 'vehicle')$$,
  'P0001', 'forbidden', 'usuario no crea localizaciones');
select throws_ok($$select public.admin_delete_item('00000000-0000-0000-0000-0000000000c2')$$,
  'P0001', 'forbidden', 'usuario no borra artículos');

select tests.login_as(:'a');

-- Localizaciones
select public.admin_save_location(null, ' Furgoneta 3 ', 'vehicle') as f3 \gset
select is((select name from public.locations where id = :'f3'), 'Furgoneta 3',
  'crea localización recortando el nombre');
select throws_ok($$select public.admin_save_location(null, ' furgoneta 3 ', 'vehicle')$$,
  'P0001', 'duplicate_location', 'nombre de localización repetido');
select throws_ok($$select public.admin_save_location(null, 'Coche', 'coche')$$,
  'P0001', 'invalid_input', 'tipo de localización no válido');
select throws_ok($$select public.admin_save_location(null, '  ', 'vehicle')$$,
  'P0001', 'invalid_input', 'nombre vacío');
select throws_ok($$select public.admin_save_location('00000000-0000-0000-0000-0000000000ff', 'Z', 'vehicle')$$,
  'P0001', 'not_found', 'localización inexistente');
select public.admin_save_location('00000000-0000-0000-0000-0000000000a2', 'Furgo 1', 'vehicle');
select is((select name from public.locations where id = '00000000-0000-0000-0000-0000000000a2'),
  'Furgo 1', 'renombra la localización');
select lives_ok($$select public.admin_save_location('00000000-0000-0000-0000-0000000000a2', 'FURGO 1', 'vehicle')$$,
  'renombrar cambiando solo mayúsculas no choca consigo misma');

select throws_ok($$select public.admin_set_location_active('00000000-0000-0000-0000-0000000000a1', false)$$,
  'P0001', 'location_has_stock', 'no se deshabilita con stock');
select public.admin_set_location_active('00000000-0000-0000-0000-0000000000a2', false);
select is((select active from public.locations where id = '00000000-0000-0000-0000-0000000000a2'),
  false, 'deshabilita sin stock');
select public.admin_set_location_active('00000000-0000-0000-0000-0000000000a2', true);
select is((select active from public.locations where id = '00000000-0000-0000-0000-0000000000a2'),
  true, 'reactiva');

select throws_ok($$select public.admin_delete_location('00000000-0000-0000-0000-0000000000a1')$$,
  'P0001', 'location_in_use', 'no se borra una localización con historial');
select tests.logout();
insert into public.location_permissions values (:'u', :'f3');
select tests.login_as(:'a');
select public.admin_delete_location(:'f3');
select is((select count(*)::int from public.locations where id = :'f3'), 0,
  'borra la localización sin uso');
select is((select count(*)::int from public.location_permissions where location_id = :'f3'), 0,
  'y sus permisos');

-- Tipos
select throws_ok($$select public.admin_save_item_type(null, ' fontaneria ')$$,
  'P0001', 'duplicate_type', 'tipo repetido');
select throws_ok($$select public.admin_delete_item_type('00000000-0000-0000-0000-0000000000b1')$$,
  'P0001', 'type_in_use', 'no se borra un tipo en uso');
select public.admin_set_item_type_active('00000000-0000-0000-0000-0000000000b1', false);
select is((select active from public.item_types where id = '00000000-0000-0000-0000-0000000000b1'),
  false, 'deshabilita un tipo en uso');
select public.admin_set_item_type_active('00000000-0000-0000-0000-0000000000b1', true);
select public.admin_save_item_type(null, 'Electricidad') as t2 \gset
select public.admin_save_item_type(:'t2', 'Electricidad 2');
select is((select name from public.item_types where id = :'t2'), 'Electricidad 2', 'renombra el tipo');
select public.admin_delete_item_type(:'t2');
select is((select count(*)::int from public.item_types where id = :'t2'), 0, 'borra un tipo sin uso');

-- Artículos
select throws_ok($$select public.admin_update_item('00000000-0000-0000-0000-0000000000c2', 'á',
    '00000000-0000-0000-0000-0000000000b1', null)$$,
  'P0001', 'duplicate_name', 'nombre de artículo repetido');
select public.admin_update_item('00000000-0000-0000-0000-0000000000c1', 'A2',
  '00000000-0000-0000-0000-0000000000b1', '  ');
select is((select name || '|' || coalesce(reference, 'null') from public.items
           where id = '00000000-0000-0000-0000-0000000000c1'), 'A2|null',
  'actualiza artículo; referencia vacía = null');
select public.admin_save_item_type(null, 'Viejo') as t3 \gset
select public.admin_set_item_type_active(:'t3', false);
select throws_ok(format($$select public.admin_update_item('00000000-0000-0000-0000-0000000000c1', 'A2', '%s', null)$$, :'t3'),
  'P0001', 'inactive_type', 'no se cambia a un tipo deshabilitado');
select tests.logout();
update public.items set type_id = :'t3' where id = '00000000-0000-0000-0000-0000000000c2';
select tests.login_as(:'a');
select lives_ok(format($$select public.admin_update_item('00000000-0000-0000-0000-0000000000c2', 'B', '%s', 'R')$$, :'t3'),
  'se puede editar conservando un tipo deshabilitado');
select tests.logout();
update public.items set type_id = '00000000-0000-0000-0000-0000000000b1'
  where id = '00000000-0000-0000-0000-0000000000c2';
select tests.login_as(:'a');

select throws_ok($$select public.admin_set_item_active('00000000-0000-0000-0000-0000000000c1', false)$$,
  'P0001', 'item_has_stock', 'no se deshabilita un artículo con stock');
select public.admin_set_item_active('00000000-0000-0000-0000-0000000000c2', false);
select is((select active from public.items where id = '00000000-0000-0000-0000-0000000000c2'),
  false, 'deshabilita un artículo sin stock');
select public.create_item('b', '00000000-0000-0000-0000-0000000000b1') as b2 \gset
select throws_ok($$select public.admin_set_item_active('00000000-0000-0000-0000-0000000000c2', true)$$,
  'P0001', 'duplicate_name', 'reactivar choca con otro activo del mismo nombre');
select lives_ok($$select public.admin_update_item('00000000-0000-0000-0000-0000000000c2', 'b',
    '00000000-0000-0000-0000-0000000000b1', null)$$,
  'un artículo deshabilitado puede compartir nombre con uno activo');

select throws_ok($$select public.admin_delete_item('00000000-0000-0000-0000-0000000000c1')$$,
  'P0001', 'item_in_use', 'no se borra un artículo con historial');
select public.admin_delete_item('00000000-0000-0000-0000-0000000000c2');
select is((select count(*)::int from public.items where id = '00000000-0000-0000-0000-0000000000c2'), 0,
  'borra un artículo sin uso');

-- Con stock a cero tras sacarlo todo, se puede deshabilitar
select public.perform_operation('remove', '00000000-0000-0000-0000-0000000000a1',
  '[{"item_id":"00000000-0000-0000-0000-0000000000c1","quantity":2}]');
select lives_ok($$select public.admin_set_item_active('00000000-0000-0000-0000-0000000000c1', false)$$,
  'artículo con stock 0 se deshabilita');
select lives_ok($$select public.admin_set_location_active('00000000-0000-0000-0000-0000000000a1', false)$$,
  'localización con stock 0 se deshabilita');

select throws_ok($$select public.admin_set_item_active('00000000-0000-0000-0000-0000000000ff', false)$$,
  'P0001', 'not_found', 'artículo inexistente');
select throws_ok($$select public.admin_delete_item_type('00000000-0000-0000-0000-0000000000ff')$$,
  'P0001', 'not_found', 'tipo inexistente');

-- anon
select tests.logout();
set local role anon;
select throws_ok($$select public.admin_save_item_type(null, 'X')$$, '42501', null,
  'anon no ejecuta RPC de admin');
reset role;

select * from finish();
rollback;
