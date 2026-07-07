# Fuel Bar (Barra de Bebidas) — Fase 1 MVP — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que una socia pida bebidas del menú Casa Shé desde la app, elija hora de recogida y método de pago (pago en barra o tarjeta con MercadoPago), y el staff gestione la cola desde el admin — todo detrás de un interruptor maestro apagado por default.

**Architecture:** Tabla `bar_orders` + `bar_order_items` NUEVAS (separadas de `orders`, cuyo `plan_id` es NOT NULL). El menú reutiliza la tabla `products` existente filtrada por categorías de barra. El pago con tarjeta reutiliza `createPreference()` de MercadoPago con `external_reference = "bar:<id>"`, y el webhook existente enruta ese prefijo a un `finalizeBarOrder()` nuevo (nunca mezcla con membresías). Config en `system_settings` key `bar_config`. Notificación "lista" vía `sendWebPushToUser`.

**Tech Stack:** Node/TS ESM + Express + `pg` crudo (backend); React/Vite + Tailwind + shadcn + TanStack Query (frontend); MercadoPago Checkout Pro; web-push (VAPID). Tests backend = scripts `tsx` con `node:assert/strict`.

## Global Constraints

- **Apagada por default:** `bar_config.enabled = false`. Con la barra apagada, `GET /api/bar/menu` y `POST /api/bar/orders` responden `503 { error: 'BAR_DISABLED' }`.
- **NO reutilizar la tabla `orders`** (su `plan_id` es NOT NULL). Bar usa `bar_orders`.
- **Pago con puntos DIFERIDO** a Fase 2 (hoy la lealtad solo canjea catálogo fijo, no saldo libre). Fase 1: solo `reception` (pagar en barra) + `card` (MercadoPago).
- **El webhook de MP debe distinguir** órdenes de barra (`external_reference` con prefijo `bar:`) de membresías; jamás finalizar una como la otra.
- **Paleta y tipografía Casa Shé:** verde `#2A4E36` (`casa-verde`/`balance-olive`), crema `#F6F0E4`/`#F6EFE1` (`casa-avena`/`balance-cream`), arcilla `#AE4836` (`casa-arcilla`/`balance-gold`), `font-heading` (Instrument Serif). Fuente visual de las 3 pantallas = el mockup aprobado (guardado en `docs/superpowers/assets/fuelbar-mockup.html`, copiar ahí el HTML del scratchpad).
- **Categorías de barra (match por nombre):** `['Calientes con café', 'Fríos sin café', 'Tisanas', 'Fríos con café', 'Smoothies', 'Proteínas']`.
- **Estados de orden:** `pending → preparing → ready → delivered` (terminal) y `→ cancelled` (terminal) desde cualquier no-terminal.
- Ramas + PR + merge → Railway auto-deploy. Nunca push directo a main.

---

## File Structure

**Backend (crear):**
- `backend/src/lib/bar.ts` — helpers puros: `BAR_CATEGORY_NAMES`, `isBarOpenAt()`, `computeBarTotals()`, `canBarTransition()`.
- `backend/src/lib/barFulfillment.ts` — `finalizeBarOrder()` (marca pagada una orden de tarjeta al confirmar el webhook).
- `backend/src/routes/bar.ts` — endpoints cliente + staff bajo `/api/bar`.
- `backend/scripts/test-bar.ts` — tests de los helpers puros.

**Backend (modificar):**
- `backend/src/lib/settings.ts` — tipo `BarConfig` + default `bar_config`.
- `backend/src/routes/settings.ts` — `GET/PUT /settings/bar-config`.
- `backend/src/index.ts` — migración (tablas `bar_orders`/`bar_order_items` + seed del menú) + montar `/api/bar` + agregar `test-bar` al script.
- `backend/src/routes/mercadopago-webhook.ts` — dispatcher del prefijo `bar:`.
- `backend/src/routes/bookings.ts` — cascada: cancelar `bar_orders` al cancelar reserva.
- `backend/src/lib/cancel-class.ts` — cascada: cancelar `bar_orders` al cancelar clase completa.
- `backend/package.json` — agregar `test-bar` al script `test`.

**Frontend (crear):**
- `frontend/src/lib/api/bar.ts` — cliente API + hooks TanStack Query.
- `frontend/src/pages/client/FuelBar.tsx` — pantalla Menú (mockup 01).
- `frontend/src/pages/client/FuelBarConfirm.tsx` — pantalla Confirmar (mockup 02).
- `frontend/src/pages/client/FuelBarOrder.tsx` — pantalla tracking/¡Lista! (mockup 03).
- `frontend/src/pages/admin/bar/BarQueue.tsx` — cola del staff.
- `frontend/src/pages/admin/settings/BarSettings.tsx` — config (toggle + horario).

**Frontend (modificar):**
- `frontend/src/App.tsx` — rutas `/app/fuel-bar*`, `/admin/bar/queue`, `/admin/settings/bar`.
- `frontend/src/components/layout/AdminLayout.tsx` — item de nav "Barra".

---

### Task 1: Helpers puros de barra + config `bar_config`

**Files:**
- Create: `backend/src/lib/bar.ts`
- Modify: `backend/src/lib/settings.ts` (interface `SettingsMap` ~línea 86, `DEFAULTS` ~línea 102)
- Test: `backend/scripts/test-bar.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `BAR_CATEGORY_NAMES: string[]`
  - `BarConfig { enabled: boolean; operating_hours: Record<number, {open: string; close: string} | null>; lead_time_max_hours: number; pickup_offset_minutes: number }`
  - `isBarOpenAt(cfg: BarConfig, d: Date): boolean`
  - `computeBarTotals(items: {unit_price_mxn: number; quantity: number}[]): { subtotal_mxn: number; total_mxn: number }`
  - `canBarTransition(from: BarStatus, to: BarStatus, actor: 'staff'|'customer'|'system'): boolean`
  - `type BarStatus = 'pending'|'preparing'|'ready'|'delivered'|'cancelled'`

- [ ] **Step 1: Write the failing test** — `backend/scripts/test-bar.ts`

```typescript
import assert from 'node:assert/strict';
import { isBarOpenAt, computeBarTotals, canBarTransition, type BarConfig } from '../src/lib/bar.js';

const cfg: BarConfig = {
  enabled: true,
  // 0=Dom .. 6=Sáb. Mar (2) 07:00–20:00; Dom (0) cerrado.
  operating_hours: { 0: null, 1: { open: '07:00', close: '20:00' }, 2: { open: '07:00', close: '20:00' } },
  lead_time_max_hours: 4,
  pickup_offset_minutes: -2,
};

