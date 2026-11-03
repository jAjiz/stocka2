# stocka2 — Plan 1: Base (esquema, operaciones, localizaciones e historial)

**Goal:** Una aplicación usable con login, páginas de localización con las cuatro operaciones multi-artículo, stock global e historial filtrable, con todas las reglas de integridad y permisos impuestas en la base de datos.

**Architecture:** SPA Angular sin backend propio que habla directamente con Supabase. Toda escritura de stock pasa por una función SQL `perform_operation` (security definer, atómica, con bloqueo de filas). Las tablas solo se leen desde el cliente: RLS no permite escribir directamente. Los usuarios del primer arranque se crean con el seed local. La administración llega en el plan 2.

**Tech Stack:** Angular 22 (standalone, signals, zoneless, Vitest), Angular Material + CDK, `@supabase/supabase-js` v2, Supabase CLI (paquete npm `supabase`, ejecutado con `npx supabase`), Postgres + pgTAP (`supabase test db`).

**Spec:** `docs/specs/stocka2-design.md`

**Planes siguientes (fuera de este plan):** 2 Administración (usuarios, enlaces de acceso, CRUD de localizaciones, artículos y tipos), 3 Avisos y push con la PWA, 4 Importación CSV/Excel y despliegue en Cloudflare.

## Global Constraints

- Interfaz solo en castellano. Identificadores de código y de base de datos en inglés.
- Cantidades: enteros; stock `>= 0`; cantidad de línea `> 0`.
- Las operaciones nunca se editan ni se borran: no hay políticas `update`/`delete` sobre `operations` ni `operation_lines` para nadie.
- El cliente nunca escribe directamente en `stock`, `operations` ni `operation_lines`. Solo mediante RPC.
- Fechas mostradas en zona `Europe/Madrid`.
- La interfaz se adapta por tamaño de pantalla con `BreakpointObserver` (`Breakpoints.Handset` = móvil); nunca por user agent.
- Secretos fuera del repositorio: el frontend solo conoce la URL de Supabase y la clave `anon`.
- Requisito local: Docker Desktop **arrancado** (lo necesita `npx supabase start`).

## Review Focus

1. **Dos usuarios sacan a la vez la última unidad** del mismo stock: una operación tiene éxito y la otra falla con `insufficient_stock`; nunca stock negativo. Lo cubren `FOR UPDATE` y el `CHECK` (Tarea 2 prueba el `CHECK` directamente; Tarea 4 prueba el rechazo).
2. **Doble pulsación en "Confirmar"** en el móvil: debe crearse una sola operación. El botón se desactiva mientras la petición está en curso (prueba en Tarea 9).
3. **El mismo artículo dos veces en una operación**: se rechaza con `duplicate_item`. El formulario tampoco permite añadirlo (pruebas en Tareas 4 y 9).
4. **Usuario desactivado con sesión aún válida** llama a la RPC: `forbidden` (prueba en Tarea 4).
5. **Localización o artículo deshabilitado** en una operación, incluido como origen de un "Mover": `inactive_location` / `inactive_item` (prueba en Tarea 4).

---

## Estructura de archivos

```
supabase/
  config.toml                      (generado por supabase init)
  migrations/
    20261102000001_schema.sql      tablas, restricciones, trigger de perfiles, helpers
    20261102000002_rls.sql         políticas RLS
    20261102000003_create_item.sql
    20261102000004_perform_operation.sql
    20261102000005_search_operations.sql
  seed.sql                         localizaciones, tipos, artículos y usuarios de prueba
  tests/
    _helpers.sql                   login_as(), crear usuarios de test
    01_schema.test.sql
    02_rls.test.sql
    03_create_item.test.sql
    04_perform_operation.test.sql
    05_search_operations.test.sql
src/
  environments/environment.ts, environment.development.ts
  app/
    app.config.ts, app.routes.ts
    core/
      supabase.ts                  SUPABASE (InjectionToken del cliente)
      auth.service.ts              sesión, perfil, permisos
      auth.guard.ts
      db-errors.ts                 traducción de errores SQL a castellano
    data/
      models.ts                    tipos de dominio
      catalog.service.ts           localizaciones, tipos, artículos
      stock.service.ts
      operations.service.ts        perform, search, líneas
    layout/shell.component.ts      navegación responsive
    features/
      login/login.page.ts
      home/home.page.ts
      location/location.page.ts
      location/operation-form.component.ts
      location/operation-form.model.ts   lógica pura del formulario
      stock/stock-overview.page.ts
      history/history.page.ts
      history/operation-detail.component.ts
    shared/format.ts               fechas Europe/Madrid, etiquetas de tipo de operación
```

---

### Task 1: Andamiaje del proyecto

