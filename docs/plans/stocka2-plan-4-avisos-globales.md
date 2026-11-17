# stocka2 — Plan 4: Totales y avisos globales

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Columna Total en el stock global y reglas de aviso sobre el total de cada artículo en todas las localizaciones, visibles para todos en la pantalla de stock y en su enlace de navegación, sin push.

**Architecture:** `alert_rules` gana una columna `scope` (`location` | `global`). `alert_thresholds()` pasa a filtrar `scope = 'location'`, así que `active_alerts()` y el encolado de push de `perform_operation` ignoran las reglas globales sin tocarlos. Una RPC nueva, `global_alerts()` (`security definer`, para cualquier perfil activo), cruza los umbrales globales efectivos con la suma de stock en localizaciones activas. En el frontend, un servicio con signals (`GlobalAlertsStore`) guarda esos avisos. Lo leen la pantalla de stock y el shell, y se refresca al arrancar el shell, al entrar en Stock y tras cada operación del usuario.

**Tech Stack:** Angular 22 (standalone, signals, zoneless, Vitest), Angular Material (`MatBadgeModule`, `MatRadioModule`), `@supabase/supabase-js` v2, Postgres + pgTAP.

**Spec:** `docs/specs/stocka2-design.md` §6 «Avisos globales (total de todas las localizaciones)» y §8 punto 4. Plan anterior: `docs/plans/stocka2-plan-3-avisos.md`.

**Fuera de este plan:** importación CSV/Excel y despliegue (plan 5). Actualización en tiempo real del número del icono con operaciones de otros usuarios.

## Global Constraints

- Las de los planes 1–3 siguen vigentes (castellano, RLS solo `select`, escrituras por RPC `security definer` con `set search_path = ''`, `revoke … from public, anon`, errores `P0001` con código, `BreakpointObserver`, `pnpm`).
- Total = suma del stock del artículo en todas las localizaciones **activas**. Sin stock en ninguna = 0. Solo artículos activos y reglas activas.
- Un nivel está activo cuando `total <= umbral`. Reglas globales solapadas: gana el umbral más alto en cada nivel. Mismas validaciones de umbrales que las reglas por localización.
- Reglas globales y por localización son independientes. Una regla global no tiene localizaciones (`all_locations = true`, sin filas en `alert_rule_locations`).
- Avisos globales: visibles para todo perfil activo. **Nunca** envían push y **no** aparecen en Inicio ni en la página de localización.
- Colores: los tokens existentes de `shared/alert-list.component.ts`. Grave: `--app-error-container` de fondo y `--app-on-error-container` de texto (en el badge, `--mat-sys-error`). Leve: `--app-warning-container` de fondo y `--app-warning` de texto (en el badge, `--app-warning`).
- Columna Total: en ordenador después de Tipo, en móvil después del nombre; siempre antes de las localizaciones. Cabecera «Total».
- Botón «Solo con aviso (N)»: N = total de artículos con aviso global (igual que el icono), sin descontar los que oculten búsqueda o tipo. Oculto si N = 0.
- Número del enlace Stock: rojo si algún aviso global es grave, naranja si todos son leves, oculto si no hay ninguno.

## Review Focus

1. **Artículo con stock solo en una localización deshabilitada:** su total es 0, no la cantidad de esa localización (coherente con la tabla, que no muestra localizaciones deshabilitadas). Prueba en Tarea 1.
2. **Un total que baja al umbral grave global por una operación:** no encola ninguna fila en `push_outbox`. Prueba en Tarea 1.
3. **Usuario no administrador:** ve los avisos globales aunque RLS le impide leer `alert_rules`. Prueba en Tarea 1.
4. **Fallo al cargar los avisos globales:** la tabla de stock se muestra igual, sin colores ni botón, y el shell no muestra número ni error. Pruebas en Tareas 2 y 3.
5. **Pasar una regla de global a por localización al editarla:** el diálogo exige elegir localizaciones (o «Todas») y la regla deja de contar como global. Prueba en Tarea 5.

---

## Estructura de archivos