// isBarOpenAt: dentro del horario del lunes
assert.equal(isBarOpenAt(cfg, new Date('2026-07-06T10:00:00-06:00')), true, 'lun 10:00 abierto');
// fuera de horario (antes de abrir)
assert.equal(isBarOpenAt(cfg, new Date('2026-07-06T06:00:00-06:00')), false, 'lun 06:00 cerrado');
// día cerrado (domingo)
assert.equal(isBarOpenAt(cfg, new Date('2026-07-05T10:00:00-06:00')), false, 'dom cerrado');
// barra apagada → nunca abierto
assert.equal(isBarOpenAt({ ...cfg, enabled: false }, new Date('2026-07-06T10:00:00-06:00')), false, 'apagada');

// computeBarTotals: suma líneas, redondea a 2 decimales
const t = computeBarTotals([{ unit_price_mxn: 85, quantity: 2 }, { unit_price_mxn: 75, quantity: 1 }]);
assert.equal(t.subtotal_mxn, 245);
assert.equal(t.total_mxn, 245);

// canBarTransition: máquina de estados
assert.equal(canBarTransition('pending', 'preparing', 'staff'), true);
assert.equal(canBarTransition('preparing', 'ready', 'staff'), true);
assert.equal(canBarTransition('ready', 'delivered', 'staff'), true);
assert.equal(canBarTransition('pending', 'cancelled', 'customer'), true, 'cliente cancela pending');
assert.equal(canBarTransition('preparing', 'cancelled', 'customer'), false, 'cliente NO cancela preparing');
assert.equal(canBarTransition('delivered', 'preparing', 'staff'), false, 'terminal no transiciona');
assert.equal(canBarTransition('pending', 'ready', 'staff'), false, 'no salta de pending a ready');

console.log('test-bar OK');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx tsx scripts/test-bar.ts`
Expected: FAIL (`Cannot find module '../src/lib/bar.js'`).

- [ ] **Step 3: Create `backend/src/lib/bar.ts`**

```typescript
// Barra de bebidas: helpers puros (sin BD, testeables). Ver scripts/test-bar.ts
export const BAR_CATEGORY_NAMES = [
  'Calientes con café', 'Fríos sin café', 'Tisanas', 'Fríos con café', 'Smoothies', 'Proteínas',
] as const;

export type BarStatus = 'pending' | 'preparing' | 'ready' | 'delivered' | 'cancelled';

export interface BarConfig {
  enabled: boolean;
  // clave = día de la semana (0=Dom .. 6=Sáb). null = cerrado ese día.
  operating_hours: Record<number, { open: string; close: string } | null>;
  lead_time_max_hours: number;   // cuánto se puede programar la recogida hacia adelante
  pickup_offset_minutes: number; // offset vs fin de clase (negativo = lista antes)
}

function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

// Usa hora LOCAL del servidor. En producción el server corre en la TZ del estudio.
export function isBarOpenAt(cfg: BarConfig, d: Date): boolean {
  if (!cfg?.enabled) return false;
  const dow = d.getDay();
  const hours = cfg.operating_hours?.[dow];
  if (!hours) return false;
  const mins = d.getHours() * 60 + d.getMinutes();
  return mins >= hhmmToMinutes(hours.open) && mins < hhmmToMinutes(hours.close);
}

export function computeBarTotals(items: { unit_price_mxn: number; quantity: number }[]): { subtotal_mxn: number; total_mxn: number } {
  const subtotal = items.reduce((acc, it) => acc + Number(it.unit_price_mxn) * Number(it.quantity), 0);
  const r = Math.round(subtotal * 100) / 100;
  return { subtotal_mxn: r, total_mxn: r };
}

const STAFF: Record<BarStatus, BarStatus[]> = {
  pending: ['preparing', 'cancelled'],
  preparing: ['ready', 'cancelled'],
  ready: ['delivered', 'cancelled'],
  delivered: [],
  cancelled: [],
};
export function canBarTransition(from: BarStatus, to: BarStatus, actor: 'staff' | 'customer' | 'system'): boolean {
  if (actor === 'customer' || actor === 'system') return from === 'pending' && to === 'cancelled';
  return (STAFF[from] ?? []).includes(to);
}
```

- [ ] **Step 4: Add `BarConfig` + default to `backend/src/lib/settings.ts`**

En la interface `SettingsMap` (junto a `bank_info`), agrega la línea `bar_config: BarConfig;` e importa/re-declara el tipo. Al inicio del archivo agrega:

```typescript
import type { BarConfig } from './bar.js';
```

Dentro de `interface SettingsMap { ... }` agrega:

```typescript
    bar_config: BarConfig;
```

Dentro de `const DEFAULTS: SettingsMap = { ... }` agrega:

```typescript
    bar_config: {
      enabled: false, // APAGADA por default (Global Constraint)
      operating_hours: {
        0: null,
        1: { open: '07:00', close: '20:00' },
        2: { open: '07:00', close: '20:00' },
        3: { open: '07:00', close: '20:00' },
        4: { open: '07:00', close: '20:00' },
        5: { open: '07:00', close: '20:00' },
        6: { open: '08:00', close: '14:00' },
      },
      lead_time_max_hours: 4,
      pickup_offset_minutes: -2,
    },
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && npx tsx scripts/test-bar.ts`
Expected: `test-bar OK`

- [ ] **Step 6: Register test + typecheck + commit**

En `backend/package.json` script `test`, agrega ` && tsx scripts/test-bar.ts` al final de la cadena.

Run: `cd backend && npx tsc --noEmit` → sin errores.

```bash
git add backend/src/lib/bar.ts backend/src/lib/settings.ts backend/scripts/test-bar.ts backend/package.json
git commit -m "feat(bar): helpers puros (horario, totales, máquina de estados) + bar_config"
```

---

### Task 2: Tablas `bar_orders` + `bar_order_items` + seed del menú real

**Files:**
- Modify: `backend/src/index.ts` (bloque de migraciones, junto a "Migration 022"; y el bloque de seeds junto a "Seed ...")

**Interfaces:**
- Produces (esquema que consumen las tareas 3, 5, 6, 7, 8):
  - `bar_orders(id uuid pk, user_id uuid, booking_id uuid null, status text, pickup_time timestamptz, payment_method text, payment_status text, subtotal_mxn numeric, total_mxn numeric, customer_notes text, cancellation_reason text, cancelled_by text, mp_checkout_url text, mp_payment_id text, provider text, preparing_at/ready_at/delivered_at/cancelled_at timestamptz, created_at/updated_at)`
  - `bar_order_items(id uuid pk, bar_order_id uuid, product_id uuid, product_name text, quantity int, unit_price_mxn numeric, line_total_mxn numeric)`

- [ ] **Step 1: Agregar migración de tablas en `backend/src/index.ts`**

Busca el bloque `// Migration 022: MercadoPago columns...` y AÑADE después un bloque nuevo:

```typescript
    // Migration BAR-01: tablas de la Barra de Bebidas (Fuel Bar).
    try {
        await query(`CREATE TABLE IF NOT EXISTS bar_orders (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
            status VARCHAR(20) NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','preparing','ready','delivered','cancelled')),
            pickup_time TIMESTAMPTZ NOT NULL,
            payment_method VARCHAR(20) NOT NULL CHECK (payment_method IN ('reception','card')),
            payment_status VARCHAR(20) NOT NULL DEFAULT 'pending'
                CHECK (payment_status IN ('pending','paid','refunded','failed')),
            subtotal_mxn NUMERIC(10,2) NOT NULL DEFAULT 0,
            total_mxn NUMERIC(10,2) NOT NULL DEFAULT 0,
            customer_notes VARCHAR(140),
            cancellation_reason TEXT,
            cancelled_by VARCHAR(30),
            mp_checkout_url TEXT,
            mp_payment_id VARCHAR(255),
            provider VARCHAR(30),
            preparing_at TIMESTAMPTZ, ready_at TIMESTAMPTZ, delivered_at TIMESTAMPTZ, cancelled_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
        )`);
        await query(`CREATE INDEX IF NOT EXISTS idx_bar_orders_queue ON bar_orders(status, pickup_time)
                     WHERE status IN ('pending','preparing','ready')`);
        await query(`CREATE INDEX IF NOT EXISTS idx_bar_orders_user ON bar_orders(user_id)`);
        await query(`CREATE INDEX IF NOT EXISTS idx_bar_orders_booking ON bar_orders(booking_id)`);
        await query(`CREATE TABLE IF NOT EXISTS bar_order_items (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            bar_order_id UUID NOT NULL REFERENCES bar_orders(id) ON DELETE CASCADE,
            product_id UUID REFERENCES products(id) ON DELETE SET NULL,
            product_name VARCHAR(200) NOT NULL,
            quantity INTEGER NOT NULL CHECK (quantity > 0),
            unit_price_mxn NUMERIC(10,2) NOT NULL,
            line_total_mxn NUMERIC(10,2) NOT NULL
        )`);
        console.log('Migration BAR-01: bar_orders + bar_order_items listas.');
    } catch (e) { console.error('Migration BAR-01 error:', e); }
```

- [ ] **Step 2: Agregar seed del menú real (idempotente) en `backend/src/index.ts`**

Después de la migración BAR-01, añade el seed. Usa el `facility_id` de la única sede. **Idempotente:** inserta cada producto solo si no existe uno con el mismo nombre.

```typescript
    // Seed BAR-menu: categorías + productos reales del menú Casa Shé (idempotente).
    try {
        const fac = await queryOne<{ id: string }>(`SELECT id FROM facilities LIMIT 1`);
        if (fac) {
            const CATS = ['Calientes con café','Fríos sin café','Tisanas','Fríos con café','Smoothies','Proteínas'];
            const catId: Record<string, string> = {};
            for (const name of CATS) {
                const row = await queryOne<{ id: string }>(
                    `INSERT INTO product_categories (name) VALUES ($1)
                     ON CONFLICT DO NOTHING RETURNING id`, [name]);
                catId[name] = row?.id
                    ?? (await queryOne<{ id: string }>(`SELECT id FROM product_categories WHERE name = $1`, [name]))!.id;
            }
            const MENU: [string, string, number][] = [
                ['Americano','Calientes con café',50], ['Latte','Calientes con café',70],
                ['Cappuccino','Calientes con café',70], ['Capuchino Shot','Calientes con café',85],
                ['Matcha tradicional','Fríos sin café',75], ['Coco Matcha Shé','Fríos sin café',85],
                ['Latte frío','Fríos sin café',75], ['Latte Shot','Fríos sin café',85],
                ['Te verde','Tisanas',55], ['Jardín de flores','Tisanas',55], ['Cítricos del Sol','Tisanas',55],
                ['Terracota','Fríos con café',80], ['Especias','Fríos con café',80], ['Jade','Fríos con café',80],
                ['Sol Verde','Smoothies',85], ['Banana Cacao','Smoothies',85], ['Rubí','Smoothies',85],
                ['Proteína','Proteínas',85],
            ];
            for (const [name, cat, price] of MENU) {
                await query(
                    `INSERT INTO products (name, price, stock, category_id, facility_id, is_active)
                     SELECT $1, $2, 0, $3, $4, true
                     WHERE NOT EXISTS (SELECT 1 FROM products WHERE name = $1)`,
                    [name, price, catId[cat], fac.id]);
            }
            console.log('Seed BAR-menu: menú Casa Shé sembrado.');
        }
    } catch (e) { console.error('Seed BAR-menu error:', e); }
```

> Nota: `product_categories(name)` debe tener índice único para el `ON CONFLICT`. Si no lo tiene, el `INSERT ... ON CONFLICT DO NOTHING` sin target falla; en ese caso reemplaza el upsert de categoría por: `SELECT id` primero y `INSERT` solo si no existe (mismo patrón que los productos). Verifica con `\d product_categories` antes.

- [ ] **Step 3: Verificar (arranque local o query directa)**

Run: `cd backend && npx tsc --noEmit` → sin errores.
Verificación manual (con la BD local corriendo): reiniciar el backend y correr
`psql "$DATABASE_URL" -c "SELECT count(*) FROM bar_orders; SELECT name, price FROM products WHERE name IN ('Sol Verde','Americano') ORDER BY name;"`
Expected: tablas existen; productos sembrados.

- [ ] **Step 4: Commit**

```bash
git add backend/src/index.ts
git commit -m "feat(bar): tablas bar_orders/bar_order_items + seed del menú Casa Shé"
```

---

### Task 3: Endpoint de menú y config del cliente (`GET /api/bar/menu`, `GET /api/bar/config`)

**Files:**
- Create: `backend/src/routes/bar.ts`
- Modify: `backend/src/index.ts` (montar `app.use('/api/bar', barRoutes)` junto a `app.use('/api/products', productRoutes)` ~línea 3494; e `import barRoutes from './routes/bar.js';` arriba)

**Interfaces:**
- Consumes: `getSetting('bar_config')`, `isBarOpenAt`, `BAR_CATEGORY_NAMES` (Task 1); tabla `products` + `product_categories`.
- Produces:
  - `GET /api/bar/config` → `{ enabled: boolean }` (público para autenticados; el front decide si mostrar la sección).
  - `GET /api/bar/menu` → `{ open: boolean, products: {id,name,description,price,category_name,image_url,stock}[] }`; `503 { error:'BAR_DISABLED' }` si apagada.

- [ ] **Step 1: Create `backend/src/routes/bar.ts` (menú + config)**

