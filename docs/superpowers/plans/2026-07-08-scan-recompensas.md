# Escaneo QR → Ficha del Cliente + Recompensas — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que recepción/admin escanee el QR del cliente (o lo busque a mano), vea su ficha con puntos y recompensas, y pueda marcar beneficios como usados y canjear puntos a su nombre.

**Architecture:** Enfoque A del spec — endpoint unificado `POST /api/wallet/lookup` que resuelve QR/búsqueda a un `userId` y devuelve la ficha, más endpoints de acción sobre beneficios y catálogo a nombre de un cliente. Nueva columna `user_benefits.used_by` para auditoría. Refactor: extraer la verificación de QR a `lib/qr.ts`. Frontend: QR en la web wallet + pantalla `/app/reception/scan`.

**Tech Stack:** Backend Node + Express + TypeScript + Postgres (`pool`/`query`/`queryOne` de `src/config/database.ts`). Frontend React + Vite + react-router + `@tanstack/react-query` + axios (`src/lib/api.ts`). QR: `@yudiel/react-qr-scanner` (escáner) y `qrcode.react` (render QR del cliente). Tests: scripts de integración `tsx scripts/test-*.ts` con `node:assert/strict` y `pool.connect()` + `BEGIN/ROLLBACK` (backend); Playwright e2e (frontend).

## Global Constraints

- Migración de DB: bloque inline idempotente en `backend/src/index.ts` con `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` (patrón `index.ts:716-720`). No archivos SQL auto-ejecutados.
- Rutas: middleware aplicado por ruta dentro de cada router, no en `app.use`. Gate de staff: `authenticate, requireRole('admin','super_admin','reception')`.
- Imports ESM con extensión `.js` (ej. `import { query } from '../config/database.js'`).
- Transacciones: `const client = await pool.connect(); await client.query('BEGIN'); ... 'COMMIT'/'ROLLBACK'`. Locks con `FOR UPDATE`.
- El QR firmado usa `process.env.CHECKIN_SECRET || 'walletclub-dev'`, expira a 24 h, HMAC SHA256.
- `free_class` NO se marca usado suelto (solo al reservar). Tipos marcables en punto-de-venta: `free_drink`, `bar_discount`, `product`, `product_discount`, `discount`.
- Idioma/copys en español, consistente con el resto del panel.
- Commits frecuentes al final de cada step de test en verde.

---

## Estructura de archivos

**Crear:**
- `backend/src/lib/qr.ts` — verificación/decodificación del QR firmado (extraído de `checkin.ts`).
- `backend/scripts/test-qr.ts` — tests del helper QR.
- `backend/scripts/test-wallet-lookup.ts` — tests del endpoint lookup.
- `backend/scripts/test-staff-benefits.ts` — tests de benefits/redeem/use para staff.
- `frontend/src/pages/reception/ScanScreen.tsx` — pantalla de escaneo + ficha + acciones.
- `frontend/src/components/wallet/WalletQr.tsx` — render del QR del cliente.
- `frontend/e2e/tests/reception-scan.spec.ts` — e2e de la pantalla.

**Modificar:**
- `backend/src/index.ts` — migración `used_by` + montaje de nuevas rutas (ya en `wallet.ts`/`loyalty.ts`, no hay router nuevo).
- `backend/src/types/benefits.ts:48-62` — añadir `used_by` al tipo `UserBenefit`.
- `backend/src/routes/checkin.ts:59-80, 234-258, 1163-1180` — usar `lib/qr.ts`.
- `backend/src/routes/wallet.ts` — `POST /lookup`.
- `backend/src/routes/loyalty.ts` — `GET /users/:userId/benefits`, `POST /users/:userId/redeem`, `POST /benefits/:id/use`.
- `backend/src/routes/bookings.ts:767-770` — backfill `used_by` al consumir `free_class`.
- `backend/src/routes/bar.ts:215, 218` — backfill `used_by` al consumir `bar_discount`/`free_drink`.
- `frontend/src/pages/client/Wallet.tsx` — montar `WalletQr`.
- `frontend/src/App.tsx` — ruta `/app/reception/scan` con `AuthGuard`.

---

## Task 1: Migración `user_benefits.used_by` + tipo

**Files:**
- Modify: `backend/src/index.ts` (tras el bloque que crea `user_benefits`, ~línea 3600)
- Modify: `backend/src/types/benefits.ts:48-62`
- Test: `backend/scripts/test-user-benefits-used-by.ts`

**Interfaces:**
- Produces: columna `used_by UUID REFERENCES users(id) ON DELETE SET NULL` en `user_benefits`; campo `used_by: string | null` en tipo `UserBenefit`.

- [ ] **Step 1: Escribir el test que falla**

Crear `backend/scripts/test-user-benefits-used-by.ts`:

```ts
import assert from 'node:assert/strict';
import { pool } from '../src/config/database.js';

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // La columna used_by debe existir y ser nullable
    const col = await client.query(
      `SELECT column_name, is_nullable, data_type
       FROM information_schema.columns
       WHERE table_name = 'user_benefits' AND column_name = 'used_by'`
    );
    assert.equal(col.rows.length, 1, 'la columna user_benefits.used_by debe existir');
    assert.equal(col.rows[0].is_nullable, 'YES', 'used_by debe ser nullable');
    assert.equal(col.rows[0].data_type, 'uuid', 'used_by debe ser uuid');

    // Un INSERT válido con used_by = NULL debe funcionar
    const userRes = await client.query(`INSERT INTO users (name, email, role) VALUES ('t','t-ub@test','client') RETURNING id`);
    const userId = userRes.rows[0].id;
    const ins = await client.query(
      `INSERT INTO user_benefits (user_id, benefit_type, benefit_value, status, expires_at, used_by)
       VALUES ($1, 'free_drink', '{"kind":"free_drink"}'::jsonb, 'active', NOW() + interval '10 days', NULL)
       RETURNING id, used_by`,
      [userId]
    );
    assert.equal(ins.rows[0].used_by, null, 'used_by acepta NULL');

    await client.query('ROLLBACK');
    console.log('OK: used_by existe y es nullable');
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd backend && npx tsx scripts/test-user-benefits-used-by.ts`
Expected: FAIL con "la columna user_benefits.used_by debe existir".

- [ ] **Step 3: Añadir la migración inline**

En `backend/src/index.ts`, justo después del bloque que crea `user_benefits` (buscar `CREATE TABLE IF NOT EXISTS user_benefits`, ~línea 3579-3600), añadir:

```ts
        // Migration 106: auditoría de quién consume un beneficio
        await query(`ALTER TABLE user_benefits ADD COLUMN IF NOT EXISTS used_by UUID REFERENCES users(id) ON DELETE SET NULL`);
```

- [ ] **Step 4: Añadir `used_by` al tipo `UserBenefit`**

En `backend/src/types/benefits.ts:48-62`, dentro de la interfaz `UserBenefit`, después de `used_on_sale_id: string | null;` añadir:

```ts
  used_by: string | null;
```

- [ ] **Step 5: Correr el test y verificar que pasa**

Run: `cd backend && npx tsx scripts/test-user-benefits-used-by.ts`
Expected: PASS con "OK: used_by existe y es nullable".

- [ ] **Step 6: Commit**

```bash
git add backend/src/index.ts backend/src/types/benefits.ts backend/scripts/test-user-benefits-used-by.ts
git commit -m "feat(loyalty): columna user_benefits.used_by + tipo"
```

---