**Files:**
- Create: proyecto Angular en la raíz del repositorio, `supabase/` mediante `supabase init`, `src/environments/*`, `README.md`, `.gitignore` (añadir `supabase/.temp`, `.env*`)

**Interfaces:**
- Produces: `npm start` (ng serve), `npm test` (Vitest), `npm run db:start` (`supabase start`), `npm run db:reset` (`supabase db reset`), `npm run db:test` (`supabase test db`). `environment.supabaseUrl: string` y `environment.supabaseAnonKey: string`.

- [ ] **Step 1:** En `C:\Dev\stocka2`, ejecuta `npx @angular/cli@22 new stocka2 --directory . --routing --style=scss --ssr=false --skip-git`. No debe sobrescribir `docs/`.
- [ ] **Step 2:** Ejecuta `npx ng add @angular/material` (tema azul, tipografía sí) y `npm i @supabase/supabase-js`, y después `npm i -D supabase`.
- [ ] **Step 3:** Ejecuta `npx supabase init` y `npx ng generate environments`. `environment.development.ts` toma los valores locales que imprime `npx supabase status` (URL `http://127.0.0.1:54321` y la clave anon local, que es pública y está fija en Supabase local). `environment.ts` (producción) lleva marcadores `__SUPABASE_URL__` y `__SUPABASE_ANON_KEY__`, que el plan 4 sustituye en el build.
- [ ] **Step 4:** En `supabase/config.toml`, pon `[db.seed] enabled = true` y `[auth] site_url = "http://localhost:4200"`, `enable_signup = false`. Añade los scripts `db:*` a `package.json`.
- [ ] **Step 5:** Verifica:
  - `npm run db:start` arranca sin errores.
  - `npx ng build` compila.
  - `npm test -- --watch=false` pasa la prueba generada.
- [ ] **Step 6:** Escribe en el `README.md` los requisitos (Node 24, Docker arrancado) y los comandos de desarrollo.
- [ ] **Step 7: Commit** `chore: andamiaje Angular + Supabase`

### Task 2: Esquema base

**Files:**
- Create: `supabase/migrations/20261102000001_schema.sql`, `supabase/tests/_helpers.sql`, `supabase/tests/01_schema.test.sql`

**Interfaces:**
- Produces (tablas, todas con `id uuid primary key default gen_random_uuid()` salvo donde se indica):
  - `profiles(id uuid pk references auth.users on delete restrict, display_name text not null, role text not null default 'user' check (role in ('admin','user')), active boolean not null default true, created_at timestamptz not null default now())`
  - `locations(id, name text not null, kind text not null check (kind in ('warehouse','vehicle')), active boolean not null default true, created_at)`. Índice único sobre `lower(name)`.
  - `item_types(id, name text not null, active boolean not null default true)`. Índice único sobre `lower(name)`.
  - `items(id, name text not null, type_id uuid not null references item_types, reference text, active boolean not null default true, created_at)`. Índice único parcial sobre `public.normalize_name(name)` donde `active`.
  - `location_permissions(user_id uuid references profiles, location_id uuid references locations, primary key (user_id, location_id))`
  - `stock(item_id uuid references items, location_id uuid references locations, quantity integer not null default 0 check (quantity >= 0), primary key (item_id, location_id))`
  - `operations(id, kind text not null check (kind in ('add','move','remove','consume')), origin_id uuid references locations, destination_id uuid references locations, reference text, notes text, user_id uuid not null references profiles, created_at timestamptz not null default now())`. `CHECK` de forma:
    - `add`: origen nulo, destino no nulo.
    - `move`: ambos no nulos y distintos.
    - `remove` y `consume`: origen no nulo, destino nulo.
    - `reference` solo puede ser no nula en `consume`.
  - `operation_lines(operation_id uuid references operations, item_id uuid references items, quantity integer not null check (quantity > 0), primary key (operation_id, item_id))`
  - Índices: `operations(created_at desc)`, `operations(origin_id)`, `operations(destination_id)`, `operations(user_id)`, `operation_lines(item_id)`.
  - `public.normalize_name(text) returns text`: `immutable`, devuelve `lower(unaccent(trim($1)))`. Requiere la extensión `unaccent` en el esquema `extensions`. Envuélvela con el diccionario explícito `extensions.unaccent('extensions.unaccent', $1)` para que sea inmutable.
  - `public.is_admin() returns boolean`: stable, security definer, `search_path = ''`. Es true si el perfil de `auth.uid()` es admin y está activo.
  - `public.can_operate(p_location_id uuid) returns boolean`: stable, security definer. Es true si el usuario es admin activo, o si es usuario activo con fila en `location_permissions` para esa localización.
  - Trigger `on_auth_user_created` en `auth.users`, que inserta en `profiles` con `display_name = coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email,'@',1))`.
