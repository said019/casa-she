# Fuel Bar (Barra de Bebidas) — Fase 2 (100% configurable) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Hacer la barra **100% configurable desde el admin** (nada hardcodeado) y agregar los comportamientos que esa config controla: recargo por tarjeta (%), ventana de cancelación, **pago con puntos** (saldo configurable), push "preparando", y recogida "después de tu clase".

**Architecture:** Extiende `bar_config` (en `system_settings`) con todos los knobs; el backend LEE cada comportamiento de la config. El pago con puntos reutiliza el ledger `loyalty_points` (asiento negativo `type='redemption'` + `syncUserLoyaltyPointsSnapshot`, todo en la misma transacción de la orden). El reembolso automático de tarjeta queda FUERA (manual). El admin edita todo en `BarSettings`.

**Tech Stack:** Node/TS ESM + Express + `pg` (backend); React/Vite + Tailwind + shadcn + TanStack Query (frontend). Tests backend = scripts `tsx` con `node:assert/strict`.

## Global Constraints

- **100% configurable:** todo comportamiento nuevo se lee de `bar_config`; ningún valor hardcodeado (ni ventana de cancelación, ni recargo, ni tasa de puntos).
- **Defaults sensatos:** `card_surcharge_percent: 0`, `card_enabled: true`, `points_enabled: false` (la dueña lo enciende), `points_redemption_rate: 10` (1 punto = $10), `cancellation_window_minutes: 60`, `preparing_push: true`, `prep_time_minutes: 15`. La barra sigue `enabled: false` por default.
- **Pago con puntos = saldo:** puntos necesarios = `Math.ceil(total_mxn / points_redemption_rate)`. Se validan contra `getUserPointsBalance`; se descuentan atómicamente; al cancelar una orden de puntos se reintegran.
- **Reembolso automático de tarjeta: NO** (queda manual desde el panel MP).
- **Saldo de puntos:** ledger `loyalty_points` (`INSERT ... points NEGATIVO, type='redemption'`) + `syncUserLoyaltyPointsSnapshot(userId, client)` DENTRO de la transacción.
- Reutiliza lo de Fase 1 (`bar_config`, `lib/bar.ts`, `routes/bar.ts`, `BarSettings`, `FuelBarConfirm`). Ramas + PR + merge → Railway.

## Interfaces reales (de Fase 1 + el codebase, para consumir)
- `getUserPointsBalance(userId: string, db=null): Promise<number>` (`backend/src/lib/loyalty.ts:156`).
- `syncUserLoyaltyPointsSnapshot(userId: string, db=null): Promise<void>` (`loyalty.ts:168`) — acepta un `DbClient` para correr en transacción.
- Gasto de puntos = `INSERT INTO loyalty_points (user_id, points, type, description) VALUES ($1, $2, 'redemption', $3)` (points negativo).
- `bar_config` actual (`backend/src/lib/bar.ts` interface `BarConfig` + default en `settings.ts`): `{ enabled, operating_hours, lead_time_max_hours, pickup_offset_minutes }`.
- `computeBarTotals(items)` y `canBarTransition(from,to,actor)` en `lib/bar.ts`.
- `POST /api/bar/orders` (`routes/bar.ts`, zod `CreateBarOrder` enum `['reception','card']`); `PATCH /orders/:id/status` (push en `to==='ready'`); `DELETE /orders/:id` (cliente).
- `GET /api/bar/config` devuelve `{ enabled }`; `GET/PUT /api/settings/bar-config`.
- `sendWebPushToUser(userId, {title,body,url?,tag?})`.
- Próxima clase: `bookings b JOIN classes c ON b.class_id=c.id WHERE b.user_id=$1 AND b.status='confirmed' AND (c.date + c.start_time) > NOW()... ORDER BY c.date,c.start_time LIMIT 1`; `classes` tiene `end_time`.

---

