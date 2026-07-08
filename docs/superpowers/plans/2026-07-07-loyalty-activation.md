# Lealtad — Activar + Limpiar · Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dejar la lealtad de Casa Shé coherente y 100% controlable desde el admin — bonos con toggles por bono, config unificada en una sola fuente, y limpieza de residuos de marca ajena/schema — sin construir tiers ni expiración.

**Architecture:** El motor de lealtad (`backend/src/lib/loyalty.ts`) ya es la fuente de verdad: `getLoyaltyConfig`/`saveLoyaltyConfig` normalizan y persisten la config completa; el panel `LoyaltyConfig.tsx` ya expone los montos; los 3 crons de bono ya existen y validan `config.enabled`. Este plan (1) agrega **toggles por bono** (`birthday_enabled`/`anniversary_enabled`/`streak_enabled`) al motor, los crons y el panel; (2) elimina la **config duplicada divergente** de `settings.ts`; (3) limpia la promesa falsa de reseña, el seed de catálogo no-Casa-Shé y el schema desactualizado.

**Tech Stack:** Node/TS ESM + Express + `pg` (sin ORM) backend; React/Vite + axios + shadcn frontend; tests = scripts `tsx` con `node:assert/strict` encadenados en `npm test` (los `*-integration` usan `DATABASE_URL` del `.env`).

## Global Constraints

