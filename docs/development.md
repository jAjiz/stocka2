# Desarrollo

## Requisitos

- Node 24 y pnpm 11 (`npm install -g pnpm` o `corepack enable`)
- Docker arrancado (necesario para Supabase local)

## Comandos

```bash
pnpm install
pnpm db:start        # arranca Supabase local (supabase start)
pnpm start           # ng serve en http://localhost:4200
pnpm test            # pruebas unitarias (Vitest)
pnpm db:reset        # reinicia la base de datos local (migraciones + seed)
pnpm db:test         # pruebas de base de datos (supabase test db)
pnpm test:functions  # pruebas de humo de las Edge Functions admin-users y send-push (tras db:reset)
pnpm ng build        # compilación
pnpm serve:pwa       # build de producción con claves de desarrollo en http://localhost:4300 (service worker y push)
```

`pnpm exec supabase status` muestra la URL y las claves locales. Los valores de
desarrollo están en `src/environments/environment.development.ts`.

## Edge Functions

Las Edge Functions (`supabase/functions`) las sirve `pnpm db:start`. En Windows la recarga
en caliente no detecta cambios: tras editar una función, `docker restart supabase_edge_runtime_stocka2`.
Tras cambiar `supabase/config.toml` (p. ej. `[edge_runtime.secrets]` o `[functions.*]`) hay que
reiniciar todo: `pnpm exec supabase stop && pnpm exec supabase start`.

## Notificaciones push

Cuando una operación deja algún artículo en nivel grave en su origen, `perform_operation`
encola un aviso por destinatario en `push_outbox` y llama con `pg_net` (tras el commit) a la
Edge Function `send-push`, cuya URL lee del secreto de Vault `stocka2_push_url`. El seed lo crea
con `http://host.docker.internal:54321/functions/v1/send-push` (Postgres corre en Docker y llega
a Kong por el host). `send-push` vacía la bandeja con `claim_push_outbox` y envía Web Push a
todos los dispositivos de cada destinatario; si el servicio de push responde 404 o 410, borra
esa suscripción. También se puede disparar a mano: `curl -X POST
http://127.0.0.1:54321/functions/v1/send-push` (no necesita JWT).

- El par VAPID de `supabase/config.toml` (`[edge_runtime.secrets]`) y la clave pública de
  `environment.development.ts` son **solo de desarrollo**, como la contraseña del seed. En
  producción se usa otro par (`docs/deployment.md`).
- `send-push` cifra y firma con `web-push` pero envía con `fetch`: `sendNotification` usa
  siempre `https.request`, y en el runtime de Deno eso no admite endpoints `http://`, como el
  servicio de push falso de `scripts/smoke-push.mjs` (escucha en `0.0.0.0:54399` y los
  contenedores lo alcanzan como `host.docker.internal`).
- El service worker de Angular solo se registra en un build de producción, así que para recibir
  notificaciones en el navegador hay que servir ese build: `pnpm serve:pwa` lo compila con las
  claves de desarrollo (configuración `local`) y lo sirve en `http://localhost:4300`
  (localhost es un contexto seguro, así que el push funciona). Con `pnpm start` no hay push.

## Datos y usuarios de desarrollo

`pnpm db:reset` carga `supabase/seed.sql`: 3 localizaciones (Taller, Furgoneta 1,
Furgoneta 2), 3 tipos, 8 artículos con stock inicial en Taller (mediante operaciones
`add`) y estos usuarios. La contraseña es `stocka2-dev` (solo desarrollo, nunca en producción).

| Email                 | Rol   | Permisos                 |
| --------------------- | ----- | ------------------------ |
| `admin@stocka2.test`  | admin | todas las localizaciones |
| `furgo1@stocka2.test` | user  | operar en Furgoneta 1    |

Las pruebas de BD (`pnpm db:test`) vacían estos datos dentro de su transacción
(`tests.clear_seed()`), así que no los alteran.
