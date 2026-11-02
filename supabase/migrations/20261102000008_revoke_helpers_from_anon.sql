-- Las funciones auxiliares no deben poder llamarse sin sesión (/rest/v1/rpc con la anon key).
-- EXECUTE se concede por defecto a PUBLIC, así que hay que revocarlo también de PUBLIC
-- para que anon lo pierda de verdad. authenticated (políticas RLS) y service_role lo conservan;
-- las funciones security definer que las usan se ejecutan como su propietario.
revoke execute on function public.is_admin(), public.can_operate(uuid), public.normalize_name(text)
  from public, anon;
grant execute on function public.is_admin(), public.can_operate(uuid), public.normalize_name(text)
  to authenticated, service_role;
