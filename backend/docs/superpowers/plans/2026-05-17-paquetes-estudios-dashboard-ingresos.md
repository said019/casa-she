# Paquetes (Individual/Mixto), Estudios, Dashboard por Estudio e Ingresos Manuales — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar los paquetes por dos esquemas (Individual ligado a 1 estudio / Mixto), restringir reservas de paquetes individuales a su estudio, desglosar las clases del dashboard por estudio, y permitir ingresos manuales (sin miembro y con miembro), reflejándolos en reportes.

**Architecture:** API Express + PostgreSQL con SQL crudo parametrizado, sin ORM; migración idempotente añadida como bloque numerado en `src/index.ts` (patrón existente Migración 021 con `migration_flags`). La lógica de decisión de alto riesgo (regla de estudio en reserva, relleno de conteos por estudio, validación de ingreso manual) se extrae a módulos puros en `src/lib/` y se prueba con `node:assert/strict` vía `tsx` (patrón de `scripts/test-*.ts`), ya que el repo no tiene runner de pruebas. El estudio del paquete individual se ata en `orders.facility_id` al comprar y la regla de reserva lo resuelve con `COALESCE(memberships.facility_id, orders.facility_id)` — esto evita tocar los 6 puntos donde se crean membresías.

**Tech Stack:** TypeScript, Express, `pg`, Zod, React 18 + Vite, React Query, shadcn/Radix, Tailwind. Repos git separados: API en `/Users/saidromero/Balance Room/balance-room-api`, frontend en `/Users/saidromero/Balance Room/Balance Room ` (con espacio final).

**Convención de rutas:** `API/` = `/Users/saidromero/Balance Room/balance-room-api/`, `WEB/` = `/Users/saidromero/Balance Room/Balance Room /` (nota el espacio final, citar siempre entre comillas).

---

## File Structure

**API — crear:**
- `API/src/lib/membershipStudio.ts` — lógica pura de la regla "paquete individual solo en su estudio".
- `API/src/lib/dashboardStudio.ts` — relleno puro de conteos por estudio (incluye 0).
- `API/src/lib/manualIncome.ts` — schema Zod + normalización de ingreso manual.
- `API/scripts/test-membership-studio.ts` — tests unitarios (assert).
- `API/scripts/test-dashboard-studio.ts` — tests unitarios (assert).
- `API/scripts/test-manual-income.ts` — tests unitarios (assert).

**API — modificar:**
- `API/package.json` — agregar script `test`.
- `API/src/index.ts` — nuevo bloque Migración 022 (después de la línea 447).
- `API/src/routes/plans.ts` — exponer `package_type`, `requires_studio_selection`.
- `API/src/routes/orders.ts` — aceptar/validar/persistir `facility_id` en la orden.
- `API/src/routes/bookings.ts` — aplicar regla de estudio al reservar.
- `API/src/routes/admin.ts` — `classesByStudio` + sumar `manual_incomes` a ingresos.
- `API/src/routes/payments.ts` — `facility_id`+`concept` en registro; endpoints de ingreso manual; `manual_incomes` en reportes.

**Frontend — crear:**
- `WEB/src/pages/admin/payments/ManualIncome.tsx` — formulario + listado de ingreso libre.

**Frontend — modificar:**
- `WEB/src/types/auth.ts` — extender `AdminStats` y `Plan`.
- `WEB/src/pages/admin/Dashboard.tsx` — desglose por estudio.
- `WEB/src/pages/client/Checkout.tsx` — selector de estudio obligatorio para planes individuales.
- `WEB/src/pages/admin/payments/PaymentsRegister.tsx` — campos estudio + concepto.
- `WEB/src/pages/admin/payments/PaymentsHub.tsx` — pestaña "Ingreso manual".

---

## Task 1: Migración 022 (esquema + precios nuevos)

**Files:**
- Modify: `API/src/index.ts` (insertar bloque nuevo inmediatamente después de la línea 447, donde termina el bloque de Migración 021)

- [ ] **Step 1: Localizar el punto de inserción**

Run: `grep -n "Migration 021\|migration_021_schedules\|Migration 022" "/Users/saidromero/Balance Room/balance-room-api/src/index.ts"`
Expected: aparece `migration_021_schedules` cerca de la línea ~325–447 y NO existe ninguna "Migration 022". Identificar la línea donde cierra el `try { ... } catch { ... }` de la 021 (≈línea 447).

- [ ] **Step 2: Insertar el bloque de Migración 022**

Pegar este bloque justo después del cierre del bloque de la Migración 021 (mismo nivel de indentación que los otros bloques de migración):