## File Structure
**Backend:** `lib/bar.ts` (extender BarConfig + `computeBarTotals` + helpers), `lib/settings.ts` (default extendido), `lib/barPoints.ts` (NUEVO: gastar/reintegrar puntos), `routes/bar.ts` (surcharge + rama puntos + ventana cancelación + push preparando + `GET /pickup-suggestions` + `GET /config` ampliado), `index.ts` (migración: columnas + CHECK de payment_method), `scripts/test-bar.ts` (extender tests).
**Frontend:** `pages/admin/settings/BarSettings.tsx` (panel completo), `pages/client/FuelBarConfirm.tsx` (opción puntos + línea de recargo + sugerencias), `lib/api/bar.ts` (tipos/hook de config ampliado).

---

### Task 1: Extender `BarConfig` + helpers de totales/puntos/cancelación (pure, tested)

**Files:** Modify `backend/src/lib/bar.ts`, `backend/src/lib/settings.ts` (default `bar_config`); Test `backend/scripts/test-bar.ts` (extender).

**Interfaces — Produces:**
- `BarConfig` extendido (nuevos campos abajo).
- `computeBarTotals(items, opts?: { surchargePercent?: number }): { subtotal_mxn, surcharge_mxn, total_mxn }`
- `pointsForTotal(totalMxn: number, redemptionRate: number): number` = `Math.ceil(totalMxn / rate)` (rate>0; si rate<=0 → `Infinity`).
- `canCustomerCancel(pickupTime: Date, now: Date, windowMinutes: number): boolean` = `pickupTime - now > windowMinutes*60000`.

- [ ] **Step 1: Extender el test `backend/scripts/test-bar.ts`** — AÑADIR al final (antes del `console.log('test-bar OK')`):

```typescript
import { pointsForTotal, canCustomerCancel } from '../src/lib/bar.js';

// computeBarTotals con recargo por tarjeta
const withFee = computeBarTotals([{ unit_price_mxn: 100, quantity: 1 }], { surchargePercent: 4 });
assert.equal(withFee.subtotal_mxn, 100);
assert.equal(withFee.surcharge_mxn, 4);
assert.equal(withFee.total_mxn, 104);
// sin recargo (default 0) — retrocompatible
const noFee = computeBarTotals([{ unit_price_mxn: 85, quantity: 2 }]);
assert.equal(noFee.subtotal_mxn, 170);
assert.equal(noFee.surcharge_mxn, 0);
assert.equal(noFee.total_mxn, 170);

// pointsForTotal: $120 a tasa 10 = 12 puntos; redondea hacia arriba
assert.equal(pointsForTotal(120, 10), 12);
assert.equal(pointsForTotal(125, 10), 13);
assert.equal(pointsForTotal(100, 0), Infinity); // tasa inválida

// canCustomerCancel: recogida a >window minutos → true
const now = new Date('2026-07-07T10:00:00-06:00');
assert.equal(canCustomerCancel(new Date('2026-07-07T12:00:00-06:00'), now, 60), true);  // 120min > 60
assert.equal(canCustomerCancel(new Date('2026-07-07T10:30:00-06:00'), now, 60), false); // 30min < 60
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx tsx scripts/test-bar.ts`
Expected: FAIL (`pointsForTotal`/`canCustomerCancel` no existen; `computeBarTotals` no acepta opts / no devuelve `surcharge_mxn`).

- [ ] **Step 3: Extender `backend/src/lib/bar.ts`**

Reemplaza la interface `BarConfig` con:
```typescript
export interface BarConfig {
  enabled: boolean;
  operating_hours: Record<number, { open: string; close: string } | null>;
  lead_time_max_hours: number;
  pickup_offset_minutes: number;
  // Fase 2 (100% configurable):
  cancellation_window_minutes: number; // cliente cancela solo si falta > esto para la recogida
  card_surcharge_percent: number;      // recargo % por pagar con tarjeta (0 = sin recargo)
  card_enabled: boolean;               // permitir pago con tarjeta
  points_enabled: boolean;             // permitir pago con puntos
  points_redemption_rate: number;      // MXN por punto (10 = 1 punto vale $10)
  preparing_push: boolean;             // enviar push al pasar a 'preparing'
  prep_time_minutes: number;           // tiempo estimado de preparación (para el copy del push)
}
```

