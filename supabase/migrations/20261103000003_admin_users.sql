-- RPC de administración de usuarios y edición del perfil propio.
-- Crear usuarios de Auth, generar enlaces y banear necesita la clave de servicio: lo hace la
-- Edge Function admin-users, que llama a estas RPC con el JWT del administrador para que las
-- reglas (solo admins, último admin) se apliquen aquí.

-- Lanza last_admin si, sin p_user_id, no quedaría ningún administrador activo.
-- Bloquea antes las filas de los administradores activos: dos administradores que se
-- degradan a la vez no pueden dejar el sistema sin ninguno.
create or replace function public.assert_other_active_admin(p_user_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform 1 from public.profiles p where p.role = 'admin' and p.active order by p.id for update;
  if not exists (select 1 from public.profiles p
                 where p.role = 'admin' and p.active and p.id <> p_user_id) then
    raise exception using errcode = 'P0001', message = 'last_admin';
  end if;
end $$;

revoke execute on function public.assert_other_active_admin(uuid) from public, anon, authenticated;

create or replace function public.admin_list_users()
returns table (
  id uuid,
  email text,
  display_name text,
  role text,
  active boolean,
  location_ids uuid[],
  has_password boolean,
  created_at timestamptz
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception using errcode = 'P0001', message = 'forbidden';
  end if;
  return query
    select p.id, u.email::text, p.display_name, p.role, p.active,
           coalesce(array(select lp.location_id from public.location_permissions lp
                          where lp.user_id = p.id order by lp.location_id), '{}'::uuid[]),
           coalesce(u.encrypted_password, '') <> '', p.created_at
    from public.profiles p
    join auth.users u on u.id = p.id
    order by p.display_name, p.id;
end $$;

create or replace function public.admin_update_user(
  p_user_id uuid, p_display_name text, p_role text, p_location_ids uuid[]
) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_name text := nullif(trim(p_display_name), '');
  v_ids uuid[] := coalesce(p_location_ids, '{}');
begin
  if not public.is_admin() then
    raise exception using errcode = 'P0001', message = 'forbidden';
  end if;
  if v_name is null or p_role is null or p_role not in ('admin', 'user') then
    raise exception using errcode = 'P0001', message = 'invalid_input';
  end if;
  if exists (select 1 from unnest(v_ids) x(id)
             where not exists (select 1 from public.locations l where l.id = x.id)) then
    raise exception using errcode = 'P0001', message = 'invalid_input';
  end if;
  perform 1 from public.profiles p where p.id = p_user_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;
  if p_role <> 'admin' then
    perform public.assert_other_active_admin(p_user_id);
  end if;

  update public.profiles set display_name = v_name, role = p_role where id = p_user_id;
  delete from public.location_permissions where user_id = p_user_id;
  insert into public.location_permissions (user_id, location_id)
  select distinct p_user_id, x.id from unnest(v_ids) x(id);
end $$;

create or replace function public.admin_set_user_active(p_user_id uuid, p_active boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception using errcode = 'P0001', message = 'forbidden';
  end if;
  if p_active is null then
    raise exception using errcode = 'P0001', message = 'invalid_input';
  end if;
  perform 1 from public.profiles p where p.id = p_user_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;
  if not p_active then
    perform public.assert_other_active_admin(p_user_id);
  end if;
  update public.profiles set active = p_active where id = p_user_id;
end $$;

create or replace function public.update_my_profile(p_display_name text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_name text := nullif(trim(p_display_name), '');
begin
  if not public.is_active() then
    raise exception using errcode = 'P0001', message = 'forbidden';
  end if;
  if v_name is null then
    raise exception using errcode = 'P0001', message = 'invalid_input';
  end if;
  update public.profiles set display_name = v_name where id = auth.uid();
end $$;

revoke execute on function
  public.admin_list_users(),
  public.admin_update_user(uuid, text, text, uuid[]),
  public.admin_set_user_active(uuid, boolean),
  public.update_my_profile(text)
from public, anon;

grant execute on function
  public.admin_list_users(),
  public.admin_update_user(uuid, text, text, uuid[]),
  public.admin_set_user_active(uuid, boolean),
  public.update_my_profile(text)
to authenticated;
