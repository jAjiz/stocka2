# stocka2

Inventario de material para pequeños negocios con varias localizaciones (un taller, una o
varias furgonetas…). Registra cada entrada, traspaso y consumo de stock, y guarda un historial
inalterable de quién movió qué, cuánto y cuándo. Pensado para usarse desde el móvil.

## Funcionalidades

- Stock por localización y vista de stock global.
- Operaciones multiartículo: entradas, traspasos entre localizaciones y consumos.
- Historial completo con filtros.
- Usuarios por invitación, con roles y permisos por localización.
- Administración de localizaciones, tipos y artículos.
- Interfaz responsive para móvil y ordenador, en castellano.

## Tecnologías

- [Angular](https://angular.dev) 22 (SPA)
- [Supabase](https://supabase.com): Postgres con RLS, Auth y Edge Functions
- Vitest y pgTAP para las pruebas

## Inicio rápido

Necesitas Node 24, pnpm 11 y Docker.

```bash
pnpm install
pnpm db:start   # Supabase local
pnpm db:reset   # migraciones y datos de ejemplo
pnpm start      # http://localhost:4200
```

Entra con `admin@stocka2.test` / `stocka2-dev`.

## Documentación

- [Desarrollo](docs/development.md): comandos, pruebas y usuarios de desarrollo.
- [Despliegue](docs/deployment.md): configuración de Supabase en producción.
- [Roadmap](ROADMAP.md): estado del proyecto y próximos pasos.
- [Diseño](docs/specs/stocka2-design.md) y [planes de implementación](docs/plans).

## Licencia

[MIT](LICENSE)
