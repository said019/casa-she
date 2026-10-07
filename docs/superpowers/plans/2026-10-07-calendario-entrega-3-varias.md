# Entrega 3 — Varias a la vez: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que recepción seleccione varias clases en la semana por horas y, en un solo paso con vista previa, les cambie la coach, el cupo de TotalPass, la hora o el tipo, o las cancele, sabiendo antes qué les pasa a las alumnas y a TotalPass.

**Architecture:** Primero se preparan las piezas de soporte para que corran dentro de una transacción ajena (`cancelClassWithRefunds`, `setTotalpassCap` y las marcas de retiro/resincronización aceptan un `db` opcional). Luego `POST /api/classes/bulk` evalúa cada clase en `backend/src/lib/classes-bulk.ts` (`procesarLote`): con `vistaPrevia` solo cuenta; al aplicar, si ninguna está bloqueada, escribe TODO con el cliente de una sola transacción y devuelve lo que sale del sistema (avisos, correos, barridos de TotalPass) para hacerlo una vez después del COMMIT. En el frontend, la selección, los atajos, los textos y la acción inversa de "Deshacer" viven en un módulo puro (`seleccion.ts`); la rejilla y la tarjeta ganan el modo selección; una barra inferior abre una ventana por acción que pide la vista previa y aplica.

**Tech Stack:** Backend Express + pg + zod 3; pruebas `tsx` + `node:assert` contra Postgres local en `BEGIN … ROLLBACK`. Frontend React 18 + Vite + TypeScript (no estricto), Tailwind (tokens `casa-*`), shadcn/ui sobre Radix, TanStack Query v5, date-fns 3; Playwright 1.58 con el arnés `frontend/scripts/e2e-local.sh`.

**Spec:** `docs/superpowers/specs/2026-10-07-calendario-recepcion-design.md` (secciones "Reglas que aplican a todo" y "Entrega 3 — Varias a la vez"; la Entrega 4 rehará "Inscribir alumna" en el panel y la 5 agrega la alumna nueva: este plan no toca ninguno de los dos).

## Global Constraints

- Worktree `/Users/saidromero/Desktop/Casa She/casa-she-entrega-3`, rama `feat/calendario-varias-a-la-vez` (ya existe, sale de `origin/feat/calendario-semana-horas`, head `d0fd910`). No crear ramas ni worktrees. Los comandos se corren desde la raíz del worktree salvo que el paso diga otra cosa. El disco está en iCloud: para buscar usa `git grep`, no búsquedas recursivas del sistema de archivos.
- Commits en español, `git add` explícito por archivo, mensaje terminado en `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Nunca `git stash`. Ninguna tarea hace push ni abre PR (el controlador abre el PR contra `feat/calendario-semana-horas` al final).
- Typecheck del frontend: `cd frontend && npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -E "error TS" | grep -vE "FilterPills.tsx\(124|push.ts\(47|Events.tsx\((259|906)"` no debe imprimir nada (esos 4 errores ya existen; ninguno nuevo). Typecheck del backend: `cd backend && npx tsc --noEmit` sin errores.
- Base de datos: SOLO la local, `DATABASE_URL=postgresql://localhost:5432/casa_she`, y dentro de `BEGIN … ROLLBACK`. Nunca producción ni `railway run`.
- Playwright SOLO con `frontend/scripts/e2e-local.sh … --project=chromium --workers=3` (copia desechable de la base local, backend en :3001 sin crons, WhatsApp, pagos ni credenciales de plataformas; se borra al final). Con más workers los inicios de sesión simultáneos llegan a pasar de 15 s en esta máquina. Siempre en `/admin/calendar`. Si falta el navegador: `cd frontend && npx playwright install chromium`.
- **Nunca borrar clases; cancelarlas** (`partner_class_mappings.class_id` es `ON DELETE CASCADE`: borrar deja la clase viva en TotalPass). Toda baja pasa por `cancelClassWithRefunds` + `dispararRetiroTotalpass()`. `POST /api/classes/bulk-delete` se elimina.
- **Hora de CDMX** para "ya empezó / ya pasó": `localDateTimeUtc(fecha, 'HH:MM')` de `backend/src/lib/mx-time.ts`, nunca `new Date()` armado a mano ni `toISOString()` para fechas de clase.
- **TotalPass:** cambiar coach o tipo es "editar" (la socia conserva su lugar); cambiar la hora es "mover" (se borra y se republica: las socias pierden su lugar). Toda pantalla que mueve lo avisa antes.
- **Endpoint (contrato del spec, sin cambios):** `POST /api/classes/bulk` (`authenticate`, `requireElevated`). Cuerpo zod: `classIds` uuid 1–200 sin repetidos; `accion: 'coach' | 'cupo_canal' | 'mover' | 'cancelar'`; `vistaPrevia: boolean`; `instructorId?` (coach); `canal?: 'totalpass'` y `lugares?` entero ≥ 0 (cupo_canal); `minutos?` múltiplo de 15 entre −180 y 180, distinto de 0 si no hay `classTypeId` (mover); `classTypeId?` (mover); `motivo?` hasta 200 (cancelar). Respuesta igual en vista previa y al aplicar: `{ clases: [{ classId, estado: 'ok'|'bloqueada', motivo?, alumnasAvisadas, sociasPorCanal, sociasPierdenLugar, advertencias }], resumen: { ok, bloqueadas, alumnasAvisadas, sociasPierdenLugar }, aplicado }`. Aplicar exige cero bloqueadas (409 con la misma respuesta). Cambios de base de datos en UNA transacción; avisos y `dispararResyncTotalpass()` / `dispararRetiroTotalpass()` una vez después del COMMIT; registro en auditoría.
- **Permisos:** los de hoy (`requireElevated`). Recepción queda limitada a su sucursal asignada (`users.default_facility_id`; sin sucursal asignada ve todas).
- `cancelClassWithRefunds`, `setTotalpassCap`, `marcarRetiroTotalpass`, `desmarcarRetiroTotalpass` y `marcarResyncTotalpass` llamados SIN el parámetro nuevo se comportan igual que hoy (`closed-days.ts`, `events.ts`, `DELETE /classes/:id`, `PUT /:id/channels` no cambian).
- Tipografía de la app (`font-heading`, `font-body`); colores con tokens `casa-*`. El color de una plataforma solo va en su logo y en sus puntos, nunca como color de texto.
- La selección múltiple es solo de escritorio (rejilla, `lg` y más). El móvil (`VistaDiaMovil`) no cambia.
- Módulos puros del calendario (`seleccion.ts`): sin imports con alias `@/` (rutas relativas sí). Se prueban con `cd frontend && npx tsx scripts/test-<nombre>.ts`.
- "Deshacer" solo cuando la inversa cabe en una llamada al mismo endpoint: coach, si todas tenían la misma coach antes; mover, con `−minutos` y, si cambió el tipo, solo si todas tenían el mismo tipo antes. Cupo y cancelar no se deshacen. Las canceladas siguen visibles, marcadas.

## Review Focus

- Algo cambia entre la vista previa y aplicar (una clase empieza, otra persona la cancela): no se aplica nada, el servidor responde 409 y la ventana muestra la bloqueada con su motivo. Cubierto en Task 2 (`procesarLote` vuelve a evaluar al aplicar, bajo `FOR UPDATE`) y Task 7 (Playwright "si algo cambia entre la vista previa y aplicar…").
- Doble clic en el botón de aplicar: se manda UNA vez (mover +1 h dos veces serían +2 h). Cubierto en Task 7 (Playwright de mover con `dblclick`).
- Seleccionar y luego cambiar de semana: la selección se limpia; nunca se aplica a clases que ya no se ven. Cubierto en Task 6 (Playwright de selección).
- "Deshacer" cuando ya no se puede (la clase empezó entre aplicar y deshacer): no cambia nada y el aviso dice por qué. Cubierto en Task 8 (Playwright de deshacer).
- Una falla a la mitad del lote (error de base, índice único al mover): no queda nada a medias. Cubierto en Task 3 (`test-classes-bulk.ts`, falla forzada con un trigger) y la ruta responde "No se aplicó ningún cambio".

## Mapa de archivos

| Archivo | Responsabilidad | Task |
| --- | --- | --- |
| `backend/src/lib/db-tx.ts` | `ClienteTx` y `filas(db, sql, params)`: consulta en la transacción o en el pool | 1 |
| `backend/src/lib/cancel-class.ts` | `cancelClassWithRefunds(…, opts?)` con `db` y `diferirAvisos` | 1 |
| `backend/src/lib/totalpass/{caps,retire,resync}.ts` | `setTotalpassCap`, marcas de retiro/resync con `db` opcional; el retiro gana sobre `pending_resync` | 1 |
| `backend/scripts/fixtures/clases-tx.ts` | Datos de prueba dentro de la transacción (clases, alumnas, socias, mapeos) | 1 |
| `backend/scripts/test-clases-en-transaccion.ts` | Prueba del soporte en transacción | 1 |
| `backend/src/lib/classes-bulk.ts` | Esquema, evaluación (vista previa), aplicar y avisos del lote | 2, 3 |
| `backend/src/routes/classes.ts` | `POST /bulk`; sin `POST /bulk-delete`; `PUT /:id` avisa al mover | 2, 3, 4 |
| `backend/scripts/test-classes-bulk.ts` | Vista previa, bloqueos, 409, aplicar, falla a la mitad | 2, 3 |
| `backend/scripts/test-totalpass-cableado.ts` | `/bulk` dispara retiro y resync | 3 |
| `backend/src/lib/avisos-clase.ts` + `backend/scripts/test-avisos-clase.ts` | Aviso a alumnas cuando "Editar clase" cambia día u hora | 4 |
| `frontend/e2e/tests/admin-classes-bulk-api.spec.ts` | `/bulk` de punta a punta contra el backend del arnés | 4 |
| `frontend/src/pages/admin/classes/calendario/seleccion.ts` + `frontend/scripts/test-calendario-seleccion.ts` | Selección, atajos, textos, inversa (puro) | 5 |
| `…/calendario/TarjetaClase.tsx` | Casilla de selección y tarjeta de 50 min legible a 120–140 px | 6 |
| `…/calendario/RejillaSemana.tsx`, `EncabezadoDia.tsx` | Modo selección en la rejilla y en el encabezado del día | 6 |
| `frontend/src/pages/admin/classes/ClassesCalendar.tsx` | "Seleccionar varias", atajos, barra, ventanas, deshacer | 6, 7, 8 |
| `…/calendario/BarraSeleccion.tsx`, `DialogoLote.tsx` | Barra oscura inferior y ventana de cada acción con vista previa | 7 |
| `frontend/e2e/fixtures/calendario.ts`, `frontend/e2e/tests/admin-classes.spec.ts` | `mockLote` y casos "Calendario de recepción – varias a la vez" | 6, 7, 8 |

---

### Task 1: Cancelar, cupo y marcas de TotalPass dentro de una transacción ajena

**Tipo:** código completo, se transcribe. Toca la base local (dentro de `BEGIN … ROLLBACK`).

**Files:**
- Create: `backend/src/lib/db-tx.ts`
- Modify: `backend/src/lib/totalpass/retire.ts` (`marcarRetiroTotalpass` ~L166, `desmarcarRetiroTotalpass` ~L193)
- Modify: `backend/src/lib/totalpass/resync.ts` (`marcarResyncTotalpass` ~L94)
- Modify: `backend/src/lib/totalpass/caps.ts` (`setTotalpassCap` ~L45-73)
- Modify: `backend/src/lib/cancel-class.ts` (archivo completo)
- Modify: `backend/package.json` (script `test`)
- Create: `backend/scripts/fixtures/clases-tx.ts`
- Test: `backend/scripts/test-clases-en-transaccion.ts`

**Interfaces:**
- Produces: `type ClienteTx = PoolClient` y `filas<T>(db: ClienteTx | undefined, sql: string, params?: unknown[]): Promise<T[]>` en `backend/src/lib/db-tx.ts`.
- Produces: `cancelClassWithRefunds(classId: string, cancelledBy: string, reason: string, opts?: { db?: ClienteTx; diferirAvisos?: boolean }): Promise<{ class: any; cancelledBookings: number; refundedCredits: number; avisos: AvisoCancelacion[] }>`, con `interface AvisoCancelacion { userId: string; payload: WebPushPayload }` (exportada de `cancel-class.ts`). Sin `diferirAvisos`, `avisos` llega vacío y el push sale al momento como hoy.
- Produces: `setTotalpassCap(classId, maxSpots, db?: ClienteTx)`, `marcarRetiroTotalpass(classId, db?)`, `desmarcarRetiroTotalpass(classId, db?)`, `marcarResyncTotalpass(classIds, db?)`. Con `db` los errores se propagan (la transacción ya quedó abortada); sin `db`, igual que hoy.
- Produces: `marcarRetiroTotalpass` también retira mapeos en `'pending_resync'` (una clase movida y luego cancelada antes del barrido se quedaba viva en TotalPass: el barrido de resync solo toma clases `scheduled`).
- Produces (pruebas): `backend/scripts/fixtures/clases-tx.ts` con `prepararBase(db) → BasePrueba { multi, multi2, reformer, coachA, coachB, sucursal, plan, admin }`, `fechaEnDias(db, dias) → 'YYYY-MM-DD'` (hoy en CDMX + días), `crearClase(db, base, { fecha, hora, minutos?, tipo?, coach?, sucursal?, cupo? }) → id`, `crearAlumna(db, base) → { userId, membershipId }` (5 créditos en cada bolsa), `inscribir(db, classId, alumna, categoria?) → bookingId`, `conTotalpass(db, base, classId, max, socias?)`, `publicada(db, classId, estado?)`, `estadoMapping(db, classId) → string | null`.

- [ ] **Step 0: Dependencias y línea base**

```bash
cd "/Users/saidromero/Desktop/Casa She/casa-she-entrega-3"
(cd backend && npm ci) && (cd frontend && npm ci)
cd backend && npx tsc --noEmit; echo "tsc backend: $?"
```

Expected: `npm ci` sin errores; `tsc backend: 0`. No uses `npm test` completo como criterio en ninguna tarea: `test-class-waitlist.ts` ya falla en la base local desde antes de esta rama (sin `JWT_SECRET` falla el inicio de sesión; con él, pide aceptar el reglamento); cada tarea corre sus pruebas por nombre.

- [ ] **Step 1: Datos de prueba y la prueba que falla**

Crear `backend/scripts/fixtures/clases-tx.ts`:

```ts
/**
 * Datos de prueba para los scripts que corren contra la base LOCAL dentro de una
 * transacción que se revierte (BEGIN … ROLLBACK). Todo lo que crea vive solo en esa
 * transacción: nunca se escribe nada de verdad.
 */
import type { PoolClient } from 'pg';

export interface BasePrueba {
    multi: string;      // class_type_id de la bolsa "Clases"
    multi2: string;     // otro tipo "Clases" (para mover de tipo sin cambiar de bolsa)
    reformer: string;   // class_type_id de la bolsa "Salsa"
    coachA: string;
    coachB: string;
    sucursal: string;
    plan: string;
    admin: string;      // users.id que firma cancelaciones y auditoría
}

export async function prepararBase(db: PoolClient): Promise<BasePrueba> {
    const uno = async (sql: string) => (await db.query(sql)).rows[0]?.id as string | undefined;
    const multi = await uno(`SELECT id FROM class_types WHERE category = 'multi' ORDER BY name LIMIT 1`);
    const multi2 = await uno(`SELECT id FROM class_types WHERE category = 'multi' ORDER BY name OFFSET 1 LIMIT 1`);
    const reformer = await uno(`SELECT id FROM class_types WHERE category = 'reformer' ORDER BY name LIMIT 1`);
    const coaches = (await db.query(`SELECT id FROM instructors WHERE is_active = true ORDER BY display_name LIMIT 2`)).rows;
    const sucursal = await uno(`SELECT id FROM facilities ORDER BY name LIMIT 1`);
    const plan = await uno(`SELECT id FROM plans ORDER BY name LIMIT 1`);
    if (!multi || !multi2 || !reformer || coaches.length < 2 || !sucursal || !plan) {
        throw new Error('La base local necesita 2 tipos "multi", 1 "reformer", 2 coaches activas, una sucursal y un plan');
    }
    const admin = (await db.query(
        `INSERT INTO users (email, phone, display_name, role, is_active)
         VALUES ('admin-lote-' || gen_random_uuid() || '@casashe.test', '55' || floor(random() * 1e8)::text, 'Admin Lote', 'admin', true)
         RETURNING id`,
    )).rows[0].id as string;
    return { multi, multi2, reformer, coachA: coaches[0].id, coachB: coaches[1].id, sucursal, plan, admin };
}

/** Fecha (YYYY-MM-DD) a `dias` de hoy en CDMX. */
export async function fechaEnDias(db: PoolClient, dias: number): Promise<string> {
    return (await db.query(
        `SELECT ((NOW() AT TIME ZONE 'America/Mexico_City')::date + $1::int)::text AS d`, [dias],
    )).rows[0].d as string;
}

export async function crearClase(db: PoolClient, base: BasePrueba, datos: {
    fecha: string; hora: string; minutos?: number; tipo?: string; coach?: string; sucursal?: string; cupo?: number;
}): Promise<string> {
    const r = await db.query(
        `INSERT INTO classes (class_type_id, instructor_id, facility_id, date, start_time, end_time, max_capacity, status)
         VALUES ($1, $2, $3, $4::date, $5::time, $5::time + make_interval(mins => $6::int), $7, 'scheduled') RETURNING id`,
        [datos.tipo ?? base.multi, datos.coach ?? base.coachA, datos.sucursal ?? base.sucursal, datos.fecha, datos.hora, datos.minutos ?? 50, datos.cupo ?? 7],
    );
    const id = r.rows[0].id as string;
    // El trigger siembra TotalPass con el default del tipo: cada prueba parte sin canales.
    await db.query(`DELETE FROM channel_inventory WHERE class_id = $1`, [id]);
    return id;
}

/** Alumna con una membresía activa con 5 créditos en cada bolsa. */
export async function crearAlumna(db: PoolClient, base: BasePrueba): Promise<{ userId: string; membershipId: string }> {
    const userId = (await db.query(
        `INSERT INTO users (email, phone, display_name, role, is_active)
         VALUES ('alumna-lote-' || gen_random_uuid() || '@casashe.test', '55' || floor(random() * 1e8)::text, 'Alumna Lote', 'client', true)
         RETURNING id`,
    )).rows[0].id as string;
    const membershipId = (await db.query(
        `INSERT INTO memberships (user_id, plan_id, status, multi_remaining, reformer_remaining, start_date, end_date)
         VALUES ($1, $2, 'active', 5, 5, CURRENT_DATE, CURRENT_DATE + 60) RETURNING id`,
        [userId, base.plan],
    )).rows[0].id as string;
    return { userId, membershipId };
}

/** Reserva confirmada de una alumna de la app que gastó un crédito de `categoria`. */
export async function inscribir(db: PoolClient, classId: string, alumna: { userId: string; membershipId: string }, categoria: 'multi' | 'reformer' = 'multi'): Promise<string> {
    await db.query(`UPDATE memberships SET ${categoria}_remaining = ${categoria}_remaining - 1 WHERE id = $1`, [alumna.membershipId]);
    await db.query(`UPDATE classes SET current_bookings = current_bookings + 1 WHERE id = $1`, [classId]);
    return (await db.query(
        `INSERT INTO bookings (class_id, user_id, membership_id, consumed_category, status, channel)
         VALUES ($1, $2, $3, $4, 'confirmed', 'app') RETURNING id`,
        [classId, alumna.userId, alumna.membershipId, categoria],
    )).rows[0].id as string;
}

/** Cupo TotalPass `max` con `socias` reservas de socias (el trigger de bookings sube booked_spots). */
export async function conTotalpass(db: PoolClient, base: BasePrueba, classId: string, max: number, socias = 0): Promise<void> {
    await db.query(
        `INSERT INTO channel_inventory (class_id, channel, max_spots) VALUES ($1, 'totalpass', $2)
         ON CONFLICT (class_id, channel) DO UPDATE SET max_spots = EXCLUDED.max_spots`,
        [classId, max],
    );
    for (let i = 0; i < socias; i++) {
        const socia = await crearAlumna(db, base);
        await db.query(`UPDATE classes SET current_bookings = current_bookings + 1 WHERE id = $1`, [classId]);
        await db.query(
            `INSERT INTO bookings (class_id, user_id, status, channel, external_ref) VALUES ($1, $2, 'confirmed', 'totalpass', gen_random_uuid()::text)`,
            [classId, socia.userId],
        );
    }
}

/** La clase ya vive en TotalPass (mapping publicado). */
export async function publicada(db: PoolClient, classId: string, estado = 'published'): Promise<void> {
    await db.query(
        `INSERT INTO partner_class_mappings (class_id, channel, sync_status) VALUES ($1, 'totalpass', $2)`,
        [classId, estado],
    );
}

export async function estadoMapping(db: PoolClient, classId: string): Promise<string | null> {
    return (await db.query(
        `SELECT sync_status FROM partner_class_mappings WHERE class_id = $1 AND channel = 'totalpass'`, [classId],
    )).rows[0]?.sync_status ?? null;
}
```

Crear `backend/scripts/test-clases-en-transaccion.ts`:

```ts
// Cancelar una clase, fijar el cupo de TotalPass y marcar retiro/resincronización
// pueden correr DENTRO de una transacción ajena (cambios en bloque): todo lo que
// escriben se ve en esa transacción y se revierte con ella. Sin `db` se comportan
// igual que siempre.
//
// Correr con: DATABASE_URL=postgresql://localhost:5432/casa_she npx tsx scripts/test-clases-en-transaccion.ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { pool } from '../src/config/database.js';
import { cancelClassWithRefunds } from '../src/lib/cancel-class.js';
import { setTotalpassCap } from '../src/lib/totalpass/caps.js';
import { marcarResyncTotalpass } from '../src/lib/totalpass/resync.js';
import { conTotalpass, crearAlumna, crearClase, estadoMapping, fechaEnDias, inscribir, prepararBase, publicada } from './fixtures/clases-tx.js';

// ── Cableado: los que llaman sin opciones no cambian ────────────────────────
const leer = (rel: string) => readFileSync(fileURLToPath(new URL(`../src/${rel}`, import.meta.url)), 'utf8');
for (const via of ['routes/closed-days.ts', 'routes/events.ts']) {
    assert.doesNotMatch(leer(via), /cancelClassWithRefunds\([^)]*\{\s*db/, `${via} sigue llamando sin opciones`);
}
console.log('  cableado: OK');

async function main() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN'); // todo vive en una transacción que se revierte
        const base = await prepararBase(client);
        const fecha = await fechaEnDias(client, 30);

        // ── 1. Cancelar dentro de la transacción, con avisos diferidos ──────────
        const clase = await crearClase(client, base, { fecha, hora: '05:10' });
        await publicada(client, clase);
        const alumna = await crearAlumna(client, base);
        const reserva = await inscribir(client, clase, alumna);
        const r = await cancelClassWithRefunds(clase, base.admin, 'Puente', { db: client, diferirAvisos: true });
        assert.equal(r.cancelledBookings, 1);
        assert.equal(r.refundedCredits, 1);
        assert.deepEqual(r.avisos.map((a) => a.userId), [alumna.userId], 'devuelve el aviso en vez de mandarlo');
        assert.equal(r.avisos[0].payload.tag, 'class_cancelled');
        const c = (await client.query(`SELECT status::text, cancellation_reason FROM classes WHERE id = $1`, [clase])).rows[0];
        assert.deepEqual(c, { status: 'cancelled', cancellation_reason: 'Puente' });
        const b = (await client.query(`SELECT status::text FROM bookings WHERE id = $1`, [reserva])).rows[0];
        assert.equal(b.status, 'cancelled');
        const m = (await client.query(`SELECT multi_remaining FROM memberships WHERE id = $1`, [alumna.membershipId])).rows[0];
        assert.equal(m.multi_remaining, 5, 'el crédito regresa');
        assert.equal(await estadoMapping(client, clase), 'pending_delete', 'el retiro se marca en la MISMA transacción');
        console.log('  cancelar en transacción: reserva, crédito, retiro y aviso diferido · OK');

        // Sin diferir: avisos vacíos (se mandan al momento, como siempre).
        const otra = await crearClase(client, base, { fecha, hora: '05:20' });
        const r2 = await cancelClassWithRefunds(otra, base.admin, 'x', { db: client });
        assert.deepEqual(r2.avisos, []);

        // ── 2. Cupo de TotalPass dentro de la transacción ──────────────────────
        const conCupo = await crearClase(client, base, { fecha, hora: '05:30' });
        await publicada(client, conCupo);
        await conTotalpass(client, base, conCupo, 3, 1);
        await assert.rejects(setTotalpassCap(conCupo, 0, client), (e: any) => e.code === 'CAP_BELOW_BOOKED');
        await assert.rejects(setTotalpassCap(conCupo, 8, client), (e: any) => e.code === 'CAP_EXCEEDS_CAPACITY');
        const guardado = await setTotalpassCap(conCupo, 2, client);
        assert.deepEqual({ ...guardado }, { max_spots: 2, booked_spots: 1 });

        const sinSocias = await crearClase(client, base, { fecha, hora: '05:40' });
        await publicada(client, sinSocias);
        await conTotalpass(client, base, sinSocias, 2, 0);
        await setTotalpassCap(sinSocias, 0, client);
        assert.equal(await estadoMapping(client, sinSocias), 'pending_delete', 'cupo 0 marca retiro');
        await setTotalpassCap(sinSocias, 2, client);
        assert.equal(await estadoMapping(client, sinSocias), 'published', 'volver a dar cupo desmarca el retiro');
        console.log('  cupo TotalPass en transacción: valida, retira y desmarca · OK');

        // ── 3. Resincronización dentro de la transacción ───────────────────────
        assert.equal(await marcarResyncTotalpass([sinSocias, otra], client), 1, 'solo las publicadas');
        assert.equal(await estadoMapping(client, sinSocias), 'pending_resync');
        console.log('  resync en transacción · OK');

        // ── 4. Cancelar una clase que esperaba resincronizarse: el retiro gana ──
        await cancelClassWithRefunds(sinSocias, base.admin, 'x', { db: client });
        assert.equal(await estadoMapping(client, sinSocias), 'pending_delete', "'pending_resync' + cancelada → se retira");
        console.log('  cancelar con resync pendiente marca retiro · OK');

        await client.query('ROLLBACK');
        console.log('test-clases-en-transaccion: OK');
    } catch (e) {
        await client.query('ROLLBACK').catch(() => { /* best-effort */ });
        throw e;
    } finally {
        client.release();
    }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e?.message || e); process.exit(1); });
```

- [ ] **Step 2: Correrla y ver que falla**

Run: `cd backend && DATABASE_URL=postgresql://localhost:5432/casa_she npx tsx scripts/test-clases-en-transaccion.ts`
Expected: FAIL en la sección 1 (`0 !== 1` en `cancelledBookings`): sin `db`, la cancelación corre en otra conexión que no ve la clase creada dentro de la transacción.

- [ ] **Step 3: `db-tx.ts`**

Crear `backend/src/lib/db-tx.ts`:

```ts
/**
 * Consultas que pueden correr dentro de una transacción ajena.
 *
 * Las funciones de soporte (cancelar una clase, fijar el cupo de TotalPass, marcar
 * retiro o resincronización) siempre usaron el pool. Los cambios en bloque
 * (POST /api/classes/bulk) necesitan correrlas dentro de UNA transacción para que
 * todo se aplique o nada: por eso aceptan un `db` opcional. Sin `db` se comportan
 * igual que siempre.
 */
import type { PoolClient } from 'pg';
import { query } from '../config/database.js';

/** Cliente con una transacción abierta (BEGIN … COMMIT/ROLLBACK). */
export type ClienteTx = PoolClient;

/** Corre la consulta en la transacción si viene `db`; si no, en el pool. Devuelve las filas. */
export async function filas<T = any>(db: ClienteTx | undefined, sql: string, params: unknown[] = []): Promise<T[]> {
    if (db) return (await db.query(sql, params as any[])).rows as T[];
    return query<T>(sql, params as any[]);
}
```

- [ ] **Step 4: Marcas de retiro con `db` (y el retiro gana sobre `pending_resync`)**

En `backend/src/lib/totalpass/retire.ts`:

a) Después de `import { query } from '../../config/database.js';` agregar:

```ts
import { filas, type ClienteTx } from '../db-tx.js';
```

b) Reemplazar la función `marcarRetiroTotalpass` completa y la última línea de su comentario. Cambiar:

```ts
 * Devuelve true si había algo publicado que retirar. Si la clase nunca se
 * publicó en TotalPass no hace nada (y devuelve false).
 */
export async function marcarRetiroTotalpass(classId: string): Promise<boolean> {
    const rows = await query<{ class_id: string }>(
        `UPDATE partner_class_mappings
            SET sync_status = 'pending_delete', updated_at = NOW()
          WHERE class_id = $1 AND channel = 'totalpass'
            AND sync_status IN ('published', 'pending_delete')
          RETURNING class_id`,
        [classId],
    ).catch((e: any) => {
```

por:

```ts
 * Devuelve true si había algo publicado que retirar. Si la clase nunca se
 * publicó en TotalPass no hace nada (y devuelve false).
 *
 * Una clase que esperaba resincronizarse ('pending_resync': la movieron o le
 * cambiaron coach) y luego se cancela también se retira: el barrido de resync
 * solo toma clases 'scheduled', así que sin esto quedaba viva en TotalPass.
 */
export async function marcarRetiroTotalpass(classId: string, db?: ClienteTx): Promise<boolean> {
    const marcar = filas<{ class_id: string }>(
        db,
        `UPDATE partner_class_mappings
            SET sync_status = 'pending_delete', updated_at = NOW()
          WHERE class_id = $1 AND channel = 'totalpass'
            AND sync_status IN ('published', 'pending_resync', 'pending_delete')
          RETURNING class_id`,
        [classId],
    );
    // Dentro de una transacción (`db`) el error se propaga: la transacción ya quedó
    // abortada y quien la abrió debe revertir TODO, no seguir como si nada.
    if (db) return (await marcar).length > 0;
    const rows = await marcar.catch((e: any) => {
```

(el resto de la función —el cuerpo del `catch` y `return rows.length > 0;`— se queda igual).

c) Cambiar:

```ts
export async function desmarcarRetiroTotalpass(classId: string): Promise<void> {
    await query(
        `UPDATE partner_class_mappings
            SET sync_status = 'published', sync_error = NULL, updated_at = NOW()
          WHERE class_id = $1 AND channel = 'totalpass' AND sync_status = 'pending_delete'`,
        [classId],
    ).catch((e: any) => console.error(`[tp-retire] no se pudo desmarcar el retiro de ${classId}:`, e?.message));
}
```

por:

```ts
export async function desmarcarRetiroTotalpass(classId: string, db?: ClienteTx): Promise<void> {
    const desmarcar = filas(
        db,
        `UPDATE partner_class_mappings
            SET sync_status = 'published', sync_error = NULL, updated_at = NOW()
          WHERE class_id = $1 AND channel = 'totalpass' AND sync_status = 'pending_delete'`,
        [classId],
    );
    if (db) { await desmarcar; return; } // en transacción, el error se propaga
    await desmarcar.catch((e: any) => console.error(`[tp-retire] no se pudo desmarcar el retiro de ${classId}:`, e?.message));
}
```

- [ ] **Step 5: Marca de resync con `db`**

En `backend/src/lib/totalpass/resync.ts`:

a) Después de `import { query } from '../../config/database.js';` agregar:

```ts
import { filas, type ClienteTx } from '../db-tx.js';
```

b) Cambiar:

```ts
export async function marcarResyncTotalpass(classIds: string[]): Promise<number> {
    if (!classIds.length) return 0;
    const rows = await query<{ class_id: string }>(
        `UPDATE partner_class_mappings
            SET sync_status = 'pending_resync', updated_at = NOW()
          WHERE channel = 'totalpass'
            AND class_id = ANY($1::uuid[])
            AND sync_status IN ('published', 'pending_resync')
          RETURNING class_id`,
        [classIds],
    ).catch((e: any) => {
```

por:

```ts
export async function marcarResyncTotalpass(classIds: string[], db?: ClienteTx): Promise<number> {
    if (!classIds.length) return 0;
    const marcar = filas<{ class_id: string }>(
        db,
        `UPDATE partner_class_mappings
            SET sync_status = 'pending_resync', updated_at = NOW()
          WHERE channel = 'totalpass'
            AND class_id = ANY($1::uuid[])
            AND sync_status IN ('published', 'pending_resync')
          RETURNING class_id`,
        [classIds],
    );
    // Dentro de una transacción (`db`) el error se propaga para que se revierta todo.
    if (db) return (await marcar).length;
    const rows = await marcar.catch((e: any) => {
```

(el resto de la función se queda igual).

- [ ] **Step 6: `setTotalpassCap` con `db`**

En `backend/src/lib/totalpass/caps.ts`:

a) Cambiar la primera línea `import { query, queryOne } from '../../config/database.js';` por:

```ts
import { queryOne } from '../../config/database.js';
import { filas, type ClienteTx } from '../db-tx.js';
```

b) Reemplazar desde `// Fija (o apaga con 0) el cupo TotalPass de una clase. UPSERT sobre channel_inventory.` hasta el final del archivo por:

```ts
// Fija (o apaga con 0) el cupo TotalPass de una clase. UPSERT sobre channel_inventory.
// Con `db` corre dentro de esa transacción (cambios en bloque); sin `db`, en el pool.
export async function setTotalpassCap(classId: string, maxSpots: number, db?: ClienteTx): Promise<{ max_spots: number; booked_spots: number }> {
  const [cls] = await filas<{ max_capacity: number }>(db,
    `SELECT max_capacity FROM classes WHERE id = $1`, [classId]);
  if (!cls) throw Object.assign(new Error('Clase no encontrada'), { code: 'CLASS_NOT_FOUND' });
  const [inv] = await filas<{ booked_spots: number }>(db,
    `SELECT booked_spots FROM channel_inventory WHERE class_id = $1 AND channel = 'totalpass'`, [classId]);
  const booked = inv ? Number(inv.booked_spots) : 0;
  const err = validateCap(maxSpots, booked, Number(cls.max_capacity));
  if (err) throw Object.assign(new Error(err), { code: err, booked });
  if (maxSpots === 0) {
    // Apagar el canal: borra la fila solo si no hay reservas activas (booked_spots = 0).
    await filas(db, `DELETE FROM channel_inventory WHERE class_id = $1 AND channel = 'totalpass' AND booked_spots = 0`, [classId]);
    // …y RETIRAR la clase de TotalPass. Sin esto quedaba fantasma: el reconcile de
    // cupo hace JOIN con `max_spots > 0`, así que al borrar la fila dejaba de tocar
    // esa clase y el evento se quedaba vivo en TP con su cupo viejo, para siempre.
    await marcarRetiroTotalpass(classId, db);
    return { max_spots: 0, booked_spots: booked };
  }
  const [saved] = await filas<{ max_spots: number; booked_spots: number }>(db,
    `INSERT INTO channel_inventory (class_id, channel, max_spots) VALUES ($1, 'totalpass', $2)
     ON CONFLICT (class_id, channel) DO UPDATE SET max_spots = EXCLUDED.max_spots, updated_at = NOW()
     RETURNING max_spots, booked_spots`, [classId, maxSpots]);
  // Volver a prender el canal cancela un retiro pendiente: si el barrido todavía no
  // corría, dejarlo en 'pending_delete' haría que el publicador creara un evento
  // NUEVO (busca mappings 'published') mientras el barrido borra el viejo.
  await desmarcarRetiroTotalpass(classId, db);
  return saved!;
}
```

- [ ] **Step 7: `cancelClassWithRefunds` con `db` y avisos diferidos**

Reemplazar `backend/src/lib/cancel-class.ts` completo por:

```ts
import { sendWebPushToUser, type WebPushPayload } from './web-push.js';
import { marcarRetiroTotalpass } from './totalpass/retire.js';
import { filas, type ClienteTx } from './db-tx.js';

/** Aviso push a una alumna que todavía no se manda (cancelación dentro de un lote). */
export interface AvisoCancelacion {
    userId: string;
    payload: WebPushPayload;
}

export interface OpcionesCancelacion {
    /** Correr dentro de esta transacción (cambios en bloque). Sin `db` usa el pool, como siempre. */
    db?: ClienteTx;
    /** No mandar los avisos: devolverlos en `avisos` para mandarlos después del COMMIT. */
    diferirAvisos?: boolean;
}

/** El aviso que recibe cada alumna cuando el estudio cancela su clase. */
export function avisoDeClaseCancelada(userId: string): AvisoCancelacion {
    return {
        userId,
        payload: { title: 'Clase cancelada', body: 'El estudio canceló una de tus clases. Revisa tus reservas.', url: '/app/classes', tag: 'class_cancelled' },
    };
}

/**
 * Cancel a class and all its active bookings, refunding membership credits.
 * Reusable across: manual cancel, event overlap cancel, closed-day cancel, bulk cancel.
 *
 * Sin `opts` se comporta como siempre: pool, avisos al momento y errores secundarios
 * (barra, beneficio) solo se registran. Con `opts.db` todo corre en esa transacción y
 * cualquier error se propaga para que quien la abrió revierta TODO.
 */
export async function cancelClassWithRefunds(
    classId: string,
    cancelledBy: string,
    reason: string,
    opts: OpcionesCancelacion = {},
): Promise<{ class: any; cancelledBookings: number; refundedCredits: number; avisos: AvisoCancelacion[] }> {
    const { db, diferirAvisos = false } = opts;
    const avisos: AvisoCancelacion[] = [];

    // Cancel the class
    const [result] = await filas(
        db,
        `UPDATE classes
         SET status = 'cancelled',
             cancelled_at = NOW(),
             cancelled_by = $1,
             cancellation_reason = $2
         WHERE id = $3 RETURNING *`,
        [cancelledBy, reason, classId]
    );

    if (!result) {
        return { class: null, cancelledBookings: 0, refundedCredits: 0, avisos };
    }

    // Marcar el retiro de TotalPass. Solo BD (sin red): esta función se llama en
    // bucle al cerrar un día completo o cancelar una serie, y una llamada a la API
    // de TP por clase colgaría la petición del admin. El barrido
    // (`retirarClasesPendientesDeTotalpass`) hace el trabajo con red enseguida y por
    // cron. Sin esta línea la clase seguía viva y reservable en la app de TotalPass:
    // la socia reservaba una clase cancelada y llegaba al estudio sin que nadie supiera.
    await marcarRetiroTotalpass(classId, db);

    // Get all active bookings for this class
    const bookingsToCancel = await filas(
        db,
        `SELECT b.*, m.id as membership_id
         FROM bookings b
         LEFT JOIN memberships m ON b.membership_id = m.id
         WHERE b.class_id = $1 AND b.status IN ('confirmed', 'waitlist')`,
        [classId]
    );

    let cancelledBookings = 0;
    let refundedCredits = 0;

    for (const booking of bookingsToCancel) {
        await filas(
            db,
            `UPDATE bookings
             SET status = 'cancelled',
                 cancelled_at = NOW(),
                 cancellation_reason = $1
             WHERE id = $2`,
            [reason, booking.id]
        );
        cancelledBookings++;

        // Cascada barra: cancela bebidas pre-ordenadas de esta reserva.
        const barra = filas(
            db,
            `UPDATE bar_orders SET status='cancelled', cancelled_by='system_class_cancelled', cancelled_at=NOW(), updated_at=NOW()
             WHERE booking_id = $1 AND status = 'pending'`,
            [booking.id]);
        if (db) await barra;
        else await barra.catch((e: any) => console.error('bar cascade (cancel class):', e?.message));

        // Aviso push al usuario afectado (fire-and-forget; nunca rompe el flujo).
        // En un lote se devuelve y se manda después del COMMIT.
        if (booking.user_id) {
            const aviso = avisoDeClaseCancelada(booking.user_id);
            if (diferirAvisos) avisos.push(aviso);
            else void sendWebPushToUser(aviso.userId, aviso.payload);
        }

        // Refund credit to the bucket the booking consumed
        if (booking.status === 'confirmed' && booking.membership_id && booking.consumed_category) {
            const col = booking.consumed_category === 'reformer' ? 'reformer_remaining' : 'multi_remaining';
            await filas(
                db,
                `UPDATE memberships SET ${col} = ${col} + 1 WHERE id = $1 AND ${col} IS NOT NULL`,
                [booking.membership_id]
            );
            refundedCredits++;
        }

        // Reactiva el beneficio de lealtad (clase gratis pagada con puntos) si esta reserva
        // lo consumió. Sin esto, cancelar la CLASE completa (admin, solape de evento, día
        // inhábil) hacía perder el beneficio para siempre — no había camino de vuelta a
        // 'active'. No reactiva si ya venció (se perdió por vigencia, no por esta cancelación).
        if (booking.is_free_booking) {
            const beneficio = filas(
                db,
                `UPDATE user_benefits
                    SET status = 'active', used_at = NULL, used_by = NULL, used_on_booking_id = NULL
                  WHERE used_on_booking_id = $1 AND status = 'used' AND expires_at > NOW()`,
                [booking.id]
            );
            if (db) await beneficio;
            else await beneficio.catch((e: any) => console.error('reactivar free_class benefit (cancel class):', e?.message));
        }
    }

    return { class: result, cancelledBookings, refundedCredits, avisos };
}
```

- [ ] **Step 8: Correr la prueba y las que tocan lo mismo**

Run:

```bash
cd backend && npx tsc --noEmit && echo "tsc ok"
for t in test-clases-en-transaccion test-totalpass-cableado test-totalpass-caps test-totalpass-retire test-totalpass-resync; do
  DATABASE_URL=postgresql://localhost:5432/casa_she npx tsx scripts/$t.ts >/tmp/$t.log 2>&1; echo "$t: $?"
done
grep -h ": OK" /tmp/test-clases-en-transaccion.log /tmp/test-totalpass-cableado.log
```

Expected: `tsc ok`; las cinco con `: 0` (cada una tarda ~30 s en salir porque el pool queda abierto); el `grep` imprime `  cableado: OK`, `test-clases-en-transaccion: OK` y `test-totalpass-cableado: OK`.

- [ ] **Step 9: Agregarla a `npm test`**

En `backend/package.json`, dentro del script `"test"`, cambiar `tsx scripts/test-class-type-capacity.ts"` por:

```
tsx scripts/test-class-type-capacity.ts && tsx scripts/test-clases-en-transaccion.ts"
```

- [ ] **Step 10: Commit**

```bash
git add backend/src/lib/db-tx.ts backend/src/lib/cancel-class.ts backend/src/lib/totalpass/caps.ts backend/src/lib/totalpass/retire.ts backend/src/lib/totalpass/resync.ts backend/scripts/fixtures/clases-tx.ts backend/scripts/test-clases-en-transaccion.ts backend/package.json
git commit -m "refactor(clases): cancelar y cupo TotalPass dentro de una transacción ajena

cancelClassWithRefunds acepta opts.db y opts.diferirAvisos; setTotalpassCap
y las marcas de retiro/resync aceptan un db opcional. Sin opciones todo se
comporta igual que antes. Además, cancelar una clase que esperaba
resincronizarse ahora sí la marca para retirarse de TotalPass.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `POST /api/classes/bulk` — vista previa y bloqueos

**Tipo:** código completo, se transcribe. Toca la base local (dentro de `BEGIN … ROLLBACK`).

**Files:**
- Create: `backend/src/lib/classes-bulk.ts`
- Modify: `backend/src/routes/classes.ts` (imports ~L25; ruta nueva antes de `router.post('/bulk-delete', …)` ~L287)
- Modify: `backend/package.json` (script `test`)
- Test: `backend/scripts/test-classes-bulk.ts`

**Interfaces:**
- Consumes (Task 1): `ClienteTx` de `backend/src/lib/db-tx.ts`; los datos de prueba de `backend/scripts/fixtures/clases-tx.ts` (`prepararBase`, `fechaEnDias`, `crearClase`, `crearAlumna`, `inscribir`, `conTotalpass`, `publicada`, `estadoMapping`).
- Produces (en `backend/src/lib/classes-bulk.ts`): `LoteSchema` (zod del cuerpo), `type EntradaLote`, `type AccionLote = 'coach' | 'cupo_canal' | 'mover' | 'cancelar'`, `interface ActorLote { userId: string; sucursalPermitida: string | null }`, `interface ClaseDelLote`, `interface RespuestaLote`, `interface TrasCommitLote { avisosCancelacion; avisosAlumnas: AvisoAlumnaLote[]; correosCoach: CorreoCoachLote[]; retiro: boolean; resync: boolean; antes: Array<{ id; instructor_id; class_type_id; inicio; fin; status }> }`, `class ErrorLote extends Error { status: number }`, `procesarLote(db: ClienteTx, e: EntradaLote, actor: ActorLote, ahora?: Date): Promise<{ respuesta: RespuestaLote; trasCommit: TrasCommitLote }>`, `fechaLarga('2026-11-04') → 'miércoles 4 de noviembre'`, `horaLegible('08:00') → '8:00'`, `ADVERTENCIA_TOTALPASS = 'TotalPass no republica con menos de 4.5 h'`.
- Produces (API): `POST /api/classes/bulk` con `vistaPrevia: true` → 200 y la respuesta del spec, sin escribir; con `vistaPrevia: false` y alguna bloqueada → 409 con la misma respuesta y sin cambios. Con `vistaPrevia: false` y ninguna bloqueada responde 501 hasta la Task 3 (el frontend todavía no lo llama).

Reglas que implementa `procesarLote` (bloqueos, en este orden; el `motivo` es el texto exacto):

| Caso | `motivo` |
| --- | --- |
| el id no existe | `Esta clase ya no existe.` |
| `status = 'cancelled'` | `Ya está cancelada.` |
| recepción con sucursal asignada y la clase es de otra | `Es de otra sucursal.` |
| fin ≤ ahora (CDMX) | `Ya pasó.` |
| inicio ≤ ahora (CDMX) | `Ya empezó.` |
| coach: la coach nueva tiene otra clase activa que se encima (cualquier sucursal, fuera de la selección) | `<Coach> ya tiene <Tipo> a las <H:MM>.` |
| coach: otra clase seleccionada del mismo día se encima | `Se encima con <Tipo> de las <H:MM>, también seleccionada.` |
| cupo_canal: `lugares` < socias del canal | `Tiene N socia(s) inscrita(s): no puede bajar de N.` |
| cupo_canal: `lugares` > cupo de la clase | `La clase tiene N lugares: no caben M.` |
| mover: la hora nueva sale de 05:00–23:00 (incluye cruzar de día) | `Quedaría de H:MM a H:MM, fuera del horario (5:00 a 23:00).` |
| mover: con `minutos ≠ 0`, la hora nueva ya pasó | `La hora nueva ya pasó.` |
| mover: con `minutos ≠ 0`, la coach de la clase tiene otra clase activa que se encima a la hora nueva | `<Coach> ya tiene <Tipo> a las <H:MM>.` |
| mover: el tipo nuevo es de otra bolsa (Salsa ↔ Clases) y hay alumnas de la app inscritas | `Tiene N alumna(s) con créditos de Clases: no puede volverse Salsa.` |
| mover: el cupo no cabe en la categoría del tipo nuevo | el texto de `capacityError` |

`alumnasAvisadas` = inscritas de la app (`bookings.channel = 'app'`, confirmadas o en espera) que reciben aviso: coach (si la coach cambia), mover y cancelar; cupo nunca. `sociasPorCanal` = `booked_spots` de cada fila de `channel_inventory`. `sociasPierdenLugar` = socias de TotalPass solo al mover con `minutos ≠ 0` una clase publicada (mapping `published` o `pending_resync`); si además la hora nueva empieza en menos de 5 h, `advertencias: ['TotalPass no republica con menos de 4.5 h']`. Coach igual a la actual: `ok` con la advertencia `Ya la da <Coach>`. `resumen` suma solo las `ok`; `clases` va ordenado por fecha y hora. Coach o tipo inexistente → `ErrorLote(404)`; coach inactiva → `ErrorLote(400)`.

- [ ] **Step 1: Escribir la prueba que falla**

Crear `backend/scripts/test-classes-bulk.ts`:

```ts
// POST /api/classes/bulk: la vista previa no escribe nada; cada acción bloquea lo que
// debe; aplicar con alguna bloqueada no toca nada; aplicar escribe todo en la MISMA
// transacción (o nada si algo falla a la mitad).
// Corre contra la base LOCAL dentro de una transacción que se revierte.
//
// Correr con: DATABASE_URL=postgresql://localhost:5432/casa_she npx tsx scripts/test-classes-bulk.ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { pool } from '../src/config/database.js';
import { ADVERTENCIA_TOTALPASS, ErrorLote, LoteSchema, fechaLarga, procesarLote, type EntradaLote } from '../src/lib/classes-bulk.js';
import { localDateTimeUtc } from '../src/lib/mx-time.js';
import { conTotalpass, crearAlumna, crearClase, estadoMapping, fechaEnDias, inscribir, prepararBase, publicada } from './fixtures/clases-tx.js';

// ── Cuerpo (zod) ─────────────────────────────────────────────────────────────
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const valido = (cuerpo: Record<string, unknown>) => LoteSchema.safeParse({ classIds: [uuid(1)], vistaPrevia: true, ...cuerpo }).success;
assert.ok(valido({ accion: 'cancelar' }));
assert.ok(valido({ accion: 'cancelar', motivo: 'x'.repeat(200) }));
assert.ok(!valido({ accion: 'cancelar', motivo: 'x'.repeat(201) }), 'motivo hasta 200');
assert.ok(!valido({ accion: 'cancelar', classIds: [uuid(1), uuid(1)] }), 'sin repetidos');
assert.ok(!valido({ accion: 'cancelar', classIds: [] }), 'al menos una');
assert.ok(!valido({ accion: 'cancelar', classIds: Array.from({ length: 201 }, (_, i) => uuid(i + 1)) }), 'máximo 200');
assert.ok(valido({ accion: 'cancelar', classIds: Array.from({ length: 200 }, (_, i) => uuid(i + 1)) }));
assert.ok(!valido({ accion: 'coach' }), 'coach exige instructorId');
assert.ok(valido({ accion: 'coach', instructorId: uuid(9) }));
assert.ok(!valido({ accion: 'cupo_canal', canal: 'totalpass' }), 'cupo exige lugares');
assert.ok(!valido({ accion: 'cupo_canal', canal: 'fitpass', lugares: 2 }), 'solo canales conectados');
assert.ok(!valido({ accion: 'cupo_canal', canal: 'totalpass', lugares: -1 }));
assert.ok(valido({ accion: 'cupo_canal', canal: 'totalpass', lugares: 0 }));
assert.ok(!valido({ accion: 'mover' }), 'mover exige minutos o tipo');
assert.ok(!valido({ accion: 'mover', minutos: 0 }), 'mover 0 sin tipo no hace nada');
assert.ok(!valido({ accion: 'mover', minutos: 10 }), 'múltiplo de 15');
assert.ok(!valido({ accion: 'mover', minutos: 195 }), 'máximo 180');
assert.ok(valido({ accion: 'mover', minutos: -180 }));
assert.ok(valido({ accion: 'mover', minutos: 0, classTypeId: uuid(7) }));
assert.equal(fechaLarga('2026-11-04'), 'miércoles 4 de noviembre');
console.log('  cuerpo: OK');

// ── Cableado de la ruta ──────────────────────────────────────────────────────
const ruta = readFileSync(fileURLToPath(new URL('../src/routes/classes.ts', import.meta.url)), 'utf8');
const inicioBulk = ruta.indexOf("router.post('/bulk',");
assert.ok(inicioBulk >= 0, 'existe POST /bulk');
const bulk = ruta.slice(inicioBulk, ruta.indexOf('\n});\n', inicioBulk));
assert.match(bulk, /authenticate, requireElevated/, 'solo staff elevado');
assert.match(bulk, /BEGIN[\s\S]*procesarLote\(client[\s\S]*COMMIT/, 'todo en una transacción');
assert.match(bulk, /status\(entrada\.vistaPrevia \? 200 : 409\)/, 'aplicar con bloqueadas → 409');
console.log('  cableado: OK');

async function main() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN'); // todo vive en una transacción que se revierte
        const base = await prepararBase(client);
        const fecha = await fechaEnDias(client, 30);
        const admin = { userId: base.admin, sucursalPermitida: null };
        const lote = (e: Partial<EntradaLote> & Pick<EntradaLote, 'classIds' | 'accion'>, actor = admin, ahora?: Date) =>
            procesarLote(client, { vistaPrevia: true, ...e }, actor, ahora);
        const porId = (r: Awaited<ReturnType<typeof lote>>, id: string) => r.respuesta.clases.find((c) => c.classId === id)!;
        const fila = async (id: string) => (await client.query(
            `SELECT status::text, instructor_id, class_type_id, to_char(start_time, 'HH24:MI') AS inicio, to_char(end_time, 'HH24:MI') AS fin
               FROM classes WHERE id = $1`, [id])).rows[0];

        // Barre 7:00 con 1 alumna (app) y 1 socia de TotalPass, publicada en TotalPass.
        const siete = await crearClase(client, base, { fecha, hora: '07:00' });
        const alumna = await crearAlumna(client, base);
        const reserva = await inscribir(client, siete, alumna);
        await conTotalpass(client, base, siete, 2, 1);
        await publicada(client, siete);
        // 8:00 vacía.
        const ocho = await crearClase(client, base, { fecha, hora: '08:00' });

        // ── 1. La vista previa cuenta y no escribe nada ──────────────────────
        const previa = await lote({ classIds: [ocho, siete], accion: 'cancelar' });
        assert.equal(previa.respuesta.aplicado, false);
        assert.deepEqual(previa.respuesta.clases.map((c) => c.classId), [siete, ocho], 'ordenadas por hora');
        assert.deepEqual(porId(previa, siete), {
            classId: siete, estado: 'ok', alumnasAvisadas: 1, sociasPorCanal: { totalpass: 1 }, sociasPierdenLugar: 0, advertencias: [],
        });
        assert.deepEqual(previa.respuesta.resumen, { ok: 2, bloqueadas: 0, alumnasAvisadas: 1, sociasPierdenLugar: 0 });
        assert.equal((await fila(siete)).status, 'scheduled');
        assert.equal((await client.query(`SELECT status::text FROM bookings WHERE id = $1`, [reserva])).rows[0].status, 'confirmed');
        assert.equal(await estadoMapping(client, siete), 'published');
        assert.equal((await client.query(`SELECT multi_remaining FROM memberships WHERE id = $1`, [alumna.membershipId])).rows[0].multi_remaining, 4);
        console.log('  vista previa: cuenta y no escribe · OK');

        // ── 2. Reglas comunes ────────────────────────────────────────────────
        const cancelada = await crearClase(client, base, { fecha, hora: '09:00' });
        await client.query(`UPDATE classes SET status = 'cancelled' WHERE id = $1`, [cancelada]);
        const otraSucursal = (await client.query(
            `INSERT INTO facilities (name) VALUES ('Sucursal de prueba ' || gen_random_uuid()) RETURNING id`)).rows[0].id as string;
        const lejos = await crearClase(client, base, { fecha, hora: '10:00', sucursal: otraSucursal });
        const noExiste = '00000000-0000-4000-8000-00000000dead';
        const comunes = await lote({ classIds: [cancelada, lejos, noExiste, ocho], accion: 'cancelar' }, { userId: base.admin, sucursalPermitida: base.sucursal });
        assert.equal(porId(comunes, cancelada).motivo, 'Ya está cancelada.');
        assert.equal(porId(comunes, lejos).motivo, 'Es de otra sucursal.');
        assert.equal(porId(comunes, noExiste).motivo, 'Esta clase ya no existe.');
        assert.equal(porId(comunes, ocho).estado, 'ok');
        assert.equal(porId(comunes, lejos).alumnasAvisadas, 0);
        assert.equal((await lote({ classIds: [lejos], accion: 'cancelar' })).respuesta.resumen.ok, 1, 'admin ve todas las sucursales');
        const empezada = await lote({ classIds: [ocho], accion: 'cancelar' }, admin, localDateTimeUtc(fecha, '08:10'));
        assert.equal(porId(empezada, ocho).motivo, 'Ya empezó.');
        const pasada = await lote({ classIds: [ocho], accion: 'cancelar' }, admin, localDateTimeUtc(fecha, '09:00'));
        assert.equal(porId(pasada, ocho).motivo, 'Ya pasó.');
        console.log('  reglas comunes: cancelada, otra sucursal, no existe, empezó, pasó · OK');

        // ── 3. coach ────────────────────────────────────────────────────────
        // coachB ya da una clase a las 6:30 en OTRA sucursal: se encima con la de 7:00, no con la de 8:00.
        await crearClase(client, base, { fecha, hora: '06:30', coach: base.coachB, sucursal: otraSucursal });
        const coach = await lote({ classIds: [siete, ocho], accion: 'coach', instructorId: base.coachB });
        assert.match(porId(coach, siete).motivo!, /ya tiene .* a las 6:30\./);
        assert.equal(porId(coach, ocho).estado, 'ok');
        const encimadas = await crearClase(client, base, { fecha, hora: '08:30', tipo: base.multi2 });
        const juntas = await lote({ classIds: [ocho, encimadas], accion: 'coach', instructorId: base.coachB });
        assert.match(porId(juntas, ocho).motivo!, /también seleccionada/);
        const misma = await lote({ classIds: [ocho], accion: 'coach', instructorId: base.coachA });
        assert.equal(porId(misma, ocho).estado, 'ok');
        assert.equal(porId(misma, ocho).advertencias.length, 1, 'ya la da esa coach');
        await assert.rejects(lote({ classIds: [ocho], accion: 'coach', instructorId: uuid(404) }), (e: unknown) => e instanceof ErrorLote && e.status === 404);
        console.log('  coach: choque en otra sucursal y dentro de la selección · OK');

        // ── 4. cupo_canal ───────────────────────────────────────────────────
        const cupo = (lugares: number) => lote({ classIds: [siete, ocho], accion: 'cupo_canal', canal: 'totalpass', lugares });
        assert.match(porId(await cupo(0), siete).motivo!, /1 socia inscrita: no puede bajar de 1/);
        assert.equal(porId(await cupo(0), ocho).estado, 'ok');
        assert.match(porId(await cupo(8), ocho).motivo!, /La clase tiene 7 lugares/);
        assert.equal((await cupo(3)).respuesta.resumen.bloqueadas, 0);
        console.log('  cupo_canal: no baja de las socias ni pasa del cupo · OK');

        // ── 5. mover ────────────────────────────────────────────────────────
        const temprano = await crearClase(client, base, { fecha, hora: '05:10' });
        assert.match(porId(await lote({ classIds: [temprano], accion: 'mover', minutos: -15 }), temprano).motivo!, /fuera del horario/);
        const noche = await crearClase(client, base, { fecha, hora: '22:00', minutos: 60 });
        assert.match(porId(await lote({ classIds: [noche], accion: 'mover', minutos: 15 }), noche).motivo!, /fuera del horario/);
        // Una de coachB a las 5:00 movida +1 h choca con su clase de las 6:30 en la otra sucursal.
        const deB = await crearClase(client, base, { fecha, hora: '05:00', coach: base.coachB });
        assert.match(porId(await lote({ classIds: [deB], accion: 'mover', minutos: 60 }), deB).motivo!, /ya tiene .* a las 6:30/);
        assert.equal(porId(await lote({ classIds: [deB], accion: 'mover', minutos: 150 }), deB).estado, 'ok', 'a las 7:30 ya no choca');
        // Mover la 7:00 publicada a las 6:00: la socia pierde su lugar; y si faltan menos de 5 h, advertencia.
        // (+1 h no se puede: coachA ya da la de las 8:00.)
        assert.match(porId(await lote({ classIds: [siete], accion: 'mover', minutos: 60 }), siete).motivo!, /ya tiene .* a las 8:00/);
        const mover = await lote({ classIds: [siete], accion: 'mover', minutos: -60 });
        assert.equal(porId(mover, siete).estado, 'ok');
        assert.equal(porId(mover, siete).sociasPierdenLugar, 1);
        assert.equal(porId(mover, siete).alumnasAvisadas, 1);
        assert.deepEqual(porId(mover, siete).advertencias, []);
        const prisa = await lote({ classIds: [siete], accion: 'mover', minutos: -60 }, admin, localDateTimeUtc(fecha, '04:30'));
        assert.deepEqual(porId(prisa, siete).advertencias, [ADVERTENCIA_TOTALPASS]);
        // Solo el tipo: TotalPass edita, nadie pierde lugar.
        assert.equal(porId(await lote({ classIds: [siete], accion: 'mover', minutos: 0, classTypeId: base.multi2 }), siete).sociasPierdenLugar, 0);
        // Cambiar de bolsa con alumnas inscritas: bloqueada. Sin alumnas: pasa (si cabe).
        assert.match(porId(await lote({ classIds: [siete], accion: 'mover', classTypeId: base.reformer }), siete).motivo!, /créditos de Clases: no puede volverse Salsa/);
        assert.equal(porId(await lote({ classIds: [ocho], accion: 'mover', classTypeId: base.reformer }), ocho).estado, 'ok');
        const grande = await crearClase(client, base, { fecha, hora: '12:00', cupo: 10 });
        assert.match(porId(await lote({ classIds: [grande], accion: 'mover', classTypeId: base.reformer }), grande).motivo!, /no puede exceder 8/);
        await assert.rejects(lote({ classIds: [ocho], accion: 'mover', classTypeId: uuid(405) }), (e: unknown) => e instanceof ErrorLote && e.status === 404);
        console.log('  mover: horario, coach, bolsa, cupo, socias que pierden lugar y advertencia · OK');

        // ── 6. Aplicar con una bloqueada: no toca nada ───────────────────────
        const conBloqueada = await procesarLote(client, { classIds: [ocho, cancelada], accion: 'cancelar', vistaPrevia: false }, admin);
        assert.equal(conBloqueada.respuesta.aplicado, false, 'la ruta responde 409 con esta respuesta');
        assert.equal(conBloqueada.respuesta.resumen.bloqueadas, 1);
        assert.equal((await fila(ocho)).status, 'scheduled', 'la que estaba bien tampoco se toca');
        assert.deepEqual(conBloqueada.trasCommit.avisosCancelacion, []);
        console.log('  aplicar con una bloqueada: nada cambia · OK');

        await client.query('ROLLBACK');
        console.log('test-classes-bulk: OK');
    } catch (e) {
        await client.query('ROLLBACK').catch(() => { /* best-effort */ });
        throw e;
    } finally {
        client.release();
    }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e?.message || e); process.exit(1); });