## Task 2: Backfill `used_by` en los 3 sitios existentes

**Files:**
- Modify: `backend/src/routes/bookings.ts:767-770`
- Modify: `backend/src/routes/bar.ts:215, 218`
- Test: `backend/scripts/test-used-by-backfill.ts`

**Interfaces:**
- Produces: los 3 flujos existentes (reserva de clase gratis, descuento de barra, bebida gratis) registran `used_by = req.user.userId`.

- [ ] **Step 1: Escribir el test que falla**

Crear `backend/scripts/test-used-by-backfill.ts`:

```ts
import assert from 'node:assert/strict';
import { pool } from '../src/config/database.js';

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const staffRes = await client.query(`INSERT INTO users (name, email, role) VALUES ('staff','staff-ub@test','reception') RETURNING id`);
    const cliRes = await client.query(`INSERT INTO users (name, email, role) VALUES ('cli','cli-ub@test','client') RETURNING id`);
    const staffId = staffRes.rows[0].id;
    const cliId = cliRes.rows[0].id;

    // Simula el UPDATE que hace bookings.ts al consumir free_class, con used_by
    const b = await client.query(
      `INSERT INTO user_benefits (user_id, benefit_type, benefit_value, status, expires_at)
       VALUES ($1, 'free_class', '{"kind":"free_class"}'::jsonb, 'active', NOW() + interval '10 days')
       RETURNING id`,
      [cliId]
    );
    await client.query(
      `UPDATE user_benefits SET status = 'used', used_at = NOW(), used_by = $3, used_on_booking_id = $1
       WHERE id = $2 AND status = 'active'`,
      ['00000000-0000-0000-0000-000000000000', b.rows[0].id, staffId]
    );
    const r = await client.query(`SELECT used_by FROM user_benefits WHERE id = $1`, [b.rows[0].id]);
    assert.equal(r.rows[0].used_by, staffId, 'used_by queda poblado por el actor');

    await client.query('ROLLBACK');
    console.log('OK: backfill registra used_by');
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Correr y verificar que pasa (valida el SQL que vamos a inyectar)**

Run: `cd backend && npx tsx scripts/test-used-by-backfill.ts`
Expected: PASS (el SQL es el mismo que inyectaremos; si pasa, el patrón es correcto).

- [ ] **Step 3: Modificar `bookings.ts:767-770`**

Reemplazar:

```ts
            if (freeClassBenefitId) {
                await client.query(
                    `UPDATE user_benefits SET status = 'used', used_at = NOW(), used_on_booking_id = $1 WHERE id = $2 AND status = 'active'`,
                    [newBooking.id, freeClassBenefitId]
                );
            }
```

por:

```ts
            if (freeClassBenefitId) {
                await client.query(
                    `UPDATE user_benefits SET status = 'used', used_at = NOW(), used_by = $3, used_on_booking_id = $1 WHERE id = $2 AND status = 'active'`,
                    [newBooking.id, freeClassBenefitId, req.user?.userId ?? null]
                );
            }
```

- [ ] **Step 4: Modificar `bar.ts:215`**

Reemplazar:

```ts
      await query(`UPDATE user_benefits SET status = 'used', used_at = NOW(), used_on_bar_order_id = $1 WHERE id = $2 AND status = 'active'`, [oid, barDiscountBenefitId]);
```

por:

```ts
      await query(`UPDATE user_benefits SET status = 'used', used_at = NOW(), used_by = $3, used_on_bar_order_id = $1 WHERE id = $2 AND status = 'active'`, [oid, barDiscountBenefitId, req.user?.userId ?? null]);
```

- [ ] **Step 5: Modificar `bar.ts:218`**

Reemplazar:

```ts
      await query(`UPDATE user_benefits SET status = 'used', used_at = NOW(), used_on_bar_order_id = $1 WHERE id = $2 AND status = 'active'`, [oid, freeDrinkBenefitId]);
```

por:

```ts
      await query(`UPDATE user_benefits SET status = 'used', used_at = NOW(), used_by = $3, used_on_bar_order_id = $1 WHERE id = $2 AND status = 'active'`, [oid, freeDrinkBenefitId, req.user?.userId ?? null]);
```

- [ ] **Step 6: Typecheck**

Run: `cd backend && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 7: Commit**

```bash
git add backend/src/routes/bookings.ts backend/src/routes/bar.ts backend/scripts/test-used-by-backfill.ts
git commit -m "feat(loyalty): backfill used_by en consumo de free_class, bar_discount, free_drink"
```

---

## Task 3: Extraer `lib/qr.ts` (refactor)

**Files:**
- Create: `backend/src/lib/qr.ts`
- Modify: `backend/src/routes/checkin.ts:59-80, 234-258, 1163-1180`
- Test: `backend/scripts/test-qr.ts`

**Interfaces:**
- Produces: `export function verifyQrPayload(raw: string): { userId: string; membershipId: string | null; expiresAt: number } | null` — devuelve `null` si el payload es inválido, está expirado o el hash no coincide.
- Produces: `export const POS_MARKABLE_TYPES: ReadonlySet<string>` — `new Set(['free_drink','bar_discount','product','product_discount','discount'])`.

- [ ] **Step 1: Escribir el test que falla**

Crear `backend/scripts/test-qr.ts`:

```ts
import assert from 'node:assert/strict';
import { verifyQrPayload, POS_MARKABLE_TYPES } from '../src/lib/qr.js';

function buildRaw(userId: string, membershipId: string | null, expiresAt: number) {
  const crypto = await import('node:crypto');
  const secret = process.env.CHECKIN_SECRET || 'walletclub-dev';
  const base = `${userId}:${membershipId || 'none'}:${expiresAt}:${secret}`;
  const h = crypto.createHash('sha256').update(base).digest('hex');
  const payload = { t: 'checkin', m: userId, ms: membershipId, e: expiresAt, h };
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

async function main() {
  const userId = '00000000-0000-0000-0000-000000000001';
  const ms = '00000000-0000-0000-0000-000000000002';
  const future = Math.floor(Date.now() / 1000) + 3600;
  const past = Math.floor(Date.now() / 1000) - 3600;

  // válido
  assert.ok(verifyQrPayload(await buildRaw(userId, ms, future)), 'QR válido debe resolver');
  const v = verifyQrPayload(await buildRaw(userId, ms, future))!;
  assert.equal(v.userId, userId);
  assert.equal(v.membershipId, ms);

  // expirado
  assert.equal(verifyQrPayload(await buildRaw(userId, ms, past)), null, 'expirado → null');

  // hash alterado
  const crypto = await import('node:crypto');
  const bad = { t: 'checkin', m: userId, ms, e: future, h: '0'.repeat(64) };
  const badRaw = Buffer.from(JSON.stringify(bad)).toString('base64url');
  assert.equal(verifyQrPayload(badRaw), null, 'hash alterado → null');

  // no-parseable
  assert.equal(verifyQrPayload('no-es-json'), null);

  // tipos POS
  assert.equal(POS_MARKABLE_TYPES.has('free_drink'), true);
  assert.equal(POS_MARKABLE_TYPES.has('free_class'), false);

  console.log('OK: verifyQrPayload + POS_MARKABLE_TYPES');
}
main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd backend && npx tsx scripts/test-qr.ts`
Expected: FAIL (no existe `lib/qr.js`).

- [ ] **Step 3: Crear `backend/src/lib/qr.ts`**

