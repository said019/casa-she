# Casa Shé — Reservas v1 · Plan de Implementación

> **Para workers agénticos:** SUB-SKILL REQUERIDA: usar superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para ejecutar tarea por tarea. Los pasos usan checkbox (`- [ ]`).

**Goal:** Adaptar el fork de BMB-Studio a Casa Shé: rebrand visual + de correo, poda a alcance v1, reglas de negocio de Casa Shé (cancelación 5h, vigencia créditos 30 días, cupo 6-7), seed real (clases/precios/sede), reglamento obligatorio, recordatorios email/wa.me, y pagos Stripe + transferencia + efectivo. Resultado: app funcional con marca Casa Shé donde una clienta compra, reserva, cancela y hace check-in con QR.

**Architecture:** Monorepo `backend/` (Express + PostgreSQL SQL puro, migraciones idempotentes en `index.ts`) + `frontend/` (Vite + React + shadcn/ui + Tailwind). Se conserva el motor de reservas/créditos/Stripe ya probado de BMB y se cambian datos, marca y reglas. No se reescribe el motor.

**Tech Stack:** Express, TypeScript, PostgreSQL (pg), JWT, Zod, node-cron, Resend, Stripe, Cloudinary, Vite, React 18, TailwindCSS, shadcn/ui, React Query, Zustand, React Router.

**Decisiones cerradas:** Alcance = core de reservas. Pagos = Stripe (tarjeta) + transferencia con comprobante + efectivo. WhatsApp = wa.me + email automático (sin Evolution). Membresías 360/Black = créditos mensuales (cantidades configurables). Roles = se conserva el sistema de roles de BMB (NO se colapsa, por riesgo); solo se siembra admin Casa Shé.

**Paleta Casa Shé (HEX → HSL para shadcn):**
| Nombre | HEX | HSL aprox |
|--------|-----|-----------|
| Verde Casa | `#2E4A35` | `135 23% 24%` |
| Avena | `#FBF3DD` | `44 78% 93%` |
| Musgo | `#B6A43C` | `51 50% 47%` |
| Ciruela | `#2E1B22` | `338 26% 14%` |
| Arcilla | `#B5512F` | `15 59% 45%` |
| Arena | `#D8D2BC` | `47 26% 79%` |

---

## Grupo 0 — Setup y arranque local (baseline funcionando con datos BMB)

> Objetivo: levantar todo ANTES de tocar nada, para tener un baseline verificable.

### Task 0.1: Variables de entorno

**Files:**
- Create: `backend/.env`
- Create: `frontend/.env`
- Create: `backend/.env.example`

