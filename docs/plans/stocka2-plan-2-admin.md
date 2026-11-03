# stocka2 — Plan 2: Administración (usuarios, enlaces de acceso, catálogo y perfil)

**Goal:** Un área de administración (solo administradores) para invitar y gestionar usuarios con enlaces de acceso que se comparten a mano, y para mantener localizaciones, tipos y artículos; más la página de perfil y la pantalla de crear contraseña.

**Architecture:** Las escrituras de catálogo y de perfiles son RPC `security definer` que comprueban `is_admin()` y aplican las reglas de deshabilitar/eliminar con bloqueos de fila. Lo que necesita la clave de servicio (crear usuarios de Auth, generar enlaces, banear) vive en una única Edge Function `admin-users`, que comprueba que quien llama es administrador con su propio JWT y delega en las RPC las reglas de negocio. Los enlaces apuntan a la propia aplicación (`/acceso?t=<token_hash>`) y la SPA canjea el token con `verifyOtp`, de modo que la vista previa de WhatsApp no lo consume. RLS exige además un perfil activo para leer, así que un JWT de un usuario desactivado deja de leer datos al instante.

**Tech Stack:** Angular 22 (standalone, signals, zoneless, Vitest), Angular Material + CDK, `@supabase/supabase-js` v2, Supabase CLI, Postgres + pgTAP, Edge Functions (Deno, `npm:@supabase/supabase-js@2`).

**Spec:** `docs/specs/stocka2-design.md` (§4, §5 y §8 puntos 1, 6 y 7). Plan anterior: `docs/plans/stocka2-plan-1-base.md`.

**Fuera de este plan:** reglas de aviso y activación de notificaciones en el perfil (plan 3), importación (plan 4).

## Global Constraints

- Las del plan 1 siguen vigentes (castellano, RLS solo `select`, escrituras por RPC, `Europe/Madrid`, `BreakpointObserver`, secretos fuera del repositorio).
- La aplicación **no envía emails**: los enlaces se muestran al administrador con botones "Copiar" y "Compartir" (Web Share API, solo si `navigator.share` existe).
- Los usuarios **no se borran**; se desactivan. Su nombre sigue en el historial.
- Errores de RPC: `raise exception using errcode = 'P0001', message = '<código>'`, igual que en el plan 1. La Edge Function responde `{ "error": "<código>" }` con los mismos códigos, y el cliente los traduce con `dbErrorMessage`.
- Toda RPC nueva: `security definer`, `set search_path = ''`, `revoke execute … from public, anon`, `grant execute … to authenticated`.
- Contraseñas: mínimo 8 caracteres (cliente y `minimum_password_length = 8` en `config.toml`).
- Caducidad de los enlaces: la de Supabase Auth (`[auth.email] otp_expiry`, 86400 s en local). La función la lee de `STOCKA2_LINK_TTL_SECONDS` (por defecto `86400`) solo para mostrarla; el README avisa de que ambos valores deben coincidir.

## Review Focus

1. **La vista previa de WhatsApp abre el enlace** antes que el invitado: el token no debe consumirse. El enlace es de la SPA (la función nunca devuelve `action_link`) y solo se canjea con JavaScript (`verifyOtp`) al pulsar "Continuar"; lo prueban `access.page.spec.ts` (Tarea 4) y la prueba de humo, que canjea el `token_hash` (Tarea 3).
2. **El administrador se quita a sí mismo el rol o se desactiva siendo el único**: se rechaza con `last_admin` (prueba en Tarea 2).
3. **Usuario desactivado con un JWT aún válido** lee tablas por REST: 0 filas en todas (prueba en Tarea 1); además queda baneado y no puede refrescar ni entrar (prueba de humo, Tarea 3).
4. **Deshabilitar una localización o un artículo mientras otra operación le mete stock**: el `for update` de la RPC de administración y el `for share` de `perform_operation` se serializan; nunca queda deshabilitado con stock (la regla se prueba en Tarea 2; el bloqueo lo revisa quien revise).
5. **Invitar un correo que ya existe** (incluido con otras mayúsculas o espacios): `email_exists`, sin crear nada (prueba de humo, Tarea 3).

---

## Estructura de archivos

