# stocka2 — Plan 6: Despliegue en Cloudflare

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que cada push a `main` pase las pruebas, compile con las variables de producción y publique la SPA en Cloudflare, y dejar documentada la puesta en marcha completa.

**Architecture:** Worker de Cloudflare solo con static assets (sin código), conectado al repo con la integración Git (Workers Builds). Un script Node sustituye los marcadores de `environment.ts` con variables de build antes de `ng build`, así los hashes de `ngsw.json` cuadran. `public/_headers` controla la caché para que el service worker reciba las versiones nuevas.

**Tech Stack:** Angular 22, Node 24 (`node:test` para el script), Wrangler 4, Cloudflare Workers static assets.

**Spec:** `docs/specs/stocka2-design.md` §9 «Despliegue y entornos». Plan anterior: `docs/plans/stocka2-plan-5-importacion.md`.

**Fuera de este plan:** crear la cuenta de Cloudflare, conectar el repo en el panel y el primer despliegue real (los hace el desarrollador siguiendo `docs/deployment.md`); dominio propio; aplicar migraciones o funciones a producción.

## Global Constraints

- Las de los planes 1–5 siguen vigentes (`pnpm`, castellano, `pnpm test --watch=false`).
- Comando de build en Cloudflare, exacto: `pnpm test --watch=false && node scripts/set-env.mjs && pnpm build`. Comando de deploy: `npx wrangler deploy`.
- Variables de build: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `VAPID_PUBLIC_KEY`. Marcadores: `__SUPABASE_URL__`, `__SUPABASE_ANON_KEY__`, `__VAPID_PUBLIC_KEY__` en `src/environments/environment.ts`.
- Los valores se sustituyen **antes** del build, nunca en `dist/`.
- `wrangler.jsonc`: `name` `stocka2`, `assets.directory` `./dist/stocka2/browser`, `assets.not_found_handling` `single-page-application`, sin `main`.
- `_headers`: `Cache-Control: no-cache` para `/index.html`, `/ngsw.json`, `/ngsw-worker.js`, `/manifest.webmanifest`; `public, max-age=31536000, immutable` para `/*.js` y `/*.css` (llevan hash).
- Ningún secreto en el repo: solo la URL de Supabase, la clave `anon` y la VAPID pública viajan al frontend, y ni siquiera esas se commitean.

## Review Focus

- Variable presente pero vacía (`SUPABASE_URL=""`): debe fallar igual que si faltara, no publicar una app rota.
- Ejecutar el script dos veces, o con `environment.ts` ya sustituido: debe fallar con un mensaje claro, no dejar el archivo a medias.
- Valores con comillas o barras invertidas: el `environment.ts` resultante tiene que seguir siendo TypeScript válido (usar `JSON.stringify`).
- Recargar `/acceso?t=…` o `/admin/articulos` en producción: devuelve la app, no un 404.
- Tras un despliegue, un usuario con la PWA instalada recibe la versión nueva: `ngsw.json` y `ngsw-worker.js` no quedan en caché del navegador.

---

### Task 1: Sustitución de variables antes del build

**Files:**
- Create: `scripts/set-env.mjs`
- Test: `scripts/set-env.test.mjs`
- Modify: `package.json` (script `"test:scripts": "node --test scripts/"`)

**Interfaces:**
- Produces: `applyEnv(source: string, env: Record<string, string | undefined>): string` (exportada) y ejecución como CLI (`node scripts/set-env.mjs`) que lee y reescribe `src/environments/environment.ts` con `process.env`. Errores: lanza `Error` con mensaje en castellano; la CLI lo imprime y sale con código 1.

- [ ] **Step 1: Write the failing tests** (`node:test` + `node:assert/strict`)