```typescript
    // Migration 022: package types (individual/mixto/sample), studio binding,
    // manual incomes, payment concept/facility. Schema is idempotent; data seed
    // is guarded by migration_flags so reruns never duplicate plans.
    try {
        await query(`ALTER TABLE plans
            ADD COLUMN IF NOT EXISTS package_type VARCHAR(20) NOT NULL DEFAULT 'mixto',
            ADD COLUMN IF NOT EXISTS requires_studio_selection BOOLEAN NOT NULL DEFAULT false`);
        await query(`ALTER TABLE orders
            ADD COLUMN IF NOT EXISTS facility_id UUID REFERENCES facilities(id)`);
        await query(`ALTER TABLE memberships
            ADD COLUMN IF NOT EXISTS facility_id UUID REFERENCES facilities(id)`);
        await query(`ALTER TABLE payments
            ADD COLUMN IF NOT EXISTS facility_id UUID REFERENCES facilities(id),
            ADD COLUMN IF NOT EXISTS concept VARCHAR(255)`);
        await query(`CREATE TABLE IF NOT EXISTS manual_incomes (
            id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            amount         DECIMAL(10, 2) NOT NULL,
            currency       VARCHAR(3) DEFAULT 'MXN',
            concept        VARCHAR(255) NOT NULL,
            payment_method payment_method NOT NULL,
            facility_id    UUID REFERENCES facilities(id),
            notes          TEXT,
            income_date    DATE NOT NULL DEFAULT CURRENT_DATE,
            processed_by   UUID REFERENCES users(id),
            created_at     TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )`);

        await query(`CREATE TABLE IF NOT EXISTS migration_flags (
            name VARCHAR(100) PRIMARY KEY,
            applied_at TIMESTAMPTZ DEFAULT NOW()
        )`);
        const m022 = await query(`SELECT 1 FROM migration_flags WHERE name = 'migration_022_pricing'`);
        if (m022.length > 0) {
            console.log('Migration 022: already applied, skipping pricing seed.');
        } else {
            await query(`UPDATE plans SET is_active = false WHERE is_active = true`);
            await query(`
                INSERT INTO plans (name, description, price, currency, duration_days, class_limit, features, is_active, sort_order, package_type, requires_studio_selection)
                VALUES
                ('Individual · Clase Suelta',      'Clase suelta en un solo estudio',        180,  'MXN', 30, 1,  '[]'::jsonb, true, 10, 'individual', true),
                ('Individual · Paquete 4 Clases',  'Paquete 4 clases en un solo estudio',    600,  'MXN', 30, 4,  '[]'::jsonb, true, 11, 'individual', true),
                ('Individual · Paquete 8 Clases',  'Paquete 8 clases en un solo estudio',    1100, 'MXN', 45, 8,  '[]'::jsonb, true, 12, 'individual', true),
                ('Individual · Paquete 12 Clases', 'Paquete 12 clases en un solo estudio',   1700, 'MXN', 60, 12, '[]'::jsonb, true, 13, 'individual', true),
                ('Individual · Paquete 24 Clases', 'Paquete 24 clases en un solo estudio',   2000, 'MXN', 90, 24, '[]'::jsonb, true, 14, 'individual', true),
                ('Mixto · Paquete 4 Clases',       'Paquete 4 clases en cualquier estudio',  670,  'MXN', 30, 4,  '[]'::jsonb, true, 20, 'mixto', false),
                ('Mixto · Paquete 8 Clases',       'Paquete 8 clases en cualquier estudio',  1300, 'MXN', 45, 8,  '[]'::jsonb, true, 21, 'mixto', false),
                ('Mixto · Paquete 12 Clases',      'Paquete 12 clases en cualquier estudio', 1890, 'MXN', 60, 12, '[]'::jsonb, true, 22, 'mixto', false),
                ('Mixto · Paquete 24 Clases',      'Paquete 24 clases en cualquier estudio', 2600, 'MXN', 90, 24, '[]'::jsonb, true, 23, 'mixto', false),
                ('Clase Muestra',                  'Clase muestra (gratis si compras un paquete)', 90, 'MXN', 30, 1, '[]'::jsonb, true, 30, 'sample', false)
            `);
            await query(`INSERT INTO migration_flags (name) VALUES ('migration_022_pricing')`);
            console.log('Migration 022: pricing/studio/manual-income applied.');
        }
    } catch (e) {
        console.error('Error applying Migration 022:', e);
    }
```

- [ ] **Step 3: Compilar para verificar que no rompe TypeScript**

Run: `cd "/Users/saidromero/Balance Room/balance-room-api" && npm run build`
Expected: `tsc` termina sin errores.

- [ ] **Step 4: Commit**

```bash
cd "/Users/saidromero/Balance Room/balance-room-api"
git add src/index.ts
git commit -m "feat(db): migration 022 — package types, studio binding, manual incomes"
```

---

## Task 2: Script de pruebas npm (infra de TDD)

**Files:**
- Modify: `API/package.json` (sección `scripts`, líneas 8–10)

- [ ] **Step 1: Agregar script `test`**

En `API/package.json`, dentro de `"scripts"`, agregar (dejando `dev`/`build`/`start` intactos):

```json
"test": "tsx scripts/test-membership-studio.ts && tsx scripts/test-dashboard-studio.ts && tsx scripts/test-manual-income.ts"
```

- [ ] **Step 2: Verificar que `tsx` está disponible**

Run: `cd "/Users/saidromero/Balance Room/balance-room-api" && node -e "require('./package.json').devDependencies.tsx && console.log('tsx ok')"`
Expected: imprime `tsx ok`.

- [ ] **Step 3: Commit**

```bash
cd "/Users/saidromero/Balance Room/balance-room-api"
git add package.json
git commit -m "chore: add npm test script for unit tests"
```

---

## Task 3: Regla de estudio en reserva (lógica pura + TDD)

**Files:**
- Create: `API/src/lib/membershipStudio.ts`
- Test: `API/scripts/test-membership-studio.ts`

- [ ] **Step 1: Escribir el test que falla**

Crear `API/scripts/test-membership-studio.ts`:

```typescript
import assert from 'node:assert/strict';
import { studioBookingError } from '../src/lib/membershipStudio.js';

// Mixto / sin atadura: cualquier estudio permitido
assert.equal(studioBookingError(null, 'fac-wunda', 'Wunda'), null);

// Individual atado a Wunda, clase en Wunda: permitido
assert.equal(studioBookingError('fac-wunda', 'fac-wunda', 'Wunda'), null);

// Individual atado a Wunda, clase en Barre: rechazo con mensaje en español
const msg = studioBookingError('fac-wunda', 'fac-barre', 'Wunda');
assert.ok(msg && msg.includes('Wunda'), 'debe mencionar el estudio atado');
assert.ok(msg && msg.toLowerCase().includes('individual'), 'debe mencionar paquete individual');

// Clase sin facility (null) y membresía atada: se rechaza (no se puede verificar el estudio)
assert.ok(studioBookingError('fac-wunda', null, 'Wunda'));

console.log('test-membership-studio: OK');
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `cd "/Users/saidromero/Balance Room/balance-room-api" && npx tsx scripts/test-membership-studio.ts`
Expected: FALLA con error de módulo no encontrado (`Cannot find module '../src/lib/membershipStudio.js'`).

- [ ] **Step 3: Implementar el módulo puro**

Crear `API/src/lib/membershipStudio.ts`:

```typescript
/**
 * Regla de negocio: un paquete "individual" queda atado a un solo estudio.
 * @param boundFacilityId  estudio atado a la membresía (null = sin atadura / mixto)
 * @param classFacilityId  estudio de la clase a reservar (null = desconocido)
 * @param boundFacilityName nombre legible del estudio atado (para el mensaje)
 * @returns null si la reserva es válida; string con el mensaje de error (es-MX) si no.
 */
