-- Defensa en profundidad frente al registro abierto (enable_signup solo aplica en local;
-- en hosted hay que desactivarlo en el panel). Un usuario creado sin la marca de invitación
-- en raw_app_meta_data (solo la puede escribir service_role, no el propio usuario) nace
-- con el perfil inactivo y no puede operar ni entrar en la aplicación.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, active)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_app_meta_data->>'stocka2_invited', '') = 'true'
  );
  return new;
end $$;
