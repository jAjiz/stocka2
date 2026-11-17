# stocka2 — Plan 5: Importación de artículos desde una plantilla Excel

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Desde Administración → Artículos, descargar una plantilla .xlsx con desplegable de tipos e importarla para crear artículos en bloque, con vista previa por fila y resumen final.

**Architecture:** Todo el trabajo con Excel ocurre en el navegador con ExcelJS, cargado bajo demanda (`import('exceljs')`) para no engordar el bundle inicial. Un módulo puro genera la plantilla y otro lee el archivo y clasifica cada fila (Nuevo / Ya existe / Error) contra los tipos y artículos ya cargados. Al confirmar, una RPC de administrador, `admin_import_items`, crea los artículos nuevos en una sola transacción. Usa `on conflict do nothing` sobre el índice único de nombres activos para contar como «ya existía» lo que otro usuario haya creado entretanto.

**Tech Stack:** Angular 22 (standalone, signals, zoneless, Vitest con jsdom), Angular Material, `exceljs@4.4.0`, `@supabase/supabase-js` v2, Postgres + pgTAP.

**Spec:** `docs/specs/stocka2-design.md` §8.1 «Importación de artículos» (y §4 Artículo / Tipo de artículo para la unicidad de nombres). Plan anterior: `docs/plans/stocka2-plan-4-avisos-globales.md`.

**Fuera de este plan:** cargar cantidades de stock (la importación no mueve stock), CSV y despliegue (plan 6).

## Global Constraints

- Las de los planes 1–4 siguen vigentes (castellano, RLS solo `select`, escrituras por RPC `security definer` con `set search_path = ''`, `revoke … from public, anon`, errores `P0001` con código, `pnpm`; tests con `pnpm test --watch=false`).
- Solo administradores. La importación **solo crea artículos** (nombre, tipo, referencia); nunca toca stock ni operaciones.
- Plantilla: archivo `plantilla-articulos.xlsx`; hoja `Artículos` con cabeceras exactas `Nombre`, `Tipo`, `Referencia` en A1:C1; hoja `Instrucciones`; desplegable de Tipo con los tipos **activos** en el momento de la descarga.
- Lectura: solo `.xlsx`; hoja `Artículos`; columnas localizadas por el texto de su cabecera (comparado con `normalizeText`); espacios sobrantes quitados; filas vacías ignoradas; máximo **2000** filas con datos (más → error de archivo, sin vista previa).
- Nombre igual = igual tras `normalizeText` (sin mayúsculas ni acentos), como `public.normalize_name`. «Ya existe» solo frente a artículos **activos**. Tipos reconocidos sin distinguir mayúsculas (también vía `normalizeText`), solo tipos activos.
- No se puede importar con alguna fila en Error, ni sin ninguna fila Nueva. Las filas «Ya existe» no bloquean.
- Transacción única: se crean todas las nuevas o ninguna. Nombre ocupado entretanto → cuenta como «ya existía». Tipo deshabilitado o borrado entretanto → falla entera con `inactive_type`.
- Textos de la interfaz (copia exacta):
  - Botones: «Descargar plantilla», «Importar».
  - Estados: «Nuevo», «Ya existe», «Error».
  - Motivos de fila: «Falta el nombre.», «Falta el tipo.», «El tipo «X» no existe o está deshabilitado.», «Nombre repetido en el archivo (fila N).»
  - Errores de archivo: «El archivo no es un Excel (.xlsx) válido.», «Falta la hoja «Artículos».», «Falta la columna «Nombre».» / «… «Tipo».» (Referencia es opcional), «El archivo tiene más de 2000 filas con artículos.», «El archivo no tiene ningún artículo.»
  - Resumen: «Creados N · Ya existían M».
  - Error al importar con un tipo deshabilitado entretanto: «Uno de los tipos se ha deshabilitado o eliminado. Vuelve a cargar el archivo.»

## Review Focus

1. **Referencia escrita como número en Excel** (p. ej. `4001`), o una celda con formato enriquecido o fórmula: debe leerse como el texto `'4001'` / el texto visible / el resultado, nunca como `[object Object]`. Prueba en Tarea 3.
2. **Tipo escrito a mano con otras mayúsculas o acentos** (`fontaneria` frente a `Fontanería`): se reconoce. Un tipo inventado da Error, aunque alguien haya borrado el desplegable. Prueba en Tarea 3.
3. **Importar dos veces el mismo archivo:** la segunda vez todas las filas salen «Ya existe» y el botón Importar está deshabilitado (0 nuevas). Prueba en Tarea 4.
4. **Fila con solo la referencia rellena:** no es una fila vacía; da «Falta el nombre.» y «Falta el tipo.» en la misma fila. Prueba en Tarea 3.
5. **Nombres que solo difieren en acentos dentro del archivo** (`Codo` y `Códo`): la segunda fila da «Nombre repetido en el archivo (fila 2).». Prueba en Tarea 3.