Reemplaza `computeBarTotals` con:
```typescript
export function computeBarTotals(
  items: { unit_price_mxn: number; quantity: number }[],
  opts: { surchargePercent?: number } = {},
): { subtotal_mxn: number; surcharge_mxn: number; total_mxn: number } {
  const subtotal = items.reduce((acc, it) => acc + Number(it.unit_price_mxn) * Number(it.quantity), 0);
  const sub = Math.round(subtotal * 100) / 100;
  const pct = Number(opts.surchargePercent ?? 0);
  const surcharge = pct > 0 ? Math.round(sub * pct) / 100 : 0;
  return { subtotal_mxn: sub, surcharge_mxn: surcharge, total_mxn: Math.round((sub + surcharge) * 100) / 100 };
}
```

Agrega:
```typescript
// Puntos necesarios para cubrir un total, a la tasa dada (MXN por punto). Redondea hacia arriba.
export function pointsForTotal(totalMxn: number, redemptionRate: number): number {
  if (!(redemptionRate > 0)) return Infinity;
  return Math.ceil(Number(totalMxn) / redemptionRate);
}

// El cliente puede cancelar solo si falta MÁS que la ventana para la recogida.
export function canCustomerCancel(pickupTime: Date, now: Date, windowMinutes: number): boolean {
  return pickupTime.getTime() - now.getTime() > windowMinutes * 60_000;
}
```

- [ ] **Step 4: Extender el default en `backend/src/lib/settings.ts`**

En el default `bar_config`, AÑADE los campos nuevos (después de `pickup_offset_minutes`):
```typescript
      cancellation_window_minutes: 60,
      card_surcharge_percent: 0,
      card_enabled: true,
      points_enabled: false,
      points_redemption_rate: 10,
      preparing_push: true,
      prep_time_minutes: 15,
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && npx tsx scripts/test-bar.ts` → `test-bar OK`
Run: `cd backend && npx tsc --noEmit` → sin errores. **Nota:** `computeBarTotals` cambió de forma; el llamador en `routes/bar.ts` (Fase 1) usa `.total_mxn`/`.subtotal_mxn` que siguen existiendo → sigue compilando (el `surcharge_mxn` nuevo se ignora hasta Task 4).

- [ ] **Step 6: Commit**

```bash
git add backend/src/lib/bar.ts backend/src/lib/settings.ts backend/scripts/test-bar.ts
git commit -m "feat(bar-f2): BarConfig configurable (recargo, puntos, ventana, prep) + helpers de totales/puntos/cancelación"
```

---

### Task 2: Migración — columnas nuevas en `bar_orders` + CHECK de `payment_method` con `points`

**Files:** Modify `backend/src/index.ts` (bloque "Migration BAR-01" o uno nuevo "BAR-02" junto a él).

**Interfaces — Produces:** `bar_orders.points_spent INTEGER`, `bar_orders.card_surcharge_mxn NUMERIC(10,2)`, y el CHECK de `payment_method` acepta `'points'`.

- [ ] **Step 1: Agregar migración BAR-02 en `backend/src/index.ts`** (después del bloque de Migration BAR-01):

```typescript
    // Migration BAR-02: columnas Fase 2 + permitir payment_method 'points'.
    try {
        await query(`ALTER TABLE bar_orders
            ADD COLUMN IF NOT EXISTS points_spent INTEGER,
            ADD COLUMN IF NOT EXISTS card_surcharge_mxn NUMERIC(10,2) NOT NULL DEFAULT 0`);
        // Ampliar el CHECK de payment_method para incluir 'points' (drop + add, idempotente).
        await query(`ALTER TABLE bar_orders DROP CONSTRAINT IF EXISTS bar_orders_payment_method_check`);
        await query(`ALTER TABLE bar_orders ADD CONSTRAINT bar_orders_payment_method_check
            CHECK (payment_method IN ('reception','card','points'))`);
        console.log('Migration BAR-02: columnas Fase 2 + payment_method points listas.');
    } catch (e) { console.error('Migration BAR-02 error:', e); }
```