export function studioBookingError(
    boundFacilityId: string | null | undefined,
    classFacilityId: string | null | undefined,
    boundFacilityName: string | null | undefined
): string | null {
    if (!boundFacilityId) return null; // mixto / sin atadura
    if (classFacilityId && classFacilityId === boundFacilityId) return null;
    const name = boundFacilityName || 'tu estudio asignado';
    return `Tu paquete individual es solo para el estudio ${name}. Elige una clase de ese estudio o usa un paquete Mixto.`;
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `cd "/Users/saidromero/Balance Room/balance-room-api" && npx tsx scripts/test-membership-studio.ts`
Expected: imprime `test-membership-studio: OK` y sale con código 0.

- [ ] **Step 5: Commit**

```bash
cd "/Users/saidromero/Balance Room/balance-room-api"
git add src/lib/membershipStudio.ts scripts/test-membership-studio.ts
git commit -m "feat(booking): pure studio-binding rule for individual packages + tests"
```

---

## Task 4: Aplicar la regla de estudio en el endpoint de reserva

**Files:**
- Modify: `API/src/routes/bookings.ts` (handler `POST /` que carga `classDetails` y resuelve `membershipId`, ≈líneas 322–457)

- [ ] **Step 1: Importar el helper**

En la parte superior de `API/src/routes/bookings.ts`, junto a los demás imports, agregar:

```typescript
import { studioBookingError } from '../lib/membershipStudio.js';
```

- [ ] **Step 2: Insertar la verificación tras resolver `membershipId` y antes de descontar el crédito**

En el bloque `if (!isFreeClass) { ... }`, justo **después** de que `membershipId` queda resuelto (tanto en la rama de búsqueda automática como en la rama con `membershipId` recibido) y **antes** del `UPDATE memberships SET classes_remaining = classes_remaining - 1`, insertar:

```typescript
        // Regla: paquete individual solo permite reservar en su estudio atado.
        const studioBinding = await queryOne<{ bound_facility_id: string | null; bound_facility_name: string | null }>(
            `SELECT COALESCE(m.facility_id, o.facility_id) AS bound_facility_id,
                    f.name AS bound_facility_name
             FROM memberships m
             LEFT JOIN orders o ON o.id = m.order_id
             LEFT JOIN facilities f ON f.id = COALESCE(m.facility_id, o.facility_id)
             WHERE m.id = $1`,
            [membershipId]
        );
        const studioErr = studioBookingError(
            studioBinding?.bound_facility_id ?? null,
            classDetails.facility_id ?? null,
            studioBinding?.bound_facility_name ?? null
        );
        if (studioErr) {
            return res.status(422).json({ error: studioErr });
        }
```

(`queryOne` ya se usa en este archivo; `classDetails` ya está cargado en este handler con `facility_id`. Si `classDetails` no incluyera `facility_id`, agregar `facility_id` a su SELECT.)

- [ ] **Step 3: Verificar que `classDetails` trae `facility_id`**

Run: `grep -n "classDetails" "/Users/saidromero/Balance Room/balance-room-api/src/routes/bookings.ts" | head -5` y revisar el SELECT que lo crea.
Expected: el SELECT de la clase incluye `facility_id` (o `c.facility_id`). Si no, añadirlo a esa lista de columnas.

- [ ] **Step 4: Compilar**

Run: `cd "/Users/saidromero/Balance Room/balance-room-api" && npm run build`
Expected: `tsc` sin errores.

- [ ] **Step 5: Commit**

```bash
cd "/Users/saidromero/Balance Room/balance-room-api"
git add src/routes/bookings.ts
git commit -m "feat(booking): enforce individual-package studio restriction (HTTP 422)"
```

---

## Task 5: Validar y persistir `facility_id` al crear la orden

**Files:**
- Modify: `API/src/routes/orders.ts` (handler `POST /`, INSERT INTO orders ≈líneas 347–359; el handler ya carga `plan`)

- [ ] **Step 1: Validar estudio obligatorio para planes individuales**

En el handler `POST /` de `orders.ts`, después de cargar `plan` y antes del `INSERT INTO orders`, agregar:

```typescript
        const facilityId: string | null = req.body.facility_id || null;
        if (plan.requires_studio_selection) {
            if (!facilityId) {
                return res.status(422).json({ error: 'Este paquete individual requiere elegir un estudio.' });
            }
            const fac = await queryOne(`SELECT id FROM facilities WHERE id = $1 AND is_active = true`, [facilityId]);
            if (!fac) {
                return res.status(422).json({ error: 'El estudio seleccionado no es válido.' });
            }
        }
```

(Si `plan` se obtiene con un SELECT de columnas explícitas, añadir `requires_studio_selection` a esa lista; si usa `SELECT *` no se requiere cambio. `queryOne` ya está importado en este archivo.)

- [ ] **Step 2: Añadir `facility_id` al INSERT de la orden**

Modificar el `INSERT INTO orders (...)` para incluir la columna y el parámetro. Cambiar la lista de columnas y `VALUES` agregando `facility_id` como nuevo parámetro al final:

```typescript
const orderResult = await dbClient.query(`
    INSERT INTO orders (
        user_id, plan_id, subtotal, tax_rate, tax_amount,
        total_amount, currency, payment_method, customer_notes, expires_at,
        discount_code_id, discount_amount, card_fee_amount, facility_id
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    RETURNING *
`, [
    userId, plan_id, subtotal, 0, taxAmount, totalAmount,
    plan.currency || 'MXN', dbPaymentMethod, notes || null,
    (dbPaymentMethod === 'transfer') ? expiresAt : null,
    discount_code_id || null, totalDiscountAmount, cardFee,
    (plan.requires_studio_selection ? facilityId : null),
]);
```

- [ ] **Step 3: Compilar**

Run: `cd "/Users/saidromero/Balance Room/balance-room-api" && npm run build`
Expected: `tsc` sin errores.

- [ ] **Step 4: Commit**

```bash
cd "/Users/saidromero/Balance Room/balance-room-api"
git add src/routes/orders.ts
git commit -m "feat(orders): require & persist studio for individual packages"
```

---

## Task 6: Exponer `package_type` y `requires_studio_selection` en /api/plans

**Files:**
- Modify: `API/src/routes/plans.ts` (GET `/` SELECT ≈líneas 29–32; POST create INSERT ≈líneas 95–110; `PlanSchema`)

- [ ] **Step 1: Añadir columnas al SELECT de GET /api/plans**

Cambiar la lista de columnas del SELECT en el handler GET `/`:

```typescript
        let queryStr = `
      SELECT 
        id, name, description, price, currency, duration_days, 
        class_limit, features, is_active, sort_order,
        package_type, requires_studio_selection
      FROM plans
    `;
```

- [ ] **Step 2: Extender `PlanSchema` y el INSERT del POST (admin)**

Localizar `PlanSchema` (Zod) y agregar campos opcionales con default:

```typescript
    packageType: z.enum(['individual', 'mixto', 'sample']).default('mixto'),
    requiresStudioSelection: z.boolean().default(false),
```

En el `INSERT INTO plans (...)` del POST agregar las dos columnas y parámetros `$10,$11`:

```typescript
        const newPlan = await queryOne(
            `INSERT INTO plans (
        name, description, price, currency, duration_days, 
        class_limit, features, is_active, sort_order,
        package_type, requires_studio_selection
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *`,
            [
                data.name, data.description, data.price, data.currency,
                data.durationDays, data.classLimit || null,
                JSON.stringify(data.features), data.isActive, data.sortOrder,
                data.packageType, data.requiresStudioSelection,
            ]
        );
```

- [ ] **Step 3: Compilar**

Run: `cd "/Users/saidromero/Balance Room/balance-room-api" && npm run build`
Expected: `tsc` sin errores.

- [ ] **Step 4: Commit**

```bash
cd "/Users/saidromero/Balance Room/balance-room-api"
git add src/routes/plans.ts
git commit -m "feat(plans): expose package_type & requires_studio_selection"
```

---

## Task 7: Conteo de clases por estudio (lógica pura + TDD)

**Files:**
- Create: `API/src/lib/dashboardStudio.ts`
- Test: `API/scripts/test-dashboard-studio.ts`

- [ ] **Step 1: Escribir el test que falla**

Crear `API/scripts/test-dashboard-studio.ts`:

```typescript
import assert from 'node:assert/strict';
import { fillStudioCounts } from '../src/lib/dashboardStudio.js';

const facilities = [
    { id: 'w', name: 'Wunda' },
    { id: 'b', name: 'Barre' },
    { id: 'h', name: 'Hot Room' },
];
const raw = [
    { facility_id: 'w', count: '3' },
    { facility_id: 'h', count: '5' },
];

const result = fillStudioCounts(facilities, raw);
assert.deepEqual(result, [
    { facilityId: 'w', name: 'Wunda', count: 3 },
    { facilityId: 'b', name: 'Barre', count: 0 },
    { facilityId: 'h', name: 'Hot Room', count: 5 },
]);

// Filas con facility_id desconocido o null se ignoran (no rompen)
const r2 = fillStudioCounts(facilities, [{ facility_id: null, count: '9' }]);
assert.deepEqual(r2.map(x => x.count), [0, 0, 0]);

console.log('test-dashboard-studio: OK');
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `cd "/Users/saidromero/Balance Room/balance-room-api" && npx tsx scripts/test-dashboard-studio.ts`
Expected: FALLA con `Cannot find module '../src/lib/dashboardStudio.js'`.

- [ ] **Step 3: Implementar el módulo puro**

Crear `API/src/lib/dashboardStudio.ts`:

```typescript
export interface StudioFacility { id: string; name: string; }
export interface RawStudioCount { facility_id: string | null; count: string | number; }
export interface StudioClassCount { facilityId: string; name: string; count: number; }

/** Devuelve un conteo por estudio en el orden de `facilities`, incluyendo los que tienen 0. */
export function fillStudioCounts(
    facilities: StudioFacility[],
    rows: RawStudioCount[]
): StudioClassCount[] {
    const byId = new Map<string, number>();
    for (const r of rows) {
        if (!r.facility_id) continue;
        byId.set(r.facility_id, Number(r.count) || 0);
    }
    return facilities.map((f) => ({
        facilityId: f.id,
        name: f.name,
        count: byId.get(f.id) ?? 0,
    }));
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `cd "/Users/saidromero/Balance Room/balance-room-api" && npx tsx scripts/test-dashboard-studio.ts`
Expected: imprime `test-dashboard-studio: OK`.

- [ ] **Step 5: Commit**

```bash
cd "/Users/saidromero/Balance Room/balance-room-api"
git add src/lib/dashboardStudio.ts scripts/test-dashboard-studio.ts
git commit -m "feat(dashboard): pure per-studio class-count fill + tests"
```

---

## Task 8: `classesByStudio` + ingresos manuales en /api/admin/stats

**Files:**
- Modify: `API/src/routes/admin.ts` (handler GET `/stats`, ≈líneas 27–104)

- [ ] **Step 1: Importar el helper**

En los imports de `API/src/routes/admin.ts` agregar:

```typescript
import { fillStudioCounts } from '../lib/dashboardStudio.js';
```

- [ ] **Step 2: Añadir consultas de estudios y de ingreso manual al `Promise.all`**

Dentro del `Promise.all([...])` del handler `/stats`, agregar dos entradas más:

```typescript
            safeQuery<any>(`SELECT id, name FROM facilities WHERE is_active = true ORDER BY sort_order ASC`),
            safeQuery<any>(`
        SELECT facility_id, COUNT(*)::int AS count
        FROM classes
        WHERE date = $1
        GROUP BY facility_id
      `, [today]),
            safeQuery<{ total: string }>(`
        SELECT COALESCE(SUM(amount), 0) AS total
        FROM manual_incomes
        WHERE income_date = $1
      `, [today]),
```

Y agregar sus nombres a la desestructuración del resultado, p. ej.:

```typescript
        const [
            scheduledClasses,
            confirmedBookings,
            activeMemberships,
            todaysRevenue,
            facilitiesRows,
            classesByStudioRaw,
            manualIncomeToday
        ] = await Promise.all([ /* ...mismas en el mismo orden... */ ]);
```

> Nota para el implementador: `safeQuery` usa `queryOne` (una sola fila). Para `facilitiesRows` y `classesByStudioRaw` se necesitan múltiples filas; usar el helper de múltiples filas que ya exista en el archivo (revisar imports: probablemente `query`). Reemplazar esas dos entradas por:
> ```typescript
> (async () => { try { return await query(`SELECT id, name FROM facilities WHERE is_active = true ORDER BY sort_order ASC`); } catch { return []; } })(),
> (async () => { try { return await query(`SELECT facility_id, COUNT(*)::int AS count FROM classes WHERE date = $1 GROUP BY facility_id`, [today]); } catch { return []; } })(),
> ```

- [ ] **Step 3: Construir `classesByStudio`, sumar ingreso manual y devolverlo**

Antes del `res.json({...})`, agregar:

```typescript
        const classesByStudio = fillStudioCounts(
            (facilitiesRows || []) as any[],
            (classesByStudioRaw || []) as any[]
        );
        const manualToday = parseFloat(manualIncomeToday?.total || '0');
```

Y en el objeto de `res.json({...})` cambiar `revenue`/`revenueGross`/`revenueNet` para incluir el ingreso manual y agregar `classesByStudio`:

```typescript
        res.json({
            scheduledClasses: parseInt(scheduledClasses?.count || '0'),
            confirmedBookings: parseInt(confirmedBookings?.count || '0'),
            activeMemberships: parseInt(activeMemberships?.count || '0'),
            revenue: gross + manualToday,
            revenueGross: gross + manualToday,
            revenueNet: net + manualToday,
            revenueCardFees: cardFee,
            classesByStudio,
        });
```

- [ ] **Step 4: Compilar**

Run: `cd "/Users/saidromero/Balance Room/balance-room-api" && npm run build`
Expected: `tsc` sin errores.

- [ ] **Step 5: Commit**

```bash
cd "/Users/saidromero/Balance Room/balance-room-api"
git add src/routes/admin.ts
git commit -m "feat(admin): classesByStudio + manual income in dashboard stats"
```

---

## Task 9: Validación de ingreso manual (lógica pura + TDD)

**Files:**
- Create: `API/src/lib/manualIncome.ts`
- Test: `API/scripts/test-manual-income.ts`

- [ ] **Step 1: Escribir el test que falla**

Crear `API/scripts/test-manual-income.ts`:

```typescript
import assert from 'node:assert/strict';
import { ManualIncomeSchema } from '../src/lib/manualIncome.js';

// Válido
const ok = ManualIncomeSchema.safeParse({
    amount: 250, concept: 'Venta de grip socks', paymentMethod: 'cash',
});
assert.equal(ok.success, true);
if (ok.success) {
    assert.equal(ok.data.currency, 'MXN'); // default
    assert.equal(ok.data.facilityId, undefined);
}

// Monto inválido
assert.equal(ManualIncomeSchema.safeParse({ amount: 0, concept: 'x', paymentMethod: 'cash' }).success, false);

// Concepto requerido
assert.equal(ManualIncomeSchema.safeParse({ amount: 10, concept: '', paymentMethod: 'cash' }).success, false);

// Método inválido
assert.equal(ManualIncomeSchema.safeParse({ amount: 10, concept: 'x', paymentMethod: 'crypto' }).success, false);

console.log('test-manual-income: OK');
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `cd "/Users/saidromero/Balance Room/balance-room-api" && npx tsx scripts/test-manual-income.ts`
Expected: FALLA con `Cannot find module '../src/lib/manualIncome.js'`.

- [ ] **Step 3: Implementar el schema**

Crear `API/src/lib/manualIncome.ts`:

```typescript
import { z } from 'zod';

export const ManualIncomeSchema = z.object({
    amount: z.coerce.number().positive('Monto inválido'),
    currency: z.string().min(3).max(3).default('MXN'),
    concept: z.string().min(1, 'Concepto requerido').max(255),
    paymentMethod: z.enum(['cash', 'transfer', 'card', 'online']),
    facilityId: z.string().uuid().optional(),
    incomeDate: z.string().optional(), // YYYY-MM-DD; default en SQL
    notes: z.string().optional(),
});

export type ManualIncomeInput = z.infer<typeof ManualIncomeSchema>;
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `cd "/Users/saidromero/Balance Room/balance-room-api" && npx tsx scripts/test-manual-income.ts`
Expected: imprime `test-manual-income: OK`.

- [ ] **Step 5: Commit**

```bash
cd "/Users/saidromero/Balance Room/balance-room-api"
git add src/lib/manualIncome.ts scripts/test-manual-income.ts
git commit -m "feat(payments): manual-income zod schema + tests"
```

---

## Task 10: Endpoints de ingreso manual + estudio/concepto en registro + reportes

**Files:**
- Modify: `API/src/routes/payments.ts` (POST `/register` ≈líneas 120–173; GET `/reports` ≈líneas 178–239; agregar `POST /manual-income` y `GET /manual-income`)

- [ ] **Step 1: Importar el schema**

En imports de `API/src/routes/payments.ts`:

```typescript
import { ManualIncomeSchema } from '../lib/manualIncome.js';
```

- [ ] **Step 2: Añadir `facility_id` y `concept` al registro de pago por miembro**

En el handler `POST /register`: extender `PaymentCreateSchema` (Zod) con:

```typescript
    facilityId: z.string().uuid().optional(),
    concept: z.string().max(255).optional(),
```

y modificar el `INSERT INTO payments (...)` para incluir `facility_id, concept` con dos parámetros nuevos:

```typescript
        const result = await queryOne(
            `INSERT INTO payments (
        user_id, membership_id, amount, currency, payment_method,
        reference, notes, status, processed_by, transaction_date,
        facility_id, concept
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), $10, $11)
      RETURNING *`,
            [
                userId, membershipId || null, amount, currency, paymentMethod,
                reference || null, notes || null, status, req.user?.userId || null,
                validation.data.facilityId || null, validation.data.concept || null,
            ]
        );
```

- [ ] **Step 3: Añadir el endpoint `POST /manual-income`**

Agregar en `payments.ts` (mismo estilo que los demás handlers, requiere rol admin/reception como `/register`):

```typescript
router.post('/manual-income', async (req: Request, res: Response) => {
    try {
        const v = ManualIncomeSchema.safeParse(req.body);
        if (!v.success) {
            return res.status(422).json({ error: 'Datos inválidos', details: v.error.flatten().fieldErrors });
        }
        const d = v.data;
        const row = await queryOne(
            `INSERT INTO manual_incomes
               (amount, currency, concept, payment_method, facility_id, notes, income_date, processed_by)
             VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7::date, CURRENT_DATE), $8)
             RETURNING *`,
            [d.amount, d.currency, d.concept, d.paymentMethod,
             d.facilityId || null, d.notes || null, d.incomeDate || null,
             req.user?.userId || null]
        );
        res.status(201).json(row);
    } catch (e) {
        console.error('manual-income error:', e);
        res.status(500).json({ error: 'No se pudo registrar el ingreso' });
    }
});
```

- [ ] **Step 4: Añadir el endpoint `GET /manual-income` (listado)**

```typescript
router.get('/manual-income', async (req: Request, res: Response) => {
    try {
        const { startDate, endDate, facilityId } = req.query;
        const params: any[] = [];
        let where = 'WHERE 1=1';
        if (startDate) { params.push(startDate); where += ` AND mi.income_date >= $${params.length}`; }
        if (endDate)   { params.push(endDate);   where += ` AND mi.income_date <= $${params.length}`; }
        if (facilityId){ params.push(facilityId);where += ` AND mi.facility_id = $${params.length}`; }
        const rows = await query(
            `SELECT mi.*, f.name AS facility_name
             FROM manual_incomes mi
             LEFT JOIN facilities f ON f.id = mi.facility_id
             ${where}
             ORDER BY mi.income_date DESC, mi.created_at DESC
             LIMIT 200`,
            params
        );
        res.json(rows);
    } catch (e) {
        console.error('manual-income list error:', e);
        res.status(500).json({ error: 'No se pudo cargar el listado' });
    }
});
```

- [ ] **Step 5: Sumar `manual_incomes` a GET /reports**

En el handler `GET /reports`, después de calcular `totals` y `byMethod`, agregar una consulta de ingresos manuales del mismo rango y sumarla a los totales devueltos:

```typescript
        const miParams: any[] = [];
        let miFilter = '';
        if (startDate) { miParams.push(startDate); miFilter += ` AND income_date >= $${miParams.length}`; }
        if (endDate)   { miParams.push(endDate);   miFilter += ` AND income_date <= $${miParams.length}`; }
        const manual = await queryOne<{ total: string; cnt: string }>(
            `SELECT COALESCE(SUM(amount),0) AS total, COUNT(*) AS cnt
             FROM manual_incomes WHERE 1=1 ${miFilter}`,
            miParams
        );
        const manualTotal = Number(manual?.total || 0);
        const manualCount = Number(manual?.cnt || 0);
```

Y en el `res.json({...})` de `/reports`, sumar `manualTotal` a `total_amount` y `completed_amount`, `manualCount` a `total_count` y `completed_count`, y agregar al arreglo `by_method` una entrada `{ payment_method: 'manual', total: manualTotal }` cuando `manualTotal > 0`.

- [ ] **Step 6: Compilar**

Run: `cd "/Users/saidromero/Balance Room/balance-room-api" && npm run build`
Expected: `tsc` sin errores.

- [ ] **Step 7: Commit**

```bash
cd "/Users/saidromero/Balance Room/balance-room-api"
git add src/routes/payments.ts
git commit -m "feat(payments): manual income endpoints + studio/concept on register + reports"
```

---

## Task 11: Tipos frontend (`AdminStats`, `Plan`)

**Files:**
- Modify: `WEB/src/types/auth.ts` (`AdminStats` ≈líneas 73–79; interface `Plan` ≈líneas 31–44)

- [ ] **Step 1: Extender `AdminStats` y `Plan`**

En `WEB/src/types/auth.ts`:

```typescript
export interface StudioClassCount {
    facilityId: string;
    name: string;
    count: number;
}

export interface AdminStats {
    scheduledClasses: number;
    confirmedBookings: number;
    activeMemberships: number;
    revenue: number;
    revenueGross?: number;
    revenueNet?: number;
    revenueCardFees?: number;
    classesByStudio?: StudioClassCount[];
}
```

En la interface `Plan`, agregar:

```typescript
    package_type?: 'individual' | 'mixto' | 'sample';
    requires_studio_selection?: boolean;
```

- [ ] **Step 2: Type-check**

Run: `cd "/Users/saidromero/Balance Room/Balance Room " && npx tsc -p tsconfig.app.json --noEmit`
Expected: sin errores nuevos relacionados a estos tipos.

- [ ] **Step 3: Commit**

```bash
cd "/Users/saidromero/Balance Room/Balance Room "
git add src/types/auth.ts
git commit -m "feat(types): classesByStudio + plan package_type"
```

---

## Task 12: Desglose por estudio en el Dashboard

**Files:**
- Modify: `WEB/src/pages/admin/Dashboard.tsx` (sección de KPIs ≈líneas 86–195)

- [ ] **Step 1: Renderizar el desglose bajo los KPIs**

Después de la `<section>` que mapea `kpis` (la grilla de `MetricCard`), agregar un bloque que liste `stats?.classesByStudio`:

```tsx
                {stats?.classesByStudio && stats.classesByStudio.length > 0 && (
                    <section className="rounded-[1.6rem] border border-balance-sand/65 bg-[hsl(var(--admin-panel))] p-4">
                        <span className="text-sm font-semibold text-balance-dark/62">Clases hoy por estudio</span>
                        <div className="mt-4 grid gap-3 sm:grid-cols-3">
                            {stats.classesByStudio.map((s) => (
                                <div key={s.facilityId} className="flex items-center justify-between rounded-[1rem] bg-balance-cream px-4 py-3">
                                    <span className="text-sm font-medium text-balance-dark/70">{s.name}</span>
                                    <span className="text-2xl font-semibold tabular-nums tracking-[-0.05em] text-balance-dark">{s.count}</span>
                                </div>
                            ))}
                        </div>
                    </section>
                )}
```

- [ ] **Step 2: Verificar build**

Run: `cd "/Users/saidromero/Balance Room/Balance Room " && npm run build`
Expected: `vite build` sin errores.

- [ ] **Step 3: Commit**

```bash
cd "/Users/saidromero/Balance Room/Balance Room "
git add src/pages/admin/Dashboard.tsx
git commit -m "feat(dashboard): per-studio class breakdown"
```

---

## Task 13: Selector de estudio en Checkout para planes individuales

**Files:**
- Modify: `WEB/src/pages/client/Checkout.tsx` (mutación `createOrder` y `handleConfirmOrder` ≈líneas 142–206)

- [ ] **Step 1: Cargar estudios y estado de selección**

En el componente `Checkout`, agregar (junto a los demás hooks/estado):

```tsx
    const { data: facilities = [] } = useQuery<{ id: string; name: string }[]>({
        queryKey: ['facilities'],
        queryFn: async () => (await api.get('/facilities')).data,
    });
    const [selectedFacilityId, setSelectedFacilityId] = useState<string>('');
```

Obtener el plan seleccionado (ya existe lógica para `selectedPlanId`); calcular si requiere estudio:

```tsx
    const selectedPlan = plans?.find((p: any) => p.id === selectedPlanId);
    const needsStudio = !!selectedPlan?.requires_studio_selection;
```

(Usar la variable de planes que ya exista en el archivo; si el listado se llama distinto, ajustar el `.find`.)

- [ ] **Step 2: Renderizar el selector cuando aplique**

En el JSX, antes del botón de confirmar, agregar:

```tsx
                {needsStudio && (
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Elige tu estudio (paquete individual)</label>
                        <Select value={selectedFacilityId} onValueChange={setSelectedFacilityId}>
                            <SelectTrigger><SelectValue placeholder="Selecciona un estudio" /></SelectTrigger>
                            <SelectContent>
                                {facilities.map((f) => (
                                    <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">Tu paquete individual solo podrá usarse en este estudio.</p>
                    </div>
                )}
```

(Importar `Select, SelectTrigger, SelectValue, SelectContent, SelectItem` desde el módulo de UI usado en el resto del proyecto, p. ej. `@/components/ui/select`, si no están ya importados.)

- [ ] **Step 3: Bloquear envío y mandar `facility_id`**

En `handleConfirmOrder`:

```tsx
  const handleConfirmOrder = () => {
    if (!selectedPlanId) return;
    if (needsStudio && !selectedFacilityId) {
      toast({ title: 'Falta el estudio', description: 'Elige un estudio para tu paquete individual.', variant: 'destructive' });
      return;
    }
    createOrder.mutate({
      plan_id: selectedPlanId,
      payment_method: selectedPaymentMethod,
      notes: notes || undefined,
      discount_code_id: discountResult?.codeId || undefined,
      discount_amount: discountResult?.discountAmount || undefined,
      facility_id: needsStudio ? selectedFacilityId : undefined,
    } as any);
  };
```

- [ ] **Step 4: Build**

Run: `cd "/Users/saidromero/Balance Room/Balance Room " && npm run build`
Expected: `vite build` sin errores.

- [ ] **Step 5: Commit**

```bash
cd "/Users/saidromero/Balance Room/Balance Room "
git add src/pages/client/Checkout.tsx
git commit -m "feat(checkout): studio selector for individual packages"
```

---

## Task 14: Estudio + concepto en PaymentsRegister

**Files:**
- Modify: `WEB/src/pages/admin/payments/PaymentsRegister.tsx` (schema ≈líneas 26–35; campos ≈líneas 115–199; submit ≈líneas 69–92)

- [ ] **Step 1: Extender el schema Zod**

```typescript
const paymentSchema = z.object({
  userId: z.string().uuid('Selecciona un miembro'),
  membershipId: z.string().uuid().optional(),
  amount: z.coerce.number().positive('Monto inválido'),
  currency: z.string().min(3).max(3).default('MXN'),
  paymentMethod: z.enum(['cash', 'transfer', 'card', 'online']),
  status: z.enum(['completed', 'pending']).default('completed'),
  reference: z.string().optional(),
  notes: z.string().optional(),
  facilityId: z.string().uuid().optional(),
  concept: z.string().max(255).optional(),
});
```

- [ ] **Step 2: Cargar estudios y agregar los dos campos al formulario**

Agregar la query de facilities (igual que en Checkout) y, junto a los campos existentes, un `Select` opcional de estudio (mapeando `facilities`) enlazado a `facilityId`, y un `Input` de texto enlazado a `concept` (label "Concepto"). Seguir el mismo patrón de `register`/`Controller` que usan los campos existentes en este archivo.

- [ ] **Step 3: Enviar los campos (ya van en `data` por el schema)**

`onSubmit` ya hace `registerMutation.mutate(data)`, así que con el schema extendido `facilityId`/`concept` se envían automáticamente. No se requiere cambio adicional en la mutación.

- [ ] **Step 4: Build**

Run: `cd "/Users/saidromero/Balance Room/Balance Room " && npm run build`
Expected: `vite build` sin errores.

- [ ] **Step 5: Commit**

```bash
cd "/Users/saidromero/Balance Room/Balance Room "
git add src/pages/admin/payments/PaymentsRegister.tsx
git commit -m "feat(payments-ui): studio & concept on member payment register"
```

---

## Task 15: Pestaña "Ingreso manual" (UI sin miembro)

**Files:**
- Create: `WEB/src/pages/admin/payments/ManualIncome.tsx`
- Modify: `WEB/src/pages/admin/payments/PaymentsHub.tsx` (TabsList/TabsContent ≈líneas 24–61)

- [ ] **Step 1: Crear el componente `ManualIncome.tsx`**

```tsx
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';

const schema = z.object({
  amount: z.coerce.number().positive('Monto inválido'),
  concept: z.string().min(1, 'Concepto requerido'),
  paymentMethod: z.enum(['cash', 'transfer', 'card', 'online']),
  facilityId: z.string().uuid().optional(),
  incomeDate: z.string().optional(),
  notes: z.string().optional(),
});
type Form = z.infer<typeof schema>;

export default function ManualIncome() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: facilities = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ['facilities'],
    queryFn: async () => (await api.get('/facilities')).data,
  });
  const { data: list = [] } = useQuery<any[]>({
    queryKey: ['manual-incomes'],
    queryFn: async () => (await api.get('/payments/manual-income')).data,
  });
  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { paymentMethod: 'cash' },
  });
  const mutation = useMutation({
    mutationFn: async (payload: Form) => (await api.post('/payments/manual-income', payload)).data,
    onSuccess: () => {
      toast({ title: 'Ingreso registrado' });
      reset({ paymentMethod: 'cash' });
      qc.invalidateQueries({ queryKey: ['manual-incomes'] });
      qc.invalidateQueries({ queryKey: ['admin-stats'] });
    },
    onError: (e: any) => toast({ variant: 'destructive', title: 'Error', description: e?.response?.data?.error || 'No se pudo registrar' }),
  });

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="text-sm font-medium">Monto</label>
          <Input type="number" step="0.01" {...register('amount')} />
          {errors.amount && <p className="text-xs text-destructive">{errors.amount.message}</p>}
        </div>
        <div>
          <label className="text-sm font-medium">Concepto</label>
          <Input {...register('concept')} placeholder="Ej. Venta de producto" />
          {errors.concept && <p className="text-xs text-destructive">{errors.concept.message}</p>}
        </div>
        <div>
          <label className="text-sm font-medium">Método</label>
          <Select defaultValue="cash" onValueChange={(v) => setValue('paymentMethod', v as Form['paymentMethod'])}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="cash">Efectivo</SelectItem>
              <SelectItem value="transfer">Transferencia</SelectItem>
              <SelectItem value="card">Tarjeta</SelectItem>
              <SelectItem value="online">En línea</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-sm font-medium">Estudio (opcional)</label>
          <Select onValueChange={(v) => setValue('facilityId', v)}>
            <SelectTrigger><SelectValue placeholder="General" /></SelectTrigger>
            <SelectContent>
              {facilities.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-sm font-medium">Fecha (opcional)</label>
          <Input type="date" {...register('incomeDate')} />
        </div>
        <div>
          <label className="text-sm font-medium">Notas</label>
          <Input {...register('notes')} />
        </div>
        <div className="sm:col-span-2">
          <Button type="submit" disabled={mutation.isPending}>Registrar ingreso</Button>
        </div>
      </form>

      <div className="rounded-xl border">
        <table className="w-full text-sm">
          <thead><tr className="border-b text-left text-muted-foreground">
            <th className="p-3">Fecha</th><th className="p-3">Concepto</th><th className="p-3">Estudio</th><th className="p-3">Método</th><th className="p-3 text-right">Monto</th>
          </tr></thead>
          <tbody>
            {list.map((r) => (
              <tr key={r.id} className="border-b last:border-0">
                <td className="p-3">{String(r.income_date).slice(0, 10)}</td>
                <td className="p-3">{r.concept}</td>
                <td className="p-3">{r.facility_name || 'General'}</td>
                <td className="p-3">{r.payment_method}</td>
                <td className="p-3 text-right tabular-nums">${Number(r.amount).toFixed(2)}</td>
              </tr>
            ))}
            {list.length === 0 && <tr><td className="p-3 text-muted-foreground" colSpan={5}>Sin ingresos manuales.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

(Si la ruta de imports difiere — p. ej. `@/components/ui/*` o `useToast` — alinear con cómo importa `PaymentsRegister.tsx` en el mismo directorio.)

- [ ] **Step 2: Añadir la pestaña en `PaymentsHub.tsx`**

En `TabsList` agregar un `TabsTrigger value="manual-income"` con un ícono (p. ej. `Banknote` de lucide, ya que el archivo importa íconos lucide) y etiqueta "Ingreso manual"; agregar el `TabsContent value="manual-income"` que renderiza `<ManualIncome />` (importar el componente al inicio del archivo). Seguir exactamente el patrón de las pestañas existentes (`register`, `transactions`).

- [ ] **Step 3: Build**

Run: `cd "/Users/saidromero/Balance Room/Balance Room " && npm run build`
Expected: `vite build` sin errores.

- [ ] **Step 4: Commit**

```bash
cd "/Users/saidromero/Balance Room/Balance Room "
git add "src/pages/admin/payments/ManualIncome.tsx" "src/pages/admin/payments/PaymentsHub.tsx"
git commit -m "feat(payments-ui): manual income tab (no-member income)"
```

---

## Task 16: Suite de pruebas + verificación final

**Files:** (sin cambios de código; verificación)

- [ ] **Step 1: Correr todas las pruebas unitarias del API**

Run: `cd "/Users/saidromero/Balance Room/balance-room-api" && npm test`
Expected: imprime `test-membership-studio: OK`, `test-dashboard-studio: OK`, `test-manual-income: OK`, sale con código 0.

- [ ] **Step 2: Build del API**

Run: `cd "/Users/saidromero/Balance Room/balance-room-api" && npm run build`
Expected: `tsc` sin errores.

- [ ] **Step 3: Build del frontend**

Run: `cd "/Users/saidromero/Balance Room/Balance Room " && npm run build`
Expected: `vite build` sin errores.

- [ ] **Step 4: Verificación funcional manual (humo)**

Con el API corriendo (`npm run dev` en `balance-room-api`) y la migración aplicada al iniciar:
1. `GET /api/plans` devuelve los 10 planes nuevos con `package_type` y `requires_studio_selection`; los viejos con `is_active=false`.
2. Crear orden de un plan `individual` sin `facility_id` → HTTP 422 "requiere elegir un estudio".
3. Crear orden de plan `individual` con `facility_id` válido → 201 y `orders.facility_id` poblado.
4. Reservar con membresía individual atada a Wunda una clase de Barre → HTTP 422 con el mensaje de estudio; misma membresía en clase de Wunda → OK.
5. `GET /api/admin/stats` devuelve `classesByStudio` con los 3 estudios (incluye 0) y `revenue` que suma `manual_incomes` del día.
6. `POST /api/payments/manual-income` con monto/concepto/método → 201; aparece en `GET /api/payments/manual-income` y suma en `GET /api/payments/reports`.
7. Dashboard muestra el bloque "Clases hoy por estudio"; hub de pagos muestra la pestaña "Ingreso manual".

- [ ] **Step 5: Commit final (si quedaran ajustes)**

```bash
cd "/Users/saidromero/Balance Room/balance-room-api" && git add -A && git commit -m "test: verify pricing/studio/manual-income end to end" --allow-empty
```

---

## Notas / Asunciones

- **Vigencia de paquetes** (`duration_days`): asunción (30/45/60/90). No venía en la imagen; ajustar valores en el bloque de Migración 022 antes de desplegar si el negocio define otra.
- **Clase Muestra gratis con paquete**: regla de punto de venta — el admin registra la muestra en $0 (o como ingreso manual) cuando acompaña a un paquete. Sin automatización en esta entrega.
- **Atadura de estudio**: se resuelve con `COALESCE(memberships.facility_id, orders.facility_id)` para no tocar los 6 puntos de creación de membresías; el flujo de compra (orders) es el que la fija.
- Repos git separados: ejecutar los `git commit` dentro del repo correspondiente (API o frontend) según indica cada tarea.
