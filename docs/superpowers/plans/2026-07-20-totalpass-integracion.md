# TotalPass Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrar TotalPass (canal oficial WalletClub) en Casa Shé para que el dueño asigne lugares de TP por clase en el calendario y el ciclo completo funcione: publicar clases a TP, reconciliar cupo, importar reservas de socios y registrar asistencia por check-in.

**Architecture:** Port adelgazado (TP-only, solo-oficial) de la integración de Hundred Studio, adaptado al modelo `classes`/`bookings`/`class_types` de Casa Shé. El esquema se crea con migraciones idempotentes inline en `runStartupMigrations()` de `backend/src/index.ts` (Casa Shé no tiene runner de `.sql`). El cupo por clase vive en `channel_inventory`, sembrado por trigger desde `class_types.totalpass_default_spots`. Los flujos de red (publish/pool/import) corren como crons; el check-in llega por webhook oficial.

**Tech Stack:** TypeScript (ESM, imports con `.js`), Express, `pg` (`query`/`queryOne`/`pool` de `backend/src/config/database.ts`), `node-cron`, `axios`, Zod, React + React Query (frontend). Tests: `tsx scripts/test-*.ts` con `node:assert/strict` (sin framework), encadenados en el script `test` de `backend/package.json`.

## Global Constraints

- **Migraciones = inline en `index.ts`**: nuevas tablas/columnas/funciones/triggers se agregan como bloques `try { await query(\`... IF NOT EXISTS ...\`) } catch {}` dentro de `runStartupMigrations()` (`backend/src/index.ts:180`), numerados en comentario "Migration NNN" (siguiente libre ≥ 098). NO crear archivos `.sql` como mecanismo (opcional dejar `.sql` de referencia numerado ≥ 031).
- **Canal único**: solo `'totalpass'` ahora, pero todo `channel VARCHAR(20)` con `CHECK` que incluya `'totalpass'` (y deja lugar a `'wellhub'`,`'fitpass'` a futuro sin migración).
- **Solo API oficial**: `booking-api.totalpass.com/partner/*`. Cero código legacy (scraper/JWT de panel). `maxTimeToCancel` se fija AL CREAR el evento (formato `'YYYY-MM-DD hh:mm AM/PM'` hora local); check-in por webhook oficial.
- **Fechas TP = hora local marcada `Z`**: SIEMPRE normalizar con `.slice(0,10)` (fecha) y `.slice(11,16)` (HH:MM). NUNCA `new Date()`/`Intl` sobre fechas devueltas por la API TP.
- **429 = abortar la corrida** (nunca reintentar en bucle). Detección: regex `/→\s*429\b|\(429\)/` sobre el `.message` del error (helper `isTotalPassRateLimit`). Throttle entre escrituras: pool 120ms, publish 140ms.
- **Fórmula única de cupo**: lo que se EMPUJA a TP como `slots` es `channelCapCeiling(capacity, totalBooked, channelBooked, cap) = channelBooked + max(0, min(cap − channelBooked, capacity − totalBooked))`. Publish y pool usan la MISMA función.
- **Nunca sobrevender**: toda materialización de reserva TP corre en transacción con `SELECT ... FROM classes ... FOR UPDATE`. `current_bookings` lo sube el trigger `update_class_booking_count()` existente — NO incrementar a mano.
- **Nada se enciende en prod** (crons/`ENABLE_CRON_JOBS`) hasta validar `getPlace()` == "Casa Shé" + dry-run con el dueño.
- **Zona horaria**: `America/Mexico_City`. `GYM_TIMEZONE` env con ese default.
- **Idioma**: comentarios y textos de UI en español (consistente con el repo).

## Referencias de port (rutas absolutas, solo lectura)

- Hundred: `/Users/saidromero/Desktop/Hundred Studio/Hundred/backend/src/lib/`
  - `scrapers/totalpass-official.ts` (cliente oficial, 207 líneas) · `channel-caps.ts` · `partner-pool.ts` · `totalpass-publish.ts` · `totalpass-source.ts` · `mx-time.ts` · `gym-config.ts`
  - migraciones: `database/migrations/017_partner_channels_integration.sql`, `018_partner_sync_mappings.sql`, `036_auto_attended.sql`, `046_totalpass_event_mapping.sql`
- LUM (para el webhook de check-in oficial): `/Users/saidromero/Desktop/Lum Wellnes Club/server/src/routes/partner-webhooks.ts`
- Doc viva: `/Users/saidromero/Desktop/Casa She/casa-she/TOTALPASS-OFICIAL.md` (§4 quirks, §5 flujos, §7 check-in).

---

## File Structure (qué se crea/toca)

**Backend nuevos (`backend/src/lib/`):**
- `mx-time.ts` — helpers de tiempo local del gym (`localDateStr`, `addDaysToDateStr`, `localDateTimeUtc`, `GYM_TIMEZONE`).
- `totalpass/client.ts` — cliente oficial `TotalPassOfficial` + `totalPassOfficialFromDb()` + helpers `totalPassOccurrenceUuid`/`totalPassTime12`/`totalPassTime24`/`totalPassPlanId` + `isTotalPassRateLimit`.
- `totalpass/caps.ts` — matemática de cupo (`channelCapAvailable`, `channelCapCeiling`, `buildPoolSnapshot`) + `getChannelCaps` + `setChannelCaps`.
- `totalpass/publish.ts` — `publishTotalPassClass`, `publishTotalPassIndividualClasses`, `persistTpMapping`, `cancelClassOnTotalpass`.
- `totalpass/pool.ts` — `reconcileTotalpassPool`.
- `totalpass/source.ts` — `extractOfficialReservationRows`, `importTotalPassReservations`, `syncTotalPassReservations`, `reconcileTotalPassCancellations`, materialización de socio (`findOrCreate` + membership interna).
- `totalpass/cancel-format.ts` — `formatTpCancelDeadlinePanel` (solo el formato panel, sin scraper legacy).