```js
const SRC = `export const environment = {
  supabaseUrl: '__SUPABASE_URL__',
  supabaseAnonKey: '__SUPABASE_ANON_KEY__',
  vapidPublicKey: '__VAPID_PUBLIC_KEY__',
};`;
const ENV = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'sb_publishable_1', VAPID_PUBLIC_KEY: 'BPk' };

test('sustituye los tres marcadores por literales', () => {
  const out = applyEnv(SRC, ENV);
  assert.match(out, /supabaseUrl: "https:\/\/x\.supabase\.co"/);
  assert.match(out, /supabaseAnonKey: "sb_publishable_1"/);
  assert.match(out, /vapidPublicKey: "BPk"/);
  assert.doesNotMatch(out, /__[A-Z_]+__/);
});
test('falla si falta una variable', () => {
  assert.throws(() => applyEnv(SRC, { ...ENV, VAPID_PUBLIC_KEY: undefined }), /Falta la variable VAPID_PUBLIC_KEY/);
});
test('falla si una variable está vacía', () => {
  assert.throws(() => applyEnv(SRC, { ...ENV, SUPABASE_URL: '  ' }), /Falta la variable SUPABASE_URL/);
});
test('falla si el archivo ya no tiene el marcador', () => {
  assert.throws(() => applyEnv(applyEnv(SRC, ENV), ENV), /No se encuentra el marcador __SUPABASE_URL__/);
});
test('escapa comillas y barras', () => {
  const out = applyEnv(SRC, { ...ENV, SUPABASE_ANON_KEY: `a'b"c\\d` });
  assert.ok(out.includes(`supabaseAnonKey: ${JSON.stringify(`a'b"c\\d`)}`));
});
```

- [ ] **Step 2: Run** `pnpm test:scripts` — Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implement** `applyEnv`: para cada variable, comprobar valor no vacío tras `trim`, comprobar que `'__NAME__'` (con comillas simples) está en el texto y reemplazarlo por `JSON.stringify(valor.trim())`. Comprobar todo antes de devolver nada. La CLI solo corre cuando el módulo es el punto de entrada (`import.meta.url === pathToFileURL(process.argv[1]).href`), escribe el archivo y muestra `environment.ts listo para producción.` sin imprimir los valores.

- [ ] **Step 4: Run** `pnpm test:scripts` — Expected: 5 pass.

- [ ] **Step 5: Commit** — `feat(deploy): script que escribe las variables de producción antes del build`

### Task 2: Worker de static assets y cabeceras de caché

**Files:**
- Create: `wrangler.jsonc`, `public/_headers`
- Modify: `package.json` (devDependency `wrangler` 4.x fijada exacta), `.gitignore`

**Interfaces:**
- Consumes: `scripts/set-env.mjs` (Task 1) para el build de comprobación.

- [ ] **Step 1:** `pnpm add -D wrangler` (versión exacta en `package.json`). `wrangler.jsonc` con los valores de Global Constraints y `compatibility_date` `"2026-11-01"`. `public/_headers` con las reglas de Global Constraints.

- [ ] **Step 2: Build de comprobación** en una copia desechable: `SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_ANON_KEY=<la de environment.development.ts> VAPID_PUBLIC_KEY=<la de desarrollo> node scripts/set-env.mjs && pnpm build`, luego `git checkout src/environments/environment.ts`.
Expected: build sin warnings; `dist/stocka2/browser/_headers` existe; `ngsw.json` no lista `_headers`.

- [ ] **Step 3: Servir con Wrangler** — `pnpm exec wrangler dev --port 8787` (en segundo plano) y comprobar con `curl -sI`:
  - `/acceso?t=x` y `/admin/articulos` → 200 y `content-type: text/html`.
  - `/ngsw-worker.js` → `cache-control: no-cache`.
  - un `/main-*.js` → `cache-control` con `immutable`.
  - `/_headers` → no se sirve como archivo (404 o el index).
Expected: todo lo anterior. Si algo falla, ajustar `_headers`/`wrangler.jsonc` y repetir.

- [ ] **Step 4:** `.gitignore`: añadir `.wrangler/`. `pnpm test --watch=false` en verde.

- [ ] **Step 5: Commit** — `feat(deploy): Worker de Cloudflare con static assets y cabeceras de caché`

### Task 3: Documentación de la puesta en marcha

**Files:**
- Modify: `docs/deployment.md`, `README.md`, `ROADMAP.md`, `docs/development.md` (mencionar `pnpm test:scripts`)

- [ ] **Step 1:** `docs/deployment.md`:
  - Orden al principio: 1) Supabase (secciones existentes), 2) Cloudflare, 3) primer administrador.
  - Nueva sección «Cloudflare»: crear cuenta; Workers & Pages → Create → Import a repository → `jAjiz/stocka2`, rama `main`; comandos de build y deploy exactos; variables de build (`SUPABASE_URL`, `SUPABASE_ANON_KEY` = Project Settings → API de Supabase, `VAPID_PUBLIC_KEY` = la del par de producción), y `NODE_VERSION=24` / `PNPM_VERSION=11.4.0` si la imagen no los trae; la URL `*.workers.dev` resultante; dominio propio opcional (Settings → Domains & Routes); volver a una versión anterior (Deployments → versión → Rollback); un build con pruebas en rojo o variables ausentes no publica.
  - Notificaciones push, paso 3: sustituir la nota «llega con el plan 4» por «es la variable de build `VAPID_PUBLIC_KEY` de Cloudflare».
- [ ] **Step 2:** README: en «Documentación», el enlace de despliegue dice «Supabase y Cloudflare». ROADMAP: plan 6 completado; pendiente el despliegue real y la prueba manual de push/PWA en producción.
- [ ] **Step 3: Commit** — `docs: despliegue en Cloudflare`
