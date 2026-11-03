-- Helpers de test. Incluir con `\ir _helpers.sql` dentro de begin; ... rollback;
create extension if not exists pgtap with schema extensions;
create schema if not exists tests;
grant usage on schema tests to authenticated, anon;

-- Crea un usuario invitado (marca stocka2_invited en app_metadata): su perfil nace activo.
create or replace function tests.create_user(p_email text, p_role text default 'user')
returns uuid language plpgsql as $$
declare v_id uuid := gen_random_uuid();
begin
  insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at)
  values (v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          p_email, '{"stocka2_invited":true}'::jsonb, '{}'::jsonb, now(), now());
  if p_role <> 'user' then
    update public.profiles set role = p_role where id = v_id;
  end if;
  return v_id;
end $$;

create or replace function tests.login_as(p_user uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  set local role authenticated;
end $$;

create or replace function tests.logout()
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  reset role;
end $$;

-- Vacía los datos de desarrollo (seed.sql) para que los tests partan de una BD limpia.
-- Solo tiene efecto dentro de la transacción del test (se revierte con rollback).
create or replace function tests.clear_seed()
returns void language plpgsql as $$
begin
  truncate public.push_outbox, public.push_subscriptions,
           public.alert_rule_locations, public.alert_rule_items, public.alert_rules,
           public.operation_lines, public.operations, public.stock,
           public.location_permissions, public.items, public.item_types, public.locations;
  delete from public.profiles;
  delete from auth.identities;
  delete from auth.users;
end $$;
