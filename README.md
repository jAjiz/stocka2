# stocka2

Aplicación de inventario: SPA Angular 22 + Supabase.

## Requisitos

- Node 24
- Docker arrancado (necesario para Supabase local)

## Desarrollo

```bash
npm install
npm run db:start   # arranca Supabase local (supabase start)
npm start          # ng serve en http://localhost:4200
npm test           # pruebas unitarias (Vitest)
npm run db:reset   # reinicia la base de datos local (migraciones + seed)
npm run db:test    # pruebas de base de datos (supabase test db)
npm run test:functions  # prueba de humo de la Edge Function admin-users (tras db:reset)
npx ng build       # compilación
```

Las Edge Functions (`supabase/functions`) las sirve `npm run db:start`. En Windows la recarga
en caliente no detecta cambios: tras editar una función, `docker restart supabase_edge_runtime_stocka2`.

`npx supabase status` muestra la URL y las claves locales. Los valores de
desarrollo están en `src/environments/environment.development.ts`.

## Usuarios de desarrollo

`npm run db:reset` carga `supabase/seed.sql`: 3 localizaciones (Taller, Furgoneta 1,
Furgoneta 2), 3 tipos, 8 artículos con stock inicial en Taller (mediante operaciones
`add`) y estos usuarios. La contraseña es `stocka2-dev` (solo desarrollo, nunca en producción).

| Email                  | Rol   | Permisos                       |
| ---------------------- | ----- | ------------------------------ |
| `admin@stocka2.test`   | admin | todas las localizaciones       |
| `furgo1@stocka2.test`  | user  | operar en Furgoneta 1          |

Las pruebas de BD (`npm run db:test`) vacían estos datos dentro de su transacción
(`tests.clear_seed()`), así que no los alteran.

## Producción

### Desactivar el registro abierto

`enable_signup = false` en `supabase/config.toml` solo afecta a Supabase local. En el
proyecto hosted el registro está abierto por defecto y la anon key es pública, así que
cualquiera podría crear una cuenta con `POST /auth/v1/signup`. Antes de publicar:

- **Authentication → Sign In / Providers → desactivar "Allow new users to sign up".**

Como defensa en profundidad, el trigger `on_auth_user_created` crea el perfil **inactivo**
salvo que el usuario lleve `stocka2_invited = true` en `raw_app_meta_data` (solo lo puede
escribir `service_role`). Un usuario con el perfil inactivo no puede entrar ni operar.

### Edge Function y Auth

- Despliega la función: `npx supabase functions deploy admin-users`.
- Authentication → Email → **Email OTP Expiration**: 86400 (24 h, el máximo). Es la caducidad
  de los enlaces de acceso. Si usas otro valor, ponlo también en el secreto
  `STOCKA2_LINK_TTL_SECONDS` (`npx supabase secrets set STOCKA2_LINK_TTL_SECONDS=…`), que
  la función usa para indicar al administrador cuándo caduca el enlace.
- Authentication → Providers → Email → **Minimum password length**: 8.
- No hace falta configurar URLs de redirección: los enlaces apuntan a la propia aplicación
  (`/acceso?t=…`) y la app canjea el token con `verifyOtp`, así que la vista previa de
  WhatsApp no lo gasta.

### Primer administrador

El seed no se aplica en producción. Crea el usuario desde el panel de Supabase
(Authentication > Users); su perfil nace inactivo, así que actívalo y conviértelo en
administrador en la misma sentencia:

```sql
update public.profiles set role = 'admin', active = true where id = '<uuid>';
```

## Estado

**Plan 1 completado** (base): autenticación (login y cierre de sesión), esquema con RLS y
funciones `perform_operation`, `create_item` y `search_operations`, shell responsive
(barra inferior en móvil, menú lateral en escritorio), inicio con las localizaciones accesibles,
página de localización con sus operaciones (añadir, traer aquí, baja, salida por trabajo),
stock global e historial con filtros y detalle de operación. Verificado: 123 pruebas pgTAP,
64 pruebas Vitest, `ng build` sin avisos y recorrido manual a 375 px y 1280 px.

Pendiente:

- **Plan 2 — administración:** usuarios y enlaces de acceso, localizaciones, artículos y tipos.
- **Plan 3 — avisos y notificaciones push** con PWA.
- **Plan 4 — importación CSV/Excel y despliegue** en Cloudflare.
