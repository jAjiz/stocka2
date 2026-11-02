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
npx ng build       # compilación
```

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

## Primer administrador en producción

El seed no se aplica en producción. Crea el usuario desde el panel de Supabase
(Authentication > Users) y conviértelo en administrador:

```sql
update public.profiles set role = 'admin' where id = '<uuid>';
```