```
supabase/
  config.toml                                   otp_expiry, minimum_password_length, [functions.admin-users]
  migrations/
    20261103000001_rls_active.sql               is_active() y políticas select que lo exigen
    20261103000002_admin_catalog.sql            RPC de localizaciones, tipos y artículos
    20261103000003_admin_users.sql              RPC de usuarios y update_my_profile
  functions/admin-users/index.ts                Edge Function: invite, link, set-active
  tests/
    08_rls_active.test.sql
    09_admin_catalog.test.sql
    10_admin_users.test.sql
scripts/smoke-admin-users.mjs                   prueba de humo de la Edge Function contra Supabase local
src/app/
  core/admin.guard.ts                           solo administradores
  core/auth.service.ts                          (modificar) acceptLink, setPassword, updateDisplayName
  core/db-errors.ts                             (modificar) códigos nuevos
  data/models.ts                                (modificar) AdminUser, AccessLink
  data/admin.service.ts                         RPC de administración + Edge Function
  data/catalog.service.ts                       (modificar) allItemTypes()
  shared/password-form.component.ts             nueva contraseña + repetir
  shared/access-link.ts                         buildAccessUrl()
  features/access/access.page.ts                /acceso: canjear enlace y crear contraseña
  features/profile/profile.page.ts              /perfil
  features/admin/admin.page.ts                  pestañas de administración
  features/admin/users.page.ts                  lista + acciones
  features/admin/user-dialog.component.ts       invitar / editar
  features/admin/access-link-dialog.component.ts
  features/admin/locations.page.ts
  features/admin/item-types.page.ts
  features/admin/items.page.ts
  features/admin/name-dialog.component.ts      diálogo genérico de alta/edición (localización, tipo, artículo)
  layout/shell.component.ts                     (modificar) enlaces Perfil y Administración
  app.routes.ts                                 (modificar)
```

---

### Task 1: RLS exige un perfil activo

**Files:**
- Create: `supabase/migrations/20261103000001_rls_active.sql`, `supabase/tests/08_rls_active.test.sql`

**Interfaces:**
- Produces: `public.is_active() returns boolean` (stable, security definer, `search_path = ''`): true si existe el perfil de `auth.uid()` con `active`. `revoke` a `public, anon`; `grant` a `authenticated, service_role`.
- Todas las políticas `select` del plan 1 se recrean (`drop policy` + `create policy`, mismos nombres) añadiendo `(select public.is_active())`:
  - `profiles`, `locations`, `item_types`, `items`, `operations`, `operation_lines`: `using ((select public.is_active()))`.
  - `stock`: `is_active() and exists (… locations.active)`.
  - `location_permissions`: `is_active() and (user_id = auth.uid() or is_admin())`.

- [ ] **Step 1: Escribe `08_rls_active.test.sql`**: un usuario `u` activo con permiso en una localización con stock y una operación, y un usuario `x` con `active=false` y las mismas condiciones.
  - Como `u`: `count(*)` > 0 en `profiles`, `locations`, `items`, `item_types`, `stock`, `operations`, `operation_lines`, `location_permissions`.
  - Como `x`: `count(*)` = 0 en esas ocho tablas, y `search_operations()` devuelve 0 filas.
  - `is_active()` como `anon` → `throws_ok` con `42501`.
- [ ] **Step 2:** `npm run db:test` → FALLA.
- [ ] **Step 3:** Escribe la migración.
- [ ] **Step 4:** `npm run db:reset && npm run db:test` → PASA (incluidas las pruebas del plan 1).
- [ ] **Step 5: Commit** `feat(db): RLS solo para perfiles activos`

### Task 2: RPC de administración (catálogo, usuarios y perfil propio)

**Files:**
- Create: `supabase/migrations/20261103000002_admin_catalog.sql`, `supabase/migrations/20261103000003_admin_users.sql`, `supabase/tests/09_admin_catalog.test.sql`, `supabase/tests/10_admin_users.test.sql`