```typescript
import { Router, Request, Response } from 'express';
import { query } from '../config/database.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { getSetting } from '../lib/settings.js';
import { isBarOpenAt, BAR_CATEGORY_NAMES } from '../lib/bar.js';

const router = Router();

// GET /api/bar/config — ¿está habilitada la barra? (para mostrar/ocultar la sección)
router.get('/config', authenticate, async (_req: Request, res: Response) => {
  const cfg = await getSetting('bar_config');
  res.json({ enabled: cfg.enabled === true });
});

// GET /api/bar/menu — menú (productos de categorías de barra) + estado abierto/cerrado.
router.get('/menu', authenticate, async (_req: Request, res: Response) => {
  const cfg = await getSetting('bar_config');
  if (!cfg.enabled) return res.status(503).json({ error: 'BAR_DISABLED' });
  const products = await query(
    `SELECT p.id, p.name, p.description, p.price, p.image_url, p.stock, pc.name AS category_name
     FROM products p JOIN product_categories pc ON pc.id = p.category_id
     WHERE p.is_active = true AND pc.name = ANY($1::text[])
     ORDER BY array_position($1::text[], pc.name), p.name`,
    [BAR_CATEGORY_NAMES as unknown as string[]]
  );
  res.json({ open: isBarOpenAt(cfg, new Date()), products });
});

export default router;
```

- [ ] **Step 2: Montar el router en `backend/src/index.ts`**

Arriba con los demás imports: `import barRoutes from './routes/bar.js';`
Junto a `app.use('/api/products', productRoutes);`: `app.use('/api/bar', barRoutes);`

- [ ] **Step 3: Typecheck + prueba manual**

Run: `cd backend && npx tsc --noEmit` → sin errores.
Prueba (con la barra en `enabled:false`): `curl -H "Authorization: Bearer <token>" localhost:3001/api/bar/menu` → `503 BAR_DISABLED`. Con `enabled:true` (PUT en Task siguiente o UPDATE manual) → `{ open, products:[...] }`.

- [ ] **Step 4: Commit**

```bash
git add backend/src/routes/bar.ts backend/src/index.ts
git commit -m "feat(bar): endpoint de menú y config del cliente"
```

---

### Task 4: Config admin (`GET/PUT /api/settings/bar-config`) + pantalla `BarSettings`

**Files:**
- Modify: `backend/src/routes/settings.ts` (junto a `/bank-info`)
- Create: `frontend/src/pages/admin/settings/BarSettings.tsx`
- Modify: `frontend/src/App.tsx` (ruta `/admin/settings/bar`)

**Interfaces:**
- Consumes: `getSetting/setSetting('bar_config')` (Task 1).
- Produces: `GET /api/settings/bar-config` → `BarConfig`; `PUT /api/settings/bar-config` (admin) guarda `BarConfig`.

- [ ] **Step 1: Backend — rutas en `backend/src/routes/settings.ts`** (calcar `/bank-info`)

```typescript
import { getSetting, setSetting } from '../lib/settings.js';

// GET /api/settings/bar-config — autenticados (admin edita; el cliente usa /api/bar/config)
router.get('/bar-config', authenticate, async (_req: Request, res: Response) => {
  res.json(await getSetting('bar_config'));
});

// PUT /api/settings/bar-config — solo admin
router.put('/bar-config', authenticate, requireRole('admin', 'super_admin'), async (req: Request, res: Response) => {
  const b = req.body ?? {};
  const value = {
    enabled: b.enabled === true,
    operating_hours: b.operating_hours ?? {},
    lead_time_max_hours: Number(b.lead_time_max_hours ?? 4),
    pickup_offset_minutes: Number(b.pickup_offset_minutes ?? -2),
  };
  await setSetting('bar_config', value as any, req.user?.userId);
  res.json({ message: 'Configuración de barra guardada', bar_config: value });
});
```

- [ ] **Step 2: Frontend — `frontend/src/pages/admin/settings/BarSettings.tsx`**

Pantalla mínima: un `Switch` (shadcn) para `enabled` + inputs de horario por día. Estructura (calca `StudioSettings.tsx`):

```tsx
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import api from '@/lib/api';
import { useState, useEffect } from 'react';

export default function BarSettings() {
  const qc = useQueryClient(); const { toast } = useToast();
  const { data } = useQuery({ queryKey: ['bar-config'], queryFn: async () => (await api.get('/settings/bar-config')).data });
  const [enabled, setEnabled] = useState(false);
  useEffect(() => { if (data) setEnabled(!!data.enabled); }, [data]);
  const save = useMutation({
    mutationFn: async () => (await api.put('/settings/bar-config', { ...data, enabled })).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['bar-config'] }); toast({ title: 'Barra actualizada' }); },
  });
  return (
    <AuthGuard requiredRoles={['admin','super_admin']}><AdminLayout>
      <div className="mx-auto max-w-2xl space-y-6 p-4">
        <Card>
          <CardHeader><CardTitle className="font-heading text-balance-olive">Barra de bebidas</CardTitle>
            <CardDescription>Enciende la barra cuando estés lista para recibir pedidos.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div><p className="font-medium">Barra abierta</p>
                <p className="text-sm text-muted-foreground">Si está apagada, las socias no ven el Fuel Bar.</p></div>
              <Switch checked={enabled} onCheckedChange={setEnabled} />
            </div>
            <Button onClick={() => save.mutate()} disabled={save.isPending} style={{ backgroundColor: '#2A4E36' }}>
              {save.isPending ? 'Guardando…' : 'Guardar'}</Button>
          </CardContent>
        </Card>
      </div>
    </AdminLayout></AuthGuard>
  );
}
```

> El editor de horario por día se puede dejar con los defaults del backend en Fase 1 (el toggle es lo crítico). Ampliar en Fase 2.

- [ ] **Step 3: Ruta en `frontend/src/App.tsx`** — junto a las otras `/admin/settings/*`:

```tsx
import BarSettings from './pages/admin/settings/BarSettings';
// ...
<Route path="/admin/settings/bar" element={<BarSettings />} />
```

- [ ] **Step 4: Typecheck + commit**

Run: `cd backend && npx tsc --noEmit` && `cd ../frontend && npx tsc --noEmit` → sin errores.

```bash
git add backend/src/routes/settings.ts frontend/src/pages/admin/settings/BarSettings.tsx frontend/src/App.tsx
git commit -m "feat(bar): config admin (toggle) para encender/apagar la barra"
```

---

### Task 5: Crear pedido (`POST /api/bar/orders`) — pago en barra + tarjeta MP

**Files:**
- Modify: `backend/src/routes/bar.ts`

**Interfaces:**
- Consumes: `getSetting('bar_config')`, `isBarOpenAt`, `computeBarTotals` (Task 1); `createPreference` de `../lib/mercadopago.js` (firma: `createPreference({orderId, orderNumber?, items, payerEmail?, backUrl, notificationUrl?}) → {preferenceId, checkoutUrl}`).
- Produces: `POST /api/bar/orders` body `{ items: {productId, quantity}[], pickupTime: string(ISO), paymentMethod: 'reception'|'card', notes?, bookingId? }` → crea `bar_orders` + items. Para `card` devuelve `{ id, checkout_url }`; para `reception` `{ id }`. **external_reference de MP = `bar:<barOrderId>`** (lo consume el webhook, Task 6).

