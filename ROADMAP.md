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

### Plan 4 — Totales y avisos globales

Columna Total en el stock global y reglas de aviso con alcance global, que comparan los
umbrales con el total del artículo en todas las localizaciones activas. Sus avisos los ven
todos los usuarios: el total en rojo o naranja, el botón «Solo con aviso (N)» y un número en el
enlace Stock que se actualiza tras cada operación. No envían push ni aparecen en Inicio.

Verificado: 292 pruebas pgTAP (14 archivos), 298 pruebas Vitest (39 archivos), `pnpm build`
correcto y recorrido manual a 1280 px y 375 px (usuario sin permisos de administrador, salida
que pasa el número a rojo sin recargar y diálogo de reglas con alcance).

### Plan 5 — Importación de artículos

En Administración → Artículos se descarga una plantilla Excel (hoja «Artículos» con cabecera
fija y desplegable de tipos activos, más instrucciones) y se importa: vista previa por fila
(Nuevo, Ya existe, Error con su motivo), importación de todo o nada con `admin_import_items` y
resumen final. Solo crea artículos; no carga stock. ExcelJS se carga bajo demanda.

Verificado: 308 pruebas pgTAP (15 archivos), 337 pruebas Vitest (44 archivos), `pnpm build` sin
avisos y recorrido manual a 1280 px y 375 px (plantilla descargada, archivo con un error de
tipo, importación corregida, reimportación con todo «Ya existe»).

### Plan 6 — Despliegue en Cloudflare

Worker de Cloudflare solo con static assets, publicado por Workers Builds en cada push a
`main`. El build pasa las pruebas Vitest y `scripts/set-env.mjs` escribe la URL de Supabase y
las claves públicas en `environment.ts` antes de compilar; si falla algo, no se publica.
`public/_headers` evita que el navegador guarde `index.html` y el service worker en caché.
La puesta en marcha está en `docs/deployment.md`.

Verificado: 5 pruebas de `set-env` (`pnpm test:scripts`), 337 pruebas Vitest, `pnpm build` y
`wrangler dev` (rutas profundas devuelven la app; cabeceras de caché comprobadas con `curl`).

## Pendiente

- **Primer despliegue real** siguiendo `docs/deployment.md`.
- **Prueba manual en producción** del service worker, la instalación de la PWA y las
  notificaciones push reales (el panel de navegador de desarrollo no registra service workers).
