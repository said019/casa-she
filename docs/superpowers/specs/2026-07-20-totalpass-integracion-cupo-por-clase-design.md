# Integración TotalPass en Casa Shé (con asignación de cupo por clase)

**Fecha:** 2026-07-20
**Estado:** Diseño aprobado
**Autor:** Said + Claude (brainstorming)
**Referencia viva:** `TOTALPASS-OFICIAL.md` (raíz del proyecto) · implementación a portar: Hundred Studio (`/Users/saidromero/Desktop/Hundred Studio/Hundred/backend`)

## Problema

Casa Shé **no** tiene integración real con TotalPass. Hoy los socios de plataforma (TotalPass/Wellhub/Fitpass) se manejan con un **workaround manual**: se crea el usuario a mano, se le asigna una membresía de un plan interno (`plans.is_internal = true`) y `platformMember.ts` silencia sus notificaciones. No hay:

- Cliente de la API de TotalPass ni almacenamiento de credenciales.
- Publicación de clases a TotalPass ni control de cuántos lugares se ofrecen.
- Import automático de reservas hechas por socios TP.
- Check-in / asistencia automática.

La integración completa **ya existe y está probada** en Hundred Studio (misma estructura `backend/src/`), LUM y Essenza. El objetivo es **portarla** a Casa Shé, no reinventarla.

## Objetivo

Que el dueño pueda **asignar lugares de TotalPass a cada clase del calendario** y que el ciclo completo funcione end-to-end: publicar clases a TP con el cupo correcto, reconciliar disponibilidad, importar las reservas de socios TP al calendario de Casa Shé, y registrar su asistencia por check-in automático.

## Decisiones tomadas

- **Alcance:** integración completa, **incluyendo check-in**.
- **Modelo de cupo:** **default por tipo de clase + override por clase** (Reformer=2, Barre=3…, ajustable en una clase puntual).
- **Credenciales:** el dueño **ya tiene** el `place_api_key` (código del panel TP de Casa Shé) y el `unit_id`. El `partner_api_key` es de WalletClub (Said).
- **Canales:** **solo TotalPass** ahora, pero con el esquema `channel`-ready (columna `channel`) para sumar FitPass/Wellhub luego sin migración nueva.
- **Fuente a portar:** Hundred Studio (misma estructura de directorios que Casa Shé).

## No-objetivos (YAGNI)

- No implementar FitPass ni Wellhub ahora (solo dejar el esquema listo).
- No dar puntos de lealtad ni notificaciones a socios TP (se mantiene el comportamiento actual vía plan interno + `platformMember.ts`).
- No portar el camino "legacy con fallback" de LUM: **solo el camino oficial** (§5 del doc: proyectos nuevos = solo oficial).
- No automatizar los pasos manuales del panel de TotalPass ni de Google Cloud.
- No construir el check-in iniciado por recepción (`x-api-key` de Access Control) — el webhook cubre el flujo estándar (socio hace check-in en su app).

## Arquitectura

Portar la rebanada TotalPass de la integración de Hundred, adaptada al modelo `classes`/`bookings` de Casa Shé. Respetar al pie los **QUIRKS de producción (§4 del doc):**

1. **Fechas "local-as-Z":** rebanar el string (`.slice(0,10)` fecha, `.slice(11,16)` HH:MM). **Nunca** `new Date()`/`Intl` sobre fechas de la API TP.
2. **Statuses reales de slot:** `confirmed`, `expired`, `canceled`, `created` (saltarla), `denied`. La doc dice `active` — mentira en prod.
3. **`maxTimeToCancel` debe ser futuro** (400 si no). Formato `'YYYY-MM-DD hh:mm AM/PM'` hora local del place; `startTime` de create `'hh:mm AM/PM'`.
4. **UUID de ocurrencia:** usar siempre `occurrenceUuidOf(occ)` (individual → `eventOccurrenceUuid`).
5. **Mismo id-space que el panel:** dedupe por `external_ref` (slot `_id`).
6. **429:** detectar `/→\s*429\b/` en el error del cliente y **abortar la corrida**; throttle ~120ms entre escrituras.
7. **No publicar en el pasado**; operar siempre a nivel ocurrencia; no borrar ocurrencias con `slotsInUse > 0`.
8. **`externalReference`** en create = `class.id` de Casa Shé; matching de respaldo `title|fecha|HH:MM` (con `.trim()`).

### Módulos nuevos (`backend/src/lib/`, portados de Hundred)

