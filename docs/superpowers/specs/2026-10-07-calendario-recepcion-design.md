# Calendario de recepción: rediseño — diseño aprobado

Fecha: 2026-10-07. Diseño aprobado por el dueño en la conversación de brainstorming,
sección por sección. Mockups navegables (lienzo privado del dueño):
https://claude.ai/artifact/HfZgL5thJfZUUT5QuD1SnR

## Objetivo

Que recepción, desde la compu del mostrador, pueda en pocos clics:

1. Ver la semana como agenda por horas y leer de un vistazo qué tan llena está cada clase
   y quién viene de cada plataforma.
2. Cambiar una clase o muchas a la vez: coach, cupo por plataforma, hora o tipo, y
   cancelar, viendo antes qué les pasa a las alumnas y a TotalPass.
3. Inscribir a una alumna sabiendo antes si tiene créditos, y venderle paquete ahí mismo
   si no tiene.
4. Registrar a una alumna nueva desde la clase, cobrarle, inscribirla y mandarle su
   acceso a la app por WhatsApp.
5. Ver el logo oficial de cada plataforma (TotalPass hoy, Fitpass después) en lugar de
   su nombre escrito.

## Decisiones del dueño

| Tema | Decisión |
| --- | --- |
| Quién y dónde | Recepción en compu, con mouse. El móvil no se rompe pero no es el foco. |
| Vista | **A · Semana por horas**. La vista de lista (B) queda fuera de alcance. |
| Cambios en bloque | Los cuatro: coach, cupo por plataforma, mover hora o cambiar tipo, cancelar. |
| Sin créditos | Vender paquete en el mismo panel y luego inscribir. |
| Acceso de alumna nueva | Link por WhatsApp para crear contraseña (sin API de WhatsApp). |
| Correo de alumna nueva | **Obligatorio**: el inicio de sesión sigue siendo correo + contraseña. |
| Fitpass | El calendario queda listo para varios canales; la conexión real con Fitpass es otro proyecto. |
| Arrastrar para mover | No. Mover siempre pasa por un botón con vista previa, porque mover la hora en TotalPass le quita el lugar a las socias. |
| "Limpiar semana" | Desaparece. Se reemplaza por seleccionar la semana y cancelar en bloque. |
| Orden | Seguridad primero, luego entregas 1 → 5, cada una con su rama y su PR. |
| Repo | Clon limpio en `~/Desktop/Casa She/casa-she-calendario` (el clon viejo tiene un paquete de git dañado por iCloud). |

## Reglas que aplican a todo

- **Nunca borrar clases; cancelarlas.** `partner_class_mappings.class_id` es `ON DELETE CASCADE`:
  borrar deja la clase viva y reservable en TotalPass. Toda baja pasa por
  `cancelClassWithRefunds` + `dispararRetiroTotalpass()`.
- **Fechas en hora de CDMX** (`cdmxToday()` y los formateadores de zona horaria del backend), nunca `new Date()` del servidor.
- **TotalPass:** cambiar tipo o coach es "editar" (la socia conserva su lugar); cambiar fecha u
  hora es "mover" (`decidirResync` en `backend/src/lib/totalpass/resync.ts`): se borra y se
  republica, y las socias pierden su lugar. Toda pantalla que permita mover lo avisa antes.
- **Respetar lo que ya existe en el panel y la tarjeta:** intensidad por sesión
  (`ClassIntensity`), invitadas acompañantes (`CompanionPanel`, `CompanionReview`), límite de
  una clase al día en membresías ilimitadas (`assertMembershipDailyLimit`), lista de espera,
  check-in, cupo cerrado, clase gratis.
- **Permisos:** los mismos de hoy. El calendario sigue montado en `/admin/calendar` y en
  `/reception/calendario` (modo `embedded`). Las acciones que hoy exigen `requireElevated`
  siguen exigiéndolo; recepción sigue limitada a su sucursal.
- **Tipografía:** se usan las fuentes de la app (`font-heading`, `font-body`). Los mockups usan
  Instrument Sans solo como referencia; no se agrega fuente nueva.
