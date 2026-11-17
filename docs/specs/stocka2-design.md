# stocka2 — Documento de diseño

Fecha: 2026-11-02
Estado: aprobado

## 1. Propósito

Gestionar el inventario de material de un pequeño negocio de trabajos de campo con varias localizaciones: hoy un **taller** (almacén principal) y **dos furgonetas**. Al principio lo usan dos personas, pero el sistema no debe tener límites de usuarios ni de localizaciones.

Es un proyecto personal, sin uso comercial. El desarrollador quiere además aprovecharlo para repasar Angular moderno.

### Flujo real de trabajo

- El material entra casi siempre por el taller. Normalmente se repone material ya conocido; a veces entra un artículo nuevo que hay que dar de alta.
- Cada furgoneta tiene su propio stock. Cuando le falta algo, lo trae del taller o de la otra furgoneta.
- El material se gasta al hacer trabajos, sobre todo desde las furgonetas. Al terminar un trabajo se registra de una vez todo lo que se ha gastado.

### Qué es éxito

- Saber en todo momento cuánto hay de cada artículo en cada localización.
- Que todo cambio de stock quede registrado (qué, cuánto, de dónde, a dónde, quién, cuándo) y se pueda consultar fácilmente.
- Recibir un aviso en el móvil cuando algo llega a un nivel crítico.
- Que registrar un trabajo desde el móvil en la furgoneta sea rápido.

## 2. Objetivos, no-objetivos y anti-objetivos

**Objetivos**
- Stock por localización, operaciones multi-artículo, historial completo e inalterable.
- Administración de usuarios por invitación, con permisos por localización.
- Localizaciones, artículos y tipos de artículo configurables por el administrador.
- Reglas de avisos configurables con dos niveles (leve y grave) y notificaciones push.
- Interfaz adaptada a móvil y a ordenador.

**No-objetivos (por ahora)**
- Clientes, direcciones o facturación de trabajos (un trabajo solo lleva una referencia opcional).
- Pedidos a proveedores, precios, costes o valoración de inventario.
- Unidades que no sean enteras (metros, kilos): todo se cuenta en unidades enteras.
- Registro abierto: nadie entra sin invitación.
- Envío de emails de cualquier tipo: notificaciones, invitaciones y recuperación de contraseña.
- Funcionamiento sin conexión.
- Varios idiomas: la interfaz es solo en castellano.

**Anti-objetivos (sería un fracaso aunque funcione)**
- Una interfaz complicada para usuarios no técnicos. Este fue el motivo para no usar InvenTree u otras herramientas existentes.
- Un historial que se pueda editar o borrar, o en el que no se sepa quién hizo algo.
- Stock negativo o descuadrado por operaciones a medias.
- Que un usuario pueda saltarse sus permisos manipulando el frontend.
- Notificaciones que no lleguen, o que lleguen tantas veces que se ignoren.

## 3. Restricciones y stack (decidido por el usuario)

| Capa | Elección |
|---|---|
| Frontend | Angular (versión estable actual), SPA sin SSR, standalone components y signals |
| Backend | Supabase: Postgres, Auth, Row Level Security, funciones SQL (RPC), Edge Functions |
| Notificaciones | Web Push del navegador; la aplicación es una PWA instalable |
| Hosting | Cloudflare (Workers con static assets, o Pages), conectado al repositorio de GitHub del desarrollador |
| Cuentas | Repositorio y Cloudflare a nombre del desarrollador; proyecto de Supabase en una organización del negocio, con el desarrollador como miembro |
| Coste | Todo en planes gratuitos |

No hay backend propio: el frontend habla directamente con Supabase, y la seguridad la imponen RLS y las funciones SQL. El único código de servidor son funciones SQL y Edge Functions.

## 4. Modelo de dominio

### Localización
- Nombre y tipo visual (almacén o vehículo). El tipo solo cambia el icono; todas las localizaciones se comportan igual.
- Estados: activa o deshabilitada.
- **Deshabilitar** solo es posible si su stock es cero. Una localización deshabilitada no aparece para operar, pero su historial sigue consultable.
- **Eliminar** solo es posible si nunca ha participado en una operación.