**Backend tocados:**
- `backend/src/index.ts` — bloques de migración inline (Tasks 1,2,4,5,6) + `CREATE EXTENSION pgcrypto`.
- `backend/src/routes/class-types.ts` — columna `totalpass_default_spots` (Zod + INSERT + PUT).
- `backend/src/routes/classes.ts` — `PUT /api/classes/:id/channels` (setear cupo TP por clase).
- `backend/src/routes/partners.ts` — **nuevo** router admin: settings de credenciales + `POST /totalpass/test` (getPlace) + triggers manuales.
- `backend/src/routes/partner-webhooks.ts` — **nuevo** router: `POST /webhooks/totalpass/checkin`.
- `backend/src/services/cron-jobs.ts` — registrar 4 crons TP.
- `backend/src/index.ts` — montar routers `/api/partners` y `/webhooks`.

**Frontend tocados:**
- `frontend/src/pages/admin/classes/ClassesCalendar.tsx` — input "Lugares TotalPass" en el modal de edición de clase.
- `frontend/src/pages/admin/classes/ClassTypesList.tsx` (form de class types) — campo "Lugares TotalPass por defecto".
- `frontend/src/pages/admin/**` — **nueva** pantalla de config TotalPass (credenciales + probar conexión).

**Tests nuevos (`backend/scripts/`):** `test-totalpass-caps.ts` (unit), `test-totalpass-client.ts` (unit, mock), `test-totalpass-import.ts` (unit de extract/reconcile + materialización), y encadenarlos en `package.json` `test`.

---

# FASE 0 — Esquema (migraciones inline)

### Task 1: Tabla `platform_credentials` (TP-only) + pgcrypto

**Files:**
- Modify: `backend/src/index.ts` (dentro de `runStartupMigrations()`, junto a otros bloques "Migration NNN")

**Interfaces:**
- Produces: tabla `platform_credentials` con fila `channel='totalpass'`; columnas `partner_api_key TEXT, place_api_key TEXT, unit_id VARCHAR(100), booking_base_url TEXT, access_token TEXT, token_expires_at TIMESTAMPTZ, is_enabled BOOLEAN, place_name TEXT, updated_at TIMESTAMPTZ`.

- [ ] **Step 1: Añadir el bloque de migración** en `runStartupMigrations()` (después del último bloque "Migration NNN"):

```ts
// ---- Migration 098: TotalPass — tabla de credenciales de plataforma (TP-only, oficial) ----
try {
  await query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);
  await query(`
    CREATE TABLE IF NOT EXISTS platform_credentials (
      channel VARCHAR(20) PRIMARY KEY CHECK (channel IN ('totalpass','wellhub','fitpass')),
      is_enabled BOOLEAN NOT NULL DEFAULT false,
      partner_api_key TEXT,
      place_api_key TEXT,
      unit_id VARCHAR(100),
      booking_base_url TEXT,
      access_token TEXT,
      token_expires_at TIMESTAMPTZ,
      place_name TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_by UUID REFERENCES users(id)
    )`);
  await query(`INSERT INTO platform_credentials (channel) VALUES ('totalpass') ON CONFLICT (channel) DO NOTHING`);
  console.log('  ✅ Migration 098: platform_credentials');
} catch (e) { console.error('Migration 098 error:', e); }
```

- [ ] **Step 2: Verificar arranque** — `cd backend && npm run build` (debe compilar sin error TS). Luego, si hay BD local: `npm run dev` y confirmar en logs `✅ Migration 098`. Si no hay BD local, basta el build verde.

Run: `cd backend && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add backend/src/index.ts
git commit -m "feat(totalpass): tabla platform_credentials (migración inline 098)"
```

---

### Task 2: Columnas de canal en `bookings`

**Files:**
- Modify: `backend/src/index.ts` (`runStartupMigrations()`)

**Interfaces:**
- Produces: `bookings.channel VARCHAR(20) DEFAULT 'app'`, `bookings.external_ref VARCHAR(255)`, `bookings.partner_metadata JSONB`, `bookings.checked_in_method VARCHAR(20) DEFAULT 'manual'`; índice único parcial `(channel, external_ref)`.

- [ ] **Step 1: Añadir bloque de migración:**

```ts
// ---- Migration 099: TotalPass — columnas de canal en bookings ----
try {
  await query(`ALTER TABLE bookings
    ADD COLUMN IF NOT EXISTS channel VARCHAR(20) NOT NULL DEFAULT 'app',
    ADD COLUMN IF NOT EXISTS external_ref VARCHAR(255),
    ADD COLUMN IF NOT EXISTS partner_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS checked_in_method VARCHAR(20) NOT NULL DEFAULT 'manual'`);
  await query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_channel_external_ref
    ON bookings(channel, external_ref) WHERE external_ref IS NOT NULL`);
  await query(`CREATE INDEX IF NOT EXISTS idx_bookings_channel_status ON bookings(channel, status)`);
  console.log('  ✅ Migration 099: bookings channel columns');
} catch (e) { console.error('Migration 099 error:', e); }
```

- [ ] **Step 2: Verificar** — `cd backend && npx tsc --noEmit` (sin cambios TS; solo runtime). Expected: verde.
- [ ] **Step 3: Commit** — `git commit -am "feat(totalpass): columnas channel/external_ref/partner_metadata en bookings (migración 099)"`

---

### Task 3: `class_types.totalpass_default_spots` + ruta class-types

**Files:**
- Modify: `backend/src/index.ts` (migración), `backend/src/routes/class-types.ts:9-21` (Zod), `:70-86` (INSERT), `:117-164` (update dinámico)

**Interfaces:**
- Produces: columna `class_types.totalpass_default_spots INTEGER NOT NULL DEFAULT 0`; el endpoint `PUT /api/class-types/:id` y `POST /api/class-types` aceptan y persisten `totalpass_default_spots`.

- [ ] **Step 1: Migración** en `index.ts`:

```ts
// ---- Migration 100: TotalPass — default de lugares por tipo de clase ----
try {
  await query(`ALTER TABLE class_types ADD COLUMN IF NOT EXISTS totalpass_default_spots INTEGER NOT NULL DEFAULT 0`);
  console.log('  ✅ Migration 100: class_types.totalpass_default_spots');
} catch (e) { console.error('Migration 100 error:', e); }
```

- [ ] **Step 2: Zod** en `class-types.ts` `ClassTypeSchema` (l.9-21) — añadir:

```ts
  totalpass_default_spots: z.coerce.number().int().min(0).optional().default(0),