- **Colores:** tokens `casa-*` del sistema visual. El color de cada plataforma se usa solo en
  su logo y en sus puntos de lugar, nunca como color de texto.
- **Lugares en la tarjeta:** `current_bookings` cuenta a todas las inscritas de todos los canales
  (trigger `update_class_booking_count`). Alumnas de Casa Shé = `current_bookings` − Σ
  `booked` de los canales. Cada canal pinta sus puntos con su color; los libres van huecos.

---

## Entrega 0 — Seguridad: un link no es una sesión

**Problema (verificado en `main`):** `authenticate()` en `backend/src/middleware/auth.ts` acepta
cualquier JWT firmado con `JWT_SECRET`. El token de "olvidé mi contraseña"
(`generateResetToken`, `{ userId, purpose: 'reset' }`, 1 h) trae `userId`, así que sirve como
sesión iniciada durante una hora.

**Cambio:** `authenticate()` y `optionalAuth()` rechazan con 401 cualquier token que traiga
`purpose` (de cualquier valor) o que no traiga `userId`. Los tokens de sesión no llevan
`purpose`, así que nada legítimo se rompe.

**Prueba:** `backend/scripts/test-auth-token-purpose.ts` (patrón del repo: `tsx` + `node:assert`):
un token de reset contra una ruta protegida → 401; un token de magic-link → 401; un token de
sesión normal → pasa. Se agrega a `npm test`.

**PR propio y chico**, antes que todo lo demás.

---

## Entrega 1 — Logos de canales

### Archivos de marca

- `frontend/public/brands/totalpass-claro.svg` y `totalpass-oscuro.svg`: vectorial oficial
  tomado de totalpass.com (`TOTAL` verde `#26D07C`; `PASS` negro en el claro, blanco en el oscuro).
- `frontend/public/brands/fitpass.png`: imagen oficial de fitpass.com (degradado
  `#72C9D5` → `#537AD1`). Se pide el vectorial a Fitpass cuando se conecte.

### Catálogo de canales

`frontend/src/lib/canales.ts` exporta `CANALES`, indexado por el mismo valor que usa la base
de datos en `bookings.channel` / `channel_inventory.channel`:

| clave | nombre | punto | anillo | logo claro | logo oscuro | conectado |
| --- | --- | --- | --- | --- | --- | --- |
| `totalpass` | TotalPass | `#26D07C` | `#0F7A45` | `totalpass-claro.svg` | `totalpass-oscuro.svg` | sí |
| `fitpass` | Fitpass | `#5A8AD0` | `#2F5BA8` | `fitpass.png` | `fitpass.png` sobre pastilla clara | no |

`wellhub` existe en los CHECK de la base, pero no entra al catálogo hasta que haya trato.
Helpers: `canalDePlan(nombrePlan)` detecta un canal en el nombre de un plan (hoy el plan
interno se llama "Totalpass") y `canalesConectados()`.

### Componente

`frontend/src/components/brands/ChannelLogo.tsx`: `{ canal, fondo: 'claro' | 'oscuro', alto?: number }`,
`alt` = nombre del canal, alto mínimo 8 px, sin recolorear ni estirar.

### Dónde se reemplaza el texto por el logo

Regla: en **etiquetas, insignias, títulos, encabezados de columna y menú** va el logo. Dentro de
**frases largas** (avisos, confirmaciones, textos de ayuda, aviso de privacidad) el nombre
puede ir escrito.

- `frontend/src/components/layout/AdminLayout.tsx`: entrada de menú "TotalPass".
- `frontend/src/pages/admin/settings/TotalPassSettings.tsx`: encabezado de la página.
- `frontend/src/pages/admin/classes/ClassTypesList.tsx`: etiqueta "Lugares TotalPass por defecto".
- `frontend/src/pages/admin/classes/ClassesCalendar.tsx`: insignia de la asistente, "desde
  TotalPass", sección de cupo, diálogo de edición, pastilla "TP n" de la tarjeta (estas dos
  últimas desaparecen con la Entrega 2).