- Produces (pruebas): `_helpers.sql` define `tests.create_user(p_email text, p_role text default 'user') returns uuid`, `tests.login_as(p_user uuid)` (fija `request.jwt.claims` con `sub` y `role = authenticated`, y ejecuta `set local role authenticated`) y `tests.logout()` (vuelve a `postgres`). Cada archivo de test lo incluye con `\ir _helpers.sql` dentro de `begin; … rollback;`. Si `supabase test db` no admite `\ir`, copia el bloque al principio de cada test y anótalo en el README.

- [ ] **Step 1: Escribe `01_schema.test.sql`** con pgTAP:
  - `throws_ok` al hacer update de `stock` a `-1` (código `23514`).
  - `throws_ok` al insertar una línea con cantidad `0`.
  - `throws_ok` en `operations` con `kind='move'` y `origin_id = destination_id`.
  - `throws_ok` con `kind='add'` y `reference` no nula.
  - `throws_ok` al insertar dos artículos activos llamados `'Filtro'` y `' filtró '`.
  - `is` comprueba que `tests.create_user('a@stocka2.test')` crea un perfil con `role='user'`, `active=true` y `display_name='a'`.
  - `is` comprueba que `can_operate` es false sin permiso, true con permiso y true para admin, y false para un usuario con permiso pero `active=false`.
- [ ] **Step 2:** `npm run db:test` → FALLA (las tablas no existen).
- [ ] **Step 3:** Escribe la migración según las Interfaces.
- [ ] **Step 4:** `npm run db:reset && npm run db:test` → PASA.
- [ ] **Step 5: Commit** `feat(db): esquema base`

### Task 3: Políticas RLS

**Files:**
- Create: `supabase/migrations/20261102000002_rls.sql`, `supabase/tests/02_rls.test.sql`

**Interfaces:**
- Produces: RLS activado en todas las tablas de `public`. Solo hay políticas `select` para `authenticated`:
  - `profiles`, `locations`, `item_types`, `items`, `operations` y `operation_lines`: todas las filas.
  - `stock`: filas cuya localización está activa (`exists … locations.active`).
  - `location_permissions`: `user_id = auth.uid() or is_admin()`.
- No hay políticas `insert`/`update`/`delete` para `authenticated` ni para `anon` en este plan. Las escrituras son RPC `security definer`.
- `anon` no tiene acceso a nada.

- [ ] **Step 1: Escribe `02_rls.test.sql`**:
  - Como usuario normal, `throws_ok` al hacer `insert` en `operations`, en `stock` y en `items`.
  - Como usuario normal, `update stock` no afecta a ninguna fila (`is(…, 0)` con `get diagnostics` o `results_eq` sobre el valor sin cambios).
  - Como usuario normal, ve 0 filas de `stock` de una localización con `active=false`.
  - Como usuario normal, ve solo sus `location_permissions`; como admin, las ve todas.
  - Como `anon`, `select count(*) from stock` → 0 filas o error de permisos.
- [ ] **Step 2:** `npm run db:test` → FALLA.
- [ ] **Step 3:** Escribe la migración.
- [ ] **Step 4:** `npm run db:reset && npm run db:test` → PASA.
- [ ] **Step 5: Commit** `feat(db): políticas RLS de solo lectura`

### Task 4: RPC `create_item` y `perform_operation`

**Files:**
- Create: `supabase/migrations/20261102000003_create_item.sql`, `supabase/migrations/20261102000004_perform_operation.sql`, `supabase/tests/03_create_item.test.sql`, `supabase/tests/04_perform_operation.test.sql`

**Interfaces:**
- Produces:
  - `public.create_item(p_name text, p_type_id uuid, p_reference text default null) returns uuid`, security definer, `search_path = ''`.
    - Requiere un perfil activo.
    - Recorta los textos y convierte la cadena vacía en null.
    - El tipo tiene que existir y estar activo (`inactive_type`).
    - Si el nombre está duplicado, lanza `duplicate_name`.
  - `public.perform_operation(p_kind text, p_location_id uuid, p_lines jsonb, p_origin_id uuid default null, p_reference text default null, p_notes text default null) returns uuid`, security definer, `search_path = ''`.
    - `p_location_id` es la localización actual: el destino en `add` y `move`, y el origen en `remove` y `consume`.
    - `p_lines` es `[{ "item_id": uuid, "quantity": int }]`.
    - `grant execute` solo a `authenticated`; `revoke` a `public` y `anon`.
- **Errores:** `raise exception using errcode = 'P0001', message = '<código>'`, con estos códigos:
  - `forbidden`: sin perfil activo, o `not can_operate(p_location_id)`.
  - `invalid_operation`: tipo desconocido, líneas vacías, cantidad no entera o `<= 0`, `p_origin_id` presente fuera de `move` o ausente en `move`, origen igual a destino, o `p_reference` fuera de `consume`.
  - `duplicate_item`
  - `inactive_location`: incluye el origen.
  - `inactive_item`
  - `insufficient_stock`: el `detail` es el JSON `[{ "item_id", "available", "requested" }]` con todas las líneas que fallan.