```

- [ ] **Step 3: INSERT** en `class-types.ts` (l.70-86) — agregar la columna `totalpass_default_spots` a la lista de columnas y `$N` correspondiente, con valor `data.totalpass_default_spots ?? 0`.

- [ ] **Step 4: Update dinámico** (l.117-164) — añadir `totalpass_default_spots` a la allowlist de campos actualizables (mismo patrón que `max_capacity`).

- [ ] **Step 5: Verificar** — `cd backend && npx tsc --noEmit`. Expected: verde.
- [ ] **Step 6: Commit** — `git commit -am "feat(totalpass): default de lugares TP por tipo de clase (migración 100 + ruta)"`

---

### Task 4: `channel_inventory` + triggers de siembra y conteo

**Files:**
- Modify: `backend/src/index.ts` (`runStartupMigrations()`)

**Interfaces:**
- Produces: tabla `channel_inventory(id, class_id, channel, max_spots, booked_spots, ...)` con `UNIQUE(class_id, channel)`; trigger `ensure_channel_inventory_for_class()` que al INSERTAR una `classes` siembra una fila `channel='totalpass', max_spots=class_types.totalpass_default_spots` si > 0; trigger `update_partner_inventory_count()` que mantiene `booked_spots` en INSERT/UPDATE/DELETE de `bookings` con `channel='totalpass'` y `status IN ('confirmed','checked_in')`.

- [ ] **Step 1: Migración** en `index.ts` (portar de Hundred `017_partner_channels_integration.sql`, adaptando la fuente de la cuota a `totalpass_default_spots`):

```ts
// ---- Migration 101: TotalPass — channel_inventory + triggers ----
try {
  await query(`
    CREATE TABLE IF NOT EXISTS channel_inventory (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      channel VARCHAR(20) NOT NULL CHECK (channel IN ('totalpass','wellhub','fitpass')),
      max_spots INTEGER NOT NULL DEFAULT 0,
      booked_spots INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT channel_inventory_unique UNIQUE (class_id, channel),
      CONSTRAINT channel_inventory_max_non_negative CHECK (max_spots >= 0),
      CONSTRAINT channel_inventory_booked_non_negative CHECK (booked_spots >= 0)
    )`);
  await query(`CREATE INDEX IF NOT EXISTS idx_channel_inventory_class ON channel_inventory(class_id)`);
  // Siembra automática desde el default por tipo
  await query(`
    CREATE OR REPLACE FUNCTION ensure_channel_inventory_for_class() RETURNS TRIGGER AS $$
    DECLARE tp_default INTEGER;
    BEGIN
      SELECT COALESCE(totalpass_default_spots, 0) INTO tp_default FROM class_types WHERE id = NEW.class_type_id;
      IF tp_default > 0 THEN
        INSERT INTO channel_inventory (class_id, channel, max_spots)
        VALUES (NEW.id, 'totalpass', tp_default)
        ON CONFLICT (class_id, channel) DO NOTHING;
      END IF;
      RETURN NEW;
    END; $$ LANGUAGE plpgsql`);
  await query(`DROP TRIGGER IF EXISTS trg_ensure_channel_inventory ON classes`);
  await query(`CREATE TRIGGER trg_ensure_channel_inventory AFTER INSERT ON classes
    FOR EACH ROW EXECUTE FUNCTION ensure_channel_inventory_for_class()`);
  // Mantiene booked_spots del canal
  await query(`
    CREATE OR REPLACE FUNCTION update_partner_inventory_count() RETURNS TRIGGER AS $$
    BEGIN
      IF (TG_OP = 'INSERT') THEN
        IF NEW.channel IN ('totalpass','wellhub','fitpass') AND NEW.status IN ('confirmed','checked_in') THEN
          UPDATE channel_inventory SET booked_spots = booked_spots + 1, updated_at = NOW()
            WHERE class_id = NEW.class_id AND channel = NEW.channel;
        END IF;
      ELSIF (TG_OP = 'DELETE') THEN
        IF OLD.channel IN ('totalpass','wellhub','fitpass') AND OLD.status IN ('confirmed','checked_in') THEN
          UPDATE channel_inventory SET booked_spots = GREATEST(booked_spots - 1, 0), updated_at = NOW()
            WHERE class_id = OLD.class_id AND channel = OLD.channel;
        END IF;
      ELSIF (TG_OP = 'UPDATE') THEN
        IF OLD.status IN ('confirmed','checked_in') AND NEW.status NOT IN ('confirmed','checked_in')
           AND NEW.channel IN ('totalpass','wellhub','fitpass') THEN
          UPDATE channel_inventory SET booked_spots = GREATEST(booked_spots - 1, 0), updated_at = NOW()
            WHERE class_id = NEW.class_id AND channel = NEW.channel;
        ELSIF OLD.status NOT IN ('confirmed','checked_in') AND NEW.status IN ('confirmed','checked_in')
           AND NEW.channel IN ('totalpass','wellhub','fitpass') THEN
          UPDATE channel_inventory SET booked_spots = booked_spots + 1, updated_at = NOW()
            WHERE class_id = NEW.class_id AND channel = NEW.channel;
        END IF;
      END IF;
      RETURN NULL;
    END; $$ LANGUAGE plpgsql`);
  await query(`DROP TRIGGER IF EXISTS trg_update_partner_inventory ON bookings`);
  await query(`CREATE TRIGGER trg_update_partner_inventory AFTER INSERT OR UPDATE OR DELETE ON bookings
    FOR EACH ROW EXECUTE FUNCTION update_partner_inventory_count()`);
  console.log('  ✅ Migration 101: channel_inventory + triggers');
} catch (e) { console.error('Migration 101 error:', e); }
```

- [ ] **Step 2: Verificar** — `cd backend && npx tsc --noEmit`. Expected: verde.
- [ ] **Step 3: Commit** — `git commit -am "feat(totalpass): channel_inventory + triggers de siembra/conteo (migración 101)"`

---

### Task 5: `partner_class_mappings`

**Files:** Modify `backend/src/index.ts` (`runStartupMigrations()`)

**Interfaces:** Produces tabla `partner_class_mappings(id, class_id, channel, external_event_id, external_occurrence_id, external_slot_id, external_class_id, sync_status, sync_error, last_synced_at, metadata jsonb)` con `UNIQUE(class_id, channel)`.

- [ ] **Step 1: Migración** (portar de Hundred `018_partner_sync_mappings.sql`):

```ts
// ---- Migration 102: TotalPass — mapeo clase↔evento TP ----
try {
  await query(`
    CREATE TABLE IF NOT EXISTS partner_class_mappings (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      channel VARCHAR(20) NOT NULL CHECK (channel IN ('totalpass','wellhub','fitpass')),
      external_class_id VARCHAR(255),
      external_slot_id VARCHAR(255),
      external_event_id VARCHAR(255),
      external_occurrence_id VARCHAR(255),
      sync_enabled BOOLEAN NOT NULL DEFAULT true,
      sync_status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (sync_status IN ('pending','synced','failed','skipped','published','error','not_configured')),
      sync_error TEXT,
      last_synced_at TIMESTAMPTZ,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT partner_class_mappings_unique UNIQUE (class_id, channel)
    )`);
  await query(`CREATE INDEX IF NOT EXISTS idx_pcm_class ON partner_class_mappings(class_id)`);
  console.log('  ✅ Migration 102: partner_class_mappings');
} catch (e) { console.error('Migration 102 error:', e); }
```

- [ ] **Step 2: Verificar** — `npx tsc --noEmit`. Expected: verde.
- [ ] **Step 3: Commit** — `git commit -am "feat(totalpass): tabla partner_class_mappings (migración 102)"`

---

### Task 6: `checkins` + `processed_events`

**Files:** Modify `backend/src/index.ts` (`runStartupMigrations()`)

**Interfaces:** Produces tabla `checkins` (idempotencia por `platform_event_id`) y `processed_events(event_id PK, channel, event_type, processed_at, response_status, payload_hash)`.

- [ ] **Step 1: Migración** (portar de Hundred `017`, TP+app):

```ts
// ---- Migration 103: TotalPass — checkins + processed_events ----
try {
  await query(`
    CREATE TABLE IF NOT EXISTS checkins (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      class_id UUID REFERENCES classes(id) ON DELETE SET NULL,
      channel VARCHAR(20) NOT NULL CHECK (channel IN ('app','totalpass','wellhub','fitpass')),
      external_ref VARCHAR(255),
      platform_event_id VARCHAR(200),
      status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','confirmed','expired','cancelled','failed')),
      validation_method VARCHAR(30) NOT NULL DEFAULT 'automated',
      validated_at TIMESTAMPTZ,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      platform_response JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
  await query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_checkins_platform_event_unique
    ON checkins(platform_event_id) WHERE platform_event_id IS NOT NULL`);
  await query(`
    CREATE TABLE IF NOT EXISTS processed_events (
      event_id VARCHAR(200) PRIMARY KEY,
      channel VARCHAR(20) NOT NULL,
      event_type VARCHAR(50) NOT NULL,
      processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      response_status INTEGER,
      payload_hash VARCHAR(128)
    )`);
  console.log('  ✅ Migration 103: checkins + processed_events');
} catch (e) { console.error('Migration 103 error:', e); }
```

- [ ] **Step 2: Verificar** — `npx tsc --noEmit`. Expected: verde.
- [ ] **Step 3: Commit** — `git commit -am "feat(totalpass): tablas checkins + processed_events (migración 103)"`

---

# FASE 1 — Asignación de cupo por clase (feature estrella)

### Task 7: Matemática de cupo (`totalpass/caps.ts`) — funciones puras + unit test

**Files:**
- Create: `backend/src/lib/totalpass/caps.ts`
- Test: `backend/scripts/test-totalpass-caps.ts`

**Interfaces:**
- Produces:
  - `export function channelCapAvailable(capacity: number, totalBooked: number, channelBooked: number, cap: number | null): number`
  - `export function channelCapCeiling(capacity: number, totalBooked: number, channelBooked: number, cap: number | null): number`
  - `export interface PoolSnapshotCounts { capacity: number; total: number; totalpass: number }`
  - `export function buildPoolSnapshot(c: PoolSnapshotCounts, tpCap: number | null): { capacity: number; totalBooked: number; physicalFree: number; tpAvailable: number; tpCeiling: number }`

- [ ] **Step 1: Escribir el test que falla** — `backend/scripts/test-totalpass-caps.ts`:

```ts
import assert from 'node:assert/strict';
import { channelCapAvailable, channelCapCeiling, buildPoolSnapshot } from '../src/lib/totalpass/caps.js';