```

- [ ] **Step 2: Correrla y ver que falla**

Run: `cd backend && DATABASE_URL=postgresql://localhost:5432/casa_she npx tsx scripts/test-classes-bulk.ts`
Expected: FAIL con `Cannot find module '../src/lib/classes-bulk.js'`.

- [ ] **Step 3: El lote (evaluación)**

Crear `backend/src/lib/classes-bulk.ts`:

```ts
/**
 * Cambios en bloque del calendario (POST /api/classes/bulk): cambiar coach, cupo de
 * TotalPass, mover la hora o cambiar el tipo, y cancelar, sobre varias clases a la vez.
 *
 * Una sola función, `procesarLote`, evalúa cada clase (vista previa) y, si se pidió
 * aplicar y ninguna está bloqueada, aplica TODO con el cliente de la transacción que
 * abrió la ruta. Lo que sale del sistema (avisos, correos, barridos de TotalPass) no se
 * hace aquí: se devuelve en `trasCommit` para hacerlo una sola vez después del COMMIT.
 */
import { z } from 'zod';
import type { ClienteTx } from './db-tx.js';
import { localDateTimeUtc } from './mx-time.js';
import { capacityError } from './schedule.js';

// ── Entrada ──────────────────────────────────────────────────────────────────

export const ACCIONES_LOTE = ['coach', 'cupo_canal', 'mover', 'cancelar'] as const;
export type AccionLote = (typeof ACCIONES_LOTE)[number];

export const LoteSchema = z.object({
    classIds: z.array(z.string().uuid()).min(1, 'Elige al menos una clase').max(200, 'Máximo 200 clases a la vez')
        .refine((ids) => new Set(ids).size === ids.length, 'Hay clases repetidas'),
    accion: z.enum(ACCIONES_LOTE),
    vistaPrevia: z.boolean(),
    instructorId: z.string().uuid().optional(),
    canal: z.literal('totalpass').optional(),
    lugares: z.number().int().min(0).optional(),
    minutos: z.number().int().min(-180).max(180).refine((m) => m % 15 === 0, 'Múltiplo de 15 minutos').optional(),
    classTypeId: z.string().uuid().optional(),
    motivo: z.string().trim().max(200).optional(),
}).superRefine((d, ctx) => {
    const falta = (path: string, message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
    if (d.accion === 'coach' && !d.instructorId) falta('instructorId', 'Elige la coach');
    if (d.accion === 'cupo_canal' && !d.canal) falta('canal', 'Elige la plataforma');
    if (d.accion === 'cupo_canal' && d.lugares === undefined) falta('lugares', 'Indica cuántos lugares');
    if (d.accion === 'mover' && !d.classTypeId && !d.minutos) falta('minutos', 'Mueve la hora o elige otro tipo de clase');
});

export type EntradaLote = z.infer<typeof LoteSchema>;

/** Quién pide el cambio. `sucursalPermitida` = null: todas (admin, o recepción sin sucursal asignada). */
export interface ActorLote {
    userId: string;
    sucursalPermitida: string | null;
}

// ── Salida ───────────────────────────────────────────────────────────────────

export interface ClaseDelLote {
    classId: string;
    estado: 'ok' | 'bloqueada';
    /** Por qué está bloqueada, en español para recepción. */
    motivo?: string;
    /** Inscritas de Casa Shé (app) que reciben aviso. */
    alumnasAvisadas: number;
    sociasPorCanal: Record<string, number>;
    /** Solo mover con minutos ≠ 0 en una clase publicada en TotalPass. */
    sociasPierdenLugar: number;
    advertencias: string[];
}

export interface RespuestaLote {
    clases: ClaseDelLote[];
    resumen: { ok: number; bloqueadas: number; alumnasAvisadas: number; sociasPierdenLugar: number };
    aplicado: boolean;
}

/** Aviso in-app (+ push) a una alumna, para mandar después del COMMIT. */
export interface AvisoAlumnaLote {
    userId: string;
    title: string;
    body: string;
    type: 'class_updated';
    data: { classId: string };
}

/** Correo a la coach nueva de una clase, para mandar después del COMMIT. */
export interface CorreoCoachLote {
    instructorId: string;
    className: string;
    classDate: string;
    startTime: string;
    endTime: string;
    capacity: number;
}

/** Lo que sale del sistema: se hace una sola vez, después del COMMIT. */
export interface TrasCommitLote {
    avisosCancelacion: Array<{ userId: string; payload: { title: string; body: string; url?: string; tag?: string } }>;
    avisosAlumnas: AvisoAlumnaLote[];
    correosCoach: CorreoCoachLote[];
    /** Hay clases marcadas para retirarse de TotalPass: disparar el barrido. */
    retiro: boolean;
    /** Hay clases marcadas para resincronizar con TotalPass: disparar el barrido. */
    resync: boolean;
    /** Cómo estaban las clases antes del cambio (para la auditoría). */
    antes: Array<{ id: string; instructor_id: string; class_type_id: string; inicio: string; fin: string; status: string }>;
}

export interface ResultadoLote {
    respuesta: RespuestaLote;
    trasCommit: TrasCommitLote;
}

/** Error de la petición (coach o tipo inexistente…): la ruta lo responde con `status`. */
export class ErrorLote extends Error {
    constructor(public status: number, message: string) {
        super(message);
    }
}

// ── Contexto: lo que se lee de la base ───────────────────────────────────────

interface FilaClase {
    id: string;
    fecha: string;       // YYYY-MM-DD
    inicio: string;      // HH:MM
    fin: string;         // HH:MM
    status: string;
    facility_id: string | null;
    instructor_id: string;
    coach: string;
    class_type_id: string;
    tipo: string;
    categoria: string;   // 'reformer' (Salsa) | 'multi' (Clases)
    max_capacity: number;
}

interface OtraClase {
    id: string;
    instructor_id: string;
    fecha: string;
    inicio: string;
    fin: string;
    tipo: string;
}

interface ContextoLote {
    clases: Map<string, FilaClase>;
    /** Reservas de cada canal: { totalpass: 2 }. */
    canales: Map<string, Record<string, number>>;
    /** user_id de las inscritas de la app (confirmadas y en espera), sin repetir. */
    alumnas: Map<string, string[]>;
    /** Publicada en TotalPass (mapping 'published' o 'pending_resync'). */
    publicadas: Set<string>;
    coachNueva: { id: string; nombre: string } | null;
    tipoNuevo: { id: string; nombre: string; categoria: string } | null;
    /** Clases activas fuera de la selección de las coaches involucradas, en las fechas de la selección. */
    otras: OtraClase[];
}

const HORA_APERTURA = 5 * 60;
const HORA_CIERRE = 23 * 60;
const HORAS_AVISO_TOTALPASS = 5;
export const ADVERTENCIA_TOTALPASS = 'TotalPass no republica con menos de 4.5 h';

const aMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const deMin = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
/** "08:00" → "8:00", como se lee en el calendario. */
export const horaLegible = (hhmm: string) => `${Number(hhmm.slice(0, 2))}:${hhmm.slice(3, 5)}`;
const bolsa = (categoria: string) => (categoria === 'reformer' ? 'Salsa' : 'Clases');
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;
const seEnciman = (a: { inicio: number; fin: number }, b: { inicio: number; fin: number }) => a.inicio < b.fin && b.inicio < a.fin;

/** "2026-11-04" → "miércoles 4 de noviembre". */
export function fechaLarga(fecha: string): string {
    return new Intl.DateTimeFormat('es-MX', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
        .format(new Date(`${fecha}T12:00:00Z`))
        .replace(',', '');
}

async function cargarContexto(db: ClienteTx, e: EntradaLote, bloquear: boolean): Promise<ContextoLote> {
    const ids = e.classIds;
    if (bloquear) {
        // Fija las clases mientras dura la transacción: nadie las cambia entre revisar y aplicar.
        // (Sin agregados: FOR UPDATE no se puede combinar con GROUP BY ni json_agg.)
        await db.query(`SELECT id FROM classes WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE`, [ids]);
    }
    const filasClases = (await db.query(
        `SELECT c.id, to_char(c.date, 'YYYY-MM-DD') AS fecha,
                to_char(c.start_time, 'HH24:MI') AS inicio, to_char(c.end_time, 'HH24:MI') AS fin,
                c.status::text AS status, c.facility_id, c.instructor_id, i.display_name AS coach,
                c.class_type_id, ct.name AS tipo, ct.category::text AS categoria, c.max_capacity
           FROM classes c
           JOIN class_types ct ON ct.id = c.class_type_id
           JOIN instructors i ON i.id = c.instructor_id
          WHERE c.id = ANY($1::uuid[])`,
        [ids],
    )).rows as FilaClase[];
    const clases = new Map(filasClases.map((c) => [c.id, { ...c, max_capacity: Number(c.max_capacity) }]));

    const canales = new Map<string, Record<string, number>>();
    for (const r of (await db.query(
        `SELECT class_id, channel, booked_spots FROM channel_inventory WHERE class_id = ANY($1::uuid[])`, [ids],
    )).rows) {
        const actual = canales.get(r.class_id) ?? {};
        actual[r.channel] = Number(r.booked_spots);
        canales.set(r.class_id, actual);
    }

    const alumnas = new Map<string, string[]>();
    for (const r of (await db.query(
        `SELECT DISTINCT class_id, user_id FROM bookings
          WHERE class_id = ANY($1::uuid[]) AND status IN ('confirmed', 'waitlist') AND channel = 'app'`, [ids],
    )).rows) {
        alumnas.set(r.class_id, [...(alumnas.get(r.class_id) ?? []), r.user_id]);
    }

    const publicadas = new Set<string>((await db.query(
        `SELECT class_id FROM partner_class_mappings
          WHERE class_id = ANY($1::uuid[]) AND channel = 'totalpass' AND sync_status IN ('published', 'pending_resync')`, [ids],
    )).rows.map((r) => r.class_id as string));

    let coachNueva: ContextoLote['coachNueva'] = null;
    if (e.accion === 'coach' && e.instructorId) {
        const i = (await db.query(`SELECT id, display_name, is_active FROM instructors WHERE id = $1`, [e.instructorId])).rows[0];
        if (!i) throw new ErrorLote(404, 'No encontramos a esa coach.');
        if (i.is_active === false) throw new ErrorLote(400, 'Esa coach está inactiva.');
        coachNueva = { id: i.id, nombre: i.display_name };
    }

    let tipoNuevo: ContextoLote['tipoNuevo'] = null;
    if (e.accion === 'mover' && e.classTypeId) {
        const t = (await db.query(`SELECT id, name, category::text AS categoria FROM class_types WHERE id = $1`, [e.classTypeId])).rows[0];
        if (!t) throw new ErrorLote(404, 'No encontramos ese tipo de clase.');
        tipoNuevo = { id: t.id, nombre: t.name, categoria: t.categoria };
    }

    // Choques de horario de coach: en TODAS las sucursales (una coach no está en dos lados).
    const coaches = e.accion === 'coach' && coachNueva
        ? [coachNueva.id]
        : e.accion === 'mover' && e.minutos
            ? [...new Set(filasClases.map((c) => c.instructor_id))]
            : [];
    const fechas = [...new Set(filasClases.map((c) => c.fecha))];
    const otras = coaches.length === 0 ? [] : (await db.query(
        `SELECT c.id, c.instructor_id, to_char(c.date, 'YYYY-MM-DD') AS fecha,
                to_char(c.start_time, 'HH24:MI') AS inicio, to_char(c.end_time, 'HH24:MI') AS fin, ct.name AS tipo
           FROM classes c JOIN class_types ct ON ct.id = c.class_type_id
          WHERE c.instructor_id = ANY($1::uuid[]) AND c.date = ANY($2::date[])
            AND c.status <> 'cancelled' AND NOT (c.id = ANY($3::uuid[]))`,
        [coaches, fechas, ids],
    )).rows as OtraClase[];

    return { clases, canales, alumnas, publicadas, coachNueva, tipoNuevo, otras };
}

// ── Evaluación (vista previa) ────────────────────────────────────────────────

function motivoComun(c: FilaClase | undefined, actor: ActorLote, ahora: Date): string | null {
    if (!c) return 'Esta clase ya no existe.';
    if (c.status === 'cancelled') return 'Ya está cancelada.';
    if (actor.sucursalPermitida && c.facility_id !== actor.sucursalPermitida) return 'Es de otra sucursal.';
    if (localDateTimeUtc(c.fecha, c.fin).getTime() <= ahora.getTime()) return 'Ya pasó.';
    if (localDateTimeUtc(c.fecha, c.inicio).getTime() <= ahora.getTime()) return 'Ya empezó.';
    return null;
}

function evaluarClase(id: string, ctx: ContextoLote, e: EntradaLote, actor: ActorLote, ahora: Date): ClaseDelLote {
    const c = ctx.clases.get(id);
    const sociasPorCanal = { ...(ctx.canales.get(id) ?? {}) };
    const inscritas = ctx.alumnas.get(id)?.length ?? 0;
    const r: ClaseDelLote = { classId: id, estado: 'ok', alumnasAvisadas: 0, sociasPorCanal, sociasPierdenLugar: 0, advertencias: [] };
    const bloquear = (motivo: string) => ({ ...r, estado: 'bloqueada' as const, motivo, alumnasAvisadas: 0, sociasPierdenLugar: 0 });

    const comun = motivoComun(c, actor, ahora);
    if (comun || !c) return bloquear(comun ?? 'Esta clase ya no existe.');
    const iv = { inicio: aMin(c.inicio), fin: aMin(c.fin) };

    if (e.accion === 'coach') {
        const coach = ctx.coachNueva!;
        if (c.instructor_id === coach.id) return { ...r, advertencias: [`Ya la da ${coach.nombre}`] };
        const choque = ctx.otras.find((o) => o.instructor_id === coach.id && o.fecha === c.fecha
            && seEnciman(iv, { inicio: aMin(o.inicio), fin: aMin(o.fin) }));
        if (choque) return bloquear(`${coach.nombre} ya tiene ${choque.tipo} a las ${horaLegible(choque.inicio)}.`);
        // Dos clases de la selección a la misma hora no las puede dar la misma coach.
        const enLaSeleccion = [...ctx.clases.values()].find((o) => o.id !== c.id && o.status !== 'cancelled'
            && o.fecha === c.fecha && seEnciman(iv, { inicio: aMin(o.inicio), fin: aMin(o.fin) }));
        if (enLaSeleccion) return bloquear(`Se encima con ${enLaSeleccion.tipo} de las ${horaLegible(enLaSeleccion.inicio)}, también seleccionada.`);
        return { ...r, alumnasAvisadas: inscritas };
    }

    if (e.accion === 'cupo_canal') {
        const canal = e.canal!;
        const lugares = e.lugares!;
        const reservadas = sociasPorCanal[canal] ?? 0;
        if (lugares < reservadas) return bloquear(`Tiene ${plural(reservadas, 'socia inscrita', 'socias inscritas')}: no puede bajar de ${reservadas}.`);
        if (lugares > c.max_capacity) return bloquear(`La clase tiene ${c.max_capacity} lugares: no caben ${lugares}.`);
        return r;
    }

    if (e.accion === 'mover') {
        const minutos = e.minutos ?? 0;
        const nuevo = { inicio: iv.inicio + minutos, fin: iv.fin + minutos };
        if (nuevo.inicio < HORA_APERTURA || nuevo.fin > HORA_CIERRE) {
            return bloquear(`Quedaría de ${horaLegible(deMin(Math.max(0, nuevo.inicio)))} a ${horaLegible(deMin(Math.min(24 * 60 - 1, nuevo.fin)))}, fuera del horario (5:00 a 23:00).`);
        }
        const inicioNuevoUtc = localDateTimeUtc(c.fecha, deMin(nuevo.inicio)).getTime();
        if (minutos !== 0 && inicioNuevoUtc <= ahora.getTime()) return bloquear('La hora nueva ya pasó.');
        if (minutos !== 0) {
            const choque = ctx.otras.find((o) => o.instructor_id === c.instructor_id && o.fecha === c.fecha
                && seEnciman(nuevo, { inicio: aMin(o.inicio), fin: aMin(o.fin) }));
            if (choque) return bloquear(`${c.coach} ya tiene ${choque.tipo} a las ${horaLegible(choque.inicio)}.`);
        }
        const tipo = ctx.tipoNuevo;
        if (tipo && tipo.categoria !== c.categoria && inscritas > 0) {
            return bloquear(`Tiene ${plural(inscritas, 'alumna', 'alumnas')} con créditos de ${bolsa(c.categoria)}: no puede volverse ${bolsa(tipo.categoria)}.`);
        }
        if (tipo) {
            const cupo = capacityError(tipo.categoria, c.max_capacity);
            if (cupo) return bloquear(cupo);
        }
        const res = { ...r, alumnasAvisadas: inscritas };
        if (minutos !== 0 && ctx.publicadas.has(id)) {
            res.sociasPierdenLugar = sociasPorCanal.totalpass ?? 0;
            if (inicioNuevoUtc - ahora.getTime() < HORAS_AVISO_TOTALPASS * 3600_000) res.advertencias = [ADVERTENCIA_TOTALPASS];
        }
        return res;
    }

    // cancelar: solo las reglas comunes.
    return { ...r, alumnasAvisadas: inscritas };
}

function armarRespuesta(clases: ClaseDelLote[], ctx: ContextoLote, aplicado: boolean): RespuestaLote {
    const clave = (x: ClaseDelLote) => {
        const c = ctx.clases.get(x.classId);
        return c ? `${c.fecha} ${c.inicio}` : '9999';
    };
    const ordenadas = [...clases].sort((a, b) => clave(a).localeCompare(clave(b)));
    const ok = ordenadas.filter((c) => c.estado === 'ok');
    return {
        clases: ordenadas,
        resumen: {
            ok: ok.length,
            bloqueadas: ordenadas.length - ok.length,
            alumnasAvisadas: ok.reduce((t, c) => t + c.alumnasAvisadas, 0),
            sociasPierdenLugar: ok.reduce((t, c) => t + c.sociasPierdenLugar, 0),
        },
        aplicado,
    };
}

const SIN_CAMBIOS = (): TrasCommitLote => ({
    avisosCancelacion: [], avisosAlumnas: [], correosCoach: [], retiro: false, resync: false, antes: [],
});

/**
 * Evalúa el lote y, si `vistaPrevia` es false y ninguna clase está bloqueada, lo aplica
 * con `db` (que ya debe estar en BEGIN). Con alguna bloqueada no escribe nada y devuelve
 * `aplicado: false`: la ruta responde 409 con la misma respuesta.
 */
export async function procesarLote(db: ClienteTx, e: EntradaLote, actor: ActorLote, ahora: Date = new Date()): Promise<ResultadoLote> {
    const ctx = await cargarContexto(db, e, !e.vistaPrevia);
    const clases = e.classIds.map((id) => evaluarClase(id, ctx, e, actor, ahora));
    const respuesta = armarRespuesta(clases, ctx, false);
    if (e.vistaPrevia || respuesta.resumen.bloqueadas > 0) return { respuesta, trasCommit: SIN_CAMBIOS() };
    // Aplicar cada acción llega en el siguiente cambio de esta rama.
    throw new ErrorLote(501, 'Todavía no se pueden aplicar cambios en bloque.');
}
```

- [ ] **Step 4: La ruta**

En `backend/src/routes/classes.ts`:

a) Después de `import { isOctoberManagedDate } from '../data/october2026.js';` agregar:

```ts
import { LoteSchema, procesarLote, ErrorLote } from '../lib/classes-bulk.js';
```

b) Justo antes de la línea `router.post('/bulk-delete', authenticate, requireRole('admin', 'super_admin'), async (req: Request, res: Response) => {` agregar:

```ts
// ============================================
// POST /api/classes/bulk - Cambios en bloque: coach, cupo de TotalPass, mover/cambiar
// tipo, cancelar. `vistaPrevia: true` evalúa sin escribir. Al aplicar, cualquier clase
// bloqueada → 409 con la misma respuesta y sin cambios. Todo en UNA transacción; avisos,
// correos y barridos de TotalPass corren una sola vez después del COMMIT.
// ============================================
router.post('/bulk', authenticate, requireElevated, async (req: Request, res: Response) => {
    const validation = LoteSchema.safeParse(req.body);
    if (!validation.success) {
        return res.status(400).json({ error: 'Datos inválidos', details: validation.error.flatten().fieldErrors });
    }
    const entrada = validation.data;

    // Recepción queda limitada a su sucursal asignada (si tiene una).
    let sucursalPermitida: string | null = null;
    if (req.user?.role === 'reception') {
        const fila = await queryOne<{ default_facility_id: string | null }>(
            `SELECT default_facility_id FROM users WHERE id = $1`, [req.user.userId]);
        sucursalPermitida = fila?.default_facility_id ?? null;
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const { respuesta } = await procesarLote(client, entrada, { userId: req.user!.userId, sucursalPermitida });
        if (!respuesta.aplicado) {
            await client.query('ROLLBACK');
            return res.status(entrada.vistaPrevia ? 200 : 409).json(respuesta);
        }
        await client.query('COMMIT');
        return res.json(respuesta);
    } catch (error) {
        await client.query('ROLLBACK').catch(() => { /* best-effort */ });
        if (error instanceof ErrorLote) return res.status(error.status).json({ error: error.message });
        console.error('Bulk classes error:', error);
        return res.status(500).json({ error: 'No se aplicó ningún cambio: falló el servidor.' });
    } finally {
        client.release();
    }
});

```

- [ ] **Step 5: Correr la prueba**

Run:

```bash
cd backend && npx tsc --noEmit && echo "tsc ok"
DATABASE_URL=postgresql://localhost:5432/casa_she npx tsx scripts/test-classes-bulk.ts
```

Expected: `tsc ok`; las secciones `cuerpo`, `cableado`, `vista previa`, `reglas comunes`, `coach`, `cupo_canal`, `mover` y `aplicar con una bloqueada` con `OK`, y al final `test-classes-bulk: OK`.

- [ ] **Step 6: Agregarla a `npm test`**

En `backend/package.json`, dentro del script `"test"`, cambiar `tsx scripts/test-clases-en-transaccion.ts"` por:

```
tsx scripts/test-clases-en-transaccion.ts && tsx scripts/test-classes-bulk.ts"
```

- [ ] **Step 7: Commit**

```bash
git add backend/src/lib/classes-bulk.ts backend/src/routes/classes.ts backend/scripts/test-classes-bulk.ts backend/package.json
git commit -m "feat(clases): POST /api/classes/bulk con vista previa y bloqueos

Evalúa coach, cupo de TotalPass, mover/cambiar tipo y cancelar sobre varias
clases: cuántas alumnas reciben aviso, socias por canal, socias que pierden
su lugar y por qué una clase está bloqueada. Aplicar con alguna bloqueada
responde 409 sin tocar nada.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `POST /api/classes/bulk` — aplicar, avisos después del COMMIT y auditoría

**Tipo:** código completo, se transcribe. Toca la base local (dentro de `BEGIN … ROLLBACK`).

**Files:**
- Modify: `backend/src/lib/classes-bulk.ts` (imports; final de `procesarLote`; secciones nuevas al final)
- Modify: `backend/src/routes/classes.ts` (import de `classes-bulk.js`; cuerpo de `router.post('/bulk', …)`)
- Modify: `backend/scripts/test-totalpass-cableado.ts` (sección nueva antes de `// ── (d)`)
- Test: `backend/scripts/test-classes-bulk.ts` (secciones 7 a 11)