**Interfaces:**
- Produces (todas lanzan `forbidden` si `not is_admin()`, salvo `update_my_profile`; los textos se recortan y la cadena vacía es null; nombre null → `invalid_input`; id inexistente → `not_found`):
  - `admin_save_location(p_id uuid, p_name text, p_kind text) returns uuid`: `p_id` null crea, si no actualiza nombre y tipo. `p_kind` fuera de `warehouse|vehicle` → `invalid_input`. Nombre repetido (`lower`) → `duplicate_location`.
  - `admin_set_location_active(p_id uuid, p_active boolean) returns void`: bloquea la localización `for update`; para deshabilitar exige `coalesce(sum(stock.quantity),0) = 0` → si no, `location_has_stock`.
  - `admin_delete_location(p_id uuid) returns void`: si aparece como origen o destino de alguna operación → `location_in_use`. Borra sus `location_permissions`, sus filas de `stock` y la localización.
  - `admin_save_item_type(p_id uuid, p_name text) returns uuid`: crea o renombra. Repetido → `duplicate_type`.
  - `admin_set_item_type_active(p_id uuid, p_active boolean) returns void`: sin restricciones (spec §4: un tipo en uso se deshabilita en lugar de borrarse; un artículo existente conserva su tipo deshabilitado).
  - `admin_delete_item_type(p_id uuid) returns void`: si algún artículo (activo o no) lo usa → `type_in_use`.
  - `admin_update_item(p_id uuid, p_name text, p_type_id uuid, p_reference text) returns void`: nombre repetido entre activos (`normalize_name`, excluyendo el propio) → `duplicate_name`. Cambiar a un tipo distinto e inactivo o inexistente → `inactive_type`.
  - `admin_set_item_active(p_id uuid, p_active boolean) returns void`: bloquea el artículo `for update`; deshabilitar con stock total > 0 → `item_has_stock`. Reactivar con un nombre que ya usa otro activo → `duplicate_name`.
  - `admin_delete_item(p_id uuid) returns void`: si aparece en `operation_lines` → `item_in_use`. Borra sus filas de `stock` y el artículo.
  - `admin_list_users() returns table(id uuid, email text, display_name text, role text, active boolean, location_ids uuid[], last_sign_in_at timestamptz, created_at timestamptz)`: une `profiles` con `auth.users`; `location_ids` vacío (`'{}'`) si no tiene. Orden `display_name, id`.
  - `admin_update_user(p_user_id uuid, p_display_name text, p_role text, p_location_ids uuid[]) returns void`: actualiza nombre y rol y **sustituye** los permisos. Rol fuera de `admin|user` o localización inexistente → `invalid_input`. Si deja sin administradores activos → `last_admin`.
  - `admin_set_user_active(p_user_id uuid, p_active boolean) returns void`: si desactiva al último administrador activo → `last_admin`.
  - `update_my_profile(p_display_name text) returns void`: requiere perfil activo (`forbidden`); nombre vacío → `invalid_input`.
  - La comprobación de `last_admin` bloquea antes `select … from profiles where role='admin' and active for update` para que dos administradores no se degraden a la vez.

- [ ] **Step 1: Escribe `09_admin_catalog.test.sql`** (datos: admin, usuario `u`, localizaciones T y F1, tipo P, artículos A y B; una operación `add` de A×2 en T hecha como admin):
  - Como `u`, `admin_save_location(null,'X','vehicle')` → `forbidden`.
  - Como admin: crear `'Furgoneta 3'` devuelve id; `' furgoneta 3 '` → `duplicate_location`; `p_kind='coche'` → `invalid_input`; renombrar F1 a `'Furgo 1'` persiste.
  - `admin_set_location_active(T,false)` → `location_has_stock`; F1 (sin stock) → ok y `active=false`; reactivar → ok.
  - `admin_delete_location(T)` → `location_in_use`; borrar `'Furgoneta 3'` (con un permiso de `u`) → la localización y el permiso desaparecen.
  - Tipos: `'p'` repetido → `duplicate_type`; borrar P → `type_in_use`; deshabilitar P → ok; un tipo nuevo sin artículos se borra.
  - Artículos: `admin_update_item(B, 'a', P, null)` (A existe) → `duplicate_name`; `admin_update_item(A,'A2',P,'  ')` → `reference` null; deshabilitar A → `item_has_stock`; deshabilitar B → ok; borrar A → `item_in_use`; borrar B → ok.
  - `admin_set_item_active(B2,true)` cuando otro artículo activo ya se llama igual → `duplicate_name`.
- [ ] **Step 2: Escribe `10_admin_users.test.sql`** (admin `a`, usuario `u`, localizaciones T y F1):
  - `admin_list_users()` como `u` → `forbidden`; como `a` → 2 filas, con el `email` de `auth.users` y `location_ids` correctos.
  - `admin_update_user(u,'Juan','user',array[T,F1])` → nombre cambiado y dos permisos; después con `array[F1]` → solo F1; con `'{}'` → ninguno.
  - `admin_update_user(u,'Juan','jefe','{}')` → `invalid_input`; con una localización inexistente → `invalid_input`; con nombre `'  '` → `invalid_input`.
  - `admin_update_user(a,'A','user','{}')` siendo `a` el único admin → `last_admin`; `admin_set_user_active(a,false)` → `last_admin`.
  - Promueve `u` a admin: ahora `admin_set_user_active(a,false)` → ok.
  - `update_my_profile('  Pepe ')` como `u` → `display_name='Pepe'`; con `''` → `invalid_input`.
  - Como `anon`, `admin_list_users()` → `42501`.
- [ ] **Step 3:** `npm run db:test` → FALLA.
- [ ] **Step 4:** Escribe las dos migraciones.
- [ ] **Step 5:** `npm run db:reset && npm run db:test` → PASA.
- [ ] **Step 6: Commit** `feat(db): RPC de administración de catálogo y usuarios`

