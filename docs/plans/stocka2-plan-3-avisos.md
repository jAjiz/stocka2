# stocka2 — Plan 3: Avisos de stock y notificaciones push (PWA)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reglas de aviso configurables por el administrador, avisos leves y graves calculados en vivo en inicio y en cada localización, y una notificación push por destinatario y operación cuando una operación deja stock en nivel grave, con la aplicación instalable como PWA.

**Architecture:** Las reglas viven en tres tablas (`alert_rules` y sus listas de artículos y localizaciones) que solo se escriben por RPC de administrador. Los avisos no se guardan: `active_alerts()` cruza los umbrales efectivos (máximo por nivel entre reglas activas) con el stock actual, contando como 0 lo que nunca tuvo stock. El aviso grave no necesita estado: `perform_operation` encola en `push_outbox` una fila por destinatario cuando una línea **resta** stock y la cantidad resultante queda `<= umbral grave`, lo que cumple a la vez los puntos 1–4 de §6 (bajar al umbral, cada bajada posterior, nada si sube o se mantiene, reinicio implícito al reponer). En la misma transacción, `pg_net` encola una llamada HTTP a la Edge Function `send-push`, que se ejecuta tras el commit: reclama las filas pendientes y las envía con Web Push. Si algo de esto falla, la operación se guarda igualmente.

**Tech Stack:** Angular 22 (standalone, signals, zoneless, Vitest), Angular Material + CDK, `@angular/service-worker` (`SwPush`), `@supabase/supabase-js` v2, Postgres + pgTAP, `pg_net`, Supabase Vault, Edge Functions (Deno, `npm:web-push@3`).

**Spec:** `docs/specs/stocka2-design.md` (§6, §8 puntos 2, 3, 6 y 7, §9 claves VAPID). Planes anteriores: `docs/plans/stocka2-plan-1-base.md`, `docs/plans/stocka2-plan-2-admin.md`.

**Fuera de este plan:** importación CSV/Excel y despliegue en Cloudflare (plan 4). Supabase Realtime.

## Global Constraints

- Las de los planes 1 y 2 siguen vigentes (castellano, RLS solo `select`, escrituras por RPC `security definer` con `set search_path = ''`, `revoke … from public, anon`, errores `P0001` con código, `Europe/Madrid`, `BreakpointObserver`, `pnpm`).
- Un nivel está activo cuando `cantidad <= umbral`. Reglas solapadas: gana el umbral más alto en cada nivel. Artículo sin fila de stock en una localización = cantidad 0.
- Al menos un nivel por regla; si hay dos, `grave < leve`. Umbrales enteros `>= 0`.
- "Todos los artículos" y "Todas las localizaciones" se guardan como bandera (`all_items`, `all_locations`), no como lista, para incluir lo que se dé de alta después.
- Solo cuentan reglas activas, artículos activos y localizaciones activas.
- Push: destinatarios = perfiles activos que son administradores o tienen permiso en la localización afectada, en todos sus dispositivos. Una notificación por destinatario y operación. Crear o editar reglas nunca envía push.
- El push nunca retrasa ni hace fallar `perform_operation`.
- Claves VAPID: el par de **desarrollo** va en el repositorio (como la contraseña del seed, solo desarrollo): la pública en `environment.development.ts` y ambas en `[edge_runtime.secrets]` de `config.toml`. El par de **producción** se genera con `pnpm dlx web-push generate-vapid-keys`; la privada solo como secreto de Supabase y la pública sustituye a `__VAPID_PUBLIC_KEY__` en `environment.ts` (plan 4).
- iOS: push solo con la PWA instalada (iOS 16.4+). La app lo explica si detecta iOS sin instalar.

## Review Focus

1. **Reintento de una operación ya guardada** (mismo `p_operation_id`, p. ej. tras perder la respuesta en la furgoneta): no debe encolar una segunda notificación. Prueba en Tarea 3.
2. **Mover de Furgoneta 1 a Furgoneta 2 dejando F1 en grave**: avisa de F1 (el origen) a quien tiene permiso en F1 y a los admins; no a quien solo tiene permiso en F2. Prueba en Tarea 3.
3. **Sin URL de push configurada o `send-push` caída**: la operación se guarda y la fila del outbox queda pendiente; la siguiente operación que llame a la función la envía. Prueba en Tarea 3 (sin secreto en Vault) y Tarea 4 (fila pendiente que sale en la llamada siguiente).
4. **Móvil compartido**: un usuario cierra sesión y entra otro en el mismo navegador. El primero no debe seguir recibiendo en ese dispositivo los avisos que ve el segundo, ni al revés. `save_push_subscription` reasigna el endpoint (prueba en Tarea 3) y `signOut` borra la suscripción del dispositivo (prueba en Tarea 7).
5. **Regla "todos los artículos" sobre una furgoneta con catálogo grande**: cada artículo sin stock genera un aviso. La lista debe seguir siendo usable: graves primero, después por nombre, y en inicio solo las localizaciones del usuario. Prueba de orden en Tarea 5.

