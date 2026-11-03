# Roadmap

El diseño completo está en [docs/specs/stocka2-design.md](docs/specs/stocka2-design.md) y
cada plan en [docs/plans](docs/plans).

## Completado

### Plan 1 — Base

Autenticación, esquema con RLS y funciones `perform_operation`, `create_item` y
`search_operations`, shell responsive, inicio, página de localización con sus operaciones,
stock global e historial con filtros.

### Plan 2 — Administración

Área solo para administradores con usuarios (invitar con nombre, rol y permisos; enlace de
acceso con botones Copiar y Compartir; regenerar enlace para recuperar la contraseña; editar
rol y permisos; desactivar, que además banea al usuario en Auth), localizaciones, tipos y
artículos (alta, edición, deshabilitar solo sin stock y eliminar solo sin historial); pantalla
`/acceso` para crear la contraseña desde el enlace y página de perfil (nombre visible y
contraseña). RLS exige un perfil activo para leer.

Verificado: 201 pruebas pgTAP, 117 pruebas Vitest, prueba de humo de la Edge Function
(`pnpm test:functions`, 21 comprobaciones), `ng build` sin avisos y recorrido manual de la
invitación a 1280 px y del área de administración a 375 px.

### Plan 3 — Avisos y notificaciones push con PWA

Reglas de aviso con niveles leve y grave, avisos en inicio y en cada localización,
administración de reglas con duplicar y notificación push por destinatario y operación cuando
una operación deja stock en nivel grave. El envío usa un outbox, `pg_net` y la Edge Function
`send-push`. La PWA es instalable, con activación de las notificaciones por dispositivo en el
perfil y un aviso para iPhone; cerrar sesión olvida el dispositivo.

Verificado: 270 pruebas pgTAP (13 archivos), 152 pruebas Vitest (29 archivos), prueba de humo
de las Edge Functions (`pnpm test:functions`, 34 comprobaciones) y `pnpm build` correcto. El
recorrido manual con notificaciones push reales y la instalación de la PWA sigue pendiente.

## Pendiente

- **Plan 4 — Importación CSV/Excel y despliegue** en Cloudflare.