- **Algoritmo** (el resto lo decide quien implemente):
  1. Validar.
  2. Bloquear las filas de stock afectadas con `select … for update` **ordenado por `(location_id, item_id)`**, para evitar interbloqueos entre operaciones simultáneas.
  3. Calcular los faltantes de todas las líneas antes de modificar nada. Si hay alguno, lanzar `insufficient_stock`.
  4. Insertar la cabecera con `user_id = auth.uid()`.
  5. Insertar las líneas.
  6. Aplicar los deltas con `insert … on conflict (item_id, location_id) do update`. En `move`: −origen y +destino. En `add`: +destino. En `remove` y `consume`: −origen.
  7. Recortar `p_notes` y `p_reference`; si quedan vacíos, guardar null.

- [ ] **Step 1: Escribe `03_create_item.test.sql`**:
  - Crea el artículo y devuelve el id.
  - `throws_ok` con `duplicate_name` para `'filtro'` cuando ya existe `'Filtro'`.
  - `throws_ok` con `inactive_type`.
  - Con referencia `'  '` se guarda null.
- [ ] **Step 2: Escribe `04_perform_operation.test.sql`**. Datos: Taller (T), Furgoneta 1 (F1), Furgoneta 2 (F2), artículos A y B, un usuario `u` con permiso solo en F1, un admin y un usuario `x` desactivado con permiso en F1.
  - Como admin, `add` en T de A×10 y B×5 → stock T: A=10, B=5. Una cabecera y dos líneas.
  - Como `u`, `move` a F1 desde T de A×3 → T A=7, F1 A=3. **`u` no tiene permiso en T y aun así funciona.**
  - Como `u`, `consume` en F1 de A×2 con referencia `' OT-1 '` y notas `'  '` → F1 A=1, `reference='OT-1'`, `notes` null.
  - Como `u`, `move` a T → `forbidden`.
  - Como `x` → `forbidden`.
  - **Atomicidad:** como `u`, `consume` en F1 de A×1 y B×1 (F1 no tiene B) → `insufficient_stock`. El `detail` contiene B con `available=0` y `requested=1`. F1 A sigue en 1 y el número de operaciones no cambia.
  - Las mismas líneas de A dos veces → `duplicate_item`.
  - Cantidad `0`, cantidad `1.5`, líneas `[]`, `move` sin origen, `move` con origen = destino, `add` con referencia → `invalid_operation`, cada caso por separado.
  - F2 con `active=false`: `move` a F1 desde F2 → `inactive_location`. Artículo B desactivado: `add` de B → `inactive_item`.
  - Como `anon`, `perform_operation` → error de permisos (`42501`).
- [ ] **Step 3:** `npm run db:test` → FALLA.
- [ ] **Step 4:** Escribe las dos migraciones.
- [ ] **Step 5:** `npm run db:reset && npm run db:test` → PASA.
- [ ] **Step 6: Commit** `feat(db): RPC de alta de artículo y de operaciones`

### Task 5: RPC `search_operations`

**Files:**
- Create: `supabase/migrations/20261102000005_search_operations.sql`, `supabase/tests/05_search_operations.test.sql`

**Interfaces:**
- Produces: `public.search_operations(p_kind text default null, p_location_id uuid default null, p_origin_id uuid default null, p_destination_id uuid default null, p_item_id uuid default null, p_user_id uuid default null, p_from timestamptz default null, p_to timestamptz default null, p_reference text default null, p_limit int default 50, p_offset int default 0)`.
  - Devuelve `table(id uuid, kind text, origin_id uuid, destination_id uuid, reference text, notes text, user_id uuid, created_at timestamptz, line_count int, total_count bigint)`.
  - `security invoker`: la protege RLS.
  - Semántica de los filtros:
    - `p_location_id` coincide con el origen **o** el destino.
    - `p_item_id` encuentra operaciones con al menos una línea de ese artículo.
    - `p_reference` busca con `ilike '%' || p_reference || '%'`.
    - `p_from` es inclusivo; `p_to` es exclusivo.
  - Orden `created_at desc, id desc`. `total_count` es `count(*) over ()` y se calcula antes del límite.

- [ ] **Step 1: Escribe `05_search_operations.test.sql`** con 4 operaciones conocidas (add en T, move T→F1, consume en F1 con ref `OT-7`, remove en F2):
  - Sin filtros → 4 filas, la primera es la más reciente y `total_count=4`.
  - `p_location_id=F1` → 2 filas (el move y el consume).
  - `p_item_id=B`, cuando B solo aparece en el add → 1 fila.
  - `p_reference='ot-7'` → 1 fila.
  - `p_kind='move'` → 1 fila.
  - `p_limit=2, p_offset=2` → 2 filas con `total_count=4`.