- [ ] **Step 1: Añadir el handler a `backend/src/routes/bar.ts`**

```typescript
import { z } from 'zod';
import { queryOne } from '../config/database.js';
import { getSetting } from '../lib/settings.js';
import { computeBarTotals } from '../lib/bar.js';
import { createPreference, mpConfigured } from '../lib/mercadopago.js';

const CreateBarOrder = z.object({
  items: z.array(z.object({ productId: z.string().uuid(), quantity: z.number().int().positive() })).min(1),
  pickupTime: z.string(),
  paymentMethod: z.enum(['reception', 'card']),
  notes: z.string().max(140).optional(),
  bookingId: z.string().uuid().optional(),
});

router.post('/orders', authenticate, async (req: Request, res: Response) => {
  const cfg = await getSetting('bar_config');
  if (!cfg.enabled) return res.status(503).json({ error: 'BAR_DISABLED' });
  const parsed = CreateBarOrder.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten().fieldErrors });
  const { items, pickupTime, paymentMethod, notes, bookingId } = parsed.data;
  const userId = req.user!.userId;

  const pickup = new Date(pickupTime);
  if (isNaN(pickup.getTime()) || pickup.getTime() < Date.now() - 60_000) {
    return res.status(400).json({ error: 'INVALID_PICKUP_TIME' });
  }

  // Cotiza cada producto EN SERVIDOR (el cliente nunca manda precio).
  const priced: { productId: string; name: string; quantity: number; unit_price_mxn: number }[] = [];
  for (const it of items) {
    const p = await queryOne<{ id: string; name: string; price: string; is_active: boolean }>(
      `SELECT id, name, price, is_active FROM products WHERE id = $1`, [it.productId]);
    if (!p || !p.is_active) return res.status(400).json({ error: 'PRODUCT_NOT_FOUND', productId: it.productId });
    priced.push({ productId: p.id, name: p.name, quantity: it.quantity, unit_price_mxn: Number(p.price) });
  }
  const totals = computeBarTotals(priced);

  // Inserta la orden (pending) + items.
  const order = await queryOne<{ id: string }>(
    `INSERT INTO bar_orders (user_id, booking_id, status, pickup_time, payment_method, payment_status, subtotal_mxn, total_mxn, customer_notes)
     VALUES ($1, $2, 'pending', $3, $4, 'pending', $5, $6, $7) RETURNING id`,
    [userId, bookingId ?? null, pickup.toISOString(), paymentMethod, totals.subtotal_mxn, totals.total_mxn, notes ?? null]);
  const orderId = order!.id;
  for (const it of priced) {
    await query(
      `INSERT INTO bar_order_items (bar_order_id, product_id, product_name, quantity, unit_price_mxn, line_total_mxn)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [orderId, it.productId, it.name, it.quantity, it.unit_price_mxn, it.unit_price_mxn * it.quantity]);
  }

  if (paymentMethod === 'card') {
    if (!mpConfigured()) {
      await query(`DELETE FROM bar_orders WHERE id = $1`, [orderId]);
      return res.status(503).json({ error: 'Pago con tarjeta no disponible' });
    }
    const user = await queryOne<{ email: string }>(`SELECT email FROM users WHERE id = $1`, [userId]);
    try {
      const pref = await createPreference({
        orderId: `bar:${orderId}`,           // ← prefijo que el webhook enruta a la barra
        items: priced.map((p) => ({ title: p.name, quantity: p.quantity, unit_price: p.unit_price_mxn })),
        payerEmail: user?.email || undefined,
        backUrl: `${process.env.FRONTEND_URL}/app/fuel-bar/order/${orderId}`,
        notificationUrl: process.env.BACKEND_URL ? `${process.env.BACKEND_URL}/webhooks/mercadopago` : undefined,
      });
      await query(`UPDATE bar_orders SET provider='mercadopago', mp_checkout_url=$1, updated_at=NOW() WHERE id=$2`, [pref.checkoutUrl, orderId]);
      return res.status(201).json({ id: orderId, checkout_url: pref.checkoutUrl });
    } catch (e: any) {
      await query(`DELETE FROM bar_orders WHERE id = $1`, [orderId]);
      return res.status(502).json({ error: 'CARD_PAYMENT_FAILED' });
    }
  }
  // reception → entra a la cola sin pagar
  return res.status(201).json({ id: orderId });
});

// GET /api/bar/orders/mine — historial propio
router.get('/orders/mine', authenticate, async (req: Request, res: Response) => {
  const rows = await query(`SELECT * FROM bar_orders WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`, [req.user!.userId]);
  res.json(rows);
});

// GET /api/bar/orders/:id — detalle (dueño o staff) con items
router.get('/orders/:id', authenticate, async (req: Request, res: Response) => {
  const o = await queryOne<any>(`SELECT * FROM bar_orders WHERE id = $1`, [req.params.id]);
  if (!o) return res.status(404).json({ error: 'NOT_FOUND' });
  const staff = ['admin','super_admin','reception'].includes(req.user!.role);
  if (o.user_id !== req.user!.userId && !staff) return res.status(403).json({ error: 'FORBIDDEN' });
  const items = await query(`SELECT * FROM bar_order_items WHERE bar_order_id = $1`, [req.params.id]);
  res.json({ ...o, items });
});
```

- [ ] **Step 2: Typecheck + prueba manual**

Run: `cd backend && npx tsc --noEmit` → sin errores.
Prueba (barra encendida): `POST /api/bar/orders` con `paymentMethod:'reception'` → `201 {id}`; con `'card'` (y `MP_ACCESS_TOKEN` seteado) → `201 {id, checkout_url}`.

- [ ] **Step 3: Commit**

```bash
git add backend/src/routes/bar.ts
git commit -m "feat(bar): crear pedido (pago en barra + tarjeta MercadoPago con external_reference bar:)"
```

---

### Task 6: Dispatcher del webhook MP + `finalizeBarOrder`

**Files:**
- Create: `backend/src/lib/barFulfillment.ts`
- Modify: `backend/src/routes/mercadopago-webhook.ts`

**Interfaces:**
- Consumes: `syncPayment` (ya usado por el webhook), tabla `bar_orders`.
- Produces: `finalizeBarOrder(barOrderId: string, opts: {provider: string; paymentRef: string|null}): Promise<void>` — idempotente; marca `payment_status='paid'`. NO cambia `status` (la orden ya está en la cola).

- [ ] **Step 1: Create `backend/src/lib/barFulfillment.ts`**

```typescript
import { query, queryOne } from '../config/database.js';

export interface FinalizeBarOpts { provider: string; paymentRef: string | null; }