```
supabase/
  migrations/20261117000001_global_alerts.sql     scope, alert_thresholds filtrado, admin_save_alert_rule con p_scope, global_alerts()
  tests/14_global_alerts.test.sql
  seed.sql                                        (modificar) una regla global de ejemplo
src/app/
  data/models.ts                                  (modificar) AlertScope, AlertRule.scope, AlertRuleInput.scope, GlobalAlert
  data/alerts.service.ts                          (modificar) scope en rules/saveRule, global()
  data/global-alerts.store.ts                     estado compartido de avisos globales
  data/operations.service.ts                      (modificar) refresca el store tras perform
  features/stock/stock-overview.page.ts           (modificar) Total, colores, filtro
  layout/shell.component.ts                       (modificar) número en el enlace Stock
  features/admin/alert-rule-dialog.component.ts   (modificar) alcance
  features/admin/alert-rules.page.ts              (modificar) muestra el alcance
```

---

### Task 1: Base de datos — alcance de las reglas y `global_alerts()`

**Files:**
- Create: `supabase/migrations/20261117000001_global_alerts.sql`, `supabase/tests/14_global_alerts.test.sql`
- Modify: `supabase/seed.sql` (tras la regla de ejemplo existente, línea ~86)

**Interfaces:**
- Produces:
  - `alert_rules.scope text not null default 'location' check (scope in ('location','global'))`, más `check (scope = 'location' or all_locations)`.
  - `admin_save_alert_rule(p_id uuid, p_name text, p_item_ids uuid[], p_location_ids uuid[], p_warning int, p_critical int, p_scope text default 'location') returns uuid`. Se borra la firma de 6 parámetros (`drop function`) y se crea la de 7; las llamadas existentes de 6 argumentos siguen valiendo por el `default`. Con `p_scope = 'global'`: `p_location_ids` debe ser `null` (si no, `invalid_input`), se guarda `all_locations = true` y no se insertan localizaciones. `p_scope` fuera de los dos valores o `null` → `invalid_input`. Al editar se borran siempre las filas de `alert_rule_locations` (como ahora), lo que descarta las localizaciones al pasar a global. Mismos `revoke`/`grant` que la versión anterior, con la firma nueva.
  - `alert_thresholds()`: misma firma, añade `r.scope = 'location'`.
  - `global_alerts() returns table (item_id uuid, total int, level text, threshold int)`: `language sql stable security definer set search_path = ''`, filas solo si `public.is_active()`, `level` en `'critical' | 'warning'`, orden graves primero y después `item_id`. `revoke … from public, anon; grant … to authenticated`.

- [ ] **Step 1: Escribir `14_global_alerts.test.sql`** con el mismo arranque que `12_active_alerts.test.sql` (`tests.clear_seed()`, admin `a`, usuario `u` sin permisos, usuario inactivo `x`; localizaciones T y F1 activas, F2 deshabilitada; artículos A y B activos, C deshabilitado). Stock: A = 3 en T y 2 en F1; B = 50 en F2 (deshabilitada); C = 0. Pruebas:
  - `has_column('public','alert_rules','scope')` y `col_default_is(..., 'location')`.
  - Regla global G1 sobre A, leve 10 y grave 5 (creada con `admin_save_alert_rule(..., 'global')` como `a`): `global_alerts()` devuelve `(A, 5, 'critical', 5)`.
  - Sube A en T a 4 (total 6): `(A, 6, 'warning', 10)`.
  - G2 global sobre todos, leve 12: A sale con umbral leve 12 (gana el más alto); B sale con total 0 y `warning` (su stock solo está en F2); C no aparece.
  - Como `u`: devuelve las mismas filas que como `a` (Review Focus 3). Como `x`: 0 filas.
  - `active_alerts()` como `a` no devuelve ninguna fila por G1/G2 (no hay reglas por localización).
  - Con G1 activa y el secreto `stocka2_push_url` ausente, `perform_operation` de `a` que saca 2 de A en T (total ≤ 5) no inserta filas en `push_outbox` (Review Focus 2).
  - `admin_save_alert_rule` con `p_scope = 'global'` y `p_location_ids` no nulo → `throws_ok(..., 'P0001', 'invalid_input')`; con `p_scope = 'otro'` → `invalid_input`.
  - Editar G1 a `global` desde una regla `location` con localizaciones: `alert_rule_locations` queda vacía para esa regla y `all_locations = true`.
  - Como `u`, `admin_save_alert_rule(..., 'global')` → `forbidden`.

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `pnpm db:reset && pnpm db:test`
Expected: FAIL en `14_global_alerts.test.sql` (columna `scope` inexistente).