### Tipo de artículo
- Una lista que gestiona el administrador (por ejemplo "Fontanería", "Electricidad"), no texto libre.
- Se deshabilita si algún artículo lo usa; se elimina si ninguno lo usa.

### Artículo
- Nombre (obligatorio), tipo (obligatorio) y referencia (opcional).
- Catálogo único compartido; la cantidad se lleva por localización.
- Nombre único sin distinguir mayúsculas ni acentos entre artículos activos.
- **Deshabilitar** solo si su stock es cero en todas las localizaciones. **Eliminar** solo si nunca ha participado en una operación.
- Se puede dar de alta sin salir del formulario de "Añadir".
- Crear artículos lo puede hacer cualquier usuario desde "Añadir". Editar, deshabilitar o eliminar artículos y tipos es solo del administrador.

### Stock
- Cantidad entera mayor o igual que cero por cada par (artículo, localización).
- Nunca se modifica directamente: solo cambia como resultado de una operación.

### Operación
Toda modificación de stock es una operación con cabecera y una o varias líneas.

**Cabecera:** tipo, origen, destino, referencia, notas, usuario y fecha/hora (estos dos últimos automáticos).
**Línea:** artículo y cantidad (entero mayor que cero). Un mismo artículo no puede repetirse en la misma operación.

| Tipo | Origen | Destino | Referencia | Notas |
|---|---|---|---|---|
| Añadir | — | localización actual | — | opcional |
| Mover | otra localización (una sola por operación) | localización actual | — | opcional |
| Eliminar (baja) | localización actual | — | — | opcional |
| Registrar salida (trabajo) | localización actual | — | opcional | opcional |

Reglas:
- La operación es **atómica**: o se aplican todas las líneas o ninguna. Se implementa como una única función SQL.
- Si una línea dejaría stock negativo, la operación entera se rechaza e indica qué artículos fallan.
- Dos operaciones simultáneas sobre el mismo stock no pueden producir un resultado incorrecto (bloqueo de filas o equivalente).
- Las operaciones **nunca se editan ni se borran**. Un error se corrige con una operación nueva (por ejemplo, "Añadir" o "Eliminar" con una nota explicativa); no hay un tipo "ajuste" aparte.
- Todas las acciones están disponibles en cualquier localización, incluido "Registrar salida" en el taller.
- No se puede operar con localizaciones ni artículos deshabilitados.

## 5. Usuarios y permisos

### Roles
- **Administrador:** puede hacer todo en todas las localizaciones y además gestiona usuarios, permisos, localizaciones, artículos, tipos y reglas de aviso. El modelo admite más de un administrador, aunque al principio habrá uno.
- **Usuario:** opera solo en las localizaciones donde tiene permiso.

### Permisos
- Un permiso es "este usuario puede operar en esta localización". No se distinguen acciones: quien tiene permiso puede hacer las cuatro.
- Para **Mover** basta con tener permiso en la localización de **destino**; no hace falta permiso en el origen.
- Cualquier usuario puede *leer* el stock de todas las localizaciones activas. Es necesario para elegir qué traer al mover y sirve para saber dónde hay material. Solo puede *operar* donde tiene permiso.
- Cualquier usuario puede consultar el historial completo. Con un equipo pequeño la transparencia es útil, y el historial no contiene datos sensibles.
- Todo esto se impone en la base de datos (RLS y comprobaciones dentro de las funciones SQL), no solo en el frontend.

### Invitaciones y ciclo de vida
- El administrador invita indicando el email, el nombre visible y los permisos iniciales (localizaciones y rol).
- **La aplicación no envía emails** (decisión del usuario). El servicio de email gratuito de Supabase solo entrega a miembros de la organización. En su lugar:
  - Al invitar, la aplicación genera un **enlace de acceso** y se lo muestra al administrador con un botón de copiar y otro de compartir (Web Share API en móvil). El administrador lo envía por WhatsApp u otro medio.
  - Al abrir el enlace, el invitado entra en una pantalla para crear su contraseña.
  - **Recuperar la contraseña** funciona igual: el administrador genera un enlace nuevo para ese usuario desde la administración. La pantalla de login no tiene "¿Olvidaste tu contraseña?"; muestra un texto indicando que se pida un enlace al administrador.
  - El enlace caduca: se usa la caducidad de Supabase Auth, y la aplicación debe indicarlo al administrador. Si caduca, el administrador genera otro.
  - Generar enlaces necesita la clave de servicio, así que se hace en una Edge Function que comprueba que quien llama es administrador (`auth.admin.generateLink` o equivalente).