**Interfaces:**
- Consumes (Task 1): `cancelClassWithRefunds(id, por, motivo, { db, diferirAvisos: true })` → `avisos`; `setTotalpassCap(id, lugares, db)`; `marcarResyncTotalpass(ids, db)`.
- Consumes (Task 2): `procesarLote`, `TrasCommitLote`, `ContextoLote` interno (clases, alumnas por clase, coach y tipo nuevos), `fechaLarga`, `horaLegible`, `aMin`/`deMin` internos.
- Produces: `procesarLote(…, vistaPrevia: false)` sin bloqueadas aplica y devuelve `aplicado: true` y `trasCommit` lleno: `avisosCancelacion` (los push que `cancelClassWithRefunds` difirió), `avisosAlumnas` (`{ userId, title, body, type: 'class_updated', data: { classId } }` para coach y mover), `correosCoach` (uno por clase que cambia de coach), `retiro` (cancelar, o cupo 0), `resync` (coach/mover con alguna publicada), `antes` (para la auditoría).
- Produces: `enviarAvisosDelLote(t: TrasCommitLote): Promise<void>` (push de cancelación, `writeInAppNotification` para cada aviso y `sendClassAssignmentNotification` a la coach nueva; nunca lanza).
- Produces (API): `POST /api/classes/bulk` aplica en UNA transacción; después del COMMIT manda los avisos sin esperarlos, llama `dispararRetiroTotalpass()` / `dispararResyncTotalpass()` una vez si toca y registra `admin_actions` con `action_type = 'classes_bulk_<accion>'`, `old_data = { clases: antes }` y `new_data` con los parámetros y el resumen.

Lo que aplica cada acción:

| Acción | Base de datos (en la transacción) | TotalPass | Avisos |
| --- | --- | --- | --- |
| `coach` | `instructor_id` solo en las que cambian | `marcarResyncTotalpass(ids, db)` (editar) | in-app + push "Cambio de coach" a sus alumnas; correo a la coach nueva por clase |
| `cupo_canal` | `setTotalpassCap(id, lugares, db)` por clase | 0 marca retiro; > 0 lo desmarca | ninguno |
| `mover` | `start_time`/`end_time` + `minutos`; `class_type_id` si viene | `marcarResyncTotalpass(ids, db)` | in-app + push "Tu clase cambió" / "Tu clase cambió de hora" |
| `cancelar` | `cancelClassWithRefunds(id, quien, motivo, { db, diferirAvisos: true })` por clase; motivo por defecto `Cancelada por el estudio` | retiro de cada clase | el push que ya manda `cancelClassWithRefunds` |

- [ ] **Step 1: Escribir las pruebas que fallan**

En `backend/scripts/test-classes-bulk.ts`, justo antes de estas dos líneas (están casi al final):

```ts
        await client.query('ROLLBACK');
        console.log('test-classes-bulk: OK');
```

insertar:

```ts
        // ── 7. Aplicar mover: corre la hora, marca resync y avisa ────────────
        const movida = await procesarLote(client, { classIds: [siete], accion: 'mover', minutos: -60, vistaPrevia: false }, admin);
        assert.equal(movida.respuesta.aplicado, true);
        assert.deepEqual({ inicio: (await fila(siete)).inicio, fin: (await fila(siete)).fin }, { inicio: '06:00', fin: '06:50' });
        assert.equal(await estadoMapping(client, siete), 'pending_resync');
        assert.equal(movida.trasCommit.resync, true);
        assert.deepEqual(movida.trasCommit.avisosAlumnas.map((a) => [a.userId, a.type]), [[alumna.userId, 'class_updated']]);
        assert.match(movida.trasCommit.avisosAlumnas[0].body, /ahora es a las 6:00 \(antes 7:00\)/);
        assert.deepEqual(movida.trasCommit.antes.map((a) => a.inicio), ['07:00'], 'guarda cómo estaba para la auditoría');
        // De regreso (lo que haría "Deshacer").
        const deVuelta = await procesarLote(client, { classIds: [siete], accion: 'mover', minutos: 60, vistaPrevia: false }, admin);
        assert.equal(deVuelta.respuesta.aplicado, true);
        assert.equal((await fila(siete)).inicio, '07:00');
        console.log('  aplicar mover: hora, pending_resync y aviso · OK');

        // ── 8. Aplicar coach ─────────────────────────────────────────────────
        const conCoach = await procesarLote(client, { classIds: [ocho], accion: 'coach', instructorId: base.coachB, vistaPrevia: false }, admin);
        assert.equal(conCoach.respuesta.aplicado, true);
        assert.equal((await fila(ocho)).instructor_id, base.coachB);
        assert.deepEqual(conCoach.trasCommit.correosCoach.map((c) => [c.instructorId, c.startTime]), [[base.coachB, '08:00']]);
        console.log('  aplicar coach: cambia y prepara el correo a la coach nueva · OK');

        // ── 9. Aplicar cupo_canal: respeta CAP_BELOW_BOOKED y 0 marca retiro ──
        const vacia = await crearClase(client, base, { fecha, hora: '13:00' });
        await publicada(client, vacia);
        await conTotalpass(client, base, vacia, 2, 0);
        const bajo = await procesarLote(client, { classIds: [siete, vacia], accion: 'cupo_canal', canal: 'totalpass', lugares: 0, vistaPrevia: false }, admin);
        assert.equal(bajo.respuesta.aplicado, false, 'la 7:00 tiene 1 socia: no baja a 0');
        assert.equal(await estadoMapping(client, vacia), 'published', 'y la otra tampoco se tocó');
        const apagada = await procesarLote(client, { classIds: [vacia], accion: 'cupo_canal', canal: 'totalpass', lugares: 0, vistaPrevia: false }, admin);
        assert.equal(apagada.trasCommit.retiro, true);
        assert.equal(await estadoMapping(client, vacia), 'pending_delete');
        await procesarLote(client, { classIds: [siete], accion: 'cupo_canal', canal: 'totalpass', lugares: 4, vistaPrevia: false }, admin);
        assert.equal((await client.query(`SELECT max_spots FROM channel_inventory WHERE class_id = $1 AND channel = 'totalpass'`, [siete])).rows[0].max_spots, 4);
        console.log('  aplicar cupo_canal: no baja de las socias; 0 retira · OK');

        // ── 10. Una falla a la mitad no deja nada ────────────────────────────
        // Un trigger de prueba truena al cancelar la SEGUNDA clase (la de las 8:00).
        await client.query(`CREATE FUNCTION pg_temp.falla_a_la_mitad() RETURNS trigger AS $$
            BEGIN IF NEW.id = '${ocho}'::uuid AND NEW.status = 'cancelled' THEN RAISE EXCEPTION 'falla de prueba'; END IF; RETURN NEW; END $$ LANGUAGE plpgsql`);
        await client.query(`CREATE TRIGGER falla_a_la_mitad BEFORE UPDATE ON classes FOR EACH ROW EXECUTE FUNCTION pg_temp.falla_a_la_mitad()`);
        await client.query('SAVEPOINT antes_del_lote'); // la ruta hace ROLLBACK de toda su transacción; aquí, hasta este punto
        await assert.rejects(procesarLote(client, { classIds: [siete, ocho], accion: 'cancelar', vistaPrevia: false }, admin), /falla de prueba/);
        await client.query('ROLLBACK TO SAVEPOINT antes_del_lote');
        assert.equal((await fila(siete)).status, 'scheduled', 'la primera NO quedó cancelada');
        assert.equal((await client.query(`SELECT status::text FROM bookings WHERE id = $1`, [reserva])).rows[0].status, 'confirmed');
        assert.equal((await client.query(`SELECT multi_remaining FROM memberships WHERE id = $1`, [alumna.membershipId])).rows[0].multi_remaining, 4);
        assert.equal(await estadoMapping(client, siete), 'pending_resync', 'el mapping sigue como estaba');
        await client.query(`DROP TRIGGER falla_a_la_mitad ON classes`);
        console.log('  falla a la mitad: no queda nada · OK');

        // ── 11. Aplicar cancelar: cancela, devuelve créditos, marca retiro ───
        const motivo = 'Puente del 2 de noviembre';
        const canceladas = await procesarLote(client, { classIds: [siete, ocho], accion: 'cancelar', motivo, vistaPrevia: false }, admin);
        assert.equal(canceladas.respuesta.aplicado, true);
        assert.deepEqual(canceladas.respuesta.resumen, { ok: 2, bloqueadas: 0, alumnasAvisadas: 1, sociasPierdenLugar: 0 });
        for (const id of [siete, ocho]) {
            const c = (await client.query(`SELECT status::text, cancellation_reason FROM classes WHERE id = $1`, [id])).rows[0];
            assert.deepEqual(c, { status: 'cancelled', cancellation_reason: motivo }, 'cancelada, nunca borrada');
        }
        assert.equal((await client.query(`SELECT status::text FROM bookings WHERE id = $1`, [reserva])).rows[0].status, 'cancelled');
        assert.equal((await client.query(`SELECT multi_remaining FROM memberships WHERE id = $1`, [alumna.membershipId])).rows[0].multi_remaining, 5, 'crédito devuelto');
        assert.equal(await estadoMapping(client, siete), 'pending_delete');
        assert.equal(canceladas.trasCommit.retiro, true);
        assert.ok(canceladas.trasCommit.avisosCancelacion.some((a) => a.userId === alumna.userId), 'el aviso se manda después del COMMIT');
        console.log('  aplicar cancelar: canceladas, créditos devueltos, pending_delete · OK');
```

En `backend/scripts/test-totalpass-cableado.ts`, justo antes de la línea `// ── (d) El estado 'pending_delete' tiene que ser válido en la BD ────────────` insertar:

```ts
// ── (c3) Los cambios en bloque también llegan a TotalPass ───────────────────
// POST /api/classes/bulk marca dentro de su transacción y dispara los dos barridos
// UNA vez después del COMMIT. Si alguien quita un disparo, las clases quedan
// marcadas pero no se retiran/republican hasta el cron (o nunca, con crons apagados).
const inicioBulk = clases.indexOf("router.post('/bulk',");
assert.ok(inicioBulk >= 0, 'debe existir POST /api/classes/bulk');
const bulk = clases.slice(inicioBulk, clases.indexOf('\n});\n', inicioBulk));
assert.match(bulk, /COMMIT[\s\S]*dispararRetiroTotalpass\(\)/, '/bulk debe disparar el retiro después del COMMIT');
assert.match(bulk, /COMMIT[\s\S]*dispararResyncTotalpass\(\)/, '/bulk debe disparar la resincronización después del COMMIT');
const lote = leer('lib/classes-bulk.ts');
assert.match(lote, /cancelClassWithRefunds\([^)]*\{\s*db/, 'cancelar en bloque pasa por cancelClassWithRefunds dentro de la transacción');
assert.match(lote, /marcarResyncTotalpass\([^)]*,\s*db\)/, 'coach y mover en bloque marcan resync dentro de la transacción');
assert.match(lote, /setTotalpassCap\([^)]*,\s*db\)/, 'el cupo en bloque usa setTotalpassCap dentro de la transacción');
assert.doesNotMatch(lote, /DELETE FROM classes/, 'los cambios en bloque nunca borran clases');

```

- [ ] **Step 2: Correrlas y ver que fallan**

Run:

```bash
cd backend
DATABASE_URL=postgresql://localhost:5432/casa_she npx tsx scripts/test-classes-bulk.ts
DATABASE_URL=postgresql://localhost:5432/casa_she npx tsx scripts/test-totalpass-cableado.ts
```

Expected: la primera FAIL con `Todavía no se pueden aplicar cambios en bloque.` (sección 7); la segunda FAIL con `/bulk debe disparar el retiro después del COMMIT`.

- [ ] **Step 3: Aplicar en `classes-bulk.ts`**

En `backend/src/lib/classes-bulk.ts`:

a) Después de `import { capacityError } from './schedule.js';` agregar:

```ts
import { queryOne } from '../config/database.js';
import { cancelClassWithRefunds } from './cancel-class.js';
import { setTotalpassCap } from './totalpass/caps.js';
import { marcarResyncTotalpass } from './totalpass/resync.js';
import { writeInAppNotification } from './in-app-notifications.js';
import { sendWebPushToUser } from './web-push.js';
import { sendClassAssignmentNotification } from '../services/email.js';
```

b) Al final de `procesarLote`, cambiar:

```ts
    // Aplicar cada acción llega en el siguiente cambio de esta rama.
    throw new ErrorLote(501, 'Todavía no se pueden aplicar cambios en bloque.');
}
```

por:

```ts
    const trasCommit = await aplicarLote(db, e, actor, ctx);
    return { respuesta: { ...respuesta, aplicado: true }, trasCommit };
}
```

c) Al final del archivo agregar:

```ts
// ── Aplicar (todo con el cliente de la transacción) ──────────────────────────

async function aplicarLote(db: ClienteTx, e: EntradaLote, actor: ActorLote, ctx: ContextoLote): Promise<TrasCommitLote> {
    const t = SIN_CAMBIOS();
    const clases = e.classIds.map((id) => ctx.clases.get(id)!);
    t.antes = clases.map((c) => ({
        id: c.id, instructor_id: c.instructor_id, class_type_id: c.class_type_id, inicio: c.inicio, fin: c.fin, status: c.status,
    }));
    const avisar = (c: FilaClase, title: string, body: string) => {
        for (const userId of ctx.alumnas.get(c.id) ?? []) {
            t.avisosAlumnas.push({ userId, title, body, type: 'class_updated', data: { classId: c.id } });
        }
    };

    if (e.accion === 'coach') {
        const coach = ctx.coachNueva!;
        const cambian = clases.filter((c) => c.instructor_id !== coach.id);
        if (cambian.length === 0) return t;
        const ids = cambian.map((c) => c.id);
        await db.query(`UPDATE classes SET instructor_id = $1, updated_at = NOW() WHERE id = ANY($2::uuid[])`, [coach.id, ids]);
        // Editar en TotalPass: las socias conservan su lugar.
        t.resync = (await marcarResyncTotalpass(ids, db)) > 0;
        for (const c of cambian) {
            avisar(c, 'Cambio de coach', `${c.tipo} del ${fechaLarga(c.fecha)} a las ${horaLegible(c.inicio)} ahora la da ${coach.nombre}.`);
            t.correosCoach.push({
                instructorId: coach.id, className: c.tipo, classDate: c.fecha, startTime: c.inicio, endTime: c.fin, capacity: c.max_capacity,
            });
        }
        return t;
    }

    if (e.accion === 'cupo_canal') {
        for (const c of clases) await setTotalpassCap(c.id, e.lugares!, db);
        // 0 marca el retiro (dentro de setTotalpassCap); > 0 lo desmarca.
        t.retiro = e.lugares === 0;
        return t;
    }

    if (e.accion === 'mover') {
        const minutos = e.minutos ?? 0;
        const tipo = ctx.tipoNuevo;
        const ids = clases.map((c) => c.id);
        await db.query(
            `UPDATE classes
                SET start_time = start_time + make_interval(mins => $2::int),
                    end_time = end_time + make_interval(mins => $2::int),
                    class_type_id = COALESCE($3::uuid, class_type_id),
                    updated_at = NOW()
              WHERE id = ANY($1::uuid[])`,
            [ids, minutos, tipo?.id ?? null],
        );
        // Con minutos ≠ 0 TotalPass la borra y la republica (las socias pierden lugar);
        // solo con el tipo, se edita.
        t.resync = (await marcarResyncTotalpass(ids, db)) > 0;
        for (const c of clases) {
            const dia = fechaLarga(c.fecha);
            const horaNueva = horaLegible(deMin(aMin(c.inicio) + minutos));
            const cambiaTipo = tipo && tipo.id !== c.class_type_id;
            if (minutos !== 0 && cambiaTipo) avisar(c, 'Tu clase cambió', `${c.tipo} del ${dia} ahora es ${tipo!.nombre} a las ${horaNueva}.`);
            else if (minutos !== 0) avisar(c, 'Tu clase cambió de hora', `${c.tipo} del ${dia} ahora es a las ${horaNueva} (antes ${horaLegible(c.inicio)}).`);
            else if (cambiaTipo) avisar(c, 'Tu clase cambió', `${c.tipo} del ${dia} a las ${horaLegible(c.inicio)} ahora es ${tipo!.nombre}.`);
        }
        return t;
    }

    // cancelar
    const motivo = e.motivo?.trim() || 'Cancelada por el estudio';
    for (const c of clases) {
        const r = await cancelClassWithRefunds(c.id, actor.userId, motivo, { db, diferirAvisos: true });
        t.avisosCancelacion.push(...r.avisos);
    }
    t.retiro = true;
    return t;
}

// ── Después del COMMIT ───────────────────────────────────────────────────────

/**
 * Manda lo que el lote dejó pendiente: avisos a alumnas (in-app + push) y correos a la
 * coach nueva. Nunca lanza: los cambios ya están guardados y un aviso que falla no los
 * deshace. Los barridos de TotalPass los dispara la ruta.
 */
export async function enviarAvisosDelLote(t: TrasCommitLote): Promise<void> {
    for (const a of t.avisosCancelacion) void sendWebPushToUser(a.userId, a.payload);
    for (const a of t.avisosAlumnas) await writeInAppNotification(a);
    for (const correo of t.correosCoach) {
        try {
            const coach = await queryOne<{ email: string | null; display_name: string }>(
                `SELECT email, display_name FROM instructors WHERE id = $1`, [correo.instructorId]);
            if (!coach?.email) continue;
            await sendClassAssignmentNotification({
                to: coach.email, coachName: coach.display_name, className: correo.className,
                classDate: correo.classDate, startTime: correo.startTime, endTime: correo.endTime, capacity: correo.capacity,
            });
        } catch (err) {
            console.error('[classes-bulk] correo a la coach falló:', err);
        }
    }
}
```

- [ ] **Step 4: La ruta: avisos, barridos y auditoría después del COMMIT**

En `backend/src/routes/classes.ts`:

a) Cambiar `import { LoteSchema, procesarLote, ErrorLote } from '../lib/classes-bulk.js';` por:

```ts
import { LoteSchema, procesarLote, enviarAvisosDelLote, ErrorLote } from '../lib/classes-bulk.js';
```

b) Dentro de `router.post('/bulk', …)`, cambiar:

```ts
        const { respuesta } = await procesarLote(client, entrada, { userId: req.user!.userId, sucursalPermitida });
        if (!respuesta.aplicado) {
            await client.query('ROLLBACK');
            return res.status(entrada.vistaPrevia ? 200 : 409).json(respuesta);
        }
        await client.query('COMMIT');
        return res.json(respuesta);
```

por:

```ts
        const { respuesta, trasCommit } = await procesarLote(client, entrada, { userId: req.user!.userId, sucursalPermitida });
        if (!respuesta.aplicado) {
            await client.query('ROLLBACK');
            return res.status(entrada.vistaPrevia ? 200 : 409).json(respuesta);
        }
        await client.query('COMMIT');

        void enviarAvisosDelLote(trasCommit).catch((e) => console.error('[classes-bulk] avisos fallaron:', e));
        if (trasCommit.retiro) dispararRetiroTotalpass();
        if (trasCommit.resync) dispararResyncTotalpass();
        await logAction(query, {
            adminUserId: req.user!.userId,
            actionType: `classes_bulk_${entrada.accion}`,
            entityType: 'class',
            description: `Cambio en bloque (${entrada.accion}) en ${entrada.classIds.length} clases`,
            oldData: { clases: trasCommit.antes },
            newData: {
                classIds: entrada.classIds, instructorId: entrada.instructorId, canal: entrada.canal, lugares: entrada.lugares,
                minutos: entrada.minutos, classTypeId: entrada.classTypeId, motivo: entrada.motivo, resumen: respuesta.resumen,
            },
            req,
        });
        return res.json(respuesta);
```

- [ ] **Step 5: Correr las pruebas**

Run:

```bash
cd backend && npx tsc --noEmit && echo "tsc ok"
for t in test-classes-bulk test-totalpass-cableado test-clases-en-transaccion; do
  DATABASE_URL=postgresql://localhost:5432/casa_she npx tsx scripts/$t.ts 2>&1 | grep -E "^test-[a-z-]+: OK$" || echo "$t: FALLÓ"
done
```

Expected: `tsc ok`, `test-classes-bulk: OK`, `test-totalpass-cableado: OK`, `test-clases-en-transaccion: OK` (ningún `FALLÓ`).

- [ ] **Step 6: Commit**

```bash
git add backend/src/lib/classes-bulk.ts backend/src/routes/classes.ts backend/scripts/test-classes-bulk.ts backend/scripts/test-totalpass-cableado.ts
git commit -m "feat(clases): aplicar cambios en bloque en una sola transacción

Coach, cupo de TotalPass, mover/cambiar tipo y cancelar se aplican todo o
nada. Avisos a alumnas (in-app + push), correo a la coach nueva y barridos
de retiro/resincronización de TotalPass corren una vez después del COMMIT,
y queda registro en auditoría.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Fuera `POST /bulk-delete`, "Editar clase" avisa al mover y `/bulk` de punta a punta

**Tipo:** código completo, se transcribe. La prueba de Playwright usa el arnés (base desechable).

**Files:**
- Create: `backend/src/lib/avisos-clase.ts`
- Modify: `backend/src/routes/classes.ts` (comentario suelto ~L157; ruta `router.post('/bulk-delete', …)`; `router.put('/:id', …)` alrededor del `UPDATE classes SET ${updates.join(', ')}`)
- Modify: `backend/package.json` (script `test`)
- Test: `backend/scripts/test-avisos-clase.ts`
- Test: `frontend/e2e/tests/admin-classes-bulk-api.spec.ts`

**Interfaces:**
- Consumes (Task 2): `fechaLarga(fecha)`, `horaLegible(hhmm)` de `backend/src/lib/classes-bulk.ts`; `POST /api/classes/bulk` completo (Task 3).
- Produces: `horarioDeClase(classId): Promise<{ tipo; fecha; inicio } | null>`, `avisoCambioDeHorario(antes, despues): { title; body } | null` (pura) y `avisarAlumnasDeLaApp(classId, aviso): Promise<number>` (in-app + push con `writeInAppNotification`, tipo `class_updated`; nunca lanza) en `backend/src/lib/avisos-clase.ts`.
- Produces (API): `PUT /api/classes/:id` avisa a las alumnas de la app cuando cambia la fecha o la hora de inicio. `POST /api/classes/bulk-delete` ya no existe (404). En el frontend no hay ningún llamador (la Entrega 2 quitó "Limpiar semana"); confírmalo con `git grep -n "bulk-delete" -- frontend/src` (no debe imprimir nada).

- [ ] **Step 1: Escribir las pruebas que fallan**

Crear `backend/scripts/test-avisos-clase.ts`:

```ts
// "Editar clase" (PUT /api/classes/:id) avisa a las alumnas de la app cuando cambia el
// día o la hora, y "Limpiar semana" (POST /bulk-delete, que BORRABA clases) ya no existe.
// Correr con: npx tsx scripts/test-avisos-clase.ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { avisoCambioDeHorario } from '../src/lib/avisos-clase.js';

const antes = { tipo: 'Barre', fecha: '2026-11-04', inicio: '08:00' };
assert.equal(avisoCambioDeHorario(antes, { ...antes }), null, 'sin cambio de día ni hora, no hay aviso');
assert.equal(avisoCambioDeHorario(antes, { ...antes, tipo: 'Pilates Mat' }), null, 'cambiar solo el tipo no avisa por aquí');
assert.deepEqual(avisoCambioDeHorario(antes, { ...antes, inicio: '09:30' }), {
    title: 'Tu clase cambió de hora',
    body: 'Barre del miércoles 4 de noviembre ahora es a las 9:30 (antes 8:00).',
});
assert.deepEqual(avisoCambioDeHorario(antes, { ...antes, fecha: '2026-11-05' }), {
    title: 'Tu clase cambió de día',
    body: 'Barre del miércoles 4 de noviembre a las 8:00 ahora es el jueves 5 de noviembre a las 8:00.',
});
console.log('  texto del aviso: OK');

const ruta = readFileSync(fileURLToPath(new URL('../src/routes/classes.ts', import.meta.url)), 'utf8');
const put = ruta.slice(ruta.indexOf("router.put('/:id',"), ruta.indexOf("router.put('/:id/channels',"));
assert.match(put, /horarioDeClase\(id\)[\s\S]*UPDATE classes[\s\S]*horarioDeClase\(id\)/, 'lee el horario antes y después del UPDATE');
assert.match(put, /avisarAlumnasDeLaApp\(id, avisoHorario\)/, 'avisa a las alumnas cuando cambió');
assert.doesNotMatch(ruta, /bulk-delete/, 'POST /bulk-delete se eliminó');
assert.doesNotMatch(ruta, /DELETE FROM classes/, 'ninguna ruta de clases borra clases: se cancelan');
console.log('  cableado: OK');

console.log('test-avisos-clase: OK');
```

Crear `frontend/e2e/tests/admin-classes-bulk-api.spec.ts`:

```ts
/**
 * POST /api/classes/bulk de punta a punta contra el backend del arnés (copia desechable
 * de la base local): crea una clase de verdad, pide la vista previa, cancela, y
 * comprueba que un segundo intento responde 409 y que la clase sigue ahí, cancelada.
 * Solo con scripts/e2e-local.sh (nunca contra producción).
 */
import { test, expect } from "../fixtures/auth";

const API = "http://localhost:3001/api";

test("POST /api/classes/bulk: vista previa, cancelar, 409 y la clase sigue cancelada", async ({ adminPage: page, request }) => {
  const token = await page.evaluate(() => localStorage.getItem("casashe_token"));
  expect(token, "sesión de la admin de prueba").toBeTruthy();
  const headers = { Authorization: `Bearer ${token}` };
  const lote = (data: Record<string, unknown>) => request.post(`${API}/classes/bulk`, { headers, data });

  const tipos = (await (await request.get(`${API}/class-types`, { headers })).json()) as Array<{ id: string; category: string }>;
  const coaches = (await (await request.get(`${API}/instructors`, { headers })).json()) as Array<{ id: string; is_active?: boolean }>;
  const sucursales = (await (await request.get(`${API}/facilities`, { headers })).json()) as Array<{ id: string }>;
  const tipo = tipos.find((t) => t.category === "multi");
  const coach = coaches.find((c) => c.is_active !== false);
  expect(tipo && coach && sucursales[0], "la base local tiene tipos, coaches y sucursal").toBeTruthy();

  // Dentro de 45–74 días a las 05:15 (hora rara: no choca con el horario cargado).
  const fecha = new Date(Date.now() + (45 + Math.floor(Math.random() * 30)) * 86_400_000).toISOString().slice(0, 10);
  const creada = await request.post(`${API}/classes`, {
    headers,
    data: { classTypeId: tipo!.id, instructorId: coach!.id, facilityId: sucursales[0].id, date: fecha, startTime: "05:15", endTime: "06:05", maxCapacity: 7 },
  });
  expect(creada.status(), await creada.text()).toBe(201);
  const id = (await creada.json()).id as string;

  expect((await lote({ classIds: [id], accion: "mover", minutos: 10, vistaPrevia: true })).status(), "minutos múltiplo de 15").toBe(400);

  const previa = await lote({ classIds: [id], accion: "cancelar", vistaPrevia: true });
  expect(previa.status()).toBe(200);
  expect(await previa.json()).toMatchObject({ aplicado: false, resumen: { ok: 1, bloqueadas: 0 } });
  expect((await (await request.get(`${API}/classes/${id}`)).json()).status, "la vista previa no escribe").toBe("scheduled");

  const aplicada = await lote({ classIds: [id], accion: "cancelar", motivo: "Prueba e2e", vistaPrevia: false });
  expect(aplicada.status()).toBe(200);
  expect(await aplicada.json()).toMatchObject({ aplicado: true, resumen: { ok: 1 } });

  const otraVez = await lote({ classIds: [id], accion: "cancelar", vistaPrevia: false });
  expect(otraVez.status(), "aplicar con una bloqueada → 409").toBe(409);
  expect((await otraVez.json()).clases[0]).toMatchObject({ classId: id, estado: "bloqueada", motivo: "Ya está cancelada." });

  const despues = await request.get(`${API}/classes/${id}`);
  expect(despues.status(), "cancelada, nunca borrada").toBe(200);
  expect((await despues.json()).status).toBe("cancelled");

  expect((await request.post(`${API}/classes/bulk-delete`, { headers, data: { startDate: fecha, endDate: fecha } })).status(), "bulk-delete ya no existe").toBe(404);
});
```

- [ ] **Step 2: Correrlas y ver que fallan**

Run:

```bash
cd backend && DATABASE_URL=postgresql://localhost:5432/casa_she npx tsx scripts/test-avisos-clase.ts
cd ../frontend && ./scripts/e2e-local.sh e2e/tests/admin-classes-bulk-api.spec.ts --project=chromium --workers=3
```

Expected: la primera FAIL con `Cannot find module '../src/lib/avisos-clase.js'`; la de Playwright llega hasta el final y FAIL en `bulk-delete ya no existe` (Expected 404, Received 200: la ruta todavía existe; corre en la base desechable).

- [ ] **Step 3: El aviso de cambio de horario**

Crear `backend/src/lib/avisos-clase.ts`:

```ts
/**
 * Avisos a las alumnas de la app cuando su clase cambia de día u hora desde
 * "Editar clase" (PUT /api/classes/:id). Mismo mecanismo que los cambios en bloque:
 * notificación in-app + web push (`writeInAppNotification`).
 */