- [ ] **Step 2:** `npm run db:test` → FALLA.
- [ ] **Step 3:** Escribe la migración.
- [ ] **Step 4:** `npm run db:reset && npm run db:test` → PASA.
- [ ] **Step 5: Commit** `feat(db): búsqueda de operaciones`

### Task 6: Datos de desarrollo (seed)

**Files:**
- Create: `supabase/seed.sql`
- Modify: `README.md` (sección "Usuarios de desarrollo" y "Primer administrador en producción")

**Interfaces:**
- Produces:
  - Localizaciones: `Taller` (warehouse), `Furgoneta 1` (vehicle) y `Furgoneta 2` (vehicle).
  - Tipos: `Fontanería`, `Electricidad` y `Consumibles`.
  - 8 artículos de ejemplo con stock inicial en Taller, cargados **mediante operaciones `add`** en lugar de insertar directamente en `stock`, para que el historial sea coherente.
  - Usuarios de `auth.users` con contraseña `stocka2-dev` (valor solo de desarrollo, documentado en el README):
    - `admin@stocka2.test` (rol admin).
    - `furgo1@stocka2.test`, con permiso en Furgoneta 1.

- [ ] **Step 1:** Escribe `seed.sql`. Para crear los usuarios, inserta en `auth.users` con `crypt('stocka2-dev', gen_salt('bf'))`, `email_confirmed_at = now()` y `aud`/`role` = `authenticated`. Inserta también la fila correspondiente en `auth.identities`; si falta, el login de GoTrue falla. Las operaciones `add` del seed se insertan como `postgres` con `user_id` del admin, porque `perform_operation` necesita `auth.uid()`. Para eso fija `request.jwt.claims` antes de llamarla.
- [ ] **Step 2:** `npm run db:reset` → sin errores. `npm run db:test` → sigue PASANDO.
- [ ] **Step 3:** Comprueba en Studio (`http://127.0.0.1:54323`) que hay 3 localizaciones, 8 artículos con stock en Taller y 8 operaciones `add`.
- [ ] **Step 4:** Documenta en el README:
  - Usuarios de desarrollo.
  - Primer administrador en producción: crear el usuario en el panel de Supabase y después `update public.profiles set role='admin' where id = '<uuid>'`.
- [ ] **Step 5: Commit** `chore(db): datos de desarrollo`

### Task 7: Núcleo del frontend (cliente, autenticación, login y shell)

**Files:**
- Create: `src/app/core/supabase.ts`, `core/auth.service.ts`, `core/auth.guard.ts`, `core/db-errors.ts`, `data/models.ts`, `layout/shell.component.ts`, `features/login/login.page.ts`, `shared/format.ts`, tests `*.spec.ts` junto a cada archivo
- Modify: `src/app/app.config.ts`, `src/app/app.routes.ts`