> Nota: el nombre real del constraint suele ser `bar_orders_payment_method_check` (Postgres lo autogenera como `<tabla>_<columna>_check`). Verifica con `\d bar_orders` si el `DROP CONSTRAINT IF EXISTS` no lo encuentra; si el nombre difiere, ajusta el `DROP` (el `IF EXISTS` evita que truene si no existe, pero entonces el ADD fallaría por duplicado — en ese caso usa el nombre correcto).

- [ ] **Step 2: Verificar**

Run: `cd backend && npx tsc --noEmit` → sin errores. (Sin test de esquema; validación en vivo con la BD al desplegar.)

- [ ] **Step 3: Commit**

```bash
git add backend/src/index.ts
git commit -m "feat(bar-f2): columnas points_spent/card_surcharge_mxn + payment_method 'points'"
```

---

### Task 3: `lib/barPoints.ts` — gastar y reintegrar puntos (transaccional)

**Files:** Create `backend/src/lib/barPoints.ts`.

**Interfaces — Consumes:** `syncUserLoyaltyPointsSnapshot` de `./loyalty.js`. **Produces:**
- `spendBarPoints(client: any, userId: string, points: number, barOrderId: string): Promise<void>` — inserta asiento negativo + sync, usando el `client` de la transacción.
- `refundBarPoints(client: any, userId: string, points: number, barOrderId: string): Promise<void>` — inserta asiento positivo (`type='bonus'`) + sync.

- [ ] **Step 1: Create `backend/src/lib/barPoints.ts`**

```typescript
import { syncUserLoyaltyPointsSnapshot } from './loyalty.js';

// Gasta N puntos por una orden de barra, DENTRO de la transacción (client de pool.connect()).
export async function spendBarPoints(client: any, userId: string, points: number, barOrderId: string): Promise<void> {
  await client.query(
    `INSERT INTO loyalty_points (user_id, points, type, description)
     VALUES ($1, $2, 'redemption', $3)`,
    [userId, -Math.abs(points), `Barra: orden ${barOrderId}`]);
  await syncUserLoyaltyPointsSnapshot(userId, client);
}

// Reintegra N puntos al cancelar una orden de barra pagada con puntos.
export async function refundBarPoints(client: any, userId: string, points: number, barOrderId: string): Promise<void> {
  await client.query(
    `INSERT INTO loyalty_points (user_id, points, type, description)
     VALUES ($1, $2, 'bonus', $3)`,
    [userId, Math.abs(points), `Reembolso barra: orden ${barOrderId}`]);
  await syncUserLoyaltyPointsSnapshot(userId, client);
}
```

- [ ] **Step 2: Verificar + commit**

Run: `cd backend && npx tsc --noEmit` → sin errores.
```bash
git add backend/src/lib/barPoints.ts
git commit -m "feat(bar-f2): motor de gasto/reintegro de puntos (transaccional)"
```

---

### Task 4: `POST /orders` — recargo por tarjeta + pago con puntos + toggles de config

**Files:** Modify `backend/src/routes/bar.ts` (el handler `POST /orders`).

**Interfaces — Consumes:** `getSetting('bar_config')`, `computeBarTotals(items,{surchargePercent})`, `pointsForTotal` (Task 1), `getUserPointsBalance` de `../lib/loyalty.js`, `spendBarPoints` de `../lib/barPoints.js`, `pool` de `../config/database.js`.

- [ ] **Step 1: Ampliar el zod schema + el handler en `backend/src/routes/bar.ts`**

Cambia el enum de `CreateBarOrder`:
```typescript
  paymentMethod: z.enum(['reception', 'card', 'points']),
```

En el handler `POST /orders`, DESPUÉS de cotizar `priced` y ANTES de crear la orden, reemplaza el cálculo de totales y agrega los gates de config:
```typescript
  const cfg = await getSetting('bar_config');
  // ... (el guard !cfg.enabled → 503 ya existe arriba) ...
  if (paymentMethod === 'card' && !cfg.card_enabled) return res.status(400).json({ error: 'CARD_DISABLED' });
  if (paymentMethod === 'points' && !cfg.points_enabled) return res.status(400).json({ error: 'POINTS_DISABLED' });

  const surchargePct = paymentMethod === 'card' ? Number(cfg.card_surcharge_percent ?? 0) : 0;
  const totals = computeBarTotals(priced, { surchargePercent: surchargePct });
```