---

## Estructura de archivos

```
supabase/
  config.toml                                      [functions.send-push] verify_jwt=false, [edge_runtime.secrets]
  seed.sql                                         (modificar) secreto de Vault stocka2_push_url y una regla de ejemplo
  migrations/
    20261103000004_alert_rules.sql                 tablas de reglas + RPC de administración
    20261103000005_active_alerts.sql               alert_thresholds() y active_alerts()
    20261103000006_push.sql                        suscripciones, outbox, encolado, pg_net, perform_operation
  functions/send-push/index.ts                     Edge Function: reclama el outbox y envía Web Push
  tests/
    11_alert_rules.test.sql
    12_active_alerts.test.sql
    13_push.test.sql
scripts/smoke-push.mjs                             prueba de humo de send-push con un servidor de push falso
ngsw-config.json, public/manifest.webmanifest, public/icons/*
src/
  index.html                                       (modificar) manifest, theme-color, apple-touch-icon
  environments/environment*.ts                     (modificar) vapidPublicKey
  app/
    app.config.ts                                  (modificar) provideServiceWorker
    core/db-errors.ts                              (modificar) invalid_thresholds
    core/auth.service.ts                           (modificar) signOut olvida el dispositivo
    data/models.ts                                 (modificar) AlertRule, AlertRuleInput, StockAlert
    data/alerts.service.ts                         active_alerts y RPC de reglas
    data/push.service.ts                           estado, activar y desactivar push en el dispositivo
    shared/alert-list.component.ts                 lista de avisos (graves destacados)
    features/home/home.page.ts                     (modificar) avisos y recuento por localización
    features/location/location.page.ts             (modificar) avisos de la localización
    features/admin/admin.page.ts                   (modificar) pestaña "Avisos"
    features/admin/alert-rules.page.ts             lista de reglas
    features/admin/alert-rule-dialog.component.ts  crear / editar / duplicar
    features/profile/profile.page.ts               (modificar) tarjeta "Notificaciones"
    app.routes.ts                                  (modificar) admin/avisos
```

---

### Task 1: Reglas de aviso (tablas y RPC de administración)

**Files:**
- Create: `supabase/migrations/20261103000004_alert_rules.sql`, `supabase/tests/11_alert_rules.test.sql`

**Interfaces:**
- Tablas:
  - `alert_rules(id uuid pk default gen_random_uuid(), name text not null, all_items boolean not null, all_locations boolean not null, warning_threshold int null check (>= 0), critical_threshold int null check (>= 0), active boolean not null default true, created_at timestamptz default now())`, con `check (warning_threshold is not null or critical_threshold is not null)` y `check (warning_threshold is null or critical_threshold is null or critical_threshold < warning_threshold)`.
  - `alert_rule_items(rule_id → alert_rules on delete cascade, item_id → items on delete cascade, pk(rule_id, item_id))`, `alert_rule_locations(rule_id, location_id)` igual con `locations`. El `on delete cascade` hace que `admin_delete_item` y `admin_delete_location` del plan 2 sigan funcionando sin cambios.
  - RLS: `select` en las tres solo `(select public.is_admin())`.
- RPC (todas `forbidden` si `not is_admin()`; id inexistente → `not_found`):
  - `admin_save_alert_rule(p_id uuid, p_name text, p_item_ids uuid[], p_location_ids uuid[], p_warning int, p_critical int) returns uuid`: `p_id` null crea; si no, actualiza y **sustituye** las listas. `p_item_ids` null = todos (`all_items = true`, lista vacía); igual para localizaciones. Nombre recortado vacío, array vacío (`'{}'`) o id de artículo/localización inexistente → `invalid_input`. Ningún umbral, umbral negativo o `grave >= leve` → `invalid_thresholds` (se valida antes de insertar, no se deja al `check`).
  - `admin_set_alert_rule_active(p_id uuid, p_active boolean) returns void`.
  - `admin_delete_alert_rule(p_id uuid) returns void`.