import { query, queryOne } from '../config/database.js';
import { writeInAppNotification } from './in-app-notifications.js';
import { fechaLarga, horaLegible } from './classes-bulk.js';

export interface HorarioDeClase {
    tipo: string;
    fecha: string;   // YYYY-MM-DD
    inicio: string;  // HH:MM
}

/** Tipo, fecha e inicio tal como están en la base (null si la clase no existe). */
export async function horarioDeClase(classId: string): Promise<HorarioDeClase | null> {
    return queryOne<HorarioDeClase>(
        `SELECT ct.name AS tipo, to_char(c.date, 'YYYY-MM-DD') AS fecha, to_char(c.start_time, 'HH24:MI') AS inicio
           FROM classes c JOIN class_types ct ON ct.id = c.class_type_id
          WHERE c.id = $1`,
        [classId],
    );
}

/** El aviso cuando cambió el día o la hora de inicio; null si no cambió ninguno. Pura. */
export function avisoCambioDeHorario(antes: HorarioDeClase, despues: HorarioDeClase): { title: string; body: string } | null {
    if (antes.fecha === despues.fecha && antes.inicio === despues.inicio) return null;
    if (antes.fecha === despues.fecha) {
        return {
            title: 'Tu clase cambió de hora',
            body: `${antes.tipo} del ${fechaLarga(antes.fecha)} ahora es a las ${horaLegible(despues.inicio)} (antes ${horaLegible(antes.inicio)}).`,
        };
    }
    return {
        title: 'Tu clase cambió de día',
        body: `${antes.tipo} del ${fechaLarga(antes.fecha)} a las ${horaLegible(antes.inicio)} ahora es el ${fechaLarga(despues.fecha)} a las ${horaLegible(despues.inicio)}.`,
    };
}

/** Manda el aviso a cada inscrita de la app (confirmada o en espera). Nunca lanza. Devuelve a cuántas. */
export async function avisarAlumnasDeLaApp(classId: string, aviso: { title: string; body: string }): Promise<number> {
    try {
        const alumnas = await query<{ user_id: string }>(
            `SELECT DISTINCT user_id FROM bookings
              WHERE class_id = $1 AND status IN ('confirmed', 'waitlist') AND channel = 'app'`,
            [classId],
        );
        for (const a of alumnas) {
            await writeInAppNotification({ userId: a.user_id, ...aviso, type: 'class_updated', data: { classId } });
        }
        return alumnas.length;
    } catch (e) {
        console.error('[avisos-clase] no se pudo avisar del cambio de horario:', e);
        return 0;
    }
}
```

- [ ] **Step 4: `PUT /:id` avisa; `bulk-delete` se va**

En `backend/src/routes/classes.ts`:

a) Después de `import { LoteSchema, procesarLote, enviarAvisosDelLote, ErrorLote } from '../lib/classes-bulk.js';` agregar:

```ts
import { avisarAlumnasDeLaApp, avisoCambioDeHorario, horarioDeClase } from '../lib/avisos-clase.js';
```

b) Borrar estas tres líneas sueltas (un encabezado de la ruta que se elimina, ~L157):

```ts
// ============================================
// POST /api/classes/bulk-delete - Delete empty classes in a date range
// ============================================
```

c) Borrar la ruta completa (y la línea en blanco que la sigue):

```ts
router.post('/bulk-delete', authenticate, requireRole('admin', 'super_admin'), async (req: Request, res: Response) => {
    try {
        const { startDate, endDate } = req.body;

        if (!startDate || !endDate) {
            return res.status(400).json({ error: 'Se requieren startDate y endDate' });
        }

        const result = await query<{ id: string }>(
            `DELETE FROM classes
             WHERE date >= $1 AND date <= $2
               AND current_bookings = 0
               AND status != 'cancelled'
             RETURNING id`,
            [startDate, endDate]
        );

        res.json({ deleted: result.length, message: `${result.length} clases eliminadas` });
    } catch (error) {
        console.error('Bulk delete classes error:', error);
        res.status(500).json({ error: 'Error al eliminar clases' });
    }
});
```

d) En `router.put('/:id', …)` cambiar:

```ts
        values.push(id);
        const result = await queryOne(
            `UPDATE classes SET ${updates.join(', ')}, updated_at = NOW()
             WHERE id = $${paramCount} RETURNING *`,
            values
        );
```

por:

```ts
        values.push(id);
        const horarioAntes = await horarioDeClase(id);
        const result = await queryOne(
            `UPDATE classes SET ${updates.join(', ')}, updated_at = NOW()
             WHERE id = $${paramCount} RETURNING *`,
            values
        );

        // Cambió el día o la hora: avisar a las alumnas de la app (in-app + push), igual
        // que los cambios en bloque. Sin esto la alumna llegaba a la hora vieja.
        const horarioDespues = await horarioDeClase(id);
        const avisoHorario = horarioAntes && horarioDespues ? avisoCambioDeHorario(horarioAntes, horarioDespues) : null;
        if (avisoHorario) void avisarAlumnasDeLaApp(id, avisoHorario);
```

- [ ] **Step 5: Correr las pruebas**

Run:

```bash
cd backend && npx tsc --noEmit && echo "tsc ok"
for t in test-avisos-clase test-classes-bulk test-totalpass-cableado test-class-type-capacity; do
  DATABASE_URL=postgresql://localhost:5432/casa_she npx tsx scripts/$t.ts 2>&1 | grep -E "^test-[a-z-]+: OK$" || echo "$t: FALLÓ"
done
git grep -n "bulk-delete" -- frontend/src backend/src
cd ../frontend && ./scripts/e2e-local.sh e2e/tests/admin-classes-bulk-api.spec.ts --project=chromium --workers=3
```

Expected: `tsc ok`; las cuatro `…: OK` (ningún `FALLÓ`); `git grep` sin salida; Playwright `1 passed`.

- [ ] **Step 6: Agregarla a `npm test`**

En `backend/package.json`, dentro del script `"test"`, cambiar `tsx scripts/test-classes-bulk.ts"` por:

```
tsx scripts/test-classes-bulk.ts && tsx scripts/test-avisos-clase.ts"
```

- [ ] **Step 7: Commit**

```bash
git add backend/src/lib/avisos-clase.ts backend/src/routes/classes.ts backend/scripts/test-avisos-clase.ts backend/package.json frontend/e2e/tests/admin-classes-bulk-api.spec.ts
git commit -m "fix(clases): fuera bulk-delete; editar avisa cuando cambia el horario

POST /api/classes/bulk-delete borraba clases (y con ellas el mapeo de
TotalPass, que las dejaba vivas allá); se reemplaza por cancelar en bloque.
Editar una clase ahora avisa a sus alumnas de la app si cambia el día o la
hora. Prueba de punta a punta de /bulk contra la base desechable.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Lógica pura de "Varias a la vez"

**Tipo:** código completo, se transcribe. Sin base ni navegador.

**Files:**
- Create: `frontend/src/pages/admin/classes/calendario/seleccion.ts`
- Test: `frontend/scripts/test-calendario-seleccion.ts`

**Interfaces:**
- Consumes: `lugaresDeClase`, `ClaseConLugares` de `frontend/src/pages/admin/classes/calendario/lugares.ts` (ya existen).
- Produces (en `seleccion.ts`, sin imports `@/`):
  - Tipos del endpoint: `AccionLote`, `ParametrosLote { instructorId?; canal?: 'totalpass'; lugares?; minutos?; classTypeId?; motivo? }`, `CuerpoLote extends ParametrosLote { classIds; accion; vistaPrevia }`, `ClaseDelLote`, `RespuestaLote` (mismos campos que el backend).
  - `interface ClaseSeleccionable` (lo mínimo de `Class` que se usa; `Class` de `@/types/class` la cumple).
  - `esSeleccionable(c)` (todas menos canceladas), `alternar(sel, id): Set<string>`, `alternarGrupo(sel, clasesDelDia): Set<string>` (si ya están todas las seleccionables del día las quita; si no, las agrega), `clasesSeleccionadas(sel, clases)` (por fecha y hora).
  - `atajosDesde(ancla, visibles): Array<{ etiqueta: string; ids: string[] }>`: "Mismo horario (8:00)", "Las de <coach>" (solo si tiene coach), "Todas las <tipo>", "Todo el <día>"; cada uno con las seleccionables a la vista que cumplen.
  - `resumenSeleccion(clases): { titulo: '4 clases' | 'Ninguna clase'; detalle: '9 inscritas · 2 de TotalPass' | 'Toca una clase para empezar'; inscritas; totalpass }`.
  - `listaSeleccion(clases)`: "Barre · lun 7:00, mié 7:00" (un tipo) o "Barre lun 7:00, Pilates Mat lun 8:00".
  - `quitarBloqueadas(sel, respuesta): Set<string>`.
  - `textoBoton(accion, params, n, nombres?)`, `textoHecho(accion, params, respuesta, nombres?)`, `textoAvisadas(accion, n)`, `duracion(minutos)`, `nClases(n)`, `horaCorta(hora)`, `fechaDeClase(c)`.
  - `inversaDe(accion, params, antes): Omit<CuerpoLote, 'vistaPrevia'> | null` (reglas de "Deshacer" de las Global Constraints).

- [ ] **Step 1: Escribir la prueba que falla**

Crear `frontend/scripts/test-calendario-seleccion.ts`:

```ts
// "Varias a la vez": selección, atajos desde la última clase tocada, textos de la barra
// y de los botones, y la acción inversa de "Deshacer".
// Correr con: npx tsx scripts/test-calendario-seleccion.ts
import assert from 'node:assert/strict';
import {
    alternar,
    alternarGrupo,
    atajosDesde,
    clasesSeleccionadas,
    duracion,
    inversaDe,
    listaSeleccion,
    quitarBloqueadas,
    resumenSeleccion,
    textoAvisadas,
    textoBoton,
    textoHecho,
    type ClaseSeleccionable,
    type RespuestaLote,
} from '../src/pages/admin/classes/calendario/seleccion.js';

const clase = (id: string, datos: Partial<ClaseSeleccionable>): ClaseSeleccionable => ({
    id, date: '2026-11-02', start_time: '07:00:00', status: 'scheduled', instructor_id: 'ana', instructor_name: 'Ana',
    class_type_id: 'barre', class_type_name: 'Barre', current_bookings: 0, max_capacity: 7, channels: [], ...datos,
});
// Lun 7:00 Barre Ana (3 inscritas, 1 de TotalPass) · Lun 8:00 Mat Sofía · Mié 7:00 Barre Ana · Mié 8:00 Barre Ana cancelada
const lun7 = clase('lun7', { current_bookings: 3, channels: [{ channel: 'totalpass', max: 2, booked: 1 }] });
const lun8 = clase('lun8', { start_time: '08:00:00', instructor_id: 'sofia', instructor_name: 'Sofía', class_type_id: 'mat', class_type_name: 'Pilates Mat', current_bookings: 2 });
const mie7 = clase('mie7', { date: '2026-11-04T00:00:00.000Z' });
const mie8 = clase('mie8', { date: '2026-11-04', start_time: '08:00', status: 'cancelled' });
const semana = [lun8, mie8, mie7, lun7];

// ── Selección ───────────────────────────────────────────────────────────────
assert.deepEqual([...alternar(new Set(), 'a')], ['a']);
assert.deepEqual([...alternar(new Set(['a', 'b']), 'a')], ['b']);
// Encabezado del día: agrega las seleccionables; si ya estaban todas, las quita. La cancelada nunca.
const lunes = [lun7, lun8];
assert.deepEqual([...alternarGrupo(new Set(['lun7']), lunes)].sort(), ['lun7', 'lun8']);
assert.deepEqual([...alternarGrupo(new Set(['lun7', 'lun8', 'mie7']), lunes)], ['mie7']);
assert.deepEqual([...alternarGrupo(new Set(), [mie7, mie8])], ['mie7']);
assert.deepEqual([...alternarGrupo(new Set(['x']), [mie8])], ['x'], 'un día sin seleccionables no cambia nada');
assert.deepEqual(clasesSeleccionadas(new Set(['mie7', 'lun8', 'lun7']), semana).map((c) => c.id), ['lun7', 'lun8', 'mie7']);
console.log('  selección: OK');

// ── Atajos ──────────────────────────────────────────────────────────────────
assert.deepEqual(atajosDesde(null, semana), []);
const atajos = atajosDesde(lun7, semana);
assert.deepEqual(atajos.map((a) => a.etiqueta), ['Mismo horario (7:00)', 'Las de Ana', 'Todas las Barre', 'Todo el lunes']);
assert.deepEqual(atajos.map((a) => a.ids.sort()), [['lun7', 'mie7'], ['lun7', 'mie7'], ['lun7', 'mie7'], ['lun7', 'lun8']], 'nunca la cancelada');
const sinCoach = atajosDesde(clase('x', { instructor_name: null, date: '2026-11-08' }), [mie7]);
assert.deepEqual(sinCoach.map((a) => a.etiqueta), ['Mismo horario (7:00)', 'Todas las Barre', 'Todo el domingo'], 'sin coach no hay "Las de…"');
console.log('  atajos: OK');

// ── Barra y lista ───────────────────────────────────────────────────────────
assert.deepEqual(resumenSeleccion([]), { titulo: 'Ninguna clase', detalle: 'Toca una clase para empezar', inscritas: 0, totalpass: 0 });
const r = resumenSeleccion([lun7, lun8]);
assert.equal(r.titulo, '2 clases');
assert.equal(r.detalle, '5 inscritas · 1 de TotalPass');
assert.equal(resumenSeleccion([lun7]).titulo, '1 clase');
assert.equal(listaSeleccion([lun7, mie7]), 'Barre · lun 7:00, mié 7:00');
assert.equal(listaSeleccion([lun7, lun8]), 'Barre lun 7:00, Pilates Mat lun 8:00');
assert.equal(listaSeleccion([]), 'Ninguna clase seleccionada');
console.log('  barra y lista: OK');

// ── Textos de las acciones ──────────────────────────────────────────────────
assert.equal(duracion(30), '30 min');
assert.equal(duracion(-60), '1 h');
assert.equal(duracion(90), '1 h 30 min');
assert.equal(textoBoton('coach', { instructorId: 's' }, 4, { coach: 'Sofía' }), 'Cambiar a Sofía en 4 clases');
assert.equal(textoBoton('cupo_canal', { canal: 'totalpass', lugares: 3 }, 1), 'Guardar 3 lugares en 1 clase');
assert.equal(textoBoton('cupo_canal', { canal: 'totalpass', lugares: 1 }, 2), 'Guardar 1 lugar en 2 clases');
assert.equal(textoBoton('mover', { minutos: 30 }, 2), 'Mover 2 clases 30 min más tarde');
assert.equal(textoBoton('mover', { minutos: -60 }, 2), 'Mover 2 clases 1 h antes');
assert.equal(textoBoton('mover', { minutos: 0, classTypeId: 'mat' }, 2, { tipo: 'Pilates Mat' }), 'Cambiar 2 clases a Pilates Mat');
assert.equal(textoBoton('mover', { minutos: 30, classTypeId: 'mat' }, 2, { tipo: 'Pilates Mat' }), 'Mover 2 clases 30 min más tarde y cambiarlas a Pilates Mat');
assert.equal(textoBoton('cancelar', {}, 3), 'Cancelar 3 clases');
const respuesta = (ok: number, alumnasAvisadas = 0): RespuestaLote => ({
    clases: [], resumen: { ok, bloqueadas: 0, alumnasAvisadas, sociasPierdenLugar: 0 }, aplicado: true,
});
assert.equal(textoHecho('coach', {}, respuesta(4, 9), { coach: 'Sofía' }), 'Listo: 4 clases ahora con Sofía. Avisamos a 9 alumnas.');
assert.equal(textoHecho('cancelar', {}, respuesta(1)), '1 clase cancelada. Siguen en el calendario, marcadas.');
assert.equal(textoHecho('cupo_canal', { lugares: 2 }, respuesta(3)), 'Guardado: 2 lugares para TotalPass en 3 clases.');
assert.equal(textoHecho('mover', { minutos: 30 }, respuesta(2, 1)), 'Listo: 2 clases actualizadas. Avisamos a 1 alumna.');
assert.equal(textoAvisadas('coach', 0), 'No hay alumnas inscritas que avisar.');
assert.equal(textoAvisadas('cancelar', 2), '2 alumnas recuperan su crédito y reciben aviso.');
assert.equal(textoAvisadas('mover', 1), 'Avisamos del cambio a 1 alumna por la app.');
console.log('  textos: OK');

// ── Quitar bloqueadas ───────────────────────────────────────────────────────
const conBloqueada: RespuestaLote = {
    clases: [
        { classId: 'lun7', estado: 'ok', alumnasAvisadas: 0, sociasPorCanal: {}, sociasPierdenLugar: 0, advertencias: [] },
        { classId: 'lun8', estado: 'bloqueada', motivo: 'Ya empezó.', alumnasAvisadas: 0, sociasPorCanal: {}, sociasPierdenLugar: 0, advertencias: [] },
    ],
    resumen: { ok: 1, bloqueadas: 1, alumnasAvisadas: 0, sociasPierdenLugar: 0 },
    aplicado: false,
};
assert.deepEqual([...quitarBloqueadas(new Set(['lun7', 'lun8']), conBloqueada)], ['lun7']);
console.log('  quitar bloqueadas: OK');

// ── Deshacer ────────────────────────────────────────────────────────────────
assert.deepEqual(inversaDe('coach', { instructorId: 'sofia' }, [lun7, mie7]), { classIds: ['lun7', 'mie7'], accion: 'coach', instructorId: 'ana' });
assert.equal(inversaDe('coach', { instructorId: 'pau' }, [lun7, lun8]), null, 'tenían coaches distintas');
assert.equal(inversaDe('coach', { instructorId: 'ana' }, [lun7]), null, 'no cambió nada');
assert.deepEqual(inversaDe('mover', { minutos: 30 }, [lun7, lun8]), { classIds: ['lun7', 'lun8'], accion: 'mover', minutos: -30 });
assert.deepEqual(inversaDe('mover', { minutos: -60, classTypeId: 'mat' }, [lun7, mie7]), { classIds: ['lun7', 'mie7'], accion: 'mover', minutos: 60, classTypeId: 'barre' });
assert.deepEqual(inversaDe('mover', { minutos: 0, classTypeId: 'mat' }, [lun7]), { classIds: ['lun7'], accion: 'mover', minutos: 0, classTypeId: 'barre' });
assert.equal(inversaDe('mover', { minutos: 30, classTypeId: 'flex' }, [lun7, lun8]), null, 'tenían tipos distintos');
assert.deepEqual(inversaDe('mover', { minutos: 30, classTypeId: 'barre' }, [lun7]), { classIds: ['lun7'], accion: 'mover', minutos: -30 }, 'el tipo no cambió');
assert.equal(inversaDe('cupo_canal', { canal: 'totalpass', lugares: 2 }, [lun7]), null);
assert.equal(inversaDe('cancelar', {}, [lun7]), null);
assert.equal(inversaDe('coach', { instructorId: 'x' }, []), null);
console.log('  deshacer: OK');

console.log('✅ test-calendario-seleccion OK');
```

- [ ] **Step 2: Correrla y ver que falla**

Run: `cd frontend && npx tsx scripts/test-calendario-seleccion.ts`
Expected: FAIL con `Cannot find module '…/calendario/seleccion.js'`.

- [ ] **Step 3: El módulo**

Crear `frontend/src/pages/admin/classes/calendario/seleccion.ts`:

```ts
/**
 * "Varias a la vez": qué clases están seleccionadas, los atajos que salen de la última
 * clase tocada, los textos de la barra y de los botones, y la acción inversa para
 * "Deshacer". También los tipos de POST /api/classes/bulk.
 *
 * Sin imports con alias "@/": lo prueba frontend/scripts/test-calendario-seleccion.ts.
 */
import { lugaresDeClase, type ClaseConLugares } from './lugares';

export interface ClaseSeleccionable extends ClaseConLugares {
    id: string;
    /** YYYY-MM-DD (puede venir con hora: "2026-11-04T00:00:00.000Z"). */
    date: string;
    start_time: string;
    status?: string | null;
    instructor_id: string;
    instructor_name?: string | null;
    class_type_id: string;
    class_type_name?: string | null;
}

// ── POST /api/classes/bulk ───────────────────────────────────────────────────

export type AccionLote = 'coach' | 'cupo_canal' | 'mover' | 'cancelar';

export interface ParametrosLote {
    instructorId?: string;
    canal?: 'totalpass';
    lugares?: number;
    minutos?: number;
    classTypeId?: string;
    motivo?: string;
}

export interface CuerpoLote extends ParametrosLote {
    classIds: string[];
    accion: AccionLote;
    vistaPrevia: boolean;
}

export interface ClaseDelLote {
    classId: string;
    estado: 'ok' | 'bloqueada';
    motivo?: string;
    alumnasAvisadas: number;
    sociasPorCanal: Record<string, number>;
    sociasPierdenLugar: number;
    advertencias: string[];
}

export interface RespuestaLote {
    clases: ClaseDelLote[];
    resumen: { ok: number; bloqueadas: number; alumnasAvisadas: number; sociasPierdenLugar: number };
    aplicado: boolean;
}

// ── Formatos ─────────────────────────────────────────────────────────────────

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const DIAS_CORTOS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

export const fechaDeClase = (c: { date: string }) => (c.date || '').slice(0, 10);
const diaDeLaSemana = (fecha: string) => new Date(`${fecha}T12:00:00Z`).getUTCDay();
/** "08:00" o "08:00:00" → "8:00". */
export const horaCorta = (hora: string) => `${Number((hora || '').slice(0, 2))}:${(hora || '').slice(3, 5)}`;
/** "1 clase", "4 clases". */
export const nClases = (n: number) => `${n} ${n === 1 ? 'clase' : 'clases'}`;
const nAlumnas = (n: number) => `${n} ${n === 1 ? 'alumna' : 'alumnas'}`;
const clave = (c: ClaseSeleccionable) => `${fechaDeClase(c)} ${(c.start_time || '').slice(0, 5)}`;

/** Las canceladas se ven pero no se seleccionan. */
export const esSeleccionable = (c: { status?: string | null }) => c.status !== 'cancelled';

// ── Selección ────────────────────────────────────────────────────────────────

/** Marca o desmarca una clase. */
export function alternar(sel: ReadonlySet<string>, id: string): Set<string> {
    const nueva = new Set(sel);
    if (nueva.has(id)) nueva.delete(id);
    else nueva.add(id);
    return nueva;
}

/** Encabezado del día: si ya están todas las seleccionables del día, las quita; si no, las agrega. */
export function alternarGrupo(sel: ReadonlySet<string>, clases: ClaseSeleccionable[]): Set<string> {
    const ids = clases.filter(esSeleccionable).map((c) => c.id);
    const nueva = new Set(sel);
    const todas = ids.length > 0 && ids.every((id) => nueva.has(id));
    for (const id of ids) {
        if (todas) nueva.delete(id);
        else nueva.add(id);
    }
    return nueva;
}

/** Las clases seleccionadas que están a la vista, por día y hora. */
export function clasesSeleccionadas<T extends ClaseSeleccionable>(sel: ReadonlySet<string>, clases: T[]): T[] {
    return clases.filter((c) => sel.has(c.id)).sort((a, b) => clave(a).localeCompare(clave(b)));
}

export interface Atajo {
    etiqueta: string;
    ids: string[];
}

/**
 * Atajos según la última clase tocada: "Mismo horario (8:00)", "Las de Ana",
 * "Todas las Barre", "Todo el miércoles". Cada uno REEMPLAZA la selección por las
 * clases seleccionables a la vista que cumplen.
 */
export function atajosDesde(ancla: ClaseSeleccionable | null | undefined, visibles: ClaseSeleccionable[]): Atajo[] {
    if (!ancla) return [];
    const activas = visibles.filter(esSeleccionable);
    const ids = (f: (c: ClaseSeleccionable) => boolean) => activas.filter(f).map((c) => c.id);
    const hora = (ancla.start_time || '').slice(0, 5);
    const dia = fechaDeClase(ancla);
    const coach = ancla.instructor_name?.trim();
    const atajos: Atajo[] = [{ etiqueta: `Mismo horario (${horaCorta(hora)})`, ids: ids((c) => (c.start_time || '').slice(0, 5) === hora) }];
    if (coach) atajos.push({ etiqueta: `Las de ${coach}`, ids: ids((c) => c.instructor_id === ancla.instructor_id) });
    atajos.push({ etiqueta: `Todas las ${ancla.class_type_name || 'de este tipo'}`, ids: ids((c) => c.class_type_id === ancla.class_type_id) });
    atajos.push({ etiqueta: `Todo el ${DIAS[diaDeLaSemana(dia)]}`, ids: ids((c) => fechaDeClase(c) === dia) });
    return atajos;
}

/** Barra inferior: "4 clases" y "9 inscritas · 2 de TotalPass". */
export function resumenSeleccion(clases: ClaseSeleccionable[]): { titulo: string; detalle: string; inscritas: number; totalpass: number } {
    let inscritas = 0;
    let totalpass = 0;
    for (const c of clases) {
        const l = lugaresDeClase(c);
        inscritas += l.ocupados;
        totalpass += l.porCanal.find((x) => x.canal === 'totalpass')?.reservados ?? 0;
    }
    if (clases.length === 0) return { titulo: 'Ninguna clase', detalle: 'Toca una clase para empezar', inscritas, totalpass };
    return { titulo: nClases(clases.length), detalle: `${inscritas} inscritas · ${totalpass} de TotalPass`, inscritas, totalpass };
}

/** "Barre · lun 7:00, mié 8:00" si son del mismo tipo; si no, "Barre lun 7:00, Sculpt mié 8:00". */
export function listaSeleccion(clases: ClaseSeleccionable[]): string {
    if (clases.length === 0) return 'Ninguna clase seleccionada';
    const cuando = (c: ClaseSeleccionable) => `${DIAS_CORTOS[diaDeLaSemana(fechaDeClase(c))]} ${horaCorta(c.start_time)}`;
    const tipos = new Set(clases.map((c) => c.class_type_name || 'Clase'));
    if (tipos.size === 1) return `${[...tipos][0]} · ${clases.map(cuando).join(', ')}`;
    return clases.map((c) => `${c.class_type_name || 'Clase'} ${cuando(c)}`).join(', ');
}

/** Quita de la selección las que el servidor marcó como bloqueadas. */
export function quitarBloqueadas(sel: ReadonlySet<string>, r: RespuestaLote): Set<string> {
    const bloqueadas = new Set(r.clases.filter((c) => c.estado === 'bloqueada').map((c) => c.classId));
    return new Set([...sel].filter((id) => !bloqueadas.has(id)));
}

// ── Textos de las acciones ───────────────────────────────────────────────────

/** 30 → "30 min", 60 → "1 h", 90 → "1 h 30 min". */
export function duracion(minutos: number): string {
    const m = Math.abs(minutos);
    const h = Math.floor(m / 60);
    const resto = m % 60;
    return [h ? `${h} h` : '', resto ? `${resto} min` : ''].filter(Boolean).join(' ');
}

/** Lo que dice el botón de aplicar: exactamente lo que va a pasar. */
export function textoBoton(accion: AccionLote, p: ParametrosLote, n: number, nombres: { coach?: string; tipo?: string } = {}): string {
    const clases = nClases(n);
    if (accion === 'coach') return `Cambiar a ${nombres.coach ?? 'la coach'} en ${clases}`;
    if (accion === 'cupo_canal') return `Guardar ${p.lugares} ${p.lugares === 1 ? 'lugar' : 'lugares'} en ${clases}`;
    if (accion === 'cancelar') return `Cancelar ${clases}`;
    const m = p.minutos ?? 0;
    const mover = m === 0 ? '' : `${duracion(m)} ${m > 0 ? 'más tarde' : 'antes'}`;
    if (mover && p.classTypeId) return `Mover ${clases} ${mover} y cambiarlas a ${nombres.tipo ?? 'otro tipo'}`;
    if (mover) return `Mover ${clases} ${mover}`;
    return `Cambiar ${clases} a ${nombres.tipo ?? 'otro tipo'}`;
}