- `frontend/src/pages/reception/BookingsScreen.tsx`: insignia, etiqueta de plan, título del filtro.
- `frontend/src/pages/coach/Students.tsx`: `CHANNEL_LABEL` → `ChannelLogo`.
- `frontend/src/components/PlatformBadge.tsx`: si `canalDePlan(name)` encuentra canal, muestra el
  logo. Se usa en las insignias de plan de: `ClientsList.tsx`, `ClientDetail.tsx`,
  `MembershipsList.tsx`, `CoachPayrollPage.tsx`, recepción `ClientsScreen.tsx`,
  `DashboardScreen.tsx`, `CheckinScreen.tsx`, `ScanScreen.tsx`. Donde el nombre del plan
  aparece como texto corrido o en reportes, se queda como texto.

**Prueba:** Playwright con capturas de los puntos principales (menú, cupo, insignia) en fondo
claro y oscuro.

---

## Entrega 2 — Semana por horas

### Backend

`GET /api/classes` (`backend/src/routes/classes.ts`) agrega `channels`, un arreglo con un
elemento por fila de `channel_inventory`:

```sql
COALESCE((SELECT json_agg(json_build_object('channel', ci.channel, 'max', ci.max_spots, 'booked', ci.booked_spots))
          FROM channel_inventory ci WHERE ci.class_id = c.id), '[]'::json) AS channels
```

Se conservan `totalpass_spots` y `totalpass_booked` por compatibilidad hasta que nadie los use.
Tipo `Class` en `frontend/src/types/class.ts`: `channels: { channel: string; max: number; booked: number }[]`.

### Frontend

`ClassesCalendar.tsx` (2,418 líneas) se parte en `frontend/src/pages/admin/classes/calendario/`:

- `useSemanaClases.ts`: consultas (tipos, coaches, sucursales, clases, días cerrados) y filtros.
- `RejillaSemana.tsx`: columnas lunes a domingo; eje de horas a la izquierda; cada clase
  posicionada por hora de inicio y alta por duración. **Los tramos sin clases en toda la semana se
  compactan** en una franja de 32 px con el rango ("11 – 18"). Línea de "ahora" en el día de hoy.
- `TarjetaClase.tsx`: nombre (con intensidad), hora, coach ("Sin coach asignada" en rojo si
  falta), los lugares como puntos (Casa Shé con el color del tipo de clase, cada canal con su
  color, libres huecos), "n/7" o "Lleno". Salsa en tarjeta oscura (usa otra bolsa de créditos).
  Cancelada: atenuada y tachada, sigue visible para staff.
- `EncabezadoDia.tsx`: día, número, "Hoy", "n clases · m libres". Días cerrados como hoy.
- `PanelClase.tsx`: el `Sheet` actual reordenado: encabezado con tipo/fecha/hora/coach y lugares
  grandes; acciones (Editar, Cambiar coach, Cancelar clase); **Inscribir alumna** arriba
  (Entrega 4 lo mejora); un control de cupo por **canal conectado** con su logo; inscritas con
  check-in, invitadas acompañantes, lista de espera; cerrar cupo y clase gratis como hoy.
- Diálogos existentes (crear, editar, generar, copiar semana, gratis, cambiar coach, cancelar)
  se mueven a archivos propios sin cambiar su comportamiento, salvo:
  - **Editar** manda a `PUT /api/classes/:id` solo los campos que cambiaron (hoy manda todos y
    eso marca resincronización con TotalPass en cada guardado).
  - **"Limpiar semana" desaparece** del menú (Entrega 3 retira el endpoint).
- Leyenda en la barra: Alumna · Socia + logo de cada canal conectado · Libre, y el resumen
  "n clases · m lugares libres · k socias".
- Debajo de `lg` se conserva la tira de días + lista del día con la nueva tarjeta. La rejilla y
  la selección múltiple son solo de escritorio.