- [ ] **Step 1: Escribe `11_alert_rules.test.sql`** (admin `a`, usuario `u`, localizaciones T y F1, artículos A y B):
  - Como `u`: `admin_save_alert_rule(null,'R',null,null,5,2)` → `forbidden`; `select count(*) from alert_rules` = 0 aunque exista una regla.
  - Como `a`: `(null,'Todo',null,null,5,2)` → `all_items` y `all_locations` true, 0 filas en las listas; `(null,'A en F1',array[A],array[F1],null,1)` → 1 fila en cada lista.
  - Editar la segunda con `array[A,B]` y `null` en localizaciones → 2 artículos, `all_locations` true y 0 filas en `alert_rule_locations`.
  - `invalid_thresholds` con `(null,null)`, `(2,2)`, `(2,3)` y `(-1,null)`; `invalid_input` con nombre `'  '`, `p_item_ids = '{}'` y un uuid de artículo inexistente.
  - `admin_set_alert_rule_active(id,false)` → `active = false`; `admin_delete_alert_rule(id)` borra la regla y sus listas; con un id aleatorio → `not_found`.
  - `admin_delete_item(B)` (sin historial) con B en una regla → ok y la regla pierde esa fila.
  - Como `anon`, `admin_save_alert_rule(...)` → `42501`.
- [ ] **Step 2:** `pnpm db:test` → FALLA.
- [ ] **Step 3:** Escribe la migración.
- [ ] **Step 4:** `pnpm db:reset && pnpm db:test` → PASA (incluidas las pruebas anteriores).
- [ ] **Step 5: Commit** `feat(db): reglas de aviso y su administración`

### Task 2: Avisos activos

**Files:**
- Create: `supabase/migrations/20261103000005_active_alerts.sql`, `supabase/tests/12_active_alerts.test.sql`

**Interfaces:**
- `public.alert_thresholds() returns table(item_id uuid, location_id uuid, warning int, critical int)` (stable, `security definer`, `search_path = ''`; **sin** `grant` a `authenticated`, solo para otras funciones): para cada par (artículo activo, localización activa) cubierto por al menos una regla activa (`all_items or exists alert_rule_items`, igual con localizaciones), `max(warning_threshold)` y `max(critical_threshold)` sobre esas reglas (los null no cuentan).
- `public.active_alerts() returns table(item_id uuid, location_id uuid, quantity int, level text, threshold int)` (stable, `security definer`; `grant` a `authenticated`): si `not is_active()` devuelve 0 filas. `quantity = coalesce(stock.quantity, 0)`. `level = 'critical'` y `threshold = critical` si `quantity <= critical`; si no, `'warning'` y `warning` si `quantity <= warning`; si no, no hay fila. Orden: `level = 'critical'` primero, después `location_id, item_id`.

- [ ] **Step 1: Escribe `12_active_alerts.test.sql`** (`clear_seed`; admin, usuario `u` y un usuario inactivo `x`; localizaciones T, F1 y F2 deshabilitada; artículos A, B y C deshabilitado; stock de A en F1 = 4, B en F1 = 10):
  - Regla R1 `(A, F1, leve 5, grave 2)` → una fila `(A, F1, 4, 'warning', 5)`. Con `A` en F1 = 2 → `'critical', 2`. Con 6 → ninguna fila.
  - Regla R2 `(todos, F1, leve 3, grave 1)` además de R1: A en F1 = 4 sigue en leve con umbral 5 (gana el más alto); con A = 2 → grave con umbral 2. B (10) no aparece.
  - R3 `(todos, todas, grave 0)`: B en T (nunca tuvo stock) aparece como `(B, T, 0, 'critical', 0)`; no aparece nada de F2 (deshabilitada) ni de C (deshabilitado).
  - Deshabilitar R3 → B en T desaparece.
  - Como `x` → 0 filas. Como `u` → las mismas filas que como admin.
  - `alert_thresholds()` como `authenticated` → `42501`.
- [ ] **Step 2:** `pnpm db:test` → FALLA.
- [ ] **Step 3:** Escribe la migración.
- [ ] **Step 4:** `pnpm db:reset && pnpm db:test` → PASA.
- [ ] **Step 5: Commit** `feat(db): cálculo de avisos activos`

### Task 3: Suscripciones push y encolado de avisos graves

**Files:**
- Create: `supabase/migrations/20261103000006_push.sql`, `supabase/tests/13_push.test.sql`
- Modify: `supabase/seed.sql`