- [ ] **Step 1: Crear `backend/.env`**
```
DATABASE_URL=postgresql://localhost:5432/casa_she
JWT_SECRET=dev-casa-she-cambia-esto-en-produccion-0123456789
PORT=3001
NODE_ENV=development
ENABLE_CRON_JOBS=false
FRONTEND_URL=http://localhost:8080
```
- [ ] **Step 2: Crear `frontend/.env`**
```
VITE_API_URL=http://localhost:3001/api
```
- [ ] **Step 3: Crear `backend/.env.example`** (mismas claves, valores vacíos/placeholder; documenta también las opcionales: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_STATEMENT_DESCRIPTOR`, `RESEND_API_KEY`, `EMAIL_FROM`, `CLOUDINARY_*`, `CHECKIN_SECRET`).
- [ ] **Step 4: Commit** `git add -A && git commit -m "chore: env files Casa Shé (dev)"`

### Task 0.2: Base de datos local + arranque

**Files:** ninguno (operación de entorno)

- [ ] **Step 1: Crear la BD y aplicar el esquema base**
Run: `createdb casa_she && psql -d casa_she -f backend/database/schema.sql`
Expected: sin errores; tablas creadas. (NOTA: la app NO crea el esquema base; esto es obligatorio antes del primer `npm run dev`.)
- [ ] **Step 2: Levantar backend**
Run: `cd backend && npm run dev`
Expected: log "connected", runStartupMigrations OK, `app.listen` en 3001.
- [ ] **Step 3: Verificar health**
Run: `curl -s http://localhost:3001/api/health`
Expected: `{"status":"ok","database":"connected"}`
- [ ] **Step 4: Levantar frontend** (otra terminal)
Run: `cd frontend && npm run dev`
Expected: Vite en http://localhost:8080.
- [ ] **Step 5: Smoke manual**: abrir http://localhost:8080, ver el landing (todavía con marca BMB). Confirmar que carga sin errores de consola.
- [ ] **Step 6: Commit** (nada que commitear; baseline confirmado).

---

## Grupo A — Rebrand de marca

### Task A.1: Tokens de color (Tailwind)

**Files:** Modify: `frontend/tailwind.config.ts` (paletas `balance.*` líneas 67-74 y `bmb.*` líneas 75-88)

- [ ] **Step 1:** Remapear los HEX manteniendo las MISMAS llaves (no tocar las ~37 vistas que usan `bmb-*`):
  - `bmb.dark` → `#16261A` · `bmb.ink` → `#2E1B22` (Ciruela)
  - `bmb.cream` → `#FBF3DD` (Avena) · `bmb.paper` → `#FFFDF6` · `bmb.taupe` → `#D8D2BC` (Arena)
  - `bmb.gold` → `#B6A43C` (Musgo) · `bmb.deepgold` → `#B5512F` (Arcilla)
  - `bmb.leaf` → `#2E4A35` (Verde Casa) · `bmb.mauve`/`bmb.rose`/`bmb.blush` → tonos derivados de Arena/Arcilla suaves
  - Replicar idéntico en `balance.*`.
- [ ] **Step 2: Verificar build** Run: `cd frontend && npm run build` Expected: build OK.
- [ ] **Step 3: Commit** `git commit -am "feat(brand): paleta Casa Shé en tailwind tokens"`

### Task A.2: index.css — fuentes, tokens shadcn, overrides

**Files:** Modify: `frontend/src/index.css`

- [ ] **Step 1 (línea 1):** Reemplazar el `@import` de Google Fonts por:
```css
@import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Baskervville:ital@0;1&display=swap');
```
- [ ] **Step 2 (líneas 55-57):** `--font-heading: 'Instrument Serif', serif;` · `--font-body: 'Baskervville', Georgia, serif;` (eliminar `--font-script` o dejar vacío).
- [ ] **Step 3 (`:root` 17-84):** Recolorear vars HSL shadcn → `--background: 44 78% 93%` (Avena), `--foreground: 338 26% 14%` (Ciruela), `--primary: 135 23% 24%` (Verde Casa), `--primary-foreground: 44 78% 93%`, `--secondary/--accent: 47 26% 79%` (Arena) / `51 50% 47%` (Musgo), `--destructive: 15 59% 45%` (Arcilla), `--border/--input: 47 26% 79%`, `--ring: 135 23% 24%`. Verificar contraste WCAG (Ciruela/Verde son oscuros).
- [ ] **Step 4 (`.dark` 86-135):** versión oscura coherente (fondo Ciruela `338 26% 14%`, foreground Avena).
- [ ] **Step 5 (260-271):** ELIMINAR el bloque `.landing-sans` (para que los títulos del landing usen Instrument Serif). 
- [ ] **Step 6 (213, 219, 277-335):** `.numeral` color → `#B6A43C`; `.editorial-rule` → `#2E1B22`; recolorear/eliminar auras `.bmb-aura-*`/`.bg-bmb-aura` (de dorado a verde/musgo o quitarlas).
- [ ] **Step 7: Verificar** Run: `cd frontend && npm run dev` y revisar el landing: fondo crema, títulos serif, acentos verdes. 
- [ ] **Step 8: Commit** `git commit -am "feat(brand): tipografía Instrument Serif/Baskervville + tokens shadcn Casa Shé"`

### Task A.3: index.html, manifest, logo y favicons

**Files:** Modify `frontend/index.html`, `frontend/public/manifest.json`; Replace assets en `frontend/public/`

- [ ] **Step 1 (index.html):** title/description/author (7-11) → "Casa Shé — Wellness para mujeres · Condesa CDMX"; `theme-color` (23) `#CE9B25` → `#2E4A35`; `apple-mobile-web-app-title` (27) → "Casa Shé"; og/twitter (49-59) → Casa Shé.
- [ ] **Step 2 (manifest.json):** `name`/`short_name`/`theme_color` → Casa Shé / `#2E4A35`.
- [ ] **Step 3:** Generar logo Casa Shé (monograma SS + wordmark) como `frontend/public/casa-she-logo.png` (claro y oscuro) y favicons (`favicon.ico`, `favicon-64.png`, `icon-192.png`, `icon-512.png`). (Si no hay SVG del logo, usar el símbolo SS del PDF en `assets/brand/`; placeholder verde sobre crema mientras llega el oficial.)
- [ ] **Step 4 (Navbar.tsx 17-18):** `<img src="/casa-she-logo.png">` + `aria-label="Casa Shé"`.
- [ ] **Step 5: Commit** `git commit -am "feat(brand): metadata, manifest, logo y favicons Casa Shé"`

### Task A.4: Strings de marca en landing

**Files:** Modify `frontend/src/components/{Footer,Hero,Schedule,Instructors,Location}.tsx`

- [ ] **Step 1 (Footer.tsx 9,15,30,31,37):** "BMB Studio"→"Casa Shé"; "hola@bmbstudio.mx"→"casashecondesa@gmail.com"; "@bmbstudio"→"@casashe.mx"; dirección → "Alfonso Reyes 131, Condesa, CDMX".
- [ ] **Step 2 (Hero.tsx 19,29 + copy):** masthead "BMB Studio — Tepa & San Miguel" → "Casa Shé — Condesa"; copy de disciplinas → Pilates Mat · Yoga · Aeroyoga · Telas; frase de marca "un lugar donde las mujeres vuelven a sí mismas".
- [ ] **Step 3 (Schedule.tsx 165):** "Horarios BMB" → "Horarios Casa Shé". (Instructors.tsx 84): alt → "El equipo de Casa Shé".
- [ ] **Step 4 (Location.tsx):** dirección/mapa → Alfonso Reyes 131, Condesa; quitar segunda sede.
- [ ] **Step 5: Verificar** grep sin residuos: Run: `grep -rin "bmb studio\|tepa\|san miguel\|bmbstudio" frontend/src/components frontend/src/pages/Index.tsx` Expected: vacío.
- [ ] **Step 6: Commit** `git commit -am "feat(brand): copy y datos de contacto Casa Shé en landing"`

### Task A.5: Marca de correos (Resend) y plantillas WhatsApp activas

**Files:** Modify `backend/src/services/email-templates.ts`, `backend/src/lib/whatsapp.ts`

- [ ] **Step 1 (email-templates.ts 4-16):** objeto `brand` → name "Casa Shé", tagline "Movimiento · Nutrición · Comunidad", colores olive/cream a la paleta Casa Shé.
- [ ] **Step 2 (email-templates.ts 22,28-30,87-88):** `PROD_FRONTEND` → dominio Casa Shé (o `FRONTEND_URL`); `getLogoUrl` → logo Casa Shé; footer "BMB Studio · Pilates Studio" → "Casa Shé · Condesa, CDMX".
- [ ] **Step 3 (whatsapp.ts 216-237, 317-337):** textos "¡Bienvenida a BMB Studio!"/"BMB Studio" → "Casa Shé" en las 2 plantillas vivas (welcome + expiring).
- [ ] **Step 4: Commit** `git commit -am "feat(brand): plantillas de email y WhatsApp Casa Shé"`

### Task A.6: Branding técnico

**Files:** Modify `frontend/src/lib/api.ts` (token key), `backend/package.json`, `frontend/package.json` (names), `backend/src/index.ts` (logs "Balance Room API")

- [ ] **Step 1:** `localStorage` key `bmb_studio_token` → `casashe_token` (api.ts ~5,49-60; y donde se lea/escriba en authStore).
- [ ] **Step 2:** `name` en ambos package.json → `casa-she-backend` / `casa-she-frontend`.
- [ ] **Step 3:** logs de arranque "Balance Room API" → "Casa Shé API" en index.ts.
- [ ] **Step 4: Verificar** Run: `cd backend && npx tsc --noEmit` Expected: sin errores. Run: `cd frontend && npm run build` Expected: OK.
- [ ] **Step 5: Commit** `git commit -am "chore(brand): branding técnico (token, package names, logs)"`

---

## Grupo B — Poda a v1

> Regla de oro: NUNCA borrar `backend/src/lib/audit.ts` (lo usa el core vía `logAction`). NO borrar `lib/requestFacility.ts` (se neutraliza). Limpiar `orders.ts` ANTES de quitar `discount-codes`.

### Task B.1: Desmontar y borrar rutas backend sin dependencias

**Files:** Modify `backend/src/index.ts` (imports + `app.use`); Delete archivos de ruta.

- [ ] **Step 1:** En `backend/src/index.ts` comentar/eliminar el import y el `app.use` de: coach-payroll (3388), commissions (3387), egresos (3384), cash-shifts (3383), products (3381), sales (3382), videos (3375), reviews (3372), evolution (3378), webhook-evolution (3379), workout-templates (3374), reformers (3369), facilities (3370), events (3376), audit /api/admin/audit (3361).
- [ ] **Step 2:** Borrar los archivos `backend/src/routes/{coach-payroll,commissions,egresos,cash-shifts,products,sales,videos,reviews,evolution,webhook-evolution,workout-templates,reformers,facilities,events,audit}.ts`.
- [ ] **Step 3: Verificar** Run: `cd backend && npx tsc --noEmit` Expected: solo errores por `orders.ts`→discount-codes (se arregla en B.2) y posibles imports de wallet/evolution (B.4). Anotar.
- [ ] **Step 4: Commit** `git commit -am "chore(prune): quitar rutas fuera de v1 (payroll, POS, videos, reviews, events, etc.)"`

### Task B.2: Limpiar discount-codes de orders.ts y quitar la ruta

**Files:** Modify `backend/src/routes/orders.ts` (import 6, schema 24-25, bloque 323-337); Delete `backend/src/routes/discount-codes.ts`; Modify `index.ts` (mount 3377)

- [ ] **Step 1:** En `orders.ts` quitar `import { applyDiscountToOrder, resolveDiscountForOrder } from './discount-codes.js'` (6), los campos `discount_code_id`/`discount_amount` del `CreateOrderSchema` (24-25) y el bloque `if (discount_code_id) {...}` (323-337). El precio sigue siendo server-authoritative sin descuentos en v1.
- [ ] **Step 2:** Quitar mount 3377 en index.ts y borrar `routes/discount-codes.ts`.
- [ ] **Step 3: Verificar** Run: `cd backend && npx tsc --noEmit` Expected: desaparece el error de orders.
- [ ] **Step 4: Commit** `git commit -am "chore(prune): quitar descuentos/discount-codes del checkout v1"`

### Task B.3: Neutralizar multi-sede (una sola sede)

**Files:** Modify `backend/src/lib/requestFacility.ts` (NO borrar)

- [ ] **Step 1:** Hacer que `resolveRequestFacility` devuelva siempre scope abierto (la única sede): retornar `{ scope: 'all', facilityId: <SEDE_UNICA_ID o null> }` sin filtrar. Mantener la firma para no romper bookings/classes/schedules/checkin/users/reception-dashboard.
- [ ] **Step 2:** Borrar solo la ruta `routes/facilities.ts` ya hecho en B.1; conservar el helper.
- [ ] **Step 3: Verificar** Run: `cd backend && npx tsc --noEmit` Expected: OK.
- [ ] **Step 4: Commit** `git commit -am "chore(prune): neutralizar multi-sede a sede única Casa Shé"`

### Task B.4: WhatsApp → no-op (solo wa.me + email)

**Files:** Modify `backend/src/lib/whatsapp.ts`; Modify imports en `whatsapp-instances.ts`; Modify `backend/src/lib/notifications.ts` (480), `backend/src/services/cron-jobs.ts` (242-331)

- [ ] **Step 1:** En `whatsapp.ts`, reescribir `sendWhatsAppMessage` para que NO llame a Evolution (devolver `false`/no-op) conservando la firma. Conservar las funciones de plantilla de TEXTO (devuelven string) para construir links `wa.me`.
- [ ] **Step 2:** En `notifications.ts` (notifyPointsEarnedExternal) y `cron-jobs.ts` (notifyExpiringMemberships): quitar la rama de envío WhatsApp Evolution, dejar email + in-app.
- [ ] **Step 3: Verificar** Run: `cd backend && npx tsc --noEmit` Expected: OK. (Si quedan imports de `whatsapp-evolution`/`whatsapp-instances`, dejarlos como no-op o stub; no eliminar bruscamente.)
- [ ] **Step 4: Commit** `git commit -am "chore(prune): WhatsApp a no-op (v1 usa wa.me + email)"`

### Task B.5: Desmontar páginas frontend fuera de v1

**Files:** Modify `frontend/src/App.tsx` (imports + `<Route>`); Delete carpetas de páginas.

- [ ] **Step 1:** En `App.tsx` quitar imports y `<Route>` de: SelectReformer, VideoLibrary/VideoPlayer, ClientEvents, WorkoutTemplates, WhatsAppSettings, Facilities, Videos(admin), EventsManager, DiscountCodes, Products/POS, CashShifts, AuditLog, Commissions, CoachPayroll, CajaScreen, PosScreen, Inventory, WhatsApp(reception), CoachTemplates, ReportsEgresos. Quitar también la ruta legacy `/pricing`→`pages/Checkout.tsx`/`PurchaseFlow` (se hace en G.2).
- [ ] **Step 2:** Borrar carpetas: `pages/admin/{commissions,payroll,cash-shifts,pos,videos,events,discount-codes,facilities,audit,reviews,referrals}`, `pages/admin/classes/WorkoutTemplates.tsx`, `pages/admin/settings/WhatsAppSettings.tsx`, `pages/admin/reports/ReportsEgresos.tsx`, `pages/reception/{CajaScreen,PosScreen,InventoryScreen,PayrollScreen,WhatsAppScreen}.tsx`, `pages/coach/{Earnings,Templates,Playlists}.tsx`, `pages/client/{SelectReformer,VideoLibrary,VideoPlayer,Events,ReferFriends}.tsx`.
- [ ] **Step 3: Verificar** Run: `cd frontend && npm run build` Expected: build OK (corregir imports rotos que queden).
- [ ] **Step 4: Commit** `git commit -am "chore(prune): quitar páginas frontend fuera de v1"`

---

## Grupo C — Datos y reglas Casa Shé

### Task C.1: Cancelación 5 horas

**Files:** Modify `backend/src/index.ts` (varios), `backend/src/routes/settings.ts` (54)

- [ ] **Step 1 (index.ts 788-789):** En el seed de Migration 031, cambiar `min_hours` de 12 a 5 y **quitar el `jsonb_set` que fuerza 12 en cada arranque** (hoy pisa cualquier config). 
- [ ] **Step 2 (index.ts 1850, 1858):** Migration 025: default/COALESCE 4 → 5.
- [ ] **Step 3 (index.ts 1898 y 2058):** En las funciones SQL `cancel_booking()` y `preview_cancel_booking()`, `COALESCE((v_policy->>'min_hours')::numeric, 4)` → `5`.
- [ ] **Step 4 (settings.ts 54):** `POLICY_DEFAULT.min_hours` 4 → 5.
- [ ] **Step 5: Verificar** Reiniciar backend; Run: `psql -d casa_she -c "SELECT value FROM system_settings WHERE key='cancellation_policy';"` Expected: `min_hours` = 5. Probar `cancel-preview` de una reserva: a >5h permite (devuelve crédito), a <5h bloquea.
- [ ] **Step 6: Commit** `git commit -am "feat(rules): ventana de cancelación 5h (Casa Shé)"`

### Task C.2: Cupo 6-7 por clase

**Files:** Modify `backend/src/lib/schedule.ts` (1), `backend/src/index.ts` (seeds class_types 757-774, facilities 753-754)

- [ ] **Step 1 (schedule.ts 1):** `MAX_REFORMER_CAPACITY = 8` → `7` (tope de Casa Shé). 
- [ ] **Step 2 (index.ts 757-774):** sembrar `max_capacity` de los class_types Casa Shé en 6 o 7 (ver C.4). `facilities.capacity` (753-754) acorde.
- [ ] **Step 3: Verificar** crear una clase y confirmar que `max_capacity` ≤ 7 y que reservar la nº8 manda a lista de espera.
- [ ] **Step 4: Commit** `git commit -am "feat(rules): cupo 6-7 por clase"`

### Task C.3: Vigencia de créditos 30 días

**Files:** seed de planes en `backend/src/index.ts` (775-786) — se hace junto con C.4.

- [ ] **Step 1:** Asegurar `duration_days = 30` en los paquetes/membresías de Casa Shé (la clase de prueba/drop-in puede ser menor, p.ej. 7 días para la de prueba). El motor (`computeEndDate`, `orders.ts`) ya aplica `end_date = start + duration_days`.
- [ ] **Step 2: Verificar** comprar/activar un paquete y confirmar `memberships.end_date = start + 30d`.
- [ ] **Step 3: Commit** (incluido en C.4).

### Task C.4: Seed de catálogo Casa Shé (clases, precios, sede, admin, settings)

**Files:** Modify/replace seed en `backend/src/index.ts` (bloques 017/031 de planes/clases/facilities + bank_info/studio_info 3211-3276) y `backend/database/seed-users.sql`

- [ ] **Step 1 — class_types:** Pilates Mat, Yoga, Aeroyoga, Telas, Taller (con `max_capacity` 6-7, `guidelines_text` por tipo). Quitar Pole/Twerk/Reformer-BMB.
- [ ] **Step 2 — plans/products (precios reales):**
  - Clase de prueba — $150 — 1 crédito — 7 días
  - Drop-in — $280 — 1 crédito — 30 días
  - Paquete 5 — $1,300 — 5 créditos — 30 días
  - Paquete 8 — $2,000 — 8 créditos — 30 días
  - Paquete 12 — $2,880 — 12 créditos — 30 días
  - Membresía 360 — $3,600 — N créditos/mes (configurable, placeholder 16) — 30 días
  - Membresía Black — $4,200 — M créditos/mes (configurable, placeholder 24) — 30 días
  - (Confirmar N/M con la clienta; quedan editables en admin.)
- [ ] **Step 3 — facility única:** "Casa Shé — Condesa", Alfonso Reyes 131, capacidad acorde a cupo.
- [ ] **Step 4 — system_settings:** `studio_info` (nombre, dirección, contacto) y `bank_info` (CLABE/banco/titular Casa Shé — placeholder hasta que la clienta los dé). **Quitar el bloque que sobreescribe bank_info con datos BMB (Karla/CLABE 7229...) en index.ts 3247-3276.**
- [ ] **Step 5 — seed-users.sql:** reemplazar usuarios `catarsis.com` por un admin Casa Shé (`admin@casashe.mx`) + un par de clientas de prueba. Aplicar: `psql -d casa_she -f backend/database/seed-users.sql`.
- [ ] **Step 6:** Quitar/neutralizar Migration 031 (seed BMB) para que no resiembre datos BMB ni borre el catálogo Casa Shé en cada arranque.
- [ ] **Step 7: Verificar** reiniciar backend; Run: `psql -d casa_she -c "SELECT name, price, duration_days FROM plans ORDER BY price;"` Expected: catálogo Casa Shé con precios correctos. Login admin@casashe.mx OK.
- [ ] **Step 8: Commit** `git commit -am "feat(data): catálogo, precios, sede, admin y settings Casa Shé"`

---

## Grupo D — Reglamento obligatorio (lógica nueva, TDD)

### Task D.1: Columna y exposición de `reglamento_accepted_at`

**Files:** Modify `backend/src/index.ts` (migración in-line ~1504), `backend/src/routes/auth.ts` (/me 266-315, login)

- [ ] **Step 1:** Migración in-line: `ALTER TABLE users ADD COLUMN IF NOT EXISTS reglamento_accepted_at TIMESTAMPTZ;`
- [ ] **Step 2:** Incluir `reglamento_accepted_at` en el SELECT de `/auth/me` y en el de login.
- [ ] **Step 3: Verificar** Run: `psql -d casa_she -c "\d users" | grep reglamento` Expected: columna existe. `GET /auth/me` la incluye.
- [ ] **Step 4: Commit** `git commit -am "feat(reglamento): columna reglamento_accepted_at + exposición en /me"`

### Task D.2: Endpoint de aceptación + gate en reservas (backend)

**Files:** Modify `backend/src/routes/auth.ts` (nuevo endpoint), `backend/src/routes/bookings.ts` (POST '/' ~402, gate solo `role==='client'` ~520), Test: `backend/src/routes/__tests__/reglamento.test.ts`

- [ ] **Step 1: Test que falla** — clienta sin reglamento recibe 403 REGLAMENTO_REQUIRED al reservar:
```ts
// pseudo-test (adaptar al runner tsx del repo)
it('rechaza reserva si no aceptó reglamento', async () => {
  const res = await bookAsClient(clientSinReglamento, classId);
  expect(res.status).toBe(403);
  expect(res.body.code).toBe('REGLAMENTO_REQUIRED');
});
it('acepta reglamento y luego permite reservar', async () => {
  await acceptReglamento(clientSinReglamento);
  const res = await bookAsClient(clientSinReglamento, classId);
  expect(res.status).toBe(201);
});
```
- [ ] **Step 2: Correr y ver fallar** Run: `cd backend && npm test -- reglamento` Expected: FAIL.
- [ ] **Step 3: Implementar endpoint** en `auth.ts`:
```ts
router.post('/accept-reglamento', authenticate, async (req, res) => {
  const r = await queryOne(
    `UPDATE users SET reglamento_accepted_at = NOW()
     WHERE id = $1 AND reglamento_accepted_at IS NULL
     RETURNING id, reglamento_accepted_at`, [req.user!.userId]);
  const user = await queryOne(`SELECT ... FROM users WHERE id=$1`, [req.user!.userId]);
  res.json({ user });
});
```
- [ ] **Step 4: Implementar gate** en `bookings.ts` POST '/' (después del check `role==='client'`, antes de crear la reserva):
```ts
if (req.user!.role === 'client') {
  const u = await queryOne(`SELECT reglamento_accepted_at FROM users WHERE id=$1`, [req.user!.userId]);
  if (!u?.reglamento_accepted_at) {
    return res.status(403).json({ error: 'Debes aceptar el reglamento', code: 'REGLAMENTO_REQUIRED' });
  }
}
```
(NO aplicar a `admin-book`/`bulk-month`.)
- [ ] **Step 5: Correr y ver pasar** Run: `cd backend && npm test -- reglamento` Expected: PASS.
- [ ] **Step 6: Commit** `git commit -am "feat(reglamento): gate obligatorio en reservas + endpoint accept-reglamento"`

### Task D.3: Modal de reglamento (frontend)

**Files:** Create `frontend/src/components/ReglamentoGate.tsx`; Modify `frontend/src/pages/client/BookClassConfirm.tsx`, `frontend/src/types/auth.ts`, `frontend/src/stores/authStore.ts`

- [ ] **Step 1:** Agregar `reglamento_accepted_at` al tipo `User` y exponerlo en authStore.
- [ ] **Step 2:** Crear `ReglamentoGate.tsx` (clonando patrón de `OnboardingGate.tsx`): muestra el reglamento (reutiliza contenido de `CancellationPolicy.tsx`/`Terms.tsx`), botón "Acepto" → `POST /auth/accept-reglamento` → `checkAuth()`.
- [ ] **Step 3:** En `BookClassConfirm.tsx`: si `user.reglamento_accepted_at == null`, abrir `ReglamentoGate` antes de permitir el `POST /bookings`. Manejar también el 403 `REGLAMENTO_REQUIRED` como fallback.
- [ ] **Step 4: Verificar** flujo manual: clienta nueva → intenta reservar → aparece modal → acepta → reserva procede. Recargar: el modal no reaparece.
- [ ] **Step 5: Commit** `git commit -am "feat(reglamento): modal de aceptación previo a la primera reserva"`

---

## Grupo E — Recordatorio de lineamientos tras usar crédito

### Task E.1: Notificación de lineamientos al reservar

**Files:** Modify `backend/src/routes/bookings.ts` (post-commit ~807-812), `backend/src/lib/waitlist.ts` (promoción ~237-243); opcional `class_types.guidelines_text`

- [ ] **Step 1:** Tras una reserva exitosa (post-commit), escribir una notificación in-app (`writeInAppNotification`) con los lineamientos de esa clase/taller: texto de `class_types.guidelines_text` (o un default de `system_settings`), p.ej. "Llega 10 min antes. Recuerda: cancelación hasta 5h antes o pierdes el crédito."
- [ ] **Step 2:** Incluir ese texto también en el email de confirmación de reserva (`email.ts` confirmación ~608).
- [ ] **Step 3:** Replicar la notificación al promover desde lista de espera (`waitlist.ts`).
- [ ] **Step 4: Verificar** reservar y confirmar que llega la notificación in-app + el email incluye los lineamientos.
- [ ] **Step 5: Commit** `git commit -am "feat: recordatorio de lineamientos tras tomar crédito"`

---

## Grupo F — Recordatorios automáticos (email + wa.me)

### Task F.1: Activar recordatorios de clase por email/in-app

**Files:** Modify `backend/src/services/cron-jobs.ts` (sendClassReminders 703-773, schedule 775-879)

- [ ] **Step 1:** Reactivar `sendClassReminders` (hoy comentado) para enviar recordatorio 24h y 2h antes vía **email (Resend) + in-app** (sin WhatsApp Evolution). Quitar exclusión de "Tepa".
- [ ] **Step 2:** Activar `ENABLE_CRON_JOBS=true` en `.env` para probar (o ejecutar el job manual vía `routes/cron.ts`).
- [ ] **Step 3: Verificar** ejecutar el job manualmente y confirmar email/in-app generados para una clase próxima.
- [ ] **Step 4: Commit** `git commit -am "feat(recordatorios): recordatorio de clase 24h/2h por email + in-app"`

### Task F.2: Botones wa.me en admin/recepción

**Files:** Modify `frontend/src/pages/admin/clients/ClientDetail.tsx` (166-180,386), `frontend/src/pages/reception/ClientsScreen.tsx` (802,882,1023-1047)

- [ ] **Step 1:** Reemplazar el botón "Reenviar por WhatsApp" (Evolution) por un link `https://wa.me/<telefono>?text=<mensaje urlencoded>` generado en el cliente. Conservar el envío por email (Resend).
- [ ] **Step 2: Verificar** el botón abre WhatsApp Web/app con el mensaje precargado.
- [ ] **Step 3: Commit** `git commit -am "feat(whatsapp): botones wa.me click-to-chat en admin/recepción"`

---

## Grupo G — Pagos: Stripe + transferencia + efectivo

### Task G.1: Configurar Stripe + datos de transferencia Casa Shé

**Files:** Modify `backend/.env`/`.env.example`, `backend/src/lib/settings.ts` (138-144), `backend/src/routes/settings.ts` (134-140), `backend/src/index.ts` (3247-3276)

- [ ] **Step 1:** Añadir a `.env`: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_STATEMENT_DESCRIPTOR="CASA SHE"`, `FRONTEND_URL`. (Sin estas, tarjeta responde 503 y solo queda transferencia — aceptable en dev.)
- [ ] **Step 2:** `DEFAULTS.bank_info` (settings.ts 138-144) y fallback GET /bank-info (settings.ts 134-140) → datos de transferencia de Casa Shé (placeholder hasta que la clienta dé CLABE/banco/titular).
- [ ] **Step 3:** Eliminar/ajustar el bloque idempotente de `index.ts` (3247-3276) que fuerza bank_info BMB (CLABE 7229.../Karla) para que NO pise la config de Casa Shé.
- [ ] **Step 4: Verificar** Run: `curl -s localhost:3001/api/settings/bank-info` con token → datos Casa Shé (no BMB).
- [ ] **Step 5: Commit** `git commit -am "feat(pagos): Stripe env + datos de transferencia Casa Shé"`

### Task G.2: Quitar el checkout simulado (seguridad)

**Files:** Delete `frontend/src/components/PurchaseFlow.tsx`, `frontend/src/pages/Checkout.tsx`; Modify `frontend/src/App.tsx` (ruta `/pricing` 211)

- [ ] **Step 1:** Borrar `PurchaseFlow.tsx` y `pages/Checkout.tsx` (hace `POST /memberships` con pago `CARD-timestamp` FALSO que activa membresía sin cobro real). Quitar la `<Route>` `/pricing`.
- [ ] **Step 2:** Asegurar que el único checkout sea el de órdenes: `frontend/src/pages/client/Checkout.tsx` (`/app/checkout`) → `POST /orders` → Stripe o transferencia.
- [ ] **Step 3: Verificar** Run: `cd frontend && npm run build` Expected: OK; no quedan referencias a PurchaseFlow.
- [ ] **Step 4: Commit** `git commit -am "fix(seguridad): eliminar checkout simulado; usar solo flujo de órdenes"`

### Task G.3: Limpiar columnas muertas de Mercado Pago (opcional)

**Files:** Modify `backend/src/index.ts` (Migración 022 3093-3124, comentario 285)

- [ ] **Step 1:** Quitar las columnas `mp_checkout_url/mp_payment_id/mp_payment_status/mp_status_detail` y la tabla `payment_webhook_events` muertas (conservar `payment_provider`/`payment_intent_id` que SÍ se usan). Borrar comentario obsoleto "4% MercadoPago".
- [ ] **Step 2: Verificar** Run: `cd backend && npx tsc --noEmit` Expected: OK; backend arranca.
- [ ] **Step 3: Commit** `git commit -am "chore(pagos): limpiar columnas/tabla muertas de Mercado Pago"`

### Task G.4: Verificación end-to-end de pagos

**Files:** ninguno (prueba)

- [ ] **Step 1 (transferencia):** como clienta, `POST /orders` con `bank_transfer` → ver CLABE → subir comprobante (OrderDetail) → como admin aprobar en OrdersVerification → confirmar que se crea la membresía y los créditos.
- [ ] **Step 2 (tarjeta, si hay llaves Stripe test):** `POST /orders` con `card` → redirige a Stripe Checkout → pagar con tarjeta de prueba → webhook `checkout.session.completed` → membresía activa. (Probar webhook con `stripe listen --forward-to localhost:3001/api/stripe/webhook`.)
- [ ] **Step 3 (efectivo):** admin registra pago efectivo (`payments`) y acredita.
- [ ] **Step 4: Commit** (nada; verificación).

---

## Grupo H — QA final y arranque

### Task H.1: Smoke test integral

**Files:** ninguno

- [ ] **Step 1:** Backend `npx tsc --noEmit` y `npm run build` limpios; frontend `npm run build` limpio.
- [ ] **Step 2:** Flujo completo manual: registro clienta → comprar paquete (transferencia) → admin valida → reservar clase (acepta reglamento → ve lineamientos) → recibir email confirmación → cancelar a >5h (devuelve crédito) → reservar otra → check-in QR como admin → marca asistencia.
- [ ] **Step 3:** Verificar lista de espera (llenar cupo 7 y reservar la nº8).
- [ ] **Step 4:** Verificar que NO quedan strings "BMB"/"Tepa"/"Catarsis"/"Balance Room": Run: `grep -rin "bmb\|tepa\|san miguel\|catarsis\|balance room" backend/src frontend/src | grep -vi "node_modules"` → revisar/limpiar residuos.
- [ ] **Step 5: Commit** `git commit -am "test: smoke v1 OK"` y tag `git tag casa-she-v1`.

### Task H.2: README de arranque

**Files:** Modify `README.md`

- [ ] **Step 1:** Documentar pasos reproducibles: instalar Postgres, `createdb casa_she`, `psql -f backend/database/schema.sql`, copiar `.env`, `npm install` + `npm run dev` en backend (3001) y frontend (8080), seed.
- [ ] **Step 2: Commit** `git commit -am "docs: guía de arranque Casa Shé"`

---

## Pendientes que requieren la clienta (no bloquean dev)
- Credenciales Stripe (live) + endpoint webhook en dashboard Stripe.
- Datos de transferencia: CLABE, banco, titular.
- Créditos mensuales exactos de Membresía 360 y Black.
- Horario real + instructoras (para seed definitivo).
- Reglamento y lineamientos por tipo de clase (textos).
- Logo SVG + favicons oficiales.
- Dominio app (app.casashe.mx) + cuenta Resend (EMAIL_FROM verificado).

## Fuera de alcance v1 (Fase 2/3)
Lealtad/sellos · cuestionario onboarding perfilador · Apple/Google Wallet · sitio público rediseñado · tienda de ropa · Fuel Bar · eventos privados · WhatsApp API oficial · dos sedes · colapso de roles · payroll/comisiones/POS/videos.