// cap null = canal apagado -> 0 disponible
assert.equal(channelCapAvailable(8, 0, 0, null), 0);
// clase vacía, cap 3 -> 3 disponibles, techo 3
assert.equal(channelCapAvailable(8, 0, 0, 3), 3);
assert.equal(channelCapCeiling(8, 0, 0, 3), 3);
// 2 reservas TP ya usadas de cap 3, clase con 2 reservas totales -> 1 disponible, techo 3
assert.equal(channelCapAvailable(8, 2, 2, 3), 1);
assert.equal(channelCapCeiling(8, 2, 2, 3), 3);
// clase casi llena físicamente (7/8), cap TP 3 sin usar -> solo 1 físico libre
assert.equal(channelCapAvailable(8, 7, 0, 3), 1);
assert.equal(channelCapCeiling(8, 7, 0, 3), 1);
// nunca negativo
assert.equal(channelCapAvailable(8, 10, 0, 3), 0);
// snapshot
const s = buildPoolSnapshot({ capacity: 8, total: 2, totalpass: 2 }, 3);
assert.equal(s.physicalFree, 6);
assert.equal(s.tpAvailable, 1);
assert.equal(s.tpCeiling, 3);
console.log('test-totalpass-caps: OK');
```

- [ ] **Step 2: Correr y ver que falla** — `cd backend && npx tsx scripts/test-totalpass-caps.ts`. Expected: error "Cannot find module .../caps.js".

- [ ] **Step 3: Implementar `caps.ts`** (portar la fórmula de Hundred `partner-pool.ts`):

```ts
// Matemática de cupo por canal (portada de Hundred partner-pool.ts). Fórmula ÚNICA de todo el sistema.
export function channelCapAvailable(capacity: number, totalBooked: number, channelBooked: number, cap: number | null): number {
  if (cap == null) return 0;
  const physicalFree = Math.max(0, Math.floor(capacity) - Math.max(0, Math.floor(totalBooked)));
  const capRoom = Math.max(0, Math.floor(cap) - Math.max(0, Math.floor(channelBooked)));
  return Math.max(0, Math.min(capRoom, physicalFree));
}