**Interfaces:**
- `create extension if not exists pg_net with schema extensions;`
- `push_subscriptions(id uuid pk, user_id → profiles, endpoint text not null unique, p256dh text not null, auth text not null, user_agent text, created_at)`. RLS `select`: `user_id = auth.uid()`.
- `push_outbox(id bigint generated always as identity pk, operation_id → operations, user_id → profiles, title text, body text, url text, created_at default now(), sent_at timestamptz null)`, índice parcial `where sent_at is null`. RLS activado sin políticas (solo funciones).
- `save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text) returns void`: perfil activo (`forbidden`); textos vacíos → `invalid_input`; `insert … on conflict (endpoint) do update` asignando `user_id = auth.uid()` y las claves nuevas (un endpoint pertenece a un solo usuario: el último que lo activó).
- `delete_push_subscription(p_endpoint text) returns void`: borra solo si es del usuario actual; si no existe, no hace nada.
- `enqueue_critical_alerts(p_operation_id uuid, p_location_id uuid) returns void` (sin `grant`): para las líneas de la operación, la cantidad actual en `p_location_id` y el `critical` de `alert_thresholds()`; si alguna queda `<= critical`, inserta una fila por destinatario (perfiles activos admin o con permiso en `p_location_id`):
  - `title = 'Stock crítico en ' || <localización>`.
  - `body`: una línea por artículo, por nombre, `'<artículo>: quedan <q> (umbral <t>)'`, unidas con `E'\n'`; con más de 4 artículos, las 3 primeras y `'y <n> más'`.
  - `url = '/localizaciones/' || p_location_id`.
  - Después, si existe el secreto `stocka2_push_url` en `vault.decrypted_secrets`, `net.http_post(url := <secreto>, body := '{}'::jsonb, headers := '{"Content-Type":"application/json"}')`.
- `perform_operation`: `create or replace` con la misma firma y el cuerpo de `20261102000006`, añadiendo antes de `return v_op` (solo si `v_origin is not null`, porque solo el origen resta stock):

  ```sql
  begin
    perform public.enqueue_critical_alerts(v_op, v_origin);
  exception when others then
    raise warning 'enqueue_critical_alerts: %', sqlerrm;
  end;
  ```
  La salida temprana por idempotencia ya evita encolar dos veces en un reintento.
- `claim_push_outbox(p_limit int default 100) returns table(id bigint, user_id uuid, title text, body text, url text)` (`grant` solo a `service_role`): marca `sent_at = now()` en hasta `p_limit` filas pendientes (`for update skip locked`, por `created_at`) y las devuelve; además borra las filas enviadas hace más de 30 días.
- `seed.sql`: `select vault.create_secret('http://host.docker.internal:54321/functions/v1/send-push', 'stocka2_push_url');` y una regla "Furgonetas: mínimos" (todos los artículos, F1 y F2, leve 3, grave 1).

- [ ] **Step 1: Escribe `13_push.test.sql`** (`clear_seed`; admin `a`, `u1` con permiso en F1, `u2` con permiso solo en F2, `x` inactivo con permiso en F1; T, F1, F2; A con 5 en F1; regla `(A, todas, grave 2)`; sin secreto en Vault salvo donde se indique):
  - `consume` de A×2 en F1 (queda 3) → 0 filas en `push_outbox`.
  - `consume` de A×1 (queda 2) → filas para `a` y `u1`, no para `u2` ni `x`; `title = 'Stock crítico en F1'`, `body = 'A: quedan 2 (umbral 2)'`, `url = '/localizaciones/<F1>'`.
  - Otro `consume` de A×1 (queda 1) → 2 filas nuevas. Un `add` de A×1 en F1 → ninguna nueva.
  - Reintento con el mismo `p_operation_id` del último `consume` → mismo id y ninguna fila nueva.
  - `move` de A×1 de F1 a F2 hecho por `a` (F1 queda en 1) → filas para `a` y `u1`, ninguna para `u2`.
  - Con una regla `(todos, F1, grave 0)`, una operación que deja 5 artículos a 0 en F1 → `body` con 3 líneas y `'y 2 más'`.
  - Sin secreto en Vault: la operación se guarda y `net.http_request_queue` no tiene filas nuevas. Con el secreto creado en el test: tiene una fila nueva con esa URL.
  - `enqueue_critical_alerts` que falla (renombra dentro del test `push_outbox` a otro nombre) → `perform_operation` devuelve id y el stock cambia.
  - `save_push_subscription('e1','k','s',null)` como `u1` y después como `u2` → una sola fila, de `u2`. `delete_push_subscription('e1')` como `u1` → la fila sigue; como `u2` → desaparece. Como `x` → `forbidden`; con `p_auth = ''` → `invalid_input`.
  - `claim_push_outbox()` como `authenticated` → `42501`; como `service_role` devuelve las pendientes y una segunda llamada devuelve 0 filas.
- [ ] **Step 2:** `pnpm db:test` → FALLA.
- [ ] **Step 3:** Escribe la migración y el cambio del seed.
- [ ] **Step 4:** `pnpm db:reset && pnpm db:test` → PASA (las pruebas de `perform_operation` del plan 1 siguen pasando).
- [ ] **Step 5: Commit** `feat(db): suscripciones push y encolado de avisos graves`

### Task 4: Edge Function `send-push`

**Files:**
- Create: `supabase/functions/send-push/index.ts`, `scripts/smoke-push.mjs`
- Modify: `supabase/config.toml`, `package.json`, `docs/development.md`, `docs/deployment.md`