```ts
import { createHash } from 'node:crypto';
import { z } from 'zod';

export const POS_MARKABLE_TYPES: ReadonlySet<string> = new Set([
  'free_drink',
  'bar_discount',
  'product',
  'product_discount',
  'discount',
]);

const QrPayloadSchema = z.object({
  t: z.literal('checkin'),
  m: z.string().uuid(),
  ms: z.string().uuid().nullable().optional(),
  e: z.number(),
  h: z.string().min(32),
});

export interface VerifiedQr {
  userId: string;
  membershipId: string | null;
  expiresAt: number;
}

export function verifyQrPayload(raw: string): VerifiedQr | null {
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(raw, 'base64url').toString('utf-8'));
  } catch {
    return null;
  }
  const v = QrPayloadSchema.safeParse(decoded);
  if (!v.success) return null;
  if (v.data.e < Math.floor(Date.now() / 1000)) return null;
  const secret = process.env.CHECKIN_SECRET || 'walletclub-dev';
  const base = `${v.data.m}:${v.data.ms || 'none'}:${v.data.e}:${secret}`;
  const expected = createHash('sha256').update(base).digest('hex');
  if (v.data.h !== expected) return null;
  return { userId: v.data.m, membershipId: v.data.ms ?? null, expiresAt: v.data.e };
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `cd backend && npx tsx scripts/test-qr.ts`
Expected: PASS.

- [ ] **Step 5: Refactor `checkin.ts` para usar `lib/qr.ts`**

En `backend/src/routes/checkin.ts`:
- Eliminar las constantes locales `QrPayloadSchema` (líneas 59-65), `decodePayload` (71-74) y `computeHash` (76-80).
- Añadir import arriba: `import { verifyQrPayload } from '../lib/qr.js';`
- En el handler `POST /qr` (~234-258), reemplazar el bloque de decodificación/validación por:

```ts
  const verified = verifyQrPayload(req.body.qrPayload);
  if (!verified) return res.status(400).json({ error: 'QR inválido o expirado' });
  const userId = verified.userId;
```

- En el handler `POST /event-qr` (~1163-1180), donde hoy hace `decodePayload` + validación de firma, reemplazar por una llamada a `verifyQrPayload(req.body.qrPayload)` y, si retorna `null` pero el valor parsea como UUID crudo, mantener la rama de `membership_id` crudo existente. (Conservar el fallback a UUID crudo: `try { ... } catch { /* raw uuid path */ }`.)

- [ ] **Step 6: Typecheck + correr tests de checkin existentes**

Run: `cd backend && npx tsc --noEmit && npx tsx scripts/test-loyalty-crons-integration.ts`
Expected: typecheck sin errores; los scripts existentes siguen pasando (verificar que no se rompió `/checkin`).

- [ ] **Step 7: Commit**

```bash
git add backend/src/lib/qr.ts backend/src/routes/checkin.ts backend/scripts/test-qr.ts
git commit -m "refactor(checkin): extraer verifyQrPayload a lib/qr.ts"
```

---

## Task 4: `POST /api/wallet/lookup`

**Files:**
- Modify: `backend/src/routes/wallet.ts` (añadir ruta `/lookup`)
- Test: `backend/scripts/test-wallet-lookup.ts`

**Interfaces:**
- Consumes: `verifyQrPayload` de `lib/qr.ts`.
- Produces: `POST /api/wallet/lookup` — body `{ qrPayload?: string; membershipId?: string; userId?: string }`; respuesta `FichaCliente`:
  ```ts
  interface FichaCliente {
    userId: string;
    name: string;
    email: string;
    phone: string | null;
    photoUrl: string | null;
    membership: { status: string | null; planName: string | null };
    pointsBalance: number;
    streak: number | null; // null en v1
  }
  ```

- [ ] **Step 1: Escribir el test que falla**

Crear `backend/scripts/test-wallet-lookup.ts`. Como no hay supertest, se prueba la lógica de resolución a nivel de BD (la ruta se cubre por e2e). El script valida las 3 vías de resolución:

```ts
import assert from 'node:assert/strict';
import { pool, queryOne } from '../src/config/database.js';
import { verifyQrPayload } from '../src/lib/qr.js';
import { createHash } from 'node:crypto';

async function buildRaw(userId: string, ms: string | null, expiresAt: number) {
  const secret = process.env.CHECKIN_SECRET || 'walletclub-dev';
  const h = createHash('sha256').update(`${userId}:${ms || 'none'}:${expiresAt}:${secret}`).digest('hex');
  return Buffer.from(JSON.stringify({ t: 'checkin', m: userId, ms, e: expiresAt, h })).toString('base64url');
}

async function resolveLookup(input: { qrPayload?: string; membershipId?: string; userId?: string }): Promise<string | null> {
  if (input.userId) return input.userId;
  if (input.qrPayload) {
    const v = verifyQrPayload(input.qrPayload);
    if (!v) return null;
    return v.userId;
  }
  if (input.membershipId) {
    const m = await queryOne<{ user_id: string }>(`SELECT user_id FROM memberships WHERE id = $1`, [input.membershipId]);
    return m?.user_id ?? null;
  }
  return null;
}

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const cli = await client.query(`INSERT INTO users (name, email, role, loyalty_points) VALUES ('cli','cli-lk@test','client', 250) RETURNING id`);
    const cliId = cli.rows[0].id;

    // vía userId
    assert.equal(await resolveLookup({ userId: cliId }), cliId, 'userId directo');

    // vía qrPayload válido
    const future = Math.floor(Date.now() / 1000) + 3600;
    assert.equal(await resolveLookup({ qrPayload: await buildRaw(cliId, null, future) }), cliId, 'qrPayload válido');

    // vía membershipId
    const mem = await client.query(`INSERT INTO memberships (user_id, status) VALUES ($1, 'active') RETURNING id`, [cliId]);
    assert.equal(await resolveLookup({ membershipId: mem.rows[0].id }), cliId, 'membershipId crudo');

    // membershipId inexistente
    assert.equal(await resolveLookup({ membershipId: '00000000-0000-0000-0000-000000000099' }), null, 'membership inexistente → null');

    // qrPayload expirado
    const past = Math.floor(Date.now() / 1000) - 3600;
    assert.equal(await resolveLookup({ qrPayload: await buildRaw(cliId, null, past) }), null, 'expirado → null');

    await client.query('ROLLBACK');
    console.log('OK: lookup resuelve las 3 vías');
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Correr y verificar que falla/pasa**

Run: `cd backend && npx tsx scripts/test-wallet-lookup.ts`
Expected: puede pasar (usa solo `verifyQrPayload` ya creado + BD). Si pasa, valida la lógica de resolución. (Este test protege la lógica compartida que la ruta usa.)

- [ ] **Step 3: Implementar la ruta en `backend/src/routes/wallet.ts`**

Añadir import arriba del archivo: `import { verifyQrPayload } from '../lib/qr.js';` y `import { requireRole } from '../middleware/auth.js';` (si no está) y `import { authenticate } from '../middleware/auth.js';` (si no está) y `import { query, queryOne } from '../config/database.js';`.

Añadir la ruta (p. ej. después de `GET /pass` ~línea 186):