**Interfaces:**
- Produces:
  - `SUPABASE: InjectionToken<SupabaseClient>`, creado con `createClient(environment.supabaseUrl, environment.supabaseAnonKey)`.
  - Modelos en `data/models.ts`:
    - `OperationKind = 'add' | 'move' | 'remove' | 'consume'`
    - `Profile { id; displayName; role: 'admin' | 'user'; active }`
    - `Location { id; name; kind: 'warehouse' | 'vehicle'; active }`
    - `ItemType { id; name; active }`
    - `Item { id; name; typeId; reference: string | null; active }`
    - `StockRow { itemId; locationId; quantity }`
    - `OperationLineInput { itemId; quantity }`
    - `OperationSummary { id; kind; originId; destinationId; reference; notes; userId; createdAt: Date; lineCount }`
    - `OperationLine { itemId; quantity }`
  - `AuthService` (providedIn root):
    - Signals `session`, `profile: Signal<Profile | null>`, `permittedLocationIds: Signal<Set<string>>`.
    - `isAdmin = computed(...)`.
    - `canOperate(locationId: string): boolean`: true si es admin o si está en `permittedLocationIds`.
    - `signIn(email: string, password: string): Promise<void>`, que lanza `Error` con el mensaje en castellano.
    - `signOut(): Promise<void>`.
    - `ready: Promise<void>`, que se resuelve tras leer la sesión inicial.
    - Si el perfil está `active=false`, `signIn` cierra la sesión y lanza "Tu usuario está desactivado. Habla con el administrador."
  - `authGuard: CanActivateFn`: espera a `ready`. Sin sesión, redirige a `/login`.
  - `dbErrorMessage(err: unknown): string`, que devuelve exactamente estos mensajes:
    - `forbidden` → "No tienes permiso para operar en esta localización."
    - `invalid_operation` → "La operación no es válida. Revisa los datos."
    - `duplicate_item` → "Has añadido el mismo artículo dos veces."
    - `inactive_location` → "La localización está deshabilitada."
    - `inactive_item` → "Alguno de los artículos está deshabilitado."
    - `insufficient_stock` → "No hay stock suficiente de: {nombres}". Admite un segundo argumento opcional `itemNames: Map<string,string>` y usa el `detail` para listar `nombre (hay X, pides Y)`.
    - `duplicate_name` → "Ya existe un artículo con ese nombre."
    - `inactive_type` → "El tipo de artículo está deshabilitado."
    - Cualquier otro → "Ha ocurrido un error inesperado. Inténtalo de nuevo."
  - `formatDateTime(d: Date): string`: `Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', dateStyle: 'short', timeStyle: 'short' })`.
  - `operationKindLabel(k: OperationKind): string`: `add` → "Entrada", `move` → "Traspaso", `remove` → "Baja", `consume` → "Salida por trabajo".
  - Rutas:
    - `/login` (pública).
    - Bajo `ShellComponent` con `authGuard`: `''` → Home, `localizaciones/:id` → LocationPage, `stock` → StockOverview, `historial` → History.
    - `**` → `''`.
    - Todas las páginas se cargan con `loadComponent`.
  - `ShellComponent`:
    - Usa `BreakpointObserver.observe(Breakpoints.Handset)`.
    - En móvil: `mat-toolbar` arriba y barra de navegación inferior con Inicio, Stock e Historial.
    - En ordenador: `mat-sidenav` fijo con los mismos enlaces más el nombre del usuario y "Cerrar sesión".

- [ ] **Step 1: Escribe las pruebas**:
  - `db-errors.spec.ts`: un caso por código, incluido `insufficient_stock` con `detail` JSON y un mapa de nombres → "No hay stock suficiente de: Filtro (hay 0, pides 1)". Un objeto desconocido da el mensaje genérico.
  - `format.spec.ts`: `formatDateTime(new Date('2026-07-01T10:00:00Z'))` contiene `12:00`, porque en verano Madrid es UTC+2.
  - `auth.guard.spec.ts`: con un `AuthService` falso sin sesión devuelve un `UrlTree` a `/login`; con sesión, true.
- [ ] **Step 2:** `npm test -- --watch=false` → FALLA.
- [ ] **Step 3:** Implementa según las Interfaces. `AuthService` carga el perfil y los permisos al cambiar la sesión (`onAuthStateChange`).
- [ ] **Step 4:** `npm test -- --watch=false` → PASA.
- [ ] **Step 5:** Verificación manual:
  - Con `npm run db:start` y `npm start`, entra como `furgo1@stocka2.test`.
  - El shell se ve con barra inferior a 375 px de ancho y con menú lateral a 1280 px.
  - "Cerrar sesión" vuelve a `/login`.
- [ ] **Step 6: Commit** `feat(app): cliente Supabase, autenticación y shell responsive`

### Task 8: Servicios de datos, inicio y página de localización (solo lectura)

**Files:**
- Create: `data/catalog.service.ts`, `data/stock.service.ts`, `features/home/home.page.ts`, `features/location/location.page.ts`, con sus specs

**Interfaces:**
- Consumes: `SUPABASE`, modelos y `AuthService` (Tarea 7).
- Produces:
  - `CatalogService`:
    - `locations(): Promise<Location[]>` (activas, ordenadas por nombre).
    - `itemTypes(): Promise<ItemType[]>` (activos).
    - `items(): Promise<Item[]>` (activos, por nombre).
    - `createItem(name: string, typeId: string, reference: string | null): Promise<string>`, vía la RPC `create_item`.
  - `StockService`:
    - `byLocation(locationId: string): Promise<StockRow[]>`: solo `quantity > 0`.
    - `all(): Promise<StockRow[]>`.
  - Los servicios convierten de snake_case a los modelos camelCase. Los errores se propagan tal cual; los componentes los muestran con `dbErrorMessage`.
- **Inicio:** tarjetas con las localizaciones donde `auth.canOperate(id)`. El admin ve todas. Cada tarjeta enlaza a `/localizaciones/:id`. El hueco para avisos queda vacío hasta el plan 3.
- **Página de localización:**
  - Si `!auth.canOperate(id)`, muestra "No tienes acceso a esta localización" con un enlace a Inicio.
  - Si tiene acceso, muestra el stock con buscador por texto (nombre o referencia, sin distinguir mayúsculas ni acentos) y filtro por tipo.
  - En móvil, lista de tarjetas con nombre, tipo y cantidad grande. En ordenador, `mat-table` con orden por columnas.
  - Arriba, cuatro botones: "Añadir", "Traer aquí", "Baja" y "Salida por trabajo". En esta tarea no hacen nada; se conectan en la Tarea 9.