- El administrador puede cambiar los permisos y el rol de cualquier usuario en cualquier momento.
- El administrador puede **desactivar** a un usuario. Ya no puede entrar, pero su nombre sigue apareciendo en el historial. Los usuarios no se borran.
- El primer administrador se crea a mano al desplegar (seed o script documentado).
- Cada usuario tiene un nombre visible que se muestra en el historial.

## 6. Avisos de stock

### Reglas
Las reglas se gestionan en una vista propia, solo para el administrador: crear, editar, duplicar, deshabilitar y eliminar.

Cada regla define:
- **Artículos:** uno, varios o *todos*. "Todos" incluye los artículos que se den de alta después.
- **Localizaciones:** una, varias o *todas*. "Todas" incluye las que se creen después.
- **Nivel leve:** opcional, con un umbral.
- **Nivel grave:** opcional, con un umbral.
- Al menos un nivel es obligatorio. Si hay dos, el umbral grave tiene que ser menor que el leve.
- Un nombre descriptivo.

**Interpretación de los umbrales:** un nivel está activo cuando `cantidad <= umbral`. Ejemplo: leve 5 y grave 2. Con 5, 4 o 3 hay aviso leve; con 2, 1 o 0, grave.

**Reglas solapadas:** si varias reglas activas cubren el mismo artículo en la misma localización, gana el umbral más exigente (el más alto) en cada nivel.

**Artículos sin stock:** un artículo que nunca ha tenido stock en una localización cuenta como cantidad 0 en esa localización. Así, una regla de "todos los artículos" en una furgoneta avisa de lo que falta allí.

Esta última decisión puede generar muchos avisos si el catálogo es grande. Es el principal punto a vigilar en el uso real.

### Nivel leve
- Se muestra solo dentro de la aplicación: un aviso en la página de la localización afectada y en una lista general de avisos activos.
- Se calcula en el momento comparando las reglas con el stock actual; no envía nada.

### Nivel grave
- Se muestra en la aplicación igual que el leve, pero destacado, y además envía una **notificación push**.
- **Cuándo se notifica:**
  1. Cuando una operación hace que la cantidad baje hasta el umbral grave o por debajo.
  2. **De nuevo en cada operación posterior que reduzca todavía más la cantidad** mientras siga en nivel grave.
  3. Si la cantidad sube o se queda igual, no se notifica.
  4. Cuando se repone por encima del umbral grave, el estado se reinicia y la próxima bajada vuelve al punto 1.
- **Destinatarios:** todos los administradores y los usuarios con permiso en esa localización, en todos sus dispositivos suscritos.
- **Contenido:** artículo, localización, cantidad actual y umbral. Al pulsar la notificación se abre la página de esa localización.
- Para no enviar varias notificaciones por una misma operación, se agrupan las alertas graves que provoca cada operación: una notificación por destinatario y operación, con un resumen si hay varios artículos.
- El envío no puede retrasar ni hacer fallar la operación. Si el push falla, la operación queda guardada igualmente.
- Crear o editar una regla no envía notificaciones de forma retroactiva; solo lo hacen las operaciones. La aplicación sí muestra enseguida los avisos que resulten de la regla nueva.

### Avisos globales (total de todas las localizaciones)

**Para qué:** saber cuándo hay que pedir material al proveedor. Lo que importa es cuánto queda en total, aunque esté repartido entre el almacén y las furgonetas.