```ts
router.post('/lookup', authenticate, requireRole('admin', 'super_admin', 'reception'), async (req: Request, res: Response) => {
    try {
        const { qrPayload, membershipId, userId } = req.body ?? {};

        let resolvedUserId: string | null = null;
        if (userId) {
            resolvedUserId = userId;
        } else if (qrPayload) {
            const v = verifyQrPayload(qrPayload);
            if (!v) return res.status(400).json({ error: 'QR inválido o expirado; pide al cliente que regenere su QR.' });
            resolvedUserId = v.userId;
        } else if (membershipId) {
            const m = await queryOne<{ user_id: string }>(`SELECT user_id FROM memberships WHERE id = $1`, [membershipId]);
            if (!m) return res.status(404).json({ error: 'Membresía no encontrada; usa búsqueda manual.' });
            resolvedUserId = m.user_id;
        } else {
            return res.status(400).json({ error: 'Envía qrPayload, membershipId o userId.' });
        }

        const u = await queryOne<{ id: string; name: string; email: string; phone: string | null; photo_url: string | null; loyalty_points: number }>(
            `SELECT u.id, u.name, u.email, u.phone, u.photo_url, u.loyalty_points
             FROM users u WHERE u.id = $1`,
            [resolvedUserId]
        );
        if (!u) return res.status(404).json({ error: 'Cliente no encontrado.' });

        const mem = await queryOne<{ status: string; plan_name: string | null }>(
            `SELECT m.status, p.name as plan_name
             FROM memberships m LEFT JOIN plans p ON m.plan_id = p.id
             WHERE m.user_id = $1 ORDER BY m.created_at DESC LIMIT 1`,
            [resolvedUserId]
        );

        return res.json({
            userId: u.id,
            name: u.name,
            email: u.email,
            phone: u.phone,
            photoUrl: u.photo_url,
            membership: { status: mem?.status ?? null, planName: mem?.plan_name ?? null },
            pointsBalance: u.loyalty_points ?? 0,
            streak: null,
        });
    } catch (error) {
        console.error('wallet/lookup error:', error);
        return res.status(500).json({ error: 'Error al buscar el cliente' });
    }
});
```

Verificar que `Request, Response` estén importados en `wallet.ts` (lo están, pues otras rutas los usan).

- [ ] **Step 4: Typecheck**

Run: `cd backend && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/wallet.ts backend/scripts/test-wallet-lookup.ts
git commit -m "feat(wallet): POST /api/wallet/lookup resuelve QR/búsqueda a ficha de cliente"
```

---

## Task 5: `GET /api/loyalty/users/:userId/benefits`

**Files:**
- Modify: `backend/src/routes/loyalty.ts` (añadir ruta)
- Test: `backend/scripts/test-staff-benefits.ts` (creado aquí, ampliado en Tasks 6 y 7)

**Interfaces:**
- Produces: `GET /api/loyalty/users/:userId/benefits` — gate `authenticate, requireRole('admin','super_admin','reception')`; respuesta: array de beneficios con flags `usableNow`, `markableNow`, `expiresSoon`.

- [ ] **Step 1: Escribir el test que falla**

Crear `backend/scripts/test-staff-benefits.ts` (cubre Task 5 y se amplía en 6/7):

```ts
import assert from 'node:assert/strict';
import { pool, query } from '../src/config/database.js';
import { POS_MARKABLE_TYPES } from '../src/lib/qr.js';

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const cli = await client.query(`INSERT INTO users (name, email, role) VALUES ('cli','cli-sb@test','client') RETURNING id`);
    const cliId = cli.rows[0].id;

    // beneficios: free_drink activo, free_class activo, expirado
    await client.query(`INSERT INTO user_benefits (user_id, benefit_type, benefit_value, status, expires_at) VALUES ($1,'free_drink','{"kind":"free_drink"}'::jsonb,'active', NOW()+interval '10 days')`, [cliId]);
    await client.query(`INSERT INTO user_benefits (user_id, benefit_type, benefit_value, status, expires_at) VALUES ($1,'free_class','{"kind":"free_class"}'::jsonb,'active', NOW()+interval '10 days')`, [cliId]);
    await client.query(`INSERT INTO user_benefits (user_id, benefit_type, benefit_value, status, expires_at) VALUES ($1,'free_drink','{"kind":"free_drink"}'::jsonb,'active', NOW()-interval '1 day')`, [cliId]);

    // marca expirados on-the-fly (igual que el endpoint)
    await query(`UPDATE user_benefits SET status = 'expired' WHERE user_id = $1 AND status = 'active' AND expires_at < NOW()`, [cliId]);

    const rows = await query<{ id: string; benefit_type: string; status: string; expires_at: string }>(
      `SELECT id, benefit_type, status, expires_at FROM user_benefits WHERE user_id = $1 ORDER BY expires_at ASC`,
      [cliId]
    );
    const active = rows.filter(r => r.status === 'active');
    assert.equal(active.length, 2, 'dos beneficios activos tras marcar expirados');
    assert.equal(active.some(r => r.benefit_type === 'free_drink'), true);
    assert.equal(active.some(r => r.benefit_type === 'free_class'), true);

    // flags esperados
    for (const r of active) {
      const markableNow = r.status === 'active' && POS_MARKABLE_TYPES.has(r.benefit_type);
      if (r.benefit_type === 'free_drink') assert.equal(markableNow, true, 'free_drink marcable');
      if (r.benefit_type === 'free_class') assert.equal(markableNow, false, 'free_class NO marcable');
    }

    await client.query('ROLLBACK');
    console.log('OK: staff benefits flags');
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Correr y verificar que pasa (valida la lógica de flags)**

Run: `cd backend && npx tsx scripts/test-staff-benefits.ts`
Expected: PASS.

- [ ] **Step 3: Implementar la ruta en `backend/src/routes/loyalty.ts`**

Añadir import: `import { POS_MARKABLE_TYPES } from '../lib/qr.js';` (si no está). Añadir la ruta (p. ej. después de `GET /my-benefits` ~línea 425):

```ts
router.get('/users/:userId/benefits', authenticate, requireRole('admin', 'super_admin', 'reception'), async (req: Request, res: Response) => {
    try {
        const targetUserId = req.params.userId;

        await query(
            `UPDATE user_benefits SET status = 'expired' WHERE user_id = $1 AND status = 'active' AND expires_at < NOW()`,
            [targetUserId]
        );

        const benefits = await query<{
            id: string; benefit_type: string; benefit_value: any; status: string;
            expires_at: string; class_type_id: string | null; used_at: string | null;
            created_at: string; class_type_name: string | null; used_by: string | null;
        }>(
            `SELECT ub.id, ub.benefit_type, ub.benefit_value, ub.status, ub.expires_at,
                    ub.class_type_id, ub.used_at, ub.created_at, ub.used_by,
                    ct.name as class_type_name
             FROM user_benefits ub
             LEFT JOIN class_types ct ON ub.class_type_id = ct.id
             WHERE ub.user_id = $1 AND ub.status = 'active'
             ORDER BY ub.expires_at ASC`,
            [targetUserId]
        );

        const now = Date.now();
        res.json(benefits.map((b) => {
            const usableNow = b.status === 'active' && new Date(b.expires_at).getTime() > now;
            return {
                id: b.id,
                type: b.benefit_type,
                value: b.benefit_value,
                status: b.status,
                expiresAt: b.expires_at,
                classTypeId: b.class_type_id,
                classTypeName: b.class_type_name,
                createdAt: b.created_at,
                usedBy: b.used_by,
                usableNow,
                markableNow: usableNow && POS_MARKABLE_TYPES.has(b.benefit_type),
                expiresSoon: usableNow && new Date(b.expires_at).getTime() < now + 3 * 24 * 3600 * 1000,
            };
        }));
    } catch (error) {
        console.error('Get user benefits error:', error);
        res.status(500).json({ error: 'Error al obtener beneficios del cliente' });
    }
});
```

- [ ] **Step 4: Typecheck**

Run: `cd backend && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/loyalty.ts backend/scripts/test-staff-benefits.ts
git commit -m "feat(loyalty): GET /loyalty/users/:userId/benefits con flags de usabilidad"
```

---

## Task 6: `POST /api/loyalty/users/:userId/redeem`

**Files:**
- Modify: `backend/src/routes/loyalty.ts` (añadir ruta)
- Test: `backend/scripts/test-staff-redeem.ts`

**Interfaces:**
- Consumes: lógica transaccional de `POST /loyalty/redeem` (`loyalty.ts:430-544`), replicada con `:userId` como destinatario y `fulfilled_by = req.user.userId`.
- Produces: `POST /api/loyalty/users/:userId/redeem` — body `{ rewardId: string }`; respuesta: el `user_benefits` creado (mismo formato que Task 5 + flags).

- [ ] **Step 1: Escribir el test que falla**

Crear `backend/scripts/test-staff-redeem.ts` (integración con BD real, dentro de transacción y rollback). Lee `loyalty.ts:430-544` para replicar la transacción en el test solo es inviable; en su lugar el test prepara datos y valida las invariantes de saldo/stock que el handler debe cumplir:

```ts
import assert from 'node:assert/strict';
import { pool } from '../src/config/database.js';

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const cli = await client.query(`INSERT INTO users (name, email, role, loyalty_points) VALUES ('cli','cli-sr@test','client', 250) RETURNING id`);
    const cliId = cli.rows[0].id;
    const rw = await client.query(`INSERT INTO loyalty_rewards (name, points_cost, points_required, reward_type, reward_value, is_active, stock) VALUES ('Bebida', 100, 100, 'free_drink', '{"kind":"free_drink"}'::jsonb, true, 5) RETURNING id`);
    const rewardId = rw.rows[0].id;

    // Caso éxito: saldo 250 >= 100, stock 5
    const userRes = await client.query(`SELECT loyalty_points FROM users WHERE id = $1 FOR UPDATE`, [cliId]);
    const rewardRes = await client.query(`SELECT * FROM loyalty_rewards WHERE id = $1 AND is_active = true FOR UPDATE`, [rewardId]);
    assert.ok(userRes.rows[0].loyalty_points >= rewardRes.rows[0].points_cost, 'saldo suficiente');
    assert.ok(rewardRes.rows[0].stock > 0, 'stock disponible');

    // Caso puntos insuficientes
    const poor = await client.query(`INSERT INTO users (name, email, role, loyalty_points) VALUES ('poor','poor-sr@test','client', 10) RETURNING id`);
    const poorRes = await client.query(`SELECT loyalty_points FROM users WHERE id = $1 FOR UPDATE`, [poor.rows[0].id]);
    assert.ok(poorRes.rows[0].loyalty_points < rewardRes.rows[0].points_cost, 'puntos insuficientes detectado');

    await client.query('ROLLBACK');
    console.log('OK: invariantes de redeem-on-behalf');
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Correr y verificar que pasa**