### Task 3: Edge Function `admin-users`

**Files:**
- Create: `supabase/functions/admin-users/index.ts`, `scripts/smoke-admin-users.mjs`
- Modify: `supabase/config.toml` (`[auth] minimum_password_length = 8`, `[auth.email] otp_expiry = 86400`, `[functions.admin-users] verify_jwt = true`), `package.json` (`"test:functions": "node scripts/smoke-admin-users.mjs"`), `README.md`

**Interfaces:**
- Consumes: RPC `is_admin`, `admin_update_user`, `admin_set_user_active` (Tarea 2).
- Produces: `POST /functions/v1/admin-users` con JSON:
  - `{ "action": "invite", "email", "displayName", "role", "locationIds": string[] }` → `{ "userId", "tokenHash", "expiresAt" }`.
  - `{ "action": "link", "userId" }` → `{ "tokenHash", "expiresAt" }`.
  - `{ "action": "set-active", "userId", "active": boolean }` → `{}`.
  - Errores: `{ "error": code }` con 401 (sin JWT), 403 (`forbidden`), 400 (`invalid_input`, `email_exists`, `inactive_user`, `not_found`, `last_admin`) o 500 (`unexpected`). Responde también a `OPTIONS` con cabeceras CORS (`Access-Control-Allow-Origin: *`, `Allow-Headers: authorization, x-client-info, apikey, content-type`).
- Comportamiento:
  - Dos clientes: `userClient` con `SUPABASE_URL`, `SUPABASE_ANON_KEY` y la cabecera `Authorization` de la petición; `adminClient` con `SUPABASE_SERVICE_ROLE_KEY`. Primero `userClient.rpc('is_admin')`; si no es `true` → 403 `forbidden`.
  - `invite`: correo `trim().toLowerCase()` con forma `x@y.z`, `displayName` no vacío, `role` válido y `locationIds` UUID; si no → `invalid_input`. `adminClient.auth.admin.createUser({ email, email_confirm: true, app_metadata: { stocka2_invited: true }, user_metadata: { display_name } })` (sin contraseña); si Auth responde `email_exists` → `email_exists`. Luego `userClient.rpc('admin_update_user', …)` y `userClient.rpc('admin_set_user_active', { p_active: true })` (GoTrue aplica `app_metadata` después del `insert`, así que el trigger crea el perfil inactivo); si falla, deshace (borra el perfil con `adminClient` y `auth.admin.deleteUser`) y devuelve el error de la RPC. Por último genera el enlace (ver `link`).
  - `link`: busca el perfil; inexistente → `not_found`; inactivo → `inactive_user`. `adminClient.auth.admin.generateLink({ type: 'recovery', email })` y devuelve `properties.hashed_token`. **Nunca** devuelve `action_link` (ese enlace lo consumiría la vista previa).
  - `set-active`: `userClient.rpc('admin_set_user_active', …)` (aplica `last_admin`) y después `auth.admin.updateUserById(id, { ban_duration: active ? 'none' : '876000h' })`.
  - `expiresAt = now + STOCKA2_LINK_TTL_SECONDS` (por defecto 86400), en ISO.
- `scripts/smoke-admin-users.mjs` (Node, `@supabase/supabase-js`, URL y claves de `npx supabase status -o json`): requiere `npm run db:reset` previo. Cada comprobación imprime `ok`/`FALLO` y el proceso sale con 1 si alguna falla:
  1. Como `furgo1@stocka2.test`, `invite` → 403.
  2. Como admin, `invite` de `smoke-<timestamp>@stocka2.test` con permiso en Furgoneta 1 → `tokenHash` y `expiresAt` dentro de 24 h ± 1 min.
  3. Invitar el mismo correo en mayúsculas → `email_exists`.
  4. `verifyOtp({ token_hash, type: 'recovery' })` en un cliente nuevo crea sesión; `updateUser({ password })` y después `signInWithPassword` funcionan.
  5. Un segundo `verifyOtp` con el mismo hash falla (un solo uso).
  6. Como el invitado, `select` de `locations` > 0 filas. Como admin, `set-active false`; con el JWT antiguo del invitado, `select` de `locations` = 0 filas y `signInWithPassword` falla. `link` para él → `inactive_user`.
  7. `set-active true` → vuelve a entrar.
  8. `set-active false` sobre el único admin → `last_admin`.