**Reglas globales:**
- Al crear o editar una regla, el administrador elige su **alcance**: *por localización* (las reglas descritas arriba) o *global*.
- Una regla global define artículos (uno, varios o *todos*), nivel leve, nivel grave y nombre, con las mismas condiciones que una regla por localización. No tiene localizaciones.
- La regla compara los umbrales con el **total** del artículo: la suma de su stock en todas las localizaciones activas. Un artículo sin stock en ninguna tiene total 0.
- Los umbrales, las reglas solapadas entre reglas globales (gana el umbral más alto en cada nivel), duplicar, deshabilitar y eliminar funcionan igual que en las reglas por localización.
- Las reglas globales y las reglas por localización son independientes: una no tapa ni modifica a la otra.
- Solo cuentan los artículos activos.
- La lista de reglas de la administración indica el alcance de cada regla.
- Si al editar una regla se cambia su alcance de por localización a global, se descartan las localizaciones que tenía guardadas (decisión de diseño, no del usuario).

**Dónde se ven** (todos los usuarios activos, no solo los administradores):
- En la pantalla de **Stock global** (sección 8, punto 4): el total del artículo se colorea en rojo si tiene aviso global grave y en naranja si es leve. El color va acompañado de un texto accesible con el nivel y el umbral (por ejemplo, un `title` o un `aria-label`).
- Un botón **«Solo con aviso (N)»** junto a los filtros deja en la tabla solo los artículos con aviso global. Se combina con la búsqueda y el filtro por tipo. N es el total de artículos con aviso global, el mismo número del icono, sin descontar los que oculten la búsqueda o el filtro (decisión de diseño). Si no hay ningún aviso global, el botón no aparece.
- El enlace de **Stock** en la navegación (barra inferior en móvil, menú lateral en ordenador) muestra un número con los artículos que tienen aviso global: rojo si alguno es grave y naranja si todos son leves. Si no hay ninguno, no se muestra.
- El número se calcula al abrir la aplicación, al entrar en Stock y después de cada operación del propio usuario. No hace falta que se actualice en tiempo real con las operaciones de los demás.
- Los avisos globales **no** aparecen en Inicio ni en la página de una localización, y **no envían notificaciones push**, ni siquiera los graves.

### Suscripciones push
- Cada usuario activa las notificaciones desde su perfil, una vez por dispositivo, y puede tener varios dispositivos.
- Puede desactivarlas por dispositivo. Las suscripciones caducadas o rechazadas por el servicio de push se eliminan automáticamente.
- En iPhone solo funciona con la PWA instalada en la pantalla de inicio (iOS 16.4 o posterior). La aplicación debe explicarlo cuando detecte iOS sin instalar.

## 7. Historial

- Una lista de **operaciones**, de la más reciente a la más antigua, con paginación.
- **Filtros:** tipo, origen, destino, artículo, usuario, rango de fechas y referencia. Para localizaciones, se puede buscar por "origen o destino".
- Al abrir una operación se ven la cabecera completa y todas sus líneas.
- Desde la página de un artículo o de una localización se puede abrir el historial ya filtrado por ellos.
- Las fechas se muestran en la zona horaria Europe/Madrid.
- El historial muestra los nombres **actuales** de artículos, localizaciones y usuarios. Renombrar se entiende como corregir un nombre. Lo que es inalterable son las cantidades, los movimientos, el autor y la fecha.

## 8. Pantallas

La interfaz se adapta al tamaño de pantalla, no al tipo de dispositivo (con `BreakpointObserver` de Angular CDK). En móvil puede usar componentes distintos, no solo una recolocación de los mismos.

1. **Login** y pantalla de **crear o cambiar contraseña**, a la que se llega desde un enlace de invitación o de recuperación.
2. **Inicio:** las localizaciones donde el usuario tiene permiso, con el número de avisos activos de cada una, y la lista de avisos activos **de esas localizaciones**. El administrador ve todas. El stock de las demás localizaciones solo se consulta en "Stock global".
3. **Página de localización:**
   - Stock actual con búsqueda y filtro por tipo, y los avisos de esa localización.
   - Botones **Añadir**, **Mover aquí**, **Eliminar** y **Registrar salida**.
   - Cada uno abre un formulario multi-artículo: buscar artículo, indicar cantidad, añadir más líneas, y los campos de referencia o notas que tocan.
   - En "Eliminar" y "Registrar salida" solo se pueden elegir artículos con stock en la localización, y se muestra la cantidad disponible.
   - En "Mover aquí" primero se elige el origen y después artículos con stock en ese origen.
   - En "Añadir" se puede crear un artículo nuevo sin salir del formulario.
   - Las localizaciones sin permiso no se pueden abrir para operar.