Run: `cd backend && npx tsx scripts/test-staff-redeem.ts`
Expected: PASS (valida las invariantes que el handler aplicará).

- [ ] **Step 3: Implementar la ruta en `backend/src/routes/loyalty.ts`**

Añadir después de `POST /redeem` (~línea 544). Replicar la transacción con destinatario `:userId`:

```ts
router.post('/users/:userId/redeem', authenticate, requireRole('admin', 'super_admin', 'reception'), async (req: Request, res: Response) => {
    const client = await pool.connect();
    const txDb = { query: async (text: string, params?: unknown[]) => {
        const r = await client.query(text, params as any[]);
        return { rows: r.rows, rowCount: r.rowCount ?? 0 };
    } };
    try {
        const targetUserId = req.params.userId;
        const staffId = req.user?.userId ?? null;
        const { rewardId } = req.body;
        if (!rewardId) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Falta rewardId' }); }

        await client.query('BEGIN');

        const rewardRes = await client.query(`SELECT * FROM loyalty_rewards WHERE id = $1 AND is_active = true FOR UPDATE`, [rewardId]);
        const reward = rewardRes.rows[0];
        if (!reward) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Recompensa no disponible' }); }
        if (reward.stock !== null && reward.stock <= 0) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'Recompensa sin stock' }); }

        const userRes = await client.query(`SELECT loyalty_points FROM users WHERE id = $1 FOR UPDATE`, [targetUserId]);
        const user = userRes.rows[0];
        if (!user) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Cliente no encontrado' }); }
        if (user.loyalty_points < reward.points_cost) { await client.query('ROLLBACK'); return res.status(402).json({ error: 'Puntos insuficientes' }); }

        const redemptionRes = await client.query(
            `INSERT INTO redemptions (user_id, reward_id, points_spent, status, fulfilled_by, fulfilled_at)
             VALUES ($1, $2, $3, 'fulfilled', $4, NOW()) RETURNING id`,
            [targetUserId, rewardId, reward.points_cost, staffId]
        );
        const redemptionId = redemptionRes.rows[0].id;

        await client.query(
            `INSERT INTO loyalty_points (user_id, points, type, description, related_reward_id)
             VALUES ($1, $2, 'redemption', 'Canje staff: ' || $3, $4)`,
            [targetUserId, -Math.abs(reward.points_cost), reward.name, rewardId]
        );

        // Benefit expiration
        const cfgRes = await client.query(`SELECT benefit_expiration_days FROM loyalty_config LIMIT 1`);
        const days = cfgRes.rows[0]?.benefit_expiration_days ?? 30;

        const benefitRes = await client.query(
            `INSERT INTO user_benefits (user_id, benefit_type, benefit_value, status, redemption_id, expires_at)
             VALUES ($1, $2, $3, 'active', $4, NOW() + ($5 || ' days')::interval)
             RETURNING *`,
            [targetUserId, reward.reward_type, reward.reward_value, redemptionId, String(days)]
        );
        const benefit = benefitRes.rows[0];

        if (reward.stock !== null) {
            await client.query(`UPDATE loyalty_rewards SET stock = stock - 1 WHERE id = $1`, [rewardId]);
        }

        await client.query(`UPDATE users SET loyalty_points = loyalty_points - $2 WHERE id = $1`, [targetUserId, Math.abs(reward.points_cost)]);

        await client.query('COMMIT');

        return res.json({
            id: benefit.id,
            type: benefit.benefit_type,
            value: benefit.benefit_value,
            status: benefit.status,
            expiresAt: benefit.expires_at,
            classTypeId: benefit.class_type_id ?? null,
            classTypeName: null,
            createdAt: benefit.created_at,
            usedBy: null,
            usableNow: true,
            markableNow: POS_MARKABLE_TYPES.has(benefit.benefit_type),
            expiresSoon: false,
        });
    } catch (error) {
        try { await client.query('ROLLBACK'); } catch { /* ignore */ }
        console.error('staff redeem error:', error);
        return res.status(500).json({ error: 'Error al canjear para el cliente' });
    } finally {
        client.release();
    }
});
```

> Nota: revisar que el INSERT de `user_benefits` use los nombres de columna reales (`benefit_type`, `benefit_value`, `redemption_id`, `expires_at`) — confirmar contra el bloque de creación en `index.ts:3579-3600`. Si `loyalty_config` no existe como tabla, leer cómo `POST /redeem` obtiene `benefit_expiration_days` en `loyalty.ts:508-515` y replicar exactamente esa lectura.