**Interfaces:**
- Consumes: `claim_push_outbox` (Tarea 3), tablas `push_subscriptions` y `profiles`.
- `config.toml`: `[functions.send-push] verify_jwt = false` (la llama `pg_net` sin JWT; no necesita autenticación porque solo vacía lo que ya está en el outbox, así que una llamada falsa no puede inventar avisos ni duplicarlos). `[edge_runtime.secrets]` con `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (par de desarrollo) y `VAPID_SUBJECT = "mailto:dev@stocka2.test"`.
- `POST /functions/v1/send-push` (cualquier cuerpo) → `200 { "sent": n, "failed": n, "removed": n }`:
  - `adminClient` (service role) → `rpc('claim_push_outbox')` en bucle hasta que devuelva menos de 100 filas.
  - Por fila, las suscripciones del `user_id` cuyo perfil sigue activo. Envía con `webpush.sendNotification(sub, payload, { TTL: 86400, urgency: 'high' })`, con el formato que entiende el service worker de Angular:
    ```json
    { "notification": { "title": "…", "body": "…", "icon": "/icons/icon-192x192.png",
        "data": { "onActionClick": { "default": { "operation": "navigateLastFocusedOrOpen", "url": "/localizaciones/…" } } } } }
    ```
  - Respuesta 404 o 410 del servicio de push → borra esa suscripción (`removed`). Cualquier otro error → `console.error` y `failed`; no se reintenta (mejor perder un aviso que repetirlo).
  - Si `npm:web-push@3` no funciona en el runtime de Deno local, usar `jsr:@negrel/webpush` con la misma interfaz y dejarlo anotado en las notas de ejecución.
- `scripts/smoke-push.mjs` (Node; requiere `pnpm db:reset`; claves de `supabase status -o json`): levanta un servidor HTTP en `0.0.0.0:54399` con dos rutas, `/ok` (responde 201) y `/gone` (responde 410), y cuenta las peticiones. Genera las claves de cliente con `crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' })` (p256dh = clave pública sin comprimir en base64url, auth = 16 bytes aleatorios). Endpoints `http://host.docker.internal:54399/ok` y `/gone`. Comprobaciones (`ok`/`FALLO`, sale con 1 si alguna falla):
  1. Como `furgo1@stocka2.test`, `save_push_subscription` con `/ok`; como admin, con `/gone`.
  2. Como furgo1, `consume` en Furgoneta 1 que deja un artículo en 1 (regla del seed) → en 10 s, 1 petición en `/ok` y 1 en `/gone`, con cabecera `TTL: 86400`.
  3. La suscripción de `/gone` ya no existe (consulta con la service key).
  4. Un `add` en Furgoneta 1 → ninguna petición nueva en 5 s.
  5. Inserta con la service key una fila pendiente en `push_outbox` para furgo1 y haz otro `consume` que deja el artículo en 0 → `/ok` recibe 2 peticiones nuevas (la pendiente y la nueva).
- `package.json`: `"test:functions": "node scripts/smoke-admin-users.mjs && node scripts/smoke-push.mjs"`.

- [ ] **Step 1:** Genera el par de desarrollo (`pnpm dlx web-push generate-vapid-keys`) y ponlo en `config.toml` y en `environment.development.ts` (`vapidPublicKey`); en `environment.ts`, `vapidPublicKey: '__VAPID_PUBLIC_KEY__'`.
- [ ] **Step 2:** Escribe `scripts/smoke-push.mjs` y el script `test:functions`.
- [ ] **Step 3:** `pnpm db:reset && pnpm test:functions` → FALLA (404 de `send-push`).
- [ ] **Step 4:** Escribe la función. `pnpm exec supabase stop && pnpm exec supabase start` para aplicar `config.toml`.
- [ ] **Step 5:** `pnpm db:reset && pnpm test:functions` → todo `ok`. Si `host.docker.internal` no resuelve desde el contenedor de Postgres o de funciones, documenta la alternativa que funcione (p. ej. `http://kong:8000`) en el seed y en `docs/development.md`.
- [ ] **Step 6:** `docs/development.md`: cómo se dispara el push en local, que el par VAPID del repositorio es solo de desarrollo, y que el service worker solo funciona con un build de producción (Tarea 7). `docs/deployment.md`, sección "Notificaciones push": generar el par de producción; `supabase secrets set VAPID_PUBLIC_KEY=… VAPID_PRIVATE_KEY=… VAPID_SUBJECT=mailto:…`; `supabase functions deploy send-push`; en el SQL editor `select vault.create_secret('https://<ref>.supabase.co/functions/v1/send-push', 'stocka2_push_url');`.
- [ ] **Step 7: Commit** `feat(functions): send-push para avisos graves`

### Task 5: Avisos en inicio y en la localización