4. **Stock global (solo lectura):** cada artículo con una columna **Total** (la suma de todas las localizaciones activas) y su cantidad en cada localización activa. En ordenador la columna Total va después de Tipo, y en móvil, después del nombre del artículo, siempre antes de las localizaciones. Muestra los avisos globales (sección 6, «Avisos globales»).
5. **Historial** (sección 7).
6. **Administración** (solo administradores): usuarios e invitaciones, localizaciones, artículos, tipos de artículo, reglas de aviso e **importación de artículos** desde una plantilla Excel (sección 8.1).
7. **Perfil:** nombre visible, cambio de contraseña y activación de notificaciones en el dispositivo.

Orientación por tamaño de pantalla:

| | Móvil | Ordenador |
|---|---|---|
| Navegación | barra inferior o menú desplegable | menú lateral fijo |
| Stock | tarjetas, buscador arriba | tabla con columnas, filtros y orden |
| Formularios de operación | pantalla completa, botones grandes, por pasos si conviene | diálogo o panel en una sola vista |
| Historial | lista resumida | tabla con todos los filtros |

### 8.1 Importación de artículos

**Para qué:** dar de alta muchos artículos de una vez (la carga inicial del catálogo y, más adelante, tandas grandes de artículos nuevos) sin crearlos uno a uno. No existe un formato previo: el formato lo define la propia aplicación con una plantilla.

**Alcance:** la importación **solo crea artículos** (nombre, tipo y referencia). **No mueve stock**: las cantidades se registran después con operaciones normales desde cada localización. Solo la usan los administradores.

**Dónde:** en Administración → Artículos, junto a «Nuevo artículo», dos acciones: **Descargar plantilla** e **Importar**. Está disponible siempre, no solo la primera vez.

**Plantilla (.xlsx):**
- La genera la aplicación en el navegador en el momento de descargarla. Decisión de diseño: con **ExcelJS**, que admite listas desplegables y estilos.
- Hoja **«Artículos»** con tres columnas en este orden: **Nombre** (obligatoria), **Tipo** (obligatoria) y **Referencia** (opcional). Cabecera destacada y fija al desplazarse, y columnas con un ancho cómodo de leer.
- La columna Tipo es una **lista desplegable** con los tipos de artículo **activos** en el momento de la descarga.
- Hoja **«Instrucciones»** breve: qué es obligatorio, que los tipos salen de la lista, que los artículos que ya existan se saltan y que la importación no carga cantidades.
- Nombre del archivo: `plantilla-articulos.xlsx`.

**Importar:**
- Solo se aceptan archivos **.xlsx** (decisión de diseño: el formato es nuestro, así que no hace falta CSV). Se lee la hoja «Artículos» en el navegador, sin subir el archivo a ningún servidor, buscando las columnas por el texto de su cabecera.
- Se quitan los espacios sobrantes y se ignoran las filas vacías. Como máximo **2000 filas** con datos por archivo (decisión de diseño); un archivo con más se rechaza entero, sin vista previa.
- Los tipos se reconocen sin distinguir mayúsculas.
- Antes de importar se muestra una **vista previa** con una fila por artículo y su estado:
  - **Nuevo:** se creará.
  - **Ya existe:** ya hay un artículo activo con ese nombre (sin distinguir mayúsculas ni acentos). Se salta y el artículo existente no se modifica. Un artículo **deshabilitado** con el mismo nombre no cuenta: la fila sale como «Nuevo», igual que al crear un artículo a mano (decisión de diseño).
  - **Error:** nombre vacío, tipo vacío, tipo que no existe o está deshabilitado, o nombre repetido dentro del propio archivo. Se indica el motivo.
