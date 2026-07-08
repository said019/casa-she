# Fuel Bar — Extras (leche, agregados) · Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Permitir extras/modificadores globales en el Fuel Bar (ej. tipo de leche, agregados como shot/crema), configurables 100% desde admin, que la clienta elige al ordenar y que ajustan el precio del pedido.

**Architecture:** Una tabla `bar_extras` (lista global, agrupada por `group_label`, con `is_single` por grupo y `price_mxn` por extra). Endpoints bajo `/api/bar/extras` (lectura para cliente, CRUD para admin). El `POST /api/bar/orders` acepta extras por ítem, los valida y precia EN EL SERVIDOR (nunca confía en el cliente), los pliega al `unit_price_mxn` del ítem y guarda un snapshot en `bar_order_items.selected_extras` (JSONB). UI admin para gestionar extras + UI cliente para elegirlos.

**Tech Stack:** Node/TS ESM + Express + pg (sin ORM); React/Vite + shadcn + TanStack Query; tests `tsx` + `node:assert/strict`.

## Global Constraints

- **100% configurable desde admin:** los extras (nombre, grupo, elige-una, precio, activo, orden) se gestionan en admin; nada hardcodeado en el flujo.
- **El precio SIEMPRE se valida y recalcula en el servidor.** El cliente manda ids de extras; el server los valida contra `bar_extras` activos y suma sus precios. Nunca usar montos del body.
- **Snapshot:** `bar_order_items.selected_extras` guarda `[{id,name,price}]` al momento del pedido (para el histórico, aunque luego cambie el catálogo).
- **Compatibilidad:** un ítem SIN extras sigue funcionando igual (extras opcional). `computeBarTotals` no cambia: se le pasa el `unit_price_mxn` ya con extras incluidos.
- **Sin emojis; español; tokens Casa Shé; valores numéricos (no strings) en payloads.**
- Cada tarea: `cd backend && npx tsc --noEmit` (o frontend) limpio antes de commit.

## Modelo de datos

`bar_extras`:
- `id UUID PK DEFAULT gen_random_uuid()`
- `name VARCHAR(120) NOT NULL`
- `group_label VARCHAR(80) NOT NULL` (ej. 'Leche', 'Agregados')
- `is_single BOOLEAN NOT NULL DEFAULT false` (true = de ese grupo se elige UNA; false = se eligen varias)
- `price_mxn NUMERIC(10,2) NOT NULL DEFAULT 0`
- `sort_order INTEGER NOT NULL DEFAULT 0`
- `is_active BOOLEAN NOT NULL DEFAULT true`
- `created_at TIMESTAMPTZ DEFAULT now()`

`bar_order_items` gana: `selected_extras JSONB NOT NULL DEFAULT '[]'::jsonb`.

---

### Task 1: Migración BAR-03 (tabla `bar_extras` + columna `selected_extras`) + seed inicial una-sola-vez

**Files:** Modify `backend/src/index.ts` (junto a las migraciones BAR-01/BAR-02, ~línea 3088-3110).