- [ ] **Step 1:** Escribe `scripts/smoke-admin-users.mjs` y el script `test:functions`.
- [ ] **Step 2:** `npm run db:reset && npm run test:functions` → FALLA (404 de la función).
- [ ] **Step 3:** Escribe la función y los cambios de `config.toml`. `npx supabase stop && npx supabase start` para aplicar la configuración (el runtime sirve `supabase/functions` automáticamente).
- [ ] **Step 4:** `npm run db:reset && npm run test:functions` → todo `ok`.
- [ ] **Step 5:** README, sección Producción: `npx supabase functions deploy admin-users`; la caducidad de "Email OTP Expiration" (recomendado 86400) debe coincidir con el secreto `STOCKA2_LINK_TTL_SECONDS`; "Minimum password length" = 8; no hace falta configurar URLs de redirección porque los enlaces son de la propia app.
- [ ] **Step 6: Commit** `feat(functions): admin-users para invitar, generar enlaces y desactivar`

### Task 4: Servicios del cliente, errores y pantalla de acceso

**Files:**
- Create: `src/app/data/admin.service.ts`, `src/app/shared/access-link.ts`, `src/app/shared/password-form.component.ts`, `src/app/features/access/access.page.ts`, `src/app/core/admin.guard.ts`, con specs
- Modify: `src/app/data/models.ts`, `src/app/core/db-errors.ts` (+spec), `src/app/core/auth.service.ts` (+spec), `src/app/data/catalog.service.ts`, `src/app/app.routes.ts`

**Interfaces:**
- Produces:
  - Modelos: `AdminUser { id; email; displayName; role: 'admin'|'user'; active; locationIds: string[]; lastSignInAt: Date | null }`, `AccessLink { url: string; expiresAt: Date }`, `UserInput { displayName; role; locationIds: string[] }`, `InviteInput extends UserInput { email }`.
  - `buildAccessUrl(origin: string, tokenHash: string): string` → `${origin}/acceso?t=${encodeURIComponent(tokenHash)}`.
  - `AdminService`:
    - `users(): Promise<AdminUser[]>` (`admin_list_users`), `updateUser(id, input: UserInput)`, `saveLocation(id: string | null, name, kind): Promise<string>`, `setLocationActive(id, active)`, `deleteLocation(id)`, `saveItemType(id: string | null, name): Promise<string>`, `setItemTypeActive`, `deleteItemType`, `updateItem(id, name, typeId, reference: string | null)`, `setItemActive`, `deleteItem`: todas por RPC; si hay `error`, lo lanzan tal cual.
    - `invite(input: InviteInput): Promise<AccessLink>`, `regenerateLink(userId): Promise<AccessLink>`, `setUserActive(id, active): Promise<void>`: `supabase.functions.invoke('admin-users', { body })`. Ante `FunctionsHttpError` leen `await error.context.json()` y lanzan `{ message: body.error }`; ante cualquier otro error lanzan `{ message: 'unexpected' }`. La URL se construye con `buildAccessUrl(location.origin, tokenHash)`.
  - `CatalogService.allItemTypes(): Promise<ItemType[]>` (incluye inactivos).
  - `AuthService`:
    - `acceptLink(tokenHash: string): Promise<void>`: `verifyOtp({ token_hash, type: 'recovery' })` y carga perfil y permisos (`establish`). Errores: "El enlace no es válido o ha caducado. Pide uno nuevo al administrador." (Auth), "Tu usuario está desactivado. Habla con el administrador." (perfil inactivo) o el de red.
    - `setPassword(password: string): Promise<void>`: `auth.updateUser({ password })`; error → "No se ha podido cambiar la contraseña. Inténtalo de nuevo."
    - `updateDisplayName(name: string): Promise<void>`: RPC `update_my_profile` y actualiza la signal `profile`.
  - `adminGuard: CanActivateFn`: espera `ready`; si no es admin, `UrlTree` a `/`.
  - `PasswordFormComponent` (`app-password-form`): campos "Nueva contraseña" y "Repite la contraseña", entrada `busy`, salida `submitted: string`. Errores en línea: "Mínimo 8 caracteres." y "Las contraseñas no coinciden."; el botón ("Guardar contraseña") se desactiva con errores o `busy`.
  - `AccessPage` en `/acceso` (pública, fuera del shell): lee `t` de la query; si falta → "El enlace no es válido o ha caducado. Pide uno nuevo al administrador." Si está, canjea al pulsar "Continuar" (no al cargar: evita gastar el token si el navegador precarga la página) y después muestra `PasswordFormComponent`; al guardar navega a `/` con el snackbar "Contraseña guardada".
  - Rutas: `acceso` (pública), y bajo el shell `perfil` y `admin` (con `adminGuard`) cuyas hijas son `usuarios`, `localizaciones`, `articulos` y `tipos` (`''` → `usuarios`).
  - `dbErrorMessage`, mensajes exactos nuevos:
    - `invalid_input` → "Revisa los datos: hay campos vacíos o no válidos."
    - `not_found` → "No se ha encontrado el elemento. Recarga la página."
    - `duplicate_location` → "Ya existe una localización con ese nombre."
    - `duplicate_type` → "Ya existe un tipo con ese nombre."
    - `location_has_stock` → "No se puede deshabilitar: la localización todavía tiene stock."
    - `location_in_use` → "No se puede eliminar porque aparece en el historial. Puedes deshabilitarla."
    - `type_in_use` → "No se puede eliminar porque hay artículos de este tipo. Puedes deshabilitarlo."
    - `item_has_stock` → "No se puede deshabilitar: el artículo todavía tiene stock."
    - `item_in_use` → "No se puede eliminar porque aparece en el historial. Puedes deshabilitarlo."
    - `last_admin` → "Tiene que quedar al menos un administrador activo."
    - `email_exists` → "Ya existe un usuario con ese correo."
    - `inactive_user` → "El usuario está desactivado. Actívalo antes de generar un enlace."