| Módulo | Qué hace | Depende de |
|--------|----------|-----------|
| `totalpass-official.ts` | Cliente autocontenido (axios). `getPlace`, `listEvents`, `listSlots`, `createIndividualEvent`, `updateOccurrence`, `setOccurrenceSlots`, `deleteOccurrence`, `cancelSlot`, `confirmSlot`, `subscribeWebhook`, `getWebhook`. Auto-renueva token en memoria (margen 60s). | `platform_credentials` |
| Factory `totalpassOfficialFromDb()` | Lee claves de `platform_credentials` (canal totalpass) con fallback a env; `null` sin claves. | DB |
| `channel-caps.ts` | Matemática pura del cupo: `channelCapAvailable`, `channelCapCeiling`, `buildPoolSnapshot`, lectura de topes por clase. Unit-testeable. | — |
| `partner-pool.ts` | Reconcilia el cupo TP de cada ocurrencia futura (`setOccurrenceSlots` solo si cambió). | client, channel-caps |
| `totalpass-publish.ts` | Publica clases locales con cupo TP > 0 (`createIndividualEvent`) y cancela (`deleteOccurrence`). | client, mappings |
| `totalpass-source.ts` | Import de reservas: `listSlots` → match clase → upsert booking + reconcile canceladas. | client, bookings |
| `platform-cleanup.ts` | Limpieza de ocurrencias huérfanas / clases canceladas. | client, mappings |

### Ruta nueva (`backend/src/routes/`)

- `partner-webhooks.ts` — receptor `/webhooks/totalpass/checkin` (ver §Check-in). Guard anti-SSRF.
- Extensión de rutas admin para credenciales, default-por-tipo y override-por-clase (ver §Admin/UI).

### Crons nuevos (`backend/src/services/cron-jobs.ts`, gated por `ENABLE_CRON_JOBS`)

- **Renovación de token TP** — diario 00:15.
- **Publicación** — diaria (clases nuevas del horizonte → TP).
- **Reconciliación de cupo (pool)** — cada ~10 min.
- **Import de reservas** — cada ~10 min.

## Modelo de datos — el corazón de "asignar lugares por clase"

Rebanada TP de la migración 017 de Hundred (`platform_credentials`, `channel_inventory`, `checkins`, `processed_events`) + `partner_class_mappings` + la adición para el default por tipo.

### Tablas nuevas

- **`platform_credentials`** — por canal: `partner_api_key`, `place_api_key`, `unit_id`, `access_token`, config. Secretos **encriptados** (`pgp_sym_decrypt`/`APP_ENCRYPTION_KEY`, patrón de Hundred). Nunca en frontend/repos.
- **`channel_inventory(id, class_id, channel, max_spots, booked_spots, timestamps)`**
  - `UNIQUE(class_id, channel)`; `CHECK channel IN ('totalpass', 'wellhub', 'fitpass')`; `max_spots >= 0`, `booked_spots >= 0`.
  - **Sin fila o `max_spots = 0` ⇒ canal apagado** para esa clase.
  - Tope **flexible** (no pool con buffer): los lugares de TP, los locales y otros canales compiten por el mismo `classes.max_capacity`.
- **`partner_class_mappings(id, class_id, channel, external_event_id, external_occurrence_uuid, external_slot_id, timestamps)`** — mapea clase local ↔ evento/ocurrencia TP. `external_ref` para dedupe.
- **`checkins`** y **`processed_events`** — asistencia e idempotencia del webhook (dedupe por token).

### Adición para "default por tipo + override"

- **`class_types.totalpass_default_spots`** (INTEGER NOT NULL DEFAULT 0) — el default por tipo.
- Al **generar clases** (cron `GENERATE_CLASSES` / "Generar semana" en `index.ts`/servicio de generación), sembrar `channel_inventory(class_id, 'totalpass', max_spots = class_type.totalpass_default_spots)` cuando el default > 0. Idempotente (no duplicar si ya existe fila).
- El dueño hace **override** de una clase puntual editando su `channel_inventory.max_spots` desde el calendario.

### Cambios a `bookings`

`bookings` hoy no tiene canal ni referencia externa. Agregar:
- **`channel`** VARCHAR default `'local'` (`'local' | 'totalpass' | …`).
- **`external_ref`** TEXT nullable — el `slot._id` de TP para dedupe. Índice único parcial por `(channel, external_ref)` donde `external_ref` no es nulo.
- Los socios TP se resuelven/crean como usuario + membresía de **plan interno** (reutiliza `platformMember.ts`): notificaciones ya silenciadas, sin puntos.

## Los flujos (portados, TP-only, oficial-only)