**Prueba:** el `admin-classes.spec.ts` de Playwright se actualiza a la nueva estructura y se
agrega un caso de posición/compactado de horas y de puntos por canal.

---

## Entrega 3 — Varias a la vez

### Endpoint

`POST /api/classes/bulk` (`authenticate`, `requireElevated`). Cuerpo (zod):

```ts
{
  classIds: string[];          // uuid, 1–200, sin repetidos
  accion: 'coach' | 'cupo_canal' | 'mover' | 'cancelar';
  vistaPrevia: boolean;
  instructorId?: string;       // coach
  canal?: 'totalpass';         // cupo_canal: solo canales conectados (hoy TotalPass)
  lugares?: number;            // cupo_canal: entero >= 0
  minutos?: number;            // mover: múltiplo de 15, entre -180 y 180, distinto de 0 si no hay classTypeId
  classTypeId?: string;        // mover: cambiar el tipo de clase
  motivo?: string;             // cancelar: hasta 200 caracteres, lo ven las alumnas
}
```

Respuesta (igual en vista previa y al aplicar):

```ts
{
  clases: Array<{
    classId: string;
    estado: 'ok' | 'bloqueada';
    motivo?: string;               // por qué está bloqueada, en español para recepción
    alumnasAvisadas: number;       // inscritas de Casa Shé que reciben aviso
    sociasPorCanal: Record<string, number>;
    sociasPierdenLugar: number;    // solo mover con minutos != 0
    advertencias: string[];        // p. ej. "TotalPass no republica con menos de 4.5 h"
  }>;
  resumen: { ok: number; bloqueadas: number; alumnasAvisadas: number; sociasPierdenLugar: number };
  aplicado: boolean;
}
```

Reglas comunes:

- **Bloqueada** si: está cancelada, ya empezó o ya pasó (hora CDMX), o es de otra sucursal y
  quien la pide es recepción.
- **Aplicar exige cero bloqueadas** (409 con la misma respuesta si hay alguna). La interfaz ofrece
  "Quitar las N bloqueadas de la selección".
- **Todo o nada:** los cambios de base de datos van en una sola transacción. Avisos (push, in-app,
  correo a coach) y `dispararResyncTotalpass()` / `dispararRetiroTotalpass()` corren **una vez
  después del commit**.
- Registro en auditoría con quién, acción, clases y parámetros.

Por acción:

| Acción | Bloquea si… | Aplica | TotalPass | Avisos |
| --- | --- | --- | --- | --- |
| `coach` | la coach tiene otra clase activa que se encime en horario | `instructor_id` | `marcarResyncTotalpass` (editar: las socias conservan lugar) | alumnas inscritas (in-app + push); correo a la coach nueva |
| `cupo_canal` | `lugares` < reservas del canal, o > capacidad | `setTotalpassCap` con el cliente de la transacción | 0 marca retiro; > 0 lo desmarca | ninguno |
| `mover` | la hora nueva cruza de día o sale de 05:00–23:00; la coach se encima; el tipo nuevo cambia de bolsa (Salsa ↔ Clases) y hay alumnas inscritas; la capacidad no cabe en la categoría nueva | `start_time`/`end_time` corridos `minutos`; `class_type_id` | `marcarResyncTotalpass`; con `minutos` ≠ 0 es "mover" y la vista previa cuenta `sociasPierdenLugar`; si faltan menos de 5 h agrega advertencia | alumnas inscritas (in-app + push) con la hora o clase nueva |
| `cancelar` | — | `cancelClassWithRefunds` por clase (devuelve créditos, cancela pedidos de barra, reactiva beneficios) | marca retiro de cada clase | lo que ya manda `cancelClassWithRefunds`, con `motivo` |

Cambios de soporte:

- `cancelClassWithRefunds(classId, cancelledBy, reason, opts?)` acepta `opts.db` (un `PoolClient`)
  para correr dentro de la transacción y `opts.diferirAvisos` para devolver los avisos en vez de
  mandarlos. Sin `opts` se comporta igual que hoy (`closed-days.ts`, `events.ts` y
  `DELETE /classes/:id` no cambian).