- Mientras haya alguna fila con **Error** no se puede importar: se corrige el archivo y se vuelve a cargar (decisión de diseño). Las filas «Ya existe» no bloquean.
- Al confirmar, todos los artículos nuevos se crean **en una sola transacción**: o se crean todos o ninguno. Si entretanto alguien ha creado uno con el mismo nombre, ese se cuenta como «ya existía» en vez de fallar. Si entretanto se ha deshabilitado o borrado alguno de los tipos, la importación entera falla con un mensaje claro y no se crea nada (decisión de diseño).
- Al terminar se muestra un resumen, por ejemplo: «Creados 37 · Ya existían 3».
- Si el archivo no es un .xlsx válido o le falta la hoja o alguna cabecera obligatoria, se muestra un error claro y no aparece vista previa.

## 9. Despliegue y entornos

- Repositorio en el GitHub del desarrollador. Cada push a `main` despliega en Cloudflare.
- **Cómo se despliega** (decisión del desarrollador: integración Git de Cloudflare, Workers Builds, en vez de GitHub Actions):
  - Un Worker con static assets, sin código de Worker, definido en `wrangler.jsonc` en la raíz. Sirve `dist/stocka2/browser` con `not_found_handling: "single-page-application"`, de modo que `/acceso?t=…` y la recarga de cualquier ruta cargan la app.
  - Comando de build en Cloudflare: `pnpm test --watch=false && node scripts/set-env.mjs && pnpm build`. Las pruebas van dentro del build: si fallan, no se publica nada. Comando de deploy: `npx wrangler deploy`.
  - Variables de build en el panel de Cloudflare: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `VAPID_PUBLIC_KEY`. `scripts/set-env.mjs` las escribe en `src/environments/environment.ts` **antes** del build (sustituirlas después rompería los hashes de `ngsw.json` y el service worker no se actualizaría). Si falta alguna, o el archivo ya no tiene los marcadores, el script falla y el build también.
  - `public/_headers`: `no-cache` para `index.html`, `ngsw.json`, `ngsw-worker.js` y `manifest.webmanifest`, para que las versiones nuevas lleguen; caché larga e `immutable` para los archivos con hash.
  - Dominio: el `*.workers.dev` que asigna Cloudflare. Un dominio propio queda documentado como paso opcional, sin configurar.
  - Node 24 y pnpm 11 en la imagen de build: si no vienen por defecto, se fijan con las variables `NODE_VERSION` y `PNPM_VERSION`.
  - Volver a una versión anterior se hace desde el panel de Cloudflare (versiones del Worker).
- No hay previews por rama ni entorno de staging. El plan gratuito de Supabase solo da un proyecto útil, y una preview apuntando a producción dejaría operaciones de prueba en un historial que no se puede borrar. Las pruebas se hacen en local con Supabase CLI.
- Las migraciones se aplican a producción a mano desde la máquina del desarrollador (`supabase db push`), no desde CI.
- Supabase: el esquema, las políticas RLS, las funciones SQL y las Edge Functions viven en el repositorio como migraciones (Supabase CLI) y se aplican desde ahí, no editando a mano en el panel.
- Desarrollo local con Supabase CLI (contenedores locales).
- Variables públicas del frontend: URL de Supabase y clave `anon`. Los secretos (clave de servicio, claves VAPID privadas) solo viven en Supabase.
- Hay que documentar (en `docs/deployment.md`, enlazado desde el README) la configuración inicial, incluida la de Cloudflare: crear proyectos, variables, primer administrador, claves VAPID y URLs de redirección de Supabase Auth para los enlaces de acceso.

## 10. Lo que queda a criterio de quien construya

- La librería de componentes. Angular Material es la opción por defecto por su coherencia con CDK; PrimeNG es aceptable.
- El esquema SQL concreto, los nombres de tablas y columnas, y cómo se implementan los bloqueos.
- Cómo se dispara el envío push desde la base de datos (por ejemplo, `pg_net` o un database webhook hacia una Edge Function) y qué librería Web Push compatible con Deno se usa.
- La herramienta de tests y el nivel de cobertura. Son obligatorias las pruebas de las funciones SQL de operaciones (atomicidad, stock negativo) y de las políticas RLS (un usuario no puede operar donde no tiene permiso).
- El diseño visual detallado, siempre que se respete la sencillez para usuarios no técnicos.
- Gestión de estado: signals, y RxJS solo donde haga falta (tiempo real, flujos de eventos).
- Si se usa Supabase Realtime para refrescar el stock en vivo (deseable, no obligatorio).