1. **Fundación:** cliente + factory de credenciales + auth (`POST /partner/auth` → JWT ~24h) + cron de renovación. Derivar `planId` de `getPlace().Plans` en runtime (nunca hardcodear).
2. **Publicación** (`totalpass-publish.ts`): clases con cupo TP > 0 sin evento TP ⇒ `createIndividualEvent` con `planId` de `getPlace()`, `maxTimeToCancel` (default 4h antes, configurable por tipo), `externalReference = class.id` ⇒ guardar mapping. Cancelar clase ⇒ `deleteOccurrence` (no borrar con `slotsInUse > 0`).
3. **Reconciliación de cupo** (`partner-pool.ts`, ~10 min): por ocurrencia futura, `slots deseados = reservasTPvivas + min(tope − usadasTP, libresFísicos)` ⇒ `setOccurrenceSlots` **solo si cambió**. Huérfanas dentro del horizonte (sin clase local) ⇒ cerrar (`slots = slotsInUse`).
4. **Import de reservas** (`totalpass-source.ts`, ~10 min): `listSlots` (ventana ≤30 días) → filtrar `confirmed` → matchear clase por `externalReference | título|fecha|HH:MM` → upsert booking (`channel=totalpass`, `external_ref = slot._id`, dedupe también por clase+usuario) → reconcile canceladas (`canceled` ⇒ cancelar local; slot desconocido ⇒ **no tocar**). Trae el socio completo (`user.{name,email,phone,document_number CURP,code}`) para crear/enlazar el usuario.
5. **Check-in por webhook** (`partner-webhooks.ts`):
   - Registrar webhook CHECKIN: `POST https://gym-service-api.totalpass.com/partner/webhook/create` body `{webhook_url, webhook_type:'CHECKIN'}` con el Bearer de `/partner/auth` (¡otro host! en booking-api da 404).
   - TP envía `CHECK_IN_CREATED` con un campo `endpoint` `https://admin.totalpass.com/api/v1/webhook_confirmations/<TOKEN>`.
   - Confirmar: `POST` al `endpoint` **sin auth** (el token ES la auth), body vacío. 200="1", 422=expirado.
   - **Seguridad:** guard anti-SSRF — solo llamar si el hostname es exactamente `admin.totalpass.com` o `admin.staging.totalpass.com`. Dedupe por token (idempotencia vía `processed_events`).
   - **Bonus:** al confirmar, buscar la reserva TP del socio (clase de hoy ±60 min; match por CURP/email/nombre) y marcar `checked_in` con `checked_in_method='auto'`.

## Config / credenciales (ya disponibles)

Guardar `partner_api_key` + `place_api_key` + `unit_id` de Casa Shé en `platform_credentials` (encriptado). **Verificación obligatoria (§6 del doc):** `auth` 201 → `getPlace()` debe devolver **el nombre "Casa Shé"** antes de escribir nada a TP. Env necesarias: `APP_ENCRYPTION_KEY`, `TOTALPASS_PARTNER_API_KEY` (fallback), `ENABLE_CRON_JOBS`.

## Admin / UI (frontend)

- **Config global TotalPass:** pantalla admin para guardar credenciales + indicador de conexión (resultado de `getPlace()`), botón "probar conexión".
- **Default por tipo:** campo "lugares TotalPass" en el editor de tipo de clase (`class_types`).
- **Override por clase:** en el calendario, al abrir una clase, control "lugares para TotalPass" que setea/borra su fila de `channel_inventory`. Mostrar cuántos hay reservados (`booked_spots`) para no bajar por debajo.

## Errores / seguridad

- **429:** abortar la corrida; throttle ~120ms entre escrituras.
- **`partner_api_key`** = llave maestra de todos los estudios: solo en DB/env del server, jamás en frontend. Si se filtra, pedir regeneración a TotalPass.
- **`place_api_key`** regenerable por el gym (invalida la anterior) → poder actualizarla en la config.
- **Webhook:** guard anti-SSRF (hostname exacto), dedupe por token, sin validación por secreto (TP no lo manda).
- No borrar ocurrencias con reservas vivas; no publicar en el pasado.

## Pruebas

- **Unit `channel-caps`:** matemática del cupo (topes vs `max_capacity`, ceiling con reservas).
- **Portar la suite de Hundred:** `totalpass-official`, `totalpass-publish`, `totalpass-source`, `totalpass-cancel-policy`, `totalpass-publish-class`.
- **Siembra en generación:** test de que generar clases crea `channel_inventory` con el default del tipo (idempotente).
- **Webhook:** test del guard SSRF + dedupe + marcado de asistencia.
- **Verificación en vivo (contigo, no automatizable hoy):** `getPlace()` = Casa Shé → dry-run de publicación en ventana controlada → revisar en el panel TP → recién entonces encender crons.

## Orden de construcción (un solo spec, por etapas verificables)

1. **Migración:** tablas nuevas + `class_types.totalpass_default_spots` + `bookings.channel/external_ref`.
2. **Cliente + credenciales + auth/renovación** → verificar `getPlace()`.
3. **`channel_inventory` + siembra-en-generación + UI default-por-tipo + override-por-clase.**
4. **Publicación + mappings.**
5. **Cron de reconciliación de cupo.**
6. **Cron de import de reservas.**
7. **Webhook de check-in.**
8. **Encender crons en prod** (tras dry-run con el dueño).

## Riesgos / notas

- Port grande con muchos quirks de producción no documentados por TP; el valor de portar Hundred es que ya los resolvió.
- El JWT de `/partner/auth` solo sirve para `/partner/*`; los endpoints gym-scoped y `gyms-admin.totalpass.com` lo rechazan (401) — no intentar automatizarlos.
- La verificación real end-to-end depende de datos en el place de Casa Shé y de ventanas de tiempo; no se puede cerrar el mismo día de codificar.