**Files:**
- Create: `src/app/data/alerts.service.ts`, `src/app/shared/alert-list.component.ts`, con specs
- Modify: `src/app/data/models.ts`, `src/app/core/db-errors.ts` (+spec), `src/app/features/home/home.page.ts` (+ crear `home.page.spec.ts`), `src/app/features/location/location.page.ts` (+spec)

**Interfaces:**
- Modelos:
  - `StockAlert { itemId: string; locationId: string; quantity: number; level: 'warning' | 'critical'; threshold: number }`.
  - `AlertRule { id; name; allItems: boolean; allLocations: boolean; itemIds: string[]; locationIds: string[]; warning: number | null; critical: number | null; active: boolean }`.
  - `AlertRuleInput { name: string; itemIds: string[] | null; locationIds: string[] | null; warning: number | null; critical: number | null }` (`null` = todos).
- `AlertsService`: `active(): Promise<StockAlert[]>` (`active_alerts`); `rules(): Promise<AlertRule[]>` (`alert_rules` con `alert_rule_items(item_id)` y `alert_rule_locations(location_id)` embebidos, orden `name`); `saveRule(id: string | null, input: AlertRuleInput): Promise<string>`; `setRuleActive(id, active)`; `deleteRule(id)`. Lanzan el `error` tal cual.
- `dbErrorMessage`: `invalid_thresholds` → "Indica al menos un umbral. Si pones los dos, el grave tiene que ser menor que el leve."
- `AlertListComponent` (`app-alert-list`): entradas `alerts: StockAlert[]`, `itemNames: Map<string,string>`, `locationNames: Map<string,string>`, `showLocation = true`. Orden: graves primero, después nombre de localización y de artículo (`localeCompare('es')`). Cada fila: icono `error` (grave, color `--mat-sys-error`) o `warning` (leve), nombre del artículo, localización como enlace a `/localizaciones/:id` si `showLocation`, y "Quedan {q} · aviso grave si ≤ {t}" o "Quedan {q} · aviso si ≤ {t}". Sin avisos no pinta nada.
- `HomePage`: carga `active()` junto a las localizaciones; la sección "Avisos" (título "Avisos activos") muestra solo los de localizaciones visibles para el usuario (`auth.canOperate`). Cada tarjeta de localización muestra "{n} aviso(s)" si n > 0, en color de error si alguno es grave.
- `LocationPage`: encima del stock, `app-alert-list` con `showLocation = false` filtrado a la localización; se recarga junto al stock tras cada operación.

- [ ] **Step 1: Escribe las pruebas** (servicios falsos):
  - `alert-list.component.spec.ts`: con un leve de "Bridas" en F1 y un grave de "Codo" en T, la primera fila es "Codo" y lleva el icono `error`; el texto contiene "Quedan 0 · aviso grave si ≤ 1"; con `showLocation = false` no hay enlaces.
  - `home.page.spec.ts`: usuario con permiso solo en F1 y avisos en F1 y F2 → la lista solo contiene el de F1 y la tarjeta de F1 dice "1 aviso".
  - `location.page.spec.ts`: solo se muestran los avisos de esa localización; tras una operación `active()` se llama otra vez.
  - `db-errors.spec.ts`: el mensaje de `invalid_thresholds`.
  - `alerts.service.spec.ts`: `saveRule(null, { itemIds: null, … })` llama a `admin_save_alert_rule` con `p_id: null` y `p_item_ids: null`; `rules()` convierte las filas embebidas en `itemIds`/`locationIds`.
- [ ] **Step 2:** `pnpm test -- --watch=false` → FALLA.
- [ ] **Step 3:** Implementa.
- [ ] **Step 4:** `pnpm test -- --watch=false` → PASA.
- [ ] **Step 5: Commit** `feat(app): avisos de stock en inicio y en cada localización`

### Task 6: Administración de reglas de aviso

**Files:**
- Create: `src/app/features/admin/alert-rules.page.ts`, `src/app/features/admin/alert-rule-dialog.component.ts`, con specs
- Modify: `src/app/features/admin/admin.page.ts`, `src/app/app.routes.ts`