/** Número a EMPUJAR a la plataforma como `slots`. */
export function channelCapCeiling(capacity: number, totalBooked: number, channelBooked: number, cap: number | null): number {
  const chBooked = Math.max(0, Math.floor(channelBooked));
  return chBooked + channelCapAvailable(capacity, totalBooked, channelBooked, cap);
}

export interface PoolSnapshotCounts { capacity: number; total: number; totalpass: number }
export function buildPoolSnapshot(c: PoolSnapshotCounts, tpCap: number | null) {
  const capacity = Math.max(0, Math.floor(c.capacity));
  const total = Math.max(0, Math.floor(c.total));
  return {
    capacity,
    totalBooked: total,
    physicalFree: Math.max(0, capacity - total),
    tpAvailable: channelCapAvailable(capacity, total, c.totalpass, tpCap),
    tpCeiling: channelCapCeiling(capacity, total, c.totalpass, tpCap),
  };
}
```

- [ ] **Step 4: Correr y ver que pasa** — `npx tsx scripts/test-totalpass-caps.ts`. Expected: `test-totalpass-caps: OK`.
- [ ] **Step 5: Encadenar en package.json** — añadir `&& tsx scripts/test-totalpass-caps.ts` al final del script `test`.
- [ ] **Step 6: Commit** — `git add backend/src/lib/totalpass/caps.ts backend/scripts/test-totalpass-caps.ts backend/package.json && git commit -m "feat(totalpass): matemática de cupo por canal + unit test"`

---

### Task 8: `getChannelCaps` + `setChannelCaps` + `PUT /api/classes/:id/channels`

**Files:**
- Modify: `backend/src/lib/totalpass/caps.ts` (añadir funciones DB)
- Modify: `backend/src/routes/classes.ts` (nuevo endpoint, junto a `PUT /:id` en l.686)

**Interfaces:**
- Consumes: `channelCapCeiling` (Task 7), tabla `channel_inventory` (Task 4).
- Produces:
  - `export async function getChannelCaps(classId: string): Promise<{ totalpass: number | null }>`
  - `export async function setTotalpassCap(classId: string, maxSpots: number): Promise<{ max_spots: number; booked_spots: number }>` — UPSERT `ON CONFLICT (class_id, channel) DO UPDATE`; valida `maxSpots >= booked_spots` (error `CAP_BELOW_BOOKED`) y `maxSpots <= classes.max_capacity` (error `CAP_EXCEEDS_CAPACITY`); `maxSpots=0` borra la fila (apaga TP).
  - Endpoint `PUT /api/classes/:id/channels` body `{ totalpass: number }` → `setTotalpassCap`.

- [ ] **Step 1: Test que falla** — añadir a `backend/scripts/test-totalpass-caps.ts` NO (ese es puro). Crear validador inline en el endpoint; el test de DB va en Fase de integración. Para este task, test unitario de la validación pura: crear helper `validateCap(maxSpots, booked, capacity)` en `caps.ts` y testearlo.

Añadir a `test-totalpass-caps.ts`:
```ts
import { validateCap } from '../src/lib/totalpass/caps.js';
assert.equal(validateCap(3, 1, 8), null);
assert.equal(validateCap(0, 0, 8), null);
assert.equal(validateCap(1, 2, 8), 'CAP_BELOW_BOOKED');
assert.equal(validateCap(9, 0, 8), 'CAP_EXCEEDS_CAPACITY');
```

- [ ] **Step 2: Correr, ver fallar** — `npx tsx scripts/test-totalpass-caps.ts`. Expected: error import `validateCap`.

- [ ] **Step 3: Implementar** en `caps.ts`:

```ts
import { query, queryOne } from '../../config/database.js';

export function validateCap(maxSpots: number, booked: number, capacity: number): null | 'CAP_BELOW_BOOKED' | 'CAP_EXCEEDS_CAPACITY' {
  if (maxSpots < booked) return 'CAP_BELOW_BOOKED';
  if (maxSpots > capacity) return 'CAP_EXCEEDS_CAPACITY';
  return null;
}

export async function getChannelCaps(classId: string): Promise<{ totalpass: number | null }> {
  const row = await queryOne<{ max_spots: number }>(
    `SELECT max_spots FROM channel_inventory WHERE class_id = $1 AND channel = 'totalpass'`, [classId]);
  return { totalpass: row ? Number(row.max_spots) : null };
}

