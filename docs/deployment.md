# Despliegue en producción

Orden de la puesta en marcha:

1. **Supabase**: crea el proyecto, aplica las migraciones (`pnpm exec supabase link` y
   `pnpm exec supabase db push`) y sigue las secciones de Supabase de abajo, hasta
   «Notificaciones push» incluida.
2. **Cloudflare**: conecta el repositorio (sección «Cloudflare»).
3. **Primer administrador** (última sección).

Las migraciones y las Edge Functions se aplican siempre a mano desde tu máquina; Cloudflare
solo publica el frontend.

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

## Notificaciones push

El par VAPID del repositorio es solo de desarrollo. Para producción:

1. Genera un par nuevo: `pnpm dlx web-push generate-vapid-keys`.
2. Guárdalo como secretos de las Edge Functions (la privada no va nunca al repositorio):

   ```bash
   pnpm exec supabase secrets set VAPID_PUBLIC_KEY=… VAPID_PRIVATE_KEY=… VAPID_SUBJECT=mailto:…
   ```

3. La clave pública también es la variable de build `VAPID_PUBLIC_KEY` de Cloudflare (abajo).
4. Despliega la función: `pnpm exec supabase functions deploy send-push` (`verify_jwt = false`
   ya está en `supabase/config.toml`: la llama `pg_net` sin JWT).
5. En el SQL editor, guarda la URL que llama `perform_operation`:

   ```sql
   select vault.create_secret('https://<ref>.supabase.co/functions/v1/send-push', 'stocka2_push_url');
   ```

   Hazlo en la misma sesión que `supabase db push`. Sin ese secreto los avisos se encolan en
   `push_outbox` pero no se envían.

Rotar las claves VAPID invalida todas las suscripciones existentes (los servicios push
responden 403). Tras rotarlas, ejecuta `truncate public.push_subscriptions;` y los usuarios
tienen que volver a activar las notificaciones en su perfil.

## Cloudflare

El frontend es un Worker solo con archivos estáticos (`wrangler.jsonc`). Cloudflare lo compila
y lo publica en cada push a `main`.

1. Crea una cuenta en Cloudflare (el plan gratuito basta).
2. **Workers & Pages → Create → Import a repository**: autoriza GitHub y elige `jAjiz/stocka2`,
   rama `main`. El nombre del Worker tiene que ser `stocka2`, como en `wrangler.jsonc`.
3. Comandos:
   - **Build command**: `pnpm test --watch=false && node scripts/set-env.mjs && pnpm build`
   - **Deploy command**: `npx wrangler deploy`
4. **Build variables** (Settings → Build → Variables and secrets):

   | Variable | Valor |
   |----------|-------|
   | `SUPABASE_URL` | `https://<ref>.supabase.co` (Supabase → Project Settings → API) |
   | `SUPABASE_ANON_KEY` | La clave `anon` / publishable del mismo sitio |
   | `VAPID_PUBLIC_KEY` | La pública del par VAPID de producción |
   | `NODE_VERSION` | `24` |
   | `PNPM_VERSION` | `11.4.0` |

   Las tres primeras acaban en el JavaScript público: no pongas nunca aquí la clave de
   servicio ni la VAPID privada. `NODE_VERSION` y `PNPM_VERSION` hacen falta si la imagen de
   build trae otras versiones; ponerlas no hace daño.
5. Lanza el primer build (o haz un push a `main`). La app queda en
   `https://stocka2.<tu-subdominio>.workers.dev`.

Si fallan las pruebas, falta alguna variable o `environment.ts` ya no tiene los marcadores
`__…__`, el build falla y sigue publicada la versión anterior. El log del build lo muestra.

- **Volver a una versión anterior**: Worker → Deployments → elige la versión → Rollback.
- **Dominio propio** (opcional): Worker → Settings → Domains & Routes → Add → Custom domain.
  El dominio tiene que estar en Cloudflare. No hay que cambiar nada en Supabase: los enlaces de
  acceso usan el dominio desde el que se abre la app.
- **Probar el build en local**: con las tres variables en el entorno,
  `node scripts/set-env.mjs && pnpm build && pnpm exec wrangler dev`, y después
  `git checkout src/environments/environment.ts` para no commitear los valores.

Tras el primer despliegue, comprueba en el móvil que la app se instala, que las notificaciones
se activan desde el perfil y que llega un aviso grave.

## Primer administrador

El seed no se aplica en producción. Crea el usuario desde el panel de Supabase
(Authentication > Users); su perfil nace inactivo, así que actívalo y conviértelo en
administrador en la misma sentencia:

```sql
update public.profiles set role = 'admin', active = true where id = '<uuid>';
```