/** Aviso al terminar. */
export function textoHecho(accion: AccionLote, p: ParametrosLote, r: RespuestaLote, nombres: { coach?: string } = {}): string {
    const clases = nClases(r.resumen.ok);
    const avisadas = r.resumen.alumnasAvisadas ? ` Avisamos a ${nAlumnas(r.resumen.alumnasAvisadas)}.` : '';
    if (accion === 'coach') return `Listo: ${clases} ahora con ${nombres.coach ?? 'la coach nueva'}.${avisadas}`;
    if (accion === 'cupo_canal') return `Guardado: ${p.lugares} ${p.lugares === 1 ? 'lugar' : 'lugares'} para TotalPass en ${clases}.`;
    if (accion === 'cancelar') return `${clases} ${r.resumen.ok === 1 ? 'cancelada' : 'canceladas'}. Siguen en el calendario, marcadas.`;
    return `Listo: ${clases} ${r.resumen.ok === 1 ? 'actualizada' : 'actualizadas'}.${avisadas}`;
}

/** Impacto en alumnas de la app según la vista previa. */
export function textoAvisadas(accion: AccionLote, n: number): string {
    if (accion === 'cupo_canal') return 'Las alumnas no reciben aviso: solo cambia el cupo de TotalPass.';
    if (n === 0) return 'No hay alumnas inscritas que avisar.';
    if (accion === 'cancelar') return `${nAlumnas(n)} ${n === 1 ? 'recupera su crédito y recibe' : 'recuperan su crédito y reciben'} aviso.`;
    return `Avisamos del cambio a ${nAlumnas(n)} por la app.`;
}

/**
 * La llamada que deshace un cambio, o null si no cabe en una sola: coach, solo si todas
 * tenían la misma coach antes; mover, con −minutos y, si cambió el tipo, solo si todas
 * tenían el mismo tipo antes. Cupo y cancelar no se deshacen.
 */
export function inversaDe(accion: AccionLote, p: ParametrosLote, antes: ClaseSeleccionable[]): Omit<CuerpoLote, 'vistaPrevia'> | null {
    if (antes.length === 0) return null;
    const classIds = antes.map((c) => c.id);
    if (accion === 'coach') {
        const coaches = new Set(antes.map((c) => c.instructor_id));
        const [anterior] = [...coaches];
        if (coaches.size !== 1 || anterior === p.instructorId) return null;
        return { classIds, accion: 'coach', instructorId: anterior };
    }
    if (accion === 'mover') {
        const minutos = p.minutos ? -p.minutos : 0;
        const tipos = new Set(antes.map((c) => c.class_type_id));
        const [tipoAnterior] = [...tipos];
        const cambioTipo = !!p.classTypeId && !(tipos.size === 1 && tipoAnterior === p.classTypeId);
        if (cambioTipo && tipos.size !== 1) return null;
        if (!cambioTipo && minutos === 0) return null;
        return { classIds, accion: 'mover', minutos, ...(cambioTipo ? { classTypeId: tipoAnterior } : {}) };
    }
    return null;
}
```

- [ ] **Step 4: Correr la prueba y el typecheck**

Run:

```bash
cd frontend && npx tsx scripts/test-calendario-seleccion.ts
npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -E "error TS" | grep -vE "FilterPills.tsx\(124|push.ts\(47|Events.tsx\((259|906)"
```

Expected: las secciones `selección`, `atajos`, `barra y lista`, `textos`, `quitar bloqueadas`, `deshacer` con `OK` y `✅ test-calendario-seleccion OK`; el typecheck sin salida.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/admin/classes/calendario/seleccion.ts frontend/scripts/test-calendario-seleccion.ts
git commit -m "feat(calendario): lógica de seleccionar varias clases

Selección, atajos según la última clase tocada, textos de la barra y de los
botones, y la acción inversa de Deshacer (solo coach y mover cuando cabe en
una llamada). Módulo puro con su prueba.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: "Seleccionar varias" en la rejilla y tarjeta de 50 min legible

**Tipo:** código completo, se transcribe. Prueba con Playwright (arnés).

**Files:**
- Modify: `frontend/src/pages/admin/classes/calendario/TarjetaClase.tsx` (archivo completo)
- Modify: `frontend/src/pages/admin/classes/calendario/RejillaSemana.tsx` (archivo completo)
- Modify: `frontend/src/pages/admin/classes/calendario/EncabezadoDia.tsx` (archivo completo)
- Modify: `frontend/src/pages/admin/classes/ClassesCalendar.tsx` (imports, estado, botón, franja de atajos, props de la rejilla)
- Test: `frontend/e2e/tests/admin-classes.spec.ts` (describe nuevo al final)

**Interfaces:**
- Consumes (Task 5): `alternar`, `alternarGrupo`, `atajosDesde`, `clasesSeleccionadas` de `./calendario/seleccion`.
- Produces: `TarjetaClase` acepta `seleccionable?: boolean` y `seleccionada?: boolean` (casilla `[data-casilla]` arriba a la derecha, `aria-pressed`, anillo verde). Marcas para pruebas: `[data-hora]`, `[data-coach]`, `[data-puntos]`, `[data-cupo]`. En la rejilla: puntos de 7 px con 2 px de aire, renglones de alto fijo (nombre 18 px, coach 14 px, puntos 14 px) que no se encogen: en una clase de 50 min se ven nombre, coach, los 7 puntos y "3/7"/"Lleno" con columnas de 120 a 140 px.
- Produces: `RejillaSemana` acepta `seleccion?: { ids: ReadonlySet<string>; onAlternarClase(clase: Class): void; onAlternarDia(dia: Date, clases: Class[]): void }`. Con `seleccion`, clic en tarjeta → `onAlternarClase` (las canceladas no hacen nada y no llevan casilla) y clic en el encabezado → `onAlternarDia`; sin `seleccion`, todo como hoy.
- Produces: `EncabezadoDia` acepta `modoSeleccion?: boolean` (`aria-label` "Seleccionar todo el miércoles").
- Produces (en `ClassesCalendar`): estado `modoSeleccion`, `seleccion: Set<string>`, `ancla: string | null`; valores derivados `clasesVisibles` (clases de la semana con los filtros), `seleccionadas = clasesSeleccionadas(seleccion, clasesVisibles)`, `atajos`; `terminarSeleccion()`. Cambiar de semana limpia la selección. La Task 7 usa `seleccionadas`, `setSeleccion`, `modoSeleccion` y `terminarSeleccion`.

- [ ] **Step 1: Escribir las pruebas que fallan**

Al final de `frontend/e2e/tests/admin-classes.spec.ts` agregar:

```ts
test.describe("Calendario de recepción – varias a la vez", () => {
  test("seleccionar: casillas, atajos de la última clase y día completo", async ({ adminPage: page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await mockSemanaCalendario(page);
    await page.goto(`/admin/calendar?date=${FECHA_PRUEBA}`);
    const barre = page.getByRole("button", { name: /^Barre.*07:00/ });
    const mat = page.getByRole("button", { name: /^Pilates Mat.*08:00/ });
    const sculpt = page.getByRole("button", { name: /^Sculpt.*18:00/ });
    const cancelada = page.getByRole("button", { name: /^Sculpt.*19:00/ });
    await expect(barre).toBeVisible();

    await page.getByRole("button", { name: "Seleccionar varias" }).click();
    await barre.click();
    await expect(barre).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("dialog")).toHaveCount(0); // en modo selección no abre el panel

    const atajos = page.getByRole("group", { name: "Atajos de selección" });
    await expect(atajos.getByRole("button")).toHaveText(["Mismo horario (7:00)", "Las de Ana", "Todas las Barre", "Todo el lunes", "Quitar selección"]);
    await atajos.getByRole("button", { name: "Todo el lunes" }).click();
    await expect(mat).toHaveAttribute("aria-pressed", "true");

    // Encabezado del miércoles: marca la activa y nunca la cancelada; otro clic la quita.
    const miercoles = page.getByTestId("encabezado-2026-11-04");
    await expect(miercoles).toHaveAttribute("aria-label", "Seleccionar todo el miércoles");
    await miercoles.click();
    await expect(sculpt).toHaveAttribute("aria-pressed", "true");
    expect(await cancelada.getAttribute("aria-pressed")).toBeNull();
    await miercoles.click();
    await expect(sculpt).toHaveAttribute("aria-pressed", "false");

    await atajos.getByRole("button", { name: "Quitar selección" }).click();
    await expect(barre).toHaveAttribute("aria-pressed", "false");
    await expect(mat).toHaveAttribute("aria-pressed", "false");

    // Cambiar de semana limpia la selección (nunca se aplica a clases que ya no se ven).
    await barre.click();
    await page.getByRole("button", { name: "Semana siguiente" }).click();
    await page.getByRole("button", { name: "Semana anterior" }).click();
    await expect(barre).toHaveAttribute("aria-pressed", "false");

    // Al terminar, la tarjeta vuelve a abrir el panel y el encabezado a crear clase.
    await page.getByRole("button", { name: "Terminar selección" }).first().click();
    await expect(atajos).toHaveCount(0);
    await barre.click();
    await expect(page.getByRole("dialog")).toBeVisible();
  });

  test("tarjeta de 50 min: nombre, coach, 7 puntos y cupo a 120 y 140 px de columna", async ({ adminPage: page }) => {
    await mockSemanaCalendario(page);
    await page.setViewportSize({ width: 1100, height: 900 });
    await page.goto(`/admin/calendar?date=${FECHA_PRUEBA}`);
    await page.getByRole("button", { name: "Seleccionar varias" }).click(); // con la casilla visible

    for (const [ancho, columnaMaxima] of [[1100, 125], [1366, 150]] as const) {
      await page.setViewportSize({ width: ancho, height: 900 });
      const columna = page.getByTestId("columna-2026-11-02");
      await expect.poll(async () => (await columna.boundingBox())?.width ?? 0).toBeLessThanOrEqual(columnaMaxima);
      for (const nombre of [/^Barre.*07:00/, /^Pilates Mat.*08:00/]) {
        const tarjeta = page.getByRole("button", { name: nombre });
        const caja = (await tarjeta.boundingBox())!;
        const coach = (await tarjeta.locator("[data-coach]").boundingBox())!;
        const nombreClase = (await tarjeta.locator("[data-nombre-clase]").boundingBox())!;
        const hora = (await tarjeta.locator("[data-hora]").boundingBox())!;
        const casilla = (await tarjeta.locator("[data-casilla]").boundingBox())!;
        const puntos = tarjeta.locator("[data-puntos]");
        const ultimo = (await puntos.locator("[data-lugar]").last().boundingBox())!;
        const cupo = (await tarjeta.locator("[data-cupo]").boundingBox())!;
        const dentro = (b: { y: number; height: number }) => b.y >= caja.y && b.y + b.height <= caja.y + caja.height + 0.5;
        await expect(puntos.locator("[data-lugar]")).toHaveCount(7);
        expect(nombreClase.height, `nombre visible a ${ancho}px`).toBeGreaterThanOrEqual(14);
        expect(coach.height, `coach visible a ${ancho}px`).toBeGreaterThanOrEqual(12);
        expect(dentro(coach) && dentro(cupo) && dentro(ultimo), `todo dentro de la tarjeta a ${ancho}px`).toBe(true);
        expect(ultimo.x + ultimo.width, `el 7.º punto no se recorta a ${ancho}px`).toBeLessThanOrEqual((await puntos.boundingBox())!.x + (await puntos.boundingBox())!.width + 0.5);
        expect(ultimo.x + ultimo.width).toBeLessThanOrEqual(cupo.x);
        expect(cupo.x + cupo.width).toBeLessThanOrEqual(caja.x + caja.width);
        expect(casilla.x >= hora.x + hora.width || casilla.y >= hora.y + hora.height, `la casilla no tapa la hora a ${ancho}px`).toBe(true);
      }
      await columna.screenshot({ path: test.info().outputPath(`tarjetas-${ancho}.png`) });
    }
  });
});
```

- [ ] **Step 2: Correrlas y ver que fallan**

Run: `cd frontend && ./scripts/e2e-local.sh e2e/tests/admin-classes.spec.ts --project=chromium --workers=3 -g "varias a la vez"`
Expected: las dos FAIL: la primera no encuentra el botón "Seleccionar varias"; la segunda, tampoco (y sin él la tarjeta de 50 min aplasta la línea de la coach a ~4 px).

- [ ] **Step 3: La tarjeta**

Reemplazar `frontend/src/pages/admin/classes/calendario/TarjetaClase.tsx` completo por:

```tsx
import type { ButtonHTMLAttributes, CSSProperties } from 'react';
import { Check, Lock } from 'lucide-react';
import { ClassIntensity, isClassIntensity } from '@/components/classes/ClassIntensity';
import { PuntoLugar } from '@/components/brands/ChannelDot';
import { cn } from '@/lib/utils';
import type { Class } from '@/types/class';
import { formatClassTime } from './formato';
import { MAX_PUNTOS_TARJETA, estiloDeLugar, etiquetaCupo, lugaresDeClase, type Lugar } from './lugares';
import { bordeDeTarjeta, colorPuntoAlumna, fondoDeTarjeta } from './colores';

/** Salsa usa otra bolsa de créditos: su tarjeta va oscura para no confundirla con Clases. */
const SALSA = { fondo: '#2E1B22', alumna: '#F6F0E4', sinCoach: '#F2B8AC' };

export interface TarjetaClaseProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'type'> {
    clase: Class;
    /** 'rejilla': semana por horas (quien la posiciona pone top y alto). 'lista': día en móvil. */
    variante: 'rejilla' | 'lista';
    /** Solo en rejilla: cabe completa (nombre, coach y lugares). Si no, va en una sola línea. */
    completa?: boolean;
    /** Modo "Seleccionar varias": la tarjeta muestra su casilla y es un botón que se marca. */
    seleccionable?: boolean;
    seleccionada?: boolean;
}

const claveDeLugar = (l: Lugar) => (l.tipo === 'canal' ? l.canal : l.tipo);

/**
 * Tarjeta de una clase: nombre con intensidad, hora, coach y los lugares como puntos
 * (alumnas de Casa Shé con el color del tipo, cada plataforma con el suyo, libres huecos).
 * Los props de botón pasan tal cual. En modo "Seleccionar varias" muestra su casilla (`seleccionable`, `seleccionada`).
 */
export function TarjetaClase({ clase, variante, completa = true, seleccionable = false, seleccionada = false, className, style, ...boton }: TarjetaClaseProps) {
    const lugares = lugaresDeClase(clase);
    const cancelada = clase.status === 'cancelled';
    const oscura = clase.category === 'reformer';
    const enLista = variante === 'lista';
    const unaLinea = !enLista && !completa;
    const coach = clase.instructor_name?.trim() || '';
    const hora = formatClassTime(clase.start_time);
    const colorAlumna = oscura ? SALSA.alumna : colorPuntoAlumna(clase.class_type_color);
    const fondo = oscura ? 'oscuro' : 'claro';
    // En la rejilla los puntos van de 7 px con 2 px de aire: así caben 7 lugares y "Lleno"
    // en una columna de 120 px (laptop de 1280 con la barra lateral abierta).
    const tamanoPunto = enLista ? 10 : 7;
    const colorSinCoach = oscura ? SALSA.sinCoach : 'hsl(var(--destructive))';

    const aria = [
        `${clase.class_type_name || 'Clase'}${isClassIntensity(clase.intensity) ? `, Intensidad ${clase.intensity} de 3` : ''}`,
        hora,
        coach || 'sin coach asignada',
        cancelada ? 'cancelada' : `${lugares.ocupados} de ${lugares.capacidad} lugares`,
        clase.is_free ? 'gratis' : '',
        clase.booking_closed && !cancelada ? 'cupo cerrado' : '',
    ].filter(Boolean).join(', ');

    const marco: CSSProperties = {
        backgroundColor: oscura ? SALSA.fondo : fondoDeTarjeta(clase.class_type_color),
        borderColor: oscura ? SALSA.fondo : bordeDeTarjeta(clase.class_type_color),
        // En una línea no cabe "Sin coach asignada": la falta de coach se marca con el borde izquierdo.
        ...(unaLinea && !coach ? { borderLeftColor: colorSinCoach, borderLeftWidth: 3 } : {}),
        ...style,
    };

    const cupo = (
        <span data-cupo className={cn('ml-auto shrink-0 tabular-nums', enLista ? 'text-sm' : 'text-[11px] leading-[14px]', lugares.lleno ? 'font-bold' : 'font-medium')}>
            {etiquetaCupo(lugares)}
        </span>
    );

    return (
        <button
            type="button"
            {...boton}
            aria-label={aria}
            aria-pressed={seleccionable ? seleccionada : undefined}
            data-clase={clase.id}
            data-oscura={oscura ? 'true' : undefined}
            className={cn(
                'relative flex w-full min-w-0 flex-col overflow-hidden rounded-[10px] border text-left font-body transition-shadow duration-150',
                'hover:shadow-[0_10px_24px_-16px_rgba(22,38,26,.55)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-casa-verde focus-visible:ring-offset-1',
                // Rejilla: cada renglón con su alto fijo y sin encogerse; antes el de la coach
                // (truncate = overflow oculto) se aplastaba a 0 en las clases de 50 min.
                enLista ? 'gap-2 p-4' : unaLinea ? 'justify-center px-1.5 py-0.5' : 'justify-between px-1.5 py-1',
                oscura ? 'text-casa-avena' : 'text-casa-ciruela',
                cancelada && 'opacity-50',
                seleccionada && 'ring-2 ring-casa-verde ring-offset-1',
                className,
            )}
            style={marco}
        >
            {seleccionable && (
                <span
                    aria-hidden="true"
                    data-casilla
                    className={cn(
                        'absolute right-1 top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full border',
                        seleccionada ? 'border-casa-verde bg-casa-verde text-casa-avena' : 'border-[#9C8E80] bg-[#FCF8EF]',
                    )}
                >
                    {seleccionada && <Check className="h-2.5 w-2.5" strokeWidth={3.5} />}
                </span>
            )}
            <span className={cn('flex w-full min-w-0 shrink-0 items-baseline gap-1.5', seleccionable && !enLista && 'pr-4')}>
                <span
                    data-nombre-clase
                    className={cn('flex min-w-0 items-center gap-1 font-heading', enLista ? 'text-lg leading-tight' : 'text-[14px] leading-[18px]', cancelada && 'line-through')}
                >
                    <span className="truncate">{clase.class_type_name}</span>
                    <ClassIntensity intensity={clase.intensity} />
                    {clase.booking_closed && !cancelada && <Lock className="h-3 w-3 shrink-0 opacity-70" aria-hidden="true" />}
                </span>
                <span data-hora className={cn('shrink-0 tabular-nums opacity-75', enLista ? 'text-sm' : 'text-[11px]')}>{hora}</span>
                {unaLinea && !cancelada && cupo}
            </span>

            {!unaLinea && (
                <span
                    data-coach
                    className={cn('w-full shrink-0 truncate', enLista ? 'text-sm' : 'text-[11px] leading-[14px]', !coach && 'font-semibold')}
                    style={coach ? undefined : { color: colorSinCoach }}
                >
                    {coach || 'Sin coach asignada'}
                </span>
            )}

            {!unaLinea && (cancelada ? (
                <span className="shrink-0 text-[11px] font-semibold leading-[14px]">Cancelada</span>
            ) : (
                <span className={cn('flex w-full min-w-0 shrink-0 items-center', enLista ? 'gap-[3px]' : 'gap-[2px]')}>
                    {lugares.lugares.length <= MAX_PUNTOS_TARJETA ? (
                        // Con muchos lugares en columnas angostas los puntos se recortan; el cupo ("3/7") siempre se ve.
                        <span data-puntos className={cn('flex min-w-0 items-center overflow-hidden', enLista ? 'gap-[3px]' : 'gap-[2px]')}>
                            {lugares.lugares.map((l, i) => {
                                const e = estiloDeLugar(l, colorAlumna, fondo);
                                return <PuntoLugar key={i} relleno={e.relleno} anillo={e.anillo} tamano={tamanoPunto} data-lugar={claveDeLugar(l)} />;
                            })}
                        </span>
                    ) : (
                        // Cupo grande: los puntos no caben; se cuentan por tipo.
                        <span className="flex items-center gap-1 text-[11px] tabular-nums">
                            <PuntoLugar {...estiloDeLugar({ tipo: 'alumna' }, colorAlumna, fondo)} tamano={tamanoPunto} data-lugar="alumna" />
                            {lugares.alumnas}
                            {lugares.porCanal.map((x) => (
                                <span key={x.canal} className="ml-1 flex items-center gap-1">
                                    <PuntoLugar {...estiloDeLugar({ tipo: 'canal', canal: x.canal }, colorAlumna, fondo)} tamano={tamanoPunto} data-lugar={x.canal} />
                                    {x.reservados}
                                </span>
                            ))}
                        </span>
                    )}
                    {clase.is_free && (
                        <span className="ml-1 shrink-0 rounded-full bg-emerald-700 px-1.5 text-[9px] font-semibold uppercase tracking-wider text-white">Gratis</span>
                    )}
                    {cupo}
                </span>
            ))}
        </button>
    );
}
```

- [ ] **Step 4: La rejilla y el encabezado del día**

Reemplazar `frontend/src/pages/admin/classes/calendario/RejillaSemana.tsx` completo por:

```tsx
import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import type { Class } from '@/types/class';
import { DAYS } from './formato';
import { EncabezadoDia } from './EncabezadoDia';
import { TarjetaClase } from './TarjetaClase';
import { resumenDeClases, textoResumenDia } from './lugares';
import { ALTO_HORA, ahoraEnCdmx, carriles, construirRejilla, intervaloDeClase, lineaAhora, posicionDeClase } from './rejilla';

export interface RejillaSemanaProps {
    /** Lunes a domingo. */
    dias: Date[];
    /** Clases ya filtradas de un día. */
    clasesDelDia: (dia: Date) => Class[];
    diasCerrados: Set<string>;
    motivoCierre: (dia: Date) => string | undefined;
    onClickClase: (clase: Class) => void;
    onClickDia: (dia: Date) => void;
    /**
     * Modo "Seleccionar varias": clic en una tarjeta la marca o desmarca (las canceladas no
     * se seleccionan) y clic en el encabezado del día marca o desmarca todo el día.
     */
    seleccion?: {
        ids: ReadonlySet<string>;
        onAlternarClase: (clase: Class) => void;
        onAlternarDia: (dia: Date, clases: Class[]) => void;
    };
}

/** Fecha y minuto actuales en CDMX; se refresca cada minuto para mover la línea de "ahora". */
function useAhoraCdmx() {
    const [ahora, setAhora] = useState(() => ahoraEnCdmx(new Date()));
    useEffect(() => {
        const id = window.setInterval(() => setAhora(ahoraEnCdmx(new Date())), 60_000);
        return () => window.clearInterval(id);
    }, []);
    return ahora;
}

const LINEA_DE_HORA = `repeating-linear-gradient(to bottom, transparent 0, transparent ${ALTO_HORA - 1}px, #ECE6D6 ${ALTO_HORA - 1}px, #ECE6D6 ${ALTO_HORA}px)`;
const RAYADO_FRANJA = 'repeating-linear-gradient(135deg, #F1E9D8 0, #F1E9D8 5px, transparent 5px, transparent 11px)';

/**
 * Semana por horas (escritorio): eje de horas a la izquierda y una columna por día.
 * Cada clase va a la altura de su hora de inicio y mide lo que dura; las horas sin
 * clases en toda la semana se compactan en una franja. Línea de "ahora" en el día de hoy.
 */