- [ ] **Step 1:** Agregar tras el bloque de la Migración BAR-02:
```typescript
    // Migration BAR-03: extras/modificadores del Fuel Bar + snapshot en items.
    try {
        await query(`CREATE TABLE IF NOT EXISTS bar_extras (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name VARCHAR(120) NOT NULL,
            group_label VARCHAR(80) NOT NULL,
            is_single BOOLEAN NOT NULL DEFAULT false,
            price_mxn NUMERIC(10,2) NOT NULL DEFAULT 0,
            sort_order INTEGER NOT NULL DEFAULT 0,
            is_active BOOLEAN NOT NULL DEFAULT true,
            created_at TIMESTAMPTZ DEFAULT now()
        )`);
        await query(`ALTER TABLE bar_order_items ADD COLUMN IF NOT EXISTS selected_extras JSONB NOT NULL DEFAULT '[]'::jsonb`);
        console.log('Migration BAR-03: bar_extras + selected_extras listas.');
    } catch (e) { console.error('Migration BAR-03 error:', e); }

    // Seed BAR-extras: ejemplos UNA sola vez (editables/borrables en admin).
    try {
        const seeded = await queryOne<{ x: number }>(`SELECT 1 AS x FROM system_settings WHERE key='bar_extras_seeded'`);
        if (!seeded) {
            const EXTRAS: [string, string, boolean, number, number][] = [
                ['Leche entera','Leche',true,0,1],
                ['Leche de almendra','Leche',true,10,2],
                ['Leche de avena','Leche',true,10,3],
                ['Deslactosada','Leche',true,10,4],
                ['Shot extra de espresso','Agregados',false,15,1],
                ['Crema batida','Agregados',false,10,2],
                ['Sin azúcar','Agregados',false,0,3],
            ];
            for (const [name, grp, single, price, ord] of EXTRAS) {
                await query(
                    `INSERT INTO bar_extras (name, group_label, is_single, price_mxn, sort_order)
                     SELECT $1,$2,$3,$4,$5 WHERE NOT EXISTS (SELECT 1 FROM bar_extras WHERE name=$1 AND group_label=$2)`,
                    [name, grp, single, price, ord]);
            }
            await query(`INSERT INTO system_settings (key, value) VALUES ('bar_extras_seeded','true'::jsonb) ON CONFLICT (key) DO NOTHING`);
            console.log('Seed BAR-extras: ejemplos sembrados (una sola vez).');
        }
    } catch (e) { console.error('Seed BAR-extras error:', e); }
```

- [ ] **Step 2:** `cd backend && npx tsc --noEmit` → limpio. Commit: `git add backend/src/index.ts && git commit -m "feat(bar-extras): migración bar_extras + selected_extras + seed inicial una-vez"`

---

### Task 2: Helper puro `lib/barExtras.ts` (validar + preciar extras) + test

**Files:** Create `backend/src/lib/barExtras.ts`, Modify `backend/scripts/test-bar.ts`.

**Interfaces — Produces:**
- `interface BarExtra { id: string; name: string; group_label: string; is_single: boolean; price_mxn: number; }`
- `interface PricedExtras { snapshot: { id: string; name: string; price: number }[]; total: number; }`
- `priceSelectedExtras(selectedIds: string[], catalog: BarExtra[]): PricedExtras` — filtra el catálogo a los ids seleccionados (ignora ids desconocidos/inactivos que no estén en el catálogo), construye el snapshot `[{id,name,price}]` y suma `total = Math.round(sum(price)*100)/100`. Deduplica ids. Si un `is_single` grupo tuviera 2 seleccionados, se quedan ambos aquí (la validación de "una por grupo" es responsabilidad de UI; el precio es la suma de lo que llegue válido) — PERO el server igual solo cuenta ids que existan en el catálogo activo.

- [ ] **Step 1: Test que falla** (append en `test-bar.ts`, importar de `../src/lib/barExtras.js`):
```typescript
import { priceSelectedExtras, type BarExtra } from '../src/lib/barExtras.js';
const CAT: BarExtra[] = [
  { id: 'a', name: 'Leche de avena', group_label: 'Leche', is_single: true, price_mxn: 10 },
  { id: 'b', name: 'Shot extra', group_label: 'Agregados', is_single: false, price_mxn: 15 },
  { id: 'c', name: 'Sin azúcar', group_label: 'Agregados', is_single: false, price_mxn: 0 },
];
let r = priceSelectedExtras(['a','b'], CAT);
assert.equal(r.total, 25, 'suma precios de extras');
assert.equal(r.snapshot.length, 2, 'snapshot con 2');
r = priceSelectedExtras(['a','a','zzz'], CAT); // dedup + ignora desconocido
assert.equal(r.total, 10, 'dedup + ignora id inexistente');
assert.equal(r.snapshot.length, 1, 'snapshot dedup');
r = priceSelectedExtras([], CAT);
assert.equal(r.total, 0, 'sin extras = 0');
```
- [ ] **Step 2:** Run `cd backend && npx tsx scripts/test-bar.ts` → FALLA.
- [ ] **Step 3:** Implementar `barExtras.ts` para cumplir el test (dedup con Set, filtra por id presente en catalog, redondeo a 2 decimales).
- [ ] **Step 4:** Run test → `test-bar OK`.
- [ ] **Step 5:** `cd backend && npx tsc --noEmit` limpio. Commit: `git add backend/src/lib/barExtras.ts backend/scripts/test-bar.ts && git commit -m "feat(bar-extras): helper puro priceSelectedExtras + test"`

