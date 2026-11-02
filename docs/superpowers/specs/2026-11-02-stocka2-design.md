# stocka2 — Documento de diseño

Fecha: 2026-11-02
Estado: aprobado

Las decisiones marcadas como **[decisión de Claude]** no las tomó el usuario; son valores por defecto razonables que el usuario puede revisar.

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
- Nombre y tipo visual (almacén o vehículo) **[decisión de Claude]**. El tipo solo cambia el icono; todas las localizaciones se comportan igual.
- Estados: activa o deshabilitada.
- **Deshabilitar** solo es posible si su stock es cero **[decisión de Claude]**. Una localización deshabilitada no aparece para operar, pero su historial sigue consultable.
- **Eliminar** solo es posible si nunca ha participado en una operación.

### Tipo de artículo
- Una lista que gestiona el administrador (por ejemplo "Fontanería", "Electricidad"), no texto libre **[decisión de Claude]**.
- Se deshabilita si algún artículo lo usa; se elimina si ninguno lo usa.

### Artículo
- Nombre (obligatorio), tipo (obligatorio) y referencia (opcional).
- Catálogo único compartido; la cantidad se lleva por localización.
- Nombre único sin distinguir mayúsculas ni acentos entre artículos activos **[decisión de Claude]**.
- **Deshabilitar** solo si su stock es cero en todas las localizaciones **[decisión de Claude]**. **Eliminar** solo si nunca ha participado en una operación.
- Se puede dar de alta sin salir del formulario de "Añadir".
- **[decisión de Claude]** Crear artículos lo puede hacer cualquier usuario desde "Añadir". Editar, deshabilitar o eliminar artículos y tipos es solo del administrador.

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
- Las operaciones **nunca se editan ni se borran**. Un error se corrige con una operación nueva (por ejemplo, "Añadir" o "Eliminar" con una nota explicativa) **[decisión de Claude: no hay tipo "ajuste" aparte]**.
- Todas las acciones están disponibles en cualquier localización, incluido "Registrar salida" en el taller.
- No se puede operar con localizaciones ni artículos deshabilitados.

## 5. Usuarios y permisos

### Roles
- **Administrador:** puede hacer todo en todas las localizaciones y además gestiona usuarios, permisos, localizaciones, artículos, tipos y reglas de aviso. **[decisión de Claude]** El modelo admite más de un administrador, aunque al principio habrá uno.
- **Usuario:** opera solo en las localizaciones donde tiene permiso.

### Permisos
- Un permiso es "este usuario puede operar en esta localización". No se distinguen acciones: quien tiene permiso puede hacer las cuatro.
- Para **Mover** basta con tener permiso en la localización de **destino**; no hace falta permiso en el origen.
- **[decisión de Claude]** Cualquier usuario puede *leer* el stock de todas las localizaciones activas. Es necesario para elegir qué traer al mover y sirve para saber dónde hay material. Solo puede *operar* donde tiene permiso.
- **[decisión de Claude]** Cualquier usuario puede consultar el historial completo. Con un equipo pequeño la transparencia es útil, y el historial no contiene datos sensibles.
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
- **[decisión de Claude]** El primer administrador se crea a mano al desplegar (seed o script documentado).
- Cada usuario tiene un nombre visible que se muestra en el historial.

## 6. Avisos de stock

### Reglas
Las reglas se gestionan en una vista propia, solo para el administrador **[decisión de Claude]**: crear, editar, duplicar, deshabilitar y eliminar.

Cada regla define:
- **Artículos:** uno, varios o *todos*. "Todos" incluye los artículos que se den de alta después.
- **Localizaciones:** una, varias o *todas*. "Todas" incluye las que se creen después.
- **Nivel leve:** opcional, con un umbral.
- **Nivel grave:** opcional, con un umbral.
- Al menos un nivel es obligatorio. Si hay dos, el umbral grave tiene que ser menor que el leve.
- Un nombre descriptivo **[decisión de Claude]**.

