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
pnpm test:functions  # prueba de humo de la Edge Function admin-users (tras db:reset)
pnpm ng build        # compilación
```

`pnpm exec supabase status` muestra la URL y las claves locales. Los valores de
desarrollo están en `src/environments/environment.development.ts`.

## Edge Functions

Las Edge Functions (`supabase/functions`) las sirve `pnpm db:start`. En Windows la recarga
en caliente no detecta cambios: tras editar una función, `docker restart supabase_edge_runtime_stocka2`.

## Datos y usuarios de desarrollo

`pnpm db:reset` carga `supabase/seed.sql`: 3 localizaciones (Taller, Furgoneta 1,
Furgoneta 2), 3 tipos, 8 artículos con stock inicial en Taller (mediante operaciones
`add`) y estos usuarios. La contraseña es `stocka2-dev` (solo desarrollo, nunca en producción).

| Email                  | Rol   | Permisos                       |
| ---------------------- | ----- | ------------------------------ |
| `admin@stocka2.test`   | admin | todas las localizaciones       |
| `furgo1@stocka2.test`  | user  | operar en Furgoneta 1          |

Las pruebas de BD (`pnpm db:test`) vacían estos datos dentro de su transacción
(`tests.clear_seed()`), así que no los alteran.