---

## Estructura de archivos

```
supabase/
  migrations/20261118000001_import_items.sql      admin_import_items(jsonb)
  tests/15_import_items.test.sql
src/app/
  shared/download.ts                              saveBlob(blob, filename)
  features/admin/import/items-template.ts         buildItemsTemplate(types) → Blob
  features/admin/import/items-reader.ts           readItemsFile(buffer) → ImportRow[] | ImportFileError
  features/admin/import/items-preview.ts          classifyRows(rows, types, items) → PreviewRow[]
  features/admin/import/import-items-dialog.component.ts
  features/admin/catalog-list.component.ts        (modificar) acciones extra proyectadas en la barra
  features/admin/items.page.ts                    (modificar) botones Descargar plantilla e Importar
  data/admin.service.ts                           (modificar) importItems
  core/db-errors.ts                               (modificar, si hace falta) mensaje de inactive_type al importar
package.json, angular.json                        exceljs; allowedCommonJsDependencies si el build avisa
```

---

### Task 1: RPC `admin_import_items`

**Files:**
- Create: `supabase/migrations/20261118000001_import_items.sql`, `supabase/tests/15_import_items.test.sql`

**Interfaces:**
- Produces: `public.admin_import_items(p_items jsonb) returns jsonb`. `p_items` es un array de `{"name": text, "type_id": uuid, "reference": text|null}`. Devuelve `{"created": int, "skipped": int}`. `language plpgsql security definer set search_path = ''`; `revoke … from public, anon; grant … to authenticated`.
  - No administrador → `forbidden`.
  - `p_items` no es array, está vacío o tiene más de 2000 elementos → `invalid_input`.
  - Algún nombre vacío tras `trim`, o dos nombres iguales según `normalize_name` dentro de `p_items` → `invalid_input`.
  - Algún `type_id` inexistente o inactivo → `inactive_type`. Bloquea los tipos usados con `for share`, como `create_item`.
  - Inserta con `trim` de nombre y referencia (referencia vacía → `null`) y `on conflict ((public.normalize_name(name))) where active do nothing`. `created` = filas insertadas; `skipped` = el resto.

- [ ] **Step 1: Escribir `15_import_items.test.sql`** (arranque como `12_active_alerts.test.sql`: `tests.clear_seed()`, admin `a`, usuario `u`). Tipos `Fontanería` activo y `Viejo` inactivo; artículo activo `Codo PVC` y artículo inactivo `Grifo`. Pruebas:
  - Como `a`, importar `[{Tubo, Fontanería, ' T-1 '}, {codo pvc, Fontanería, null}, {Grifo, Fontanería, ''}]` → `{"created": 2, "skipped": 1}`; existe `Tubo` con referencia `'T-1'`; existe un `Grifo` activo con referencia `null` además del inactivo; sigue habiendo un único `Codo PVC` activo.
  - Repetir la misma llamada → `{"created": 0, "skipped": 3}`.
  - Tipo `Viejo` en un elemento → `throws_ok(..., 'P0001', 'inactive_type')` y no se crea ninguno de los otros elementos de esa llamada (cuenta de `items` sin cambios).
  - `type_id` inexistente → `inactive_type`.
  - Nombre vacío `'  '` → `invalid_input`; nombres `Codo` y `Códo` en la misma llamada → `invalid_input`; `'[]'` → `invalid_input`; un objeto en vez de array → `invalid_input`; 2001 elementos (generados con `jsonb_agg` sobre `generate_series`) → `invalid_input`.
  - Como `u` → `forbidden`.
  - No se crea ninguna fila en `operations` ni en `stock`.

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `pnpm db:reset && pnpm db:test`
Expected: FAIL en `15_import_items.test.sql` (función inexistente).