export async function setTotalpassCap(classId: string, maxSpots: number): Promise<{ max_spots: number; booked_spots: number }> {
  const cls = await queryOne<{ max_capacity: number; status: string }>(
    `SELECT max_capacity, status FROM classes WHERE id = $1`, [classId]);
  if (!cls) throw Object.assign(new Error('Clase no encontrada'), { code: 'CLASS_NOT_FOUND' });
  const inv = await queryOne<{ booked_spots: number }>(
    `SELECT booked_spots FROM channel_inventory WHERE class_id = $1 AND channel = 'totalpass'`, [classId]);
  const booked = inv ? Number(inv.booked_spots) : 0;
  const err = validateCap(maxSpots, booked, Number(cls.max_capacity));
  if (err) throw Object.assign(new Error(err), { code: err, booked });
  if (maxSpots === 0) {
    await query(`DELETE FROM channel_inventory WHERE class_id = $1 AND channel = 'totalpass' AND booked_spots = 0`, [classId]);
    return { max_spots: 0, booked_spots: booked };
  }
  const saved = await queryOne<{ max_spots: number; booked_spots: number }>(
    `INSERT INTO channel_inventory (class_id, channel, max_spots) VALUES ($1, 'totalpass', $2)
     ON CONFLICT (class_id, channel) DO UPDATE SET max_spots = EXCLUDED.max_spots, updated_at = NOW()
     RETURNING max_spots, booked_spots`, [classId, maxSpots]);
  return saved!;
}
```

- [ ] **Step 4: Endpoint** en `classes.ts` (después de `PUT /:id`):

```ts
// PUT /api/classes/:id/channels — setear lugares de TotalPass para una clase
router.put('/:id/channels', requireRole('admin', 'super_admin', 'reception'), async (req: Request, res: Response) => {
  try {
    const { totalpass } = req.body ?? {};
    const n = Number(totalpass);
    if (!Number.isInteger(n) || n < 0) return res.status(400).json({ error: 'totalpass debe ser un entero >= 0' });
    const result = await setTotalpassCap(req.params.id, n);
    res.json({ ok: true, totalpass: result });
  } catch (e: any) {
    if (e.code === 'CLASS_NOT_FOUND') return res.status(404).json({ error: 'Clase no encontrada' });
    if (e.code === 'CAP_BELOW_BOOKED') return res.status(409).json({ error: `Ya hay ${e.booked} reservas TotalPass; no puedes bajar de ahí` });
    if (e.code === 'CAP_EXCEEDS_CAPACITY') return res.status(400).json({ error: 'Los lugares TP no pueden exceder la capacidad de la clase' });
    console.error('setTotalpassCap error:', e);
    res.status(500).json({ error: 'Error al guardar lugares TotalPass' });
  }
});
```
(Añadir `import { setTotalpassCap } from '../lib/totalpass/caps.js';` y asegurar `requireRole` ya importado.)

- [ ] **Step 5: Correr test + build** — `npx tsx scripts/test-totalpass-caps.ts` (OK) y `npx tsc --noEmit` (verde).
- [ ] **Step 6: Commit** — `git commit -am "feat(totalpass): setTotalpassCap + PUT /classes/:id/channels + validación"`

---

### Task 9: Frontend — cupo TP por clase + default por tipo

**Files:**
- Modify: `frontend/src/pages/admin/classes/ClassesCalendar.tsx` (modal edición, ~l.1522 junto a Capacidad; `editForm` y `editMutation` ~l.346-356)
- Modify: `frontend/src/pages/admin/classes/ClassTypesList.tsx` (form de class type)

**Interfaces:**
- Consumes: `PUT /api/classes/:id/channels` (Task 8), `PUT /api/class-types/:id` con `totalpass_default_spots` (Task 3).

- [ ] **Step 1: Cargar el cupo actual** — al abrir el modal de edición (`selectedClass`), leer `selectedClass.channel_inventory?.totalpass` (extender el `GET` de clases para incluirlo; si no viene, default 0). En el `GET /api/classes` del backend, agregar `LEFT JOIN channel_inventory ci ON ci.class_id = c.id AND ci.channel='totalpass'` y exponer `ci.max_spots AS totalpass_spots`.

- [ ] **Step 2: Input en el modal** — junto a "Capacidad" (l.1522-1523):

```tsx
<div>
  <Label>Lugares TotalPass</Label>
  <Input type="number" min={0} {...editForm.register('totalpassSpots', { valueAsNumber: true })} />
  <p className="text-xs text-muted-foreground">0 = clase no ofrecida en TotalPass</p>
