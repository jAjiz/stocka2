-- Datos de desarrollo. Contraseña de todos los usuarios: stocka2-dev (solo desarrollo).
-- UUIDs fijos para que el seed sea determinista.

-- Usuarios (el trigger on_auth_user_created crea los perfiles; activos por la marca
-- stocka2_invited de raw_app_meta_data)
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) values
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'admin@stocka2.test', crypt('stocka2-dev', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"],"stocka2_invited":true}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'furgo1@stocka2.test', crypt('stocka2-dev', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"],"stocka2_invited":true}', '{}', now(), now(), '', '', '', '');

insert into auth.identities (id, user_id, provider, provider_id, identity_data, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, 'email', u.id::text,
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       now(), now(), now()
from auth.users u
where u.id in ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002');

update public.profiles set role = 'admin', display_name = 'Admin'
 where id = '00000000-0000-4000-8000-000000000001';
update public.profiles set display_name = 'Furgo 1'
 where id = '00000000-0000-4000-8000-000000000002';

-- Localizaciones
insert into public.locations (id, name, kind) values
  ('00000000-0000-4000-8000-000000000101', 'Taller', 'warehouse'),
  ('00000000-0000-4000-8000-000000000102', 'Furgoneta 1', 'vehicle'),
  ('00000000-0000-4000-8000-000000000103', 'Furgoneta 2', 'vehicle');

insert into public.location_permissions (user_id, location_id) values
  ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000102');

-- Tipos
insert into public.item_types (id, name) values
  ('00000000-0000-4000-8000-000000000201', 'Fontanería'),
  ('00000000-0000-4000-8000-000000000202', 'Electricidad'),
  ('00000000-0000-4000-8000-000000000203', 'Consumibles');

-- Artículos
insert into public.items (id, name, type_id, reference) values
  ('00000000-0000-4000-8000-000000000301', 'Codo PVC 32 mm',        '00000000-0000-4000-8000-000000000201', 'FON-001'),
  ('00000000-0000-4000-8000-000000000302', 'Tubo multicapa 16 mm',  '00000000-0000-4000-8000-000000000201', 'FON-002'),
  ('00000000-0000-4000-8000-000000000303', 'Grifo monomando',       '00000000-0000-4000-8000-000000000201', 'FON-003'),
  ('00000000-0000-4000-8000-000000000304', 'Cable 2,5 mm (m)',      '00000000-0000-4000-8000-000000000202', 'ELE-001'),
  ('00000000-0000-4000-8000-000000000305', 'Interruptor simple',    '00000000-0000-4000-8000-000000000202', 'ELE-002'),
  ('00000000-0000-4000-8000-000000000306', 'Magnetotérmico 16 A',   '00000000-0000-4000-8000-000000000202', 'ELE-003'),
  ('00000000-0000-4000-8000-000000000307', 'Cinta de teflón',       '00000000-0000-4000-8000-000000000203', 'CON-001'),
  ('00000000-0000-4000-8000-000000000308', 'Bridas 200 mm (bolsa)', '00000000-0000-4000-8000-000000000203', 'CON-002');

-- Stock inicial en Taller mediante operaciones add (una por artículo), como admin.
do $$
declare
  v_admin constant uuid := '00000000-0000-4000-8000-000000000001';
  v_taller constant uuid := '00000000-0000-4000-8000-000000000101';
  r record;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  for r in
    select * from (values
      ('00000000-0000-4000-8000-000000000301'::uuid, 50),
      ('00000000-0000-4000-8000-000000000302'::uuid, 100),
      ('00000000-0000-4000-8000-000000000303'::uuid, 10),
      ('00000000-0000-4000-8000-000000000304'::uuid, 200),
      ('00000000-0000-4000-8000-000000000305'::uuid, 30),
      ('00000000-0000-4000-8000-000000000306'::uuid, 20),
      ('00000000-0000-4000-8000-000000000307'::uuid, 40),
      ('00000000-0000-4000-8000-000000000308'::uuid, 25)
    ) as t(item_id, qty)
  loop
    perform public.perform_operation(
      'add', v_taller,
      jsonb_build_array(jsonb_build_object('item_id', r.item_id, 'quantity', r.qty)),
      null, null, 'Stock inicial');
  end loop;
  perform set_config('request.jwt.claims', '', true);
end $$;