Reemplaza el INSERT de la orden para guardar el recargo:
```typescript
  const order = await queryOne<{ id: string }>(
    `INSERT INTO bar_orders (user_id, booking_id, status, pickup_time, payment_method, payment_status,
                             subtotal_mxn, card_surcharge_mxn, total_mxn, customer_notes)
     VALUES ($1, $2, 'pending', $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
    [userId, bookingId ?? null, pickup.toISOString(), paymentMethod,
     paymentMethod === 'points' ? 'paid' : 'pending',   // puntos se paga al instante
     totals.subtotal_mxn, totals.surcharge_mxn, totals.total_mxn, notes ?? null]);
  if (!order) return res.status(500).json({ error: 'ORDER_CREATION_FAILED' });
  const orderId = order.id;
  // (insertar bar_order_items igual que hoy) ...
```

**Rama de PUNTOS** (agrégala junto a las de card/reception). El gasto va en una transacción propia con el `client` (el INSERT de la orden ya ocurrió; envolvemos el descuento + el sello de puntos):
```typescript
  if (paymentMethod === 'points') {
    const rate = Number(cfg.points_redemption_rate ?? 10);
    const needed = pointsForTotal(totals.total_mxn, rate);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const balRow = await client.query(`SELECT COALESCE(SUM(points),0)::int AS bal FROM loyalty_points WHERE user_id=$1 FOR UPDATE`, [userId]);
      const balance = Number(balRow.rows[0]?.bal ?? 0);
      if (balance < needed) {
        await client.query('ROLLBACK');
        await query(`DELETE FROM bar_orders WHERE id=$1`, [orderId]); // limpia la orden creada
        return res.status(400).json({ error: 'INSUFFICIENT_POINTS', needed, balance });
      }
      await client.query(`UPDATE bar_orders SET points_spent=$1 WHERE id=$2`, [needed, orderId]);
      await spendBarPoints(client, userId, needed, orderId);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      await query(`DELETE FROM bar_orders WHERE id=$1`, [orderId]);
      return res.status(500).json({ error: 'POINTS_CHARGE_FAILED' });
    } finally { client.release(); }
    return res.status(201).json({ id: orderId });
  }
```

La rama de `card` sigue igual (crea preferencia MP con `bar:${orderId}`), y la de `reception` retorna `{ id: orderId }` (ambas ya existen; solo cambió el cálculo de totales para incluir el recargo).

> Importante: mueve la lectura de `cfg` al inicio del handler si aún no está; reutilízala para el guard `!cfg.enabled` (ya existe) y para estos gates. `getUserPointsBalance` no se usa directamente aquí porque el `SELECT ... FOR UPDATE` bloquea el saldo dentro de la transacción para evitar carreras.

- [ ] **Step 2: Verificar + commit**

Run: `cd backend && npx tsc --noEmit` → sin errores. `cd backend && npx tsx scripts/test-bar.ts` → `test-bar OK` (los helpers puros siguen verdes).
```bash
git add backend/src/routes/bar.ts
git commit -m "feat(bar-f2): recargo por tarjeta configurable + pago con puntos (saldo, atómico) + toggles card/points"
```

---

### Task 5: Ventana de cancelación (config) + reintegro de puntos + push "preparando"

**Files:** Modify `backend/src/routes/bar.ts` (`DELETE /orders/:id`, `PATCH /orders/:id/status`).

**Interfaces — Consumes:** `getSetting('bar_config')`, `canCustomerCancel` (Task 1), `refundBarPoints` (Task 3), `sendWebPushToUser`, `pool`.

- [ ] **Step 1: `DELETE /orders/:id` — aplicar la ventana + reintegrar puntos**

En el handler `DELETE /orders/:id`, después de validar dueño y `canBarTransition(...,'customer')`, ANTES del UPDATE, agrega el chequeo de ventana (leyendo el pickup_time y la config):
```typescript
  const cfg = await getSetting('bar_config');
  const full = await queryOne<{ pickup_time: string; payment_method: string; points_spent: number | null }>(
    `SELECT pickup_time, payment_method, points_spent FROM bar_orders WHERE id=$1`, [req.params.id]);
  if (full && !canCustomerCancel(new Date(full.pickup_time), new Date(), Number(cfg.cancellation_window_minutes ?? 60))) {
    return res.status(400).json({ error: 'CANCEL_WINDOW_CLOSED' });
  }
