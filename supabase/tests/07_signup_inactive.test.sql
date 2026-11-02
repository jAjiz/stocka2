begin;
\ir _helpers.sql
select tests.clear_seed();
select plan(4);

-- Un alta sin la marca de invitación (p. ej. POST /auth/v1/signup con la anon key, si el
-- registro estuviera abierto en hosted) crea el perfil inactivo.
insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-4000-8000-00000000e001', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'intruso@example.com',
        '{"provider":"email","providers":["email"]}', '{}', now(), now());
select is((select active from public.profiles where id = '00000000-0000-4000-8000-00000000e001'),
  false, 'alta sin marca: perfil inactivo');

-- La marca en raw_user_meta_data (la controla el propio usuario) no vale.
insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-4000-8000-00000000e002', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'listo@example.com',
        '{}', '{"stocka2_invited":true}', now(), now());
select is((select active from public.profiles where id = '00000000-0000-4000-8000-00000000e002'),
  false, 'marca en user_metadata: perfil inactivo');

-- Con la marca en raw_app_meta_data (solo la puede poner service_role): activo.
insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-4000-8000-00000000e003', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'invitado@example.com',
        '{"provider":"email","stocka2_invited":true}', '{}', now(), now());
select is((select active from public.profiles where id = '00000000-0000-4000-8000-00000000e003'),
  true, 'alta invitada: perfil activo');

-- tests.create_user crea usuarios invitados (activos).
select tests.create_user('h@stocka2.test') as h \gset
select is((select active from public.profiles where id = :'h'), true, 'tests.create_user: perfil activo');

select * from finish();
rollback;