- [ ] **Step 3: Escribir la migración** con lo descrito en *Produces*.

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `pnpm db:reset && pnpm db:test`
Expected: `Result: PASS`, 15 archivos.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261118000001_import_items.sql supabase/tests/15_import_items.test.sql
git commit -m "feat(db): admin_import_items"
```

---

### Task 2: Plantilla .xlsx

**Files:**
- Modify: `package.json`, `pnpm-lock.yaml` (`pnpm add exceljs@4.4.0`)
- Create: `src/app/features/admin/import/items-template.ts`, `items-template.spec.ts`, `src/app/shared/download.ts`, `download.spec.ts`

**Interfaces:**
- Produces:
  - `export const ITEMS_SHEET = 'Artículos'`, `export const INSTRUCTIONS_SHEET = 'Instrucciones'`, `export const ITEMS_HEADERS = ['Nombre', 'Tipo', 'Referencia'] as const`, `export const TEMPLATE_FILENAME = 'plantilla-articulos.xlsx'`, `export const MAX_IMPORT_ROWS = 2000`.
  - `buildItemsTemplate(types: ItemType[]): Promise<Blob>`: carga ExcelJS con `await import('exceljs')`. Solo usa los tipos con `active`, ordenados por nombre. Blob con tipo `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`.
  - `saveBlob(blob: Blob, filename: string): void`: crea un `URL.createObjectURL`, pulsa un `<a download>` temporal y revoca la URL.

- [ ] **Step 1: Escribir los tests que fallan.** `items-template.spec.ts` genera la plantilla con dos tipos activos y uno inactivo, la relee con ExcelJS (`workbook.xlsx.load(await blob.arrayBuffer())`) y comprueba:
  - Las hojas `Artículos` e `Instrucciones` existen y `Artículos` es la primera.
  - A1:C1 = `Nombre`, `Tipo`, `Referencia`, en negrita; la vista de `Artículos` está congelada en la fila 1 (`views[0].state === 'frozen'`, `ySplit === 1`).
  - B2 tiene validación de tipo `list` cuya fórmula apunta a una lista que contiene exactamente los dos tipos activos en orden alfabético. La lista va en una hoja oculta `Tipos`, porque una lista en línea tiene un límite de 255 caracteres.
  - La validación llega hasta la fila `MAX_IMPORT_ROWS + 1`.
  - Sin tipos activos, no hay validación y la plantilla se genera igual.

  `download.spec.ts`: `saveBlob` llama a `createObjectURL`, pulsa un enlace con `download === 'x.xlsx'` y llama a `revokeObjectURL`.

- [ ] **Step 2: Ejecutar y ver que fallan**

Run: `pnpm test --watch=false`
Expected: FAIL (módulos inexistentes).

- [ ] **Step 3: Implementar.** La hoja `Instrucciones` cubre, en frases cortas, los cuatro puntos de la spec: qué es obligatorio, que los tipos salen de la lista, que los artículos que ya existan se saltan y que no se cargan cantidades. Anchos de columna: Nombre 40, Tipo 25, Referencia 20. Si ExcelJS no carga en jsdom, ledger de la ruling y prueba con `// @vitest-environment node` en el spec.

- [ ] **Step 4: Ejecutar y ver que pasan**