---

### Task 3: Endpoints de extras (cliente lee, admin CRUD)

**Files:** Modify `backend/src/routes/bar.ts`.

**Interfaces — Produces:**
- `GET /api/bar/extras` (authenticate): devuelve `BarExtra[]` activos, ordenados por `group_label, sort_order, name`. (cliente y admin).
- `POST /api/bar/extras` (authenticate + requireRole('admin','super_admin')): crea `{name, group_label, is_single, price_mxn, sort_order?, is_active?}` (zod). Devuelve el creado.
- `PUT /api/bar/extras/:id` (admin): actualiza campos. Devuelve el actualizado.
- `DELETE /api/bar/extras/:id` (admin): borra (o marca inactivo — usar DELETE físico simple).

- [ ] **Step 1:** Leer `bar.ts` para calzar imports (`authenticate`, `requireRole`, `query`, `queryOne`, `z`/zod, `Request`/`Response`). Agregar los 4 handlers cerca del resto de rutas de bar. Zod schema para create/update: `name` string 1-120, `group_label` string 1-80, `is_single` boolean, `price_mxn` number >= 0, `sort_order` number int opcional (default 0), `is_active` boolean opcional. GET client devuelve solo `is_active=true`. El CRUD admin ve/edita todos.
- [ ] **Step 2:** `cd backend && npx tsc --noEmit` limpio. Commit: `git add backend/src/routes/bar.ts && git commit -m "feat(bar-extras): GET /bar/extras (cliente) + CRUD admin"`

---

### Task 4: Integrar extras al `POST /api/bar/orders` (validado + preciado en servidor)

**Files:** Modify `backend/src/routes/bar.ts` (handler `POST /orders`, ~líneas 90-180).

**Interfaces — Consumes:** `priceSelectedExtras` (Task 2), `bar_extras` (Task 1), `bar_order_items.selected_extras` (Task 1).

Contexto actual: el body zod acepta `items: [{ productId, quantity }]`. Se construye `priced: [{productId, name, quantity, unit_price_mxn}]` desde `products.price`, luego `computeBarTotals(priced, {surchargePercent})`, luego INSERT en `bar_order_items (bar_order_id, product_id, product_name, quantity, unit_price_mxn, line_total_mxn)` (dos lugares: rama card ~138 y rama reception/points ~164).

- [ ] **Step 1:** Extender el zod de items para aceptar `extras?: string[]` (array de ids de bar_extras) por ítem. Tras cargar productos: cargar el catálogo de extras activos una vez (`SELECT id,name,group_label,is_single,price_mxn FROM bar_extras WHERE is_active=true`, mapear price_mxn a Number). Para CADA ítem, `const pe = priceSelectedExtras(it.extras ?? [], catalog)`; el `unit_price_mxn` del ítem pasa a `Number(p.price) + pe.total`; guardar `pe.snapshot` para el INSERT. Es decir, `priced` gana un campo `selected_extras: {id,name,price}[]` por ítem y su `unit_price_mxn` YA incluye extras. Así `computeBarTotals` (sin cambios) suma correcto y MP recibe el precio con extras.
- [ ] **Step 2:** En AMBOS INSERT de `bar_order_items`, agregar la columna `selected_extras` con `JSON.stringify(it.selected_extras)` (o pasar el objeto y castear `::jsonb`). Ej.: `INSERT INTO bar_order_items (..., line_total_mxn, selected_extras) VALUES (..., $7::jsonb)` con el snapshot.
- [ ] **Step 3:** `cd backend && npx tsc --noEmit` limpio. Commit: `git add backend/src/routes/bar.ts && git commit -m "feat(bar-extras): POST /orders valida+precia extras en servidor y guarda snapshot"`

---

### Task 5: Admin — gestión de extras (Ajustes → Barra → Extras)

**Files:** Create `frontend/src/pages/admin/settings/BarExtras.tsx`; Modify `frontend/src/App.tsx` (ruta) y `frontend/src/components/layout/AdminLayout.tsx` (enlace en el submenú de Ajustes, junto a 'Barra').