- **100% configurable desde el admin:** ningún comportamiento de negocio (montos, encendido de bonos, tasas) puede depender de env flags ni de constantes hardcodeadas. `ENABLE_CRON_JOBS` queda SOLO como interruptor de infraestructura (¿corre el planificador?), no como control de negocio.
- **Fuente única de verdad de config:** `loyalty.ts` (`DEFAULT_LOYALTY_CONFIG` + `normalizeConfig` + `getLoyaltyConfig`/`saveLoyaltyConfig`). No debe existir un segundo set divergente de defaults.
- **Round-trip seguro:** GET/PUT `/api/loyalty/config` ya devuelven/guardan la config COMPLETA normalizada (a las claves `loyalty_config` y `loyalty_settings`). Los campos nuevos deben entrar en `normalizeConfig` para no perderse.
- **Idempotencia de bonos:** los 3 crons ya son idempotentes por `description`. No romper eso.
- **Datos de prod:** cualquier borrado/reprecio toca datos reales en Railway. Regla: **verificar antes de borrar/escribir** (`railway run -s Postgres ...`), documentar antes/después, y escalar si hay datos inesperados.
- **Economía (default editable, NO hardcode):** ~5% de vuelta = 1 pt ≈ $0.50. Se realiza con knobs YA existentes en admin: `pesos_per_point` (LoyaltyConfig, ya = 10), tasa de canje del bar (`bar_config.points_redemption_rate` en Ajustes → Barra), y `points_cost` por recompensa (LoyaltyRewards). No se agrega un knob global nuevo. La corrección de la tasa del bar (10 → 0.50) pertenece al Fuel Bar (PR #38) / config de prod, NO a esta rama.
- **Sin emojis en código nuevo; copy en español; tokens visuales existentes.**
- **Cada tarea corre `cd backend && npx tsc --noEmit` (o `cd frontend && npx tsc --noEmit`) limpio antes de commit.**

## File Structure

- `backend/src/lib/loyalty.ts` — MODIFICAR: agregar 3 toggles al `interface LoyaltyConfig`, a `DEFAULT_LOYALTY_CONFIG`, y a `normalizeConfig`.
- `backend/src/services/cron-jobs.ts` — MODIFICAR: cada cron de bono checa su toggle antes de otorgar.
- `backend/src/lib/settings.ts` — MODIFICAR: eliminar la `interface LoyaltyConfig` divergente (6 campos) y el `loyalty_config` de `DEFAULTS` (valores 5× distintos), tras verificar que nada los consume.
- `frontend/src/pages/admin/loyalty/LoyaltyConfig.tsx` — MODIFICAR: agregar 3 Switch para los toggles por bono; agregar `*_enabled` al `interface` y al estado inicial.
- `backend/src/index.ts` — MODIFICAR: quitar el seed inline del catálogo no-Casa-Shé (bloque "Migration 031", ~líneas 716-756) tras verificar prod.
- `backend/database/migrations/031_seed_bmb.sql` — BORRAR: archivo durmiente de facilities BMB (no ejecutado, pero confuso).
- `backend/database/schema.sql` (y `schema_complete.sql`) — MODIFICAR: sincronizar el enum `loyalty_points_type` y quitar la tabla fantasma `rewards`.
- Frontend copy de "50 puntos por reseña" — MODIFICAR: quitar la promesa (ubicación exacta a localizar en Task 5).
- `backend/scripts/test-loyalty-config.ts` — CREAR: test puro de config (toggles + unificación).
- `backend/scripts/test-loyalty-crons-integration.ts` — CREAR: test Postgres de gating por toggle.
- `backend/package.json` — MODIFICAR: encadenar los 2 tests nuevos en el script `test`.

---

### Task 1: Toggles por bono en el motor de config

**Files:**
- Modify: `backend/src/lib/loyalty.ts` (interface `LoyaltyConfig` ~7-18, `DEFAULT_LOYALTY_CONFIG` ~20-31, `normalizeConfig` ~57-82)
- Test: `backend/scripts/test-loyalty-config.ts` (crear)

**Interfaces:**
- Produces: `LoyaltyConfig` gana 3 campos boolean: `birthday_enabled`, `anniversary_enabled`, `streak_enabled` (default `true`). `normalizeConfig(partial)` los rellena a `true` si faltan y coacciona a boolean. `getLoyaltyConfig()`/`saveLoyaltyConfig()` ya los propagan por usar `normalizeConfig`.

- [ ] **Step 1: Escribir el test que falla** — `backend/scripts/test-loyalty-config.ts`:

```typescript
import assert from 'node:assert/strict';
import { DEFAULT_LOYALTY_CONFIG, normalizeConfig } from '../src/lib/loyalty.js';

// Los 3 toggles existen y default true
assert.equal(DEFAULT_LOYALTY_CONFIG.birthday_enabled, true, 'birthday_enabled default true');
assert.equal(DEFAULT_LOYALTY_CONFIG.anniversary_enabled, true, 'anniversary_enabled default true');
assert.equal(DEFAULT_LOYALTY_CONFIG.streak_enabled, true, 'streak_enabled default true');

// normalizeConfig rellena toggles ausentes a true
const n1 = normalizeConfig({ birthday_bonus: 100 });
assert.equal(n1.birthday_enabled, true, 'toggle ausente -> true');
assert.equal(n1.streak_enabled, true, 'toggle ausente -> true');

// normalizeConfig respeta false explícito y coacciona a boolean
const n2 = normalizeConfig({ birthday_enabled: false, anniversary_enabled: 0, streak_enabled: 'x' as unknown });
assert.equal(n2.birthday_enabled, false, 'false explícito se respeta');
assert.equal(n2.anniversary_enabled, false, '0 -> false');
assert.equal(n2.streak_enabled, true, 'truthy -> true');

// normalizeConfig sigue rellenando los montos existentes (no regresión)
const n3 = normalizeConfig({});
assert.equal(n3.birthday_bonus, DEFAULT_LOYALTY_CONFIG.birthday_bonus, 'monto default intacto');

console.log('test-loyalty-config OK');
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd backend && npx tsx scripts/test-loyalty-config.ts`
Expected: FALLA — `birthday_enabled` es `undefined` (propiedad no existe en `DEFAULT_LOYALTY_CONFIG`), o error de tipos.

- [ ] **Step 3: Implementar** — en `backend/src/lib/loyalty.ts`:

En el `interface LoyaltyConfig` agregar tras `streak_bonus`:
```typescript
  birthday_enabled: boolean;      // toggle admin: otorgar bono de cumpleaños
  anniversary_enabled: boolean;   // toggle admin: otorgar bono de aniversario
  streak_enabled: boolean;        // toggle admin: otorgar bono de racha
```

En `DEFAULT_LOYALTY_CONFIG` agregar tras `streak_bonus: 10,`:
```typescript
  birthday_enabled: true,
  anniversary_enabled: true,
  streak_enabled: true,
```

En `normalizeConfig` (la función que construye la config completa desde un parcial), agregar la coerción de los 3 toggles usando el mismo estilo que los demás campos. El patrón: cada toggle usa el valor entrante si está definido, coaccionado a boolean, o el default `true`. Ejemplo de línea a agregar dentro del objeto que retorna `normalizeConfig` (ajustar al estilo real del archivo — si usa `parsed.x ?? DEFAULT.x`, para booleans usar coerción explícita):
```typescript
    birthday_enabled: typeof parsed?.birthday_enabled === 'boolean' ? parsed.birthday_enabled : (parsed?.birthday_enabled === undefined ? DEFAULT_LOYALTY_CONFIG.birthday_enabled : Boolean(parsed.birthday_enabled)),
    anniversary_enabled: typeof parsed?.anniversary_enabled === 'boolean' ? parsed.anniversary_enabled : (parsed?.anniversary_enabled === undefined ? DEFAULT_LOYALTY_CONFIG.anniversary_enabled : Boolean(parsed.anniversary_enabled)),
    streak_enabled: typeof parsed?.streak_enabled === 'boolean' ? parsed.streak_enabled : (parsed?.streak_enabled === undefined ? DEFAULT_LOYALTY_CONFIG.streak_enabled : Boolean(parsed.streak_enabled)),
```
Nota para el implementador: leer `normalizeConfig` real primero. Debe cumplir el test: ausente→true, `false`→false, `0`→false, `'x'`→true. Si el estilo del archivo ya tiene un helper de coerción, úsalo; lo importante es cumplir esas 4 aserciones.

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `cd backend && npx tsx scripts/test-loyalty-config.ts`
Expected: `test-loyalty-config OK`

- [ ] **Step 5: tsc + commit**

Run: `cd backend && npx tsc --noEmit` (limpio)
```bash
git add backend/src/lib/loyalty.ts backend/scripts/test-loyalty-config.ts
git commit -m "feat(loyalty): toggles por bono (birthday/anniversary/streak) en config del motor"
```

---

### Task 2: Los crons de bono respetan su toggle

**Files:**
- Modify: `backend/src/services/cron-jobs.ts` (`birthdayBonus` ~538, `anniversaryBonus` ~591, `streakBonus` ~645)
- Test: `backend/scripts/test-loyalty-crons-integration.ts` (crear; Postgres real)

**Interfaces:**
- Consumes: `LoyaltyConfig.birthday_enabled` / `anniversary_enabled` / `streak_enabled` (de Task 1). Las funciones exportadas de los crons: verificar si `cron-jobs.ts` exporta `birthdayBonus`/`anniversaryBonus`/`streakBonus`; si NO están exportadas, exportarlas (named export) para poder testearlas. Si el archivo solo exporta `default initializeCronJobs`, agregar `export` a las 3 funciones.

- [ ] **Step 1: Escribir el test de integración que falla** — `backend/scripts/test-loyalty-crons-integration.ts`:

Este test corre contra Postgres real (usa el `DATABASE_URL` del `.env`, patrón `*-integration`). Siembra un usuario con cumpleaños hoy + membresía activa dentro de una transacción que hace ROLLBACK al final (no ensucia la BD). Verifica que con `birthday_enabled=false` NO se otorga y con `true` SÍ.

```typescript
import assert from 'node:assert/strict';
import { pool } from '../src/config/database.js';
import { saveLoyaltyConfig } from '../src/lib/loyalty.js';
import { birthdayBonus } from '../src/services/cron-jobs.js';

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Usuario con cumpleaños HOY (MM-DD) + membresía activa
    const u = await client.query(
      `INSERT INTO users (email, display_name, date_of_birth, created_at)
       VALUES ($1, 'Test Cumple', (TO_CHAR(NOW() AT TIME ZONE 'America/Mexico_City','MM-DD') || '-1990')::date, NOW())
       RETURNING id`,
      [`test-cumple-${Math.floor(Math.random()*1e9)}@casa.test`]);
    // Nota: ajustar el INSERT a las columnas NOT NULL reales de users (ver schema). Agregar
    // password_hash/role/etc. si son obligatorias. El implementer completa columnas requeridas.
    const userId = u.rows[0].id;
    await client.query(
      `INSERT INTO memberships (user_id, status, start_date, end_date)
       VALUES ($1,'active', CURRENT_DATE - 10, CURRENT_DATE + 30)`, [userId]);
    // Nota: ajustar a columnas NOT NULL reales de memberships (plan_id, etc.).

    // Config con bono ON pero toggle OFF -> no otorga
    await saveLoyaltyConfig({ enabled: true, birthday_bonus: 100, birthday_enabled: false }, undefined, client);
    await birthdayBonus(client); // ver nota de firma abajo
    let n = await client.query(
      `SELECT COUNT(*)::int AS c FROM loyalty_points WHERE user_id=$1 AND type='birthday'`, [userId]);
    assert.equal(n.rows[0].c, 0, 'toggle OFF -> no otorga');

    // Toggle ON -> otorga una vez
    await saveLoyaltyConfig({ enabled: true, birthday_bonus: 100, birthday_enabled: true }, undefined, client);
    await birthdayBonus(client);
    n = await client.query(
      `SELECT COUNT(*)::int AS c, COALESCE(SUM(points),0)::int AS pts FROM loyalty_points WHERE user_id=$1 AND type='birthday'`, [userId]);
    assert.equal(n.rows[0].c, 1, 'toggle ON -> otorga 1');
    assert.equal(n.rows[0].pts, 100, 'otorga el monto configurado');

    await client.query('ROLLBACK');
    console.log('test-loyalty-crons-integration: OK');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
```

**Nota de firma (IMPORTANTE):** hoy `birthdayBonus()` no recibe cliente y usa el helper global `query()` (auto-commit), por lo que el ROLLBACK del test NO revertiría sus escrituras. Para que el test sea limpio y aislado, el implementer debe hacer que las 3 funciones acepten un `client` opcional y lo usen para sus queries (`const q = client ? client.query.bind(client) : query;`). Si eso es demasiado, alternativa: que el test NO use transacción y limpie explícitamente los `loyalty_points`/`users`/`memberships` que creó al final (DELETE por el userId sembrado). Elegir la opción más limpia; el criterio es: el test no deja basura y prueba el gating. Documentar la elección en el reporte.

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd backend && npx tsx scripts/test-loyalty-crons-integration.ts`
Expected: FALLA — o `birthdayBonus` no es exportada (import error), o con toggle OFF sí otorga (porque el cron aún no chequea el toggle).

- [ ] **Step 3: Implementar** — en `backend/src/services/cron-jobs.ts`:

(a) Exportar las 3 funciones si no lo están: cambiar `async function birthdayBonus(` → `export async function birthdayBonus(` (idem anniversary, streak).

(b) En cada cron, después de la línea que checa `if (!config.enabled) { ... return; }`, agregar el chequeo del toggle correspondiente:

En `birthdayBonus`, tras el check de `config.enabled`:
```typescript
        if (!config.birthday_enabled) { await recordJobExecution(jobName, true, 'birthday disabled (toggle)'); return; }
```
En `anniversaryBonus`:
```typescript
        if (!config.anniversary_enabled) { await recordJobExecution(jobName, true, 'anniversary disabled (toggle)'); return; }
```
En `streakBonus`:
```typescript
        if (!config.streak_enabled) { await recordJobExecution(jobName, true, 'streak disabled (toggle)'); return; }
```

(c) Si se eligió la opción de `client` opcional (recomendada), agregar `client?: DbClient` al parámetro de las 3 funciones y usarlo para las queries (mantener el default global cuando no se pasa, para no romper `initializeCronJobs`). Verificar que `cron.schedule('...', birthdayBonus, ...)` sigue funcionando (se llama sin args → `client` undefined → usa `query` global). 

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `cd backend && npx tsx scripts/test-loyalty-crons-integration.ts`
Expected: `test-loyalty-crons-integration: OK`

- [ ] **Step 5: Auditar seguridad del planificador (no-lealtad)**

Revisar `initializeCronJobs()` en `cron-jobs.ts`: listar los crons no-lealtad (recordatorios email, review-request, etc.). Confirmar que ninguno enviaría email real al encender el planificador sin Resend configurado (p.ej. que degradan a in-app o checan su propia config). Si alguno enviaría email sin gate, agregar una guarda mínima "apagado por default" (leer una config `system_settings` o una condición que hoy resulte en no-envío). **No** construir la feature de recordatorios; solo evitar disparo accidental. Anotar en el reporte qué crons existen y su estado de seguridad.

- [ ] **Step 6: tsc + commit**

Run: `cd backend && npx tsc --noEmit` (limpio)
```bash
git add backend/src/services/cron-jobs.ts backend/scripts/test-loyalty-crons-integration.ts
git commit -m "feat(loyalty): crons de bono respetan toggle por bono + auditoria de seguridad del planificador"
```

---

### Task 3: Toggles por bono en el panel admin

**Files:**
- Modify: `frontend/src/pages/admin/loyalty/LoyaltyConfig.tsx` (interface ~12-23, estado inicial ~29-40, form de bonos ~240-305)

**Interfaces:**
- Consumes: GET/PUT `/api/loyalty/config` ahora incluyen `birthday_enabled`/`anniversary_enabled`/`streak_enabled` (Task 1). El round-trip ya manda el objeto completo, así que basta con incluir los campos en el estado y renderizar los Switch.

- [ ] **Step 1: Agregar los toggles al interface y estado**

En el `interface LoyaltyConfig` del componente agregar:
```typescript
    birthday_enabled: boolean;
    anniversary_enabled: boolean;
    streak_enabled: boolean;
```
En el `useState<LoyaltyConfig>({...})` inicial agregar (default true):
```typescript
    birthday_enabled: true,
    anniversary_enabled: true,
    streak_enabled: true,
```

- [ ] **Step 2: Renderizar un Switch junto a cada monto de bono**

Junto al input de `birthday_bonus` (~línea 240) agregar un Switch controlado que prenda/apague el bono, con el mismo componente Switch que usa el toggle `enabled` (~línea 118-124). Ejemplo (ajustar al patrón real del archivo — usar el mismo `Switch`/`Label` y el handler de estado que ya usa `enabled`):
```tsx
<div className="flex items-center justify-between">
  <Label htmlFor="birthday_enabled">Otorgar bono de cumpleaños</Label>
  <Switch
    id="birthday_enabled"
    checked={config.birthday_enabled}
    onCheckedChange={(v) => setConfig({ ...config, birthday_enabled: v })}
  />
</div>
```
Repetir para `anniversary_enabled` (junto a `anniversary_bonus`) y `streak_enabled` (junto a `streak_bonus`). Copy en español, sin emojis.

- [ ] **Step 3: Verificar tsc**

Run: `cd frontend && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/admin/loyalty/LoyaltyConfig.tsx
git commit -m "feat(loyalty): switches por bono en el panel admin (cumpleaños/aniversario/racha)"
```

---

### Task 4: Eliminar la config de lealtad duplicada y divergente en settings.ts

**Files:**
- Modify: `backend/src/lib/settings.ts` (interface `LoyaltyConfig` ~53-60, `DEFAULTS.loyalty_config` ~132-139)

**Interfaces:**
- Produces: `settings.ts` deja de exportar una `LoyaltyConfig` divergente. La única `LoyaltyConfig` del backend es la de `loyalty.ts`.

- [ ] **Step 1: Verificar que nadie consume la config de lealtad vía settings.ts**

Run:
```bash
cd backend && grep -rn "loyalty_config" src/ | grep -i settings ; \
grep -rn "from './settings'\|from '../lib/settings'" src/ | xargs -I{} echo {} ; \
grep -rn "settings.*LoyaltyConfig\|DEFAULTS.loyalty" src/
```
Expected: identificar si algún módulo importa `LoyaltyConfig` desde `settings.ts` o lee `DEFAULTS.loyalty_config`. El motor real usa `getLoyaltyConfig` (loyalty.ts), no settings.ts. **Si hay un consumidor**, redirigirlo a `getLoyaltyConfig`/`DEFAULT_LOYALTY_CONFIG` de `loyalty.ts` ANTES de borrar. Documentar hallazgos en el reporte.

- [ ] **Step 2: Eliminar la definición divergente**

En `backend/src/lib/settings.ts`:
- Borrar el `interface LoyaltyConfig { ... }` (~53-60).
- Borrar la entrada `loyalty_config: { ... }` del objeto `DEFAULTS` (~132-139).
- Si `LoyaltyConfig` de settings.ts se re-exportaba o se referenciaba en el mismo archivo, ajustar esas referencias (p.ej. tipar con la de loyalty.ts o quitar la referencia).

- [ ] **Step 3: Verificar build**

Run: `cd backend && npx tsc --noEmit`
Expected: sin errores. Si aparece un error por un consumidor no detectado en Step 1, redirigirlo a `loyalty.ts` y volver a compilar.

- [ ] **Step 4: Commit**

```bash
git add backend/src/lib/settings.ts
git commit -m "refactor(loyalty): elimina config de lealtad duplicada/divergente en settings.ts (fuente única = loyalty.ts)"
```

---

### Task 5: Quitar la promesa "gana 50 puntos por reseña"

**Files:**
- Modify: archivo(s) de frontend/backend donde aparezca la copy (localizar en Step 1)

**Interfaces:** ninguna. Solo copy.

- [ ] **Step 1: Localizar la promesa**

Run:
```bash
cd "$(git rev-parse --show-toplevel)" && grep -rniE "50 puntos|puntos por (reseña|resena|review)|gana.*puntos.*reseñ" frontend/src backend/src
```
Expected: encontrar el/los textos que prometen puntos por reseña (la faceta de exploración lo ubicó en la UI del cliente y/o en el texto del request de reseña en `cron-jobs.ts`). Listar cada ocurrencia.

- [ ] **Step 2: Quitar/editar la promesa**

En cada ocurrencia: eliminar la promesa de puntos. Si el texto es un mensaje de invitación a reseña, dejar la invitación pero **sin** prometer puntos (no existe otorgamiento). No borrar el flujo de reseña, solo la frase de "N puntos".

- [ ] **Step 3: Verificar que no quedan promesas**

Run: `grep -rniE "puntos por (reseña|resena|review)|50 puntos" frontend/src backend/src` → sin resultados de promesa.
Run: `cd frontend && npx tsc --noEmit` (si tocó frontend) y `cd backend && npx tsc --noEmit` (si tocó backend) → limpio.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "fix(loyalty): quita la promesa 'gana 50 puntos por reseña' (no existe otorgamiento)"
```

---

### Task 6: Limpieza del seed de catálogo no-Casa-Shé + archivo BMB durmiente

**Files:**
- Modify: `backend/src/index.ts` (bloque "Migration 031" inline, ~716-756)
- Delete: `backend/database/migrations/031_seed_bmb.sql`

**Interfaces:** ninguna (seed/datos).

- [ ] **Step 1: Verificar el estado real en prod ANTES de tocar nada**

Contexto: el bloque inline "Migration 031" (index.ts ~720-750) siembra en cada arranque un catálogo que NO es el de Casa Shé (class_types: `Pilates Reformer`, `Hot Yoga`, `Pole Fitness`, `Twerk`, etc.; plans: `Reformer 4/8/...`, `Multi ...`, `Mixta ...`). El catálogo real de Casa Shé es Pilates Mat, Barre, Sculpt, Yoga Ashtanga, Yoga Vinyasa, Salsa (ver el bloque `CS_TYPES`/`CS_PLANS` que ya desactiva por nombre lo que no está en su lista). El archivo `031_seed_bmb.sql` (facilities BMB) existe pero NO se ejecuta.

Verificar en prod qué filas existen y si tienen datos reales (reservas/ventas) antes de decidir borrado. Usar el patrón seguro de acceso a prod (`railway run -s Postgres ...`). Consultas de verificación (solo lectura):
```sql
-- class_types del catálogo BMB residual y si tienen clases/bookings
SELECT ct.name, ct.is_active,
       (SELECT count(*) FROM classes c WHERE c.class_type_id = ct.id) AS clases
FROM class_types ct
WHERE ct.name IN ('Pilates Reformer','Yoga','Hot Yoga','Barre','Hot Barre','Sculpt','Hot Sculpt','Hot Pilates','Pole Fitness','Pole Dance','Flex','Funcional','Twerk')
ORDER BY ct.name;
-- plans BMB residuales y si tienen ventas/membresías
SELECT p.name, p.is_active,
       (SELECT count(*) FROM memberships m WHERE m.plan_id = p.id) AS membs
FROM plans p
WHERE p.name IN ('Reformer 4','Reformer 8','Reformer 12','Reformer 16','Reformer 20','Reformer 30','Multi 4','Multi 8','Multi 12','Multi 16','Multi 20','Multi 30','Mixta 12','Mixta 16','Mixta 20','Multi full','Reformer full','Full access','1ra vez reformer','1ra vez multi','Reformer individual','Multi individual','Personalizada')
ORDER BY p.name;
-- facilities BMB (por si el .sql corrió alguna vez)
SELECT name, id FROM facilities WHERE name ILIKE '%BMB%';
```
**Regla de seguridad:** si alguna fila tiene clases/bookings/membresías reales, NO borrarla — escalar al dueño. Documentar el resultado (antes/después) en el reporte.

- [ ] **Step 2: Dejar de sembrar el catálogo no-Casa-Shé**

En `backend/src/index.ts`, en el bloque "Migration 031": eliminar los dos `INSERT ... class_types` y `INSERT ... plans` con el catálogo BMB residual (los `VALUES` de Reformer/Pole/Twerk/Mixta). Conservar el `INSERT ... system_settings ('cancellation_policy' ...)` (esa política sí es Casa Shé y es idempotente `DO NOTHING`). Ajustar el `console.log` a algo como `'Migration 031: politica de cancelacion sembrada.'`. Resultado: el arranque ya no recrea el catálogo ajeno.

- [ ] **Step 3: Borrar el archivo BMB durmiente**

Run:
```bash
cd "$(git rev-parse --show-toplevel)" && git rm backend/database/migrations/031_seed_bmb.sql
```

- [ ] **Step 4: (Datos prod) Desactivar/borrar filas residuales — solo si Step 1 confirmó que no tienen datos**

Si Step 1 confirmó que las class_types/plans residuales están sin clases/membresías reales, prepararlas para borrado en prod (documentar el DELETE ejecutado vía Railway). Si tienen datos o hay duda, dejarlas inactivas (el `CS_TYPES`/`CS_PLANS` ya las pone `is_active=false`) y anotar la decisión. **No borrar a ciegas.** Este paso es de datos/ops, no de código; se documenta en el reporte con el antes/después.

- [ ] **Step 5: Verificar build + commit**

Run: `cd backend && npx tsc --noEmit` (limpio)
```bash
git add backend/src/index.ts
git commit -m "chore(catalog): deja de sembrar catalogo no-Casa-She en el arranque + borra 031_seed_bmb.sql durmiente"
```

---

### Task 7: Sincronizar el schema desactualizado

**Files:**
- Modify: `backend/database/schema.sql` (enum `loyalty_points_type` ~39, tabla `rewards` ~283)
- Modify: `backend/database/schema_complete.sql` (tabla `rewards` ~518, si aplica)

**Interfaces:** ninguna (documentación de schema; el runtime ya lo maneja por migraciones).

- [ ] **Step 1: Actualizar el enum de tipos de puntos**

En `backend/database/schema.sql`, el `CREATE TYPE loyalty_points_type AS ENUM (...)` (~línea 39) solo lista los tipos originales. Actualizarlo para reflejar el runtime (migración 023f añade): incluir `'welcome'`, `'birthday'`, `'anniversary'`, `'streak'`, `'package_purchase'` además de los existentes (`'earn'`, `'redemption'`, `'bonus'`, `'refund'`, o los que ya liste — leer el enum real y unir, sin duplicar). Es solo documentación de schema; no cambia el runtime.

- [ ] **Step 2: Quitar la tabla fantasma `rewards`**

La app usa `loyalty_rewards` (creada por migración en `index.ts`), no la tabla `rewards` de `schema.sql` (~283) / `schema_complete.sql` (~518). Borrar (o comentar con nota) la definición `CREATE TABLE rewards (...)` de esos archivos de schema para que reflejen el runtime. Verificar con grep que nada del backend hace `FROM rewards` (debe usar `loyalty_rewards`):
```bash
cd backend && grep -rniE "\brewards\b" src/ | grep -vi loyalty_rewards
```
Expected: sin referencias a la tabla `rewards` pelada en el código (si aparece alguna, investigar antes de borrar la tabla del schema).

- [ ] **Step 3: Commit**

```bash
git add backend/database/schema.sql backend/database/schema_complete.sql
git commit -m "docs(schema): sincroniza enum loyalty_points_type y quita tabla fantasma rewards (runtime usa loyalty_rewards)"
```

---

### Task 8: Encadenar los tests nuevos + verificación final

**Files:**
- Modify: `backend/package.json` (script `test`)

- [ ] **Step 1: Agregar los tests nuevos al script `test`**

En `backend/package.json`, en el script `"test"`, encadenar al final (con `&&`, patrón existente):
```
&& tsx scripts/test-loyalty-config.ts && tsx scripts/test-loyalty-crons-integration.ts
```

- [ ] **Step 2: Correr la suite completa del backend**

Run: `cd backend && npm test`
Expected: todos los tests pasan, incluyendo `test-loyalty-config OK` y `test-loyalty-crons-integration: OK`.

- [ ] **Step 3: tsc final de ambos proyectos**

Run: `cd backend && npx tsc --noEmit` y `cd frontend && npx tsc --noEmit`
Expected: ambos limpios.

- [ ] **Step 4: Commit**

```bash
git add backend/package.json
git commit -m "test(loyalty): encadena test-loyalty-config y test-loyalty-crons-integration en npm test"
```

---

## Notas de economía (ops, no código — para el handoff al dueño)

La economía ~5% (1 pt ≈ $0.50) se ajusta desde el admin, no en esta rama:
1. **Ganancia:** `pesos_per_point = 10` (LoyaltyConfig) ya da ~5% si el punto vale $0.50. Sin cambio.
2. **Tasa de canje del bar:** `bar_config.points_redemption_rate` 10 → **0.50** en Ajustes → Barra (o `system_settings` en prod). Pertenece al Fuel Bar (PR #38), no a esta rama.
3. **Catálogo de recompensas:** reprecio de `points_cost` por recompensa (LoyaltyRewards) para que `points_cost ≈ precio/0.50`. Dato de prod; verificar y ajustar tras el merge.

## Activación en prod (ops)

- Encender el planificador: `ENABLE_CRON_JOBS` distinto de `'false'` en Railway (infra). Los bonos entonces se rigen por los toggles del admin.
- Confirmar en `LoyaltyConfig` los montos y toggles antes de activar.

---

## Self-Review (checklist del autor)

- **Cobertura del spec:** (1) economía 5% → notas de ops + `pesos_per_point` ya correcto ✅; (2) config unificada → Task 4 ✅; (3) 100% admin / toggles por bono → Tasks 1-3 ✅; (4) quitar promesa reseña → Task 5 ✅; (5) seed BMB → Task 6 ✅; (6) schema → Task 7 ✅; (7) seguridad del planificador → Task 2 Step 5 ✅; (8) pruebas → Tasks 1,2,8 ✅.
- **Placeholders:** los pasos de datos-prod (Task 6 Step 1/4) son verificación con SQL concreto, no placeholders; incluyen la regla "no borrar a ciegas". Las notas "ajustar al estilo real" en Tasks 1-3 dan el criterio de aceptación exacto (aserciones del test / campos a renderizar).
- **Consistencia de tipos:** `birthday_enabled`/`anniversary_enabled`/`streak_enabled` (boolean) se usan idénticos en loyalty.ts (Task 1), cron-jobs.ts (Task 2), LoyaltyConfig.tsx (Task 3). Firmas de cron con `client?` opcional consistentes entre Task 2 test e impl.
- **Riesgo conocido:** Task 2 requiere exportar las funciones de cron y (recomendado) aceptar `client` opcional; si el implementer elige la variante sin transacción, el test debe limpiar sus filas. Documentado en la tarea.