**Interfaces:**
- Consumes: `AlertsService`, `CatalogService.items()`, `CatalogService.locations()`, `CatalogAdmin` (errores, confirmación), `ConfirmDialogComponent`, `dialogSize`.
- Pestaña "Avisos" tras "Tipos"; ruta hija `avisos` → `AlertRulesPage`.
- `AlertRulesPage` extiende `CatalogAdmin` y usa la misma lista que el plan 2 (`app-catalog-list`, con buscador y "Mostrar deshabilitados"; botón "Nueva regla"). Cada fila: nombre; "Artículos: Todos" o "Artículos: {n}"; "Localizaciones: Todas" o los nombres separados por comas; "Leve ≤ {w} · Grave ≤ {c}" omitiendo el nivel ausente. Acciones: "Editar", "Duplicar", "Deshabilitar"/"Habilitar", "Eliminar" (confirmación "¿Eliminar {nombre}? No se puede deshacer."). Si `CatalogListComponent` no admite una acción extra, añádele una salida `duplicate` y una entrada `duplicable = false`.
- `AlertRuleDialogComponent` (datos `{ rule: AlertRule | null; copy: boolean; items: Item[]; locations: Location[] }`): título "Nueva regla", "Editar regla" o "Duplicar regla"; al duplicar el nombre inicial es "{nombre} (copia)" y guarda con `id = null`. Campos: "Nombre"; casilla "Todos los artículos" y, si está desmarcada, un buscador con chips (`mat-chip-grid` + `mat-autocomplete`, `normalizeText`) para elegir artículos activos; casilla "Todas las localizaciones" y, si no, casillas por localización activa; "Aviso leve si quedan" y "Aviso grave si quedan" (numéricos, opcionales, `min=0`, enteros). Validación en línea con el texto de `invalid_thresholds`, y "Elige al menos un artículo." / "Elige al menos una localización." si la lista está vacía. "Guardar" desactivado con errores o mientras guarda; error del servidor dentro del diálogo con `adminErrorMessage`.

- [ ] **Step 1: Escribe las pruebas**:
  - `alert-rule-dialog.component.spec.ts`: leve 2 y grave 2 → mensaje de umbrales y "Guardar" desactivado; sin "Todos los artículos" y sin chips → "Elige al menos un artículo."; con todo marcado y grave 1 → `saveRule(null, { name, itemIds: null, locationIds: null, warning: null, critical: 1 })`; al duplicar, nombre "{nombre} (copia)" y `saveRule` con `id = null`.
  - `alert-rules.page.spec.ts`: una regla con `allLocations` muestra "Localizaciones: Todas" y otra con leve 5 y grave 2 muestra "Leve ≤ 5 · Grave ≤ 2"; `deleteRule` rechazado con `{ message: 'forbidden' }` → "Solo un administrador activo puede hacer esto.".
- [ ] **Step 2:** `pnpm test -- --watch=false` → FALLA.
- [ ] **Step 3:** Implementa.
- [ ] **Step 4:** `pnpm test -- --watch=false` → PASA.
- [ ] **Step 5: Commit** `feat(app): administración de reglas de aviso`

### Task 7: PWA y activación de notificaciones en el perfil

**Files:**
- Create: `ngsw-config.json`, `public/manifest.webmanifest`, `public/icons/*`, `src/app/data/push.service.ts` (+spec)
- Modify: `package.json`, `angular.json`, `src/index.html`, `src/app/app.config.ts`, `src/app/core/auth.service.ts` (+spec), `src/app/features/profile/profile.page.ts` (+spec), `docs/development.md`

**Interfaces:**
- `pnpm ng add @angular/pwa` como punto de partida; después:
  - Manifest: `name` y `short_name` "Stocka2", `lang` "es", `start_url` "/", `display` "standalone", `theme_color` y `background_color` del tema de Material, iconos 192 y 512 (`purpose: "any maskable"`).
  - `ngsw-config.json`: solo `assetGroups` (app y assets); sin `dataGroups` (no hay modo sin conexión).
  - `index.html`: `<link rel="manifest">`, `<meta name="theme-color">`, `<link rel="apple-touch-icon" href="icons/icon-192x192.png">`.
  - `app.config.ts`: `provideServiceWorker('ngsw-worker.js', { enabled: !isDevMode(), registrationStrategy: 'registerWhenStable:30000' })`.
  - `angular.json`: configuración `local` que solo sustituye `environment.ts` por `environment.development.ts`; script `"serve:pwa": "ng build --configuration production,local && pnpm dlx serve -s dist/stocka2/browser -l 4300"` (localhost es contexto seguro, así que el push funciona).
- `PushService`:
  - `status: Signal<PushStatus>` con `type PushStatus = 'unsupported' | 'ios-install' | 'denied' | 'off' | 'on' | 'busy'`. `unsupported` si `!swPush.isEnabled` y no es iOS sin instalar; `ios-install` si es iOS (`/iPad|iPhone|iPod/` o `MacIntel` con `maxTouchPoints > 1`) y no está en modo `standalone`; `denied` si `Notification.permission === 'denied'`; `on`/`off` según `swPush.subscription`.
  - `enable(): Promise<void>`: `swPush.requestSubscription({ serverPublicKey: environment.vapidPublicKey })` y `rpc('save_push_subscription', { p_endpoint, p_p256dh, p_auth, p_user_agent: navigator.userAgent })` con las claves de `subscription.toJSON().keys`. Si el usuario rechaza el permiso → `status` `denied`, sin error. Si falla la RPC → `unsubscribe()` y relanza.
  - `disable(): Promise<void>`: `rpc('delete_push_subscription', { p_endpoint })` y `swPush.unsubscribe()`.
  - `forgetDevice(): Promise<void>`: como `disable`, pero nunca lanza (se usa al cerrar sesión).