- [ ] **Step 1:** Página `BarExtras` (patrón de las otras admin: `AuthGuard requiredRoles={['admin','super_admin']}` + `AdminLayout`, shadcn Card/Input/Switch/Button/Label, `api`, TanStack Query, `useToast`). Lista los extras agrupados por `group_label`. Permite: crear (nombre, grupo, switch "elige una", precio, activo), editar en línea, borrar (con confirm). GET `/bar/extras`... OJO: el GET cliente solo trae activos; para el admin necesita ver TODOS. Decisión: agregar `?all=1` a `GET /bar/extras` que, si el usuario es admin, devuelve también inactivos; o un `GET /bar/extras/admin`. El implementer elige y lo deja consistente con Task 3 (ajustar Task 3 si hace falta, documentándolo). Mutaciones a POST/PUT/DELETE `/bar/extras`. Invalida su query key al guardar. Sin emojis.
- [ ] **Step 2:** Ruta en `App.tsx`: `/admin/settings/bar/extras` → `<BarExtras />` (import lazy/directo como los vecinos). Enlace en `AdminLayout.tsx` submenú Ajustes: `{ href: '/admin/settings/bar/extras', label: 'Extras (barra)' }` justo después del de 'Barra'.
- [ ] **Step 3:** `cd frontend && npx tsc --noEmit` limpio. Commit: `git add frontend/src/pages/admin/settings/BarExtras.tsx frontend/src/App.tsx frontend/src/components/layout/AdminLayout.tsx && git commit -m "feat(bar-extras): panel admin de extras + ruta + enlace en Ajustes"`

---

### Task 6: Cliente — elegir extras al ordenar + precio

**Files:** Modify `frontend/src/lib/api/bar.ts` (tipos + hook `useBarExtras`), `frontend/src/pages/client/FuelBar.tsx` (selección de extras al agregar), y `FuelBarConfirm.tsx` si muestra el desglose del ítem.

- [ ] **Step 1:** `lib/api/bar.ts`: tipo `BarExtra { id, name, group_label, is_single, price_mxn }` + hook `useBarExtras()` → GET `/bar/extras`. El tipo del ítem del carrito gana `extras?: {id,name,price}[]`.
- [ ] **Step 2:** `FuelBar.tsx`: al tocar "agregar" una bebida que… (decisión de UX): abrir un pequeño selector (sheet/modal) con los extras agrupados — grupos `is_single` como radios (opcional elegir ninguno), grupos no-single como checkboxes. Al confirmar, se agrega el ítem al carrito con sus `extras` (snapshot `{id,name,price}`) y el precio mostrado del ítem = precio base + suma de extras. Si no hay extras configurados (catálogo vacío), agregar directo como hoy (sin selector). Reusar tokens/al estilo del menú. Al enviar el pedido (en confirm), mandar `items: [{ productId, quantity, extras: [ids] }]`.
- [ ] **Step 3:** `FuelBarConfirm.tsx`: en el resumen, mostrar bajo cada bebida sus extras elegidos y el precio con extras; el total ya lo recalcula el server (mostrar el estimado sumando extras).
- [ ] **Step 4:** `cd frontend && npx tsc --noEmit` limpio. Commit: `git add frontend/src/lib/api/bar.ts frontend/src/pages/client/FuelBar.tsx frontend/src/pages/client/FuelBarConfirm.tsx && git commit -m "feat(bar-extras): cliente elige extras al ordenar + precio + envío al pedido"`

---

### Task 7: Encadenar test + verificación final

- [ ] **Step 1:** `test-bar.ts` ya cubre `priceSelectedExtras` (Task 2) y corre en `npm test`. Correr `cd backend && npm test` (o al menos `tsx scripts/test-bar.ts`) → OK.
- [ ] **Step 2:** `cd backend && npx tsc --noEmit` y `cd frontend && npx tsc --noEmit` → limpios.
- [ ] **Step 3:** Commit si hubo ajustes.

## Self-Review (checklist)
- Server valida+precia extras (Task 4, Global Constraint dinero) ✅; snapshot guardado ✅; admin CRUD (Task 3+5) ✅; cliente elige (Task 6) ✅; seed una-vez editable (Task 1) ✅; helper testeado (Task 2) ✅.
- Compatibilidad: ítem sin extras funciona (extras opcional, default []).
- Riesgo: el GET admin necesita ver inactivos — resuelto en Task 5 Step 1 (ajustar Task 3).