- `setTotalpassCap` acepta un `db` opcional por la misma razón.
- Aviso a alumnas al mover o cambiar coach: mismo mecanismo de notificación in-app + web push
  que ya usa `cancelClassWithRefunds`. Hoy `PUT /classes/:id` no avisa a nadie al mover; la
  edición individual también empieza a avisar cuando cambia fecha u hora.
- **`POST /api/classes/bulk-delete` se elimina** junto con su botón.

### Interfaz (mockup "Varias clases a la vez")

- Botón "Seleccionar varias" entra al modo selección: cada tarjeta muestra su casilla; clic
  marca o desmarca; clic en el encabezado del día marca todo el día.
- Atajos según la última clase tocada: "Mismo horario (8:00)", "Las de Ana", "Todas las Barre",
  "Todo el miércoles". "Quitar selección".
- Barra inferior oscura con "n clases · m inscritas · k de TotalPass" y las cuatro acciones.
  Cada acción abre su ventana, llama a vista previa y muestra el impacto: lista de clases,
  alumnas avisadas, socias que pierden lugar (recuadro de advertencia), bloqueadas con su motivo.
  El botón dice exactamente lo que hará ("Cambiar a Sofía en 4 clases").
- Al aplicar: aviso de confirmación. "Deshacer" aparece solo cuando la acción inversa cabe en una
  llamada al mismo endpoint: coach, si todas tenían la misma coach antes; mover, con `-minutos` y,
  si cambió el tipo, solo si todas tenían el mismo tipo antes. Cupo y cancelar no se deshacen.

### Pruebas

`backend/scripts/test-classes-bulk.ts` (Postgres local, BEGIN/ROLLBACK como `test-copy-week.ts`):
vista previa no escribe nada; bloqueos de cada acción; aplicar con una bloqueada → 409 sin
cambios; aplicar `cancelar` deja `status='cancelled'`, devuelve créditos y marca
`pending_delete` en mapeos publicados; `mover` marca `pending_resync`; `cupo_canal` respeta
`CAP_BELOW_BOOKED`; una falla a la mitad no deja cambios. `test-totalpass-cableado.ts` se
extiende para fijar que `/bulk` dispara retiro y resincronización. Playwright: seleccionar
con atajo → cancelar → tarjetas canceladas.

---

## Entrega 4 — Inscribir más fácil

### Una sola regla para mostrar y para cobrar

Se extrae de `POST /api/bookings/admin-book` la evaluación a
`backend/src/lib/inscripcion.ts`:

```ts
evaluarInscripcion(db, { userId, classId, cortesia }): Promise<
  | { estado: 'puede'; membresia: { id; plan; restantes: number | null; vence: string } | null }
  | { estado: 'ya_inscrita' | 'sin_membresia' | 'sin_creditos' | 'limite_diario' | 'otro_estudio' | 'clase_llena' | 'clase_cancelada'; mensaje: string }
>
```

Usa `selectMembershipForBooking` (con un parámetro nuevo `bloquear: boolean`, por defecto `true`,
para poder consultar sin `FOR UPDATE`), `studioBookingError` y la regla de
`assertMembershipDailyLimit`. `admin-book` la llama con `bloquear: true` y conserva sus
mensajes y códigos actuales.

### Endpoint de búsqueda

`GET /api/classes/:id/candidatas?q=` (admin, super_admin, reception; recepción limitada a su
sucursal). `q` de 2+ caracteres, sin distinguir acentos ni espacios (mismo criterio que
`GET /users`). Solo `role = 'client'` activas; máximo 8. Cada resultado:
`{ userId, nombre, telefono, email, ...evaluarInscripcion(bloquear: false) }`.

### Interfaz (mockup "Panel de clase")

- Buscador arriba del panel, con espera de 250 ms al teclear; flechas + Enter inscriben a la
  resaltada si puede.