- [ ] **Step 3: Escribir la migración** con los elementos de *Produces*. `global_alerts()`: umbrales `max(warning_threshold)` / `max(critical_threshold)` por artículo activo entre reglas activas `scope = 'global'` que lo cubren (`all_items` o fila en `alert_rule_items`); total `coalesce(sum(s.quantity), 0)` de `stock` unido a `locations` activas; misma expresión de nivel y umbral que `active_alerts()`.

- [ ] **Step 4: Añadir al seed** una regla global «Pedir al proveedor» sobre todos los artículos, leve 10 y grave 3 (insert directo con `scope = 'global'`, `all_items = true`, `all_locations = true`).

- [ ] **Step 5: Ejecutar y ver que pasa**

Run: `pnpm db:reset && pnpm db:test`
Expected: PASS en todos los archivos (los 13 anteriores sin cambios incluidos).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20261117000001_global_alerts.sql supabase/tests/14_global_alerts.test.sql supabase/seed.sql
git commit -m "feat(db): reglas de aviso globales y global_alerts"
```

---

### Task 2: Modelos, servicio y `GlobalAlertsStore`

**Files:**
- Modify: `src/app/data/models.ts`, `src/app/data/alerts.service.ts`, `src/app/data/alerts.service.spec.ts`, `src/app/data/operations.service.ts`, `src/app/data/operations.service.spec.ts`
- Create: `src/app/data/global-alerts.store.ts`, `src/app/data/global-alerts.store.spec.ts`

**Interfaces:**
- Consumes: `global_alerts()` y `admin_save_alert_rule(..., p_scope)` de la Tarea 1.
- Produces:
  - `type AlertScope = 'location' | 'global'`; `AlertRule.scope: AlertScope`; `AlertRuleInput.scope: AlertScope`.
  - `interface GlobalAlert { itemId: string; total: number; level: 'warning' | 'critical'; threshold: number }`.
  - `AlertsService.global(): Promise<GlobalAlert[]>`; `rules()` selecciona y mapea `scope`; `saveRule` envía `p_scope: input.scope`.
  - `GlobalAlertsStore` (`providedIn: 'root'`): `readonly alerts: Signal<GlobalAlert[]>`, `readonly byItem: Signal<Map<string, GlobalAlert>>`, `readonly count: Signal<number>`, `readonly hasCritical: Signal<boolean>`, `refresh(): Promise<void>`. `refresh` nunca lanza: si falla, deja `alerts` en `[]`.
  - `OperationsService.perform`: tras guardar con éxito, `void store.refresh()` sin esperar; no cambia lo que devuelve ni lo que lanza.

- [ ] **Step 1: Escribir los tests que fallan**
  - `alerts.service.spec.ts`: actualizar `saveRule con todos…` para incluir `scope: 'location'` en la entrada y `p_scope: 'location'` en la llamada; nuevo `saveRule global envía p_scope global`; `rules` mapea `scope: 'global'` desde la fila; `global convierte las filas de global_alerts` (`{item_id:'i1', total:4, level:'critical', threshold:5}` → `{itemId:'i1', total:4, level:'critical', threshold:5}` y `rpc` llamada con `'global_alerts'`).
  - `global-alerts.store.spec.ts`: `refresh carga los avisos y calcula count, hasCritical y byItem` (dos avisos, uno grave → `count() === 2`, `hasCritical() === true`, `byItem().get('i1')?.level === 'critical'`); `con solo leves hasCritical es false`; `si global() falla, refresh no lanza y deja la lista vacía` (Review Focus 4).
  - `operations.service.spec.ts`: `perform refresca los avisos globales tras guardar` (espía `GlobalAlertsStore.refresh`, llamado una vez); `si perform_operation falla no refresca`.

- [ ] **Step 2: Ejecutar y ver que fallan**

Run: `pnpm test -- --watch=false`
Expected: FAIL en los tests nuevos.

- [ ] **Step 3: Implementar** los elementos de *Produces*.

- [ ] **Step 4: Ejecutar y ver que pasan**

Run: `pnpm test -- --watch=false`
Expected: PASS. Los demás usos de `AlertRuleInput` que no compilen se arreglan en la Tarea 5; si `ng test` falla por tipos en `alert-rule-dialog.component.ts`, añade ahí `scope: 'location'` en `saveRule` como arreglo mínimo.

- [ ] **Step 5: Commit**

```bash
git add src/app/data
git commit -m "feat(app): servicio y estado de avisos globales"
```

---

### Task 3: Pantalla de stock — Total, colores y filtro

**Files:**
- Modify: `src/app/features/stock/stock-overview.page.ts`, `src/app/features/stock/stock-overview.page.spec.ts`

**Interfaces:**
- Consumes: `GlobalAlertsStore` (`byItem`, `count`, `refresh`) de la Tarea 2.
- Produces: nada que usen otras tareas.

- [ ] **Step 1: Escribir los tests que fallan** (el `setup` añade un `GlobalAlertsStore` falso con signals escribibles y `refresh` espía; una segunda localización `l2` 'Furgo' con 3 de Bujía):
  - Actualizar las cabeceras esperadas: PC `['Artículo','Referencia','Tipo','Total','Taller','Furgo']`; móvil `['Artículo','Total','Taller','Furgo']`.
  - `el total suma todas las localizaciones` → celda Total `'10'`, con clase `num` y `total`.
  - `un artículo sin stock tiene total 0`.
  - `el total se marca grave o leve según el aviso global` → con aviso `critical` la celda tiene clase `critical` y `title` `'Aviso grave: umbral 5'`; con `warning`, clase `warning` y `'Aviso leve: umbral 10'`; sin aviso, ninguna de las dos y sin `title`.
  - `refresca los avisos globales al entrar` → `refresh` llamado una vez.
  - `el botón Solo con aviso muestra N y filtra` → con 1 aviso y 2 artículos, el botón dice `'Solo con aviso (1)'`, `aria-pressed="false"`; al pulsarlo queda 1 fila y `aria-pressed="true"`; combinado con una búsqueda que no casa queda 0 filas y el texto sigue `(1)`.
  - `sin avisos globales no hay botón ni colores` (Review Focus 4: cubre también el caso de fallo, porque el store deja la lista vacía).

- [ ] **Step 2: Ejecutar y ver que fallan**

Run: `pnpm test -- --watch=false`
Expected: FAIL en `stock-overview.page.spec.ts`.

- [ ] **Step 3: Implementar.** `ItemRow` gana `total: number`. Columna `'total'` en `columns()` según la constraint de orden. Signal `onlyAlerts = signal(false)` que entra en `filtered()`. El botón es un `mat-stroked-button` con `[attr.aria-pressed]`, junto a los filtros, solo si `store.count() > 0`. `refresh()` del store se lanza en `load()` sin bloquear la carga de la tabla.

- [ ] **Step 4: Ejecutar y ver que pasan**

Run: `pnpm test -- --watch=false`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/features/stock
git commit -m "feat(app): total y avisos globales en el stock"
```