- [ ] **Step 1: Escribe las pruebas**:
  - `db-errors.spec.ts`: un caso por código nuevo.
  - `access-link.spec.ts`: `buildAccessUrl('https://a.b', 'x/y+z')` → `'https://a.b/acceso?t=x%2Fy%2Bz'`.
  - `admin.service.spec.ts` con un cliente falso: `invite` con `functions.invoke` que devuelve `{ data: { tokenHash: 'h', expiresAt: '2026-11-04T10:00:00Z' } }` → `url` termina en `/acceso?t=h` y `expiresAt` es ese `Date`; con un `FunctionsHttpError` cuyo `context.json()` da `{ error: 'email_exists' }` → rechaza con `{ message: 'email_exists' }`.
  - `auth.service.spec.ts`: `acceptLink` con `verifyOtp` que devuelve error → el mensaje de enlace caducado; con éxito y perfil inactivo → mensaje de desactivado y `signOut` llamado; `updateDisplayName('Pepe')` actualiza `profile().displayName`.
  - `password-form.component.spec.ts`: `'1234567'` muestra "Mínimo 8 caracteres." y el botón está desactivado; contraseñas distintas → "Las contraseñas no coinciden."; iguales y válidas → emite `submitted` una vez.
  - `admin.guard.spec.ts`: no admin → `UrlTree` a `/`; admin → true.
  - `access.page.spec.ts`: sin `t` muestra el mensaje de enlace no válido y no llama a `acceptLink`; con `t`, **no** llama a `acceptLink` hasta pulsar "Continuar".
- [ ] **Step 2:** `npm test -- --watch=false` → FALLA.
- [ ] **Step 3:** Implementa según las Interfaces.
- [ ] **Step 4:** `npm test -- --watch=false` → PASA.
- [ ] **Step 5: Commit** `feat(app): servicio de administración y pantalla de acceso por enlace`

### Task 5: Administración de usuarios

**Files:**
- Create: `src/app/features/admin/admin.page.ts`, `users.page.ts`, `user-dialog.component.ts`, `access-link-dialog.component.ts`, con specs de `users.page` y `access-link-dialog`
- Modify: `src/app/layout/shell.component.ts` (+spec)

**Interfaces:**
- Consumes: `AdminService`, `CatalogService.allLocations()`, `AuthService`, `dbErrorMessage`, `formatDateTime`.
- Produces:
  - `AdminPage`: título "Administración" y `mat-tab-nav-bar` con "Usuarios", "Localizaciones", "Artículos" y "Tipos", y `router-outlet`.
  - `UsersPage`: botón "Invitar usuario". Lista (tarjetas en móvil, `mat-table` en ordenador) con nombre, correo, rol ("Administrador"/"Usuario"), localizaciones con permiso (o "Todas" si es admin) y estado: "Desactivado", "Pendiente de acceso" (`lastSignInAt` null) o "Activo". Menú por fila: "Editar", "Generar enlace de acceso", "Desactivar"/"Activar" (desactivar pide confirmación: "¿Desactivar a {nombre}? No podrá entrar, pero seguirá apareciendo en el historial.").
  - `UserDialogComponent` (datos `{ user: AdminUser | null; locations: Location[] }`): correo (solo al invitar), nombre visible, rol (radio) y casillas de localización (ocultas si el rol es admin; las deshabilitadas llevan "(deshabilitada)"). Al invitar llama a `invite` y cierra devolviendo el `AccessLink`; al editar llama a `updateUser`. Errores con `dbErrorMessage` dentro del diálogo; botón desactivado mientras la petición está en curso.
  - `AccessLinkDialogComponent` (datos `{ name: string; link: AccessLink }`): texto "Envía este enlace a {name}. Al abrirlo podrá crear su contraseña.", la URL en un campo de solo lectura, "Copiar" (`navigator.clipboard.writeText`, snackbar "Enlace copiado"), "Compartir" solo si `navigator.share` existe (`{ title: 'Acceso a Stocka2', text: 'Entra en Stocka2 y crea tu contraseña:', url }`), y "Caduca el {formatDateTime(expiresAt)}. Si caduca, genera otro desde Administración."
  - Shell: enlaces "Perfil" (icono `person`) para todos y "Administración" (icono `admin_panel_settings`) si `auth.isAdmin()`, en la barra inferior y en el menú lateral; en el menú lateral el nombre del usuario enlaza a `/perfil`.