**Interpretación de los umbrales [decisión de Claude]:** un nivel está activo cuando `cantidad <= umbral`. Ejemplo: leve 5 y grave 2. Con 5, 4 o 3 hay aviso leve; con 2, 1 o 0, grave.

**Reglas solapadas:** si varias reglas activas cubren el mismo artículo en la misma localización, gana el umbral más exigente (el más alto) en cada nivel **[decisión de Claude]**.

**Artículos sin stock:** un artículo que nunca ha tenido stock en una localización cuenta como cantidad 0 en esa localización. Así, una regla de "todos los artículos" en una furgoneta avisa de lo que falta allí **[decisión de Claude]**.

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
- Para no enviar varias notificaciones por una misma operación, se agrupan las alertas graves que provoca cada operación **[decisión de Claude]**: una notificación por destinatario y operación, con un resumen si hay varios artículos.
- El envío no puede retrasar ni hacer fallar la operación. Si el push falla, la operación queda guardada igualmente.
- Crear o editar una regla no envía notificaciones de forma retroactiva **[decisión de Claude]**; solo lo hacen las operaciones. La aplicación sí muestra enseguida los avisos que resulten de la regla nueva.

### Suscripciones push
- Cada usuario activa las notificaciones desde su perfil, una vez por dispositivo, y puede tener varios dispositivos.
- Puede desactivarlas por dispositivo. Las suscripciones caducadas o rechazadas por el servicio de push se eliminan automáticamente.
- En iPhone solo funciona con la PWA instalada en la pantalla de inicio (iOS 16.4 o posterior). La aplicación debe explicarlo cuando detecte iOS sin instalar.

## 7. Historial

- Una lista de **operaciones**, de la más reciente a la más antigua, con paginación.
- **Filtros:** tipo, origen, destino, artículo, usuario, rango de fechas y referencia. Para localizaciones, se puede buscar por "origen o destino".
- Al abrir una operación se ven la cabecera completa y todas sus líneas.
- **[decisión de Claude]** Desde la página de un artículo o de una localización se puede abrir el historial ya filtrado por ellos.
- Las fechas se muestran en la zona horaria Europe/Madrid.
- **[decisión de Claude]** El historial muestra los nombres **actuales** de artículos, localizaciones y usuarios. Renombrar se entiende como corregir un nombre. Lo que es inalterable son las cantidades, los movimientos, el autor y la fecha.

## 8. Pantallas

La interfaz se adapta al tamaño de pantalla, no al tipo de dispositivo (con `BreakpointObserver` de Angular CDK). En móvil puede usar componentes distintos, no solo una recolocación de los mismos.

1. **Login** y pantalla de **crear o cambiar contraseña**, a la que se llega desde un enlace de invitación o de recuperación.
2. **Inicio:** las localizaciones donde el usuario tiene permiso, con el número de avisos activos de cada una, y la lista de avisos activos **de esas localizaciones** **[decisión de Claude]**. El administrador ve todas. El stock de las demás localizaciones solo se consulta en "Stock global".
3. **Página de localización:**
   - Stock actual con búsqueda y filtro por tipo, y los avisos de esa localización.
   - Botones **Añadir**, **Mover aquí**, **Eliminar** y **Registrar salida**.
   - Cada uno abre un formulario multi-artículo: buscar artículo, indicar cantidad, añadir más líneas, y los campos de referencia o notas que tocan.
   - En "Eliminar" y "Registrar salida" solo se pueden elegir artículos con stock en la localización, y se muestra la cantidad disponible.
   - En "Mover aquí" primero se elige el origen y después artículos con stock en ese origen.
   - En "Añadir" se puede crear un artículo nuevo sin salir del formulario.
   - Las localizaciones sin permiso no se pueden abrir para operar.
4. **Stock global (solo lectura):** cada artículo con su cantidad en cada localización activa **[decisión de Claude]**.
5. **Historial** (sección 7).
6. **Administración** (solo administradores): usuarios e invitaciones, localizaciones, artículos, tipos de artículo, reglas de aviso e **importación inicial** (sección 8.1).
7. **Perfil:** nombre visible, cambio de contraseña y activación de notificaciones en el dispositivo.