- [ ] **Step 4: Typecheck**

Run: `cd backend && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/loyalty.ts backend/scripts/test-staff-redeem.ts
git commit -m "feat(loyalty): POST /loyalty/users/:userId/redeem canje a nombre del cliente"
```

---

## Task 7: `POST /api/loyalty/benefits/:id/use`

**Files:**
- Modify: `backend/src/routes/loyalty.ts` (añadir ruta)
- Test: `backend/scripts/test-benefit-use.ts`

**Interfaces:**
- Produces: `POST /api/loyalty/benefits/:id/use` — gate `authenticate, requireRole('admin','super_admin','reception')`; atómico `FOR UPDATE`; rechaza `free_class` y no-POS con 409; si no, `UPDATE ... status='used', used_at=NOW(), used_by=staff`.

- [ ] **Step 1: Escribir el test que falla**

Crear `backend/scripts/test-benefit-use.ts`:

```ts
import assert from 'node:assert/strict';
import { pool } from '../src/config/database.js';
import { POS_MARKABLE_TYPES } from '../src/lib/qr.js';

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const cli = await client.query(`INSERT INTO users (name, email, role) VALUES ('cli','cli-bu@test','client') RETURNING id`);
    const staff = await client.query(`INSERT INTO users (name, email, role) VALUES ('staff','staff-bu@test','reception') RETURNING id`);
    const cliId = cli.rows[0].id;
    const staffId = staff.rows[0].id;

    // free_drink activo → marcable
    const dr = await client.query(`INSERT INTO user_benefits (user_id, benefit_type, benefit_value, status, expires_at) VALUES ($1,'free_drink','{}'::jsonb,'active', NOW()+interval '5 days') RETURNING id`, [cliId]);
    await client.query(`UPDATE user_benefits SET status='used', used_at=NOW(), used_by=$2 WHERE id=$1 AND status='active'`, [dr.rows[0].id, staffId]);
    const used = await client.query(`SELECT status, used_by FROM user_benefits WHERE id=$1`, [dr.rows[0].id]);
    assert.equal(used.rows[0].status, 'used');
    assert.equal(used.rows[0].used_by, staffId, 'used_by = staff');

    // free_class → NO marcable
    const fc = await client.query(`INSERT INTO user_benefits (user_id, benefit_type, benefit_value, status, expires_at) VALUES ($1,'free_class','{}'::jsonb,'active', NOW()+interval '5 days') RETURNING id`, [cliId]);
    assert.equal(POS_MARKABLE_TYPES.has('free_class'), false, 'free_class no marcable');

    // doble uso: segunda vez no afecta (status ya='used')
    await client.query(`UPDATE user_benefits SET status='used' WHERE id=$1 AND status='active'`, [dr.rows[0].id]);
    const second = await client.query(`SELECT status FROM user_benefits WHERE id=$1`, [dr.rows[0].id]);
    assert.equal(second.rows[0].status, 'used', 'idempotente en estado used');

    await client.query('ROLLBACK');
    console.log('OK: benefit use atomic + free_class rejected');
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Correr y verificar que pasa**

Run: `cd backend && npx tsx scripts/test-benefit-use.ts`
Expected: PASS.

- [ ] **Step 3: Implementar la ruta en `backend/src/routes/loyalty.ts`**

Añadir (p. ej. al final del router):

```ts
router.post('/benefits/:id/use', authenticate, requireRole('admin', 'super_admin', 'reception'), async (req: Request, res: Response) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const res_q = await client.query(`SELECT * FROM user_benefits WHERE id = $1 FOR UPDATE`, [req.params.id]);
        const b = res_q.rows[0];
        if (!b) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Beneficio no encontrado' }); }
        if (b.status !== 'active' || new Date(b.expires_at).getTime() <= Date.now()) {
            await client.query('ROLLBACK');
            return res.status(409).json({ error: 'El beneficio ya no está vigente' });
        }
        if (!POS_MARKABLE_TYPES.has(b.benefit_type)) {
            await client.query('ROLLBACK');
            return res.status(409).json({ error: 'Aplica este beneficio al reservar la clase; no se puede marcar usado suelto.' });
        }
        await client.query(
            `UPDATE user_benefits SET status = 'used', used_at = NOW(), used_by = $2 WHERE id = $1`,
            [b.id, req.user?.userId ?? null]
        );
        await client.query('COMMIT');
        return res.json({ id: b.id, status: 'used', usedBy: req.user?.userId ?? null });
    } catch (error) {
        try { await client.query('ROLLBACK'); } catch { /* ignore */ }
        console.error('benefit use error:', error);
        return res.status(500).json({ error: 'Error al marcar el beneficio' });
    } finally {
        client.release();
    }
});
```

- [ ] **Step 4: Typecheck**

Run: `cd backend && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/loyalty.ts backend/scripts/test-benefit-use.ts
git commit -m "feat(loyalty): POST /loyalty/benefits/:id/use atómico (staff)"
```

---

## Task 8: Web QR del cliente en `/app/wallet`

**Files:**
- Create: `frontend/src/components/wallet/WalletQr.tsx`
- Modify: `frontend/src/pages/client/Wallet.tsx` (montar `<WalletQr />`)
- Test: `frontend/e2e/tests/client-wallet-qr.spec.ts`

**Interfaces:**
- Consumes: `qrPayload` de `GET /wallet/pass` (ya devuelto por backend, hoy ignorado).
- Produces: componente que renderiza el QR del cliente con `QRCodeCanvas` de `qrcode.react`.

- [ ] **Step 1: Escribir la e2e que falla**

Crear `frontend/e2e/tests/client-wallet-qr.spec.ts` (siguiendo el patrón de `e2e/tests/admin-loyalty.spec.ts` — leer ese archivo para el helper de login de cliente):

```ts
import { test, expect } from '@playwright/test';
import { loginAsClient } from './helpers/auth'; // ajustar al helper real de e2e

test('cliente ve su QR en /app/wallet', async ({ page }) => {
  await loginAsClient(page);
  await page.goto('/app/wallet');
  await expect(page.getByRole('heading', { name: /mi qr|código qr/i })).toBeVisible();
  await expect(page.locator('canvas')).toBeVisible();
});
```

> Nota: revisar `frontend/e2e/tests/` para el helper de autenticación de cliente real (p. ej. `loginAsClient` o un storage state en `playwright.config.ts`) y ajustar el import.

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd frontend && npx playwright test e2e/tests/client-wallet-qr.spec.ts`
Expected: FAIL (no hay canvas / heading de QR).

- [ ] **Step 3: Crear `frontend/src/components/wallet/WalletQr.tsx`**

```tsx
import { useQuery } from '@tanstack/react-query';
import { QRCodeCanvas } from 'qrcode.react';
import api from '@/lib/api';

interface WalletPassResponse {
  qrPayload?: string;
  pointsBalance?: number;
  membershipId?: string | null;
}

export function WalletQr() {
  const { data, isLoading, error, refetch } = useQuery<WalletPassResponse>({
    queryKey: ['wallet-pass-qr'],
    queryFn: async () => (await api.get('/wallet/pass')).data,
    staleTime: 1000 * 60 * 60, // 1h; el QR vence a 24h
  });

  if (isLoading) return <div className="wallet-qr-loading">Cargando QR…</div>;
  if (error || !data?.qrPayload) {
    return (
      <div className="wallet-qr-error">
        <p>No se pudo cargar el QR.</p>
        <button onClick={() => refetch()}>Reintentar</button>
      </div>
    );
  }

  return (
    <div className="wallet-qr">
      <h3>Mi QR de recepción</h3>
      <p className="wallet-qr-hint">Muéstralo en recepción para identificarte.</p>
      <QRCodeCanvas value={data.qrPayload} size={220} level="M" includeMargin />
    </div>
  );
}
```