- Cada fila muestra el plan y lo que le queda **en la bolsa de esa clase** ("Paquete 8 Clases ·
  le quedan 3", "Ilimitado · vence 30 oct") o el motivo en rojo ("Sin créditos de Clases").
- "Inscribir" (solo si puede) → `admin-book`. "Vender paquete" abre debajo de la fila: paquetes
  de la bolsa de la clase (Salsa o Clases), forma de pago (`lib/membershipPaymentMethods.ts`), y
  "Cobrar e inscribir" → `POST /api/memberships/assign` y luego `admin-book`. Si la venta pasa y
  la inscripción falla, la venta se queda (ya tiene créditos) y se muestra el motivo.
- "Cortesía: inscribir sin descontar crédito" → `free: true` (ya existe).
- Al final: "¿No está? Registrar alumna nueva" (Entrega 5).
- Tras inscribir: aparece resaltada en "Inscritas", los puntos se actualizan, aviso con
  "Deshacer" (cancela la reserva devolviendo crédito con `p_is_admin = true`).

### Pruebas

`backend/scripts/test-inscripcion.ts`: cada estado de `evaluarInscripcion`; que
`candidatas` y `admin-book` coinciden para la misma alumna y clase; que no aparecen coaches ni
staff. Playwright: inscribir con créditos; vender paquete e inscribir.

---

## Entrega 5 — Alumna nueva con acceso por WhatsApp

### Links de acceso

Tabla nueva (migración inline en `runStartupMigrations`, siguiente número libre):

```sql
CREATE TABLE IF NOT EXISTS access_links (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,      -- sha256 del token; el token en claro nunca se guarda
  created_by  UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ NOT NULL,      -- created_at + 7 días
  used_at     TIMESTAMPTZ,
  revoked_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_access_links_user ON access_links(user_id);
```

- El token es aleatorio (32 bytes, base64url), **no es JWT**, así que no puede usarse como sesión.
- Generar un link nuevo revoca los activos de esa alumna.
- `backend/src/lib/accessLinks.ts`: `crearLinkAcceso(db, userId, creadoPor)` → `{ url, venceEl }`
  con `url = ${FRONTEND_URL}/acceso/${token}`; `consultarLinkAcceso(token)`; `usarLinkAcceso(token, password)`.

Endpoints:

- `POST /api/users/:id/acceso` (admin, super_admin, reception) → `{ url, venceEl }`. Es el
  "Reenviar acceso" de la ficha de la alumna.
- `GET /api/auth/acceso/:token` (público, con el mismo limitador que `reset-password`) →
  `{ nombre, email }` o 410 `{ code: 'LINK_VENCIDO' | 'LINK_USADO' | 'LINK_INVALIDO' }`.
- `POST /api/auth/acceso/:token` `{ password }` (misma regla de contraseña que `reset-password`)
  → guarda la contraseña, `temp_password = false`, marca `used_at`, y responde igual que
  `POST /api/auth/login` para que entre directo.

Página `frontend/src/pages/auth/Acceso.tsx`, ruta `/acceso/:token`: "Hola Daniela, crea tu
contraseña", contraseña + confirmación, y al terminar entra a su inicio. Link vencido o usado:
"Este link ya no sirve. Pide uno nuevo en recepción."

### Alta rápida

`POST /api/users/alta-rapida` (admin, super_admin, reception):

```ts
{
  nombre: string;              // 2–80
  email: string;               // obligatorio
  telefono: string;            // 10 dígitos MX, o con lada
  classId: string;
  planId?: string;             // el paquete que se vende
  cortesia?: boolean;          // sin paquete, inscripción sin descontar
  metodoPago?: 'cash' | 'transfer' | 'card';   // obligatorio si hay planId
}
```

En **una transacción**:

1. Duplicados: correo (minúsculas, exacto) o teléfono (últimos 10 dígitos, `normalizeMxPhone`)
   → 409 `{ code: 'YA_EXISTE', userId, nombre, coincidencia: 'email' | 'telefono' }`. La interfaz
   ofrece "Abrir su ficha" e inscribirla con el flujo normal.
2. Crea la clienta (`role = 'client'`, contraseña aleatoria inutilizable, `temp_password = false`)
   y le da el bono de bienvenida igual que `POST /users`.
3. Si hay `planId`: asigna el paquete con la misma lógica que `POST /memberships/assign`
   (extraída a una función compartida).
4. Inscribe con `evaluarInscripcion(bloquear: true)` + la inserción de `admin-book`
   (extraída a una función compartida).
5. Crea el link de acceso.

Si cualquier paso falla, no queda nada. Respuesta 201:
`{ user, membership, booking, acceso: { url, venceEl } }`. Después del commit, si el correo
está configurado (Resend), se manda la bienvenida con el link; si no, no truena.

### WhatsApp

`frontend/src/lib/whatsapp.ts` agrega `enlaceAccesoWhatsApp({ telefono, nombre, clase, fecha, hora, url })`
con la misma normalización de lada que `enlaceWhatsApp`. Mensaje:

> Hola Daniela, te escribimos de Casa Shé. Ya tienes tu lugar en Barre el miércoles 7 de octubre
> a las 8:00. Crea tu contraseña aquí para ver tus clases y reservar desde tu celular: {url}
> El link vence en 7 días.

### Interfaz (mockup "Alumna nueva")

- Desde el panel de clase: "¿No está? Registrar alumna nueva" precarga el nombre buscado.
- Una pantalla: nombre, WhatsApp, correo, paquete de la bolsa de la clase (o cortesía), forma de
  pago, casilla "Mandarle su acceso por WhatsApp" (marcada). Botón "Registrar, cobrar e inscribir".
- Pantalla de listo: "Daniela quedó inscrita", resumen del cobro, vista del mensaje, "Abrir
  WhatsApp" (abre `wa.me` en la compu de recepción), "Copiar link", "Volver a la clase".
- Ficha de la alumna (`ClientDetail.tsx`, recepción `ClientsScreen.tsx`) y la pantalla de éxito
  de "Agregar miembro" (`MemberNew.tsx`): botón "Mandar acceso por WhatsApp" con
  `POST /users/:id/acceso`. Así se cierra el hueco de hoy (las alumnas creadas desde admin
  nunca reciben acceso).

### Pruebas

`backend/scripts/test-access-links.ts`: el link vence a los 7 días; se usa una sola vez; uno
nuevo revoca el anterior; el token no sirve como sesión; `POST /auth/acceso/:token` entrega
sesión válida. `backend/scripts/test-alta-rapida.ts`: duplicado por correo y por teléfono → 409
sin escribir; una falla al inscribir deshace la clienta y el paquete; camino feliz crea las
cuatro cosas. Playwright: alta rápida desde el panel → link generado → abrir `/acceso/:token`
→ crear contraseña → entra.

---

## Fuera de alcance

- Conexión real con Fitpass (publicar clases, importar reservas, check-in).
- Vista de lista (opción B) y arrastrar para mover.
- Inicio de sesión con teléfono.
- Envío automático por API de WhatsApp (sigue apagada).
- Cambiar las fuentes globales de la app.

## Riesgos y cómo se cubren

| Riesgo | Cobertura |
| --- | --- |
| Romper el panel actual (invitadas, intensidad, lista de espera) al partir el archivo | Partir sin cambiar comportamiento primero; Playwright del panel antes y después |
| Cancelación en bloque a medias | Transacción única + avisos diferidos + prueba de falla a la mitad |
| Mover clases publicadas en TotalPass | Vista previa obligatoria con conteo de socias que pierden lugar y advertencia de < 5 h |
| Lo mostrado no coincide con lo cobrado | `evaluarInscripcion` compartida por búsqueda y `admin-book` |
| Link de acceso filtrado | Token opaco, hash en base, 7 días, un uso, revocable, no es sesión |
| iCloud desaloja archivos del repo | Clon nuevo; si vuelve a fallar, marcar la carpeta "Mantener descargado" |