Orientación por tamaño de pantalla **[decisión de Claude]**:

| | Móvil | Ordenador |
|---|---|---|
| Navegación | barra inferior o menú desplegable | menú lateral fijo |
| Stock | tarjetas, buscador arriba | tabla con columnas, filtros y orden |
| Formularios de operación | pantalla completa, botones grandes, por pasos si conviene | diálogo o panel en una sola vista |
| Historial | lista resumida | tabla con todos los filtros |

### 8.1 Importación de inventario

Habrá una carga inicial de inventario (decisión del usuario), pero todavía no se sabe si vendrá en CSV o en Excel.

- Admite **CSV y Excel (.xlsx)**. El archivo se lee en el navegador (por ejemplo con SheetJS), sin subirlo a ningún servidor.
- **[decisión de Claude]** Formato esperado: una fila por artículo y localización, con las columnas `nombre`, `tipo`, `referencia` (opcional), `localizacion` y `cantidad`. La aplicación ofrece una plantilla descargable con ese formato. Si el archivo real tiene otras columnas, se adapta antes de importar.
- Antes de importar se muestra una **vista previa** con los errores por fila (localización inexistente, cantidad no válida, filas duplicadas). No se importa nada hasta que no haya errores y el administrador confirme.
- Los tipos de artículo y los artículos que no existan se crean. Las localizaciones tienen que existir de antemano.
- El stock entra como operaciones **"Añadir" normales**, una por localización, con una nota del tipo "Importación inicial (archivo X)". Así el historial queda completo y no se salta ninguna regla.
- **[decisión de Claude]** La importación está disponible siempre en la administración, no solo la primera vez. Sirve también para entradas grandes de material.

## 9. Despliegue y entornos

- Repositorio en el GitHub del desarrollador. Cada push a `main` despliega en Cloudflare.
- **[decisión de Claude]** No hay previews por rama ni entorno de staging. El plan gratuito de Supabase solo da un proyecto útil, y una preview apuntando a producción dejaría operaciones de prueba en un historial que no se puede borrar. Las pruebas se hacen en local con Supabase CLI.
- **[decisión de Claude]** Las migraciones se aplican a producción a mano desde la máquina del desarrollador (`supabase db push`), no desde CI.
- Supabase: el esquema, las políticas RLS, las funciones SQL y las Edge Functions viven en el repositorio como migraciones (Supabase CLI) y se aplican desde ahí, no editando a mano en el panel.
- Desarrollo local con Supabase CLI (contenedores locales) **[decisión de Claude]**.
- Variables públicas del frontend: URL de Supabase y clave `anon`. Los secretos (clave de servicio, claves VAPID privadas) solo viven en Supabase.
- Hay que documentar en el README la configuración inicial: crear proyectos, variables, primer administrador, claves VAPID y URLs de redirección de Supabase Auth para los enlaces de acceso.

## 10. Lo que queda a criterio de quien construya

- La librería de componentes. Angular Material es la opción por defecto por su coherencia con CDK; PrimeNG es aceptable.
- El esquema SQL concreto, los nombres de tablas y columnas, y cómo se implementan los bloqueos.
- Cómo se dispara el envío push desde la base de datos (por ejemplo, `pg_net` o un database webhook hacia una Edge Function) y qué librería Web Push compatible con Deno se usa.
- La herramienta de tests y el nivel de cobertura. Son obligatorias las pruebas de las funciones SQL de operaciones (atomicidad, stock negativo) y de las políticas RLS (un usuario no puede operar donde no tiene permiso).
- El diseño visual detallado, siempre que se respete la sencillez para usuarios no técnicos.
- Gestión de estado: signals, y RxJS solo donde haga falta (tiempo real, flujos de eventos).
- Si se usa Supabase Realtime para refrescar el stock en vivo (deseable, no obligatorio).