// Marca pagada una orden de barra al confirmarse el pago con tarjeta. Idempotente.
export async function finalizeBarOrder(barOrderId: string, opts: FinalizeBarOpts): Promise<void> {
  const o = await queryOne<{ payment_status: string }>(`SELECT payment_status FROM bar_orders WHERE id = $1`, [barOrderId]);
  if (!o) { console.warn('finalizeBarOrder: no existe', barOrderId); return; }
  if (o.payment_status === 'paid') return; // idempotente
  await query(
    `UPDATE bar_orders SET payment_status='paid', mp_payment_id=$1, provider=$2, updated_at=NOW() WHERE id=$3`,
    [opts.paymentRef, opts.provider, barOrderId]);
  console.log(`finalizeBarOrder ${opts.paymentRef} → bar_order ${barOrderId} pagada`);
}
```

- [ ] **Step 2: Añadir el dispatcher en `backend/src/routes/mercadopago-webhook.ts`**

Importa arriba: `import { finalizeBarOrder } from '../lib/barFulfillment.js';`

Dentro del `try`, DESPUÉS de `const orderId = payment.external_reference;` y ANTES del `if (orderId) { ... }` de membresías, intercepta el prefijo `bar:`:

```typescript
    // Órdenes de barra van con external_reference "bar:<id>" — nunca las trates como membresía.
    if (orderId && orderId.startsWith('bar:')) {
      const barOrderId = orderId.slice(4);
      await query(
        `UPDATE bar_orders SET mp_payment_id=$1, provider='mercadopago', updated_at=NOW() WHERE id=$2`,
        [String(payment.id), barOrderId]);
      if (payment.status === 'approved') {
        await finalizeBarOrder(barOrderId, { provider: 'mercadopago', paymentRef: String(payment.id) });
      } else if (payment.status === 'rejected' || payment.status === 'cancelled') {
        await query(`UPDATE bar_orders SET payment_status='failed', updated_at=NOW() WHERE id=$1 AND payment_status='pending'`, [barOrderId]);
      }
      return res.status(200).json({ received: true, kind: 'bar' });
    }
```

(El `if (orderId) { ... }` de membresías queda igual, después de este bloque.)

- [ ] **Step 3: Typecheck + commit**

Run: `cd backend && npx tsc --noEmit` → sin errores.

```bash
git add backend/src/lib/barFulfillment.ts backend/src/routes/mercadopago-webhook.ts
git commit -m "feat(bar): webhook MP enruta bar:<id> a finalizeBarOrder (aislado de membresías)"
```

---

### Task 7: Cola del staff (`GET /orders/queue`, `PATCH /orders/:id/status`, `POST /orders/:id/charge`) + push "lista"

**Files:**
- Modify: `backend/src/routes/bar.ts`

**Interfaces:**
- Consumes: `canBarTransition` (Task 1), `sendWebPushToUser(userId, {title, body, url?, tag?})` de `../lib/web-push.js`.
- Produces:
  - `GET /api/bar/orders/queue` (staff) → órdenes activas `status IN (pending,preparing,ready)`, ordenadas por `pickup_time`.
  - `PATCH /api/bar/orders/:id/status` (staff) body `{ status, cancellationReason? }` → transición validada. Al pasar a `ready` → push "¡Tu bebida está lista!".
  - `POST /api/bar/orders/:id/charge` (staff) → marca `payment_status='paid'` una orden `reception`.
  - `DELETE /api/bar/orders/:id` (cliente) → cancela su orden `pending`.

- [ ] **Step 1: Añadir handlers a `backend/src/routes/bar.ts`**

```typescript
import { canBarTransition, type BarStatus } from '../lib/bar.js';
import { sendWebPushToUser } from '../lib/web-push.js';

const staffOnly = requireRole('admin', 'super_admin', 'reception');

router.get('/orders/queue', authenticate, staffOnly, async (_req: Request, res: Response) => {
  const rows = await query(
    `SELECT o.*, u.display_name AS user_name,
            COALESCE(json_agg(json_build_object('name', i.product_name, 'qty', i.quantity)) FILTER (WHERE i.id IS NOT NULL), '[]') AS items
     FROM bar_orders o JOIN users u ON u.id = o.user_id
     LEFT JOIN bar_order_items i ON i.bar_order_id = o.id
     WHERE o.status IN ('pending','preparing','ready')
     GROUP BY o.id, u.display_name ORDER BY o.pickup_time ASC`);
  res.json(rows);
});

router.patch('/orders/:id/status', authenticate, staffOnly, async (req: Request, res: Response) => {
  const to = req.body?.status as BarStatus;
  const o = await queryOne<{ status: BarStatus; user_id: string }>(`SELECT status, user_id FROM bar_orders WHERE id = $1`, [req.params.id]);
  if (!o) return res.status(404).json({ error: 'NOT_FOUND' });
  if (!canBarTransition(o.status, to, 'staff')) return res.status(400).json({ error: 'INVALID_TRANSITION' });
  if (to === 'cancelled' && !req.body?.cancellationReason) return res.status(400).json({ error: 'REASON_REQUIRED' });
  const stamp = to === 'preparing' ? 'preparing_at' : to === 'ready' ? 'ready_at' : to === 'delivered' ? 'delivered_at' : 'cancelled_at';
  // Lock optimista: solo transiciona si el estado no cambió por otra terminal.
  const upd = await query(
    `UPDATE bar_orders SET status=$1, ${stamp}=NOW(), cancellation_reason=$2, cancelled_by=$3, updated_at=NOW()
     WHERE id=$4 AND status=$5 RETURNING id`,
    [to, to === 'cancelled' ? req.body.cancellationReason : null, to === 'cancelled' ? 'staff' : null, req.params.id, o.status]);
  if (upd.length === 0) return res.status(409).json({ error: 'STATE_CHANGED' });
  if (to === 'ready') {
    void sendWebPushToUser(o.user_id, { title: '¡Tu bebida está lista!', body: 'Pásala a recoger en la barra.', url: `/app/fuel-bar/order/${req.params.id}`, tag: 'bar_ready' });
  }
  res.json({ ok: true, status: to });
});

router.post('/orders/:id/charge', authenticate, staffOnly, async (req: Request, res: Response) => {
  const o = await queryOne<{ payment_method: string; payment_status: string }>(`SELECT payment_method, payment_status FROM bar_orders WHERE id = $1`, [req.params.id]);
  if (!o) return res.status(404).json({ error: 'NOT_FOUND' });
  if (o.payment_method !== 'reception') return res.status(400).json({ error: 'NOT_RECEPTION_ORDER' });
  if (o.payment_status === 'paid') return res.status(400).json({ error: 'ALREADY_PAID' });
  await query(`UPDATE bar_orders SET payment_status='paid', updated_at=NOW() WHERE id=$1`, [req.params.id]);
  res.json({ ok: true });
});