Run: `pnpm test --watch=false`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml src/app/features/admin/import src/app/shared/download.ts src/app/shared/download.spec.ts
git commit -m "feat(app): plantilla Excel de artículos"
```

---

### Task 3: Lectura del archivo y clasificación de filas

**Files:**
- Create: `src/app/features/admin/import/items-reader.ts`, `items-reader.spec.ts`, `items-preview.ts`, `items-preview.spec.ts`

**Interfaces:**
- Consumes: constantes de la Tarea 2; `normalizeText` de `shared/format.ts`; `Item`, `ItemType` de `data/models.ts`.
- Produces:
  - `interface ImportRow { row: number; name: string; type: string; reference: string }`: `row` es el número de fila de Excel (la primera de datos es 2) y los textos ya llevan `trim`.
  - `class ImportFileError extends Error` (su `message` es la copia exacta de la constraint).
  - `readItemsFile(data: ArrayBuffer): Promise<ImportRow[]>`: lanza `ImportFileError` en los casos de archivo de la constraint. «No tiene ningún artículo» cuando, tras quitar las vacías, quedan 0 filas.
  - `type PreviewStatus = 'new' | 'exists' | 'error'`; `interface PreviewRow extends ImportRow { status: PreviewStatus; reasons: string[]; typeId: string | null }`.
  - `classifyRows(rows: ImportRow[], types: ItemType[], items: Item[]): PreviewRow[]`: el orden de salida es el de entrada. El Error manda sobre «Ya existe». Una fila es repetida si su nombre normalizado ya apareció en una fila anterior del archivo; N es esa fila anterior.

- [ ] **Step 1: Escribir los tests que fallan.** Los de lectura construyen el `.xlsx` en el propio test con ExcelJS:
  - Lee las tres columnas y quita los espacios; `row` empieza en 2.
  - Encuentra las columnas por la cabecera aunque estén en otro orden o con otras mayúsculas (`referencia`, `NOMBRE`, `tipo`).
  - Ignora las filas vacías intermedias y finales; la numeración de las demás sigue siendo la de Excel.
  - Review Focus 1: referencia numérica `4001` → `'4001'`; celda de texto enriquecido → texto plano; celda con fórmula → su `result`.
  - Review Focus 4: una fila con solo referencia no se ignora.
  - Errores: buffer que no es xlsx, sin hoja `Artículos`, sin columna `Nombre`, sin columna `Tipo`, sin columna `Referencia` (válido: `reference` = `''`), 2001 filas con datos y 0 filas con datos. Cada error se comprueba con su mensaje exacto.

  Los de clasificación:
  - Fila completa con tipo activo → `new` con su `typeId`.
  - Nombre igual a un artículo activo con otras mayúsculas o acentos → `exists`.
  - Igual a un artículo **inactivo** → `new`.
  - Review Focus 2: tipo con otras mayúsculas o acentos → reconocido; tipo inventado → `error` con «El tipo «Inventado» no existe o está deshabilitado.»; tipo inactivo → el mismo error.
  - Review Focus 4: nombre y tipo vacíos → dos motivos.
  - Review Focus 5: `Codo` (fila 2) y `Códo` (fila 3) → la fila 3 es `error` con «Nombre repetido en el archivo (fila 2).»
  - Un nombre que existe y además tiene un tipo inválido → `error`.

- [ ] **Step 2: Ejecutar y ver que fallan**

Run: `pnpm test --watch=false`
Expected: FAIL (módulos inexistentes).

- [ ] **Step 3: Implementar.** Valor de celda a texto: `null`/`undefined` → `''`; `number`/`boolean` → `String(v)`; `Date` → `toISOString().slice(0, 10)`; objeto con `richText` → concatenar los `text`; objeto con `result` → el `result` como texto; objeto con `text` (hipervínculo) → `text`. Para ExcelJS, todo lo que no sea un zip válido es un error de carga: captúralo y lanza el error de archivo.

- [ ] **Step 4: Ejecutar y ver que pasan**

Run: `pnpm test --watch=false`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/features/admin/import
git commit -m "feat(app): lectura y vista previa de la importación de artículos"
```

---

### Task 4: Servicio y diálogo de importación

**Files:**
- Modify: `src/app/data/admin.service.ts` y su spec, `src/app/core/db-errors.ts` (si hace falta)
- Create: `src/app/features/admin/import/import-items-dialog.component.ts` y su spec

**Interfaces:**
- Consumes: `readItemsFile`, `classifyRows`, `PreviewRow`, `ImportFileError` (Tarea 3); `admin_import_items` (Tarea 1).
- Produces:
  - `AdminService.importItems(items: { name: string; typeId: string; reference: string | null }[]): Promise<{ created: number; skipped: number }>`. Llama a `admin_import_items` con `p_items` en snake_case y referencia vacía como `null`.
  - `interface ImportItemsDialogData { types: ItemType[]; items: Item[] }`. El diálogo cierra con `true` si ha creado algo.
  - `ImportItemsDialogComponent`:
    - Un input `type="file"` con `accept=".xlsx"` y un botón visible «Elegir archivo» que lo abre.
    - Tras leer el archivo: el nombre del archivo, los recuentos «N nuevos · M ya existen · K con error» y una tabla con Fila, Nombre, Tipo, Referencia y Estado. El estado lleva una etiqueta `app-tag`: Nuevo con `strong`, Ya existe sin tono y Error con `error`. Los motivos van debajo.
    - Botón «Importar» (deshabilitado si hay errores, si hay 0 nuevas o mientras importa) y «Cancelar».
    - Al terminar: sustituye la vista por el resumen «Creados N · Ya existían M» y un botón «Cerrar».
    - Un `ImportFileError` muestra su mensaje sin tabla. Un error de la RPC muestra `adminErrorMessage`, salvo `inactive_type`, que muestra la copia de la constraint.