- [ ] **Step 1: Escribe las pruebas**:
  - `users.page.spec.ts` (servicios falsos): un usuario con `lastSignInAt: null` muestra "Pendiente de acceso"; uno inactivo, "Desactivado"; un admin, "Todas" en localizaciones. Si `setUserActive` rechaza con `{ message: 'last_admin' }`, aparece "Tiene que quedar al menos un administrador activo." y la lista no cambia.
  - `access-link-dialog.component.spec.ts`: sin `navigator.share` no hay botón "Compartir"; con él, pulsarlo llama a `share` con la `url`; "Copiar" llama a `clipboard.writeText(url)`; el texto contiene "Caduca el".
  - `shell.component.spec.ts`: "Administración" aparece solo si `isAdmin()`; "Perfil" siempre.
- [ ] **Step 2:** `npm test -- --watch=false` → FALLA.
- [ ] **Step 3:** Implementa.
- [ ] **Step 4:** `npm test -- --watch=false` → PASA.
- [ ] **Step 5: Commit** `feat(app): administración de usuarios con enlaces de acceso`

### Task 6: Administración de localizaciones, tipos y artículos

**Files:**
- Create: `src/app/features/admin/locations.page.ts`, `item-types.page.ts`, `items.page.ts`, `name-dialog.component.ts`, con specs de las tres páginas

**Interfaces:**
- Consumes: `AdminService`, `CatalogService.allLocations()`, `allItemTypes()`, `allItems()`, `createItem()`.
- Produces:
  - `NameDialogComponent` (datos `{ title: string; fields: ('name' | 'kind' | 'type' | 'reference')[]; value: { name?; kind?; typeId?; reference? }; types?: ItemType[]; save: (v) => Promise<unknown> }`): ejecuta `save` y se cierra con `true` si tiene éxito; si falla, muestra `dbErrorMessage` sin cerrarse. Etiquetas: "Nombre", "Tipo de localización" (Almacén / Vehículo), "Tipo", "Referencia (opcional)". Botón "Guardar" desactivado con el nombre vacío o mientras guarda.
  - Las tres páginas: buscador (`normalizeText`), interruptor "Mostrar deshabilitados" (apagado por defecto), botón de alta ("Nueva localización", "Nuevo tipo", "Nuevo artículo") y por fila "Editar", "Deshabilitar"/"Habilitar" y "Eliminar" (con confirmación "¿Eliminar {nombre}? No se puede deshacer."). Los errores de las acciones se muestran en un `MatSnackBar` con `dbErrorMessage`; tras cada éxito se recarga la lista. Las filas deshabilitadas llevan la etiqueta "Deshabilitado/a".
  - Localizaciones: icono `warehouse` / `local_shipping` según `kind`.
  - Artículos: columnas nombre, tipo, referencia; el alta usa `CatalogService.createItem`; el filtro por tipo usa `allItemTypes()`; en el diálogo solo se ofrecen tipos activos más el tipo actual del artículo.

- [ ] **Step 1: Escribe las pruebas** (servicios falsos):
  - `locations.page.spec.ts`: por defecto no se ve una localización deshabilitada; al activar "Mostrar deshabilitados", sí, con "Deshabilitada". Si `setLocationActive` rechaza con `{ message: 'location_has_stock' }`, el snackbar muestra "No se puede deshabilitar: la localización todavía tiene stock.".
  - `item-types.page.spec.ts`: `deleteItemType` rechazado con `type_in_use` → snackbar "No se puede eliminar porque hay artículos de este tipo. Puedes deshabilitarlo."; con éxito, la lista se recarga (`allItemTypes` llamado dos veces).
  - `items.page.spec.ts`: el buscador `'filtro'` deja solo "Filtró de aire"; `deleteItem` rechazado con `item_in_use` → su mensaje.
- [ ] **Step 2:** `npm test -- --watch=false` → FALLA.
- [ ] **Step 3:** Implementa.
- [ ] **Step 4:** `npm test -- --watch=false` → PASA.
- [ ] **Step 5: Commit** `feat(app): administración de localizaciones, tipos y artículos`