---

### Task 4: Número de avisos en el enlace Stock

**Files:**
- Modify: `src/app/layout/shell.component.ts`, `src/app/layout/shell.component.spec.ts`

**Interfaces:**
- Consumes: `GlobalAlertsStore` (`count`, `hasCritical`, `refresh`).

- [ ] **Step 1: Escribir los tests que fallan** (store falso como en la Tarea 3):
  - `el enlace Stock muestra el número de avisos globales` en móvil (barra inferior) y en ordenador (menú lateral): con `count = 3` el badge del enlace `/stock` muestra `'3'`.
  - `el número es rojo si hay alguno grave y naranja si todos son leves` → clase `critical` o `warning` en el badge.
  - `sin avisos no hay número` → `count = 0`: el badge está oculto (`mat-badge-hidden`).
  - `el shell refresca los avisos al arrancar` → `refresh` llamado una vez.
  - El badge tiene una descripción accesible: `matBadgeDescription` = `'3 artículos con aviso global'`.

- [ ] **Step 2: Ejecutar y ver que fallan**

Run: `pnpm test -- --watch=false`
Expected: FAIL en `shell.component.spec.ts`.

- [ ] **Step 3: Implementar** con `MatBadgeModule` sobre el `mat-icon` de los dos enlaces a `/stock`: `[matBadge]="count()"`, `[matBadgeHidden]="count() === 0"`, `matBadgeSize="small"` y la clase `critical`/`warning`. El naranja sobrescribe `--mat-badge-background-color` en `.warning`. El shell solo existe con sesión iniciada, así que llama a `refresh()` en su constructor.