- [ ] **Step 1: Escribir los tests que fallan.**
  - `admin.service.spec.ts`: `importItems mapea a p_items y devuelve los recuentos`.
  - Diálogo, con `readItemsFile` sustituido por un espía mediante un `InjectionToken` o una propiedad inyectable. Decide el mecanismo y apúntalo en el ledger. Pruebas:
    - Un archivo válido muestra la tabla y los recuentos.
    - Con un Error, Importar está deshabilitado.
    - Review Focus 3: todo «Ya existe» → Importar deshabilitado.
    - Importar llama a `importItems` solo con las filas nuevas y su `typeId`, muestra «Creados 2 · Ya existían 1» y Cerrar devuelve `true`.
    - `ImportFileError` → muestra el mensaje y no hay tabla.
    - `inactive_type` de la RPC → muestra la copia exacta y se puede volver a elegir archivo.

- [ ] **Step 2: Ejecutar y ver que fallan**

Run: `pnpm test --watch=false`
Expected: FAIL.

- [ ] **Step 3: Implementar** según *Produces*. Con `isHandset`, la tabla oculta la columna Referencia, como hace la pantalla de stock.

- [ ] **Step 4: Ejecutar y ver que pasan**

Run: `pnpm test --watch=false`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/data src/app/core src/app/features/admin/import
git commit -m "feat(app): diálogo de importación de artículos"
```

---

### Task 5: Botones en Administración → Artículos

**Files:**
- Modify: `src/app/features/admin/catalog-list.component.ts` y su spec, `src/app/features/admin/items.page.ts` y su spec

**Interfaces:**
- Consumes: `buildItemsTemplate`, `TEMPLATE_FILENAME` (Tarea 2), `saveBlob` (Tarea 2), `ImportItemsDialogComponent` (Tarea 4).
- Produces: `CatalogListComponent` proyecta `<ng-content select="[catalogActions]" />` en la barra, justo antes del botón de añadir. Las demás páginas de catálogo no cambian.

- [ ] **Step 1: Escribir los tests que fallan.**
  - `catalog-list.component.spec.ts`: el contenido con `catalogActions` aparece en la barra antes del botón de añadir.
  - `items.page.spec.ts`:
    - Hay botones «Descargar plantilla» e «Importar».
    - Descargar llama a `buildItemsTemplate` con todos los tipos cargados y a `saveBlob` con `TEMPLATE_FILENAME`. Sustitúyelos con `vi.mock` del módulo.
    - Importar abre `ImportItemsDialogComponent` con los tipos y los artículos cargados.
    - Si el diálogo cierra con `true`, la lista se recarga (`allItems` se llama de nuevo).
    - Si falla la generación de la plantilla, se muestra un error en la página.

- [ ] **Step 2: Ejecutar y ver que fallan**

Run: `pnpm test --watch=false`
Expected: FAIL.

- [ ] **Step 3: Implementar.** Los dos botones son `mat-stroked-button` con los iconos `download` y `upload_file`. En móvil (`isHandset`) se muestra solo el icono, con `aria-label`. El diálogo usa `dialogSize(this.isHandset())` y `disableClose: true`.

- [ ] **Step 4: Ejecutar y ver que pasan**

Run: `pnpm test --watch=false`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/features/admin
git commit -m "feat(app): descargar plantilla e importar artículos desde la administración"
```

---

### Task 6: Verificación final y documentación

**Files:**
- Modify: `ROADMAP.md`, `angular.json` (solo si el build avisa por CommonJS)

- [ ] **Step 1: Verificación completa**

Run: `pnpm db:reset && pnpm db:test && pnpm test --watch=false && pnpm build`
Expected: todo PASS y `ng build` sin avisos. Si avisa de que `exceljs` es CommonJS, añádelo a `allowedCommonJsDependencies` en `angular.json` y comprueba que ExcelJS va en un chunk lazy y no en `main`.

- [ ] **Step 2: Recorrido manual** con `pnpm db:start` y `pnpm start`, como administrador del seed:
  - Descarga la plantilla y ábrela con openpyxl (`python -c`) o en Excel para comprobar las hojas, la cabecera fija y el desplegable.
  - Rellena tres artículos nuevos, uno que ya existe y uno con un tipo inventado: la vista previa marca el error. Corrígelo e importa: sale «Creados 3 · Ya existían 1» y los artículos aparecen en la lista.
  - Vuelve a importar el mismo archivo: todo «Ya existe» e Importar deshabilitado.
  - Repítelo a 375 px.

- [ ] **Step 3: Actualizar `ROADMAP.md`**: el plan 5 pasa a «Completado», con lo verificado.

- [ ] **Step 4: Commit**

```bash
git add ROADMAP.md angular.json
git commit -m "docs: estado tras plan 5"
```