```
Reemplaza el UPDATE de cancelación por uno transaccional que también reintegra puntos si aplica:
```typescript
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const upd = await client.query(
      `UPDATE bar_orders SET status='cancelled', cancelled_by='customer', cancelled_at=NOW(), updated_at=NOW()
       WHERE id=$1 AND status=$2 RETURNING id`, [req.params.id, o.status]);
    if (upd.rowCount === 0) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'STATE_CHANGED' }); }
    if (full && full.payment_method === 'points' && full.points_spent && full.points_spent > 0) {
      await refundBarPoints(client, o.user_id, full.points_spent, req.params.id);
    }
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK'); return res.status(500).json({ error: 'CANCEL_FAILED' }); }
  finally { client.release(); }
  res.json({ ok: true });
```

> Nota: el staff-cancel (`PATCH .../status` con `status:'cancelled'`) también debería reintegrar puntos. Agrega el mismo reintegro en la rama de cancelación del PATCH (ver Step 2), envolviéndolo igual.

- [ ] **Step 2: `PATCH /orders/:id/status` — push "preparando" (config) + reintegro de puntos al cancelar**

En el handler `PATCH /orders/:id/status`, lee la config una vez (`const cfg = await getSetting('bar_config');`). Después del UPDATE exitoso:
- Agrega el push de "preparando" (junto al de "ready" que ya existe):
```typescript
  if (to === 'preparing' && cfg.preparing_push) {
    void sendWebPushToUser(o.user_id, {
      title: 'Tu bebida se está preparando',
      body: `Estará lista en ~${Number(cfg.prep_time_minutes ?? 15)} min.`,
      url: `/app/fuel-bar/order/${req.params.id}`, tag: 'bar_preparing',
    });
  }