- [ ] **Step 4: Ejecutar y ver que pasan**

Run: `pnpm test -- --watch=false`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/layout
git commit -m "feat(app): número de avisos globales en la navegación"
```

---

### Task 5: Administración — alcance de la regla

**Files:**
- Modify: `src/app/features/admin/alert-rule-dialog.component.ts` y su `.spec.ts`, `src/app/features/admin/alert-rules.page.ts` y su `.spec.ts`

**Interfaces:**
- Consumes: `AlertRule.scope`, `AlertRuleInput.scope`, `AlertsService.saveRule` (Tarea 2).

- [ ] **Step 1: Escribir los tests que fallan**
  - Diálogo: `una regla nueva es por localización por defecto` (radio «Por localización» marcado, sección de localizaciones visible).
  - `al elegir Global se ocultan las localizaciones y se guarda con scope global y locationIds null`.
  - `editar una regla global la abre con Global marcado`; `duplicar conserva el alcance`.
  - `pasar de global a por localización exige elegir localizaciones` → desmarcar «Todas las localizaciones» sin elegir ninguna deja Guardar deshabilitado; con una, `saveRule` recibe `scope: 'location'` y esa localización (Review Focus 5).
  - Al cambiar a Global, `valid()` ignora las localizaciones, incluidas las ocultas (deshabilitadas).
  - Lista: `una regla global muestra «Alcance: total de todas las localizaciones»` en lugar de la línea de localizaciones.

- [ ] **Step 2: Ejecutar y ver que fallan**

Run: `pnpm test -- --watch=false`
Expected: FAIL en los specs de admin.

- [ ] **Step 3: Implementar.** Signal `scope` inicializada con `data.rule?.scope ?? 'location'`. `mat-radio-group` con «Por localización» y «Global (total de todas las localizaciones)» encima de la sección de localizaciones, que solo se muestra con `scope() === 'location'`. Al guardar con `global`: `locationIds: null`.

- [ ] **Step 4: Ejecutar y ver que pasan**

Run: `pnpm test -- --watch=false`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/features/admin
git commit -m "feat(app): alcance global en las reglas de aviso"
```

---

### Task 6: Verificación final y documentación

**Files:**
- Modify: `ROADMAP.md`

- [ ] **Step 1: Ejecutar toda la verificación**

Run: `pnpm db:reset && pnpm db:test && pnpm test -- --watch=false && pnpm build`
Expected: todo PASS y `ng build` sin avisos.

- [ ] **Step 2: Recorrido manual** con `pnpm db:start` y `pnpm start`, con el seed (regla global de ejemplo). Como usuario no administrador: la columna Total en ordenador (1280 px) y en móvil (375 px), los colores, el botón «Solo con aviso (N)» y el número en el enlace Stock. Registra una salida que baje un total al umbral grave y comprueba que el número se actualiza sin recargar. Como administrador: crea, edita (de por localización a global y al revés) y duplica una regla global.

- [ ] **Step 3: Actualizar `ROADMAP.md`**: mover el plan 4 a «Completado» con lo verificado (número de pruebas pgTAP y Vitest, build y recorrido manual).

- [ ] **Step 4: Commit**

```bash
git add ROADMAP.md
git commit -m "docs: estado tras plan 4"
```