- `AuthService.signOut()`: antes de `auth.signOut()`, `await inject(PushService).forgetDevice()` (con la sesión aún válida para la RPC).
- Perfil, tarjeta "Notificaciones" según `status`:
  - `off`: "Recibe un aviso en este dispositivo cuando un artículo llegue a nivel grave." y botón "Activar notificaciones".
  - `on`: "Las notificaciones están activadas en este dispositivo." y botón "Desactivar".
  - `denied`: "Has bloqueado las notificaciones. Actívalas en los ajustes del navegador para esta web."
  - `ios-install`: "En iPhone las notificaciones solo funcionan con la aplicación instalada: pulsa Compartir, «Añadir a pantalla de inicio» y ábrela desde allí (iOS 16.4 o posterior)."
  - `unsupported`: "Este navegador no admite notificaciones."
  - Errores con `dbErrorMessage`; snackbar "Notificaciones activadas" / "Notificaciones desactivadas".

- [ ] **Step 1: Escribe las pruebas** (`SwPush` falso):
  - `push.service.spec.ts`: con `isEnabled = false` y un `userAgent` de iPhone fuera de `standalone` → `ios-install`; `enable()` llama a `requestSubscription` con la clave del entorno y a `save_push_subscription` con endpoint y claves; si la RPC falla, llama a `unsubscribe` y rechaza; `forgetDevice()` con la RPC fallando no rechaza.
  - `auth.service.spec.ts`: `signOut()` llama a `forgetDevice()` antes que a `auth.signOut()`.
  - `profile.page.spec.ts`: con `status = 'off'` pulsar "Activar notificaciones" llama a `enable()`; con `ios-install` se ve el texto de iPhone y no hay botón.
- [ ] **Step 2:** `pnpm test -- --watch=false` → FALLA.
- [ ] **Step 3:** Implementa (incluido `ng add @angular/pwa` y los ajustes de arriba).
- [ ] **Step 4:** `pnpm test -- --watch=false` → PASA y `pnpm build` sin errores de presupuesto.
- [ ] **Step 5:** `docs/development.md`: `pnpm serve:pwa` para probar el service worker y el push en `http://localhost:4300`.
- [ ] **Step 6: Commit** `feat(app): PWA y notificaciones push en el perfil`

### Task 8: Verificación final del plan 3

- [ ] **Step 1:** `pnpm db:reset && pnpm db:test`, `pnpm db:reset && pnpm test:functions`, `pnpm test -- --watch=false` y `pnpm build` → todo PASA.
- [ ] **Step 2:** Recorrido manual con `pnpm serve:pwa` en Chrome a 375 px y 1280 px: como admin crear, duplicar, deshabilitar y eliminar reglas; ver en inicio y en Furgoneta 1 los avisos de la regla del seed; activar notificaciones en el perfil como furgo1; registrar una salida que deje un artículo en grave → llega una notificación con artículo, localización, cantidad y umbral, y al pulsarla se abre Furgoneta 1; reponer y volver a bajar → llega otra; cerrar sesión → no llegan más a ese navegador; instalar la PWA desde Chrome.
- [ ] **Step 3:** `ROADMAP.md`: mover el plan 3 a "Completado" con los recuentos de pruebas; `README.md` si cambia la lista de funcionalidades.
- [ ] **Step 4: Commit** `docs: estado tras plan 3`

---

## Notas de ejecución (2026-11-03)

Desviaciones respecto al plan, decididas al implementar:

- **Cifrado en `send-push`:** cifra con `generateRequestDetails` de `web-push` y envía con `fetch`, porque `sendNotification` usa `https` de Node y falla con endpoints `http://` en Deno.
- **Contenedores locales:** `host.docker.internal` funciona desde ellos; el seed no cambió.
- **Reglas con elementos deshabilitados:** editar o duplicar una regla conserva los artículos y localizaciones deshabilitados que ya tenía; la lista de reglas nombra las localizaciones deshabilitadas con "(deshabilitada)".
- **Página de localización:** un fallo al cargar los avisos no bloquea el stock.
- **Cerrar sesión:** siempre suelta la suscripción del navegador aunque falle la RPC, espera hasta 2 s a que `SwPush` emita la suscripción y no tarda más de 3 s.
- **Pruebas pgTAP:** `tests.clear_seed()` vacía también las tablas de reglas y de push.
- **Iconos de la PWA:** son los de `ng add @angular/pwa` (provisionales).
- **Comando de pruebas:** es `pnpm test --watch=false`.