- [ ] **Step 1: Escribe `location.page.spec.ts`** con servicios falsos:
  - Sin permiso, aparece el texto "No tienes acceso a esta localización".
  - Con permiso, se listan los 3 artículos falsos.
  - El buscador `'filtro'` deja solo "Filtró de aire".
- [ ] **Step 2:** `npm test -- --watch=false` → FALLA.
- [ ] **Step 3:** Implementa. Pon la normalización de texto para búsquedas (`normalize(s) = s.normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase().trim()`) en `shared/format.ts` y exporta `normalizeText`.
- [ ] **Step 4:** `npm test -- --watch=false` → PASA.
- [ ] **Step 5: Commit** `feat(app): inicio y página de localización`

### Task 9: Formulario de operación

**Files:**
- Create: `features/location/operation-form.model.ts`, `features/location/operation-form.component.ts`, `data/operations.service.ts`, con sus specs
- Modify: `features/location/location.page.ts` (abrir el formulario y refrescar el stock al confirmar)

**Interfaces:**
- Consumes: `CatalogService`, `StockService`, `AuthService`, `dbErrorMessage`.
- Produces:
  - `OperationsService.perform(input: { kind: OperationKind; locationId: string; originId?: string; reference?: string; notes?: string; lines: OperationLineInput[] }): Promise<string>`, que llama a `perform_operation`.
  - `operation-form.model.ts` (funciones puras):
    - `addLine(lines: OperationLineInput[], itemId: string): OperationLineInput[]`: si el artículo ya está, devuelve las líneas sin cambios.
    - `validateLines(lines, available: Map<string, number> | null): Map<string, string>`: errores por `itemId`.
      - Cantidad no entera o `<= 0` → "Cantidad no válida".
      - Si `available` no es null y la cantidad lo supera → "Solo hay {n}".
      - Si `lines` está vacío → error con la clave `''` y el texto "Añade al menos un artículo".
    - `buildPayload(state): OperationsService input`: vacía referencia y notas si quedan en blanco; descarta la referencia si `kind !== 'consume'`.
  - `OperationFormComponent`:
    - En móvil se abre como `MatBottomSheet` o diálogo a pantalla completa; en ordenador, como `MatDialog`.
    - Recibe `{ kind, locationId }`.
    - Campos según el tipo:
      - **Añadir:** artículos de todo el catálogo activo, más un enlace "Crear artículo nuevo" que abre un mini-formulario con nombre, tipo y referencia opcional, llama a `createItem` y añade la línea.
      - **Traer aquí:** primero un selector de origen (todas las localizaciones activas menos la actual). Después, solo artículos con stock en ese origen, mostrando la cantidad disponible.
      - **Baja y Salida por trabajo:** solo artículos con stock en la localización actual, con la cantidad disponible.
      - **Salida por trabajo:** además, el campo "Referencia (opcional)".
      - Todos los tipos tienen "Notas (opcional)".
    - Las líneas usan un autocompletado (`mat-autocomplete` con `normalizeText`) y un campo numérico. Se pueden quitar.
    - El botón "Confirmar" se desactiva si hay errores o **mientras hay una petición en curso**.
    - Si la operación tiene éxito, el formulario se cierra con un `MatSnackBar` "Operación registrada". Si falla, muestra `dbErrorMessage(err, nombres)` en el formulario sin cerrarlo.
    - Títulos:
      - Añadir: "Añadir material".
      - Traer aquí: "Traer material a {localización}".
      - Baja: "Dar de baja material".
      - Salida por trabajo: "Registrar salida por trabajo".

- [ ] **Step 1: Escribe `operation-form.model.spec.ts`**:
  - `addLine` con un artículo ya presente → misma longitud.
  - `validateLines([{itemId:'a',quantity:0}], null)` → `'a'` con el error "Cantidad no válida".
  - `validateLines([{itemId:'a',quantity:5}], new Map([['a',3]]))` → "Solo hay 3".
  - `validateLines([], null)` → error con la clave `''`.
  - `buildPayload` con `kind:'move'` y referencia `'x'` → sin referencia. Con notas `'  '` → sin notas.
- [ ] **Step 2: Escribe `operation-form.component.spec.ts`** con un `OperationsService` falso cuya promesa se resuelve manualmente:
  - Pulsar Confirmar dos veces seguidas → `perform` se llama **una** vez y el botón queda desactivado hasta que se resuelve.
  - Si `perform` rechaza con `{ message: 'insufficient_stock', details: '[{"item_id":"a","available":0,"requested":1}]' }`, el formulario sigue abierto y muestra "No hay stock suficiente de".