```
- Cuando `to === 'cancelled'`: si la orden es de puntos, reintégralos. Para hacerlo atómico junto al UPDATE, envuelve el UPDATE del PATCH en una transacción cuando `to==='cancelled'` (o, más simple: tras confirmar el UPDATE exitoso, si `payment_method==='points'` y `points_spent>0`, corre `refundBarPoints` con un `client` de `pool.connect()` en su mini-transacción). Lee `payment_method, points_spent` en el `SELECT` inicial del handler para tenerlos disponibles.

- [ ] **Step 3: Verificar + commit**

Run: `cd backend && npx tsc --noEmit` → sin errores.
```bash
git add backend/src/routes/bar.ts
git commit -m "feat(bar-f2): ventana de cancelación configurable + reintegro de puntos + push 'preparando'"
```

---

### Task 6: `GET /pickup-suggestions` + `GET /config` ampliado

**Files:** Modify `backend/src/routes/bar.ts`.

**Interfaces — Produces:**
- `GET /api/bar/config` → `{ enabled, card_enabled, points_enabled, points_redemption_rate, card_surcharge_percent, cancellation_window_minutes }` (lo que el cliente necesita para pintar el confirm).
- `GET /api/bar/pickup-suggestions` → `{ after_class: { pickup_iso, class_name, ends_iso } | null, manual_window: { earliest_iso, latest_iso } }`.

- [ ] **Step 1: Ampliar `GET /config`** (reemplaza el handler actual):

```typescript
router.get('/config', authenticate, async (_req: Request, res: Response) => {
  const c = await getSetting('bar_config');
  res.json({
    enabled: c.enabled === true,
    card_enabled: c.card_enabled !== false,
    points_enabled: c.points_enabled === true,
    points_redemption_rate: Number(c.points_redemption_rate ?? 10),
    card_surcharge_percent: Number(c.card_surcharge_percent ?? 0),
    cancellation_window_minutes: Number(c.cancellation_window_minutes ?? 60),
  });
});
```

- [ ] **Step 2: Agregar `GET /pickup-suggestions`**

```typescript
router.get('/pickup-suggestions', authenticate, async (req: Request, res: Response) => {
  const c = await getSetting('bar_config');
  const offset = Number(c.pickup_offset_minutes ?? 0);
  const lead = Number(c.lead_time_max_hours ?? 4);
  const now = new Date();
  // Próxima reserva confirmada + fin de clase
  const nx = await queryOne<{ date: string; end_time: string; class_name: string }>(
    `SELECT c.date, c.end_time, COALESCE(ct.name,'Clase') AS class_name
     FROM bookings b JOIN classes c ON c.id=b.class_id
     LEFT JOIN class_types ct ON ct.id=c.class_type_id
     WHERE b.user_id=$1 AND b.status='confirmed'
       AND (c.date + c.start_time) > (NOW() AT TIME ZONE 'America/Mexico_City')
     ORDER BY c.date ASC, c.start_time ASC LIMIT 1`, [req.user!.userId]);
  let after_class = null as any;
  if (nx) {
    const ends = new Date(`${String(nx.date).slice(0,10)}T${String(nx.end_time).slice(0,5)}:00-06:00`);
    const pickup = new Date(ends.getTime() + offset * 60_000);
    after_class = { pickup_iso: pickup.toISOString(), class_name: nx.class_name, ends_iso: ends.toISOString() };
  }
  const manual_window = {
    earliest_iso: new Date(now.getTime() + 5 * 60_000).toISOString(),
    latest_iso: new Date(now.getTime() + lead * 3_600_000).toISOString(),
  };
  res.json({ after_class, manual_window });
});
```

- [ ] **Step 3: Verificar + commit**

Run: `cd backend && npx tsc --noEmit` → sin errores.
```bash
git add backend/src/routes/bar.ts
git commit -m "feat(bar-f2): GET /config ampliado + GET /pickup-suggestions (después de tu clase)"
```

---

### Task 7: Panel de config admin completo (`BarSettings`)

**Files:** Modify `frontend/src/pages/admin/settings/BarSettings.tsx`.

**Interfaces — Consumes:** `GET/PUT /api/settings/bar-config` (devuelve/guarda el `BarConfig` completo).

- [ ] **Step 1: Reescribir `BarSettings.tsx`** con TODOS los knobs, agrupados en tarjetas. Usa `useState` inicializado desde `data` (un objeto `form` con todos los campos), inputs controlados, y un `PUT` con el objeto completo. Estructura:
  - **Card "General":** Switch `enabled` (Barra abierta).
  - **Card "Pagos":** Switch `card_enabled`; Number `card_surcharge_percent` (0–100, con nota "0 = sin recargo"); Switch `points_enabled`; Number `points_redemption_rate` (>0, nota "MXN por punto: 10 = 1 punto vale $10").
  - **Card "Recogida y cancelación":** Number `lead_time_max_hours` (1–48); Number `pickup_offset_minutes` (puede ser negativo); Number `cancellation_window_minutes` (0–1440); Number `prep_time_minutes` (1–120); Switch `preparing_push`.
  - **Card "Horario":** por cada día (0=Dom..6=Sáb) dos inputs `time` (open/close) + un Switch "abierto ese día" (si off → `operating_hours[dia]=null`).
  - Botón "Guardar" → `PUT /settings/bar-config` con el `form` completo; toast; `invalidateQueries(['bar-config'])`.
  - Deshabilita "Guardar" mientras `!data` (evita mandar defaults en blanco).

Sigue el patrón de imports de un admin settings existente (`AuthGuard requiredRoles={['admin','super_admin']}` + `AdminLayout`, shadcn `Card/Switch/Input/Label/Button`, `@/hooks/use-toast`, `api`, TanStack Query). Sin emojis; tokens Casa Shé. Provee TODO el código del componente (no dejes "// resto igual").

- [ ] **Step 2: Verificar + commit**

Run: `cd frontend && npx tsc --noEmit` → sin errores.
```bash
git add frontend/src/pages/admin/settings/BarSettings.tsx
git commit -m "feat(bar-f2): panel de config admin 100% (pagos, puntos, recargo, ventana, horario, prep)"
```

---

### Task 8: Confirm cliente — opción Puntos + línea de recargo + "después de tu clase"

**Files:** Modify `frontend/src/pages/client/FuelBarConfirm.tsx`, `frontend/src/lib/api/bar.ts`.

**Interfaces — Consumes:** `GET /api/bar/config` (ampliado), `GET /api/bar/pickup-suggestions`, `GET /api/loyalty/...` o el saldo del usuario (usa el hook/endpoint existente de puntos; si no hay uno directo, `GET /api/loyalty/balance` o el que exista — el implementer confirma la ruta real de saldo del cliente).

- [ ] **Step 1: `frontend/src/lib/api/bar.ts`** — ampliar el tipo/hook de config:
```typescript
export interface BarClientConfig {
  enabled: boolean; card_enabled: boolean; points_enabled: boolean;
  points_redemption_rate: number; card_surcharge_percent: number; cancellation_window_minutes: number;
}
// useBarConfig ya existe; ajusta su tipo de retorno a BarClientConfig.
```

- [ ] **Step 2: `FuelBarConfirm.tsx`** — cambios:
  - `type PayMethod = 'card' | 'reception' | 'points';`
  - Trae la config (`useBarConfig`) y el saldo de puntos del usuario (usa el endpoint real de saldo; el implementer lo confirma en el código — probablemente ya hay un hook de puntos en el wallet/loyalty).
  - Muestra la **opción "Tarjeta"** solo si `config.card_enabled`; si hay recargo (`card_surcharge_percent > 0`), muestra la línea "Uso de app (X%)" en el total cuando esté seleccionada tarjeta, y recalcula el total mostrado (subtotal + recargo). El servidor recalcula de todos modos.
  - Muestra la **opción "Puntos"** solo si `config.points_enabled && balance >= pointsForTotal(total, rate)`; el copy indica "Pagas con N puntos (tienes M)". `N = Math.ceil(total / points_redemption_rate)`.
  - **"¿Para cuándo?"**: usa `GET /pickup-suggestions` — si `after_class` existe, muestra el chip "Después de tu clase · lista HH:MM (después de {class_name})" con ese `pickup_iso`; siempre ofrece "Lo antes posible" y "Otra hora" (acotada a `manual_window`).
  - Al enviar: manda `paymentMethod` = 'card'|'reception'|'points' (¡'card', no 'mercadopago'!). Card → `checkout_url` redirect; reception/points → navega a tracking.

Provee el código de las secciones cambiadas (pago, totales, pickup). No dejes placeholders.

- [ ] **Step 3: Verificar + commit**

Run: `cd frontend && npx tsc --noEmit` → sin errores.
```bash
git add frontend/src/pages/client/FuelBarConfirm.tsx frontend/src/lib/api/bar.ts
git commit -m "feat(bar-f2): confirm con pago por puntos + línea de recargo + recogida después de tu clase"
```

---

## Cierre
1. **Prueba end-to-end** (barra encendida): pedir con puntos (verifica descuento + reintegro al cancelar); pedir con tarjeta y recargo>0 (verifica el % en el total y en MP); "después de tu clase" aparece si hay reserva próxima; push "preparando" llega si está activado.
2. Ajustar todos los knobs desde Ajustes → Barra y confirmar que el comportamiento cambia sin tocar código.
3. Rama única `feat/fuel-bar-fase2`; PR; review por tarea + review final; merge.

## Fuera de Fase 2
Reembolso automático de tarjeta (queda manual); QR escaneable; estado en Wallet; extras/add-ons; fotos reales por bebida (seed de `image_url`).