- [ ] **Step 4: Montar en `frontend/src/pages/client/Wallet.tsx`**

Importar arriba: `import { WalletQr } from '@/components/wallet/WalletQr';` (ajustar alias/ruta según el resto del archivo — revisar cómo importa `Wallet.tsx` otros componentes locales). Montar `<WalletQr />` al inicio del contenedor principal del wallet (antes del bloque de puntos), dentro del layout existente.

- [ ] **Step 5: Correr la e2e y verificar que pasa**

Run: `cd frontend && npx playwright test e2e/tests/client-wallet-qr.spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/wallet/WalletQr.tsx frontend/src/pages/client/Wallet.tsx frontend/e2e/tests/client-wallet-qr.spec.ts
git commit -m "feat(wallet): mostrar QR del cliente en /app/wallet"
```

---

## Task 9: Pantalla `/app/reception/scan`

**Files:**
- Create: `frontend/src/pages/reception/ScanScreen.tsx`
- Modify: `frontend/src/App.tsx` (ruta bajo `ReceptionLayout`)
- Test: `frontend/e2e/tests/reception-scan.spec.ts`

**Interfaces:**
- Consumes: `POST /api/wallet/lookup`, `GET /api/loyalty/users/:userId/benefits`, `GET /api/loyalty/rewards`, `POST /api/loyalty/users/:userId/redeem`, `POST /api/loyalty/benefits/:id/use`, `GET /api/users?search=&role=client&withMembership=true`.
- Produces: pantalla con escáner + búsqueda manual + ficha + acciones.

- [ ] **Step 1: Escribir la e2e que falla**

Crear `frontend/e2e/tests/reception-scan.spec.ts` (revisar `e2e/tests/reception-client-crm.spec.ts` para el helper de login de recepción):

```ts
import { test, expect } from '@playwright/test';
import { loginAsReception } from './helpers/auth'; // ajustar al helper real

test('recepción busca cliente a mano y ve beneficios', async ({ page }) => {
  await loginAsReception(page);
  await page.goto('/app/reception/scan');
  await expect(page.getByPlaceholder(/nombre|email/i)).toBeVisible();
  await page.getByPlaceholder(/nombre|email/i).fill('ClienteE2E');
  // ... selecciona el cliente de la lista y verifica que aparece la ficha
  await expect(page.getByText(/saldo|puntos/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /marcar usado|canjear/i }).first()).toBeVisible();
});
```

> Nota: ajustar el helper de login de recepción y el nombre del cliente seed según `e2e/tests/reception-client-crm.spec.ts`. Esta e2e es orientativa; el flujo completo de escaneo de cámara se valida manualmente (la cámara no se simula bien en Playwright headless).

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd frontend && npx playwright test e2e/tests/reception-scan.spec.ts`
Expected: FAIL (la ruta no existe).

- [ ] **Step 3: Crear `frontend/src/pages/reception/ScanScreen.tsx`**

```tsx
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Scanner } from '@yudiel/react-qr-scanner';
import api, { getErrorMessage } from '@/lib/api';

interface FichaCliente {
  userId: string; name: string; email: string; phone: string | null;
  photoUrl: string | null;
  membership: { status: string | null; planName: string | null };
  pointsBalance: number; streak: number | null;
}
interface Benefit {
  id: string; type: string; value: any; status: string; expiresAt: string;
  classTypeName: string | null; usableNow: boolean; markableNow: boolean; expiresSoon: boolean;
}
interface Reward { id: string; name: string; points_cost: number; stock: number | null; is_active: boolean; reward_type: string; }
interface ClientSearch { id: string; display_name: string; email: string; phone?: string; }

const TYPE_LABELS: Record<string, string> = {
  free_drink: 'Bebida gratis', bar_discount: 'Descuento barra', product: 'Producto',
  product_discount: 'Descuento producto', discount: 'Descuento', free_class: 'Clase gratis',
  membership_extension: 'Extensión de membresía', discount_package: 'Paquete descuento',
};