- [ ] **Step 3:** `npm test -- --watch=false` → FALLA.
- [ ] **Step 4:** Implementa el modelo, el servicio y el componente, y conéctalos a los botones de `LocationPage`.
- [ ] **Step 5:** `npm test -- --watch=false` → PASA.
- [ ] **Step 6:** Verificación manual con el seed:
  - Como `furgo1@stocka2.test`, trae 3 artículos desde Taller a Furgoneta 1.
  - Registra una salida por trabajo de 2 de ellos con la referencia `OT-1`.
  - Intenta dar de baja más de lo que hay: ves el error y no cambia nada.
  - Como admin, añade un artículo nuevo creado desde el propio formulario.
- [ ] **Step 7: Commit** `feat(app): formulario de operaciones multi-artículo`

### Task 10: Historial y stock global

**Files:**
- Create: `features/history/history.page.ts`, `features/history/operation-detail.component.ts`, `features/stock/stock-overview.page.ts`, con sus specs
- Modify: `data/operations.service.ts`, `features/location/location.page.ts` (enlace "Ver historial")

**Interfaces:**
- Consumes: `CatalogService`, `StockService`, `formatDateTime` y `operationKindLabel`.
- Produces:
  - `OperationsService.search(filters: HistoryFilters, page: number, pageSize = 50): Promise<{ rows: OperationSummary[]; total: number }>`, que llama a `search_operations`. `HistoryFilters = { kind?; locationId?; originId?; destinationId?; itemId?; userId?; from?: Date; to?: Date; reference? }`.
  - `OperationsService.lines(operationId: string): Promise<OperationLine[]>`.
  - `CatalogService.profiles(): Promise<Profile[]>`, para mostrar nombres de usuario.
  - `toQueryParams(f: HistoryFilters)` y `fromQueryParams(p: Params): HistoryFilters` en `history.page.ts`: los filtros viven en la URL (`/historial?locationId=…&itemId=…`). En la URL, `to` es el día elegido, **inclusivo**. Al llamar a la RPC se convierte al día siguiente a las 00:00 de Madrid, porque `p_to` es exclusivo.
- **Historial:**
  - En ordenador: `mat-table` con Fecha, Tipo, Origen, Destino, Usuario, Referencia y Nº artículos, más un panel de filtros (tipo, localización origen-o-destino, origen, destino, artículo, usuario, desde/hasta y referencia) y `mat-paginator`.
  - En móvil: una lista resumida (tipo, localizaciones, fecha y usuario) con los filtros en un panel desplegable.
  - Al pulsar una fila se abre `OperationDetailComponent` con la cabecera completa y las líneas (artículo y cantidad).
  - Nombres de localizaciones deshabilitadas: se muestran igualmente. `CatalogService` necesita para el historial una variante `allLocations()` que incluya las inactivas.
- **Stock global:** una tabla con una fila por artículo y una columna por localización activa, con buscador y filtro por tipo. En móvil, tarjetas por artículo con las cantidades por localización.
- **Página de localización:** el enlace "Ver historial" lleva a `/historial?locationId=<id>`.

- [ ] **Step 1: Escribe `history.page.spec.ts`**:
  - `fromQueryParams(toQueryParams(f))` devuelve el mismo `f`, incluidas las fechas.
  - Con `to = 2026-03-29` (cambio de horario), el `p_to` enviado es `2026-03-29T22:00:00Z`, porque Madrid ya está en UTC+2 ese día a medianoche del 30.
- [ ] **Step 2:** `npm test -- --watch=false` → FALLA.
- [ ] **Step 3:** Implementa.
- [ ] **Step 4:** `npm test -- --watch=false` → PASA.
- [ ] **Step 5:** Verificación manual:
  - Filtra por Furgoneta 1 y por la referencia `OT-1`, y abre el detalle.
  - Recarga la página: los filtros se mantienen.
  - El stock global muestra las cantidades coherentes con las operaciones de la Tarea 9.
- [ ] **Step 6: Commit** `feat(app): historial filtrable y stock global`

### Task 11: Verificación final del plan 1

- [ ] **Step 1:** Ejecuta `npm run db:reset && npm run db:test`, `npm test -- --watch=false` y `npx ng build` → todo PASA y compila sin avisos de presupuesto que fallen el build.
- [ ] **Step 2:** Recorre a mano, a 375 px y a 1280 px:
  1. Login.
  2. Traer material.
  3. Salida por trabajo.
  4. Baja.
  5. Historial con filtros.
  6. Stock global.
  7. Acceso denegado a la página del Taller como `furgo1`.
- [ ] **Step 3:** Actualiza el README con el estado ("Plan 1 completado") y lo pendiente (planes 2–4).
- [ ] **Step 4: Commit** `docs: estado tras plan 1`
