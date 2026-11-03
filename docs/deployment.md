# Despliegue en producción

Configuración necesaria en el proyecto hosted de Supabase antes de publicar.

## Desactivar el registro abierto

`enable_signup = false` en `supabase/config.toml` solo afecta a Supabase local. En el
proyecto hosted el registro está abierto por defecto y la anon key es pública, así que
cualquiera podría crear una cuenta con `POST /auth/v1/signup`. Antes de publicar:

- **Authentication → Sign In / Providers → desactivar "Allow new users to sign up".**

Como defensa en profundidad, el trigger `on_auth_user_created` crea el perfil **inactivo**
salvo que el usuario se inserte ya con `stocka2_invited = true` en `raw_app_meta_data` (solo lo
puede escribir `service_role`). Un usuario con el perfil inactivo no puede entrar ni leer datos.
En la práctica GoTrue aplica `app_metadata` después del `insert`, así que **todos** los usuarios
nacen inactivos: la Edge Function `admin-users` activa a los invitados de forma explícita, y el
primer administrador se activa a mano (abajo).

## Edge Function y Auth

- Despliega la función: `pnpm exec supabase functions deploy admin-users`.
- Authentication → Email → **Email OTP Expiration**: 86400 (24 h, el máximo). Es la caducidad
  de los enlaces de acceso. Si usas otro valor, ponlo también en el secreto
  `STOCKA2_LINK_TTL_SECONDS` (`pnpm exec supabase secrets set STOCKA2_LINK_TTL_SECONDS=…`), que
  la función usa para indicar al administrador cuándo caduca el enlace.
- Authentication → Providers → Email → **Minimum password length**: 8.
- No hace falta configurar URLs de redirección: los enlaces apuntan a la propia aplicación
  (`/acceso?t=…`) y la app canjea el token con `verifyOtp`, así que la vista previa de
  WhatsApp no lo gasta.

## Primer administrador

El seed no se aplica en producción. Crea el usuario desde el panel de Supabase
(Authentication > Users); su perfil nace inactivo, así que actívalo y conviértelo en
administrador en la misma sentencia:

```sql
update public.profiles set role = 'admin', active = true where id = '<uuid>';
```