</div>
```
Añadir `totalpassSpots` al `editClassSchema` (l.98-110) como `z.coerce.number().int().min(0).optional()`.

- [ ] **Step 3: Guardar** — en `editMutation` (l.346-356), tras el `PUT /classes/:id`, si `totalpassSpots` cambió, hacer `api.put('/classes/${id}/channels', { totalpass: values.totalpassSpots })`. Invalidar la query de clases.

- [ ] **Step 4: Default por tipo** — en `ClassTypesList.tsx`, añadir al form un input "Lugares TotalPass por defecto" ligado a `totalpass_default_spots`, y enviarlo en el `POST`/`PUT` de class-type.

- [ ] **Step 5: Verificar build** — `cd frontend && npm run build`. Expected: sin errores TS.
- [ ] **Step 6: Commit** — `git add frontend/ backend/src/routes/classes.ts && git commit -m "feat(totalpass): UI de lugares TP por clase y default por tipo"`

---

# FASE 2 — Cliente oficial + credenciales + conexión

### Task 10: Helpers `mx-time.ts` + `gym-config.ts`

**Files:** Create `backend/src/lib/mx-time.ts`, `backend/src/lib/gym-config.ts`

**Interfaces:** Produces `GYM_TIMEZONE`, `localDateStr(d?, tz?)`, `addDaysToDateStr(dateStr, days)`, `localDateTimeUtc(dateStr, hhmm, tz?)`, `localMidnightUtc(dateStr, tz?)`; `GYM_TEAM_NAME`.

- [ ] **Step 1..N:** Portar verbatim de Hundred `lib/mx-time.ts` y `lib/gym-config.ts` (cambiar default `GYM_TEAM_NAME` a `'Casa Shé'`). Test unitario `test-totalpass-caps.ts` NO aplica; agregar asserts mínimos de `addDaysToDateStr('2026-07-20', 5) === '2026-07-25'` y `localDateStr(new Date('2026-07-20T05:00:00Z')) === '2026-07-19'` (America/Mexico_City) en un test nuevo `test-totalpass-time.ts` encadenado. Commit.

---

### Task 11: Cliente oficial `totalpass/client.ts` + factory

**Files:** Create `backend/src/lib/totalpass/client.ts`; Test `backend/scripts/test-totalpass-client.ts`

**Interfaces:** (portar de Hundred `scrapers/totalpass-official.ts`, adaptando el factory a la tabla `platform_credentials` de Casa Shé)
- Produces: `class TotalPassOfficial` con `authenticate`, `getPlace`, `listEvents`, `listSlots(filter?)`, `createIndividualEvent(input)`, `updateOccurrence`, `setOccurrenceSlots(uuid, slots)`, `deleteOccurrence(uuid)`, `cancelSlot(slotId)`, `subscribeWebhook(url)`, `getWebhook()`; helpers `totalPassOccurrenceUuid`, `totalPassTime24`, `totalPassTime12`, `totalPassPlanId`; `isTotalPassRateLimit(error)`; `async function totalPassOfficialFromDb(): Promise<TotalPassOfficial | null>`.

- [ ] **Step 1: Test que falla** — `test-totalpass-client.ts`: importar helpers puros y asertar `totalPassTime24('01:30 PM') === '13:30'`, `totalPassTime12('13:30') === '01:30 PM'`, `isTotalPassRateLimit(new Error('TotalPass GET /x → 429: ...')) === true`, `isTotalPassRateLimit(new Error('boom')) === false`, `totalPassOccurrenceUuid({ eventOccurrenceUuid: 'abc' }) === 'abc'`.
- [ ] **Step 2: Correr, ver fallar.**
- [ ] **Step 3: Portar `client.ts`** de `totalpass-official.ts`. Adaptación del factory `totalPassOfficialFromDb()`: leer `SELECT partner_api_key, place_api_key, booking_base_url FROM platform_credentials WHERE channel='totalpass'`; `partnerApiKey = row?.partner_api_key || process.env.TOTALPASS_PARTNER_API_KEY || ''`; igual place; si falta cualquiera → `null`. Mantener DEFAULT_BASE, axios `validateStatus:()=>true`, auth con caché+refresh 60s, formato de error `TotalPass {METHOD} {path} → {status}: {body}`.
- [ ] **Step 4: Correr, ver pasar.** Encadenar en package.json. Commit.

---

### Task 12: Admin — credenciales + probar conexión (`routes/partners.ts` + frontend)

**Files:** Create `backend/src/routes/partners.ts`; Modify `backend/src/index.ts` (montar `app.use('/api/partners', partnersRouter)`); Create pantalla admin frontend.

**Interfaces:**
- Consumes: `totalPassOfficialFromDb`, `totalPassPlanId` (Task 11).
- Produces:
  - `GET /api/partners/totalpass` — devuelve `{ is_enabled, has_partner_key, has_place_key, unit_id, place_name }` (nunca secretos).
  - `PUT /api/partners/totalpass` — body `{ partner_api_key?, place_api_key?, unit_id? }` (allowlist), UPSERT en `platform_credentials`.
  - `POST /api/partners/totalpass/test` — `totalPassOfficialFromDb()` → `getPlace()` → `totalPassPlanId`; si OK, `UPDATE platform_credentials SET is_enabled=true, place_name=$name`; devuelve `{ ok, placeName, planId }`. Errores 400 (faltan keys)/409 (sin plan)/502 (no autenticó).

- [ ] **Steps:** Crear el router con los 3 endpoints (`requireRole('admin','super_admin')`), montarlo en `index.ts`, y una pantalla admin simple (form de 3 campos + botón "Probar conexión" que muestra el nombre del place). Test de integración opcional: `POST /totalpass/test` con env keys de Casa Shé (manual, no en la cadena `test`). Build verde. Commit.

**⚠️ CHECKPOINT DE VERIFICACIÓN EN VIVO (con el dueño):** cargar las credenciales reales de Casa Shé y confirmar que `POST /totalpass/test` devuelve `placeName === "Casa Shé"` (§6 del doc) ANTES de continuar con publish/pool/import.

---

# FASE 3 — Publicación a TotalPass

### Task 13: `totalpass/publish.ts` + formato de cancel

**Files:** Create `backend/src/lib/totalpass/publish.ts`, `backend/src/lib/totalpass/cancel-format.ts`

**Interfaces:** (portar de Hundred `totalpass-publish.ts` + `totalpass-cancel-policy.ts`, adelgazado a oficial-only)
- Produces:
  - `formatTpCancelDeadlinePanel(dateYmd, startTime, hoursBefore, tz?): string` → `'YYYY-MM-DD hh:mm AM/PM'`.
  - `async function publishTotalPassClass(classId): Promise<TpClassPublishOutcome>` — resuelve cliente oficial (`totalPassOfficialFromDb` + `getPlace`/`planId`); calcula `slots = channelCapCeiling(...)` desde `channel_inventory`+`bookings`; `createIndividualEvent({ title=class_type.name, responsible=instructor|GYM_TEAM_NAME, duration, slots, planId, timezone:'es-MX', eventDate=date, startTime=totalPassTime12(start_time), maxTimeToCancel=formatTpCancelDeadlinePanel(...), externalReference=class.id })`; persistir en `partner_class_mappings` (ON CONFLICT). Idempotencia: primero buscar por `externalReference`/`title|date|HH:MM`. Guard `too-soon` (deadline futuro). Throttle 140ms. 429 → abort.
  - `async function publishTotalPassIndividualClasses(fromDate, toDate, opts?): Promise<TpIndividualPublishResult>` — recorre clases `status='scheduled'` con `channel_inventory.totalpass.max_spots > 0` sin mapping, en ventana, y publica cada una.
  - `async function cancelClassOnTotalpass(classId): Promise<void>` — `deleteOccurrence` por `external_occurrence_id` persistido; nunca si `slotsInUse > 0`.

- [ ] **Steps (TDD):** Test unitario de la parte pura (`formatTpCancelDeadlinePanel` con fecha fija; construcción del input de `createIndividualEvent` extraída a `buildIndividualInput(...)` testeable con snapshot). El path de red se prueba en el dry-run en vivo. Portar respetando quirks §4. Build verde, tests OK, commit.

---

# FASE 4 — Reconciliación de cupo (pool)

### Task 14: `totalpass/pool.ts` + cron

**Files:** Create `backend/src/lib/totalpass/pool.ts`; Modify `backend/src/services/cron-jobs.ts`

**Interfaces:** (portar de Hundred `partner-pool.ts`, TP-only)
- Produces: `async function reconcileTotalpassPool(opts?: { horizonDays?: number }): Promise<TpPoolReconcileSummary>` — por ocurrencia futura publicada: `setOccurrenceSlots(uuid, channelCapCeiling(...))` solo si cambió; horizonte 21 días; salta iniciadas y `recurrenceType==='WEEKLY'`; guard "sin clases Casa Shé activas" → `skipped:'no-classes'`; throttle 120ms; 429 abort. NO escribe DB (solo API TP).

- [ ] **Steps:** Portar. Test unitario de la decisión "cambió/no cambió" (extraer `decidePoolChange(current, desired)`). Registrar cron en `cron-jobs.ts` con patrón existente:
```ts
cron.schedule('5,15,25,35,45,55 * * * *', () => reconcileTotalpassPool().catch(e => console.error('TP_POOL', e)), { timezone: 'America/Mexico_City' });
```
Añadir a `export const cronJobs` para trigger manual. Build verde, commit.

---

# FASE 5 — Import de reservas

### Task 15: `totalpass/source.ts` + materialización de socio + cron

**Files:** Create `backend/src/lib/totalpass/source.ts`; Modify `backend/src/services/cron-jobs.ts`

**Interfaces:** (portar de Hundred `totalpass-source.ts`, oficial-only; usar `findOrCreateGuest` + membresía interna de Casa Shé)
- Produces:
  - `export function extractOfficialReservationRows(slots): TotalPassImportRow[]`
  - `export function tpClassKey(title, date, startTime): string`
  - `export function decideTotalPassCancellations(...): TpReconcileDecision` (puro, testeable)
  - `async function importTotalPassReservations(rows, onProgress?): Promise<TpImportSummary>` — por fila: matchear clase (`class_types.name = title AND classes.date AND classes.start_time AND status<>'cancelled'`), materializar socio con `findOrCreateGuest({ name, phone, email })` + asegurar membresía activa del plan interno `'Totalpass'` (crear si falta, tomando `reformer_remaining=12/multi_remaining=12` del plan), y `INSERT INTO bookings (..., channel='totalpass', external_ref=slot._id, status='confirmed', booked_by=NULL)` dentro de transacción con `classes ... FOR UPDATE`; dedupe por `(channel, external_ref)`.
  - `async function syncTotalPassReservations(): Promise<...>` — `totalPassOfficialFromDb` → `listSlots({ slotDateFrom, slotDateTo })` (ventana hoy−1..hoy+14) → filtrar `confirmed` → `importTotalPassReservations` → `reconcileTotalPassCancellations`.

- [ ] **Steps (TDD):** Tests unitarios de `extractOfficialReservationRows`, `tpClassKey`, `decideTotalPassCancellations` (con los casos conservadores: slot ausente + ocurrencia vacía = cancelar; llave ambigua = uncertain, nunca cancela). Test de integración de materialización (spawn server, insertar class_type+class, correr `importTotalPassReservations` con filas fake, verificar user+membership+booking creados y `current_bookings` subido por trigger) — molde `test-class-waitlist.ts`. Registrar cron `*/5 * * * *`. Build verde, commit.

---

# FASE 6 — Check-in por webhook

### Task 16: `routes/partner-webhooks.ts` (enfoque LUM, guard SSRF)

**Files:** Create `backend/src/routes/partner-webhooks.ts`; Modify `backend/src/index.ts` (montar `app.use('/webhooks', partnerWebhooksRouter)`)

**Interfaces:** (portar de LUM `server/src/routes/partner-webhooks.ts`, ruta `/webhooks/totalpass/checkin`)
- Produces: `POST /webhooks/totalpass/checkin` — recibe `CHECK_IN_CREATED`; extrae el campo `endpoint`; **guard anti-SSRF: solo hacer POST si `new URL(endpoint).hostname` ∈ {`admin.totalpass.com`, `admin.staging.totalpass.com`}**; POST sin auth (body vacío) → 200="1"/422=expirado; dedupe por token (`processed_events` PK); al confirmar, buscar reserva TP del socio (clase hoy ±60 min; match por CURP/email/nombre) y `UPDATE bookings SET status='checked_in', checked_in_at=NOW(), checked_in_method='auto'`; registrar en `checkins` (idempotencia por `platform_event_id`).
- Registro del webhook: helper `registerTotalPassCheckinWebhook()` → `POST https://gym-service-api.totalpass.com/partner/webhook/create` body `{webhook_url, webhook_type:'CHECKIN'}` con el Bearer de `/partner/auth`. Endpoint admin `POST /api/partners/totalpass/webhook/register`.