router.delete('/orders/:id', authenticate, async (req: Request, res: Response) => {
  const o = await queryOne<{ status: BarStatus; user_id: string }>(`SELECT status, user_id FROM bar_orders WHERE id = $1`, [req.params.id]);
  if (!o) return res.status(404).json({ error: 'NOT_FOUND' });
  if (o.user_id !== req.user!.userId) return res.status(403).json({ error: 'FORBIDDEN' });
  if (!canBarTransition(o.status, 'cancelled', 'customer')) return res.status(400).json({ error: 'CANNOT_CANCEL' });
  await query(`UPDATE bar_orders SET status='cancelled', cancelled_by='customer', cancelled_at=NOW(), updated_at=NOW() WHERE id=$1 AND status='pending'`, [req.params.id]);
  res.json({ ok: true });
});
```

- [ ] **Step 2: Typecheck + commit**

Run: `cd backend && npx tsc --noEmit` → sin errores.

```bash
git add backend/src/routes/bar.ts
git commit -m "feat(bar): cola del staff + transiciones + push 'lista' + cobro en barra + cancelación cliente"
```

---

### Task 8: Cascada de cancelación (reserva y clase completa → cancelar bar_orders)

**Files:**
- Modify: `backend/src/routes/bookings.ts` (fin del handler `POST /:id/cancel`, ~línea 1360)
- Modify: `backend/src/lib/cancel-class.ts` (dentro del loop de `bookingsToCancel`, ~línea 40)

**Interfaces:**
- Consumes: tabla `bar_orders`.
- Produces: al cancelarse una reserva (individual o por cancelación de clase completa), sus `bar_orders` `pending` se cancelan (`cancelled_by='system_class_cancelled'`).

- [ ] **Step 1: `POST /bookings/:id/cancel` — agregar la cascada** (después de que la cancelación de la reserva fue exitosa):

```typescript
    // Cascada barra: cancela bebidas pre-ordenadas ligadas a esta reserva.
    await query(
      `UPDATE bar_orders SET status='cancelled', cancelled_by='system_class_cancelled', cancelled_at=NOW(), updated_at=NOW()
       WHERE booking_id = $1 AND status = 'pending'`,
      [bookingId]).catch((e: any) => console.error('bar cascade (cancel booking):', e?.message));
```

- [ ] **Step 2: `cancelClassWithRefunds` — agregar la cascada** (dentro del `for (const booking of bookingsToCancel)`, después de cancelar la reserva):

```typescript
        // Cascada barra: cancela bebidas pre-ordenadas de esta reserva.
        await query(
          `UPDATE bar_orders SET status='cancelled', cancelled_by='system_class_cancelled', cancelled_at=NOW(), updated_at=NOW()
           WHERE booking_id = $1 AND status = 'pending'`,
          [booking.id]).catch((e: any) => console.error('bar cascade (cancel class):', e?.message));
```

- [ ] **Step 3: Typecheck + commit**

Run: `cd backend && npx tsc --noEmit` → sin errores.

```bash
git add backend/src/routes/bookings.ts backend/src/lib/cancel-class.ts
git commit -m "fix(bar): cascada de cancelación de reserva/clase completa → cancela bar_orders (arregla gap de LUM)"
```

---

### Task 9: UI cliente — Menú + Confirmar + Tracking (match del mockup)

**Files:**
- Create: `frontend/src/lib/api/bar.ts`, `frontend/src/pages/client/FuelBar.tsx`, `frontend/src/pages/client/FuelBarConfirm.tsx`, `frontend/src/pages/client/FuelBarOrder.tsx`
- Modify: `frontend/src/App.tsx`

**Fuente visual:** `docs/superpowers/assets/fuelbar-mockup.html` (las 3 pantallas). Traducir su markup/CSS a Tailwind con los tokens `casa-*`/`balance-*` y `font-heading`. Carrito = estado local (no se persiste). El menú se agrupa por `category_name`.

**Interfaces:**
- Consumes: `GET /api/bar/config`, `GET /api/bar/menu`, `POST /api/bar/orders`, `GET /api/bar/orders/:id`, `DELETE /api/bar/orders/:id`.
- Produces: rutas `/app/fuel-bar`, `/app/fuel-bar/confirm`, `/app/fuel-bar/order/:id`.

- [ ] **Step 1: `frontend/src/lib/api/bar.ts`** — cliente + hooks

```typescript
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';

export interface BarProduct { id: string; name: string; description: string | null; price: number; image_url: string | null; stock: number; category_name: string; }
export interface BarMenu { open: boolean; products: BarProduct[]; }

export function useBarConfig() {
  return useQuery({ queryKey: ['bar-config-client'], queryFn: async () => (await api.get('/bar/config')).data as { enabled: boolean }, staleTime: 5 * 60 * 1000 });
}
export function useBarMenu(enabled: boolean) {
  return useQuery({ queryKey: ['bar-menu'], enabled, queryFn: async () => (await api.get('/bar/menu')).data as BarMenu });
}
export function useBarOrder(id: string) {
  return useQuery({
    queryKey: ['bar-order', id], enabled: !!id,
    queryFn: async () => (await api.get(`/bar/orders/${id}`)).data,
    refetchInterval: (q) => { const s = (q.state.data as any)?.status; return s && s !== 'delivered' && s !== 'cancelled' ? 5000 : false; },
  });
}
export type BarCartLine = { product: BarProduct; quantity: number };
```

- [ ] **Step 2: `FuelBar.tsx`** (pantalla Menú, mockup 01) — estructura clave

```tsx
import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { ClientLayout } from '@/components/layout/ClientLayout';
import { useBarMenu, useBarConfig, type BarProduct, type BarCartLine } from '@/lib/api/bar';

