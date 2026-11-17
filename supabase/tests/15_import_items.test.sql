begin;
\ir _helpers.sql
select tests.clear_seed();
select plan(15);

select tests.create_user('admin@stocka2.test', 'admin') as a \gset
select tests.create_user('u@stocka2.test') as u \gset

insert into public.item_types (id, name, active) values
  ('00000000-0000-0000-0000-0000000000b1', 'Fontanería', true),
  ('00000000-0000-0000-0000-0000000000b2', 'Viejo', false);
insert into public.items (id, name, type_id, active) values
  ('00000000-0000-0000-0000-0000000000c1', 'Codo PVC', '00000000-0000-0000-0000-0000000000b1', true),
  ('00000000-0000-0000-0000-0000000000c2', 'Grifo', '00000000-0000-0000-0000-0000000000b1', false);

select count(*) as ops0 from public.operations \gset
select count(*) as stock0 from public.stock \gset

select tests.login_as(:'a');
select is(public.admin_import_items($$[
    {"name": "Tubo", "type_id": "00000000-0000-0000-0000-0000000000b1", "reference": " T-1 "},
    {"name": "codo pvc", "type_id": "00000000-0000-0000-0000-0000000000b1", "reference": null},
    {"name": "Grifo", "type_id": "00000000-0000-0000-0000-0000000000b1", "reference": ""}
  ]$$::jsonb), '{"created": 2, "skipped": 1}'::jsonb, 'crea los nuevos y salta el existente');
select tests.logout();

select is((select reference from public.items where name = 'Tubo'), 'T-1', 'quita espacios de la referencia');
select is((select count(*)::int from public.items where name = 'Grifo' and active and reference is null), 1,
  'un artículo deshabilitado con el mismo nombre no cuenta como existente; referencia vacía = null');
select is((select count(*)::int from public.items where public.normalize_name(name) = 'codo pvc' and active), 1,
  'sigue habiendo un único Codo PVC activo');

select tests.login_as(:'a');
select is(public.admin_import_items($$[
    {"name": "Tubo", "type_id": "00000000-0000-0000-0000-0000000000b1", "reference": " T-1 "},
    {"name": "codo pvc", "type_id": "00000000-0000-0000-0000-0000000000b1", "reference": null},
    {"name": "Grifo", "type_id": "00000000-0000-0000-0000-0000000000b1", "reference": ""}
  ]$$::jsonb), '{"created": 0, "skipped": 3}'::jsonb, 'repetir la importación no crea nada');

select count(*) as items1 from public.items \gset
select throws_ok($$select public.admin_import_items('[
    {"name": "Nuevo A", "type_id": "00000000-0000-0000-0000-0000000000b1", "reference": null},
    {"name": "Nuevo B", "type_id": "00000000-0000-0000-0000-0000000000b2", "reference": null}
  ]'::jsonb)$$, 'P0001', 'inactive_type', 'tipo deshabilitado');
select is((select count(*) from public.items), :'items1'::bigint, 'con un tipo inválido no se crea ninguno');
select throws_ok($$select public.admin_import_items('[
    {"name": "Nuevo C", "type_id": "00000000-0000-0000-0000-0000000000ff", "reference": null}
  ]'::jsonb)$$, 'P0001', 'inactive_type', 'tipo inexistente');

select throws_ok($$select public.admin_import_items('[
    {"name": "  ", "type_id": "00000000-0000-0000-0000-0000000000b1", "reference": null}
  ]'::jsonb)$$, 'P0001', 'invalid_input', 'nombre vacío');
select throws_ok($$select public.admin_import_items('[
    {"name": "Codo", "type_id": "00000000-0000-0000-0000-0000000000b1", "reference": null},
    {"name": "Códo", "type_id": "00000000-0000-0000-0000-0000000000b1", "reference": null}
  ]'::jsonb)$$, 'P0001', 'invalid_input', 'nombres repetidos dentro de la importación');
select throws_ok($$select public.admin_import_items('[]'::jsonb)$$, 'P0001', 'invalid_input', 'lista vacía');
select throws_ok($$select public.admin_import_items('{"name": "X"}'::jsonb)$$, 'P0001', 'invalid_input',
  'no es un array');
select throws_ok($$select public.admin_import_items((
    select jsonb_agg(jsonb_build_object('name', 'Art ' || g,
      'type_id', '00000000-0000-0000-0000-0000000000b1', 'reference', null))
    from generate_series(1, 2001) g))$$, 'P0001', 'invalid_input', 'más de 2000 elementos');

select tests.login_as(:'u');
select throws_ok($$select public.admin_import_items('[
    {"name": "X", "type_id": "00000000-0000-0000-0000-0000000000b1", "reference": null}
  ]'::jsonb)$$, 'P0001', 'forbidden', 'solo administradores');
select tests.logout();

select ok((select count(*) from public.operations) = :'ops0'::bigint
      and (select count(*) from public.stock) = :'stock0'::bigint,
  'la importación no crea operaciones ni stock');

select * from finish();
rollback;