### Task 7: Página de perfil

**Files:**
- Create: `src/app/features/profile/profile.page.ts` (+spec)

**Interfaces:**
- Consumes: `AuthService.updateDisplayName`, `AuthService.setPassword`, `PasswordFormComponent`.
- Produces: `/perfil` con dos tarjetas: "Nombre visible" (campo + "Guardar", snackbar "Nombre guardado", error con `dbErrorMessage`) y "Cambiar contraseña" (`PasswordFormComponent`, snackbar "Contraseña cambiada"). Muestra el correo de la sesión como texto. El hueco de notificaciones queda para el plan 3.

- [ ] **Step 1: Escribe `profile.page.spec.ts`**: guardar `'  Pepe '` llama a `updateDisplayName('Pepe')`; con el nombre vacío el botón está desactivado; enviar la contraseña llama a `setPassword` una vez.
- [ ] **Step 2:** `npm test -- --watch=false` → FALLA.
- [ ] **Step 3:** Implementa.
- [ ] **Step 4:** `npm test -- --watch=false` → PASA.
- [ ] **Step 5: Commit** `feat(app): página de perfil`

### Task 8: Verificación final del plan 2

- [ ] **Step 1:** `npm run db:reset && npm run db:test`, `npm run db:reset && npm run test:functions`, `npm test -- --watch=false` y `npx ng build` → todo PASA y compila sin avisos de presupuesto que fallen el build.
- [ ] **Step 2:** Recorrido manual a 375 px y 1280 px: invitar un usuario con permiso en Furgoneta 2, copiar el enlace, abrirlo en una ventana privada, crear la contraseña, operar en Furgoneta 2; como admin desactivarlo y comprobar que su sesión deja de ver datos; generar un enlace de recuperación tras reactivarlo; crear, deshabilitar y eliminar una localización, un tipo y un artículo; cambiar el nombre visible y la contraseña en el perfil.
- [ ] **Step 3:** README: estado "Plan 2 completado" con los recuentos de pruebas, y lo pendiente (planes 3–4).
- [ ] **Step 4: Commit** `docs: estado tras plan 2`

---

## Notas de ejecución (2026-11-03)

Desviaciones respecto al plan, decididas al implementar:

- **Perfil del invitado:** GoTrue inserta el usuario y aplica `app_metadata` después, así que el trigger `on_auth_user_created` no ve la marca `stocka2_invited` y crea el perfil inactivo. La función activa al invitado explícitamente con `admin_set_user_active` (Tarea 3).
- **Listas de administración:** usuarios, localizaciones, tipos y artículos usan la misma lista (tarjetas o filas con botones visibles) en móvil y ordenador, en lugar de `mat-table` + menú. Los errores se muestran en un aviso (`role="alert"`) sobre la lista en lugar de un snackbar. Archivos añadidos: `features/admin/catalog-list.component.ts` (lista con buscador y "Mostrar deshabilitados"), `features/admin/catalog-admin.ts` (base común: errores, confirmación, diálogo), `shared/confirm-dialog.component.ts` y `shared/dialog-size.ts`.
- **Barra inferior en móvil:** la entrada de administración se llama "Admin" (con "Administración" desbordaba a 375 px).
- **Contraseña repetida:** `setPassword` traduce `same_password` a "La nueva contraseña tiene que ser distinta de la actual.".
- **Edge Functions en Windows:** la recarga en caliente del runtime local no detecta cambios; hay que reiniciar el contenedor (documentado en el README).
- **Artículos sin filtro por tipo:** la búsqueda de texto cubre el nombre, el tipo y la referencia, así que no se añadió el selector de tipo de la Tarea 6.

### Revisión de la rama (2026-11-03)

Corregido tras la revisión: recargar `/acceso` después de pulsar "Continuar" ya no deja al invitado sin salida (`sessionStorage` recuerda el token canjeado en esa pestaña); "Pendiente de acceso" se basa en si el usuario tiene contraseña (`has_password`), no en `last_sign_in_at`; un administrador no ve "Desactivar" ni puede cambiar su propio rol en la UI; `forbidden` en la administración dice "Solo un administrador activo puede hacer esto."; sin red, la Edge Function da "Sin conexión"; la función deshace la invitación si falla el enlace, revierte el perfil si falla el baneo, distingue 401/500 de 403 al comprobar `is_admin` y convierte los rechazos de validación de GoTrue en `invalid_input`; el formulario de contraseña del perfil se vacía tras guardar; más pruebas pgTAP de `not_found`, `has_password` y `update_my_profile` con usuario inactivo.