export default function FuelBar() {
  const nav = useNavigate();
  const { data: cfg } = useBarConfig();
  const { data: menu, isLoading } = useBarMenu(cfg?.enabled === true);
  const [cart, setCart] = useState<Record<string, BarCartLine>>({});
  const total = useMemo(() => Object.values(cart).reduce((a, l) => a + l.product.price * l.quantity, 0), [cart]);
  const count = useMemo(() => Object.values(cart).reduce((a, l) => a + l.quantity, 0), [cart]);
  const add = (p: BarProduct) => setCart((c) => ({ ...c, [p.id]: { product: p, quantity: (c[p.id]?.quantity ?? 0) + 1 } }));
  const grouped = useMemo(() => {
    const g: Record<string, BarProduct[]> = {};
    (menu?.products ?? []).forEach((p) => { (g[p.category_name] ||= []).push(p); });
    return g;
  }, [menu]);

  if (cfg && !cfg.enabled) return <AuthGuard><ClientLayout><div className="p-8 text-center text-muted-foreground">La barra está cerrada por ahora.</div></ClientLayout></AuthGuard>;

  return (
    <AuthGuard><ClientLayout>
      <div className="mx-auto max-w-md px-4 pb-28 pt-4" style={{ color: '#2A4E36' }}>
        {/* Hero fotográfico: usar la foto real /casashe/espacio-hidratacion.jpg con overlay verde + "Fuel Bar" */}
        {/* Chips por categoría + secciones con tarjetas: thumbnail (image_url o color), nombre (font-heading), desc, precio, botón + */}
        {/* Barra inferior fija: "Ver pedido · {count} · ${total}" → nav('/app/fuel-bar/confirm', { state: { cart } }) */}
      </div>
    </ClientLayout></AuthGuard>
  );
}
```

> Traducir el resto del markup del mockup (hero, chips, secciones, tarjetas con foto, CTA botón-en-botón) tal cual, con Tailwind. El thumbnail usa `product.image_url` si existe; si no, un fondo `bg-[radial-gradient(...)]` crema. La barra inferior usa `bg-[#2A4E36] text-[#F6EFE1] rounded-full`.

- [ ] **Step 3: `FuelBarConfirm.tsx`** (mockup 02) — lee `cart` de `location.state`; secciones "Tu orden", "¿Para cuándo?" (chips: "Lo antes posible" = now+prep, "Otra hora" = `datetime-local`), "Pago" (Tarjeta / Pago en la barra — **sin puntos en Fase 1**). Al confirmar: `POST /bar/orders`; si `checkout_url` → `window.location.href`; si no → `nav('/app/fuel-bar/order/'+id)`.

```tsx
const submit = async () => {
  const body = { items: lines.map(l => ({ productId: l.product.id, quantity: l.quantity })), pickupTime, paymentMethod, notes };
  const { data } = await api.post('/bar/orders', body);
  if (data.checkout_url) { window.location.href = data.checkout_url; return; }
  nav(`/app/fuel-bar/order/${data.id}`);
};
```

- [ ] **Step 4: `FuelBarOrder.tsx`** (mockup 03) — `useBarOrder(id)` (polling 5s). Estados: `pending`="En cola", `preparing`="Preparando", `ready`="¡Lista en la barra!" (halo verde + check + foto de la bebida + "Pedido #corto"), `delivered`/`cancelled`. Si `pending` y dueño → botón "Cancelar" (`DELETE /bar/orders/:id`). Si `payment_method==='reception'` y no pagada → "Pagas al recoger".

- [ ] **Step 5: Rutas en `App.tsx`**

```tsx
import FuelBar from './pages/client/FuelBar';
import FuelBarConfirm from './pages/client/FuelBarConfirm';
import FuelBarOrder from './pages/client/FuelBarOrder';
// ...
<Route path="/app/fuel-bar" element={<FuelBar />} />
<Route path="/app/fuel-bar/confirm" element={<FuelBarConfirm />} />
<Route path="/app/fuel-bar/order/:id" element={<FuelBarOrder />} />
```

Y agregar un acceso "Fuel Bar" en el Dashboard cliente (`QUICK_ACTIONS`, `to: '/app/fuel-bar'`), visible solo si `useBarConfig().data?.enabled`.

- [ ] **Step 6: Typecheck + commit**

Run: `cd frontend && npx tsc --noEmit` → sin errores.

```bash
git add frontend/src/lib/api/bar.ts frontend/src/pages/client/FuelBar.tsx frontend/src/pages/client/FuelBarConfirm.tsx frontend/src/pages/client/FuelBarOrder.tsx frontend/src/App.tsx
git commit -m "feat(bar): UI cliente Fuel Bar (menú + confirmar + tracking) con diseño aprobado"
```

---

### Task 10: UI admin — Cola del staff + nav

**Files:**
- Create: `frontend/src/pages/admin/bar/BarQueue.tsx`
- Modify: `frontend/src/App.tsx` (ruta `/admin/bar/queue`), `frontend/src/components/layout/AdminLayout.tsx` (nav)

**Interfaces:**
- Consumes: `GET /api/bar/orders/queue`, `PATCH /api/bar/orders/:id/status`, `POST /api/bar/orders/:id/charge`.

- [ ] **Step 1: `BarQueue.tsx`** — grid de tarjetas de pedido (polling 15s). Cada tarjeta: socia, items, hora de recogida (cuenta regresiva), chip de pago. Botón por estado: `pending`→"Empezar", `preparing`→"Lista", `ready`→"Entregada"; si `reception` no pagada → botón "Cobrar". "Cancelar" pide razón.

```tsx
const { data: queue } = useQuery({ queryKey: ['bar-queue'], queryFn: async () => (await api.get('/bar/orders/queue')).data, refetchInterval: 15000 });
const move = useMutation({ mutationFn: async ({ id, status, reason }: any) => api.patch(`/bar/orders/${id}/status`, { status, cancellationReason: reason }), onSuccess: () => qc.invalidateQueries({ queryKey: ['bar-queue'] }) });
const charge = useMutation({ mutationFn: async (id: string) => api.post(`/bar/orders/${id}/charge`), onSuccess: () => qc.invalidateQueries({ queryKey: ['bar-queue'] }) });
const NEXT: any = { pending: 'preparing', preparing: 'ready', ready: 'delivered' };
const LABEL: any = { pending: 'Empezar', preparing: 'Lista', ready: 'Entregada' };
```

Envolver en `AuthGuard requiredRoles={['admin','super_admin','reception']}` + `AdminLayout`.

- [ ] **Step 2: Ruta + nav**

`App.tsx`: `<Route path="/admin/bar/queue" element={<BarQueue />} />` (import lazy o directo).
`AdminLayout.tsx`: agregar dentro del grupo "Caja" el item `{ href: '/admin/bar/queue', label: 'Barra' }`.

- [ ] **Step 3: Typecheck + commit**

Run: `cd frontend && npx tsc --noEmit` → sin errores.

```bash
git add frontend/src/pages/admin/bar/BarQueue.tsx frontend/src/App.tsx frontend/src/components/layout/AdminLayout.tsx
git commit -m "feat(bar): cola del staff en admin + item de nav 'Barra'"
```

---

## Cierre (después de las 10 tareas)

1. **Copiar el mockup** a `docs/superpowers/assets/fuelbar-mockup.html` (fuente visual) antes de Task 9.
2. **Prueba end-to-end manual** (barra encendida): pedir con "pago en barra" → aparece en la cola → staff "Empezar"/"Lista" → push llega → "Entregada". Pedir con tarjeta → checkout MP → regreso → webhook marca `paid`.
3. **Dejar la barra APAGADA** en producción (`bar_config.enabled=false`) hasta que la dueña complete la Fase 0 (permiso sanitario, staffing, horario) — ver la propuesta.
4. Rama única `feat/fuel-bar-fase1`; PR; review; merge.

## Fuera de esta Fase (no implementar)
Pago con puntos; pre-orden avanzada con sugerencia auto ligada a la clase (Fase 1 solo ofrece "lo antes posible"/manual); QR escaneable con lector; estado en Wallet; extras/add-ons configurables; reembolso automático de tarjeta al cancelar (hoy manual desde el panel MP).