- [ ] **Steps (TDD):** Test unitario del guard SSRF (extraer `isAllowedTpConfirmationHost(url): boolean`: acepta admin.totalpass.com, rechaza evil.com, rechaza IPs privadas) y del match de asistencia (`tpMatchCheckinToBookings`). Portar la ruta de LUM adaptando el marcado a `bookings` de Casa Shé. Montar en index.ts. Build verde, commit.

---

# FASE 7 — Cableado de crons + habilitación (con el dueño)

### Task 17: Registrar crons TP + endpoints de trigger manual

**Files:** Modify `backend/src/services/cron-jobs.ts` (imports + `initializeCronJobs()` + `cronJobs` export); Modify `backend/src/routes/partners.ts` (triggers manuales)

**Interfaces:** Registra los 4 crons TP (renovación token `15 0 * * *`, publish `20 0 * * *`, pool `5,15,...,55 * * * *`, import `*/5 * * * *`) con `timezone:'America/Mexico_City'`, cada uno envuelto en `try/catch` y **sin arrancar si faltan credenciales** (`totalPassOfficialFromDb()` → si `null`, log y skip). Exponer `POST /api/partners/totalpass/run/{publish|pool|import|renew}` para dispararlos a mano en pruebas.

- [ ] **Steps:** Añadir imports y bloques `cron.schedule(...)` dentro de `initializeCronJobs()`. Añadir funciones a `export const cronJobs`. Endpoints de trigger manual (`requireRole('admin','super_admin')`). Build verde, commit.

**⚠️ CHECKPOINT FINAL (con el dueño, NO automatizable hoy):**
1. Verificar `POST /totalpass/test` = "Casa Shé".
2. Dry-run: `POST /run/publish` en una ventana corta → revisar en el panel de TotalPass que la clase apareció con el cupo correcto.
3. `POST /run/import` con una reserva de prueba → verificar que aparece en el calendario de Casa Shé.
4. Registrar el webhook y hacer un check-in de prueba desde la app de TotalPass.
5. Solo entonces, poner `ENABLE_CRON_JOBS` activo en prod y monitorear el primer ciclo.

---

## Notas de ejecución (para el orquestador)

- **Entregable de HOY (verificable sin API en vivo):** Fases 0, 1 y 2 (esquema + asignación de cupo por clase + cliente/credenciales/conexión). Fase 2 termina en el checkpoint de `getPlace()`, que ya requiere las llaves reales cargadas.
- **Fases 3–7 (motor de sincronización en vivo):** especificadas y listas para construir, pero su verificación real exige el place de Casa Shé con datos y ventanas de tiempo → se cierran con el dueño presente, no el mismo día de codificar.
- **Orden estricto:** las Fases 0→2 son prerequisito de 3→7. Dentro de cada fase, los tasks son secuenciales salvo Task 9 (frontend) que puede ir en paralelo a Task 11.