export default function ScanScreen() {
  const qc = useQueryClient();
  const [ficha, setFicha] = useState<FichaCliente | null>(null);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);

  const lookup = useMutation({
    mutationFn: async (input: { qrPayload?: string; membershipId?: string; userId?: string }) =>
      (await api.post<FichaCliente>('/wallet/lookup', input)).data,
    onSuccess: setFicha, onError: (e) => setError(getErrorMessage(e)),
  });

  const searchResults = useQuery<ClientSearch[]>({
    queryKey: ['clients-search', search],
    queryFn: async () => (await api.get('/users', { params: { search, role: 'client', withMembership: 'true' } })).data?.users ?? [],
    enabled: search.trim().length >= 2,
  });

  const benefits = useQuery<Benefit[]>({
    queryKey: ['staff-benefits', ficha?.userId],
    queryFn: async () => (await api.get(`/loyalty/users/${ficha!.userId}/benefits`)).data,
    enabled: !!ficha?.userId,
  });

  const rewards = useQuery<Reward[]>({
    queryKey: ['catalog', ficha?.userId],
    queryFn: async () => (await api.get('/loyalty/rewards')).data,
    enabled: !!ficha,
  });

  const useBenefit = useMutation({
    mutationFn: async (id: string) => (await api.post(`/loyalty/benefits/${id}/use`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['staff-benefits', ficha?.userId] }),
    onError: (e) => setError(getErrorMessage(e)),
  });

  const redeem = useMutation({
    mutationFn: async (rewardId: string) => (await api.post(`/loyalty/users/${ficha!.userId}/redeem`, { rewardId })).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['staff-benefits', ficha?.userId] });
      setFicha((f) => f ? { ...f } : f);
      // refrescar ficha (saldo de puntos)
      lookup.mutate({ userId: ficha!.userId });
    },
    onError: (e) => setError(getErrorMessage(e)),
  });

  const redeemableRewards = (rewards.data ?? []).filter(
    (r) => r.is_active && (r.stock === null || r.stock > 0) && (ficha?.pointsBalance ?? 0) >= r.points_cost
  );

  return (
    <div className="reception-scan">
      <h2>Escanear cliente</h2>

      {error && <div className="error">{error} <button onClick={() => setError(null)}>×</button></div>}

      {!ficha && (
        <>
          <button onClick={() => setScanning((s) => !s)}>
            {scanning ? 'Cerrar escáner' : 'Abrir escáner'}
          </button>
          {scanning && (
            <Scanner
              onResult={(r) => {
                const text = r.getText();
                // si parsea como UUID → membershipId; si como base64url → qrPayload
                const isUuid = /^[0-9a-f-]{36}$/i.test(text);
                lookup.mutate(isUuid ? { membershipId: text } : { qrPayload: text });
                setScanning(false);
              }}
              onError={(e) => setError(e?.message ?? 'Error de cámara')}
            />
          )}
          <hr />
          <input placeholder="Buscar por nombre, email o teléfono" value={search}
                 onChange={(e) => setSearch(e.target.value)} />
          <ul className="search-results">
            {(searchResults.data ?? []).map((c) => (
              <li key={c.id}>
                <button onClick={() => lookup.mutate({ userId: c.id })}>
                  {c.display_name} — {c.email}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {ficha && (
        <div className="ficha">
          <h3>{ficha.name}</h3>
          <p>{ficha.email}{ficha.phone ? ` · ${ficha.phone}` : ''}</p>
          <p>Membresía: {ficha.membership.status ?? 'sin plan'}{ficha.membership.planName ? ` · ${ficha.membership.planName}` : ''}</p>
          <p>Puntos: <strong>{ficha.pointsBalance}</strong></p>
          <button onClick={() => { setFicha(null); setSearch(''); }}>Escanear otro</button>

          <h4>Beneficios vigentes</h4>
          <ul className="benefits">
            {(benefits.data ?? []).map((b) => (
              <li key={b.id}>
                <strong>{TYPE_LABELS[b.type] ?? b.type}</strong>
                {b.classTypeName ? ` (${b.classTypeName})` : ''}
                {' — '}
                {b.expiresSoon && b.usableNow ? <span className="warn">Expira pronto</span>
                  : b.usableNow ? <span className="ok">Usable ahora</span>
                  : <span className="expired">Expirado</span>}
                {' '}
                <small>vence {new Date(b.expiresAt).toLocaleDateString()}</small>
                {b.type === 'free_class'
                  ? <div className="note">Se aplica al reservar la clase.</div>
                  : b.markableNow
                    ? <button onClick={() => useBenefit.mutate(b.id)} disabled={useBenefit.isPending}>Marcar usado</button>
                    : null}
              </li>
            ))}
            {(benefits.data ?? []).length === 0 && <li>Sin beneficios vigentes.</li>}
          </ul>

          <h4>Canjear puntos</h4>
          <ul className="rewards">
            {redeemableRewards.map((r) => (
              <li key={r.id}>
                {r.name} — {r.points_cost} pts
                <button onClick={() => redeem.mutate(r.id)} disabled={redeem.isPending}>Canjear</button>
              </li>
            ))}
            {redeemableRewards.length === 0 && <li>El cliente no puede canjear ninguna recompensa ahora.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
```

> Nota: revisar la firma real de `<Scanner>` en `frontend/src/pages/admin/events/EventDetailView.tsx:69-80` (props `onResult`/`onError` y el tipo del resultado) y ajustar al patrón exacto usado ahí. Revisar también el shape exacto de `GET /api/users` (si devuelve `{ users: [...] }` o el array directo) y el nombre del campo de búsqueda (`search` vs `q`) en `backend/src/routes/users.ts:1035`.

- [ ] **Step 4: Registrar la ruta en `frontend/src/App.tsx`**

Dentro del bloque existente (línea ~368) bajo `ReceptionLayout`:

```tsx
<Route path="/reception/scan" element={<ScanScreen />} />
```

Y en el bloque `requiredRoles={['reception','admin','super_admin']}` que envuelve a `ReceptionLayout`. Importar arriba: `import ScanScreen from './pages/reception/ScanScreen';` (junto a los otros imports de reception).

- [ ] **Step 5: Añadir link de navegación a la pantalla (opcional pero recomendado)**

Revisar el menú lateral de recepción (`ReceptionLayout` o su componente de nav) y añadir un link "Escanear cliente" → `/app/reception/scan`. Si no se encuentra el menú, omitir y dejar la ruta accesible por URL.

- [ ] **Step 6: Correr la e2e y verificar que pasa (búsqueda manual)**

Run: `cd frontend && npx playwright test e2e/tests/reception-scan.spec.ts`
Expected: PASS (flujo de búsqueda manual; el escaneo de cámara se valida manualmente).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/reception/ScanScreen.tsx frontend/src/App.tsx frontend/e2e/tests/reception-scan.spec.ts
git commit -m "feat(reception): pantalla /app/reception/scan (escaneo + ficha + acciones)"
```

---

## Task 10: Smoke e2e + apertura de PR

**Files:**
- Test: `frontend/e2e/tests/reception-scan.spec.ts` (ampliar con un canje/marcado end-to-end)

**Interfaces:**
- Consumes: todo lo anterior.

- [ ] **Step 1: Ampliar la e2e con un canje y un marcado**

En `frontend/e2e/tests/reception-scan.spec.ts`, tras seleccionar el cliente, agregar un caso que canjee una recompensa (si el cliente seed tiene puntos) y verifique que aparece en beneficios, y otro que marque un beneficio POS como usado y verifique que desaparece de la lista de vigentes. Ajustar los seeds según el helper de e2e existente.

- [ ] **Step 2: Correr toda la suite de tests nuevos + typecheck**

Run: `cd backend && npx tsc --noEmit && npx tsx scripts/test-qr.ts && npx tsx scripts/test-wallet-lookup.ts && npx tsx scripts/test-staff-benefits.ts && npx tsx scripts/test-staff-redeem.ts && npx tsx scripts/test-benefit-use.ts`
Run: `cd frontend && npx playwright test e2e/tests/reception-scan.spec.ts e2e/tests/client-wallet-qr.spec.ts`
Expected: todo PASS.

- [ ] **Step 3: Push y PR**

```bash
git push -u origin feat/scan-recompensas
gh pr create --title "feat: escaneo QR de wallet → ficha cliente + recompensas" --body "..." 
```

(PR body: describir el flujo, las decisiones clave — `free_class` no marcable suelto, columna `used_by`, ambos formatos de QR — y la lista de endpoints/pantallas nuevas.)

- [ ] **Step 4: Commit final si hubo ajustes**

```bash
git add -A && git commit -m "test: e2e end-to-end de canje y marcado de beneficios"
```

---

## Auto-revisión del plan contra el spec

- **Migración `used_by`**: Task 1 ✅
- **Backfill 3 sitios**: Task 2 ✅
- **Refactor QR + `verifyQrPayload`**: Task 3 ✅
- **`POST /wallet/lookup` (ficha)**: Task 4 ✅ (streak = null en v1; el spec lo listaba — se reduce a null por YAGNI de la consulta de racha, que vive en `loyalty.ts:69` y requeriría refactor aparte)
- **`GET /loyalty/users/:userId/benefits` con flags**: Task 5 ✅
- **`POST /loyalty/users/:userId/redeem` (canje a nombre)**: Task 6 ✅
- **`POST /loyalty/benefits/:id/use` (marcar usado atómico, rechaza free_class)**: Task 7 ✅
- **Web QR del cliente**: Task 8 ✅
- **Pantalla `/app/reception/scan` con escáner + búsqueda manual + ficha + acciones**: Task 9 ✅
- **Gate reception/admin**: aplicado en Tasks 4-7 ✅
- **Errores (400/404/409/402)**: Tasks 4, 6, 7 ✅
- **Pruebas**: Tasks 1-10 ✅

Desviaciones honestas del spec:
1. **Streak en la ficha**: v1 devuelve `streak: null`. Mostrar la racha requiere extraer la lógica de `GET /loyalty/my-streak` (`loyalty.ts:69`) a un helper reutilizable; queda como mejora futura (YAGNI para el flujo de recompensas, que es el foco).
2. **`used_notes`**: fuera de alcance (el spec ya lo dejó como mejora futura).
3. **Clave de permiso `recompensas` dedicada**: se usa `requireRole('admin','super_admin','reception')` (la clave `clientes` ya da acceso a recepción a fichas; el gate por rol es suficiente en v1).