export function RejillaSemana({ dias, clasesDelDia, diasCerrados, motivoCierre, onClickClase, onClickDia, seleccion }: RejillaSemanaProps) {
    const ahora = useAhoraCdmx();
    const columnas = dias.map((dia) => ({ dia, clave: format(dia, 'yyyy-MM-dd'), clases: clasesDelDia(dia) }));
    const rejilla = construirRejilla(columnas.flatMap((c) => c.clases));
    const linea = lineaAhora(rejilla, columnas.map((c) => c.clave), ahora);

    return (
        <div className="overflow-x-auto rounded-[18px] border border-casa-arena bg-[hsl(var(--admin-panel))]">
            {/* 60 px de eje + 7 días de ~120 px: cabe en una laptop de 1280 con la barra lateral
                abierta. Si aun así hay scroll, el eje de horas se queda fijo a la izquierda
                (fondo opaco del panel; por encima de las tarjetas, por debajo de los diálogos). */}
            <div className="flex min-w-[900px]">
                <div className="sticky left-0 z-[5] w-[60px] flex-none border-r border-casa-arena/60 bg-[hsl(var(--admin-panel))]">
                    <div className="h-[68px] border-b border-casa-arena" />
                    <div className="relative" style={{ height: rejilla.altoTotal }}>
                        {rejilla.horas.map((h) => (
                            <span key={h.minuto} className="absolute right-2.5 pt-1 text-xs tabular-nums text-casa-ciruela/70" style={{ top: h.top }}>
                                {h.etiqueta}
                            </span>
                        ))}
                        {rejilla.tramos.map((t) => t.tipo === 'franja' && (
                            <span
                                key={t.desde}
                                data-testid="franja-compactada"
                                title="Horas sin clases en toda la semana"
                                className="absolute inset-x-0 flex items-center justify-center text-[11px] text-casa-ciruela/55"
                                style={{ top: t.top, height: t.alto }}
                            >
                                {t.etiqueta}
                            </span>
                        ))}
                    </div>
                </div>

                {columnas.map(({ dia, clave, clases }, i) => {
                    const cerrado = diasCerrados.has(clave);
                    const esHoy = clave === ahora.fecha;
                    const lanes = carriles(clases.flatMap((c) => {
                        const iv = intervaloDeClase(c);
                        return iv ? [{ id: c.id, ...iv }] : [];
                    }));
                    return (
                        <div
                            key={clave}
                            className={cn('min-w-0 flex-1 border-r border-casa-arena/60 last:border-r-0', esHoy && 'bg-casa-verde/[0.03]', cerrado && 'bg-destructive/5')}
                        >
                            <EncabezadoDia
                                fecha={dia}
                                etiqueta={DAYS[i]}
                                esHoy={esHoy}
                                cerrado={cerrado}
                                motivoCierre={motivoCierre(dia)}
                                resumen={textoResumenDia(resumenDeClases(clases))}
                                modoSeleccion={!!seleccion}
                                onClick={() => (seleccion ? seleccion.onAlternarDia(dia, clases) : onClickDia(dia))}
                            />
                            <div data-testid={`columna-${clave}`} className="relative" style={{ height: rejilla.altoTotal }}>
                                {rejilla.tramos.map((t) => (
                                    <div
                                        key={t.desde}
                                        aria-hidden="true"
                                        className={cn('absolute inset-x-0', t.tipo === 'franja' && 'border-y border-casa-arena/70')}
                                        style={{ top: t.top, height: t.alto, backgroundImage: t.tipo === 'horas' ? LINEA_DE_HORA : RAYADO_FRANJA }}
                                    />
                                ))}
                                {linea?.fecha === clave && (
                                    <div
                                        data-testid="linea-ahora"
                                        aria-hidden="true"
                                        className="pointer-events-none absolute inset-x-0 z-[3] h-0 border-t-2 border-casa-arcilla"
                                        style={{ top: linea.top }}
                                    >
                                        <span className="absolute -left-px -top-[6px] h-2.5 w-2.5 rounded-full bg-casa-arcilla" />
                                    </div>
                                )}
                                {clases.map((c) => {
                                    const pos = posicionDeClase(rejilla, c);
                                    if (!pos) return null;
                                    const carril = lanes.get(c.id) ?? { carril: 0, total: 1 };
                                    const seleccionable = !!seleccion && c.status !== 'cancelled';
                                    return (
                                        <TarjetaClase
                                            key={c.id}
                                            clase={c}
                                            variante="rejilla"
                                            completa={pos.completa}
                                            seleccionable={seleccionable}
                                            seleccionada={seleccionable && seleccion!.ids.has(c.id)}
                                            onClick={() => {
                                                if (!seleccion) onClickClase(c);
                                                else if (seleccionable) seleccion.onAlternarClase(c);
                                            }}
                                            className="absolute z-[2]"
                                            style={{
                                                top: pos.top,
                                                height: pos.alto,
                                                left: `calc(${(carril.carril / carril.total) * 100}% + 4px)`,
                                                width: `calc(${100 / carril.total}% - 8px)`,
                                            }}
                                        />
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
```

Reemplazar `frontend/src/pages/admin/classes/calendario/EncabezadoDia.tsx` completo por:

```tsx
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export interface EncabezadoDiaProps {
    fecha: Date;
    /** 'Lun', 'Mar'… */
    etiqueta: string;
    esHoy: boolean;
    cerrado: boolean;
    motivoCierre?: string;
    /** "2 clases · 4 libres" o "Sin clases". */
    resumen: string;
    /** En modo "Seleccionar varias" el clic marca o desmarca todo el día en vez de crear una clase. */
    modoSeleccion?: boolean;
    onClick: () => void;
}

/** Encabezado de una columna de la semana. Clic: nueva clase ese día; en modo selección, marca todo el día. */
export function EncabezadoDia({ fecha, etiqueta, esHoy, cerrado, motivoCierre, resumen, modoSeleccion = false, onClick }: EncabezadoDiaProps) {
    const clave = format(fecha, 'yyyy-MM-dd');
    const diaLargo = format(fecha, "EEEE d 'de' MMMM", { locale: es });
    return (
        <button
            type="button"
            onClick={onClick}
            data-testid={`encabezado-${clave}`}
            aria-label={modoSeleccion ? `Seleccionar todo el ${format(fecha, 'EEEE', { locale: es })}` : undefined}
            title={modoSeleccion ? `Seleccionar o quitar todas las clases del ${diaLargo}` : `Agregar una clase el ${diaLargo}`}
            className={cn(
                'flex h-[68px] w-full flex-col items-start justify-center gap-0.5 border-b border-casa-arena px-2.5 py-2 text-left transition-colors',
                'hover:bg-casa-verde/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-casa-verde',
                esHoy ? 'bg-casa-verde/[0.07]' : 'bg-[hsl(var(--admin-panel))]',
            )}
        >
            <span className="flex items-baseline gap-1.5">
                <span className="text-xs text-casa-ciruela/70">{etiqueta}</span>
                <span className={cn('font-heading text-[26px] leading-none tabular-nums', esHoy ? 'text-casa-verde' : 'text-casa-ciruela')}>
                    {format(fecha, 'd')}
                </span>
                {esHoy && <span className="rounded-full bg-casa-verde px-2 py-0.5 text-[11px] font-semibold text-casa-avena">Hoy</span>}
                {cerrado && <Badge variant="destructive" className="rounded-full px-2 py-0 text-[10px]">Cerrado</Badge>}
            </span>
            <span className={cn('max-w-full truncate text-[11.5px]', cerrado ? 'text-destructive' : 'text-casa-ciruela/70')}>
                {cerrado ? motivoCierre || 'Studio cerrado' : resumen}
            </span>
        </button>
    );
}
```

- [ ] **Step 5: El modo selección en la página**

En `frontend/src/pages/admin/classes/ClassesCalendar.tsx` (cada texto a cambiar aparece una sola vez):

a) Cambiar:

```tsx
import { useState } from 'react';
import { ChevronLeft, ChevronRight, Copy as CopyIcon, Loader2, Plus, RefreshCw, Repeat, Sparkles, Users } from 'lucide-react';
```

por:

```tsx
import { useEffect, useState } from 'react';
import { CheckSquare, ChevronLeft, ChevronRight, Copy as CopyIcon, Loader2, Plus, RefreshCw, Repeat, Sparkles, Users } from 'lucide-react';
```

b) Después de `import { tituloSemana } from './calendario/rejilla';` agregar:

```tsx
import { alternar, alternarGrupo, atajosDesde, clasesSeleccionadas } from './calendario/seleccion';
```

c) Justo antes de la línea `    // El panel y los diálogos usan la versión más reciente de la clase abierta: después de` agregar:

```tsx
    // "Seleccionar varias" (solo escritorio): qué clases están marcadas y la última tocada,
    // de la que salen los atajos. Cambiar de semana limpia la selección.
    const [modoSeleccion, setModoSeleccion] = useState(false);
    const [seleccion, setSeleccion] = useState<Set<string>>(() => new Set());
    const [ancla, setAncla] = useState<string | null>(null);
    const claveSemana = weekStart.getTime();
    useEffect(() => {
        setSeleccion(new Set());
        setAncla(null);
    }, [claveSemana]);
    const clasesVisibles = weekDays.flatMap((dia) => getClassesForDay(dia));
    const seleccionadas = clasesSeleccionadas(seleccion, clasesVisibles);
    const claseAncla = clasesVisibles.find((c) => c.id === ancla) ?? seleccionadas[seleccionadas.length - 1] ?? null;
    const atajos = atajosDesde(claseAncla, clasesVisibles);
    const terminarSeleccion = () => {
        setModoSeleccion(false);
        setSeleccion(new Set());
        setAncla(null);
    };

```

d) Cambiar:

```tsx
    const resumenSemana = textoResumenSemana(resumenDeClases(weekDays.flatMap((dia) => getClassesForDay(dia))));
```

por:

```tsx
    const resumenSemana = textoResumenSemana(resumenDeClases(clasesVisibles));
```

e) Cambiar (el botón de invitadas, en la barra de arriba):

```tsx
                    {veInvitadas && (
                        <Button variant="ghost" className="h-11 rounded-xl text-casa-ciruela" onClick={() => setCompanionReviewOpen(true)}>
```

por:

```tsx
                    <Button
                        variant="outline"
                        aria-pressed={modoSeleccion}
                        className={cn(
                            BOTON_BARRA,
                            'hidden lg:inline-flex',
                            modoSeleccion && 'border-casa-verde bg-casa-verde text-casa-avena hover:bg-casa-profundo hover:text-casa-avena',
                        )}
                        onClick={() => (modoSeleccion ? terminarSeleccion() : setModoSeleccion(true))}
                    >
                        <CheckSquare className="mr-2 h-4 w-4" /> {modoSeleccion ? 'Terminar selección' : 'Seleccionar varias'}
                    </Button>
                    {veInvitadas && (
                        <Button variant="ghost" className="h-11 rounded-xl text-casa-ciruela" onClick={() => setCompanionReviewOpen(true)}>
```

f) Cambiar `            {classesLoading ? (` por:

```tsx
            {modoSeleccion && (
                <div
                    role="group"
                    aria-label="Atajos de selección"
                    className="hidden min-h-12 flex-wrap items-center gap-2 rounded-[14px] bg-casa-verde/10 py-1.5 pl-4 pr-2 lg:flex"
                >
                    <span className="mr-1 font-semibold text-casa-profundo">Toca las clases que quieras cambiar.</span>
                    {atajos.length > 0 && <span className="text-casa-verde">Atajos:</span>}
                    {atajos.map((a) => (
                        <button
                            key={a.etiqueta}
                            type="button"
                            onClick={() => setSeleccion(new Set(a.ids))}
                            className="h-9 rounded-full border border-casa-verde/30 bg-[hsl(var(--admin-panel))] px-3 text-sm font-medium text-casa-verde hover:bg-casa-verde/5"
                        >
                            {a.etiqueta}
                        </button>
                    ))}
                    <button
                        type="button"
                        onClick={() => setSeleccion(new Set())}
                        className="ml-auto h-9 rounded-[10px] px-3 text-sm font-semibold text-casa-verde underline"
                    >
                        Quitar selección
                    </button>
                </div>
            )}

            {classesLoading ? (
```

g) En `<RejillaSemana … />` cambiar:

```tsx
                            onClickClase={handleClassClick}
                            onClickDia={handleDayClick}
                        />
```

por:

```tsx
                            onClickClase={handleClassClick}
                            onClickDia={handleDayClick}
                            seleccion={modoSeleccion ? {
                                ids: seleccion,
                                onAlternarClase: (c) => {
                                    setSeleccion((actual) => alternar(actual, c.id));
                                    setAncla(c.id);
                                },
                                onAlternarDia: (_dia, clasesDia) => setSeleccion((actual) => alternarGrupo(actual, clasesDia)),
                            } : undefined}
                        />
```

- [ ] **Step 6: Correr las pruebas**

Run:

```bash
cd frontend
npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -E "error TS" | grep -vE "FilterPills.tsx\(124|push.ts\(47|Events.tsx\((259|906)"
./scripts/e2e-local.sh e2e/tests/admin-classes.spec.ts --project=chromium --workers=3 -g "semana por horas|varias a la vez"
```

Expected: typecheck sin salida; Playwright `9 passed` (los 7 de "semana por horas" siguen pasando y los 2 nuevos). Abrir las capturas `test-results/*tarjeta-de-50-min*/tarjetas-1100.png` y `tarjetas-1366.png` (columna del lunes): en Barre y Pilates Mat se leen nombre, hora, coach, 7 puntos y "3/7" / "Lleno", y la casilla no tapa la hora.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/admin/classes/calendario/TarjetaClase.tsx frontend/src/pages/admin/classes/calendario/RejillaSemana.tsx frontend/src/pages/admin/classes/calendario/EncabezadoDia.tsx frontend/src/pages/admin/classes/ClassesCalendar.tsx frontend/e2e/tests/admin-classes.spec.ts
git commit -m "feat(calendario): seleccionar varias clases en la semana por horas

Botón Seleccionar varias: cada tarjeta muestra su casilla, el encabezado del
día marca todo el día y hay atajos según la última clase tocada. Además la
tarjeta de una clase de 50 min ya muestra la coach y los 7 lugares en
columnas de 120 a 140 px.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Barra de abajo y una ventana por acción, con vista previa

**Tipo:** código completo, se transcribe. Prueba con Playwright (arnés; `/api/classes/bulk` se imita en el navegador).

**Files:**
- Create: `frontend/src/pages/admin/classes/calendario/BarraSeleccion.tsx`
- Create: `frontend/src/pages/admin/classes/calendario/DialogoLote.tsx`
- Modify: `frontend/src/pages/admin/classes/ClassesCalendar.tsx` (imports, estado de la acción, contenedor, barra y ventana)
- Modify: `frontend/e2e/fixtures/calendario.ts` (agrega `mockLote` al final)
- Test: `frontend/e2e/tests/admin-classes.spec.ts` (ayudantes y 4 casos dentro de "Calendario de recepción – varias a la vez")

**Interfaces:**
- Consumes (Task 5): `listaSeleccion`, `nClases`, `textoAvisadas`, `textoBoton`, `textoHecho`, `quitarBloqueadas`, `resumenSeleccion`, `fechaDeClase`, `horaCorta`, tipos `AccionLote`, `ParametrosLote`, `RespuestaLote` de `./calendario/seleccion`.
- Consumes (Task 6): en `ClassesCalendar`, `modoSeleccion`, `seleccion`, `setSeleccion`, `seleccionadas`, `terminarSeleccion`.
- Consumes (API, Tasks 2–3): `POST /api/classes/bulk` (200 vista previa, 200 aplicado, 409 con bloqueadas).
- Produces: `BarraSeleccion({ titulo, detalle, activa, abierta, onAccion(accion), onTerminar })` — `role="toolbar"` "Acciones para las clases seleccionadas", botones "Cambiar coach", "Cupo" + logo, "Mover o cambiar clase", "Cancelar clases" y "Terminar selección" (X).
- Produces: `DialogoLote({ accion, onOpenChange, clases, classTypes, instructors, onQuitarBloqueadas(r), onAplicado(info: LoteAplicado) })` y `interface LoteAplicado { accion; params: ParametrosLote; respuesta: RespuestaLote; antes: Class[]; nombres: { coach?; tipo? } }`. Pide la vista previa con `useQuery(['classes-bulk-previa', accion, ids, params])` en cuanto hay parámetros; el botón dice exactamente lo que hará y se deshabilita con bloqueadas, mientras revisa o mientras aplica; un doble clic manda una sola vez; un 409 pinta las bloqueadas y avisa "No se aplicó nada".
- Produces (e2e): `mockLote(page, clases, { bloqueos?, bloqueosAlAplicar? }) → CuerpoLotePrueba[]` en `frontend/e2e/fixtures/calendario.ts`: imita el endpoint sobre el mismo arreglo que sirve `mockSemanaCalendario` (cancelar/coach/mover cambian ese arreglo).
- La Task 8 cambia `alAplicarLote` para ofrecer "Deshacer".

- [ ] **Step 1: El endpoint de mentira para las pruebas**

Al final de `frontend/e2e/fixtures/calendario.ts` agregar:

```ts
/** Un cuerpo de POST /api/classes/bulk tal como lo mandó la página. */
export interface CuerpoLotePrueba {
  classIds: string[];
  accion: "coach" | "cupo_canal" | "mover" | "cancelar";
  vistaPrevia: boolean;
  instructorId?: string;
  lugares?: number;
  minutos?: number;
  classTypeId?: string;
  motivo?: string;
}

const COACHES_PRUEBA: Record<string, string> = { [uuid("b001")]: "Ana", [uuid("b002")]: "Sofía", [uuid("b003")]: "Pau" };
const sumarMinutos = (hora: string, minutos: number) => {
  const total = Number(hora.slice(0, 2)) * 60 + Number(hora.slice(3, 5)) + minutos;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};

/**
 * Imita POST /api/classes/bulk sobre las mismas clases que sirve `mockSemanaCalendario`:
 * la vista previa cuenta; aplicar cambia el arreglo (y la página, al recargar, lo ve).
 * `bloqueos` fuerza clases bloqueadas con su motivo (también se pueden agregar después);
 * `bloqueosAlAplicar` solo bloquea al aplicar (algo cambió después de la vista previa).
 * Devuelve los cuerpos recibidos.
 */
export async function mockLote(
  page: Page,
  clases: ClasePrueba[],
  opciones: { bloqueos?: Record<string, string>; bloqueosAlAplicar?: Record<string, string> } = {},
): Promise<CuerpoLotePrueba[]> {
  const bloqueos = opciones.bloqueos ?? {};
  const cuerpos: CuerpoLotePrueba[] = [];
  await page.route(/\/api\/classes\/bulk$/, async (route) => {
    const cuerpo = route.request().postDataJSON() as CuerpoLotePrueba;
    cuerpos.push(cuerpo);
    const resultado = cuerpo.classIds.map((id) => {
      const c = clases.find((x) => x.id === id);
      const tp = c?.channels.find((x) => x.channel === "totalpass")?.booked ?? 0;
      const motivo = !c ? "Esta clase ya no existe." : c.status === "cancelled" ? "Ya está cancelada."
        : bloqueos[id] ?? (cuerpo.vistaPrevia ? undefined : opciones.bloqueosAlAplicar?.[id]);
      return {
        classId: id,
        estado: motivo ? "bloqueada" : "ok",
        ...(motivo ? { motivo } : {}),
        alumnasAvisadas: motivo || cuerpo.accion === "cupo_canal" ? 0 : Math.max(0, (c?.current_bookings ?? 0) - tp),
        sociasPorCanal: tp ? { totalpass: tp } : {},
        sociasPierdenLugar: !motivo && cuerpo.accion === "mover" && cuerpo.minutos ? tp : 0,
        advertencias: [] as string[],
      };
    });
    const ok = resultado.filter((r) => r.estado === "ok");
    const respuesta = {
      clases: resultado,
      resumen: {
        ok: ok.length,
        bloqueadas: resultado.length - ok.length,
        alumnasAvisadas: ok.reduce((t, r) => t + r.alumnasAvisadas, 0),
        sociasPierdenLugar: ok.reduce((t, r) => t + r.sociasPierdenLugar, 0),
      },
      aplicado: false,
    };
    if (cuerpo.vistaPrevia) return route.fulfill({ json: respuesta });
    if (respuesta.resumen.bloqueadas > 0) return route.fulfill({ status: 409, json: respuesta });
    for (const id of cuerpo.classIds) {
      const c = clases.find((x) => x.id === id)!;
      if (cuerpo.accion === "cancelar") c.status = "cancelled";
      if (cuerpo.accion === "coach") {
        c.instructor_id = cuerpo.instructorId!;
        c.instructor_name = COACHES_PRUEBA[cuerpo.instructorId!] ?? "Otra";
      }
      if (cuerpo.accion === "mover" && cuerpo.minutos) {
        c.start_time = sumarMinutos(c.start_time, cuerpo.minutos);
        c.end_time = sumarMinutos(c.end_time, cuerpo.minutos);
      }
    }
    return route.fulfill({ json: { ...respuesta, aplicado: true } });
  });
  return cuerpos;
}
```

- [ ] **Step 2: Escribir las pruebas que fallan**

En `frontend/e2e/tests/admin-classes.spec.ts`:

a) Cambiar la línea de import de `../fixtures/calendario` por:

```ts
import { AHORA_PRUEBA, FECHA_PRUEBA, ID, SEMANA_PRUEBA, clasePrueba, mockLote, mockSemanaCalendario } from "../fixtures/calendario";
```

b) Justo antes de `test.describe("Calendario de recepción – varias a la vez", () => {` agregar:

```ts
/** Copia de la semana de prueba que las acciones en bloque pueden cambiar. */
const semanaEditable = () => SEMANA_PRUEBA.map((c) => ({ ...c, channels: c.channels.map((k) => ({ ...k })) }));
/** Coaches fijas para la ventana "Cambiar coach" (ids iguales a los del fixture). */
const COACHES = [
  { id: "00000000-0000-4000-8000-00000000b001", display_name: "Ana", is_active: true },
  { id: "00000000-0000-4000-8000-00000000b002", display_name: "Sofía", is_active: true },
  { id: "00000000-0000-4000-8000-00000000b003", display_name: "Pau", is_active: true },
];
```

c) Dentro de ese `describe`, después del caso `"tarjeta de 50 min: …"` (antes del `});` que cierra el describe, que es la última línea del archivo), agregar:

```ts
  test("atajo → cancelar → las tarjetas se quedan, canceladas", async ({ adminPage: page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const clases = semanaEditable();
    await mockSemanaCalendario(page, clases);
    const cuerpos = await mockLote(page, clases);
    await page.goto(`/admin/calendar?date=${FECHA_PRUEBA}`);
    const barre = page.getByRole("button", { name: /^Barre.*07:00/ });
    const mat = page.getByRole("button", { name: /^Pilates Mat.*08:00/ });

    await page.getByRole("button", { name: "Seleccionar varias" }).click();
    const barra = page.getByRole("toolbar", { name: "Acciones para las clases seleccionadas" });
    await expect(barra.getByRole("button", { name: "Cancelar clases" })).toBeDisabled();
    await barre.click();
    await page.getByRole("group", { name: "Atajos de selección" }).getByRole("button", { name: "Todo el lunes" }).click();
    await expect(barra.getByTestId("resumen-seleccion")).toContainText("2 clases");
    await expect(barra.getByTestId("resumen-seleccion")).toContainText("10 inscritas · 3 de TotalPass");

    await barra.getByRole("button", { name: "Cancelar clases" }).click();
    const dialogo = page.getByRole("dialog", { name: "Cancelar 2 clases" });
    await expect(dialogo).toContainText("Barre lun 7:00, Pilates Mat lun 8:00");
    await expect(dialogo).toContainText("7 alumnas recuperan su crédito y reciben aviso.");
    await expect(dialogo).toContainText("Se retiran de TotalPass para que nadie más reserve.");
    await dialogo.getByLabel("Motivo que verán las alumnas").fill("Puente");
    await dialogo.getByRole("button", { name: "Cancelar 2 clases" }).click();

    await expect(page.getByText("2 clases canceladas. Siguen en el calendario, marcadas.").first()).toBeVisible();
    await expect(barre).toContainText("Cancelada");
    await expect(mat).toContainText("Cancelada");
    await expect(barra.getByTestId("resumen-seleccion")).toContainText("Ninguna clase");
    expect(cuerpos.map((c) => [c.accion, c.vistaPrevia])).toEqual([["cancelar", true], ["cancelar", false]]);
    expect(cuerpos[1]).toMatchObject({ classIds: [ID.barre, ID.mat], motivo: "Puente" });
  });

  test("bloqueadas: se ven con su motivo y se quitan de la selección", async ({ adminPage: page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const clases = semanaEditable();
    await mockSemanaCalendario(page, clases);
    await page.route(/\/api\/instructors(\?|$)/, (route) => route.fulfill({ json: COACHES }));
    const cuerpos = await mockLote(page, clases, { bloqueos: { [ID.mat]: "Ya empezó." } });
    await page.goto(`/admin/calendar?date=${FECHA_PRUEBA}`);
    const barre = page.getByRole("button", { name: /^Barre.*07:00/ });
    const mat = page.getByRole("button", { name: /^Pilates Mat.*08:00/ });

    await page.getByRole("button", { name: "Seleccionar varias" }).click();
    await barre.click();
    await mat.click();
    await page.getByRole("toolbar", { name: "Acciones para las clases seleccionadas" }).getByRole("button", { name: "Cambiar coach" }).click();
    const dialogo = page.getByRole("dialog", { name: "Cambiar coach" });
    await dialogo.getByRole("radio", { name: /Pau/ }).click();
    await expect(dialogo.getByRole("list", { name: "Clases bloqueadas" })).toContainText("Pilates Mat 02/11 8:00: Ya empezó.");
    await expect(dialogo.getByRole("button", { name: "Cambiar a Pau en 2 clases" })).toBeDisabled();

    await dialogo.getByRole("button", { name: "Quitar la bloqueada de la selección" }).click();
    // La ventana es modal (el calendario queda oculto a lectores): se ve en su lista de clases.
    await expect(dialogo.getByText("Barre · lun 7:00", { exact: true })).toBeVisible();
    await expect(dialogo.getByRole("button", { name: "Cambiar a Pau en 1 clase" })).toBeEnabled();
    await expect(dialogo).toContainText("Avisamos del cambio a 2 alumnas por la app.");
    await dialogo.getByRole("button", { name: "Cambiar a Pau en 1 clase" }).click();
    await expect(page.getByText("Listo: 1 clase ahora con Pau. Avisamos a 2 alumnas.").first()).toBeVisible();
    await expect(barre).toContainText("Pau");
    expect(cuerpos.at(-1)).toMatchObject({ accion: "coach", vistaPrevia: false, classIds: [ID.barre], instructorId: COACHES[2].id });
  });

  test("mover: avisa cuántas socias de TotalPass pierden su lugar", async ({ adminPage: page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const clases = semanaEditable();
    await mockSemanaCalendario(page, clases);
    const cuerpos = await mockLote(page, clases);
    await page.goto(`/admin/calendar?date=${FECHA_PRUEBA}`);

    await page.getByRole("button", { name: "Seleccionar varias" }).click();
    await page.getByRole("button", { name: /^Barre.*07:00/ }).click();
    await page.getByRole("toolbar", { name: "Acciones para las clases seleccionadas" }).getByRole("button", { name: "Mover o cambiar clase" }).click();
    const dialogo = page.getByRole("dialog", { name: "Mover o cambiar clase" });
    await expect(dialogo.getByRole("button", { name: "Elige un cambio" })).toBeDisabled();
    await dialogo.getByRole("radio", { name: "+30 min" }).click();
    await expect(dialogo.getByRole("alert")).toContainText("1 socia pierde su lugar");
    // Doble clic: se aplica UNA vez (dos serían +1 h).
    await dialogo.getByRole("button", { name: "Mover 1 clase 30 min más tarde" }).dblclick();
    await expect(page.getByText("Listo: 1 clase actualizada. Avisamos a 2 alumnas.").first()).toBeVisible();
    await expect(page.getByRole("button", { name: /^Barre.*07:30/ })).toBeVisible();
    expect(cuerpos.filter((c) => !c.vistaPrevia)).toEqual([{ classIds: [ID.barre], accion: "mover", minutos: 30, vistaPrevia: false }]);
  });

  test("si algo cambia entre la vista previa y aplicar, no se aplica nada y se ve por qué", async ({ adminPage: page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const clases = semanaEditable();
    await mockSemanaCalendario(page, clases);
    const cuerpos = await mockLote(page, clases, { bloqueosAlAplicar: { [ID.mat]: "Ya empezó." } });
    await page.goto(`/admin/calendar?date=${FECHA_PRUEBA}`);

    await page.getByRole("button", { name: "Seleccionar varias" }).click();
    await page.getByRole("button", { name: /^Barre.*07:00/ }).click();
    await page.getByRole("button", { name: /^Pilates Mat.*08:00/ }).click();
    await page.getByRole("toolbar", { name: "Acciones para las clases seleccionadas" }).getByRole("button", { name: "Cancelar clases" }).click();
    const dialogo = page.getByRole("dialog", { name: "Cancelar 2 clases" });
    await dialogo.getByRole("button", { name: "Cancelar 2 clases" }).click();

    await expect(page.getByText("Algunas clases cambiaron mientras tanto. Revisa las bloqueadas.").first()).toBeVisible();
    await expect(dialogo.getByRole("list", { name: "Clases bloqueadas" })).toContainText("Ya empezó.");
    await expect(dialogo.getByRole("button", { name: "Cancelar 2 clases" })).toBeDisabled();
    expect(clases.filter((c) => c.status === "cancelled").map((c) => c.id)).toEqual([ID.sculptCancelada]);
    expect(cuerpos.filter((c) => !c.vistaPrevia)).toHaveLength(1);
  });
```

- [ ] **Step 3: Correrlas y ver que fallan**

Run: `cd frontend && ./scripts/e2e-local.sh e2e/tests/admin-classes.spec.ts --project=chromium --workers=3 -g "varias a la vez"`
Expected: los 2 casos de la Task 6 pasan; los 4 nuevos FAIL (no existe la barra "Acciones para las clases seleccionadas").

- [ ] **Step 4: La barra**

Crear `frontend/src/pages/admin/classes/calendario/BarraSeleccion.tsx`:

```tsx
import { Clock, UserRoundCheck, X, XCircle } from 'lucide-react';
import { ChannelLogo } from '@/components/brands/ChannelLogo';
import { cn } from '@/lib/utils';
import type { AccionLote } from './seleccion';

interface BarraSeleccionProps {
    /** "4 clases" o "Ninguna clase". */
    titulo: string;
    /** "9 inscritas · 2 de TotalPass" o "Toca una clase para empezar". */
    detalle: string;
    /** Hay al menos una clase seleccionada. */
    activa: boolean;
    /** La acción cuya ventana está abierta (se resalta su botón). */
    abierta: AccionLote | null;
    onAccion: (accion: AccionLote) => void;
    onTerminar: () => void;
}

const BOTON = 'flex h-11 items-center gap-2 rounded-xl px-3.5 font-medium transition-colors hover:bg-white/10 disabled:pointer-events-none disabled:opacity-45';

/** Barra oscura de abajo en modo "Seleccionar varias": qué hay seleccionado y las cuatro acciones. Solo escritorio. */
export function BarraSeleccion({ titulo, detalle, activa, abierta, onAccion, onTerminar }: BarraSeleccionProps) {
    const resaltada = (a: AccionLote) => abierta === a && 'bg-casa-verde hover:bg-casa-verde';
    return (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-40 hidden justify-center px-4 lg:flex">
            <div
                role="toolbar"
                aria-label="Acciones para las clases seleccionadas"
                className="pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-1 rounded-[20px] bg-casa-profundo py-2.5 pl-5 pr-2.5 text-casa-avena shadow-[0_24px_48px_-20px_rgba(22,38,26,.65)]"
            >
                <div className="mr-3 flex min-w-[150px] flex-col" data-testid="resumen-seleccion">
                    <span className="font-heading text-2xl leading-none">{titulo}</span>
                    <span className="text-xs text-casa-avena/75">{detalle}</span>
                </div>
                <button type="button" className={cn(BOTON, resaltada('coach'))} disabled={!activa} onClick={() => onAccion('coach')}>
                    <UserRoundCheck className="h-[17px] w-[17px]" aria-hidden="true" /> Cambiar coach
                </button>
                <button type="button" className={cn(BOTON, resaltada('cupo_canal'))} disabled={!activa} onClick={() => onAccion('cupo_canal')}>
                    Cupo <ChannelLogo canal="totalpass" fondo="oscuro" alto={10} />
                </button>
                <button type="button" className={cn(BOTON, resaltada('mover'))} disabled={!activa} onClick={() => onAccion('mover')}>
                    <Clock className="h-[17px] w-[17px]" aria-hidden="true" /> Mover o cambiar clase
                </button>
                <button type="button" className={cn(BOTON, 'text-[#F2B8AC]', resaltada('cancelar'))} disabled={!activa} onClick={() => onAccion('cancelar')}>
                    <XCircle className="h-[17px] w-[17px]" aria-hidden="true" /> Cancelar clases
                </button>
                <button
                    type="button"
                    aria-label="Terminar selección"
                    onClick={onTerminar}
                    className="ml-1.5 grid h-11 w-11 place-items-center rounded-xl border border-casa-avena/25 hover:bg-white/10"
                >
                    <X className="h-4 w-4" aria-hidden="true" />
                </button>
            </div>
        </div>
    );
}
```

- [ ] **Step 5: La ventana de cada acción**

Crear `frontend/src/pages/admin/classes/calendario/DialogoLote.tsx`:

```tsx
import { useRef, useState } from 'react';
import axios from 'axios';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Loader2 } from 'lucide-react';
import api, { getErrorMessage } from '@/lib/api';
import type { Class, ClassType, Instructor } from '@/types/class';
import { ChannelLogo } from '@/components/brands/ChannelLogo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import {
    fechaDeClase,
    horaCorta,
    listaSeleccion,
    nClases,
    textoAvisadas,
    textoBoton,
    type AccionLote,
    type ParametrosLote,
    type RespuestaLote,
} from './seleccion';

/** Lo que el padre necesita para el aviso final y para "Deshacer". */
export interface LoteAplicado {
    accion: AccionLote;
    params: ParametrosLote;
    respuesta: RespuestaLote;
    /** Las clases como estaban antes del cambio. */
    antes: Class[];
    nombres: { coach?: string; tipo?: string };
}

interface DialogoLoteProps {
    /** La acción abierta; null = cerrado. El padre lo vuelve a montar (key) en cada apertura. */
    accion: AccionLote | null;
    onOpenChange: (open: boolean) => void;
    /** Las clases seleccionadas, por día y hora. */
    clases: Class[];
    classTypes?: ClassType[];
    instructors?: Instructor[];
    onQuitarBloqueadas: (r: RespuestaLote) => void;
    onAplicado: (info: LoteAplicado) => void;
}

const DESPLAZAMIENTOS: Array<[number, string]> = [[-60, '−1 h'], [-30, '−30 min'], [0, 'Misma hora'], [30, '+30 min'], [60, '+1 h']];
const TITULOS: Record<Exclude<AccionLote, 'cupo_canal' | 'cancelar'>, string> = { coach: 'Cambiar coach', mover: 'Mover o cambiar clase' };
const reservasTotalpass = (c: Class) => Number(c.channels?.find((x) => x.channel === 'totalpass')?.booked ?? 0);

/**
 * La ventana de cada acción en bloque: elige el cambio, pide la vista previa a
 * POST /api/classes/bulk y muestra qué les pasa a las alumnas y a TotalPass antes de aplicar.
 */
export function DialogoLote({ accion, onOpenChange, clases, classTypes, instructors, onQuitarBloqueadas, onAplicado }: DialogoLoteProps) {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const ids = clases.map((c) => c.id);
    const coachesActuales = new Set(clases.map((c) => c.instructor_id));
    const minimoCupo = Math.max(0, ...clases.map(reservasTotalpass));
    const maximoCupo = Math.min(...clases.map((c) => Number(c.max_capacity) || 0));
    const cupoActual = clases.length ? Number(clases[0].channels?.find((x) => x.channel === 'totalpass')?.max ?? 0) : 0;

    const [coachId, setCoachId] = useState<string | null>(null);
    const [lugares, setLugares] = useState(Math.min(Math.max(cupoActual, minimoCupo), Math.max(maximoCupo, minimoCupo)));
    const [minutos, setMinutos] = useState(0);
    const [tipoId, setTipoId] = useState('mismo');
    const [motivo, setMotivo] = useState('');

    const coachElegida = instructors?.find((i) => i.id === coachId);
    const tipoElegido = classTypes?.find((t) => t.id === tipoId);
    const nombres = { coach: coachElegida?.display_name, tipo: tipoElegido?.name };

    // Parámetros de la acción; null = todavía no hay nada que aplicar.
    const params: ParametrosLote | null =
        accion === 'coach' ? (coachId ? { instructorId: coachId } : null)
        : accion === 'cupo_canal' ? { canal: 'totalpass', lugares }
        : accion === 'mover' ? (minutos !== 0 || tipoId !== 'mismo' ? { minutos, ...(tipoId !== 'mismo' ? { classTypeId: tipoId } : {}) } : null)
        : accion === 'cancelar' ? (motivo.trim() ? { motivo: motivo.trim() } : {})
        : null;
    // El motivo no cambia el impacto: no vuelve a pedir la vista previa en cada tecla.
    const paramsPrevia = accion === 'cancelar' ? {} : params;

    const previa = useQuery<RespuestaLote>({
        queryKey: ['classes-bulk-previa', accion, ids, paramsPrevia],
        queryFn: async () => (await api.post('/classes/bulk', { classIds: ids, accion, vistaPrevia: true, ...paramsPrevia })).data,
        enabled: !!accion && ids.length > 0 && !!paramsPrevia,
        placeholderData: (anterior) => anterior,
        staleTime: 0,
        gcTime: 0,
    });

    // Un doble clic no puede aplicar dos veces (mover +1 h dos veces = +2 h).
    const enviando = useRef(false);
    const aplicar = useMutation({
        mutationFn: async () => (await api.post('/classes/bulk', { classIds: ids, accion, vistaPrevia: false, ...params })).data as RespuestaLote,
        onSettled: () => { enviando.current = false; },
        onSuccess: (respuesta) => {
            queryClient.invalidateQueries({ queryKey: ['classes'] });
            onAplicado({ accion: accion!, params: params!, respuesta, antes: clases, nombres });
        },
        onError: (err) => {
            // 409: algo cambió entre la vista previa y aplicar. La respuesta trae las bloqueadas.
            if (axios.isAxiosError(err) && err.response?.status === 409) {
                queryClient.setQueryData(['classes-bulk-previa', accion, ids, paramsPrevia], err.response.data);
                toast({ variant: 'destructive', title: 'No se aplicó nada', description: 'Algunas clases cambiaron mientras tanto. Revisa las bloqueadas.' });
                return;
            }
            toast({ variant: 'destructive', title: 'No se aplicó nada', description: getErrorMessage(err) });
        },
    });

    const r = previa.data;
    const bloqueadas = r?.clases.filter((c) => c.estado === 'bloqueada') ?? [];
    const advertencias = [...new Set(r?.clases.flatMap((c) => c.advertencias) ?? [])];
    const puedeAplicar = !!params && !!r && !previa.isFetching && r.resumen.bloqueadas === 0 && r.resumen.ok > 0 && !aplicar.isPending;
    const etiqueta = (id: string) => {
        const c = clases.find((x) => x.id === id);
        return c ? `${c.class_type_name || 'Clase'} ${fechaDeClase(c).slice(5).split('-').reverse().join('/')} ${horaCorta(c.start_time)}` : 'Clase';
    };

    return (
        <Dialog open={!!accion} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[520px]">
                <DialogHeader>
                    <DialogTitle className={cn('flex items-center gap-2 font-heading text-[28px] font-normal leading-tight', accion === 'cancelar' && 'text-destructive')}>
                        {accion === 'cupo_canal' ? (<>Lugares para <ChannelLogo canal="totalpass" alto={16} /></>)
                            : accion === 'cancelar' ? `Cancelar ${nClases(clases.length)}`
                            : accion ? TITULOS[accion] : ''}
                    </DialogTitle>
                    <DialogDescription>{listaSeleccion(clases)}</DialogDescription>
                </DialogHeader>

                {accion === 'coach' && (
                    <div role="radiogroup" aria-label="Coach nueva" className="flex max-h-64 flex-col gap-1.5 overflow-y-auto">
                        {(instructors ?? []).filter((i) => i.is_active !== false).map((i) => {
                            const actual = coachesActuales.size === 1 && coachesActuales.has(i.id);
                            const elegida = coachId === i.id;
                            return (
                                <button
                                    key={i.id}
                                    type="button"
                                    role="radio"
                                    aria-checked={elegida}
                                    disabled={actual}
                                    onClick={() => setCoachId(i.id)}
                                    className={cn(
                                        'flex items-center gap-3 rounded-xl border px-3 py-2 text-left disabled:opacity-55',
                                        elegida ? 'border-casa-verde bg-casa-verde/10' : 'border-casa-arena bg-[hsl(var(--admin-panel))]',
                                    )}
                                >
                                    <span className="grid h-8 w-8 flex-none place-items-center rounded-full bg-casa-verde/10 font-semibold text-casa-verde">{i.display_name.slice(0, 1)}</span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block font-semibold">{i.display_name}</span>
                                        {actual && <span className="block text-xs text-casa-ciruela/70">Coach actual de estas clases</span>}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                )}

                {accion === 'cupo_canal' && (
                    <div className="space-y-2">
                        <div className="flex items-center gap-4">
                            <Button type="button" variant="outline" className="h-12 w-12 rounded-[14px] text-xl" aria-label="Un lugar menos" disabled={lugares <= minimoCupo} onClick={() => setLugares((n) => n - 1)}>−</Button>
                            <span data-testid="cupo-lote" className="min-w-10 text-center font-heading text-5xl tabular-nums">{lugares}</span>
                            <Button type="button" variant="outline" className="h-12 w-12 rounded-[14px] text-xl" aria-label="Un lugar más" disabled={lugares >= maximoCupo} onClick={() => setLugares((n) => n + 1)}>+</Button>
                            <span className="flex-1 text-sm text-casa-ciruela/70">lugares en cada clase (de {maximoCupo}).</span>
                        </div>
                        <p className="text-sm">
                            {minimoCupo > 0
                                ? `No puede bajar de ${minimoCupo}: ya hay socias inscritas.`
                                : 'Ninguna tiene socias todavía. En 0 la clase deja de ofrecerse en TotalPass.'}
                        </p>
                    </div>
                )}

                {accion === 'mover' && (
                    <div className="space-y-4">
                        <div>
                            <p className="mb-2 font-semibold">Hora</p>
                            <div role="radiogroup" aria-label="Correr la hora" className="flex flex-wrap gap-1.5">
                                {DESPLAZAMIENTOS.map(([m, texto]) => (
                                    <button
                                        key={m}
                                        type="button"
                                        role="radio"
                                        aria-checked={minutos === m}
                                        onClick={() => setMinutos(m)}
                                        className={cn(
                                            'h-10 rounded-[10px] border px-3.5 font-medium',
                                            minutos === m ? 'border-casa-verde bg-casa-verde text-casa-avena' : 'border-casa-arena bg-[hsl(var(--admin-panel))]',
                                        )}
                                    >
                                        {texto}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="lote-tipo" className="font-semibold">Clase</Label>
                            <Select value={tipoId} onValueChange={setTipoId}>
                                <SelectTrigger id="lote-tipo" aria-label="Clase nueva" className="h-11 rounded-xl">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="mismo">Misma clase</SelectItem>
                                    {(classTypes ?? []).filter((t) => t.is_active !== false).map((t) => (
                                        <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                )}

                {accion === 'cancelar' && (
                    <div className="space-y-2">
                        <Label htmlFor="lote-motivo" className="font-semibold">Motivo que verán las alumnas</Label>
                        <Input id="lote-motivo" maxLength={200} placeholder="Ej. puente del 2 de noviembre" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
                        <p className="text-sm text-casa-ciruela/70">Las clases se quedan en el calendario marcadas como canceladas.</p>
                    </div>
                )}

                {params && (
                    <section aria-label="Qué va a pasar" aria-busy={previa.isFetching} className="space-y-2 border-t border-casa-arena pt-3 text-sm">
                        {!r && previa.isFetching && (
                            <p className="flex items-center gap-2 text-casa-ciruela/70"><Loader2 className="h-4 w-4 animate-spin" /> Revisando las clases…</p>
                        )}
                        {previa.isError && <p className="text-destructive">{getErrorMessage(previa.error)}</p>}
                        {r && (
                            <>
                                <p>{textoAvisadas(accion!, r.resumen.alumnasAvisadas)}</p>
                                <p className="flex items-center gap-2">
                                    <ChannelLogo canal="totalpass" alto={10} />
                                    {accion === 'coach' && 'Se actualiza la coach; las socias conservan su lugar.'}
                                    {accion === 'cupo_canal' && (lugares === 0 ? 'Deja de ofrecerse en TotalPass.' : `Hasta ${lugares} socias por clase.`)}
                                    {accion === 'mover' && (r.resumen.sociasPierdenLugar === 0 ? 'Ninguna socia pierde su lugar.' : 'Mover la hora quita el lugar a las socias.')}
                                    {accion === 'cancelar' && 'Se retiran de TotalPass para que nadie más reserve.'}
                                </p>
                                {(r.resumen.sociasPierdenLugar > 0 || advertencias.length > 0) && (
                                    <div role="alert" className="flex gap-2 rounded-xl border border-mostaza/40 bg-mostaza/10 p-3 text-casa-ciruela">
                                        <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" aria-hidden="true" />
                                        <div className="space-y-1">
                                            {r.resumen.sociasPierdenLugar > 0 && (
                                                <p>
                                                    Mover la hora borra y vuelve a publicar la clase en TotalPass:{' '}
                                                    <strong>{r.resumen.sociasPierdenLugar} {r.resumen.sociasPierdenLugar === 1 ? 'socia pierde' : 'socias pierden'} su lugar</strong> y TotalPass les avisa.
                                                </p>
                                            )}
                                            {advertencias.map((a) => <p key={a}>{a}.</p>)}
                                        </div>
                                    </div>
                                )}
                                {bloqueadas.length > 0 && (
                                    <div className="space-y-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3">
                                        <p className="font-semibold text-destructive">
                                            {bloqueadas.length === 1 ? '1 clase no se puede cambiar' : `${bloqueadas.length} clases no se pueden cambiar`}
                                        </p>
                                        <ul aria-label="Clases bloqueadas" className="space-y-0.5">
                                            {bloqueadas.map((b) => <li key={b.classId}>{etiqueta(b.classId)}: {b.motivo}</li>)}
                                        </ul>
                                        <Button type="button" variant="outline" size="sm" onClick={() => onQuitarBloqueadas(r)}>
                                            {bloqueadas.length === 1 ? 'Quitar la bloqueada de la selección' : `Quitar las ${bloqueadas.length} bloqueadas de la selección`}
                                        </Button>
                                    </div>
                                )}
                            </>
                        )}
                    </section>
                )}

                <DialogFooter className="gap-2">
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                        {accion === 'cancelar' ? 'No cancelar' : 'Cerrar'}
                    </Button>
                    <Button
                        type="button"
                        disabled={!puedeAplicar}
                        onClick={() => {
                            if (enviando.current) return;
                            enviando.current = true;
                            aplicar.mutate();
                        }}
                        className={cn(accion === 'cancelar' ? 'bg-destructive text-white hover:bg-destructive/90' : 'bg-casa-verde text-casa-avena hover:bg-casa-profundo')}
                    >
                        {aplicar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {params ? textoBoton(accion!, params, clases.length, nombres) : accion === 'coach' ? 'Elige una coach' : 'Elige un cambio'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
```

- [ ] **Step 6: Conectarlas en la página**

En `frontend/src/pages/admin/classes/ClassesCalendar.tsx`:

a) Cambiar `import { alternar, alternarGrupo, atajosDesde, clasesSeleccionadas } from './calendario/seleccion';` por:

```tsx
import { alternar, alternarGrupo, atajosDesde, clasesSeleccionadas, quitarBloqueadas, resumenSeleccion, textoHecho, type AccionLote } from './calendario/seleccion';
import { BarraSeleccion } from './calendario/BarraSeleccion';
import { DialogoLote, type LoteAplicado } from './calendario/DialogoLote';
import { useToast } from '@/components/ui/use-toast';
```

b) Cambiar:

```tsx
    const terminarSeleccion = () => {
        setModoSeleccion(false);
        setSeleccion(new Set());
        setAncla(null);
    };
```

por:

```tsx
    const terminarSeleccion = () => {
        setModoSeleccion(false);
        setSeleccion(new Set());
        setAncla(null);
    };
    // La ventana de la acción en bloque abierta; la clave la vuelve a montar limpia en cada apertura.
    const [accionLote, setAccionLote] = useState<AccionLote | null>(null);
    const [claveLote, setClaveLote] = useState(0);
    const { toast } = useToast();
    const alAplicarLote = ({ accion, params, respuesta, nombres }: LoteAplicado) => {
        setAccionLote(null);
        setSeleccion(new Set());
        toast({ title: textoHecho(accion, params, respuesta, nombres) });
    };
```

c) Cambiar:

```tsx
    const content = (
        <div className="space-y-4 font-body">
```

por (la barra flota abajo: deja aire para que no tape la última hora):

```tsx
    const content = (
        <div className={cn('space-y-4 font-body', modoSeleccion && 'lg:pb-28')}>
```

d) Justo antes de `            <Dialog open={companionReviewOpen} onOpenChange={setCompanionReviewOpen}>` agregar:

```tsx
            {modoSeleccion && (
                <BarraSeleccion
                    {...resumenSeleccion(seleccionadas)}
                    activa={seleccionadas.length > 0}
                    abierta={accionLote}
                    onAccion={(a) => {
                        setClaveLote((k) => k + 1);
                        setAccionLote(a);
                    }}
                    onTerminar={terminarSeleccion}
                />
            )}
            <DialogoLote
                key={`lote-${claveLote}`}
                accion={accionLote}
                onOpenChange={(open) => { if (!open) setAccionLote(null); }}
                clases={seleccionadas}
                classTypes={classTypes}
                instructors={instructors}
                onQuitarBloqueadas={(r) => {
                    const quedan = quitarBloqueadas(seleccion, r);
                    setSeleccion(quedan);
                    if (quedan.size === 0) setAccionLote(null);
                }}
                onAplicado={alAplicarLote}
            />

```

- [ ] **Step 7: Correr las pruebas**

Run:

```bash
cd frontend
npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -E "error TS" | grep -vE "FilterPills.tsx\(124|push.ts\(47|Events.tsx\((259|906)"
npx tsc --noEmit -p e2e/tsconfig.json
./scripts/e2e-local.sh e2e/tests/admin-classes.spec.ts --project=chromium --workers=3 -g "varias a la vez"
```

Expected: los dos typecheck sin salida; Playwright `6 passed`.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/pages/admin/classes/calendario/BarraSeleccion.tsx frontend/src/pages/admin/classes/calendario/DialogoLote.tsx frontend/src/pages/admin/classes/ClassesCalendar.tsx frontend/e2e/fixtures/calendario.ts frontend/e2e/tests/admin-classes.spec.ts
git commit -m "feat(calendario): barra de acciones y vista previa para varias clases

Barra oscura con lo seleccionado y las cuatro acciones. Cada una abre su
ventana, pide la vista previa y muestra alumnas avisadas, socias que
pierden lugar y bloqueadas con su motivo (con Quitar las bloqueadas). El
botón dice exactamente lo que hará y un doble clic aplica una sola vez.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: "Deshacer" y verificación final de la rama

**Tipo:** código completo, se transcribe. Prueba con Playwright (arnés) y la verificación de toda la rama.

**Files:**
- Modify: `frontend/src/pages/admin/classes/ClassesCalendar.tsx` (imports y `alAplicarLote`)
- Test: `frontend/e2e/tests/admin-classes.spec.ts` (1 caso dentro de "Calendario de recepción – varias a la vez")

**Interfaces:**
- Consumes (Task 5): `inversaDe(accion, params, antes)`, tipos `CuerpoLote`, `RespuestaLote`.
- Consumes (Task 7): `LoteAplicado` (trae `antes`: las clases como estaban), `alAplicarLote`, `toast`; `mockLote(page, clases, { bloqueos })` (el objeto `bloqueos` se puede cambiar después: así la prueba simula que la clase empezó).
- Produces: al aplicar, el aviso trae "Deshacer" (`ToastAction`) solo si `inversaDe` devuelve una llamada; al tocarlo se manda esa llamada con `vistaPrevia: false`: si pasa, "Cambio deshecho."; si responde 409, "No se pudo deshacer" con el motivo del servidor (p. ej. "Ya empezó.").

- [ ] **Step 1: Escribir la prueba que falla**

En `frontend/e2e/tests/admin-classes.spec.ts`, dentro del `describe` "Calendario de recepción – varias a la vez", después del último caso (antes del `});` final del archivo), agregar:

```ts
  test("deshacer: coach y mover sí, cancelar no; y si ya no se puede, dice por qué", async ({ adminPage: page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const clases = semanaEditable();
    await mockSemanaCalendario(page, clases);
    await page.route(/\/api\/instructors(\?|$)/, (route) => route.fulfill({ json: COACHES }));
    const bloqueos: Record<string, string> = {};
    const cuerpos = await mockLote(page, clases, { bloqueos });
    await page.goto(`/admin/calendar?date=${FECHA_PRUEBA}`);
    const barra = page.getByRole("toolbar", { name: "Acciones para las clases seleccionadas" });
    const barre = page.getByRole("button", { name: /^Barre/ });
    const deshacer = page.getByRole("button", { name: "Deshacer" });

    // Coach: todas tenían a Ana → "Deshacer" la regresa con una sola llamada.
    await page.getByRole("button", { name: "Seleccionar varias" }).click();
    await barre.click();
    await barra.getByRole("button", { name: "Cambiar coach" }).click();
    const coach = page.getByRole("dialog", { name: "Cambiar coach" });
    await expect(coach.getByRole("radio", { name: /Ana/ })).toBeDisabled(); // ya la da Ana
    await coach.getByRole("radio", { name: /Sofía/ }).click();
    await coach.getByRole("button", { name: "Cambiar a Sofía en 1 clase" }).click();
    await expect(barre).toContainText("Sofía");
    await deshacer.click();
    await expect(page.getByText("Cambio deshecho.").first()).toBeVisible();
    await expect(barre).toContainText("Ana");
    expect(cuerpos.at(-1)).toEqual({ classIds: [ID.barre], accion: "coach", instructorId: COACHES[0].id, vistaPrevia: false });

    // Mover: −minutos.
    const mover = page.getByRole("dialog", { name: "Mover o cambiar clase" });
    await barre.click();
    await barra.getByRole("button", { name: "Mover o cambiar clase" }).click();
    await mover.getByRole("radio", { name: "−1 h" }).click();
    await mover.getByRole("button", { name: "Mover 1 clase 1 h antes" }).click();
    await expect(page.getByRole("button", { name: /^Barre.*06:00/ })).toBeVisible();
    await deshacer.click();
    await expect(page.getByRole("button", { name: /^Barre.*07:00/ })).toBeVisible();
    expect(cuerpos.at(-1)).toEqual({ classIds: [ID.barre], accion: "mover", minutos: 60, vistaPrevia: false });

    // Si entre aplicar y deshacer la clase ya empezó: no se deshace y se dice por qué.
    await barre.click();
    await barra.getByRole("button", { name: "Mover o cambiar clase" }).click();
    await mover.getByRole("radio", { name: "+30 min" }).click();
    await mover.getByRole("button", { name: "Mover 1 clase 30 min más tarde" }).click();
    await expect(page.getByRole("button", { name: /^Barre.*07:30/ })).toBeVisible();
    bloqueos[ID.barre] = "Ya empezó.";
    await deshacer.click();
    await expect(page.getByText("No se pudo deshacer").first()).toBeVisible();
    await expect(page.getByText("Ya empezó.").first()).toBeVisible();
    await expect(page.getByRole("button", { name: /^Barre.*07:30/ })).toBeVisible();
    delete bloqueos[ID.barre];

    // Cancelar no se deshace.
    await barre.click();
    await barra.getByRole("button", { name: "Cancelar clases" }).click();
    await page.getByRole("dialog", { name: "Cancelar 1 clase" }).getByRole("button", { name: "Cancelar 1 clase" }).click();
    await expect(page.getByText("1 clase cancelada. Siguen en el calendario, marcadas.").first()).toBeVisible();
    await expect(deshacer).toHaveCount(0);
  });
```

- [ ] **Step 2: Correrla y ver que falla**

Run: `cd frontend && ./scripts/e2e-local.sh e2e/tests/admin-classes.spec.ts --project=chromium --workers=3 -g "deshacer"`
Expected: FAIL: no aparece el botón "Deshacer" después de cambiar la coach.

- [ ] **Step 3: "Deshacer" en la página**

En `frontend/src/pages/admin/classes/ClassesCalendar.tsx`:

a) Cambiar:

```tsx
import { alternar, alternarGrupo, atajosDesde, clasesSeleccionadas, quitarBloqueadas, resumenSeleccion, textoHecho, type AccionLote } from './calendario/seleccion';
```

por:

```tsx
import { alternar, alternarGrupo, atajosDesde, clasesSeleccionadas, inversaDe, quitarBloqueadas, resumenSeleccion, textoHecho, type AccionLote, type CuerpoLote, type RespuestaLote } from './calendario/seleccion';
```

b) Después de `import { useToast } from '@/components/ui/use-toast';` agregar:

```tsx
import { ToastAction } from '@/components/ui/toast';
import axios from 'axios';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api, { getErrorMessage } from '@/lib/api';
```

c) Cambiar:

```tsx
    const { toast } = useToast();
    const alAplicarLote = ({ accion, params, respuesta, nombres }: LoteAplicado) => {
        setAccionLote(null);
        setSeleccion(new Set());
        toast({ title: textoHecho(accion, params, respuesta, nombres) });
    };
```

por:

```tsx
    const { toast } = useToast();
    const queryClient = useQueryClient();
    // "Deshacer": la acción inversa en una sola llamada (solo coach y mover; ver inversaDe).
    const deshacer = useMutation({
        mutationFn: async (cuerpo: Omit<CuerpoLote, 'vistaPrevia'>) =>
            (await api.post('/classes/bulk', { ...cuerpo, vistaPrevia: false })).data as RespuestaLote,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['classes'] });
            toast({ title: 'Cambio deshecho.' });
        },
        onError: (err) => {
            // 409: ya no se puede (p. ej. una clase empezó). Se dice por qué, con el motivo del servidor.
            const r = axios.isAxiosError(err) && err.response?.status === 409 ? (err.response.data as RespuestaLote) : null;
            const motivo = r?.clases.find((c) => c.estado === 'bloqueada')?.motivo;
            toast({ variant: 'destructive', title: 'No se pudo deshacer', description: motivo ?? getErrorMessage(err) });
        },
    });
    const alAplicarLote = ({ accion, params, respuesta, antes, nombres }: LoteAplicado) => {
        setAccionLote(null);
        setSeleccion(new Set());
        const inversa = inversaDe(accion, params, antes);
        toast({
            title: textoHecho(accion, params, respuesta, nombres),
            action: inversa ? (
                <ToastAction altText="Deshacer el cambio" onClick={() => deshacer.mutate(inversa)}>Deshacer</ToastAction>
            ) : undefined,
        });
    };
```

- [ ] **Step 4: Correr la prueba**

Run:

```bash
cd frontend
npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -E "error TS" | grep -vE "FilterPills.tsx\(124|push.ts\(47|Events.tsx\((259|906)"
./scripts/e2e-local.sh e2e/tests/admin-classes.spec.ts --project=chromium --workers=3 -g "varias a la vez"
```

Expected: typecheck sin salida; Playwright `7 passed`.

- [ ] **Step 5: Verificación final de la rama**

Run:

```bash
cd "/Users/saidromero/Desktop/Casa She/casa-she-entrega-3/frontend"
for t in calendario-rejilla calendario-lugares calendario-cambios calendario-seleccion canales; do npx tsx scripts/test-$t.ts | tail -1; done
npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -E "error TS" | grep -vE "FilterPills.tsx\(124|push.ts\(47|Events.tsx\((259|906)"
npx tsc --noEmit -p e2e/tsconfig.json
npm run build >/dev/null && echo "build ok"
./scripts/e2e-local.sh e2e/tests/admin-classes.spec.ts e2e/tests/admin-channel-logos.spec.ts e2e/tests/admin-classes-bulk-api.spec.ts --project=chromium --workers=3
cd ../backend && npx tsc --noEmit && echo "tsc backend ok"
for t in test-clases-en-transaccion test-classes-bulk test-avisos-clase test-totalpass-cableado test-class-channels test-class-type-capacity test-copy-week; do
  DATABASE_URL=postgresql://localhost:5432/casa_she npx tsx scripts/$t.ts 2>&1 | grep -E "^test-[a-z-]+: OK$" || echo "$t: FALLÓ"
done
git grep -n "bulk-delete" -- frontend/src backend/src
```

Expected: las cinco pruebas puras `✅ … OK`; los dos typecheck sin salida; `build ok`; Playwright `22 passed` y `1 failed`: "listado de clases muestra tabla con datos" (página `/admin/classes`, no el calendario: ya fallaba antes de esta rama; si además falla "móvil: la lista del día…", vuelve a correrlo solo con `-g "móvil"`: es sensible a la carga y debe pasar); `tsc backend ok`; las siete pruebas del backend `…: OK` (ningún `FALLÓ`); `git grep` sin salida.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/admin/classes/ClassesCalendar.tsx frontend/e2e/tests/admin-classes.spec.ts
git commit -m "feat(calendario): deshacer un cambio en bloque

Después de cambiar coach o mover varias clases, el aviso ofrece Deshacer
cuando la acción inversa cabe en una sola llamada. Cupo y cancelar no se
deshacen. Si ya no se puede (la clase empezó), el aviso dice por qué.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

No hacer push ni abrir PR: el controlador revisa la rama completa y abre el PR contra `feat/calendario-semana-horas`.
