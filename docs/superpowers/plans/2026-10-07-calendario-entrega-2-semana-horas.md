# Entrega 2 — Semana por horas: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que recepción vea la semana como agenda por horas, con cada clase a su hora y sus lugares pintados por plataforma, y un panel de clase reordenado, sin perder nada de lo que el calendario hace hoy.

**Architecture:** El backend agrega `channels` (una entrada por fila de `channel_inventory`) a `GET /api/classes`. En el frontend, primero se parte `ClassesCalendar.tsx` (2,417 líneas) en `frontend/src/pages/admin/classes/calendario/` **sin cambiar comportamiento**: scripts que copian bloques exactos del commit base y verifican cuántas líneas tocan, con una prueba de humo en Playwright antes y después. Luego llegan la tarjeta con puntos de lugar, la rejilla por horas, el panel reordenado y la edición que solo manda lo que cambió. Toda la geometría (horas visibles, compactado, posición, carriles, "ahora" en CDMX) y el conteo de lugares viven en módulos puros probados con `tsx`.

**Tech Stack:** React 18 + Vite + TypeScript (no estricto), Tailwind (tokens `casa-*`), shadcn/ui sobre Radix, TanStack Query v5, date-fns 3; backend Express + pg; pruebas `tsx` + `node:assert`; Playwright 1.58.

**Spec:** `docs/superpowers/specs/2026-10-07-calendario-recepcion-design.md` (secciones "Reglas que aplican a todo" y "Entrega 2 — Semana por horas"; la Entrega 3 usará la rejilla para seleccionar varias clases y la Entrega 4 rehará "Inscribir alumna").

## Global Constraints

- Worktree `/Users/saidromero/Desktop/Casa She/casa-she-entrega-2`, rama `feat/calendario-semana-horas` (ya existe, sale de `origin/feat/logos-canales`). No crear ramas ni worktrees. Los comandos se corren desde la raíz del worktree salvo que el paso diga otra cosa. El disco está en iCloud: para buscar usa `git grep`, no búsquedas recursivas del sistema de archivos.
- Commit base para mover código: `ff4e304`. "El original" = `git show ff4e304:frontend/src/pages/admin/classes/ClassesCalendar.tsx`.
- Commits en español, `git add` explícito por archivo, mensaje terminado en `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Nunca `git stash`. Ninguna tarea hace push ni abre PR (el controlador abre el PR contra `feat/logos-canales` al final).
- Typecheck del frontend: `cd frontend && npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -E "error TS" | grep -vE "FilterPills.tsx\(124|push.ts\(47|Events.tsx\((259|906)"` no debe imprimir nada (esos 4 errores ya existen en main; ninguno nuevo).
- Typecheck del backend: `cd backend && npx tsc --noEmit` sin errores.
- Módulos puros (`rejilla.ts`, `lugares.ts`, `colores.ts`, `cambiosClase.ts`): sin imports con alias `@/` (rutas relativas y `date-fns` sí). Se prueban con `cd frontend && npx tsx scripts/test-<nombre>.ts`.
- Base de datos: SOLO la local, `DATABASE_URL=postgresql://localhost:5432/casa_she`, y dentro de `BEGIN … ROLLBACK`. Nunca producción ni `railway run`.
- Playwright SOLO con `frontend/scripts/e2e-local.sh` (copia desechable de la base local, backend en :3001 sin crons, WhatsApp ni pagos; se borra al final). Siempre en `/admin/calendar`: las rutas `/reception/*` redirigen con cuentas reales. Si falta el navegador: `cd frontend && npx playwright install chromium`.
- Tipografía de la app (`font-heading`, `font-body`); colores con tokens `casa-*` (o `balance-*` donde ya estaban). El color de una plataforma solo va en su logo y en sus puntos, nunca como color de texto.
- Lugares: `current_bookings` cuenta a TODAS las inscritas de todos los canales (trigger `update_class_booking_count`). Alumnas de Casa Shé = `current_bookings − Σ channels[].booked`, mínimo 0. Orden de los puntos: alumnas (color del tipo de clase, oscurecido hasta contraste 3:1 si es pálido), socias por canal (TotalPass, Fitpass, otros), libres huecos. Un punto de canal SIEMPRE lleva relleno `CANALES[c].punto` y anillo `CANALES[c].anillo` (`PuntoLugar` / `ChannelDot`; nunca un punto sin anillo).
- Tarjeta: nombre con intensidad, hora, coach ("Sin coach asignada" resaltado si falta), puntos, "n/7" o "Lleno". Salsa = `category === 'reformer'` → tarjeta oscura. Cancelada: atenuada y tachada, sigue visible para staff. La pastilla "TP n" desaparece.
- Geometría (del mockup aprobado `docs/superpowers/assets/calendario-recepcion/mockups/Main.dc.html`): 76 px por hora, franja de 32 px con el rango ("11 – 18") para los tramos sin clases en toda la semana, encabezado de día de 68 px, eje de 60 px, rejilla de mínimo 1040 px de ancho, 2 px de aire arriba y abajo de cada tarjeta, línea de "ahora" en hora de CDMX.
- Se conserva todo lo de hoy: intensidad (`ClassIntensity`), invitadas (`CompanionPanel`, `CompanionReview`), lista de espera, check-in, cupo cerrado, clase gratis, canceladas visibles para staff, días cerrados, filtros (programa Salsa/Clases, tipo de clase, coach), `?date=YYYY-MM-DD`, diálogos Generar / Copiar semana / Nueva clase / Gratis, cambiar coach, cancelar una o la serie, vender plan + inscribir (admin-book), modo `embedded` (recepción).
- "Limpiar semana" desaparece de la interfaz (el endpoint lo retira la Entrega 3). "Editar clase" manda a `PUT /api/classes/:id` solo los campos que cambiaron.
- Nada de selección múltiple (Entrega 3) ni del nuevo "Inscribir" (Entrega 4). `TarjetaClase` deja pasar los props de botón y `RejillaSemana` / `EncabezadoDia` reciben `onClick…` genéricos: la Entrega 3 agrega props, no reescribe.
- Debajo de `lg`: tira de días + lista del día con la tarjeta nueva. La rejilla por horas es solo de escritorio.

## Review Focus

- Dos clases del mismo día que se enciman (la cancelada y la que la reemplaza a la misma hora): las dos visibles, lado a lado, ninguna tapada. Cubierto en Task 2 (`carriles`) y Task 7 (Playwright "dos clases a la misma hora se ven lado a lado").
- Conteos que no cuadran (canales con más `booked` que `current_bookings`, números como texto, `null`, más inscritas que cupo): sin negativos, sin lugares perdidos, "Lleno" cuando toca. Cubierto en Task 2 (`lugaresDeClase`).
- Tipos de clase con color pálido, inválido o sin color: los puntos de alumnas se distinguen (≥ 3:1 sobre su tarjeta). Cubierto en Task 2 (`colorPuntoAlumna`).
- Bajar el cupo de una plataforma por debajo de las socias ya inscritas: "−" deshabilitado (el servidor respondería 409). Cubierto en Task 8 (Playwright con Pilates Mat).
- Guardar "Editar clase" sin cambios, o cambiando solo el cupo de TotalPass: no se llama `PUT /api/classes/:id` (ese PUT marca resincronización con TotalPass). Cubierto en Task 9 (prueba `tsx` y Playwright).

## Mapa de archivos

| Archivo | Responsabilidad | Task |
| --- | --- | --- |
| `backend/src/lib/class-channels.ts` | Fragmento SQL `channels` (JSON por fila de `channel_inventory`) | 1 |
| `backend/src/routes/classes.ts` | `GET /api/classes` agrega `channels` | 1 |
| `backend/scripts/test-class-channels.ts` | Prueba contra Postgres local + cableado | 1 |
| `frontend/src/types/class.ts` | `ClassChannel`, `Class.channels` | 1 |
| `frontend/src/pages/admin/classes/calendario/rejilla.ts` | Horas visibles, compactado, posición, carriles, "ahora" CDMX, título de semana (puro) | 2 |
| `…/calendario/lugares.ts` | Lugares por clase, estilo de cada punto, resúmenes de día y semana (puro) | 2 |
| `…/calendario/colores.ts` | Fondo/borde de tarjeta y color de punto de alumna con contraste (puro) | 2 |
| `frontend/scripts/test-calendario-rejilla.ts`, `test-calendario-lugares.ts` | Pruebas de lo anterior | 2 |
| `…/calendario/tipos.ts`, `formato.ts` | Tipos y formatos compartidos (movidos) | 3 |
| `…/calendario/useSemanaClases.ts` | Consultas, semana, día elegido, filtros (movido) | 3 |
| `frontend/scripts/e2e-local.sh` | Playwright contra copia desechable de la base local | 3 |
| `frontend/e2e/fixtures/calendario.ts` | Semana fija de prueba (intercepta `GET /api/classes`) | 3 |
| `frontend/e2e/tests/admin-classes.spec.ts` | Casos "Calendario de recepción – semana por horas" | 3, 6–9 |
| `…/calendario/Dialogo*.tsx` (7) | Generar, Nueva clase, Editar, Copiar semana, Gratis, Cancelar, Cambiar coach (movidos) | 4 |
| `…/calendario/PanelClase.tsx` | Panel lateral de la clase (movido en 5, reordenado en 8) | 5, 8 |
| `frontend/src/components/brands/ChannelDot.tsx` | `PuntoLugar` (relleno + anillo siempre) y `ChannelDot` | 6 |
| `…/calendario/TarjetaClase.tsx` | Tarjeta de clase (rejilla y lista) | 6 |
| `…/calendario/VistaDiaMovil.tsx` | Tira de días + lista del día (debajo de `lg`) | 6 |
| `…/calendario/EncabezadoDia.tsx`, `RejillaSemana.tsx`, `LeyendaLugares.tsx` | Semana por horas en escritorio | 7 |
| `frontend/src/pages/admin/classes/ClassesCalendar.tsx` | Orquestador (sigue siendo la página y el export default) | 3–9 |
| `…/calendario/cambiosClase.ts` + `frontend/scripts/test-calendario-cambios.ts` | Solo los campos que cambiaron al editar | 9 |

---

### Task 1: `GET /api/classes` devuelve `channels`

**Tipo:** código completo, se transcribe. Toca la base local (solo lectura dentro de `BEGIN … ROLLBACK`).

**Files:**
- Create: `backend/src/lib/class-channels.ts`
- Modify: `backend/src/routes/classes.ts` (imports ~L21; `SELECT` de `GET /` ~L77-90)
- Modify: `backend/package.json` (script `test`)
- Modify: `frontend/src/types/class.ts` (interfaz `Class`)
- Test: `backend/scripts/test-class-channels.ts`

**Interfaces:**
- Produces (backend): `CANALES_DE_CLASE_SQL: string` (fragmento de SELECT que espera la clase con alias `c`), `interface CanalDeClase { channel: string; max: number; booked: number }` en `backend/src/lib/class-channels.ts`.
- Produces (API): cada clase de `GET /api/classes` trae `channels: Array<{ channel: string; max: number; booked: number }>`, ordenado por `channel`, `[]` si no hay filas. `totalpass_spots` y `totalpass_booked` se quedan igual.
- Produces (frontend): `export interface ClassChannel { channel: string; max: number; booked: number }` y `Class.channels: ClassChannel[]` en `frontend/src/types/class.ts`.

- [ ] **Step 0: Dependencias**

```bash
cd "/Users/saidromero/Desktop/Casa She/casa-she-entrega-2"
(cd backend && npm ci) && (cd frontend && npm ci)
cd backend && npx tsc --noEmit; echo "tsc backend: $?"
```

Expected: `npm ci` sin errores; `tsc backend: 0` (línea base limpia).

- [ ] **Step 1: Escribir la prueba que falla**

Crear `backend/scripts/test-class-channels.ts`:

```ts
// GET /api/classes trae `channels`: un elemento por fila de channel_inventory
// ({ channel, max, booked }), ordenado por canal, y [] si la clase no tiene filas.
// Corre contra la base LOCAL dentro de una transacción que se revierte.
//
// Correr con: DATABASE_URL=postgresql://localhost:5432/casa_she npx tsx scripts/test-class-channels.ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { pool } from '../src/config/database.js';
import { CANALES_DE_CLASE_SQL } from '../src/lib/class-channels.js';

// ── Cableado: la ruta usa el fragmento y conserva los campos de antes ───────
const ruta = readFileSync(fileURLToPath(new URL('../src/routes/classes.ts', import.meta.url)), 'utf8');
assert.match(ruta, /\$\{CANALES_DE_CLASE_SQL\} AS channels/, 'GET /api/classes debe devolver channels');
assert.match(ruta, /AS totalpass_spots/, 'totalpass_spots se conserva por compatibilidad');
assert.match(ruta, /AS totalpass_booked/, 'totalpass_booked se conserva por compatibilidad');
console.log('  cableado: OK');

async function main() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN'); // todo vive en una transacción que se revierte

        const ct = (await client.query(`SELECT id FROM class_types LIMIT 1`)).rows[0];
        const ins = (await client.query(`SELECT id FROM instructors LIMIT 1`)).rows[0];
        const fac = (await client.query(`SELECT id FROM facilities LIMIT 1`)).rows[0];
        assert.ok(ct && ins && fac, 'la base local necesita al menos un tipo de clase, un coach y una sucursal');

        const crear = async (hora: string) => (await client.query(
            `INSERT INTO classes (class_type_id, instructor_id, facility_id, date, start_time, end_time, max_capacity, status)
             VALUES ($1, $2, $3, CURRENT_DATE + 30, $4::time, $4::time + interval '50 minutes', 7, 'scheduled') RETURNING id`,
            [ct.id, ins.id, fac.id, hora],
        )).rows[0].id as string;
        const conCanales = await crear('05:10');
        const sinCanales = await crear('05:20');
        // El trigger puede sembrar TotalPass con el default del tipo: se parte de cero.
        await client.query(`DELETE FROM channel_inventory WHERE class_id = ANY($1::uuid[])`, [[conCanales, sinCanales]]);
        await client.query(
            `INSERT INTO channel_inventory (class_id, channel, max_spots, booked_spots)
             VALUES ($1, 'totalpass', 3, 1), ($1, 'fitpass', 2, 0)`,
            [conCanales],
        );

        // Igual que la ruta: con el LEFT JOIN de TotalPass (alias ci) al lado.
        const leer = async (id: string) => (await client.query(
            `SELECT ci.max_spots AS totalpass_spots, ${CANALES_DE_CLASE_SQL} AS channels
               FROM classes c
               LEFT JOIN channel_inventory ci ON ci.class_id = c.id AND ci.channel = 'totalpass'
              WHERE c.id = $1`,
            [id],
        )).rows[0];

        const a = await leer(conCanales);
        assert.deepEqual(a.channels, [
            { channel: 'fitpass', max: 2, booked: 0 },
            { channel: 'totalpass', max: 3, booked: 1 },
        ], 'un elemento por fila, ordenados por canal, con números');
        assert.equal(a.totalpass_spots, 3, 'el campo viejo sigue igual');
        const b = await leer(sinCanales);
        assert.deepEqual(b.channels, [], 'sin filas → arreglo vacío, nunca null');
        console.log('  channels: un elemento por fila y [] sin filas · OK');

        await client.query('ROLLBACK');
        console.log('test-class-channels: OK');
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

Run: `cd backend && DATABASE_URL=postgresql://localhost:5432/casa_she npx tsx scripts/test-class-channels.ts`
Expected: FAIL con `Cannot find module '../src/lib/class-channels.js'`.

- [ ] **Step 3: El fragmento SQL**

Crear `backend/src/lib/class-channels.ts`:

```ts
/**
 * Cupo y reservas de cada plataforma en una clase, como arreglo JSON: un elemento
 * por fila de channel_inventory, ordenado por canal; [] si no hay filas.
 * Es un fragmento de SELECT: espera la clase con alias `c`.
 */
export const CANALES_DE_CLASE_SQL = `COALESCE((
            SELECT json_agg(json_build_object('channel', cc.channel, 'max', cc.max_spots, 'booked', cc.booked_spots) ORDER BY cc.channel)
              FROM channel_inventory cc
             WHERE cc.class_id = c.id
        ), '[]'::json)`;

/** Un elemento de `channels` en GET /api/classes. */
export interface CanalDeClase {
    channel: string;
    max: number;
    booked: number;
}
```

- [ ] **Step 4: Usarlo en `GET /api/classes`**

En `backend/src/routes/classes.ts`, después de la línea

```ts
import { copiarSemana, diasEntre } from '../lib/copy-week.js';
```

agregar:

```ts
import { CANALES_DE_CLASE_SQL } from '../lib/class-channels.js';
```

Y en el `SELECT` de `router.get('/', optionalAuth, …)` cambiar:

```ts
        COALESCE(ci.booked_spots, 0) AS totalpass_booked
      FROM classes c
```

por:

```ts
        COALESCE(ci.booked_spots, 0) AS totalpass_booked,
        -- Una entrada por plataforma (channel_inventory): pinta los lugares de cada una.
        ${CANALES_DE_CLASE_SQL} AS channels
      FROM classes c
```

(El `queryStr` ya es un template literal, así que `${…}` se interpola. El subquery usa el alias `cc` para no chocar con el `LEFT JOIN channel_inventory ci` de TotalPass.)

- [ ] **Step 5: Sumarla a `npm test`**

En `backend/package.json`, en el script `"test"`, cambiar el final:

```
&& tsx scripts/test-membership-validity.ts",
```

por:

```
&& tsx scripts/test-membership-validity.ts && tsx scripts/test-class-channels.ts",
```

(Ojo: la línea `"test:membership-validity"` también termina en `test-membership-validity.ts",` pero sin `&& ` antes; se cambia solo la del script `"test"`.)

- [ ] **Step 6: Correr la prueba y el typecheck**

Run:

```bash
cd backend && DATABASE_URL=postgresql://localhost:5432/casa_she npx tsx scripts/test-class-channels.ts && npx tsc --noEmit && echo "tsc ok"
```

Expected (entre los logs de conexión):

```
  cableado: OK
  channels: un elemento por fila y [] sin filas · OK
test-class-channels: OK
tsc ok
```

- [ ] **Step 7: Tipo `Class` en el frontend**

En `frontend/src/types/class.ts`, antes de `export interface Class {` agregar:

```ts
/** Cupo y reservas de una plataforma en una clase (una fila de channel_inventory). */
export interface ClassChannel {
    channel: string;
    max: number;
    booked: number;
}

```

y dentro de `Class`, después de

```ts
    /** Cuántos de esos lugares ya ocupó TotalPass (para marcar la clase en la rejilla). */
    totalpass_booked?: number;
```

agregar:

```ts
    /** Una entrada por canal con fila en channel_inventory (hoy TotalPass; Fitpass después). */
    channels: ClassChannel[];
```

- [ ] **Step 8: Typecheck del frontend**

Run: `cd frontend && npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -E "error TS" | grep -vE "FilterPills.tsx\(124|push.ts\(47|Events.tsx\((259|906)"`
Expected: no imprime nada.

- [ ] **Step 9: Commit**

```bash
git add backend/src/lib/class-channels.ts backend/src/routes/classes.ts backend/scripts/test-class-channels.ts backend/package.json frontend/src/types/class.ts
git commit -m "feat(calendario): GET /api/classes devuelve los lugares de cada plataforma

channels trae una entrada por fila de channel_inventory ({ channel, max,
booked }) para pintar en la tarjeta quién viene de cada plataforma.
totalpass_spots y totalpass_booked se quedan por compatibilidad.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Lógica pura de la semana por horas y de los lugares

**Tipo:** código completo con TDD, se transcribe. No toca pantallas.

**Files:**
- Create: `frontend/src/pages/admin/classes/calendario/rejilla.ts`
- Create: `frontend/src/pages/admin/classes/calendario/colores.ts`
- Create: `frontend/src/pages/admin/classes/calendario/lugares.ts`
- Test: `frontend/scripts/test-calendario-rejilla.ts`, `frontend/scripts/test-calendario-lugares.ts`

**Interfaces:**
- Consumes: `CANALES`, `esCanal` de `frontend/src/lib/canales.ts` (Entrega 1; por ruta relativa `../../../../lib/canales`).
- Produces (`rejilla.ts`):
  - constantes `ALTO_HORA = 76`, `ALTO_FRANJA = 32`, `HORAS_MINIMAS_PARA_COMPACTAR = 2`, `MARGEN_TARJETA = 2`, `ALTO_TARJETA_COMPLETA = 56`, `ALTO_TARJETA_MINIMO = 24`, `RANGO_SIN_CLASES = { desde: 420, hasta: 1260 }`, `DURACION_SIN_FIN = 60`
  - `type Tramo = { tipo: 'horas'; desde; hasta; top; alto } | { tipo: 'franja'; desde; hasta; top; alto; etiqueta }`, `interface Rejilla { tramos: Tramo[]; altoTotal: number; horas: { minuto; etiqueta; top }[] }`, `interface Intervalo { inicio: number; fin: number }`
  - `aMinutos(hora: string | null | undefined): number | null`
  - `intervaloDeClase(c: { start_time?: string | null; end_time?: string | null }): Intervalo | null`
  - `construirRejilla(clases: { start_time?; end_time? }[]): Rejilla`
  - `yDeMinuto(rejilla: Rejilla, minuto: number): number | null`
  - `posicionDeClase(rejilla, c): { top: number; alto: number; completa: boolean } | null`
  - `carriles(items: Array<{ id: string } & Intervalo>): Map<string, { carril: number; total: number }>`
  - `ahoraEnCdmx(instante: Date): { fecha: string; minutos: number }`
  - `lineaAhora(rejilla, fechasDeLaSemana: string[], ahora): { fecha: string; top: number } | null`
  - `tituloSemana(lunes: Date): string`
- Produces (`colores.ts`): `COLOR_ALUMNA_POR_DEFECTO = '#2A4E36'`, `FONDO_TARJETA = '#FCF8EF'`, `ALFA_FONDO_TARJETA`, `ALFA_BORDE_TARJETA`, `hexARgb`, `mezclarConFondo(color, alfa, fondo?)`, `contraste(a, b)`, `fondoDeTarjeta(colorTipo)`, `bordeDeTarjeta(colorTipo)`, `colorPuntoAlumna(colorTipo): string`.
- Produces (`lugares.ts`): `MAX_PUNTOS_TARJETA = 12`, `ANILLO_LIBRE_CLARO = '#9C8E80'`, `ANILLO_LIBRE_OSCURO`, `interface CanalDeClase`, `interface ClaseConLugares { current_bookings?; max_capacity?; status?; channels? }`, `type Lugar = { tipo: 'alumna' } | { tipo: 'canal'; canal: string } | { tipo: 'libre' }`, `interface LugaresDeClase { capacidad; ocupados; alumnas; porCanal: { canal; reservados }[]; socias; libres; lleno; lugares: Lugar[] }`, `interface ResumenDeClases { clases; libres; socias }`, `lugaresDeClase(c)`, `etiquetaCupo(l)` ("3/7" | "Lleno"), `etiquetaCupoLarga(l)` ("3 de 7 · 4 libres" | "7 de 7 · llena"), `estiloDeLugar(lugar, colorAlumna, fondo?: 'claro' | 'oscuro'): { relleno; anillo }`, `resumenDeClases(clases)`, `textoResumenDia(r)` ("2 clases · 4 libres" | "Sin clases"), `textoResumenSemana(r)` ("4 clases · 11 lugares libres · 3 socias").

- [ ] **Step 1: Escribir las pruebas que fallan**

Crear `frontend/scripts/test-calendario-rejilla.ts`:

```ts
// Semana por horas: horas visibles, compactado de las horas sin clases, posición
// de cada clase, carriles cuando dos se enciman y la línea de "ahora" en CDMX.
// Correr con: npx tsx scripts/test-calendario-rejilla.ts
import assert from 'node:assert/strict';
import {
    ALTO_FRANJA,
    ALTO_HORA,
    ALTO_TARJETA_MINIMO,
    aMinutos,
    ahoraEnCdmx,
    carriles,
    construirRejilla,
    intervaloDeClase,
    lineaAhora,
    posicionDeClase,
    tituloSemana,
    yDeMinuto,
} from '../src/pages/admin/classes/calendario/rejilla.js';

const c = (start_time: string, end_time: string) => ({ start_time, end_time });

// ── aMinutos ────────────────────────────────────────────────────────────────
assert.equal(aMinutos('07:30'), 450);
assert.equal(aMinutos('07:30:00'), 450);
assert.equal(aMinutos('7:05'), 425);
for (const malo of [null, undefined, '', 'abc', '24:00', '07:75']) {
    assert.equal(aMinutos(malo), null, `aMinutos(${JSON.stringify(malo)})`);
}

// ── intervaloDeClase: sin fin válido dura 60 min (nunca alto 0) ─────────────
assert.deepEqual(intervaloDeClase(c('07:00', '07:50')), { inicio: 420, fin: 470 });
assert.deepEqual(intervaloDeClase(c('07:00', '07:00')), { inicio: 420, fin: 480 });
assert.deepEqual(intervaloDeClase(c('07:00', '')), { inicio: 420, fin: 480 });
assert.deepEqual(intervaloDeClase(c('23:30', '')), { inicio: 1410, fin: 1440 });
assert.equal(intervaloDeClase(c('', '08:00')), null);

// ── construirRejilla: la semana de la prueba en navegador ───────────────────
// Ocupadas 7, 8, 10, 18 y 19 h. El hueco de las 9 (1 h) se queda; 11–18 se compacta.
const semana = [c('07:00', '07:50'), c('08:00', '08:50'), c('10:00', '11:00'), c('18:00', '18:50'), c('19:00', '19:50')];
const r = construirRejilla(semana);
assert.deepEqual(r.tramos, [
    { tipo: 'horas', desde: 420, hasta: 660, top: 0, alto: 4 * ALTO_HORA },
    { tipo: 'franja', desde: 660, hasta: 1080, top: 304, alto: ALTO_FRANJA, etiqueta: '11 – 18' },
    { tipo: 'horas', desde: 1080, hasta: 1200, top: 336, alto: 2 * ALTO_HORA },
]);
assert.equal(r.altoTotal, 488);
assert.deepEqual(
    r.horas.map((h) => [h.etiqueta, h.top]),
    [['7:00', 0], ['8:00', 76], ['9:00', 152], ['10:00', 228], ['18:00', 336], ['19:00', 412]],
);

// Un hueco de 1 h se ve completo; uno de 2 h ya es franja.
assert.equal(construirRejilla([c('07:00', '08:00'), c('09:00', '10:00')]).tramos.length, 1);
const dos = construirRejilla([c('07:00', '08:00'), c('10:00', '11:00')]);
assert.deepEqual(dos.tramos.map((t) => t.tipo), ['horas', 'franja', 'horas']);
assert.equal(dos.tramos[1].tipo === 'franja' ? dos.tramos[1].etiqueta : '', '8 – 10');

// Semana vacía: 7:00 a 21:00, sin franjas.
assert.deepEqual(construirRejilla([]).tramos, [{ tipo: 'horas', desde: 420, hasta: 1260, top: 0, alto: 14 * ALTO_HORA }]);
// Clases sin hora válida no rompen nada.
assert.deepEqual(construirRejilla([c('', '')]).tramos, construirRejilla([]).tramos);
// Una clase que cruza la hora en punto ocupa las dos horas.
assert.deepEqual(construirRejilla([c('07:30', '08:20')]).tramos, [{ tipo: 'horas', desde: 420, hasta: 540, top: 0, alto: 2 * ALTO_HORA }]);
// Horarios no redondos (13:05) caen en su hora.
assert.deepEqual(construirRejilla([c('13:05', '13:55')]).tramos, [{ tipo: 'horas', desde: 780, hasta: 840, top: 0, alto: ALTO_HORA }]);

// ── yDeMinuto ───────────────────────────────────────────────────────────────
assert.equal(yDeMinuto(r, 420), 0);
assert.equal(yDeMinuto(r, 505), (85 / 60) * ALTO_HORA);
assert.equal(yDeMinuto(r, 660), 304);
assert.equal(yDeMinuto(r, 870), 304 + ALTO_FRANJA / 2); // 14:30, a la mitad de la franja 11–18
assert.equal(yDeMinuto(r, 1080), 336);
assert.equal(yDeMinuto(r, 1200), 488);
assert.equal(yDeMinuto(r, 419), null);
assert.equal(yDeMinuto(r, 1201), null);

// ── posicionDeClase: 2 px de aire arriba y abajo ────────────────────────────
assert.deepEqual(posicionDeClase(r, c('07:00', '07:50')), { top: 2, alto: 59, completa: true });
assert.deepEqual(posicionDeClase(r, c('08:00', '08:50')), { top: 78, alto: 59, completa: true });
assert.deepEqual(posicionDeClase(r, c('10:00', '11:00')), { top: 230, alto: 72, completa: true });
assert.deepEqual(posicionDeClase(r, c('18:00', '18:50')), { top: 338, alto: 59, completa: true });
const corta = construirRejilla([c('07:00', '07:30')]);
assert.deepEqual(posicionDeClase(corta, c('07:00', '07:30')), { top: 2, alto: 34, completa: false });
assert.deepEqual(posicionDeClase(corta, c('07:00', '07:10')), { top: 2, alto: ALTO_TARJETA_MINIMO, completa: false });
assert.deepEqual(posicionDeClase(corta, c('07:00', '07:00')), { top: 2, alto: 72, completa: true }); // sin fin: 60 min
assert.equal(posicionDeClase(corta, c('09:00', '09:50')), null); // fuera de la rejilla
assert.equal(posicionDeClase(corta, c('', '07:50')), null);

// ── carriles ────────────────────────────────────────────────────────────────
const iv = (id: string, inicio: string, fin: string) => ({ id, ...intervaloDeClase(c(inicio, fin))! });
assert.deepEqual(Object.fromEntries(carriles([iv('a', '07:00', '07:50'), iv('b', '08:00', '08:50')])), {
    a: { carril: 0, total: 1 },
    b: { carril: 0, total: 1 },
});
// Una cancelada y su reemplazo a la misma hora: lado a lado, ninguna tapa a la otra.
assert.deepEqual(Object.fromEntries(carriles([iv('nueva', '19:00', '19:50'), iv('cancelada', '19:00', '19:50')])), {
    cancelada: { carril: 0, total: 2 },
    nueva: { carril: 1, total: 2 },
});
// Cadena A 7:00–8:00, B 7:30–8:30, C 8:00–9:00: dos columnas; C reusa la de A.
assert.deepEqual(Object.fromEntries(carriles([iv('A', '07:00', '08:00'), iv('B', '07:30', '08:30'), iv('C', '08:00', '09:00')])), {
    A: { carril: 0, total: 2 },
    B: { carril: 1, total: 2 },
    C: { carril: 0, total: 2 },
});
// Pegadas (una termina cuando empieza la otra) no se enciman.
assert.equal(carriles([iv('x', '07:00', '08:00'), iv('y', '08:00', '09:00')]).get('y')?.total, 1);
assert.equal(carriles([]).size, 0);

// ── ahoraEnCdmx: CDMX es UTC−6 todo el año ──────────────────────────────────
assert.deepEqual(ahoraEnCdmx(new Date('2026-11-04T14:25:00Z')), { fecha: '2026-11-04', minutos: 505 });
// 03:30 UTC del 8 de octubre todavía es el 7 a las 21:30 en el estudio.
assert.deepEqual(ahoraEnCdmx(new Date('2026-10-08T03:30:00Z')), { fecha: '2026-10-07', minutos: 1290 });
// Medianoche: minuto 0, nunca 24:00.
assert.deepEqual(ahoraEnCdmx(new Date('2026-11-05T06:00:00Z')), { fecha: '2026-11-05', minutos: 0 });

// ── lineaAhora ──────────────────────────────────────────────────────────────
const fechas = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08'];
assert.deepEqual(lineaAhora(r, fechas, { fecha: '2026-11-04', minutos: 505 }), { fecha: '2026-11-04', top: 108 });
assert.deepEqual(lineaAhora(r, fechas, { fecha: '2026-11-04', minutos: 870 }), { fecha: '2026-11-04', top: 320 });
assert.equal(lineaAhora(r, fechas, { fecha: '2026-11-09', minutos: 505 }), null); // otra semana
assert.equal(lineaAhora(r, fechas, { fecha: '2026-11-04', minutos: 6 * 60 }), null); // antes de la primera hora

// ── tituloSemana ────────────────────────────────────────────────────────────
assert.equal(tituloSemana(new Date(2026, 10, 2)), '2 – 8 de noviembre de 2026');
assert.equal(tituloSemana(new Date(2026, 8, 28)), '28 de septiembre – 4 de octubre de 2026');
assert.equal(tituloSemana(new Date(2026, 11, 28)), '28 de diciembre de 2026 – 3 de enero de 2027');

console.log('✅ test-calendario-rejilla OK');
```

Crear `frontend/scripts/test-calendario-lugares.ts`:

```ts
// Lugares de una clase (alumnas de Casa Shé, socias por plataforma, libres),
// colores de los puntos y resúmenes de día y semana.
// Correr con: npx tsx scripts/test-calendario-lugares.ts
import assert from 'node:assert/strict';
import { CANALES } from '../src/lib/canales.js';
import {
    ANILLO_LIBRE_CLARO,
    ANILLO_LIBRE_OSCURO,
    MAX_PUNTOS_TARJETA,
    estiloDeLugar,
    etiquetaCupo,
    etiquetaCupoLarga,
    lugaresDeClase,
    resumenDeClases,
    textoResumenDia,
    textoResumenSemana,
    type Lugar,
} from '../src/pages/admin/classes/calendario/lugares.js';
import {
    COLOR_ALUMNA_POR_DEFECTO,
    FONDO_TARJETA,
    colorPuntoAlumna,
    contraste,
    fondoDeTarjeta,
    mezclarConFondo,
} from '../src/pages/admin/classes/calendario/colores.js';

const tipos = (ls: Lugar[]) => ls.map((l) => (l.tipo === 'canal' ? l.canal : l.tipo));

// ── lugaresDeClase ──────────────────────────────────────────────────────────
// Barre de la prueba en navegador: 3 inscritas, 1 de TotalPass.
const barre = lugaresDeClase({ current_bookings: 3, max_capacity: 7, channels: [{ channel: 'totalpass', max: 2, booked: 1 }] });
assert.deepEqual(tipos(barre.lugares), ['alumna', 'alumna', 'totalpass', 'libre', 'libre', 'libre', 'libre']);
assert.equal(barre.alumnas, 2);
assert.equal(barre.socias, 1);
assert.equal(barre.libres, 4);
assert.equal(etiquetaCupo(barre), '3/7');
assert.equal(etiquetaCupoLarga(barre), '3 de 7 · 4 libres');

const llena = lugaresDeClase({ current_bookings: 7, max_capacity: 7, channels: [{ channel: 'totalpass', max: 2, booked: 2 }] });
assert.equal(etiquetaCupo(llena), 'Lleno');
assert.equal(etiquetaCupoLarga(llena), '7 de 7 · llena');
assert.equal(etiquetaCupoLarga(lugaresDeClase({ current_bookings: 6, max_capacity: 7 })), '6 de 7 · 1 libre');

// Orden: alumnas, canales del catálogo (TotalPass, Fitpass), otros canales, libres.
const varios = lugaresDeClase({
    current_bookings: 5,
    max_capacity: 7,
    channels: [
        { channel: 'wellhub', max: 1, booked: 1 },
        { channel: 'fitpass', max: 2, booked: 1 },
        { channel: 'totalpass', max: 2, booked: 2 },
    ],
});
assert.deepEqual(tipos(varios.lugares), ['alumna', 'totalpass', 'totalpass', 'fitpass', 'wellhub', 'libre', 'libre']);
assert.deepEqual(varios.porCanal, [
    { canal: 'totalpass', reservados: 2 },
    { canal: 'fitpass', reservados: 1 },
    { canal: 'wellhub', reservados: 1 },
]);

// Sin canales (channels ausente, vacío o null): todas son alumnas.
assert.deepEqual(tipos(lugaresDeClase({ current_bookings: 2, max_capacity: 3 }).lugares), ['alumna', 'alumna', 'libre']);
assert.deepEqual(tipos(lugaresDeClase({ current_bookings: 1, max_capacity: 2, channels: null }).lugares), ['alumna', 'libre']);

// Datos que no cuadran: nunca negativos ni lugares perdidos.
// Los canales dicen más que el total (el contador se atrasó) → 0 alumnas, se ven las socias.
const desfasada = lugaresDeClase({ current_bookings: 1, max_capacity: 7, channels: [{ channel: 'totalpass', max: 3, booked: 2 }] });
assert.equal(desfasada.alumnas, 0);
assert.equal(desfasada.ocupados, 2);
assert.deepEqual(tipos(desfasada.lugares).slice(0, 3), ['totalpass', 'totalpass', 'libre']);
// Más inscritas que cupo (bajaron la capacidad) → se ven todas y dice Lleno.
const sobrevendida = lugaresDeClase({ current_bookings: 8, max_capacity: 7, channels: [] });
assert.equal(sobrevendida.lugares.length, 8);
assert.equal(etiquetaCupo(sobrevendida), 'Lleno');
// Números como texto, nulos y negativos.
const rara = lugaresDeClase({ current_bookings: '3', max_capacity: '7', channels: [{ channel: 'totalpass', max: 2, booked: -1 }, null] });
assert.equal(rara.alumnas, 3);
assert.equal(rara.libres, 4);
assert.equal(lugaresDeClase({ current_bookings: null, max_capacity: null }).lugares.length, 0);
assert.equal(MAX_PUNTOS_TARJETA, 12);

// ── estiloDeLugar: cada canal SIEMPRE con punto y anillo ────────────────────
for (const canal of Object.values(CANALES)) {
    assert.deepEqual(estiloDeLugar({ tipo: 'canal', canal: canal.clave }, '#2A4E36'), { relleno: canal.punto, anillo: canal.anillo });
    assert.notEqual(canal.anillo, canal.punto, `${canal.clave}: el anillo debe distinguirse del relleno`);
}
const sinCatalogo = estiloDeLugar({ tipo: 'canal', canal: 'wellhub' }, '#2A4E36');
assert.ok(sinCatalogo.relleno && sinCatalogo.anillo && sinCatalogo.relleno !== sinCatalogo.anillo);
assert.deepEqual(estiloDeLugar({ tipo: 'alumna' }, '#7A3550'), { relleno: '#7A3550', anillo: '#7A3550' });
assert.deepEqual(estiloDeLugar({ tipo: 'libre' }, '#7A3550'), { relleno: 'transparent', anillo: ANILLO_LIBRE_CLARO });
assert.deepEqual(estiloDeLugar({ tipo: 'libre' }, '#F6F0E4', 'oscuro'), { relleno: 'transparent', anillo: ANILLO_LIBRE_OSCURO });

// ── colores: el punto de alumna se distingue (≥ 3:1) aunque el tipo sea pálido ─
for (const color of ['#B7AE9B', '#6B8445', '#2E5B45', '#6C9999', '#FFFFFF', '#F6F0E4', '#7A3550', '#abc', null, undefined, 'rojo']) {
    const punto = colorPuntoAlumna(color);
    assert.ok(contraste(punto, fondoDeTarjeta(color)) >= 3, `${String(color)} → ${punto}`);
}
assert.equal(colorPuntoAlumna('#2A4E36'), '#2A4E36', 'un color que ya contrasta se queda igual');
assert.equal(colorPuntoAlumna(null), COLOR_ALUMNA_POR_DEFECTO);
assert.equal(mezclarConFondo('#000000', 0), FONDO_TARJETA.toLowerCase());
assert.equal(mezclarConFondo('#000000', 1), '#000000');
assert.equal(contraste('#000000', '#FFFFFF').toFixed(1), '21.0');

// ── resúmenes ───────────────────────────────────────────────────────────────
const lunes = [
    { current_bookings: 3, max_capacity: 7, channels: [{ channel: 'totalpass', max: 2, booked: 1 }] },
    { current_bookings: 7, max_capacity: 7, channels: [{ channel: 'totalpass', max: 2, booked: 2 }] },
    { current_bookings: 0, max_capacity: 7, status: 'cancelled', channels: [] },
];
assert.deepEqual(resumenDeClases(lunes), { clases: 2, libres: 4, socias: 3 });
assert.equal(textoResumenDia(resumenDeClases(lunes)), '2 clases · 4 libres');
assert.equal(textoResumenDia({ clases: 1, libres: 1, socias: 0 }), '1 clase · 1 libre');
assert.equal(textoResumenDia(resumenDeClases([lunes[2]])), 'Sin clases', 'solo canceladas = sin clases');
assert.equal(textoResumenDia(resumenDeClases([])), 'Sin clases');
assert.equal(textoResumenSemana({ clases: 4, libres: 11, socias: 3 }), '4 clases · 11 lugares libres · 3 socias');
assert.equal(textoResumenSemana({ clases: 1, libres: 1, socias: 1 }), '1 clase · 1 lugar libre · 1 socia');

console.log('✅ test-calendario-lugares OK');
```

- [ ] **Step 2: Correrlas y ver que fallan**

Run: `cd frontend && npx tsx scripts/test-calendario-rejilla.ts; npx tsx scripts/test-calendario-lugares.ts`
Expected: las dos FAIL con `Cannot find module '../src/pages/admin/classes/calendario/rejilla.js'` / `lugares.js`.

- [ ] **Step 3: `rejilla.ts`**

Crear `frontend/src/pages/admin/classes/calendario/rejilla.ts`:

```ts
/**
 * Geometría de la semana por horas: qué horas se ven, cuáles se compactan,
 * dónde va cada clase, qué hacer cuando dos se enciman y dónde va la línea de
 * "ahora" (siempre en hora de CDMX, nunca la del navegador ni la del servidor).
 *
 * Sin imports con alias "@/": lo prueba frontend/scripts/test-calendario-rejilla.ts.
 */
import { addDays, format } from 'date-fns';
import { es } from 'date-fns/locale';

/** Alto de una hora visible, en px. */
export const ALTO_HORA = 76;
/** Alto de la franja que reemplaza un tramo de horas sin clases en toda la semana. */
export const ALTO_FRANJA = 32;
/** Un hueco más corto que esto se deja a tamaño normal: compactarlo casi no ahorra y rompe el ritmo. */
export const HORAS_MINIMAS_PARA_COMPACTAR = 2;
/** Aire entre la tarjeta y la línea de la hora, arriba y abajo. */
export const MARGEN_TARJETA = 2;
/** Desde este alto la tarjeta cabe completa (nombre, coach y lugares); abajo va en una línea. */
export const ALTO_TARJETA_COMPLETA = 56;
/** Ninguna tarjeta mide menos que esto, aunque la clase dure 10 minutos. */
export const ALTO_TARJETA_MINIMO = 24;
/** Semana sin clases: de 7:00 a 21:00. */
export const RANGO_SIN_CLASES = { desde: 7 * 60, hasta: 21 * 60 };
/** Clase sin hora de fin válida: se dibuja como si durara esto. */
export const DURACION_SIN_FIN = 60;

const ZONA_ESTUDIO = 'America/Mexico_City';

export interface Intervalo {
    inicio: number;
    fin: number;
}

export type Tramo =
    | { tipo: 'horas'; desde: number; hasta: number; top: number; alto: number }
    | { tipo: 'franja'; desde: number; hasta: number; top: number; alto: number; etiqueta: string };

export interface Rejilla {
    tramos: Tramo[];
    altoTotal: number;
    /** Etiquetas del eje: una por cada hora en punto de los tramos de horas. */
    horas: { minuto: number; etiqueta: string; top: number }[];
}

interface ConHorario {
    start_time?: string | null;
    end_time?: string | null;
}

/** "07:30" o "07:30:00" → 450. Vacío o inválido → null. */
export function aMinutos(hora: string | null | undefined): number | null {
    if (!hora) return null;
    const m = /^(\d{1,2}):(\d{2})/.exec(hora.trim());
    if (!m) return null;
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (h > 23 || min > 59) return null;
    return h * 60 + min;
}

/** Inicio y fin en minutos. Sin fin, o con fin que no es posterior, dura DURACION_SIN_FIN (sin pasar de medianoche). */
export function intervaloDeClase(c: ConHorario): Intervalo | null {
    const inicio = aMinutos(c.start_time);
    if (inicio === null) return null;
    const fin = aMinutos(c.end_time);
    return { inicio, fin: fin !== null && fin > inicio ? fin : Math.min(inicio + DURACION_SIN_FIN, 24 * 60) };
}

/** Horas visibles de la semana: las que tienen alguna clase; los huecos de 2 h o más se vuelven una franja. */
export function construirRejilla(clases: ConHorario[]): Rejilla {
    const ocupadas = new Set<number>();
    for (const c of clases) {
        const iv = intervaloDeClase(c);
        if (!iv) continue;
        for (let h = Math.floor(iv.inicio / 60); h < Math.ceil(iv.fin / 60); h++) ocupadas.add(h);
    }
    if (ocupadas.size === 0) {
        for (let h = RANGO_SIN_CLASES.desde / 60; h < RANGO_SIN_CLASES.hasta / 60; h++) ocupadas.add(h);
    }
    const primera = Math.min(...ocupadas);
    const ultima = Math.max(...ocupadas);

    // visible[i] dice si la hora (primera + i) se dibuja completa.
    const visible: boolean[] = [];
    for (let h = primera; h <= ultima; h++) visible.push(ocupadas.has(h));
    for (let i = 0; i < visible.length; ) {
        if (visible[i]) { i++; continue; }
        let j = i;
        while (j < visible.length && !visible[j]) j++;
        if (j - i < HORAS_MINIMAS_PARA_COMPACTAR) for (let k = i; k < j; k++) visible[k] = true;
        i = j;
    }

    const tramos: Tramo[] = [];
    let top = 0;
    for (let i = 0; i < visible.length; ) {
        let j = i;
        while (j < visible.length && visible[j] === visible[i]) j++;
        const desde = (primera + i) * 60;
        const hasta = (primera + j) * 60;
        if (visible[i]) {
            const alto = (j - i) * ALTO_HORA;
            tramos.push({ tipo: 'horas', desde, hasta, top, alto });
            top += alto;
        } else {
            tramos.push({ tipo: 'franja', desde, hasta, top, alto: ALTO_FRANJA, etiqueta: `${primera + i} – ${primera + j}` });
            top += ALTO_FRANJA;
        }
        i = j;
    }

    const horas: Rejilla['horas'] = [];
    for (const t of tramos) {
        if (t.tipo !== 'horas') continue;
        for (let m = t.desde; m < t.hasta; m += 60) {
            horas.push({ minuto: m, etiqueta: `${m / 60}:00`, top: t.top + ((m - t.desde) / 60) * ALTO_HORA });
        }
    }
    return { tramos, altoTotal: top, horas };
}

/** Posición vertical (px) de un minuto del día; dentro de una franja es proporcional. Fuera de la rejilla → null. */
export function yDeMinuto(rejilla: Rejilla, minuto: number): number | null {
    for (const t of rejilla.tramos) {
        if (minuto < t.desde || minuto > t.hasta) continue;
        return t.top + ((minuto - t.desde) / (t.hasta - t.desde)) * t.alto;
    }
    return null;
}

/** Dónde se dibuja una clase: top y alto en px, y si cabe completa. Fuera de la rejilla → null. */
export function posicionDeClase(rejilla: Rejilla, c: ConHorario): { top: number; alto: number; completa: boolean } | null {
    const iv = intervaloDeClase(c);
    if (!iv) return null;
    const y0 = yDeMinuto(rejilla, iv.inicio);
    const y1 = yDeMinuto(rejilla, iv.fin);
    if (y0 === null || y1 === null) return null;
    const alto = Math.max(Math.round(y1) - Math.round(y0) - 2 * MARGEN_TARJETA, ALTO_TARJETA_MINIMO);
    return { top: Math.round(y0) + MARGEN_TARJETA, alto, completa: alto >= ALTO_TARJETA_COMPLETA };
}

/**
 * Clases del mismo día que se enciman (p. ej. una cancelada y la que la reemplaza a la
 * misma hora) van lado a lado: `carril` es su columna y `total` cuántas columnas usa su grupo.
 */
export function carriles(items: Array<{ id: string } & Intervalo>): Map<string, { carril: number; total: number }> {
    const orden = [...items].sort((a, b) => a.inicio - b.inicio || a.fin - b.fin || a.id.localeCompare(b.id));
    const resultado = new Map<string, { carril: number; total: number }>();
    let grupo: Array<{ id: string; carril: number }> = [];
    let finesPorCarril: number[] = [];
    let finDelGrupo = -Infinity;
    const cerrarGrupo = () => {
        for (const g of grupo) resultado.set(g.id, { carril: g.carril, total: finesPorCarril.length });
        grupo = [];
        finesPorCarril = [];
        finDelGrupo = -Infinity;
    };
    for (const it of orden) {
        if (grupo.length > 0 && it.inicio >= finDelGrupo) cerrarGrupo();
        let carril = finesPorCarril.findIndex((fin) => fin <= it.inicio);
        if (carril === -1) {
            carril = finesPorCarril.length;
            finesPorCarril.push(it.fin);
        } else {
            finesPorCarril[carril] = it.fin;
        }
        grupo.push({ id: it.id, carril });
        finDelGrupo = Math.max(finDelGrupo, it.fin);
    }
    if (grupo.length > 0) cerrarGrupo();
    return resultado;
}

const FORMATO_CDMX = new Intl.DateTimeFormat('en-US', {
    timeZone: ZONA_ESTUDIO,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
});

/** Fecha (YYYY-MM-DD) y minuto del día en el estudio para un instante dado. */
export function ahoraEnCdmx(instante: Date): { fecha: string; minutos: number } {
    const partes = FORMATO_CDMX.formatToParts(instante);
    const parte = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? '';
    return {
        fecha: `${parte('year')}-${parte('month')}-${parte('day')}`,
        minutos: (Number(parte('hour')) % 24) * 60 + Number(parte('minute')),
    };
}

/** Línea de "ahora": solo si hoy está en la semana y la hora cae dentro de la rejilla. */
export function lineaAhora(
    rejilla: Rejilla,
    fechasDeLaSemana: string[],
    ahora: { fecha: string; minutos: number },
): { fecha: string; top: number } | null {
    if (!fechasDeLaSemana.includes(ahora.fecha)) return null;
    const y = yDeMinuto(rejilla, ahora.minutos);
    return y === null ? null : { fecha: ahora.fecha, top: Math.round(y) };
}

/** "2 – 8 de noviembre de 2026", "28 de septiembre – 4 de octubre de 2026", o con los dos años si cruza. */
export function tituloSemana(lunes: Date): string {
    const domingo = addDays(lunes, 6);
    const completo = "d 'de' MMMM 'de' yyyy";
    if (lunes.getFullYear() !== domingo.getFullYear()) {
        return `${format(lunes, completo, { locale: es })} – ${format(domingo, completo, { locale: es })}`;
    }
    if (lunes.getMonth() !== domingo.getMonth()) {
        return `${format(lunes, "d 'de' MMMM", { locale: es })} – ${format(domingo, completo, { locale: es })}`;
    }
    return `${format(lunes, 'd')} – ${format(domingo, completo, { locale: es })}`;
}
```

- [ ] **Step 4: `colores.ts`**

Crear `frontend/src/pages/admin/classes/calendario/colores.ts`:

```ts
/**
 * Colores de la tarjeta de clase: un fondo tenue del color del tipo y un tono
 * para los puntos de alumnas que se distinga (contraste ≥ 3:1) aunque el tipo
 * tenga un color pálido o no tenga color.
 *
 * Sin imports con alias "@/": lo prueba frontend/scripts/test-calendario-lugares.ts.
 */

/** Verde Casa: puntos de alumna cuando el tipo no tiene color válido. */
export const COLOR_ALUMNA_POR_DEFECTO = '#2A4E36';
/** Superficie sobre la que se tiñe la tarjeta. */
export const FONDO_TARJETA = '#FCF8EF';
export const ALFA_FONDO_TARJETA = 0.14;
export const ALFA_BORDE_TARJETA = 0.38;
const CONTRASTE_MINIMO = 3;

type Rgb = [number, number, number];

export function hexARgb(hex: string | null | undefined): Rgb | null {
    if (!hex) return null;
    const limpio = hex.trim().replace(/^#/, '');
    const completo = limpio.length === 3 ? limpio.split('').map((x) => x + x).join('') : limpio;
    if (!/^[0-9a-fA-F]{6}$/.test(completo)) return null;
    const n = parseInt(completo, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function aHex(rgb: number[]): string {
    return `#${rgb.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`;
}

/** El color encima del fondo con cierta opacidad, ya como color sólido (para que las líneas de la rejilla no se transparenten). */
export function mezclarConFondo(color: string | null | undefined, alfa: number, fondo: string = FONDO_TARJETA): string {
    const c = hexARgb(color) ?? (hexARgb(COLOR_ALUMNA_POR_DEFECTO) as Rgb);
    const f = hexARgb(fondo) as Rgb;
    return aHex([0, 1, 2].map((i) => f[i] + (c[i] - f[i]) * alfa));
}

function luminancia([r, g, b]: Rgb): number {
    const lineal = (v: number) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * lineal(r) + 0.7152 * lineal(g) + 0.0722 * lineal(b);
}

/** Contraste WCAG entre dos colores hex (de 1 a 21). Si alguno no es válido → 1. */
export function contraste(a: string, b: string): number {
    const ra = hexARgb(a);
    const rb = hexARgb(b);
    if (!ra || !rb) return 1;
    const [claro, oscuro] = [luminancia(ra), luminancia(rb)].sort((x, y) => y - x);
    return (claro + 0.05) / (oscuro + 0.05);
}

export function fondoDeTarjeta(colorTipo: string | null | undefined): string {
    return mezclarConFondo(colorTipo, ALFA_FONDO_TARJETA);
}

export function bordeDeTarjeta(colorTipo: string | null | undefined): string {
    return mezclarConFondo(colorTipo, ALFA_BORDE_TARJETA);
}

/** Color de los puntos de alumnas: el del tipo, oscurecido lo necesario para llegar a 3:1 sobre su tarjeta. */
export function colorPuntoAlumna(colorTipo: string | null | undefined): string {
    const base = hexARgb(colorTipo) ? (colorTipo as string).trim() : COLOR_ALUMNA_POR_DEFECTO;
    const fondo = fondoDeTarjeta(base);
    if (contraste(base, fondo) >= CONTRASTE_MINIMO) return base;
    const rgb = hexARgb(base) as Rgb;
    for (let paso = 1; paso <= 10; paso++) {
        const candidato = aHex(rgb.map((v) => v * (1 - paso / 10)));
        if (contraste(candidato, fondo) >= CONTRASTE_MINIMO) return candidato;
    }
    return COLOR_ALUMNA_POR_DEFECTO;
}
```

- [ ] **Step 5: `lugares.ts`**

Crear `frontend/src/pages/admin/classes/calendario/lugares.ts`:

```ts
/**
 * Los lugares de una clase: quién ocupa cada uno (alumna de Casa Shé o socia de
 * una plataforma) y los resúmenes de día y de semana.
 *
 * current_bookings cuenta a TODAS las inscritas de todos los canales (trigger
 * update_class_booking_count). Alumnas de Casa Shé = current_bookings − Σ booked
 * de los canales, nunca menos de 0.
 *
 * Sin imports con alias "@/": lo prueba frontend/scripts/test-calendario-lugares.ts.
 */
import { CANALES, esCanal } from '../../../../lib/canales';

/** Más lugares que esto no caben como puntos en la tarjeta: se muestran contados. */
export const MAX_PUNTOS_TARJETA = 12;
/** Anillo de un lugar libre sobre fondo claro (el mismo de la leyenda). */
export const ANILLO_LIBRE_CLARO = '#9C8E80';
/** Anillo de un lugar libre sobre la tarjeta oscura de Salsa. */
export const ANILLO_LIBRE_OSCURO = 'rgba(246, 240, 228, 0.55)';
/** Plataforma que existe en la base pero no en el catálogo (p. ej. wellhub): neutra, también con anillo. */
const CANAL_SIN_CATALOGO = { punto: '#B8AEA2', anillo: '#6B554D' };

export interface CanalDeClase {
    channel: string;
    max: number;
    booked: number;
}

export interface ClaseConLugares {
    current_bookings?: number | string | null;
    max_capacity?: number | string | null;
    status?: string | null;
    channels?: Array<CanalDeClase | null> | null;
}

export type Lugar = { tipo: 'alumna' } | { tipo: 'canal'; canal: string } | { tipo: 'libre' };

export interface LugaresDeClase {
    capacidad: number;
    /** Alumnas + socias. */
    ocupados: number;
    alumnas: number;
    /** Solo canales con reservas, en el orden del catálogo (TotalPass, Fitpass) y luego los demás. */
    porCanal: { canal: string; reservados: number }[];
    socias: number;
    libres: number;
    lleno: boolean;
    /** Un elemento por lugar: alumnas, luego socias por canal, luego libres. */
    lugares: Lugar[];
}

export interface ResumenDeClases {
    clases: number;
    libres: number;
    socias: number;
}

const entero = (v: unknown): number => {
    const n = Math.floor(Number(v));
    return Number.isFinite(n) && n > 0 ? n : 0;
};

const ORDEN_CATALOGO = Object.keys(CANALES);

function compararCanales(a: string, b: string): number {
    const ia = ORDEN_CATALOGO.indexOf(a);
    const ib = ORDEN_CATALOGO.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
}

export function lugaresDeClase(c: ClaseConLugares): LugaresDeClase {
    const capacidad = entero(c.max_capacity);
    const reservasPorCanal = new Map<string, number>();
    for (const fila of c.channels ?? []) {
        if (!fila || typeof fila.channel !== 'string') continue;
        const n = entero(fila.booked);
        if (n > 0) reservasPorCanal.set(fila.channel, (reservasPorCanal.get(fila.channel) ?? 0) + n);
    }
    const porCanal = [...reservasPorCanal.entries()]
        .sort(([a], [b]) => compararCanales(a, b))
        .map(([canal, reservados]) => ({ canal, reservados }));
    const socias = porCanal.reduce((suma, x) => suma + x.reservados, 0);
    const alumnas = Math.max(0, entero(c.current_bookings) - socias);
    const ocupados = alumnas + socias;
    const libres = Math.max(0, capacidad - ocupados);

    const lugares: Lugar[] = [];
    for (let i = 0; i < alumnas; i++) lugares.push({ tipo: 'alumna' });
    for (const x of porCanal) for (let i = 0; i < x.reservados; i++) lugares.push({ tipo: 'canal', canal: x.canal });
    for (let i = 0; i < libres; i++) lugares.push({ tipo: 'libre' });

    return { capacidad, ocupados, alumnas, porCanal, socias, libres, lleno: capacidad > 0 && ocupados >= capacidad, lugares };
}

/** Tarjeta: "3/7" o "Lleno". */
export function etiquetaCupo(l: LugaresDeClase): string {
    return l.lleno ? 'Lleno' : `${l.ocupados}/${l.capacidad}`;
}

/** Panel: "3 de 7 · 4 libres", "6 de 7 · 1 libre" o "7 de 7 · llena". */
export function etiquetaCupoLarga(l: LugaresDeClase): string {
    const resto = l.libres === 0 ? 'llena' : l.libres === 1 ? '1 libre' : `${l.libres} libres`;
    return `${l.ocupados} de ${l.capacidad} · ${resto}`;
}

/** Relleno y anillo de un punto. Los canales SIEMPRE llevan su anillo (sin él, el verde queda a ~2:1 sobre crema). */
export function estiloDeLugar(
    lugar: Lugar,
    colorAlumna: string,
    fondo: 'claro' | 'oscuro' = 'claro',
): { relleno: string; anillo: string } {
    if (lugar.tipo === 'alumna') return { relleno: colorAlumna, anillo: colorAlumna };
    if (lugar.tipo === 'libre') return { relleno: 'transparent', anillo: fondo === 'oscuro' ? ANILLO_LIBRE_OSCURO : ANILLO_LIBRE_CLARO };
    const c = esCanal(lugar.canal) ? CANALES[lugar.canal] : CANAL_SIN_CATALOGO;
    return { relleno: c.punto, anillo: c.anillo };
}

/** Clases activas (las canceladas no cuentan), lugares libres y socias de plataformas. */
export function resumenDeClases(clases: ClaseConLugares[]): ResumenDeClases {
    return clases
        .filter((c) => c.status !== 'cancelled')
        .reduce<ResumenDeClases>((acc, c) => {
            const l = lugaresDeClase(c);
            return { clases: acc.clases + 1, libres: acc.libres + l.libres, socias: acc.socias + l.socias };
        }, { clases: 0, libres: 0, socias: 0 });
}

/** Encabezado del día: "2 clases · 4 libres" o "Sin clases". */
export function textoResumenDia(r: ResumenDeClases): string {
    if (r.clases === 0) return 'Sin clases';
    return `${r.clases} ${r.clases === 1 ? 'clase' : 'clases'} · ${r.libres} ${r.libres === 1 ? 'libre' : 'libres'}`;
}

/** Barra: "4 clases · 11 lugares libres · 3 socias". */
export function textoResumenSemana(r: ResumenDeClases): string {
    return [
        `${r.clases} ${r.clases === 1 ? 'clase' : 'clases'}`,
        `${r.libres} ${r.libres === 1 ? 'lugar libre' : 'lugares libres'}`,
        `${r.socias} ${r.socias === 1 ? 'socia' : 'socias'}`,
    ].join(' · ');
}
```

- [ ] **Step 6: Correr las pruebas y el typecheck**

Run:

```bash
cd frontend && npx tsx scripts/test-calendario-rejilla.ts && npx tsx scripts/test-calendario-lugares.ts && npx tsx scripts/test-canales.ts
npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -E "error TS" | grep -vE "FilterPills.tsx\(124|push.ts\(47|Events.tsx\((259|906)"
```

Expected: `✅ test-calendario-rejilla OK`, `✅ test-calendario-lugares OK`, `✅ test-canales OK`; el typecheck no imprime nada.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/admin/classes/calendario/rejilla.ts frontend/src/pages/admin/classes/calendario/colores.ts frontend/src/pages/admin/classes/calendario/lugares.ts frontend/scripts/test-calendario-rejilla.ts frontend/scripts/test-calendario-lugares.ts
git commit -m "feat(calendario): geometría de la semana por horas y lugares por plataforma

Lógica pura y probada: horas visibles con los tramos vacíos compactados,
posición y alto de cada clase, columnas cuando dos se enciman, línea de
\"ahora\" en hora de CDMX, lugares de alumnas y de cada plataforma y los
resúmenes de día y semana. Todavía no se usa en pantalla.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Partir sin cambiar comportamiento (1/3) — datos de la semana y arnés de Playwright

**Tipo:** mover código con un script que copia rangos exactos del original + crear el arnés de pruebas. No cambia nada visible. Verificación: typecheck, conteo de líneas y prueba de humo en Playwright **antes y después**.

**Files:**
- Create: `frontend/scripts/e2e-local.sh`, `frontend/e2e/fixtures/calendario.ts`
- Modify: `frontend/e2e/tests/admin-classes.spec.ts` (import + `describe` nuevo al final)
- Create: `frontend/src/pages/admin/classes/calendario/tipos.ts`, `formato.ts`, `useSemanaClases.ts`
- Modify: `frontend/src/pages/admin/classes/ClassesCalendar.tsx` (se rearma desde el original)

**Interfaces:**
- Produces (`tipos.ts`): `interface Facility`, `interface Attendee`, `interface CopiaSemanaResumen` (idénticos al original).
- Produces (`formato.ts`): `DAYS: string[]` (`['Lun', …, 'Dom']`), `formatClassTime(value?: string): string`, `whatsAppDeAsistente(attendee: Attendee, clase?: Class | null)`, `attendeeBookedBy(a: Attendee): string`, `getInitials(name: string): string`.
- Produces (`useSemanaClases.ts`): `useSemanaClases()` devuelve `{ currentDate, setCurrentDate, weekStart, mobileSelectedDay, setMobileSelectedDay, classTypeFilter, setClassTypeFilter, programFilter, setProgramFilter, instructorFilter, setInstructorFilter, classTypes, instructors, facilities, classes, classesLoading, classesError, refetchClasses, startStr, endStr, closedDaySet, getClosedReason, getClassesForDay, weekDays, activeClasses, totalBookings, openSpots, weekRange, occupancy, mobileDayClasses, mobileDayClosed, mobileClosedReason, handlePrevWeek, handleNextWeek, handleToday }` (mismos nombres y valores que tenía el componente; la Task 7 quita los que dejan de usarse).
- Produces (pruebas): `frontend/scripts/e2e-local.sh <args de playwright>`; en `frontend/e2e/fixtures/calendario.ts`: `FECHA_PRUEBA = '2026-11-04'`, `AHORA_PRUEBA` (miércoles 08:25 CDMX), `ID` (`barre`, `mat`, `sculpt`, `sculptCancelada`, `salsa`), `clasePrueba(datos)`, `SEMANA_PRUEBA`, `mockSemanaCalendario(page, clases?)`; el `test.describe("Calendario de recepción – semana por horas", …)` en `admin-classes.spec.ts`.

- [ ] **Step 1: El arnés de Playwright**

Crear `frontend/scripts/e2e-local.sh` y darle permiso de ejecución (`chmod +x frontend/scripts/e2e-local.sh`):

```bash
#!/usr/bin/env bash
# Corre Playwright contra una COPIA DESECHABLE de la base local. Nunca contra producción:
#  1. clona la base local (casa_she, o la de E2E_BASE_ORIGEN) en una base temporal;
#  2. crea ahí una admin de prueba;
#  3. levanta el backend de este repo en :3001 con secretos de prueba, sin crons ni WhatsApp ni pagos;
#  4. construye el frontend apuntando a ese backend y corre Playwright (que sirve vite preview en :4173);
#  5. al terminar (bien o mal) apaga el backend y borra la base temporal.
#
# Uso, desde frontend/:
#   ./scripts/e2e-local.sh e2e/tests/admin-classes.spec.ts --project=chromium -g "semana por horas"
set -euo pipefail

FRONTEND="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND="$(cd "$FRONTEND/../backend" && pwd)"
ORIGEN="${E2E_BASE_ORIGEN:-casa_she}"
BASE="casa_she_e2e_$(date +%s)"
CORREO="e2e-admin@casashe.test"
CLAVE="E2e-Calendario-2026"
LOG="${TMPDIR:-/tmp}/casa-she-e2e-backend.log"
BACKEND_PID=""

for puerto in 3001 4173; do
    if lsof -ti "tcp:$puerto" >/dev/null 2>&1; then
        echo "✋ El puerto $puerto está ocupado. Apaga lo que lo usa y vuelve a correr." >&2
        exit 1
    fi
done

limpiar() {
    if [ -n "$BACKEND_PID" ]; then kill "$BACKEND_PID" 2>/dev/null || true; fi
    lsof -ti tcp:3001 2>/dev/null | xargs kill 2>/dev/null || true
    dropdb --if-exists "$BASE" 2>/dev/null || true
}
trap limpiar EXIT

echo "→ Clonando la base local $ORIGEN en $BASE"
createdb -T "$ORIGEN" "$BASE"

HASH="$(cd "$BACKEND" && node -e 'console.log(require("bcryptjs").hashSync(process.argv[1], 10))' "$CLAVE")"
psql -q -X -d "$BASE" -v ON_ERROR_STOP=1 -v correo="$CORREO" -v hash="$HASH" <<'SQL'
INSERT INTO users (email, phone, display_name, role, password_hash, is_active, temp_password)
VALUES (:'correo', '5599990001', 'Admin E2E', 'admin', :'hash', true, false);
SQL

echo "→ Backend en :3001 (bitácora: $LOG)"
(
    cd "$BACKEND"
    unset MP_ACCESS_TOKEN STRIPE_SECRET_KEY RESEND_API_KEY GOOGLE_REFRESH_TOKEN
    export DATABASE_URL="postgresql://localhost:5432/$BASE"
    export JWT_SECRET="e2e-local-no-es-produccion"
    export PORT=3001 NODE_ENV=development FRONTEND_URL="http://localhost:4173"
    export ENABLE_CRON_JOBS=false DISABLE_WHATSAPP=true
    exec ./node_modules/.bin/tsx src/index.ts
) >"$LOG" 2>&1 &
BACKEND_PID=$!

for _ in $(seq 1 90); do
    if curl -sf http://localhost:3001/api/health >/dev/null; then break; fi
    sleep 1
done
curl -sf http://localhost:3001/api/health >/dev/null || { echo "✋ El backend no arrancó; revisa $LOG" >&2; exit 1; }

echo "→ Construyendo el frontend contra http://localhost:3001/api"
cd "$FRONTEND"
VITE_API_URL="http://localhost:3001/api" npm run build >/dev/null

echo "→ Playwright $*"
ADMIN_EMAIL="$CORREO" ADMIN_PASSWORD="$CLAVE" npx playwright test "$@"
```

Crear `frontend/e2e/fixtures/calendario.ts`:

```ts
/**
 * Semana fija para probar el calendario sin depender de lo que haya en la base:
 * las pruebas interceptan GET /api/classes, los días cerrados y las inscritas, y
 * responden con estas clases. Lunes 2 – domingo 8 de noviembre de 2026.
 * El inicio de sesión sí va al backend local (ver scripts/e2e-local.sh).
 */
import type { Page } from "@playwright/test";

export const FECHA_PRUEBA = "2026-11-04";
/** Miércoles 4 de noviembre, 08:25 en CDMX (UTC−6). */
export const AHORA_PRUEBA = new Date("2026-11-04T14:25:00Z");

export interface ClasePrueba {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  class_type_id: string;
  class_type_name: string;
  class_type_color: string | null;
  category: "multi" | "reformer";
  instructor_id: string;
  instructor_name: string | null;
  facility_id: string | null;
  facility_name: string | null;
  max_capacity: number;
  current_bookings: number;
  status: "scheduled" | "cancelled";
  is_free: boolean;
  free_label: string | null;
  booking_closed: boolean;
  intensity: number | null;
  totalpass_spots: number | null;
  totalpass_booked: number;
  channels: { channel: string; max: number; booked: number }[];
}

/** UUID válido de mentira (el formulario de edición valida que lo sean). */
const uuid = (sufijo: string) => `00000000-0000-4000-8000-${sufijo.padStart(12, "0")}`;

export const ID = {
  barre: uuid("c001"),
  mat: uuid("c002"),
  sculpt: uuid("c003"),
  sculptCancelada: uuid("c004"),
  salsa: uuid("c005"),
};

export function clasePrueba(
  datos: Partial<ClasePrueba> & Pick<ClasePrueba, "id" | "date" | "start_time" | "end_time" | "class_type_name">,
): ClasePrueba {
  return {
    class_type_id: uuid("a001"),
    class_type_color: "#7A3550",
    category: "multi",
    instructor_id: uuid("b001"),
    instructor_name: "Ana",
    facility_id: null,
    facility_name: null,
    max_capacity: 7,
    current_bookings: 0,
    status: "scheduled",
    is_free: false,
    free_label: null,
    booking_closed: false,
    intensity: null,
    totalpass_spots: null,
    totalpass_booked: 0,
    channels: [],
    ...datos,
  };
}

/**
 * Lun 07:00 Barre 3/7 (1 de TotalPass, cupo 2) · Lun 08:00 Pilates Mat 7/7 (2 de TotalPass, cupo 2)
 * Mié 18:00 Sculpt 1/7 sin coach · Mié 19:00 Sculpt cancelada · Sáb 10:00–11:00 Salsa 6/7.
 * Horas ocupadas: 7, 8, 10, 18 y 19 → la franja "11 – 18" se compacta.
 */
export const SEMANA_PRUEBA: ClasePrueba[] = [
  clasePrueba({
    id: ID.barre, date: "2026-11-02", start_time: "07:00", end_time: "07:50", class_type_name: "Barre",
    current_bookings: 3, totalpass_spots: 2, totalpass_booked: 1, channels: [{ channel: "totalpass", max: 2, booked: 1 }],
  }),
  clasePrueba({
    id: ID.mat, date: "2026-11-02", start_time: "08:00", end_time: "08:50", class_type_name: "Pilates Mat",
    class_type_id: uuid("a002"), class_type_color: "#2A4E36", instructor_id: uuid("b002"), instructor_name: "Sofía",
    current_bookings: 7, totalpass_spots: 2, totalpass_booked: 2, channels: [{ channel: "totalpass", max: 2, booked: 2 }],
  }),
  clasePrueba({
    id: ID.sculpt, date: "2026-11-04", start_time: "18:00", end_time: "18:50", class_type_name: "Sculpt",
    class_type_id: uuid("a003"), class_type_color: "#9A3D2D", instructor_name: null, current_bookings: 1,
  }),
  clasePrueba({
    id: ID.sculptCancelada, date: "2026-11-04", start_time: "19:00", end_time: "19:50", class_type_name: "Sculpt",
    class_type_id: uuid("a003"), class_type_color: "#9A3D2D", instructor_id: uuid("b002"), instructor_name: "Sofía", status: "cancelled",
  }),
  clasePrueba({
    id: ID.salsa, date: "2026-11-07", start_time: "10:00", end_time: "11:00", class_type_name: "Salsa",
    class_type_id: uuid("a004"), class_type_color: "#AE4836", category: "reformer",
    instructor_id: uuid("b003"), instructor_name: "Pau", current_bookings: 6,
  }),
];

/** Intercepta las lecturas del calendario. La sucursal se copia del filtro que manda la página. */
export async function mockSemanaCalendario(page: Page, clases: ClasePrueba[] = SEMANA_PRUEBA): Promise<void> {
  await page.route(/\/api\/classes\?/, async (route) => {
    const url = new URL(route.request().url());
    const inicio = url.searchParams.get("start") ?? url.searchParams.get("start_date") ?? "";
    const fin = url.searchParams.get("end") ?? url.searchParams.get("end_date") ?? "9999-12-31";
    const categoria = url.searchParams.get("category");
    const sucursal = url.searchParams.get("facility_id");
    const json = clases
      .filter((c) => c.date >= inicio && c.date <= fin && (!categoria || c.category === categoria))
      .map((c) => ({ ...c, facility_id: sucursal ?? c.facility_id }));
    await route.fulfill({ json });
  });
  await page.route(/\/api\/closed-days\/range/, (route) => route.fulfill({ json: [] }));
  await page.route(/\/api\/bookings\/class\//, (route) => route.fulfill({ json: [] }));
}
```

- [ ] **Step 2: Prueba de humo del calendario actual**

En `frontend/e2e/tests/admin-classes.spec.ts`, después de

```ts
import { AdminPage } from "../pages/AdminPage";
```

agregar:

```ts
import { FECHA_PRUEBA, mockSemanaCalendario } from "../fixtures/calendario";
```

y al final del archivo agregar:

```ts
test.describe("Calendario de recepción – semana por horas", () => {
  test("abre el panel de una clase y los diálogos de la barra", async ({ adminPage: page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await mockSemanaCalendario(page);
    await page.goto(`/admin/calendar?date=${FECHA_PRUEBA}`);

    const barre = page.getByRole("button", { name: /^Barre.*07:00/ });
    await expect(barre).toBeVisible();
    await barre.click();
    const panel = page.getByRole("dialog");
    await expect(panel.getByRole("tab", { name: /Reservado/ })).toBeVisible();
    await expect(panel.getByText("Sin reservas todavía.")).toBeVisible();
    await expect(panel.getByRole("img", { name: "TotalPass" }).first()).toBeVisible();

    await panel.getByRole("button", { name: /^Editar/ }).click();
    const editar = page.getByRole("heading", { name: "Editar Clase" });
    await expect(editar).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(editar).toBeHidden();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);

    const dialogos: Array<[string, string]> = [
      ["Generar", "Generar Clases"],
      ["Copiar semana", "Copiar semana"],
      ["Nueva clase", "Nueva Clase"],
      ["Gratis", "Marcar clases como gratis"],
    ];
    for (const [boton, titulo] of dialogos) {
      await page.getByRole("button", { name: boton, exact: true }).click();
      const encabezado = page.getByRole("heading", { name: titulo });
      await expect(encabezado).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(encabezado).toBeHidden();
    }
  });
});
```

- [ ] **Step 3: Correrla ANTES de mover nada (línea base)**

Run: `cd frontend && ./scripts/e2e-local.sh e2e/tests/admin-classes.spec.ts --project=chromium -g "semana por horas"`
Expected: `1 passed`. Si falla, PARAR y reportar la salida tal cual (la prueba describe el calendario de hoy; no se ajusta para que pase).

- [ ] **Step 4: Tipos y formatos compartidos**

Crear `frontend/src/pages/admin/classes/calendario/tipos.ts`:

```ts
// Tipos compartidos del calendario de clases (admin y recepción).

export interface Facility {
    id: string;
    name: string;
    description: string | null;
    capacity: number;
    is_active: boolean;
}

export interface Attendee {
    booking_id: string;
    status: string;
    checked_in_at: string | null;
    waitlist_position: number | null;
    user_id: string;
    display_name: string;
    email: string;
    photo_url: string | null;
    phone: string;
    plan_name: string | null;
    is_free_booking?: boolean;
    booked_by?: string | null;
    booked_by_name?: string | null;
    booked_by_role?: string | null;
    /** 'app' | 'totalpass' | 'wellhub' | 'fitpass' — de dónde vino la reserva. */
    channel?: string | null;
}

/** Lo que devuelve /classes/copy-week, en vista previa y en la copia real. */
export interface CopiaSemanaResumen {
    creadas: number;
    yaExistian: number;
    enDiaCerrado: number;
    enElPasado: number;
    canceladasConservadas: number;
    canceladasOmitidas: number;
    includeCancelled: boolean;
    dryRun: boolean;
    mensaje?: string;
    detalle: Array<{ fecha: string; hora: string; clase: string; resultado: string }>;
}
```

Crear `frontend/src/pages/admin/classes/calendario/formato.ts`:

```ts
// Textos y formatos del calendario de clases.
import { enlaceWhatsApp } from '@/lib/whatsapp';
import type { Class } from '@/types/class';
import type { Attendee } from './tipos';

export const DAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

export function formatClassTime(value?: string) {
    return value?.slice(0, 5) || '--:--';
}

export const whatsAppDeAsistente = (attendee: Attendee, clase?: Class | null) => enlaceWhatsApp({
    telefono: attendee.phone,
    nombre: attendee.display_name,
    clase: clase?.class_type_name,
    fecha: clase?.date,
    hora: clase?.start_time ? formatClassTime(clase.start_time) : null,
});

// "Reservó": si booked_by es la propia alumna (o null) se reservó sola; si difiere, lo hizo ese staff.
export function attendeeBookedBy(a: Attendee): string {
    if (!a.booked_by || a.booked_by === a.user_id) return 'la alumna';
    const r = a.booked_by_role;
    const roleEs = r === 'reception' ? 'recepción' : (r === 'admin' || r === 'super_admin') ? 'admin' : r === 'instructor' ? 'coach' : (r || 'staff');
    return `${a.booked_by_name || 'staff'} · ${roleEs}`;
}

export const getInitials = (name: string) => {
    return name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '??';
};
```

- [ ] **Step 5: `useSemanaClases.ts`**

Es el mismo código del original (L180-182, 205-208, 223-261, 297-320, 634-636, 681-690, 850-877) dentro de un hook. Crear `frontend/src/pages/admin/classes/calendario/useSemanaClases.ts`:

```ts
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format, startOfWeek, addDays, isSameDay, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import api from '@/lib/api';
import type { Class, ClassType, Instructor } from '@/types/class';
import type { Facility } from './tipos';

/**
 * Datos de la semana visible del calendario: consultas (tipos, coaches, sucursales,
 * clases, días cerrados), la semana y el día elegidos, y los filtros.
 * Movido sin cambios desde ClassesCalendar.tsx.
 */
export function useSemanaClases() {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [weekStart, setWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));
    const [mobileSelectedDay, setMobileSelectedDay] = useState(new Date());
    const [classTypeFilter, setClassTypeFilter] = useState<string>('all');
    const [studioFilter, setStudioFilter] = useState<string>('all');
    const [programFilter, setProgramFilter] = useState<string>('all');
    const [instructorFilter, setInstructorFilter] = useState<string>('all');

    // Deep-link: ?date=YYYY-MM-DD posiciona el calendario en la semana que contiene esa fecha.
    // Se aplica UNA sola vez al entrar (no pelea con la navegación manual del usuario después).
    const [searchParams] = useSearchParams();
    const dateParamApplied = useRef(false);
    useEffect(() => {
        if (dateParamApplied.current) return;
        const param = searchParams.get('date');
        if (!param || !/^\d{4}-\d{2}-\d{2}$/.test(param)) return;
        const [y, m, d] = param.split('-').map(Number);
        const parsed = new Date(y, m - 1, d); // LOCAL, no UTC: evita correrse un día
        if (Number.isNaN(parsed.getTime())) return;
        dateParamApplied.current = true;
        setCurrentDate(parsed);
    }, [searchParams]);

    useEffect(() => {
        setWeekStart(startOfWeek(currentDate, { weekStartsOn: 1 }));
    }, [currentDate]);

    useEffect(() => {
        const today = new Date();
        const currentWeekStart = startOfWeek(today, { weekStartsOn: 1 });
        setMobileSelectedDay(isSameDay(weekStart, currentWeekStart) ? today : weekStart);
    }, [weekStart]);

    const { data: classTypes } = useQuery<ClassType[]>({
        queryKey: ['class-types'],
        queryFn: async () => (await api.get('/class-types')).data,
    });

    const { data: instructors } = useQuery<Instructor[]>({
        queryKey: ['instructors'],
        queryFn: async () => (await api.get('/instructors')).data,
    });

    const { data: facilities } = useQuery<Facility[]>({
        queryKey: ['facilities'],
        queryFn: async () => (await api.get('/facilities')).data,
    });

    const startStr = format(weekStart, 'yyyy-MM-dd');
    const endStr = format(addDays(weekStart, 6), 'yyyy-MM-dd');

    const { data: classes, isLoading: classesLoading, isError: classesError, refetch: refetchClasses } = useQuery<Class[]>({
        queryKey: ['classes', startStr, endStr, studioFilter, programFilter],
        queryFn: async () => {
            const params = new URLSearchParams({ start: startStr, end: endStr });
            if (studioFilter !== 'all') params.set('facility_id', studioFilter);
            if (programFilter !== 'all') params.set('category', programFilter);
            const { data } = await api.get(`/classes?${params.toString()}`);
            return data;
        },
        retry: 3,
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 5000),
        refetchOnWindowFocus: true,
    });

    // Closed days for visual indicator
    const { data: closedDays = [] } = useQuery<{ id: string; date: string; reason: string }[]>({
        queryKey: ['closed-days-range', startStr, endStr],
        queryFn: async () => (await api.get(`/closed-days/range?start=${startStr}&end=${endStr}`)).data,
    });
    const closedDaySet = new Set(closedDays.map(d => d.date));
    const getClosedReason = (day: Date) => closedDays.find(d => d.date === format(day, 'yyyy-MM-dd'))?.reason;

    const handlePrevWeek = () => setCurrentDate(addDays(currentDate, -7));
    const handleNextWeek = () => setCurrentDate(addDays(currentDate, 7));
    const handleToday = () => setCurrentDate(new Date());

    const getClassesForDay = (day: Date) => {
        return classes?.filter(c => {
            const dateStr = (c.date || '').split('T')[0];
            const dateMatch = isSameDay(parseISO(dateStr + 'T00:00:00'), day);
            const typeMatch = classTypeFilter === 'all' || c.class_type_id === classTypeFilter;
            const studioMatch = studioFilter === 'all' || c.facility_id === studioFilter;
            const instructorMatch = instructorFilter === 'all' || c.instructor_id === instructorFilter;
            return dateMatch && typeMatch && studioMatch && instructorMatch;
        }) || [];
    };

    const weekDays = Array.from({ length: 7 }).map((_, i) => addDays(weekStart, i));
    const activeClasses = classes?.filter((c) => c.status !== 'cancelled') || [];

    // Sede única (de facilities). Sin selector visible: el filtro se fija a la única sede.
    const bmbStudios = useMemo(
        () => (facilities || [])
            .filter((f) => /^casa sh/i.test(f.name))
            .map((f) => ({ id: f.id, name: f.name, short: f.name.replace(/^Casa Shé\s*/i, '') })),
        [facilities]
    );

    // Fija el filtro a la única sede en cuanto carga (en vez de 'all').
    useEffect(() => {
        if (bmbStudios.length && !bmbStudios.some((s) => s.id === studioFilter)) {
            setStudioFilter(bmbStudios[0].id);
        }
    }, [bmbStudios, studioFilter]);

    const totalBookings = activeClasses.reduce((sum, c) => sum + Number(c.current_bookings || 0), 0);
    const totalCapacity = activeClasses.reduce((sum, c) => sum + Number(c.max_capacity || 0), 0);
    const openSpots = Math.max(totalCapacity - totalBookings, 0);
    const weekRange = `${format(weekStart, 'd MMM', { locale: es })} al ${format(addDays(weekStart, 6), 'd MMM yyyy', { locale: es })}`;
    const occupancy = totalCapacity > 0 ? Math.round((totalBookings / totalCapacity) * 100) : 0;
    const mobileDayClasses = getClassesForDay(mobileSelectedDay)
        .slice()
        .sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));
    const mobileDayClosed = closedDaySet.has(format(mobileSelectedDay, 'yyyy-MM-dd'));
    const mobileClosedReason = getClosedReason(mobileSelectedDay);

    return {
        currentDate, setCurrentDate, weekStart, mobileSelectedDay, setMobileSelectedDay,
        classTypeFilter, setClassTypeFilter, programFilter, setProgramFilter, instructorFilter, setInstructorFilter,
        classTypes, instructors, facilities,
        classes, classesLoading, classesError, refetchClasses,
        startStr, endStr, closedDaySet, getClosedReason, getClassesForDay, weekDays, activeClasses,
        totalBookings, openSpots, weekRange, occupancy, mobileDayClasses, mobileDayClosed, mobileClosedReason,
        handlePrevWeek, handleNextWeek, handleToday,
    };
}
```

- [ ] **Step 6: Rearmar `ClassesCalendar.tsx` desde el original**

El archivo nuevo son rangos exactos del original más dos piezas nuevas (imports y la llamada al hook). Lo que se salta es justo lo que se movió: `Facility` (L17-24), `DAYS` (L73), `Attendee`/`CopiaSemanaResumen`/`whatsAppDeAsistente`/`attendeeBookedBy` (L121-169), estado de semana y filtros (L180-182, L205-208), deep link, efectos y consultas (L223-261), fechas, clases y días cerrados (L297-320), navegación (L634-636), `getClassesForDay` y `getInitials` (L681-694), derivados (L850-877) y `formatClassTime` (L2414-2417).

```bash
cd "/Users/saidromero/Desktop/Casa She/casa-she-entrega-2"
F=frontend/src/pages/admin/classes/ClassesCalendar.tsx
orig() { git show ff4e304:$F | sed -n "$1,$2p"; }
{
orig 1 15
orig 25 71
cat <<'TSX'
import type { Attendee, CopiaSemanaResumen } from './calendario/tipos';
import { DAYS, attendeeBookedBy, formatClassTime, getInitials, whatsAppDeAsistente } from './calendario/formato';
import { useSemanaClases } from './calendario/useSemanaClases';
TSX
orig 74 120
orig 170 179
orig 183 204
orig 209 222
cat <<'TSX'
    const {
        currentDate, setCurrentDate, weekStart, mobileSelectedDay, setMobileSelectedDay,
        classTypeFilter, setClassTypeFilter, programFilter, setProgramFilter, instructorFilter, setInstructorFilter,
        classTypes, instructors, facilities,
        classesLoading, classesError, refetchClasses,
        startStr, endStr, closedDaySet, getClosedReason, getClassesForDay, weekDays, activeClasses,
        totalBookings, openSpots, weekRange, occupancy, mobileDayClasses, mobileDayClosed, mobileClosedReason,
        handlePrevWeek, handleNextWeek, handleToday,
    } = useSemanaClases();

TSX
orig 263 296
orig 322 633
orig 638 680
orig 696 849
orig 879 2413
} > "$F.nuevo" && mv "$F.nuevo" "$F"
wc -l "$F"
```

Expected: `2246 frontend/src/pages/admin/classes/ClassesCalendar.tsx`. Los imports que quedan sin uso (`useRef`, `useSearchParams`, `enlaceWhatsApp`…) se quedan por ahora; la Task 7 reescribe el archivo.

- [ ] **Step 7: Verificar que no cambió nada**

Run:

```bash
cd frontend && npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -E "error TS" | grep -vE "FilterPills.tsx\(124|push.ts\(47|Events.tsx\((259|906)"
git grep -c "useSemanaClases()" -- src/pages/admin/classes/ClassesCalendar.tsx
git grep -nE "const \[currentDate|queryKey: \['class-types'\]|const getClassesForDay|function formatClassTime" -- src/pages/admin/classes/ClassesCalendar.tsx
./scripts/e2e-local.sh e2e/tests/admin-classes.spec.ts --project=chromium -g "semana por horas"
```

Expected: el typecheck no imprime nada; `…ClassesCalendar.tsx:1`; el segundo `git grep` no encuentra nada (todo eso vive ya en `calendario/`); Playwright `1 passed`.

- [ ] **Step 8: Commit**

```bash
git add frontend/scripts/e2e-local.sh frontend/e2e/fixtures/calendario.ts frontend/e2e/tests/admin-classes.spec.ts frontend/src/pages/admin/classes/calendario/tipos.ts frontend/src/pages/admin/classes/calendario/formato.ts frontend/src/pages/admin/classes/calendario/useSemanaClases.ts frontend/src/pages/admin/classes/ClassesCalendar.tsx
git commit -m "refactor(calendario): datos de la semana a useSemanaClases, sin cambiar comportamiento

Consultas, semana, día elegido y filtros se mueven tal cual a un hook;
tipos y formatos a sus archivos. Se agrega el arnés de Playwright contra
una copia desechable de la base local y una prueba de humo del
calendario, que pasa antes y después de mover.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Partir sin cambiar comportamiento (2/3) — cada diálogo en su archivo

**Tipo:** mover bloques exactos del original con scripts (cada uno copia rangos de `ff4e304` y solo renombra lo que cambia de dueño) y cortar con un ayudante que verifica cuántas líneas toca. Nada visible cambia. Verificación: typecheck, conteos, prueba de humo.

**Files:**
- Create: `frontend/src/pages/admin/classes/calendario/DialogoGenerar.tsx`, `DialogoNuevaClase.tsx`, `DialogoEditarClase.tsx`, `DialogoCopiarSemana.tsx`, `DialogoGratis.tsx`, `DialogoCancelarClase.tsx`, `DialogoCambiarCoach.tsx`
- Modify: `frontend/src/pages/admin/classes/ClassesCalendar.tsx`

**Interfaces:**
- Consumes: `Facility`, `CopiaSemanaResumen` de `./tipos`; `DAYS`, `formatClassTime` de `./formato` (Task 3); `Class`, `ClassType`, `Instructor` de `@/types/class`.
- Produces (todos con `open: boolean; onOpenChange: (open: boolean) => void`):
  - `DialogoGenerar({ open, onOpenChange, onGenerado: (desde: Date) => void })`
  - `DialogoNuevaClase({ open, onOpenChange, dia: Date, classTypes?, instructors?, facilities? })` — el padre lo vuelve a montar con `key` en cada apertura.
  - `DialogoEditarClase({ open, onOpenChange, clase: Class | null, classTypes?, instructors?, facilities?, onCambiarCoach: () => void, onGuardada: () => void })` — `key` por apertura.
  - `DialogoCopiarSemana({ open, onOpenChange, weekStart: Date })` — `key` por apertura.
  - `DialogoGratis({ open, onOpenChange })`
  - `DialogoCancelarClase({ open, onOpenChange, clase: Class | null, onCancelada: () => void })`
  - `DialogoCambiarCoach({ open, onOpenChange, clase: Class | null, instructors?, onAplicado: () => void })` — `key` por apertura.

Por qué `key`: antes el padre hacía `form.reset(...)` o reiniciaba el estado del diálogo justo antes de abrirlo; ahora ese estado vive dentro del diálogo y una `key` nueva lo vuelve a montar con los mismos valores iniciales.

- [ ] **Step 1: El ayudante para cortar bloques**

```bash
cat > "${TMPDIR:-/tmp}/reemplazar-bloque.mjs" <<'JS'
// Corta (o reemplaza) un bloque de líneas entre dos anclas, verificando cuántas líneas toca.
// Uso: node reemplazar-bloque.mjs <archivo> <texto de la 1.ª línea> <última línea exacta> <líneas esperadas> [archivo con el reemplazo]
import { readFileSync, writeFileSync } from 'node:fs';

const [archivo, inicio, fin, esperadas, reemplazo] = process.argv.slice(2);
const lineas = readFileSync(archivo, 'utf8').split('\n');
const coincidencias = lineas.flatMap((l, k) => (l.includes(inicio) ? [k] : []));
if (coincidencias.length !== 1) {
    console.error(`✋ "${inicio}" aparece ${coincidencias.length} veces; debe aparecer una. No se tocó nada.`);
    process.exit(1);
}
const i = coincidencias[0];
const j = lineas.findIndex((l, k) => k >= i && l === fin);
if (j < 0) {
    console.error(`✋ No hay una línea exactamente igual a "${fin}" después de "${inicio}". No se tocó nada.`);
    process.exit(1);
}
const cuantas = j - i + 1;
if (Number(esperadas) !== cuantas) {
    console.error(`✋ Se tocarían ${cuantas} líneas y se esperaban ${esperadas}. No se tocó nada.`);
    process.exit(1);
}
const nuevas = reemplazo ? readFileSync(reemplazo, 'utf8').replace(/\n$/, '').split('\n') : [];
// Al cortar sin reemplazo, si quedan dos líneas en blanco seguidas se quita una.
const blancoDoble = !reemplazo && i > 0 && lineas[i - 1].trim() === '' && j + 1 < lineas.length - 1 && lineas[j + 1].trim() === '';
lineas.splice(i, cuantas + (blancoDoble ? 1 : 0), ...nuevas);
writeFileSync(archivo, lineas.join('\n'));
console.log(`✓ ${reemplazo ? 'Reemplazadas' : 'Cortadas'} ${cuantas} líneas: ${inicio.trim()}`);
JS
```

Uso: `node "${TMPDIR:-/tmp}/reemplazar-bloque.mjs" <archivo> '<texto de la primera línea>' '<última línea exacta, con su sangría>' <líneas esperadas> [archivo con el reemplazo]`. Si el inicio no es único, si no encuentra el final o si el conteo no coincide, no toca nada y sale con error: en ese caso PARAR y reportar.

- [ ] **Step 2: `DialogoGenerar.tsx`**

```bash
cd "/Users/saidromero/Desktop/Casa She/casa-she-entrega-2"
F=frontend/src/pages/admin/classes/ClassesCalendar.tsx
orig() { git show ff4e304:$F | sed -n "$1,$2p"; }
D=frontend/src/pages/admin/classes/calendario
{
cat <<'TSX'
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { format, startOfWeek, addDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { Calendar as CalendarIcon, Loader2 } from 'lucide-react';
import api, { getErrorMessage } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';

TSX
orig 75 78
echo
orig 118 118
cat <<'TSX'

interface DialogoGenerarProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Terminó de generar: el calendario se mueve a la fecha de inicio. */
    onGenerado: (desde: Date) => void;
}

/** "Generar": crea las clases de un rango con la plantilla semanal. Movido sin cambios de ClassesCalendar. */
export function DialogoGenerar({ open, onOpenChange, onGenerado }: DialogoGenerarProps) {
    const { toast } = useToast();
    const queryClient = useQueryClient();
TSX
orig 613 615
echo
orig 617 623
echo
orig 323 345 | perl -pe 's/\QsetIsGenerateOpen(false);\E/onOpenChange(false);/; s/\QsetCurrentDate(variables.startDate);\E/onGenerado(variables.startDate);/'
cat <<'TSX'

    return (
TSX
orig 1540 1597 | perl -pe 's/\QsetIsGenerateOpen\E/onOpenChange/g; s/\QisGenerateOpen\E/open/g; s/^ {12}//'
cat <<'TSX'
    );
}
TSX
} > "$D/DialogoGenerar.tsx"
```

- [ ] **Step 3: `DialogoNuevaClase.tsx`**

```bash
cd "/Users/saidromero/Desktop/Casa She/casa-she-entrega-2"
F=frontend/src/pages/admin/classes/ClassesCalendar.tsx
orig() { git show ff4e304:$F | sed -n "$1,$2p"; }
D=frontend/src/pages/admin/classes/calendario
{
cat <<'TSX'
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Calendar as CalendarIcon, Loader2, Repeat } from 'lucide-react';
import api, { getErrorMessage } from '@/lib/api';
import type { ClassType, Instructor } from '@/types/class';
import { ClassIntensitySelector } from '@/components/classes/ClassIntensity';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import type { Facility } from './tipos';
import { DAYS } from './formato';

TSX
orig 80 104
echo
orig 119 119
cat <<'TSX'

interface DialogoNuevaClaseProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Día con el que arranca el formulario. El padre vuelve a montar el diálogo (key) en cada apertura. */
    dia: Date;
    classTypes?: ClassType[];
    instructors?: Instructor[];
    facilities?: Facility[];
}

/** "Nueva clase": una clase suelta o una tanda recurrente. Movido sin cambios de ClassesCalendar. */
export function DialogoNuevaClase({ open, onOpenChange, dia, classTypes, instructors, facilities }: DialogoNuevaClaseProps) {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const classForm = useForm<ClassForm>({
        resolver: zodResolver(classSchema),
        // Los mismos valores que ponía handleDayClick con classForm.reset() al abrir.
        defaultValues: {
            date: dia,
            maxCapacity: 6,
            intensity: null,
            startTime: '09:00',
            endTime: '10:00',
            recurring: false,
            weekdays: [dia.getDay()],
            endDate: undefined,
        },
    });

TSX
orig 347 396 | perl -pe 's/\QsetIsClassOpen(false);\E/onOpenChange(false);/g'
cat <<'TSX'

    return (
TSX
orig 1600 1774 | perl -pe 's/\QsetIsClassOpen\E/onOpenChange/g; s/\QisClassOpen\E/open/g; s/^ {12}//'
cat <<'TSX'
    );
}
TSX
} > "$D/DialogoNuevaClase.tsx"
```

- [ ] **Step 4: `DialogoEditarClase.tsx`**

```bash
cd "/Users/saidromero/Desktop/Casa She/casa-she-entrega-2"
F=frontend/src/pages/admin/classes/ClassesCalendar.tsx
orig() { git show ff4e304:$F | sed -n "$1,$2p"; }
D=frontend/src/pages/admin/classes/calendario
{
cat <<'TSX'
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { Calendar as CalendarIcon, Loader2 } from 'lucide-react';
import api, { getErrorMessage } from '@/lib/api';
import type { Class, ClassType, Instructor } from '@/types/class';
import { ClassIntensitySelector } from '@/components/classes/ClassIntensity';
import { ChannelLogo } from '@/components/brands/ChannelLogo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import type { Facility } from './tipos';

TSX
orig 106 116
echo
orig 120 120
cat <<'TSX'

interface DialogoEditarClaseProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** La clase a editar. El padre vuelve a montar el diálogo (key) en cada apertura. */
    clase: Class | null;
    classTypes?: ClassType[];
    instructors?: Instructor[];
    facilities?: Facility[];
    /** El enlace "Cambiar coach…" abre ese diálogo encima de este. */
    onCambiarCoach: () => void;
    /** Se guardó: el padre cierra el panel de la clase. */
    onGuardada: () => void;
}

/** "Editar clase". Movido sin cambios de ClassesCalendar. */
export function DialogoEditarClase({ open, onOpenChange, clase, classTypes, instructors, facilities, onCambiarCoach, onGuardada }: DialogoEditarClaseProps) {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const editForm = useForm<EditClassForm>({
        resolver: zodResolver(editClassSchema),
        // Los mismos valores que ponía handleEditClass con editForm.reset() al abrir.
        defaultValues: clase ? {
            classTypeId: clase.class_type_id || '',
            instructorId: clase.instructor_id || '',
            facilityId: clase.facility_id || undefined,
            date: parseISO((clase.date || '').split('T')[0] + 'T00:00:00'),
            startTime: clase.start_time,
            endTime: clase.end_time,
            maxCapacity: clase.max_capacity,
            intensity: clase.intensity ?? null,
            totalpassSpots: clase.totalpass_spots ?? 0,
        } : undefined,
    });

TSX
orig 398 461 | perl -ne 'next if /^\s*\QsetIsAttendeesOpen(false);\E\s*$/; s/\QsetIsEditOpen(false);\E/onOpenChange(false);/; s/\QsetSelectedClass(null);\E/onGuardada();/; print'
cat <<'TSX'

    return (
TSX
orig 1777 1903 | perl -pe 's/\QhandleChangeCoach\E/onCambiarCoach/g; s/\QsetIsEditOpen\E/onOpenChange/g; s/\QisEditOpen\E/open/g; s/\QselectedClass\E/clase/g; s/^ {12}//'
cat <<'TSX'
    );
}
TSX
} > "$D/DialogoEditarClase.tsx"
```

- [ ] **Step 5: `DialogoCopiarSemana.tsx`**

```bash
cd "/Users/saidromero/Desktop/Casa She/casa-she-entrega-2"
F=frontend/src/pages/admin/classes/ClassesCalendar.tsx
orig() { git show ff4e304:$F | sed -n "$1,$2p"; }
D=frontend/src/pages/admin/classes/calendario
{
cat <<'TSX'
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { format, addDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { Copy as CopyIcon, Loader2 } from 'lucide-react';
import api, { getErrorMessage } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import type { CopiaSemanaResumen } from './tipos';

interface DialogoCopiarSemanaProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Lunes de la semana que se copia a la siguiente. */
    weekStart: Date;
}

/** "Copiar semana" con vista previa obligatoria. El padre lo vuelve a montar (key) en cada apertura. Movido sin cambios. */
export function DialogoCopiarSemana({ open, onOpenChange, weekStart }: DialogoCopiarSemanaProps) {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [copiaPrevia, setCopiaPrevia] = useState<CopiaSemanaResumen | null>(null);
    const [conservarCanceladas, setConservarCanceladas] = useState<boolean | null>(null);
    const startStr = format(weekStart, 'yyyy-MM-dd');

TSX
orig 804 831 | perl -pe 's/\QsetIsCopyWeekOpen(false);\E/onOpenChange(false);/'
cat <<'TSX'

    return (
TSX
orig 1906 2016 | perl -pe 's/\QsetIsCopyWeekOpen\E/onOpenChange/g; s/\QisCopyWeekOpen\E/open/g; s/^ {12}//'
cat <<'TSX'
    );
}
TSX
} > "$D/DialogoCopiarSemana.tsx"
```

- [ ] **Step 6: `DialogoGratis.tsx`**

```bash
cd "/Users/saidromero/Desktop/Casa She/casa-she-entrega-2"
F=frontend/src/pages/admin/classes/ClassesCalendar.tsx
orig() { git show ff4e304:$F | sed -n "$1,$2p"; }
D=frontend/src/pages/admin/classes/calendario
{
cat <<'TSX'
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';
import api, { getErrorMessage } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';

interface DialogoGratisProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

/** "Gratis": marca como gratis las clases de un rango (solo admin). Movido sin cambios de ClassesCalendar. */
export function DialogoGratis({ open, onOpenChange }: DialogoGratisProps) {
    const { toast } = useToast();
    const queryClient = useQueryClient();
TSX
orig 189 193
echo
orig 549 561
cat <<'TSX'

    return (
TSX
orig 2019 2126 | perl -pe 's/\QsetIsBulkFreeOpen\E/onOpenChange/g; s/\QisBulkFreeOpen\E/open/g; s/^ {12}//'
cat <<'TSX'
    );
}
TSX
} > "$D/DialogoGratis.tsx"
```

- [ ] **Step 7: `DialogoCancelarClase.tsx`**

```bash
cd "/Users/saidromero/Desktop/Casa She/casa-she-entrega-2"
F=frontend/src/pages/admin/classes/ClassesCalendar.tsx
orig() { git show ff4e304:$F | sed -n "$1,$2p"; }
D=frontend/src/pages/admin/classes/calendario
{
cat <<'TSX'
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import api, { getErrorMessage } from '@/lib/api';
import type { Class } from '@/types/class';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';

interface DialogoCancelarClaseProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    clase: Class | null;
    /** Se canceló: el padre cierra el panel de la clase. */
    onCancelada: () => void;
}

/** "Cancelar clase": solo esta o toda la serie del horario. Movido sin cambios de ClassesCalendar. */
export function DialogoCancelarClase({ open, onOpenChange, clase, onCancelada }: DialogoCancelarClaseProps) {
    const { toast } = useToast();
    const queryClient = useQueryClient();
TSX
orig 484 499 | perl -ne 'next if /^\s*\QsetIsAttendeesOpen(false);\E\s*$/; s/\QsetSelectedClass(null);\E/onCancelada();/; s/\QsetCancelChoiceOpen(false);\E/onOpenChange(false);/; print'
cat <<'TSX'

    return (
TSX
orig 2136 2167 | perl -pe 's/\QsetCancelChoiceOpen\E/onOpenChange/g; s/\QcancelChoiceOpen\E/open/g; s/\QselectedClass\E/clase/g; s/^ {12}//'
cat <<'TSX'
    );
}
TSX
} > "$D/DialogoCancelarClase.tsx"
```

- [ ] **Step 8: `DialogoCambiarCoach.tsx`**

```bash
cd "/Users/saidromero/Desktop/Casa She/casa-she-entrega-2"
F=frontend/src/pages/admin/classes/ClassesCalendar.tsx
orig() { git show ff4e304:$F | sed -n "$1,$2p"; }
D=frontend/src/pages/admin/classes/calendario
{
cat <<'TSX'
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Loader2 } from 'lucide-react';
import api, { getErrorMessage } from '@/lib/api';
import { parseLocalDate } from '@/lib/date';
import type { Class, Instructor } from '@/types/class';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { formatClassTime } from './formato';

interface DialogoCambiarCoachProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** La clase. El padre vuelve a montar el diálogo (key) en cada apertura. */
    clase: Class | null;
    instructors?: Instructor[];
    /** Se aplicó: el padre cierra también "Editar clase" si estaba abierto. */
    onAplicado: () => void;
}

/** "Cambiar coach" con alcance: este día, toda la serie o fechas específicas. No notifica. Movido sin cambios. */
export function DialogoCambiarCoach({ open, onOpenChange, clase, instructors, onAplicado }: DialogoCambiarCoachProps) {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    // Los mismos valores que ponía handleChangeCoach al abrir.
    const [coachToAssign, setCoachToAssign] = useState<string>(clase?.instructor_id || '');
    const [coachScope, setCoachScope] = useState<'this' | 'series' | 'dates'>('this');
    const [selectedSeriesDates, setSelectedSeriesDates] = useState<Set<string>>(new Set());

TSX
orig 463 468 | perl -pe 's/\QisChangeCoachOpen\E/open/g; s/\QselectedClass\E/clase/g'
echo
orig 470 482 | perl -pe 's/\QsetIsChangeCoachOpen(false);\E/onOpenChange(false);/; s/\QsetIsEditOpen(false);\E/onAplicado();/; s/\QselectedClass\E/clase/g'
cat <<'TSX'

    return (
TSX
orig 2170 2293 | perl -pe 's/\QsetIsChangeCoachOpen\E/onOpenChange/g; s/\QisChangeCoachOpen\E/open/g; s/\QselectedClass\E/clase/g; s/^ {12}//'
cat <<'TSX'
    );
}
TSX
} > "$D/DialogoCambiarCoach.tsx"
```

- [ ] **Step 9: Los diálogos compilan solos**

Run:

```bash
cd frontend && wc -l src/pages/admin/classes/calendario/Dialogo*.tsx
npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -E "error TS" | grep -vE "FilterPills.tsx\(124|push.ts\(47|Events.tsx\((259|906)"
```

Expected: 184 `DialogoCambiarCoach`, 71 `DialogoCancelarClase`, 171 `DialogoCopiarSemana`, 263 `DialogoEditarClase`, 130 `DialogoGenerar`, 150 `DialogoGratis`, 308 `DialogoNuevaClase`; el typecheck no imprime nada.

- [ ] **Step 10: Cortar del padre lo que se movió**

```bash
cd "/Users/saidromero/Desktop/Casa She/casa-she-entrega-2"
set -e
H="${TMPDIR:-/tmp}/reemplazar-bloque.mjs"
F=frontend/src/pages/admin/classes/ClassesCalendar.tsx
node "$H" "$F" 'const generateSchema = z.object({' 'type EditClassForm = z.infer<typeof editClassSchema>;' 46
node "$H" "$F" '    // Mutations' '    });' 24
node "$H" "$F" 'const createMutation = useMutation({' '    });' 20
node "$H" "$F" 'const recurringMutation = useMutation({' '    });' 29
node "$H" "$F" 'const editMutation = useMutation({' '    });' 64
node "$H" "$F" '// Fechas FUTURAS de la misma recurrencia' '    });' 6
node "$H" "$F" '// Reasigna el coach con el alcance elegido' '    });' 13
node "$H" "$F" 'const cancelMutation = useMutation({' '    });' 16
node "$H" "$F" 'const bulkMarkFreeMutation = useMutation({' '    });' 13
node "$H" "$F" '    // Forms' '    const nextSunday = addDays(nextMonday, 6);' 4
node "$H" "$F" 'const generateForm = useForm<GenerateForm>({' '    });' 7
node "$H" "$F" 'const classForm = useForm<ClassForm>({' '    });' 4
node "$H" "$F" 'const editForm = useForm<EditClassForm>({' '    });' 3
node "$H" "$F" '// Copiar semana. Son dos llamadas al MISMO endpoint' '    });' 28
node "$H" "$F" '{/* Generate Dialog */}' '                    </Dialog>' 59
node "$H" "$F" '{/* Create Class Dialog */}' '                    </Dialog>' 176
node "$H" "$F" '{/* Edit Class Dialog */}' '                    </Dialog>' 128
node "$H" "$F" '{/* Copiar semana — siempre con vista previa' '                    </Dialog>' 112
node "$H" "$F" '{/* Bulk mark free dialog */}' '                    </Dialog>' 109
node "$H" "$F" '{/* Cancelar: solo esta clase o toda la serie del horario */}' '                    </Dialog>' 33
node "$H" "$F" '{/* Cambiar coach: elige el alcance' '                    </Dialog>' 125
```

Expected: 21 líneas `✓ Cortadas N líneas: …` y ningún `✋`.

- [ ] **Step 11: El padre usa los diálogos**

Seis cambios en `frontend/src/pages/admin/classes/ClassesCalendar.tsx` (cada `old` aparece una sola vez):

a) Imports. Después de

```tsx
import { useSemanaClases } from './calendario/useSemanaClases';
```

agregar:

```tsx
import { DialogoGenerar } from './calendario/DialogoGenerar';
import { DialogoNuevaClase } from './calendario/DialogoNuevaClase';
import { DialogoEditarClase } from './calendario/DialogoEditarClase';
import { DialogoCopiarSemana } from './calendario/DialogoCopiarSemana';
import { DialogoGratis } from './calendario/DialogoGratis';
import { DialogoCancelarClase } from './calendario/DialogoCancelarClase';
import { DialogoCambiarCoach } from './calendario/DialogoCambiarCoach';
```

b) Estado que se fue a los diálogos. Cambiar:

```tsx
    const [isCopyWeekOpen, setIsCopyWeekOpen] = useState(false);
    const [copiaPrevia, setCopiaPrevia] = useState<CopiaSemanaResumen | null>(null);
    const [conservarCanceladas, setConservarCanceladas] = useState<boolean | null>(null);
    const [bulkFreeForm, setBulkFreeForm] = useState({
        from_date: '', to_date: '', from_time: '00:00', to_time: '23:59',
        free_label: 'Opening Day - Gratis',
        preview: null as null | number,
    });
    const [isClassOpen, setIsClassOpen] = useState(false);
```

por:

```tsx
    const [isCopyWeekOpen, setIsCopyWeekOpen] = useState(false);
    // Cada apertura vuelve a montar el diálogo (key): arranca sin vista previa ni opción elegida.
    const [claveCopia, setClaveCopia] = useState(0);
    const [isClassOpen, setIsClassOpen] = useState(false);
    const [nuevaClase, setNuevaClase] = useState<{ dia: Date; clave: number }>({ dia: new Date(), clave: 0 });
```

y cambiar:

```tsx
    const [isChangeCoachOpen, setIsChangeCoachOpen] = useState(false);
    const [coachToAssign, setCoachToAssign] = useState<string>('');
    const [coachScope, setCoachScope] = useState<'this' | 'series' | 'dates'>('this');
    const [selectedSeriesDates, setSelectedSeriesDates] = useState<Set<string>>(new Set());
```

por:

```tsx
    const [isChangeCoachOpen, setIsChangeCoachOpen] = useState(false);
    const [claveCoach, setClaveCoach] = useState(0);
    const [claveEdicion, setClaveEdicion] = useState(0);
```

c) `handleDayClick`. Cambiar:

```tsx
    const handleDayClick = (day: Date) => {
        classForm.reset({
            date: day,
            maxCapacity: 6,
            intensity: null,
            startTime: '09:00',
            endTime: '10:00',
            recurring: false,
            weekdays: [day.getDay()],
            endDate: undefined,
        });
        setIsClassOpen(true);
    };
```

por:

```tsx
    const handleDayClick = (day: Date) => {
        // Clave nueva = el diálogo se vuelve a montar con la fecha de ese día.
        setNuevaClase((prev) => ({ dia: day, clave: prev.clave + 1 }));
        setIsClassOpen(true);
    };
```

d) `handleEditClass` y `handleChangeCoach`. Cambiar:

```tsx
    const handleEditClass = () => {
        if (!selectedClass) return;
        editForm.reset({
            classTypeId: selectedClass.class_type_id || '',
            instructorId: selectedClass.instructor_id || '',
            facilityId: selectedClass.facility_id || undefined,
            date: parseISO((selectedClass.date || '').split('T')[0] + 'T00:00:00'),
            startTime: selectedClass.start_time,
            endTime: selectedClass.end_time,
            maxCapacity: selectedClass.max_capacity,
            intensity: selectedClass.intensity ?? null,
            totalpassSpots: selectedClass.totalpass_spots ?? 0,
        });
        setIsEditOpen(true);
    };

    const handleChangeCoach = () => {
        if (!selectedClass) return;
        setCoachToAssign(selectedClass.instructor_id || '');
        setCoachScope('this');
        setSelectedSeriesDates(new Set());
        setIsChangeCoachOpen(true);
    };
```

por:

```tsx
    const handleEditClass = () => {
        if (!selectedClass) return;
        setClaveEdicion((k) => k + 1);
        setIsEditOpen(true);
    };

    const handleChangeCoach = () => {
        if (!selectedClass) return;
        setClaveCoach((k) => k + 1);
        setIsChangeCoachOpen(true);
    };
```

e) Botón "Copiar semana". Cambiar:

```tsx
                                        setCopiaPrevia(null);
                                        setConservarCanceladas(null);
                                        setIsCopyWeekOpen(true);
```

por:

```tsx
                                        setClaveCopia((k) => k + 1);
                                        setIsCopyWeekOpen(true);
```

f) Montar los diálogos donde estaban. Cambiar:

```tsx
                    <CancelBookingDialog
```

por:

```tsx
                    <DialogoGenerar open={isGenerateOpen} onOpenChange={setIsGenerateOpen} onGenerado={setCurrentDate} />
                    <DialogoNuevaClase
                        key={`nueva-${nuevaClase.clave}`}
                        open={isClassOpen}
                        onOpenChange={setIsClassOpen}
                        dia={nuevaClase.dia}
                        classTypes={classTypes}
                        instructors={instructors}
                        facilities={facilities}
                    />
                    <DialogoEditarClase
                        key={`editar-${claveEdicion}`}
                        open={isEditOpen}
                        onOpenChange={setIsEditOpen}
                        clase={selectedClass}
                        classTypes={classTypes}
                        instructors={instructors}
                        facilities={facilities}
                        onCambiarCoach={handleChangeCoach}
                        onGuardada={() => { setIsAttendeesOpen(false); setSelectedClass(null); }}
                    />
                    <DialogoCopiarSemana key={`copia-${claveCopia}`} open={isCopyWeekOpen} onOpenChange={setIsCopyWeekOpen} weekStart={weekStart} />
                    <DialogoGratis open={isBulkFreeOpen} onOpenChange={setIsBulkFreeOpen} />
                    <DialogoCancelarClase
                        open={cancelChoiceOpen}
                        onOpenChange={setCancelChoiceOpen}
                        clase={selectedClass}
                        onCancelada={() => { setIsAttendeesOpen(false); setSelectedClass(null); }}
                    />
                    <DialogoCambiarCoach
                        key={`coach-${claveCoach}`}
                        open={isChangeCoachOpen}
                        onOpenChange={setIsChangeCoachOpen}
                        clase={selectedClass}
                        instructors={instructors}
                        onAplicado={() => setIsEditOpen(false)}
                    />
                    <CancelBookingDialog
```

- [ ] **Step 12: Verificar que no cambió nada**

Run:

```bash
cd frontend && npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -E "error TS" | grep -vE "FilterPills.tsx\(124|push.ts\(47|Events.tsx\((259|906)"
wc -l src/pages/admin/classes/ClassesCalendar.tsx
git grep -nE "useForm<|copiaPrevia|bulkFreeForm|coachScope|generateMutation|editMutation" -- src/pages/admin/classes/ClassesCalendar.tsx
./scripts/e2e-local.sh e2e/tests/admin-classes.spec.ts --project=chromium -g "semana por horas"
```

Expected: typecheck sin salida; `1225 src/pages/admin/classes/ClassesCalendar.tsx`; el `git grep` no encuentra nada; Playwright `1 passed`.

- [ ] **Step 13: Commit**

```bash
git add frontend/src/pages/admin/classes/calendario/DialogoGenerar.tsx frontend/src/pages/admin/classes/calendario/DialogoNuevaClase.tsx frontend/src/pages/admin/classes/calendario/DialogoEditarClase.tsx frontend/src/pages/admin/classes/calendario/DialogoCopiarSemana.tsx frontend/src/pages/admin/classes/calendario/DialogoGratis.tsx frontend/src/pages/admin/classes/calendario/DialogoCancelarClase.tsx frontend/src/pages/admin/classes/calendario/DialogoCambiarCoach.tsx frontend/src/pages/admin/classes/ClassesCalendar.tsx
git commit -m "refactor(calendario): cada diálogo en su archivo, sin cambiar comportamiento

Generar, Nueva clase, Editar, Copiar semana, Gratis, Cancelar y Cambiar
coach se mueven tal cual con su formulario y su mutación. Donde el padre
reiniciaba el formulario al abrir, ahora una key nueva vuelve a montar el
diálogo con los mismos valores.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Partir sin cambiar comportamiento (3/3) — el panel de la clase

**Tipo:** mover bloques exactos del original con un script y cortar con el ayudante que verifica conteos. Nada visible cambia. Verificación: typecheck, conteos, prueba de humo (abre el panel, sus pestañas y el cupo de TotalPass).

**Files:**
- Create: `frontend/src/pages/admin/classes/calendario/PanelClase.tsx`
- Modify: `frontend/src/pages/admin/classes/ClassesCalendar.tsx`

**Interfaces:**
- Consumes: `Attendee` de `./tipos`; `attendeeBookedBy`, `getInitials`, `whatsAppDeAsistente` de `./formato` (Task 3).
- Produces: `PanelClase({ clase: Class | null; open: boolean; onOpenChange: (open: boolean) => void; onEditar: () => void; onCancelar: () => void; onClaseCambiada: Dispatch<SetStateAction<Class | null>> })`. `onClaseCambiada` recibe los mismos ajustes que antes hacía `setSelectedClass` (gratis, cupo cerrado, cupo TotalPass); la Task 8 lo quita.

- [ ] **Step 1: El ayudante para cortar bloques**

Si no existe `"${TMPDIR:-/tmp}/reemplazar-bloque.mjs"` (lo crea la Task 4), crearlo:

```bash
cat > "${TMPDIR:-/tmp}/reemplazar-bloque.mjs" <<'JS'
// Corta (o reemplaza) un bloque de líneas entre dos anclas, verificando cuántas líneas toca.
// Uso: node reemplazar-bloque.mjs <archivo> <texto de la 1.ª línea> <última línea exacta> <líneas esperadas> [archivo con el reemplazo]
import { readFileSync, writeFileSync } from 'node:fs';

const [archivo, inicio, fin, esperadas, reemplazo] = process.argv.slice(2);
const lineas = readFileSync(archivo, 'utf8').split('\n');
const coincidencias = lineas.flatMap((l, k) => (l.includes(inicio) ? [k] : []));
if (coincidencias.length !== 1) {
    console.error(`✋ "${inicio}" aparece ${coincidencias.length} veces; debe aparecer una. No se tocó nada.`);
    process.exit(1);
}
const i = coincidencias[0];
const j = lineas.findIndex((l, k) => k >= i && l === fin);
if (j < 0) {
    console.error(`✋ No hay una línea exactamente igual a "${fin}" después de "${inicio}". No se tocó nada.`);
    process.exit(1);
}
const cuantas = j - i + 1;
if (Number(esperadas) !== cuantas) {
    console.error(`✋ Se tocarían ${cuantas} líneas y se esperaban ${esperadas}. No se tocó nada.`);
    process.exit(1);
}
const nuevas = reemplazo ? readFileSync(reemplazo, 'utf8').replace(/\n$/, '').split('\n') : [];
// Al cortar sin reemplazo, si quedan dos líneas en blanco seguidas se quita una.
const blancoDoble = !reemplazo && i > 0 && lineas[i - 1].trim() === '' && j + 1 < lineas.length - 1 && lineas[j + 1].trim() === '';
lineas.splice(i, cuantas + (blancoDoble ? 1 : 0), ...nuevas);
writeFileSync(archivo, lineas.join('\n'));
console.log(`✓ ${reemplazo ? 'Reemplazadas' : 'Cortadas'} ${cuantas} líneas: ${inicio.trim()}`);
JS
```

Uso: `node "${TMPDIR:-/tmp}/reemplazar-bloque.mjs" <archivo> '<texto de la primera línea>' '<última línea exacta, con su sangría>' <líneas esperadas> [archivo con el reemplazo]`. Si algo no coincide no toca nada y sale con `✋`: PARAR y reportar.

- [ ] **Step 2: Crear `PanelClase.tsx` desde el original**

Estado, consultas y mutaciones del panel (L178, 204, 209-215, 263-295, 501-547, 563-610), asistentes (L696-802), el `Sheet` (L1230-1537), `CancelBookingDialog` (L2128-2133) y el diálogo de invitadas (L882-887). Los únicos renombres: `selectedClass` → `clase`, `setSelectedClass` → `onClaseCambiada`, `isAttendeesOpen` → `open`, `handleEditClass` → `onEditar`, `setCancelChoiceOpen(true)` → `onCancelar()`, y la línea del `<Sheet …>`.

```bash
cd "/Users/saidromero/Desktop/Casa She/casa-she-entrega-2"
F=frontend/src/pages/admin/classes/ClassesCalendar.tsx
orig() { git show ff4e304:$F | sed -n "$1,$2p"; }
D=frontend/src/pages/admin/classes/calendario
P='s/\QsetSelectedClass\E/onClaseCambiada/g; s/\QselectedClass\E/clase/g; s/\QisAttendeesOpen\E/open/g'
{
cat <<'TSX'
import { useState, type Dispatch, type SetStateAction } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import {
    Loader2, Calendar as CalendarIcon, Plus, Minus, Users, Trash2, Check, Edit, Phone, MessageCircle, Clock, MapPin, Sparkles, X, RotateCcw, Lock, Unlock,
} from 'lucide-react';
import api, { getErrorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { Class } from '@/types/class';
import { useAuthStore } from '@/stores/authStore';
import { CompanionPanel } from '@/components/bookings/CompanionPanel';
import { CancelBookingDialog } from '@/components/bookings/CancelBookingDialog';
import { ClassIntensity } from '@/components/classes/ClassIntensity';
import SellPlanDialog from '@/components/memberships/SellPlanDialog';
import { ChannelLogo } from '@/components/brands/ChannelLogo';
import { PlanLabel } from '@/components/brands/PlanLabel';
import { CANALES, canalDePlan, esCanal } from '@/lib/canales';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useToast } from '@/components/ui/use-toast';
import type { Attendee } from './tipos';
import { attendeeBookedBy, getInitials, whatsAppDeAsistente } from './formato';

interface PanelClaseProps {
    clase: Class | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onEditar: () => void;
    onCancelar: () => void;
    /** Ajusta la clase seleccionada del padre (gratis, cupo cerrado, cupo TotalPass) sin esperar a recargar. */
    onClaseCambiada: Dispatch<SetStateAction<Class | null>>;
}

/** Panel lateral de una clase: datos, acciones, inscribir, cupo, inscritas y lista de espera. Movido sin cambios de ClassesCalendar. */
export function PanelClase({ clase, open, onOpenChange, onEditar, onCancelar, onClaseCambiada }: PanelClaseProps) {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const user = useAuthStore((s) => s.user);
    const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
TSX
orig 178 178
orig 204 204
orig 209 215
echo
orig 263 273 | perl -pe "$P"
echo
orig 275 295
echo
orig 501 547 | perl -pe "$P"
echo
orig 563 610
echo
orig 696 802 | perl -pe "$P"
cat <<'TSX'

    return (
        <>
TSX
orig 1230 1537 | perl -pe 's/\Q<Sheet open={isAttendeesOpen && !!selectedClass} onOpenChange={(open) => { setIsAttendeesOpen(open); if (!open) setSelectedClass(null); }}>\E/<Sheet open={open && !!clase} onOpenChange={onOpenChange}>/; s/\QhandleEditClass\E/onEditar/g; s/\QsetCancelChoiceOpen(true)\E/onCancelar()/g; '"$P"'; s/^ {8}//'
echo
orig 2128 2133 | perl -pe 's/^ {8}//'
orig 882 887 | perl -pe 's/^ {8}//'
cat <<'TSX'
        </>
    );
}
TSX
} > "$D/PanelClase.tsx"
```

Run: `wc -l frontend/src/pages/admin/classes/calendario/PanelClase.tsx`
Expected: `622`.

- [ ] **Step 3: Cortar del padre y montar `PanelClase` donde estaba el `Sheet`**

```bash
cd "/Users/saidromero/Desktop/Casa She/casa-she-entrega-2"
set -e
H="${TMPDIR:-/tmp}/reemplazar-bloque.mjs"
F=frontend/src/pages/admin/classes/ClassesCalendar.tsx
P="${TMPDIR:-/tmp}/panel-jsx.txt"
cat > "$P" <<'TSX'
                    <PanelClase
                        clase={selectedClass}
                        open={isAttendeesOpen}
                        onOpenChange={(open) => { setIsAttendeesOpen(open); if (!open) setSelectedClass(null); }}
                        onEditar={handleEditClass}
                        onCancelar={() => setCancelChoiceOpen(true)}
                        onClaseCambiada={setSelectedClass}
                    />
TSX
node "$H" "$F" 'const [companionHost, setCompanionHost]' '    const [companionHost, setCompanionHost] = useState<Attendee | null>(null);' 1
node "$H" "$F" 'const [attendeesTab, setAttendeesTab]' "    const [attendeesTab, setAttendeesTab] = useState<'reservado' | 'espera' | 'cancelado'>('reservado');" 1
node "$H" "$F" 'const [userSearch, setUserSearch] = useState' '    const [sellOpen, setSellOpen] = useState(false);' 7
node "$H" "$F" 'const { data: attendees, isLoading: attendeesLoading' '    });' 5
node "$H" "$F" 'const { data: userSearchResults' '    });' 5
node "$H" "$F" 'const adminBookMutation = useMutation({' '    });' 21
node "$H" "$F" 'const toggleFreeMutation = useMutation({' '    });' 20
node "$H" "$F" '// Cerrar / reabrir el horario para nuevas reservas' '    });' 13
node "$H" "$F" '// Cupo de TotalPass de la clase' '    });' 12
node "$H" "$F" 'const checkInMutation = useMutation({' '    });' 11
node "$H" "$F" 'const uncheckInMutation = useMutation({' '    });' 11
node "$H" "$F" 'const cancelBookingMutation = useMutation({' '    });' 11
node "$H" "$F" '// Cancelar reserva confirmada' '    const [cancelBookingId, setCancelBookingId] = useState<string | null>(null);' 2
node "$H" "$F" 'const promoteWaitlistMutation = useMutation({' '    });' 9
node "$H" "$F" '// Asistentes divididos por estado' '        : 0;' 9
node "$H" "$F" 'const renderAttendee = (attendee: Attendee' '    );' 97
node "$H" "$F" '<Dialog open={!!companionHost}' '                    </Dialog>' 6
node "$H" "$F" '{/* Attendees Sheet */}' '                    </Sheet>' 309 "$P"
node "$H" "$F" '<CancelBookingDialog' '                    />' 6
```

Expected: 18 `✓ Cortadas …`, 1 `✓ Reemplazadas 309 líneas: {/* Attendees Sheet */}` y ningún `✋`.

Después, en `ClassesCalendar.tsx`, después de

```tsx
import { DialogoCambiarCoach } from './calendario/DialogoCambiarCoach';
```

agregar:

```tsx
import { PanelClase } from './calendario/PanelClase';
```

- [ ] **Step 4: Verificar que no cambió nada**

Run:

```bash
cd frontend && npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -E "error TS" | grep -vE "FilterPills.tsx\(124|push.ts\(47|Events.tsx\((259|906)"
wc -l src/pages/admin/classes/ClassesCalendar.tsx
git grep -nE "renderAttendee|adminBookMutation|<Sheet|companionHost|setTotalpassSpotsMutation" -- src/pages/admin/classes/ClassesCalendar.tsx
./scripts/e2e-local.sh e2e/tests/admin-classes.spec.ts --project=chromium -g "semana por horas"
```

Expected: typecheck sin salida; `665 src/pages/admin/classes/ClassesCalendar.tsx`; el `git grep` no encuentra nada; Playwright `1 passed`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/admin/classes/calendario/PanelClase.tsx frontend/src/pages/admin/classes/ClassesCalendar.tsx
git commit -m "refactor(calendario): panel de la clase a PanelClase, sin cambiar comportamiento

El Sheet con inscribir, cupo de TotalPass, cupo cerrado, clase gratis,
inscritas, lista de espera, check-in e invitadas se mueve tal cual con
sus consultas y mutaciones.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Tarjeta de clase con los lugares por plataforma (y la vista móvil)

**Tipo:** código completo, se transcribe; dos recortes con el ayudante. Cambia lo visible: la tarjeta nueva reemplaza a `ClassEventCard` (adiós pastilla "TP n") en la lista móvil y, mientras llega la Task 7, en las columnas de escritorio.

**Files:**
- Create: `frontend/src/components/brands/ChannelDot.tsx`
- Create: `frontend/src/pages/admin/classes/calendario/TarjetaClase.tsx`, `VistaDiaMovil.tsx`
- Modify: `frontend/src/pages/admin/classes/ClassesCalendar.tsx`
- Test: `frontend/e2e/tests/admin-classes.spec.ts` (caso "móvil")

**Interfaces:**
- Consumes: `lugaresDeClase`, `estiloDeLugar`, `etiquetaCupo`, `MAX_PUNTOS_TARJETA`, `type Lugar` de `./lugares`; `colorPuntoAlumna`, `fondoDeTarjeta`, `bordeDeTarjeta` de `./colores` (Task 2); `formatClassTime`, `DAYS` de `./formato` (Task 3); `CANALES`, `type CanalClave` de `@/lib/canales`.
- Produces:
  - `PuntoLugar({ relleno: string; anillo: string; tamano?: number; className?; style?; 'data-lugar'?: string; …span })` y `ChannelDot({ canal: CanalClave; tamano?: number; className?: string })` en `@/components/brands/ChannelDot`. `PuntoLugar` exige relleno y anillo; `ChannelDot` usa `CANALES[canal].punto` + `.anillo`.
  - `TarjetaClase({ clase: Class; variante: 'rejilla' | 'lista'; completa?: boolean; …props de <button> })`. Atributos para pruebas: `data-clase`, `data-oscura="true"` (Salsa), `data-nombre-clase` en el nombre, `data-lugar` (`alumna` | `libre` | clave del canal) en cada punto. `aria-label` = `"<Nombre>[, Intensidad n de 3], <HH:MM>, <coach | sin coach asignada>, <n de cap lugares | cancelada>[, gratis][, cupo cerrado]"`.
  - `VistaDiaMovil({ dias: Date[]; diaSeleccionado: Date; onSeleccionarDia; clasesDelDia: (dia: Date) => Class[]; diasCerrados: Set<string>; motivoCierre: (dia: Date) => string | undefined; onClickClase: (c: Class) => void; onNuevaClase: (dia: Date) => void })`. Cada botón de la tira lleva `data-dia="YYYY-MM-DD"`.

- [ ] **Step 1: Escribir la prueba que falla**

En `frontend/e2e/tests/admin-classes.spec.ts`, cambiar

```ts
import { FECHA_PRUEBA, mockSemanaCalendario } from "../fixtures/calendario";
```

por

```ts
import { AHORA_PRUEBA, FECHA_PRUEBA, mockSemanaCalendario } from "../fixtures/calendario";
```

y dentro del `test.describe("Calendario de recepción – semana por horas", …)`, antes de su `});` final (última línea del archivo), agregar:

```ts
  test("móvil: la lista del día usa la tarjeta con los lugares", async ({ adminPage: page }) => {
    await page.clock.setFixedTime(AHORA_PRUEBA);
    await page.setViewportSize({ width: 390, height: 844 });
    await mockSemanaCalendario(page);
    await page.goto(`/admin/calendar?date=${FECHA_PRUEBA}`);

    // Hoy es miércoles: la lista arranca en ese día.
    await expect(page.getByRole("button", { name: /^Sculpt.*18:00/ })).toContainText("Sin coach asignada");
    await page.locator('[data-dia="2026-11-02"]').click();
    const barre = page.getByRole("button", { name: /^Barre.*07:00/ });
    await expect(barre.locator('[data-lugar="alumna"]')).toHaveCount(2);
    await expect(barre.locator('[data-lugar="totalpass"]')).toHaveCount(1);
    await expect(barre.locator('[data-lugar="libre"]')).toHaveCount(4);
    await expect(barre).toContainText("3/7");
    await expect(barre).not.toContainText("TP");
  });
```

- [ ] **Step 2: Correrla y ver que falla**

Run: `cd frontend && ./scripts/e2e-local.sh e2e/tests/admin-classes.spec.ts --project=chromium -g "móvil"`
Expected: FAIL (la tarjeta de hoy dice "Coach por asignar", no hay `data-dia` en la tira ni puntos `data-lugar`).

- [ ] **Step 3: `PuntoLugar` y `ChannelDot`**

Crear `frontend/src/components/brands/ChannelDot.tsx`:

```tsx
import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';
import { CANALES, type CanalClave } from '@/lib/canales';

interface PuntoLugarProps extends HTMLAttributes<HTMLSpanElement> {
    /** Relleno ('transparent' para un lugar libre). */
    relleno: string;
    /** Anillo. Siempre se pinta: sin él, el verde de TotalPass queda a ~2:1 sobre crema. */
    anillo: string;
    /** Diámetro en px. */
    tamano?: number;
    /** Quién ocupa el lugar ('alumna', 'libre' o la clave del canal); lo usan las pruebas. */
    'data-lugar'?: string;
}

/** Un lugar de la clase: punto con anillo. Decorativo; el número que va al lado lo dice en texto. */
export function PuntoLugar({ relleno, anillo, tamano = 8, className, style, ...resto }: PuntoLugarProps) {
    return (
        <span
            aria-hidden="true"
            {...resto}
            className={cn('inline-block shrink-0 rounded-full', className)}
            style={{
                width: tamano,
                height: tamano,
                backgroundColor: relleno,
                boxShadow: `inset 0 0 0 ${Math.max(1.25, tamano / 10)}px ${anillo}`,
                ...style,
            }}
        />
    );
}

/** Punto de una socia de la plataforma: su color con su anillo, nunca uno sin el otro. */
export function ChannelDot({ canal, tamano = 8, className }: { canal: CanalClave; tamano?: number; className?: string }) {
    const c = CANALES[canal];
    return <PuntoLugar relleno={c.punto} anillo={c.anillo} tamano={tamano} className={className} />;
}
```

- [ ] **Step 4: `TarjetaClase`**

Crear `frontend/src/pages/admin/classes/calendario/TarjetaClase.tsx`:

```tsx
import type { ButtonHTMLAttributes, CSSProperties } from 'react';
import { Lock } from 'lucide-react';
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
}

const claveDeLugar = (l: Lugar) => (l.tipo === 'canal' ? l.canal : l.tipo);

/**
 * Tarjeta de una clase: nombre con intensidad, hora, coach y los lugares como puntos
 * (alumnas de Casa Shé con el color del tipo, cada plataforma con el suyo, libres huecos).
 * Los props de botón pasan tal cual, para que la Entrega 3 agregue selección sin reescribirla.
 */
export function TarjetaClase({ clase, variante, completa = true, className, style, ...boton }: TarjetaClaseProps) {
    const lugares = lugaresDeClase(clase);
    const cancelada = clase.status === 'cancelled';
    const oscura = clase.category === 'reformer';
    const enLista = variante === 'lista';
    const unaLinea = !enLista && !completa;
    const coach = clase.instructor_name?.trim() || '';
    const hora = formatClassTime(clase.start_time);
    const colorAlumna = oscura ? SALSA.alumna : colorPuntoAlumna(clase.class_type_color);
    const fondo = oscura ? 'oscuro' : 'claro';
    const tamanoPunto = enLista ? 10 : 8;
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
        <span className={cn('ml-auto shrink-0 tabular-nums', enLista ? 'text-sm' : 'text-[11px]', lugares.lleno ? 'font-bold' : 'font-medium')}>
            {etiquetaCupo(lugares)}
        </span>
    );

    return (
        <button
            type="button"
            {...boton}
            aria-label={aria}
            data-clase={clase.id}
            data-oscura={oscura ? 'true' : undefined}
            className={cn(
                'flex w-full min-w-0 flex-col overflow-hidden rounded-[10px] border text-left font-body transition-shadow duration-150',
                'hover:shadow-[0_10px_24px_-16px_rgba(22,38,26,.55)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-casa-verde focus-visible:ring-offset-1',
                enLista ? 'gap-2 p-4' : unaLinea ? 'justify-center px-2 py-0.5' : 'justify-between gap-px px-2 py-1.5',
                oscura ? 'text-casa-avena' : 'text-casa-ciruela',
                cancelada && 'opacity-50',
                className,
            )}
            style={marco}
        >
            <span className="flex w-full min-w-0 items-baseline gap-1.5">
                <span
                    data-nombre-clase
                    className={cn('flex min-w-0 items-center gap-1 font-heading leading-tight', enLista ? 'text-lg' : 'text-[15px]', cancelada && 'line-through')}
                >
                    <span className="truncate">{clase.class_type_name}</span>
                    <ClassIntensity intensity={clase.intensity} />
                    {clase.booking_closed && !cancelada && <Lock className="h-3 w-3 shrink-0 opacity-70" aria-hidden="true" />}
                </span>
                <span className={cn('shrink-0 tabular-nums opacity-75', enLista ? 'text-sm' : 'text-[11px]')}>{hora}</span>
                {unaLinea && !cancelada && cupo}
            </span>

            {!unaLinea && (
                <span
                    className={cn('w-full truncate', enLista ? 'text-sm' : 'text-[11.5px] leading-4', !coach && 'font-semibold')}
                    style={coach ? undefined : { color: colorSinCoach }}
                >
                    {coach || 'Sin coach asignada'}
                </span>
            )}

            {!unaLinea && (cancelada ? (
                <span className="text-[11px] font-semibold">Cancelada</span>
            ) : (
                <span className="flex w-full min-w-0 items-center gap-[3px]">
                    {lugares.lugares.length <= MAX_PUNTOS_TARJETA ? (
                        lugares.lugares.map((l, i) => {
                            const e = estiloDeLugar(l, colorAlumna, fondo);
                            return <PuntoLugar key={i} relleno={e.relleno} anillo={e.anillo} tamano={tamanoPunto} data-lugar={claveDeLugar(l)} />;
                        })
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

- [ ] **Step 5: `VistaDiaMovil`**

Es la tira de días y la lista del día del original (L1040-1125) con la tarjeta nueva y `data-dia` en cada día. Crear `frontend/src/pages/admin/classes/calendario/VistaDiaMovil.tsx`:

```tsx
import { format, isSameDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Class } from '@/types/class';
import { DAYS } from './formato';
import { TarjetaClase } from './TarjetaClase';

interface VistaDiaMovilProps {
    dias: Date[];
    diaSeleccionado: Date;
    onSeleccionarDia: (dia: Date) => void;
    clasesDelDia: (dia: Date) => Class[];
    diasCerrados: Set<string>;
    motivoCierre: (dia: Date) => string | undefined;
    onClickClase: (clase: Class) => void;
    onNuevaClase: (dia: Date) => void;
}

/** Debajo de lg: la tira de días de la semana y la lista del día elegido. */
export function VistaDiaMovil({
    dias, diaSeleccionado, onSeleccionarDia, clasesDelDia, diasCerrados, motivoCierre, onClickClase, onNuevaClase,
}: VistaDiaMovilProps) {
    const clasesDia = clasesDelDia(diaSeleccionado)
        .slice()
        .sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));
    const cerrado = diasCerrados.has(format(diaSeleccionado, 'yyyy-MM-dd'));
    const motivo = motivoCierre(diaSeleccionado);

    return (
        <div className="space-y-4 lg:hidden">
            <div className="grid grid-cols-7 border-y border-balance-sand/70 py-2" aria-label="Días de la semana">
                {dias.map((day, i) => {
                    const clave = format(day, 'yyyy-MM-dd');
                    const selected = isSameDay(day, diaSeleccionado);
                    const today = isSameDay(day, new Date());
                    const isClosed = diasCerrados.has(clave);
                    const dayClasses = clasesDelDia(day);
                    return (
                        <button
                            key={clave}
                            type="button"
                            data-dia={clave}
                            onClick={() => onSeleccionarDia(day)}
                            aria-pressed={selected}
                            className={cn(
                                'relative min-w-0 px-0.5 py-2 text-center transition-[color,transform] active:scale-[0.96]',
                                selected
                                    ? 'text-balance-dark after:absolute after:inset-x-1 after:bottom-0 after:h-[2px] after:bg-balance-olive'
                                    : today
                                        ? 'text-balance-dark'
                                        : 'text-balance-dark/55',
                                isClosed && !selected && 'text-destructive'
                            )}
                        >
                            <span className="block text-[9px] font-semibold uppercase tracking-[0.08em] opacity-65">{DAYS[i].slice(0, 2)}</span>
                            <span className={cn(
                                'mx-auto mt-1 flex h-8 w-8 items-center justify-center rounded-full text-lg font-semibold tabular-nums',
                                selected && 'bg-balance-olive text-balance-cream',
                                today && !selected && 'border border-balance-olive/55'
                            )}>{format(day, 'd')}</span>
                            <span className="mt-1 block text-[8px] font-semibold opacity-55">{dayClasses.length}</span>
                        </button>
                    );
                })}
            </div>

            <section className="overflow-hidden rounded-[1.35rem] border border-balance-sand/65 bg-[hsl(var(--admin-panel))] shadow-[0_22px_70px_-58px_rgba(51,42,34,.72)]">
                <header className="flex items-end justify-between gap-4 border-b border-balance-sand/60 bg-balance-cream/48 px-4 py-4">
                    <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-balance-dark/70">
                            {format(diaSeleccionado, 'EEEE', { locale: es })}
                        </p>
                        <h2 className="mt-1 text-2xl font-semibold capitalize tracking-[-0.035em] text-balance-dark">
                            {format(diaSeleccionado, 'd MMMM', { locale: es })}
                        </h2>
                    </div>
                    <Badge variant="outline" className="rounded-full border-balance-sand/70 bg-balance-cream/75 text-balance-dark/75">
                        {clasesDia.length} {clasesDia.length === 1 ? 'clase' : 'clases'}
                    </Badge>
                </header>

                {cerrado && (
                    <div className="m-4 rounded-[1rem] border border-destructive/20 bg-destructive/8 px-4 py-3 text-sm font-medium text-destructive">
                        {motivo || 'Studio cerrado'}
                    </div>
                )}

                {clasesDia.length > 0 ? (
                    <div className="space-y-3 p-3">
                        {clasesDia.map((item) => (
                            <TarjetaClase key={item.id} clase={item} variante="lista" onClick={() => onClickClase(item)} />
                        ))}
                        {!cerrado && (
                            <Button
                                variant="ghost"
                                className="h-11 w-full rounded-full border border-dashed border-balance-sand/70 text-balance-dark/75"
                                onClick={() => onNuevaClase(diaSeleccionado)}
                            >
                                <Plus className="mr-2 h-4 w-4" /> Agregar otra clase
                            </Button>
                        )}
                    </div>
                ) : !cerrado ? (
                    <button
                        type="button"
                        onClick={() => onNuevaClase(diaSeleccionado)}
                        className="flex min-h-[13rem] w-full flex-col items-center justify-center px-6 text-center text-balance-dark/48 transition-colors hover:bg-balance-olive/6 hover:text-balance-olive"
                    >
                        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-balance-olive/8 text-balance-olive">
                            <Plus className="h-5 w-5" />
                        </span>
                        <span className="mt-4 text-sm font-semibold">Agregar la primera clase</span>
                        <span className="mt-1 text-xs">No hay sesiones programadas para este día.</span>
                    </button>
                ) : null}
            </section>
        </div>
    );
}
```

- [ ] **Step 6: El padre usa la tarjeta y la vista móvil**

```bash
cd "/Users/saidromero/Desktop/Casa She/casa-she-entrega-2"
set -e
H="${TMPDIR:-/tmp}/reemplazar-bloque.mjs"
F=frontend/src/pages/admin/classes/ClassesCalendar.tsx
M="${TMPDIR:-/tmp}/movil-jsx.txt"
cat > "$M" <<'TSX'
                    <VistaDiaMovil
                        dias={weekDays}
                        diaSeleccionado={mobileSelectedDay}
                        onSeleccionarDia={setMobileSelectedDay}
                        clasesDelDia={getClassesForDay}
                        diasCerrados={closedDaySet}
                        motivoCierre={getClosedReason}
                        onClickClase={handleClassClick}
                        onNuevaClase={handleDayClick}
                    />
TSX
node "$H" "$F" '<div className="space-y-4 lg:hidden">' '                    </div>' 86 "$M"
node "$H" "$F" 'function ClassEventCard(' '}' 99
```

(Si `reemplazar-bloque.mjs` no existe, crearlo como en la Task 5, Step 1.) Expected: `✓ Reemplazadas 86 líneas` y `✓ Cortadas 99 líneas`.

Luego, en `ClassesCalendar.tsx`:

a) Cambiar la tarjeta de las columnas de escritorio:

```tsx
                                                        <ClassEventCard key={c.id} item={c} onClick={() => handleClassClick(c)} />
```

por:

```tsx
                                                        <TarjetaClase key={c.id} clase={c} variante="rejilla" onClick={() => handleClassClick(c)} />
```

b) Después de

```tsx
import { PanelClase } from './calendario/PanelClase';
```

agregar:

```tsx
import { TarjetaClase } from './calendario/TarjetaClase';
import { VistaDiaMovil } from './calendario/VistaDiaMovil';
```

- [ ] **Step 7: Verificar**

Run:

```bash
cd frontend && npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -E "error TS" | grep -vE "FilterPills.tsx\(124|push.ts\(47|Events.tsx\((259|906)"
git grep -nE "ClassEventCard|TP \{" -- src/pages/admin/classes
./scripts/e2e-local.sh e2e/tests/admin-classes.spec.ts --project=chromium -g "semana por horas"
```

Expected: typecheck sin salida; el `git grep` no encuentra nada; Playwright `2 passed` (humo + móvil).

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/brands/ChannelDot.tsx frontend/src/pages/admin/classes/calendario/TarjetaClase.tsx frontend/src/pages/admin/classes/calendario/VistaDiaMovil.tsx frontend/src/pages/admin/classes/ClassesCalendar.tsx frontend/e2e/tests/admin-classes.spec.ts
git commit -m "feat(calendario): tarjeta de clase con los lugares por plataforma

Cada lugar es un punto: alumnas de Casa Shé con el color del tipo,
socias de cada plataforma con su color y anillo, libres huecos; n/7 o
Lleno. Coach faltante en rojo, Salsa en tarjeta oscura, canceladas
atenuadas y tachadas. Reemplaza la pastilla TP n.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Semana por horas en escritorio

**Tipo:** código completo, se transcribe. `ClassesCalendar.tsx` se reescribe entero (queda como orquestador): barra compacta del mockup (título de la semana, Hoy, Generar, Copiar semana, Gratis, Nueva clase, Invitadas), filtros, leyenda con resumen y la rejilla. Sale la cabecera con foto ("Operación semanal") y "Limpiar semana".

**Files:**
- Create: `frontend/src/pages/admin/classes/calendario/EncabezadoDia.tsx`, `RejillaSemana.tsx`, `LeyendaLugares.tsx`
- Modify (reescritura completa): `frontend/src/pages/admin/classes/ClassesCalendar.tsx`
- Modify: `frontend/src/pages/admin/classes/calendario/useSemanaClases.ts` (quita lo que ya no se usa)
- Test: `frontend/e2e/tests/admin-classes.spec.ts` (casos "semana por horas…" y "dos clases a la misma hora…")

**Interfaces:**
- Consumes: todo lo de `rejilla.ts` y `lugares.ts` (Task 2); `TarjetaClase`, `VistaDiaMovil`, `PuntoLugar`, `ChannelDot` (Task 6); `PanelClase` con sus props de la Task 5; los 7 diálogos (Task 4); `useSemanaClases` (Task 3); `ChannelLogo`, `canalesConectados` (Entrega 1).
- Produces:
  - `EncabezadoDia({ fecha: Date; etiqueta: string; esHoy: boolean; cerrado: boolean; motivoCierre?: string; resumen: string; onClick: () => void })` con `data-testid="encabezado-YYYY-MM-DD"`.
  - `RejillaSemana({ dias: Date[]; clasesDelDia: (dia: Date) => Class[]; diasCerrados: Set<string>; motivoCierre: (dia: Date) => string | undefined; onClickClase: (c: Class) => void; onClickDia: (dia: Date) => void })` con `data-testid` `franja-compactada`, `columna-YYYY-MM-DD` y `linea-ahora`.
  - `LeyendaLugares()` (`<ul aria-label="Leyenda de lugares">`).
  - En la página: `data-testid="resumen-semana"` con "n clases · m lugares libres · k socias".
  - `useSemanaClases()` deja de devolver `activeClasses`, `totalBookings`, `openSpots`, `weekRange`, `occupancy`, `mobileDayClasses`, `mobileDayClosed`, `mobileClosedReason`.

- [ ] **Step 1: Escribir las pruebas que fallan**

En `frontend/e2e/tests/admin-classes.spec.ts`:

a) Cambiar

```ts
import { AHORA_PRUEBA, FECHA_PRUEBA, mockSemanaCalendario } from "../fixtures/calendario";
```

por

```ts
import { AHORA_PRUEBA, FECHA_PRUEBA, ID, clasePrueba, mockSemanaCalendario } from "../fixtures/calendario";
```

b) Después de `import { test, expect } from "../fixtures/auth";` agregar:

```ts
import type { Locator } from "@playwright/test";
```

c) Justo antes de `test.describe("Calendario de recepción – semana por horas", () => {` agregar:

```ts
/** Borde superior en px; NaN si todavía no se ve (expect.poll vuelve a intentar). */
const arriba = async (l: Locator) => (await l.boundingBox())?.y ?? Number.NaN;
```

d) Dentro de ese `describe`, antes de su `});` final, agregar:

```ts
  test("semana por horas: compacta las horas vacías, posiciona por hora y pinta los lugares por canal", async ({ adminPage: page }) => {
    await page.clock.setFixedTime(AHORA_PRUEBA);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await mockSemanaCalendario(page);
    await page.goto(`/admin/calendar?date=${FECHA_PRUEBA}`);

    const tarjeta = (nombre: RegExp) => page.getByRole("button", { name: nombre });
    const barre = tarjeta(/^Barre.*07:00/);
    const mat = tarjeta(/^Pilates Mat.*08:00/);
    const salsa = tarjeta(/^Salsa.*10:00/);
    const sculpt = tarjeta(/^Sculpt.*18:00/);
    const cancelada = tarjeta(/^Sculpt.*19:00/);
    await expect(barre).toBeVisible();

    // De 11 a 18 no hay clases en toda la semana: se ve como una franja de 32 px.
    await expect(page.getByTestId("franja-compactada")).toHaveText("11 – 18");
    // expect.poll: al cargar, la página vuelve a pedir las clases cuando fija la sucursal
    // y la rejilla se redibuja; se mide cuando ya está quieta.
    await expect.poll(async () => Math.abs((await arriba(mat)) - (await arriba(barre)) - 76)).toBeLessThanOrEqual(1);
    // Salsa 10:00 (sábado) y Sculpt 18:00 (miércoles): 1 h (76 px) + franja (32 px).
    await expect.poll(async () => Math.abs((await arriba(sculpt)) - (await arriba(salsa)) - 108)).toBeLessThanOrEqual(1);

    await expect(barre.locator('[data-lugar="alumna"]')).toHaveCount(2);
    await expect(barre.locator('[data-lugar="totalpass"]')).toHaveCount(1);
    await expect(barre.locator('[data-lugar="libre"]')).toHaveCount(4);
    await expect(barre).toContainText("3/7");
    await expect(barre).not.toContainText("TP");
    await expect(mat).toContainText("Lleno");
    await expect(sculpt).toContainText("Sin coach asignada");
    await expect(cancelada).toContainText("Cancelada");
    await expect(cancelada.locator("[data-nombre-clase]")).toHaveClass(/line-through/);
    await expect(salsa).toHaveAttribute("data-oscura", "true");

    await expect(page.getByTestId("encabezado-2026-11-02")).toContainText("2 clases · 4 libres");
    await expect(page.getByTestId("encabezado-2026-11-03")).toContainText("Sin clases");
    await expect(page.getByTestId("encabezado-2026-11-04")).toContainText("Hoy");
    await expect(page.getByTestId("encabezado-2026-11-04")).toContainText("1 clase · 6 libres");
    await expect(page.getByTestId("resumen-semana")).toHaveText("4 clases · 11 lugares libres · 3 socias");
    await expect(page.getByRole("list", { name: "Leyenda de lugares" }).getByRole("img", { name: "TotalPass" })).toBeVisible();

    // "Ahora" = miércoles 08:25 en CDMX → 85 min después de las 7:00 = 108 px.
    const columna = page.getByTestId("columna-2026-11-04");
    const linea = columna.getByTestId("linea-ahora");
    await expect.poll(async () => Math.abs((await arriba(linea)) - (await arriba(columna)) - 108)).toBeLessThanOrEqual(2);

    await expect(page.getByRole("button", { name: /Limpiar semana/ })).toHaveCount(0);
  });

  test("dos clases a la misma hora se ven lado a lado", async ({ adminPage: page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await mockSemanaCalendario(page, [
      clasePrueba({ id: ID.sculptCancelada, date: "2026-11-04", start_time: "19:00", end_time: "19:50", class_type_name: "Sculpt", status: "cancelled" }),
      clasePrueba({ id: ID.sculpt, date: "2026-11-04", start_time: "19:00", end_time: "19:50", class_type_name: "Flex", class_type_color: "#3F5C59" }),
    ]);
    await page.goto(`/admin/calendar?date=${FECHA_PRUEBA}`);

    const sculpt = page.getByRole("button", { name: /^Sculpt.*19:00/ });
    const flex = page.getByRole("button", { name: /^Flex.*19:00/ });
    await expect.poll(async () => {
      const a = await sculpt.boundingBox();
      const b = await flex.boundingBox();
      if (!a || !b) return "sin dibujar";
      const [izquierda, derecha] = [a, b].sort((p, q) => p.x - q.x);
      const ladoALado = Math.abs(a.y - b.y) <= 1 && izquierda.x + izquierda.width <= derecha.x + 1 && izquierda.width > 40;
      return ladoALado ? "lado a lado" : `encimadas: ${JSON.stringify([a, b])}`;
    }).toBe("lado a lado");
  });
```

- [ ] **Step 2: Correrlas y ver que fallan**

Run: `cd frontend && ./scripts/e2e-local.sh e2e/tests/admin-classes.spec.ts --project=chromium -g "semana por horas: compacta|misma hora"`
Expected: 2 FAIL (no hay `franja-compactada` ni columnas por hora).

- [ ] **Step 3: `EncabezadoDia`**

Crear `frontend/src/pages/admin/classes/calendario/EncabezadoDia.tsx`:

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
    onClick: () => void;
}

/** Encabezado de una columna de la semana. Clic: nueva clase ese día (la Entrega 3 lo usará para seleccionar el día). */
export function EncabezadoDia({ fecha, etiqueta, esHoy, cerrado, motivoCierre, resumen, onClick }: EncabezadoDiaProps) {
    const clave = format(fecha, 'yyyy-MM-dd');
    return (
        <button
            type="button"
            onClick={onClick}
            data-testid={`encabezado-${clave}`}
            title={`Agregar una clase el ${format(fecha, "EEEE d 'de' MMMM", { locale: es })}`}
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

- [ ] **Step 4: `LeyendaLugares`**

Crear `frontend/src/pages/admin/classes/calendario/LeyendaLugares.tsx`:

```tsx
import { ChannelLogo } from '@/components/brands/ChannelLogo';
import { ChannelDot, PuntoLugar } from '@/components/brands/ChannelDot';
import { canalesConectados } from '@/lib/canales';
import { COLOR_ALUMNA_POR_DEFECTO } from './colores';
import { ANILLO_LIBRE_CLARO } from './lugares';

/** Qué es cada punto: alumna de Casa Shé, socia de cada plataforma conectada (con su logo) y lugar libre. */
export function LeyendaLugares() {
    return (
        <ul aria-label="Leyenda de lugares" className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <li className="flex items-center gap-1.5">
                <PuntoLugar relleno={COLOR_ALUMNA_POR_DEFECTO} anillo={COLOR_ALUMNA_POR_DEFECTO} tamano={10} />
                Alumna
            </li>
            {canalesConectados().map((c) => (
                <li key={c.clave} className="flex items-center gap-1.5">
                    <ChannelDot canal={c.clave} tamano={10} />
                    Socia <ChannelLogo canal={c.clave} alto={10} />
                </li>
            ))}
            <li className="flex items-center gap-1.5">
                <PuntoLugar relleno="transparent" anillo={ANILLO_LIBRE_CLARO} tamano={10} />
                Libre
            </li>
        </ul>
    );
}
```

- [ ] **Step 5: `RejillaSemana`**

Crear `frontend/src/pages/admin/classes/calendario/RejillaSemana.tsx`:

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
export function RejillaSemana({ dias, clasesDelDia, diasCerrados, motivoCierre, onClickClase, onClickDia }: RejillaSemanaProps) {
    const ahora = useAhoraCdmx();
    const columnas = dias.map((dia) => ({ dia, clave: format(dia, 'yyyy-MM-dd'), clases: clasesDelDia(dia) }));
    const rejilla = construirRejilla(columnas.flatMap((c) => c.clases));
    const linea = lineaAhora(rejilla, columnas.map((c) => c.clave), ahora);

    return (
        <div className="overflow-x-auto rounded-[18px] border border-casa-arena bg-[hsl(var(--admin-panel))]">
            <div className="flex min-w-[1040px]">
                <div className="w-[60px] flex-none border-r border-casa-arena/60">
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
                                onClick={() => onClickDia(dia)}
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
                                    return (
                                        <TarjetaClase
                                            key={c.id}
                                            clase={c}
                                            variante="rejilla"
                                            completa={pos.completa}
                                            onClick={() => onClickClase(c)}
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

- [ ] **Step 6: Reescribir `ClassesCalendar.tsx`**

Reemplazar TODO el contenido de `frontend/src/pages/admin/classes/ClassesCalendar.tsx` por:

```tsx
import { useState } from 'react';
import { ChevronLeft, ChevronRight, Copy as CopyIcon, Loader2, Plus, RefreshCw, Repeat, Sparkles, Users } from 'lucide-react';
import type { Class } from '@/types/class';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { CompanionReview } from '@/components/bookings/CompanionPanel';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuthStore } from '@/stores/authStore';
import { cn } from '@/lib/utils';
import { useSemanaClases } from './calendario/useSemanaClases';
import { RejillaSemana } from './calendario/RejillaSemana';
import { VistaDiaMovil } from './calendario/VistaDiaMovil';
import { LeyendaLugares } from './calendario/LeyendaLugares';
import { PanelClase } from './calendario/PanelClase';
import { DialogoGenerar } from './calendario/DialogoGenerar';
import { DialogoNuevaClase } from './calendario/DialogoNuevaClase';
import { DialogoEditarClase } from './calendario/DialogoEditarClase';
import { DialogoCopiarSemana } from './calendario/DialogoCopiarSemana';
import { DialogoGratis } from './calendario/DialogoGratis';
import { DialogoCancelarClase } from './calendario/DialogoCancelarClase';
import { DialogoCambiarCoach } from './calendario/DialogoCambiarCoach';
import { resumenDeClases, textoResumenSemana } from './calendario/lugares';
import { tituloSemana } from './calendario/rejilla';

interface ClassesCalendarProps {
    initialGenerateOpen?: boolean;
    /** Embebido en otro shell (recepción): no envuelve AuthGuard/AdminLayout. */
    embedded?: boolean;
}

/** Programa = bolsa de créditos: Salsa (categoría 'reformer') o Clases ('multi'). */
const PROGRAMAS = [
    { valor: 'all', etiqueta: 'Todo' },
    { valor: 'multi', etiqueta: 'Clases' },
    { valor: 'reformer', etiqueta: 'Salsa' },
];

const BOTON_BARRA = 'h-11 rounded-xl border-casa-arena bg-[hsl(var(--admin-panel))] font-medium text-casa-ciruela';

export default function ClassesCalendar({ initialGenerateOpen = false, embedded = false }: ClassesCalendarProps) {
    const [companionReviewOpen, setCompanionReviewOpen] = useState(false);
    const [isGenerateOpen, setIsGenerateOpen] = useState(initialGenerateOpen);
    const [isBulkFreeOpen, setIsBulkFreeOpen] = useState(false);
    // Copiar semana: nunca se escribe sin haber mostrado antes la vista previa.
    const [isCopyWeekOpen, setIsCopyWeekOpen] = useState(false);
    // Cada apertura vuelve a montar el diálogo (key): arranca sin vista previa ni opción elegida.
    const [claveCopia, setClaveCopia] = useState(0);
    const [isClassOpen, setIsClassOpen] = useState(false);
    const [nuevaClase, setNuevaClase] = useState<{ dia: Date; clave: number }>({ dia: new Date(), clave: 0 });
    const [cancelChoiceOpen, setCancelChoiceOpen] = useState(false);
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [claveEdicion, setClaveEdicion] = useState(0);
    // "Cambiar coach": diálogo enfocado para reasignar el instructor con alcance (este día / serie / fechas).
    const [isChangeCoachOpen, setIsChangeCoachOpen] = useState(false);
    const [claveCoach, setClaveCoach] = useState(0);
    const [isAttendeesOpen, setIsAttendeesOpen] = useState(false);
    const [selectedClass, setSelectedClass] = useState<Class | null>(null);
    // "Gratis" en bloque solo admin estricto; la recepción master (elevated) ve el resto pero no esto.
    const user = useAuthStore((s) => s.user);
    const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
    const veInvitadas = ['admin', 'super_admin', 'reception'].includes(user?.role || '');

    const {
        setCurrentDate, weekStart, mobileSelectedDay, setMobileSelectedDay,
        classTypeFilter, setClassTypeFilter, programFilter, setProgramFilter, instructorFilter, setInstructorFilter,
        classTypes, instructors, facilities,
        classesLoading, classesError, refetchClasses,
        closedDaySet, getClosedReason, getClassesForDay, weekDays,
        handlePrevWeek, handleNextWeek, handleToday,
    } = useSemanaClases();

    const resumenSemana = textoResumenSemana(resumenDeClases(weekDays.flatMap((dia) => getClassesForDay(dia))));

    const handleDayClick = (day: Date) => {
        // Clave nueva = el diálogo se vuelve a montar con la fecha de ese día.
        setNuevaClase((prev) => ({ dia: day, clave: prev.clave + 1 }));
        setIsClassOpen(true);
    };

    const handleClassClick = (c: Class) => {
        setSelectedClass(c);
        setIsAttendeesOpen(true);
    };

    const handleEditClass = () => {
        if (!selectedClass) return;
        setClaveEdicion((k) => k + 1);
        setIsEditOpen(true);
    };

    const handleChangeCoach = () => {
        if (!selectedClass) return;
        setClaveCoach((k) => k + 1);
        setIsChangeCoachOpen(true);
    };

    const cerrarPanel = () => {
        setIsAttendeesOpen(false);
        setSelectedClass(null);
    };

    const content = (
        <div className="space-y-4 font-body">
            <header className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-2.5">
                    <div className="flex gap-1">
                        <Button variant="outline" size="icon" className={cn(BOTON_BARRA, 'w-11')} onClick={handlePrevWeek} aria-label="Semana anterior">
                            <ChevronLeft className="h-[18px] w-[18px]" />
                        </Button>
                        <Button variant="outline" size="icon" className={cn(BOTON_BARRA, 'w-11')} onClick={handleNextWeek} aria-label="Semana siguiente">
                            <ChevronRight className="h-[18px] w-[18px]" />
                        </Button>
                    </div>
                    <Button variant="outline" className={cn(BOTON_BARRA, 'px-4')} onClick={handleToday}>
                        Hoy
                    </Button>
                    <h1 className="ml-1 font-heading text-3xl leading-none text-casa-profundo sm:text-4xl">{tituloSemana(weekStart)}</h1>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    {veInvitadas && (
                        <Button variant="ghost" className="h-11 rounded-xl text-casa-ciruela" onClick={() => setCompanionReviewOpen(true)}>
                            <Users className="mr-2 h-4 w-4" /> Invitadas: revisión de recepción
                        </Button>
                    )}
                    <Button variant="outline" className={BOTON_BARRA} onClick={() => setIsGenerateOpen(true)}>
                        <Repeat className="mr-2 h-4 w-4" /> Generar
                    </Button>
                    <Button
                        variant="outline"
                        className={BOTON_BARRA}
                        onClick={() => {
                            // La vista previa se pide dentro del diálogo y no en onOpenChange: Radix
                            // no dispara onOpenChange cuando el diálogo se abre por estado del padre.
                            setClaveCopia((k) => k + 1);
                            setIsCopyWeekOpen(true);
                        }}
                        title="Copiar esta semana a la siguiente"
                    >
                        <CopyIcon className="mr-2 h-4 w-4" /> Copiar semana
                    </Button>
                    {isAdmin && (
                        <Button variant="outline" className={BOTON_BARRA} onClick={() => setIsBulkFreeOpen(true)}>
                            <Sparkles className="mr-2 h-4 w-4" /> Gratis
                        </Button>
                    )}
                    <Button
                        className="h-11 rounded-xl bg-casa-verde px-[18px] font-semibold text-casa-avena hover:bg-casa-profundo"
                        onClick={() => handleDayClick(mobileSelectedDay)}
                    >
                        <Plus className="mr-2 h-4 w-4" /> Nueva clase
                    </Button>
                </div>
            </header>

            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2.5">
                    <div role="group" aria-label="Programa" className="flex rounded-full bg-casa-arena/40 p-[3px]">
                        {PROGRAMAS.map((p) => (
                            <button
                                key={p.valor}
                                type="button"
                                aria-pressed={programFilter === p.valor}
                                onClick={() => setProgramFilter(p.valor)}
                                className={cn(
                                    'rounded-full px-4 py-2 text-sm text-casa-ciruela transition-colors',
                                    programFilter === p.valor
                                        ? 'bg-[hsl(var(--admin-panel))] font-semibold shadow-[0_1px_2px_rgba(42,33,24,.14)]'
                                        : 'font-medium text-casa-ciruela/70 hover:text-casa-ciruela',
                                )}
                            >
                                {p.etiqueta}
                            </button>
                        ))}
                    </div>
                    {classTypes && classTypes.length > 0 && (
                        <Select value={classTypeFilter} onValueChange={setClassTypeFilter}>
                            <SelectTrigger aria-label="Filtrar por clase" className="h-10 w-[170px] rounded-xl border-casa-arena bg-[hsl(var(--admin-panel))]">
                                <SelectValue placeholder="Clase" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Todas las clases</SelectItem>
                                {classTypes.map((ct) => (
                                    <SelectItem key={ct.id} value={ct.id}>
                                        <span className="flex items-center gap-2">
                                            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: ct.color || '#7E8579' }} />
                                            {ct.name}
                                        </span>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    )}
                    {instructors && instructors.length > 0 && (
                        <Select value={instructorFilter} onValueChange={setInstructorFilter}>
                            <SelectTrigger aria-label="Filtrar por coach" className="h-10 w-[170px] rounded-xl border-casa-arena bg-[hsl(var(--admin-panel))]">
                                <SelectValue placeholder="Coach" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Todos los coaches</SelectItem>
                                {instructors.map((inst) => (
                                    <SelectItem key={inst.id} value={inst.id}>{inst.display_name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    )}
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-casa-ciruela/75">
                    <LeyendaLugares />
                    {!classesLoading && !classesError && (
                        <span data-testid="resumen-semana" className="font-semibold text-casa-ciruela">{resumenSemana}</span>
                    )}
                </div>
            </div>

            {classesLoading ? (
                <div className="flex min-h-64 flex-col items-center justify-center rounded-[18px] border border-casa-arena bg-[hsl(var(--admin-panel))]" aria-live="polite">
                    <Loader2 className="h-6 w-6 animate-spin text-casa-verde" aria-hidden="true" />
                    <p className="mt-3 text-sm font-medium text-casa-ciruela/70">Cargando calendario…</p>
                </div>
            ) : classesError ? (
                <div className="flex min-h-64 flex-col items-center justify-center rounded-[18px] border border-destructive/25 bg-destructive/5 px-6 text-center" role="alert">
                    <p className="font-semibold text-casa-ciruela">No pudimos cargar las clases</p>
                    <p className="mt-1 max-w-md text-sm text-casa-ciruela/60">El calendario sigue guardado. Revisa la conexión con el servidor y vuelve a intentarlo.</p>
                    <Button variant="outline" className="mt-5" onClick={() => refetchClasses()}>
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Volver a intentar
                    </Button>
                </div>
            ) : (
                <>
                    <VistaDiaMovil
                        dias={weekDays}
                        diaSeleccionado={mobileSelectedDay}
                        onSeleccionarDia={setMobileSelectedDay}
                        clasesDelDia={getClassesForDay}
                        diasCerrados={closedDaySet}
                        motivoCierre={getClosedReason}
                        onClickClase={handleClassClick}
                        onNuevaClase={handleDayClick}
                    />
                    <div className="hidden lg:block">
                        <RejillaSemana
                            dias={weekDays}
                            clasesDelDia={getClassesForDay}
                            diasCerrados={closedDaySet}
                            motivoCierre={getClosedReason}
                            onClickClase={handleClassClick}
                            onClickDia={handleDayClick}
                        />
                    </div>
                </>
            )}

            <PanelClase
                clase={selectedClass}
                open={isAttendeesOpen}
                onOpenChange={(open) => { setIsAttendeesOpen(open); if (!open) setSelectedClass(null); }}
                onEditar={handleEditClass}
                onCancelar={() => setCancelChoiceOpen(true)}
                onClaseCambiada={setSelectedClass}
            />

            <DialogoGenerar open={isGenerateOpen} onOpenChange={setIsGenerateOpen} onGenerado={setCurrentDate} />
            <DialogoNuevaClase
                key={`nueva-${nuevaClase.clave}`}
                open={isClassOpen}
                onOpenChange={setIsClassOpen}
                dia={nuevaClase.dia}
                classTypes={classTypes}
                instructors={instructors}
                facilities={facilities}
            />
            <DialogoEditarClase
                key={`editar-${claveEdicion}`}
                open={isEditOpen}
                onOpenChange={setIsEditOpen}
                clase={selectedClass}
                classTypes={classTypes}
                instructors={instructors}
                facilities={facilities}
                onCambiarCoach={handleChangeCoach}
                onGuardada={cerrarPanel}
            />
            <DialogoCopiarSemana key={`copia-${claveCopia}`} open={isCopyWeekOpen} onOpenChange={setIsCopyWeekOpen} weekStart={weekStart} />
            <DialogoGratis open={isBulkFreeOpen} onOpenChange={setIsBulkFreeOpen} />
            <DialogoCancelarClase open={cancelChoiceOpen} onOpenChange={setCancelChoiceOpen} clase={selectedClass} onCancelada={cerrarPanel} />
            <DialogoCambiarCoach
                key={`coach-${claveCoach}`}
                open={isChangeCoachOpen}
                onOpenChange={setIsChangeCoachOpen}
                clase={selectedClass}
                instructors={instructors}
                onAplicado={() => setIsEditOpen(false)}
            />

            <Dialog open={companionReviewOpen} onOpenChange={setCompanionReviewOpen}>
                <DialogContent className="max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Invitadas por revisar</DialogTitle>
                        <DialogDescription>Seguimiento de pagos y cancelaciones.</DialogDescription>
                    </DialogHeader>
                    <CompanionReview />
                </DialogContent>
            </Dialog>
        </div>
    );

    if (embedded) return content;

    return (
        <AuthGuard requiredRoles={['admin', 'super_admin', 'instructor']} allowElevated>
            <AdminLayout>{content}</AdminLayout>
        </AuthGuard>
    );
}
```

Qué se conserva del archivo anterior, con los mismos textos: los botones "Generar", "Copiar semana" (con su `title`), "Gratis" (solo admin), "Nueva clase" (usa el día elegido), "Invitadas: revisión de recepción" (admin, super_admin, reception) y su diálogo, los filtros "Filtrar por clase" y "Filtrar por coach", los estados de carga y error con "Volver a intentar", el modo `embedded` y el `AuthGuard`. El filtro de programa pasa de `Select` a tres botones (Todo / Clases / Salsa) con los mismos valores (`all`, `multi`, `reformer`).

- [ ] **Step 7: Quitar del hook lo que ya no se usa**

En `frontend/src/pages/admin/classes/calendario/useSemanaClases.ts`:

a) Borrar la línea `import { es } from 'date-fns/locale';`.

b) Cambiar

```ts
    const weekDays = Array.from({ length: 7 }).map((_, i) => addDays(weekStart, i));
    const activeClasses = classes?.filter((c) => c.status !== 'cancelled') || [];
```

por

```ts
    const weekDays = Array.from({ length: 7 }).map((_, i) => addDays(weekStart, i));
```

c) Cambiar

```ts
    }, [bmbStudios, studioFilter]);

    const totalBookings = activeClasses.reduce((sum, c) => sum + Number(c.current_bookings || 0), 0);
    const totalCapacity = activeClasses.reduce((sum, c) => sum + Number(c.max_capacity || 0), 0);
    const openSpots = Math.max(totalCapacity - totalBookings, 0);
    const weekRange = `${format(weekStart, 'd MMM', { locale: es })} al ${format(addDays(weekStart, 6), 'd MMM yyyy', { locale: es })}`;
    const occupancy = totalCapacity > 0 ? Math.round((totalBookings / totalCapacity) * 100) : 0;
    const mobileDayClasses = getClassesForDay(mobileSelectedDay)
        .slice()
        .sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));
    const mobileDayClosed = closedDaySet.has(format(mobileSelectedDay, 'yyyy-MM-dd'));
    const mobileClosedReason = getClosedReason(mobileSelectedDay);
```

por

```ts
    }, [bmbStudios, studioFilter]);
```

d) En el `return`, cambiar

```ts
        startStr, endStr, closedDaySet, getClosedReason, getClassesForDay, weekDays, activeClasses,
        totalBookings, openSpots, weekRange, occupancy, mobileDayClasses, mobileDayClosed, mobileClosedReason,
        handlePrevWeek, handleNextWeek, handleToday,
```

por

```ts
        startStr, endStr, closedDaySet, getClosedReason, getClassesForDay, weekDays,
        handlePrevWeek, handleNextWeek, handleToday,
```

- [ ] **Step 8: Verificar**

Run:

```bash
cd frontend && npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -E "error TS" | grep -vE "FilterPills.tsx\(124|push.ts\(47|Events.tsx\((259|906)"
for t in calendario-rejilla calendario-lugares canales; do npx tsx scripts/test-$t.ts; done
git grep -nE "Limpiar semana|bulk-delete|bulkDeleteMutation|CalendarStat|Operación semanal" -- src/pages/admin/classes
./scripts/e2e-local.sh e2e/tests/admin-classes.spec.ts --project=chromium -g "semana por horas"
```

Expected: typecheck sin salida; las tres pruebas `✅ … OK`; el `git grep` no encuentra nada; Playwright `4 passed` (humo, móvil, semana por horas, misma hora).

- [ ] **Step 9: Commit**

```bash
git add frontend/src/pages/admin/classes/calendario/EncabezadoDia.tsx frontend/src/pages/admin/classes/calendario/RejillaSemana.tsx frontend/src/pages/admin/classes/calendario/LeyendaLugares.tsx frontend/src/pages/admin/classes/calendario/useSemanaClases.ts frontend/src/pages/admin/classes/ClassesCalendar.tsx frontend/e2e/tests/admin-classes.spec.ts
git commit -m "feat(calendario): semana por horas en escritorio

Columnas de lunes a domingo con eje de horas: cada clase a la altura de
su hora y del alto de lo que dura, las horas sin clases de toda la
semana compactadas en una franja, línea de ahora en hora de CDMX y
clases encimadas lado a lado. Encabezado de día con n clases · m libres,
leyenda Alumna · Socia + logo · Libre y resumen de la semana. Se quitan
la cabecera con foto y Limpiar semana.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Panel de clase reordenado y cupo por plataforma conectada

**Tipo:** código completo, se transcribe. `PanelClase.tsx` se reescribe entero con el orden del mockup "Panel de clase": encabezado (tipo, fecha, hora, coach, lugares grandes), acciones (Editar clase, Cambiar coach, Cancelar clase), **Inscribir alumna** (el mismo bloque de hoy, ahora arriba), un control de cupo por canal conectado con su logo, inscritas (check-in, invitadas, lista de espera) y al final cupo cerrado y clase gratis. El panel lee la clase vigente de la lista, así que después de cada acción muestra lo nuevo.

**Files:**
- Modify (reescritura completa): `frontend/src/pages/admin/classes/calendario/PanelClase.tsx`
- Modify: `frontend/src/pages/admin/classes/ClassesCalendar.tsx`
- Test: `frontend/e2e/tests/admin-classes.spec.ts` (caso "panel: …")

**Interfaces:**
- Consumes: `lugaresDeClase`, `estiloDeLugar`, `etiquetaCupoLarga`, `type Lugar` (Task 2); `colorPuntoAlumna` (Task 2); `PuntoLugar`, `ChannelDot` (Task 6); `CANALES`, `canalesConectados`, `esCanal`, `canalDePlan`, `type Canal`, `type CanalClave` de `@/lib/canales`.
- Produces: `PanelClase({ clase: Class | null; open: boolean; onOpenChange: (open: boolean) => void; onEditar: () => void; onCambiarCoach: () => void; onCancelar: () => void })` (sale `onClaseCambiada`, entra `onCambiarCoach`). Para pruebas: `data-testid="lugares-panel"`, `<h3>Inscribir alumna</h3>`, una `<section aria-label="Lugares para <Canal>">` por canal conectado con `data-testid="cupo-<clave>"` y botones `aria-label` "Un lugar menos" / "Un lugar más".
- Cupo por canal: `PUT /api/classes/:id/channels` con `{ [clave]: lugares }` (hoy solo TotalPass está conectado y el backend solo acepta `totalpass`). "−" deshabilitado si `max <= socias inscritas` del canal; "+" si `max >= capacidad`.

- [ ] **Step 1: Escribir la prueba que falla**

Dentro del `test.describe("Calendario de recepción – semana por horas", …)` de `frontend/e2e/tests/admin-classes.spec.ts`, antes de su `});` final, agregar:

```ts
  test("panel: lugares grandes, acciones, inscribir arriba y cupo por canal conectado", async ({ adminPage: page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await mockSemanaCalendario(page);
    const cupos: unknown[] = [];
    await page.route(/\/api\/classes\/[^/?]+\/channels$/, async (route) => {
      cupos.push(route.request().postDataJSON());
      await route.fulfill({ json: { ok: true } });
    });
    await page.goto(`/admin/calendar?date=${FECHA_PRUEBA}`);

    await page.getByRole("button", { name: /^Barre.*07:00/ }).click();
    const panel = page.getByRole("dialog");
    const lugares = panel.getByTestId("lugares-panel");
    await expect(lugares.locator('[data-lugar="alumna"]')).toHaveCount(2);
    await expect(lugares.locator('[data-lugar="totalpass"]')).toHaveCount(1);
    await expect(lugares).toContainText("3 de 7 · 4 libres");
    for (const boton of ["Editar clase", "Cambiar coach", "Cancelar clase"]) {
      await expect(panel.getByRole("button", { name: boton })).toBeVisible();
    }

    const inscribir = panel.getByRole("heading", { name: "Inscribir alumna" });
    const cupo = panel.getByRole("region", { name: "Lugares para TotalPass" });
    await expect.poll(async () => (await arriba(inscribir)) < (await arriba(cupo))).toBe(true);
    await expect(cupo.getByTestId("cupo-totalpass")).toHaveText("2");
    await cupo.getByRole("button", { name: "Un lugar menos" }).click();
    await expect.poll(() => cupos).toEqual([{ totalpass: 1 }]);

    await panel.getByRole("button", { name: "Cambiar coach" }).click();
    const coach = page.getByRole("heading", { name: "Cambiar coach" });
    await expect(coach).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(coach).toBeHidden();
    // Con un aviso en pantalla, Escape cierra el aviso y no el panel: se cierra con su botón.
    await panel.getByRole("button", { name: "Close" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // Pilates Mat: 2 socias ya inscritas con cupo 2 → no se puede bajar.
    await page.getByRole("button", { name: /^Pilates Mat.*08:00/ }).click();
    await expect(
      page.getByRole("dialog").getByRole("region", { name: "Lugares para TotalPass" }).getByRole("button", { name: "Un lugar menos" }),
    ).toBeDisabled();
  });
```

- [ ] **Step 2: Correrla y ver que falla**

Run: `cd frontend && ./scripts/e2e-local.sh e2e/tests/admin-classes.spec.ts --project=chromium -g "panel:"`
Expected: FAIL (no existe `lugares-panel`).

- [ ] **Step 3: Reescribir `PanelClase.tsx`**

Reemplazar TODO el contenido de `frontend/src/pages/admin/classes/calendario/PanelClase.tsx` por:

```tsx
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import {
    Loader2, Calendar as CalendarIcon, Plus, Minus, Users, UserRound, Trash2, Check, Edit, Phone, MessageCircle, Clock, MapPin, X, RotateCcw, Lock, Unlock,
} from 'lucide-react';
import api, { getErrorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { Class } from '@/types/class';
import { useAuthStore } from '@/stores/authStore';
import { CompanionPanel } from '@/components/bookings/CompanionPanel';
import { CancelBookingDialog } from '@/components/bookings/CancelBookingDialog';
import { ClassIntensity } from '@/components/classes/ClassIntensity';
import SellPlanDialog from '@/components/memberships/SellPlanDialog';
import { ChannelLogo } from '@/components/brands/ChannelLogo';
import { ChannelDot, PuntoLugar } from '@/components/brands/ChannelDot';
import { PlanLabel } from '@/components/brands/PlanLabel';
import { CANALES, canalDePlan, canalesConectados, esCanal, type Canal, type CanalClave } from '@/lib/canales';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useToast } from '@/components/ui/use-toast';
import type { Attendee } from './tipos';
import { attendeeBookedBy, getInitials, whatsAppDeAsistente } from './formato';
import { estiloDeLugar, etiquetaCupoLarga, lugaresDeClase, type Lugar } from './lugares';
import { colorPuntoAlumna } from './colores';

interface PanelClaseProps {
    /** La clase con sus datos vigentes: el padre la vuelve a leer de la lista al refrescar. */
    clase: Class | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onEditar: () => void;
    onCambiarCoach: () => void;
    onCancelar: () => void;
}

const claveDeLugar = (l: Lugar) => (l.tipo === 'canal' ? l.canal : l.tipo);

/**
 * Panel lateral de una clase, en el orden en que recepción lo usa: qué clase es y cómo va
 * de lugares; acciones; inscribir alumna; cupo de cada plataforma conectada; inscritas
 * (check-in, invitadas, lista de espera); cerrar cupo y clase gratis.
 */
export function PanelClase({ clase, open, onOpenChange, onEditar, onCambiarCoach, onCancelar }: PanelClaseProps) {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const user = useAuthStore((s) => s.user);
    const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
    const [companionHost, setCompanionHost] = useState<Attendee | null>(null);
    const [attendeesTab, setAttendeesTab] = useState<'reservado' | 'espera' | 'cancelado'>('reservado');
    const [userSearch, setUserSearch] = useState('');
    const [searchActive, setSearchActive] = useState(false);
    // Invitada (gratis): reserva de cortesía sin plan ni consumo de crédito.
    const [guestFree, setGuestFree] = useState(false);
    // Cliente al que se le ofrece venderle un plan (cuando reservar falló por falta de plan).
    const [sellFor, setSellFor] = useState<{ id: string; name: string } | null>(null);
    const [sellOpen, setSellOpen] = useState(false);
    // Cancelar reserva confirmada → diálogo con switch de devolución de crédito (estilo Fitune).
    const [cancelBookingId, setCancelBookingId] = useState<string | null>(null);

    const { data: attendees, isLoading: attendeesLoading, refetch: refetchAttendees } = useQuery<Attendee[]>({
        queryKey: ['attendees', clase?.id],
        queryFn: async () => (await api.get(`/bookings/class/${clase?.id}?include_cancelled=true`)).data,
        enabled: !!clase?.id && open,
    });

    const { data: userSearchResults, isFetching: userSearchLoading } = useQuery<{ users: { id: string; display_name: string; email: string; photo_url: string | null }[] }>({
        queryKey: ['user-search', userSearch],
        queryFn: async () => (await api.get(`/users?search=${encodeURIComponent(userSearch)}&limit=8`)).data,
        enabled: searchActive && userSearch.trim().length >= 2,
    });

    // El panel lee la clase de la lista de clases: esperar a que se recargue hace que los
    // puntos, el candado, la etiqueta de gratis y el cupo cambien en cuanto termina la acción.
    const refrescarClases = () => queryClient.invalidateQueries({ queryKey: ['classes'] });

    const adminBookMutation = useMutation({
        mutationFn: async ({ classId, userId, free }: { classId: string; userId: string; userName?: string; free?: boolean }) =>
            api.post('/bookings/admin-book', { classId, userId, free: free ?? false }),
        onSuccess: () => {
            refetchAttendees();
            queryClient.invalidateQueries({ queryKey: ['classes'] });
            toast({ title: 'Usuario agregado a la clase' });
            setUserSearch('');
            setSearchActive(false);
            setSellFor(null);
            setGuestFree(false);
        },
        onError: (err, vars) => {
            const msg = getErrorMessage(err);
            // Si falló por falta de plan/créditos, ofrecemos venderle un plan ahí mismo.
            if (/membres|cr[eé]dito/i.test(msg)) {
                setSellFor({ id: vars.userId, name: vars.userName ?? '' });
            }
            toast({ variant: 'destructive', title: 'Error', description: msg });
        },
    });

    const toggleFreeMutation = useMutation({
        mutationFn: async ({ id, is_free, free_label, force }: { id: string; is_free: boolean; free_label?: string; force?: boolean }) =>
            api.patch(`/classes/${id}/free`, { is_free, free_label, force }),
        onSuccess: async (_, vars) => {
            queryClient.invalidateQueries({ queryKey: ['attendees', clase?.id] });
            await refrescarClases();
            toast({ title: vars.is_free ? 'Clase marcada como gratis' : 'Clase ya no es gratis' });
        },
        onError: (err: any) => {
            const code = err?.response?.data?.code;
            if (code === 'HAS_FREE_BOOKINGS') {
                if (confirm('Esta clase ya tiene reservas como gratis. ¿Forzar el cambio? Las reservas se mantienen pero la clase deja de aceptar nuevas como gratis.')) {
                    toggleFreeMutation.mutate({ id: clase!.id, is_free: false, force: true });
                }
                return;
            }
            toast({ variant: 'destructive', title: 'Error', description: getErrorMessage(err) });
        },
    });

    // Cerrar / reabrir el horario para nuevas reservas (candado, sin cancelar la clase).
    const closeBookingsMutation = useMutation({
        mutationFn: async ({ id, closed }: { id: string; closed: boolean }) =>
            api.patch(`/classes/${id}/close-bookings`, { closed }),
        onSuccess: async (_, vars) => {
            await refrescarClases();
            toast({ title: vars.closed ? 'Clase cerrada para nuevas reservas' : 'Clase reabierta' });
        },
        onError: (err: any) => {
            toast({ variant: 'destructive', title: 'Error', description: getErrorMessage(err) });
        },
    });

    // Lugares que cada plataforma conectada puede vender en esta clase. El backend recibe { <canal>: lugares }.
    const cupoCanalMutation = useMutation({
        mutationFn: async ({ canal, lugares }: { canal: CanalClave; lugares: number }) =>
            (await api.put(`/classes/${clase!.id}/channels`, { [canal]: lugares })).data,
        onSuccess: async (_, { canal, lugares }) => {
            await refrescarClases();
            const nombre = CANALES[canal].nombre;
            toast({ title: `Cupo de ${nombre} actualizado`, description: `${lugares} lugar${lugares === 1 ? '' : 'es'} para ${nombre}.` });
        },
        onError: (err: any) => {
            toast({ variant: 'destructive', title: 'Error', description: err?.response?.data?.error || getErrorMessage(err) });
        },
    });

    const checkInMutation = useMutation({
        mutationFn: async (bookingId: string) => {
            return await api.post(`/bookings/${bookingId}/check-in`);
        },
        onSuccess: () => {
            refetchAttendees();
            queryClient.invalidateQueries({ queryKey: ['classes'] });
            toast({ title: 'Check-in realizado', description: 'Asistencia registrada.' });
        },
        onError: (err) => toast({ variant: 'destructive', title: 'Error', description: getErrorMessage(err) }),
    });

    const uncheckInMutation = useMutation({
        mutationFn: async (bookingId: string) => {
            return await api.post(`/bookings/${bookingId}/uncheck-in`);
        },
        onSuccess: () => {
            refetchAttendees();
            queryClient.invalidateQueries({ queryKey: ['classes'] });
            toast({ title: 'Check-in deshecho', description: 'La reserva volvió a estado confirmado.' });
        },
        onError: (err) => toast({ variant: 'destructive', title: 'Error', description: getErrorMessage(err) }),
    });

    const cancelBookingMutation = useMutation({
        mutationFn: async (bookingId: string) => {
            return await api.post(`/bookings/${bookingId}/cancel`);
        },
        onSuccess: () => {
            refetchAttendees();
            queryClient.invalidateQueries({ queryKey: ['classes'] });
            toast({ title: 'Reserva cancelada', description: 'Crédito devuelto si aplicaba.' });
        },
        onError: (err) => toast({ variant: 'destructive', title: 'Error', description: getErrorMessage(err) }),
    });

    const promoteWaitlistMutation = useMutation({
        mutationFn: async (bookingId: string) => api.post(`/bookings/${bookingId}/waitlist-promote`),
        onSuccess: () => {
            refetchAttendees();
            queryClient.invalidateQueries({ queryKey: ['classes'] });
            toast({ title: 'Movido a reservados', description: 'Se promovió desde la lista de espera.' });
        },
        onError: (err) => toast({ variant: 'destructive', title: 'Error', description: getErrorMessage(err) }),
    });

    // Asistentes divididos por estado para las pestañas estilo Fitune.
    const reservados = attendees?.filter(a => !['waitlist', 'cancelled'].includes(a.status)) ?? [];
    const enEspera = attendees?.filter(a => a.status === 'waitlist') ?? [];
    const cancelados = attendees?.filter(a => a.status === 'cancelled') ?? [];
    const classDurationMin = clase?.start_time && clase?.end_time
        ? Math.max(0,
            (parseInt(clase.end_time.slice(0, 2)) * 60 + parseInt(clase.end_time.slice(3, 5))) -
            (parseInt(clase.start_time.slice(0, 2)) * 60 + parseInt(clase.start_time.slice(3, 5))))
        : 0;

    const cancelada = clase?.status === 'cancelled';
    const coach = clase?.instructor_name?.trim() || '';
    const lugares = clase ? lugaresDeClase(clase) : null;
    const colorAlumna = colorPuntoAlumna(clase?.class_type_color);

    const renderAttendee = (attendee: Attendee, mode: 'reservado' | 'espera' | 'cancelado') => (
        <div
            key={attendee.booking_id}
            className={cn(
                "flex items-center justify-between gap-2 rounded-lg border p-3",
                attendee.status === 'checked_in' && "border-success/30 bg-success/10",
                mode === 'cancelado' && "opacity-70",
            )}
        >
            <div className="flex min-w-0 items-center gap-3">
                <Link to={`/admin/members/${attendee.user_id}`}>
                    <Avatar className="cursor-pointer transition-shadow hover:ring-2 hover:ring-primary">
                        <AvatarImage src={attendee.photo_url || undefined} />
                        <AvatarFallback>{getInitials(attendee.display_name)}</AvatarFallback>
                    </Avatar>
                </Link>
                <div className="min-w-0">
                    <p className="truncate font-medium">{attendee.display_name}</p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                        {attendee.is_free_booking
                            ? <Badge variant="outline" className="text-[10px] border-balance-gold/50 text-balance-gold">Invitada</Badge>
                            : attendee.plan_name && canalDePlan(attendee.plan_name) !== attendee.channel && (
                                <Badge variant="outline" className="text-[10px]"><PlanLabel nombre={attendee.plan_name} /></Badge>
                            )}
                        {mode === 'espera' && attendee.waitlist_position != null && (
                            <span className="font-medium text-balance-olive">#{attendee.waitlist_position} en espera</span>
                        )}
                        {esCanal(attendee.channel) && <ChannelLogo canal={attendee.channel} alto={9} />}
                        {attendee.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{attendee.phone}</span>}
                    </div>
                    <p className="mt-0.5 text-[11px] text-muted-foreground/75">
                        Reservó: {esCanal(attendee.channel) ? `desde ${CANALES[attendee.channel].nombre}` : attendeeBookedBy(attendee)}
                    </p>
                </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
                {['admin', 'super_admin', 'reception'].includes(user?.role || '') && <Button size="icon" variant="outline" aria-label={`Invitadas de ${attendee.display_name}`} title="Invitadas" onClick={() => setCompanionHost(attendee)}><Users className="h-4 w-4" /></Button>}
                {/* Escribirle por WhatsApp. Importa sobre todo con las socias de
                    TotalPass: reservaron desde su app y el estudio no las conoce. */}
                {(() => {
                    const wa = whatsAppDeAsistente(attendee, clase);
                    if (!wa) return null;
                    return (
                        <Button
                            asChild
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-[#25D366] hover:bg-[#25D366]/10 hover:text-[#25D366]"
                            title={`Escribir a ${attendee.display_name} por WhatsApp`}
                        >
                            <a href={wa} target="_blank" rel="noopener noreferrer" aria-label={`Escribir a ${attendee.display_name} por WhatsApp`}>
                                <MessageCircle className="h-4 w-4" />
                            </a>
                        </Button>
                    );
                })()}
                {mode === 'reservado' && attendee.status === 'checked_in' && (
                    <>
                        <Badge className="bg-success"><Check className="mr-1 h-3 w-3" />Asistió</Badge>
                        <Button
                            size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground" title="Deshacer check-in"
                            onClick={() => { if (confirm('¿Deshacer el check-in? La reserva volverá a confirmada.')) uncheckInMutation.mutate(attendee.booking_id); }}
                            disabled={uncheckInMutation.isPending}
                        >
                            <RotateCcw className="h-4 w-4" />
                        </Button>
                    </>
                )}
                {mode === 'reservado' && attendee.status !== 'checked_in' && (
                    <>
                        <Button
                            size="icon" className="h-9 w-9 bg-success hover:bg-success/90" title="Marcar asistencia"
                            onClick={() => checkInMutation.mutate(attendee.booking_id)} disabled={checkInMutation.isPending}
                        >
                            {checkInMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                        </Button>
                        <Button
                            size="icon" variant="outline" className="h-9 w-9 text-destructive hover:bg-destructive/10" title="Cancelar reserva"
                            onClick={() => setCancelBookingId(attendee.booking_id)}
                            disabled={cancelBookingMutation.isPending}
                        >
                            <X className="h-4 w-4" />
                        </Button>
                    </>
                )}
                {mode === 'espera' && (
                    <Button
                        size="sm" variant="outline" title="Promover a reservados"
                        onClick={() => promoteWaitlistMutation.mutate(attendee.booking_id)} disabled={promoteWaitlistMutation.isPending}
                    >
                        Promover
                    </Button>
                )}
                {mode === 'cancelado' && <Badge variant="secondary">Cancelada</Badge>}
            </div>
        </div>
    );

    return (
        <>
            <Sheet open={open && !!clase} onOpenChange={onOpenChange}>
                <SheetContent className="w-full overflow-y-auto p-0 font-body sm:max-w-lg">
                    {/* ── Qué clase es y cómo va de lugares ── */}
                    <div className="border-b border-casa-arena bg-casa-avena/60 p-5">
                        <SheetHeader className="space-y-0 text-left">
                            <SheetTitle className="flex flex-wrap items-center gap-2 font-heading text-2xl font-normal text-casa-profundo">
                                {clase?.class_type_name}
                                <ClassIntensity intensity={clase?.intensity} />
                                {cancelada && <Badge variant="destructive">Cancelada</Badge>}
                                {clase?.is_free && <Badge className="bg-emerald-600 text-white">{clase.free_label || 'Gratis'}</Badge>}
                                {clase?.booking_closed && !cancelada && (
                                    <Badge variant="outline" className="border-amber-400 text-amber-800"><Lock className="mr-1 h-3 w-3" />Cupo cerrado</Badge>
                                )}
                            </SheetTitle>
                            <SheetDescription className="sr-only">Detalle de la clase y asistentes</SheetDescription>
                        </SheetHeader>
                        <div className="mt-3 space-y-1.5 text-sm text-casa-ciruela">
                            <p className="flex items-center gap-2.5">
                                <CalendarIcon className="h-4 w-4 shrink-0 text-casa-verde" />
                                <span className="capitalize">
                                    {clase && format(parseISO((clase.date || '').split('T')[0] + 'T00:00:00'), "EEEE d 'de' MMMM", { locale: es })}
                                </span>
                            </p>
                            <p className="flex items-center gap-2.5">
                                <Clock className="h-4 w-4 shrink-0 text-casa-verde" />
                                <span>{clase?.start_time?.slice(0, 5)} – {clase?.end_time?.slice(0, 5)}</span>
                                {classDurationMin > 0 && <span className="text-muted-foreground">· {classDurationMin} min</span>}
                            </p>
                            <p className="flex items-center gap-2.5">
                                <UserRound className="h-4 w-4 shrink-0 text-casa-verde" />
                                {coach ? <span>Con {coach}</span> : <span className="font-semibold text-destructive">Sin coach asignada</span>}
                            </p>
                            {clase?.facility_name && (
                                <p className="flex items-center gap-2.5">
                                    <MapPin className="h-4 w-4 shrink-0 text-casa-verde" />
                                    <span>{clase.facility_name}</span>
                                </p>
                            )}
                        </div>
                        {lugares && !cancelada && (
                            <div className="mt-4 space-y-2" data-testid="lugares-panel">
                                <div className="flex flex-wrap items-center gap-1.5">
                                    {lugares.lugares.map((l, i) => {
                                        const e = estiloDeLugar(l, colorAlumna);
                                        return <PuntoLugar key={i} relleno={e.relleno} anillo={e.anillo} tamano={20} data-lugar={claveDeLugar(l)} />;
                                    })}
                                    <span className="ml-2 font-semibold text-casa-ciruela">{etiquetaCupoLarga(lugares)}</span>
                                </div>
                                <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-casa-ciruela/75">
                                    <span>{lugares.alumnas} {lugares.alumnas === 1 ? 'alumna' : 'alumnas'} de Casa Shé</span>
                                    {lugares.porCanal.map((x) => (
                                        <span key={x.canal} className="flex items-center gap-1.5">
                                            {esCanal(x.canal) ? (
                                                <>
                                                    <ChannelDot canal={x.canal} />
                                                    {x.reservados} {x.reservados === 1 ? 'socia' : 'socias'}
                                                    <ChannelLogo canal={x.canal} alto={9} />
                                                </>
                                            ) : (
                                                <>{x.reservados} de {x.canal}</>
                                            )}
                                        </span>
                                    ))}
                                </p>
                            </div>
                        )}
                    </div>

                    <div className="space-y-5 p-5">
                        {/* Acciones */}
                        {!cancelada && (
                            <div className="grid grid-cols-3 gap-2">
                                <Button variant="outline" className="px-2" onClick={onEditar}>
                                    <Edit className="mr-1.5 h-4 w-4" /> Editar clase
                                </Button>
                                <Button variant="outline" className="px-2" onClick={onCambiarCoach}>
                                    <Users className="mr-1.5 h-4 w-4" /> Cambiar coach
                                </Button>
                                <Button variant="destructive" className="px-2" onClick={onCancelar}>
                                    <Trash2 className="mr-1.5 h-4 w-4" /> Cancelar clase
                                </Button>
                            </div>
                        )}

                        {/* Inscribir alumna (la Entrega 4 lo rehace con créditos y venta de paquete) */}
                        {!cancelada && (
                            <section aria-labelledby="panel-inscribir" className="space-y-2 rounded-xl border border-casa-arena bg-casa-avena/45 p-3">
                                <h3 id="panel-inscribir" className="text-sm font-semibold text-casa-ciruela">Inscribir alumna</h3>
                                {sellFor && (
                                    <div className="flex items-center justify-between gap-2 rounded-lg border border-balance-gold/40 bg-balance-gold/10 p-2.5">
                                        <p className="text-xs text-balance-gold">
                                            {sellFor.name || 'Esta clienta'} no tiene plan con créditos.
                                        </p>
                                        <Button size="sm" className="h-7 shrink-0" onClick={() => setSellOpen(true)}>
                                            Vender plan
                                        </Button>
                                    </div>
                                )}
                                <SellPlanDialog
                                    userId={sellFor?.id ?? ''}
                                    userName={sellFor?.name}
                                    open={sellOpen}
                                    onOpenChange={setSellOpen}
                                    onSold={() => {
                                        if (sellFor && clase) {
                                            adminBookMutation.mutate({ classId: clase.id, userId: sellFor.id, userName: sellFor.name });
                                        }
                                    }}
                                />
                                <label className="flex items-start gap-2 cursor-pointer select-none">
                                    <input
                                        type="checkbox"
                                        checked={guestFree}
                                        onChange={(e) => setGuestFree(e.target.checked)}
                                        className="mt-0.5 h-3.5 w-3.5 rounded border-input accent-balance-gold"
                                    />
                                    <span className="text-[11px] leading-tight">
                                        <span className="font-medium text-balance-dark">Invitada (gratis, sin descontar crédito)</span>
                                        <span className="block text-muted-foreground">No requiere plan.</span>
                                    </span>
                                </label>
                                <div className="relative">
                                    <Input
                                        placeholder="Buscar por nombre o email..."
                                        value={userSearch}
                                        onChange={(e) => {
                                            setUserSearch(e.target.value);
                                            setSearchActive(true);
                                        }}
                                        className="h-8 text-xs"
                                    />
                                </div>
                                {searchActive && userSearch.trim().length >= 2 && (
                                    <div className="space-y-1 max-h-48 overflow-y-auto">
                                        {userSearchLoading && (
                                            <div className="flex justify-center py-3">
                                                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                            </div>
                                        )}
                                        {!userSearchLoading && userSearchResults?.users?.length === 0 && (
                                            <p className="py-2 text-center text-xs text-muted-foreground">Sin resultados</p>
                                        )}
                                        {userSearchResults?.users?.map(u => (
                                            <button
                                                key={u.id}
                                                type="button"
                                                disabled={adminBookMutation.isPending}
                                                onClick={() => {
                                                    if (!clase) return;
                                                    adminBookMutation.mutate({ classId: clase.id, userId: u.id, userName: u.display_name, free: guestFree });
                                                }}
                                                className="flex w-full items-center gap-3 rounded-lg border border-transparent px-2 py-1.5 text-left text-xs hover:border-balance-olive/30 hover:bg-balance-olive/8 disabled:opacity-50"
                                            >
                                                <Avatar className="h-6 w-6 shrink-0">
                                                    <AvatarImage src={u.photo_url || undefined} />
                                                    <AvatarFallback className="text-[9px]">{getInitials(u.display_name)}</AvatarFallback>
                                                </Avatar>
                                                <div className="min-w-0">
                                                    <p className="font-medium truncate">{u.display_name}</p>
                                                    <p className="text-muted-foreground truncate">{u.email}</p>
                                                </div>
                                                {adminBookMutation.isPending ? (
                                                    <Loader2 className="ml-auto h-3 w-3 animate-spin shrink-0" />
                                                ) : (
                                                    <Plus className="ml-auto h-3 w-3 shrink-0 text-balance-olive opacity-0 group-hover:opacity-100" />
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </section>
                        )}

                        {/* Cupo de cada plataforma conectada (hoy TotalPass) */}
                        {!cancelada && clase && canalesConectados().map((canal) => (
                            <ControlCupoCanal
                                key={canal.clave}
                                canal={canal}
                                clase={clase}
                                ocupado={cupoCanalMutation.isPending}
                                onCambiar={(n) => cupoCanalMutation.mutate({ canal: canal.clave, lugares: n })}
                            />
                        ))}

                        {/* ── Inscritas: pestañas Reservado / Lista de espera / Cancelado ── */}
                        <Tabs value={attendeesTab} onValueChange={(v) => setAttendeesTab(v as 'reservado' | 'espera' | 'cancelado')}>
                            <TabsList className="grid w-full grid-cols-3">
                                <TabsTrigger value="reservado">Reservado <span className="ml-1.5 text-xs opacity-70">{reservados.length}</span></TabsTrigger>
                                <TabsTrigger value="espera">Espera <span className="ml-1.5 text-xs opacity-70">{enEspera.length}</span></TabsTrigger>
                                <TabsTrigger value="cancelado">Cancelado <span className="ml-1.5 text-xs opacity-70">{cancelados.length}</span></TabsTrigger>
                            </TabsList>

                            {attendeesLoading ? (
                                <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
                            ) : (
                                <>
                                    <TabsContent value="reservado" className="mt-4 space-y-2.5">
                                        {reservados.length === 0
                                            ? <p className="py-8 text-center text-sm text-muted-foreground">Sin reservas todavía.</p>
                                            : reservados.map((a) => renderAttendee(a, 'reservado'))}
                                    </TabsContent>
                                    <TabsContent value="espera" className="mt-4 space-y-2.5">
                                        {enEspera.length === 0
                                            ? <p className="py-8 text-center text-sm text-muted-foreground">Nadie en lista de espera.</p>
                                            : enEspera.map((a) => renderAttendee(a, 'espera'))}
                                    </TabsContent>
                                    <TabsContent value="cancelado" className="mt-4 space-y-2.5">
                                        {cancelados.length === 0
                                            ? <p className="py-8 text-center text-sm text-muted-foreground">Sin cancelaciones.</p>
                                            : cancelados.map((a) => renderAttendee(a, 'cancelado'))}
                                    </TabsContent>
                                </>
                            )}
                        </Tabs>

                        {/* Cerrar / reabrir el horario (candado de reservas, sin cancelar) */}
                        {clase && !cancelada && (
                            clase.booking_closed ? (
                                <div className="flex items-center justify-between gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3">
                                    <div className="flex items-center gap-2 text-sm text-amber-800">
                                        <Lock className="h-4 w-4 shrink-0" />
                                        <span>Cerrada — no entran nuevas reservas.</span>
                                    </div>
                                    <Button variant="outline" size="sm" className="shrink-0" disabled={closeBookingsMutation.isPending}
                                        onClick={() => closeBookingsMutation.mutate({ id: clase.id, closed: false })}>
                                        <Unlock className="mr-1 h-3 w-3" /> Reabrir
                                    </Button>
                                </div>
                            ) : (
                                <Button variant="outline" className="w-full text-muted-foreground" disabled={closeBookingsMutation.isPending}
                                    onClick={() => closeBookingsMutation.mutate({ id: clase.id, closed: true })}>
                                    <Lock className="mr-2 h-4 w-4" /> Cerrar cupo (no entran nuevas reservas)
                                </Button>
                            )
                        )}

                        {/* Clase gratis (admin/super_admin) */}
                        {isAdmin && clase && !cancelada && (
                            <div className={`rounded-xl border p-3 ${clase.is_free ? 'border-emerald-300 bg-emerald-50' : 'border-casa-arena bg-casa-avena/45'}`}>
                                <div className="flex items-center justify-between mb-2">
                                    <div>
                                        <p className="text-sm font-semibold">Clase gratis</p>
                                        <p className="text-[11px] text-muted-foreground">
                                            Sin cobro, sin descontar crédito. Usuarios sin paquete pueden reservar.
                                        </p>
                                    </div>
                                    <Switch
                                        checked={!!clase.is_free}
                                        onCheckedChange={(v) => {
                                            toggleFreeMutation.mutate({
                                                id: clase.id,
                                                is_free: v,
                                                free_label: v ? (clase.free_label || 'Clase gratis') : undefined,
                                            });
                                        }}
                                        disabled={toggleFreeMutation.isPending}
                                    />
                                </div>
                                {clase.is_free && (
                                    <div className="flex items-center gap-2 mt-2">
                                        <Input
                                            placeholder="Etiqueta visible (ej. Opening Day)"
                                            defaultValue={clase.free_label || ''}
                                            onBlur={(e) => {
                                                const v = e.target.value.trim() || 'Clase gratis';
                                                if (v !== clase.free_label) {
                                                    toggleFreeMutation.mutate({
                                                        id: clase.id,
                                                        is_free: true,
                                                        free_label: v,
                                                    });
                                                }
                                            }}
                                            className="h-8 text-xs"
                                        />
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </SheetContent>
            </Sheet>

            <CancelBookingDialog
                bookingId={cancelBookingId}
                open={!!cancelBookingId}
                onClose={() => setCancelBookingId(null)}
                onCancelled={() => { refetchAttendees(); queryClient.invalidateQueries({ queryKey: ['classes'] }); }}
            />
            <Dialog open={!!companionHost} onOpenChange={open => { if (!open) setCompanionHost(null); }}>
                <DialogContent className="max-h-[90vh] overflow-y-auto">
                    <DialogHeader><DialogTitle>Invitadas de {companionHost?.display_name}</DialogTitle><DialogDescription>Gestiona las invitadas de esta reserva.</DialogDescription></DialogHeader>
                    {companionHost && <CompanionPanel key={companionHost.booking_id} bookingId={companionHost.booking_id} staff />}
                </DialogContent>
            </Dialog>
        </>
    );
}

/**
 * Lugares que una plataforma conectada puede vender en esta clase. No deja bajar de las
 * socias ya inscritas (el servidor lo rechazaría) ni pasar del cupo de la clase.
 */
function ControlCupoCanal({ canal, clase, ocupado, onCambiar }: {
    canal: Canal;
    clase: Class;
    ocupado: boolean;
    onCambiar: (lugares: number) => void;
}) {
    const fila = clase.channels?.find((c) => c.channel === canal.clave);
    const max = Number(fila?.max ?? (canal.clave === 'totalpass' ? clase.totalpass_spots ?? 0 : 0));
    const inscritas = Number(fila?.booked ?? 0);
    const capacidad = Number(clase.max_capacity || 0);
    return (
        <section aria-label={`Lugares para ${canal.nombre}`} className="flex items-center gap-3 rounded-xl border border-casa-arena bg-casa-avena/45 p-3">
            <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-sm font-semibold text-casa-ciruela">
                    Lugares para <ChannelLogo canal={canal.clave} alto={12} />
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {inscritas} {inscritas === 1 ? 'socia inscrita' : 'socias inscritas'} · de {capacidad} · 0 = no se ofrece en {canal.nombre}
                </p>
            </div>
            <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-9 w-9 shrink-0 rounded-full"
                aria-label="Un lugar menos"
                disabled={ocupado || max <= Math.max(0, inscritas)}
                onClick={() => onCambiar(max - 1)}
            >
                <Minus className="h-4 w-4" />
            </Button>
            <span data-testid={`cupo-${canal.clave}`} className="w-8 text-center text-2xl font-bold tabular-nums text-casa-profundo">
                {max}
            </span>
            <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-9 w-9 shrink-0 rounded-full"
                aria-label="Un lugar más"
                disabled={ocupado || max >= capacidad}
                onClick={() => onCambiar(max + 1)}
            >
                <Plus className="h-4 w-4" />
            </Button>
        </section>
    );
}
```

Qué cambia frente a la Task 5 (todo lo demás es el mismo código): encabezado con lugares grandes y desglose por plataforma; "Coach por confirmar" pasa a "Sin coach asignada" en rojo; botón "Cambiar coach" en el panel; "Agregar usuario a la clase" se titula "Inscribir alumna" y sube; el cupo de TotalPass se vuelve un control por canal conectado que no deja bajar de las socias inscritas; cupo cerrado y clase gratis bajan al final; las mutaciones de gratis, cupo cerrado y cupo por canal esperan a que se recargue la lista de clases en vez de parchar la clase seleccionada.

- [ ] **Step 4: El padre pasa la clase vigente**

En `frontend/src/pages/admin/classes/ClassesCalendar.tsx`:

a) En la desestructuración de `useSemanaClases()`, cambiar

```tsx
        classesLoading, classesError, refetchClasses,
```

por

```tsx
        classes, classesLoading, classesError, refetchClasses,
```

b) Antes de `    const resumenSemana = textoResumenSemana(` agregar:

```tsx
    // El panel y los diálogos usan la versión más reciente de la clase abierta: después de
    // inscribir, cambiar el cupo o cerrar la clase, la lista se recarga y aquí llega ya cambiada.
    const claseVigente = (selectedClass && classes?.find((c) => c.id === selectedClass.id)) || selectedClass;

```

c) Cambiar el `<PanelClase …>`:

```tsx
            <PanelClase
                clase={selectedClass}
                open={isAttendeesOpen}
                onOpenChange={(open) => { setIsAttendeesOpen(open); if (!open) setSelectedClass(null); }}
                onEditar={handleEditClass}
                onCancelar={() => setCancelChoiceOpen(true)}
                onClaseCambiada={setSelectedClass}
            />
```

por:

```tsx
            <PanelClase
                clase={claseVigente}
                open={isAttendeesOpen}
                onOpenChange={(open) => { setIsAttendeesOpen(open); if (!open) setSelectedClass(null); }}
                onEditar={handleEditClass}
                onCambiarCoach={handleChangeCoach}
                onCancelar={() => setCancelChoiceOpen(true)}
            />
```

d) En `<DialogoEditarClase>`, `<DialogoCancelarClase>` y `<DialogoCambiarCoach>`, cambiar `clase={selectedClass}` por `clase={claseVigente}` (son las tres únicas ocurrencias que quedan).

- [ ] **Step 5: Verificar**

Run:

```bash
cd frontend && npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -E "error TS" | grep -vE "FilterPills.tsx\(124|push.ts\(47|Events.tsx\((259|906)"
git grep -nE "clase=\{selectedClass\}|onClaseCambiada" -- src/pages/admin/classes
./scripts/e2e-local.sh e2e/tests/admin-classes.spec.ts --project=chromium -g "semana por horas"
```

Expected: typecheck sin salida; el `git grep` no encuentra nada; Playwright `5 passed`.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/admin/classes/calendario/PanelClase.tsx frontend/src/pages/admin/classes/ClassesCalendar.tsx frontend/e2e/tests/admin-classes.spec.ts
git commit -m "feat(calendario): panel de clase reordenado y cupo por plataforma conectada

Encabezado con los lugares grandes y quién viene de cada plataforma,
acciones (editar, cambiar coach, cancelar), Inscribir alumna arriba, un
control de cupo por canal conectado con su logo que no baja de las
socias inscritas, inscritas con check-in, invitadas y lista de espera, y
al final cupo cerrado y clase gratis. El panel muestra la clase vigente.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: "Editar clase" manda solo lo que cambió + verificación final

**Tipo:** código completo con TDD + ediciones puntuales en `DialogoEditarClase.tsx`; al final, verificación de toda la rama.

**Files:**
- Create: `frontend/src/pages/admin/classes/calendario/cambiosClase.ts`
- Modify: `frontend/src/pages/admin/classes/calendario/DialogoEditarClase.tsx`
- Test: `frontend/scripts/test-calendario-cambios.ts`, `frontend/e2e/tests/admin-classes.spec.ts` (caso "editar manda solo lo que cambió")

**Interfaces:**
- Produces (`cambiosClase.ts`): `interface DatosClaseEditables { classTypeId: string; instructorId: string; facilityId: string | null; date: string; startTime: string; endTime: string; maxCapacity: number; intensity: number | null }`, `datosEditablesDeClase(c: { class_type_id; instructor_id; facility_id?; date; start_time; end_time; max_capacity; intensity? }): DatosClaseEditables`, `cambiosDeClase(antes, despues): Partial<DatosClaseEditables>` (solo campos distintos; quitar intensidad o sala manda `null`).
- Comportamiento: sin cambios en la clase no hay `PUT /api/classes/:id`; si tampoco cambió el cupo de TotalPass, aviso "Sin cambios" y se cierra solo el diálogo (el panel sigue abierto). El `PUT /api/classes/:id/channels` sigue la regla de hoy: se manda si cambió el cupo, o si bajó la capacidad con cupo > 0.

- [ ] **Step 1: Escribir las pruebas que fallan**

Crear `frontend/scripts/test-calendario-cambios.ts`:

```ts
// "Editar clase" manda a PUT /api/classes/:id solo lo que cambió: mandar todo marcaba
// resincronización con TotalPass en cada guardado.
// Correr con: npx tsx scripts/test-calendario-cambios.ts
import assert from 'node:assert/strict';
import { cambiosDeClase, datosEditablesDeClase, type DatosClaseEditables } from '../src/pages/admin/classes/calendario/cambiosClase.js';

const clase = {
    class_type_id: 't1', instructor_id: 'i1', facility_id: 'f1', date: '2026-11-02',
    start_time: '07:00', end_time: '07:50', max_capacity: 7, intensity: null,
};
const antes = datosEditablesDeClase(clase);
assert.deepEqual(antes, {
    classTypeId: 't1', instructorId: 'i1', facilityId: 'f1', date: '2026-11-02',
    startTime: '07:00', endTime: '07:50', maxCapacity: 7, intensity: null,
});

// Guardar sin tocar nada → nada que mandar.
assert.deepEqual(cambiosDeClase(antes, { ...antes }), {});
// Solo la capacidad.
assert.deepEqual(cambiosDeClase(antes, { ...antes, maxCapacity: 6 }), { maxCapacity: 6 });
// El mismo valor escrito distinto no es un cambio.
const conFormatosDeLaBase = datosEditablesDeClase({
    ...clase, date: '2026-11-02T00:00:00.000Z', start_time: '07:00:00', end_time: '07:50:00', facility_id: undefined, intensity: undefined,
});
assert.deepEqual(cambiosDeClase(conFormatosDeLaBase, { ...antes, facilityId: null }), {});
assert.deepEqual(cambiosDeClase({ ...antes, facilityId: null }, { ...antes, facilityId: '' as unknown as null }), {});
assert.deepEqual(cambiosDeClase(antes, { ...antes, maxCapacity: '7' as unknown as number }), {});
// Intensidad: ponerla y quitarla (null se manda para borrarla).
assert.deepEqual(cambiosDeClase(antes, { ...antes, intensity: 2 }), { intensity: 2 });
assert.deepEqual(cambiosDeClase({ ...antes, intensity: 2 }, { ...antes, intensity: null }), { intensity: null });
// Coach y hora juntos; quitar la sala.
const despues: DatosClaseEditables = { ...antes, instructorId: 'i2', startTime: '08:00', endTime: '08:50' };
assert.deepEqual(cambiosDeClase(antes, despues), { instructorId: 'i2', startTime: '08:00', endTime: '08:50' });
assert.deepEqual(cambiosDeClase(antes, { ...antes, facilityId: null }), { facilityId: null });

console.log('✅ test-calendario-cambios OK');
```

Dentro del `test.describe("Calendario de recepción – semana por horas", …)` de `frontend/e2e/tests/admin-classes.spec.ts`, antes de su `});` final, agregar:

```ts
  test("editar manda solo lo que cambió", async ({ adminPage: page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await mockSemanaCalendario(page);
    const puts: Array<{ ruta: string; cuerpo: unknown }> = [];
    await page.route(/\/api\/classes\/[^/?]+(\/channels)?$/, async (route) => {
      if (route.request().method() !== "PUT") return route.fallback();
      puts.push({ ruta: new URL(route.request().url()).pathname, cuerpo: route.request().postDataJSON() });
      await route.fulfill({ json: { ok: true } });
    });
    await page.goto(`/admin/calendar?date=${FECHA_PRUEBA}`);
    const editar = page.getByRole("dialog", { name: "Editar Clase" });
    const guardar = () => editar.getByRole("button", { name: "Guardar Cambios" }).click();

    // 1) Guardar sin tocar nada: no se manda nada y el panel sigue abierto.
    await page.getByRole("button", { name: /^Barre.*07:00/ }).click();
    await page.getByRole("button", { name: "Editar clase" }).click();
    await guardar();
    await expect(page.getByText("Sin cambios", { exact: true })).toBeVisible();
    await expect(editar).toBeHidden();
    expect(puts).toEqual([]);

    // 2) Solo subir la capacidad: solo maxCapacity. Al guardar se cierra el panel.
    //    (Bajarla con cupo de TotalPass también reenvía ese cupo para que el servidor lo revalide; así era antes.)
    await page.getByRole("button", { name: "Editar clase" }).click();
    await editar.getByRole("spinbutton", { name: "Capacidad" }).fill("8");
    await guardar();
    await expect.poll(() => puts).toEqual([{ ruta: `/api/classes/${ID.barre}`, cuerpo: { maxCapacity: 8 } }]);
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // 3) Solo el cupo de TotalPass: la clase no se toca, solo /channels.
    puts.length = 0;
    await page.getByRole("button", { name: /^Barre.*07:00/ }).click();
    await page.getByRole("button", { name: "Editar clase" }).click();
    await editar.getByRole("spinbutton", { name: "Lugares para TotalPass" }).fill("1");
    await guardar();
    await expect.poll(() => puts).toEqual([{ ruta: `/api/classes/${ID.barre}/channels`, cuerpo: { totalpass: 1 } }]);
  });
```

- [ ] **Step 2: Correrlas y ver que fallan**

Run: `cd frontend && npx tsx scripts/test-calendario-cambios.ts`
Expected: FAIL con `Cannot find module '../src/pages/admin/classes/calendario/cambiosClase.js'`.

Run: `./scripts/e2e-local.sh e2e/tests/admin-classes.spec.ts --project=chromium -g "editar manda"`
Expected: FAIL (hoy "Guardar Cambios" sin tocar nada manda un `PUT /api/classes/:id` con todos los campos).

- [ ] **Step 3: `cambiosClase.ts`**

Crear `frontend/src/pages/admin/classes/calendario/cambiosClase.ts`:

```ts
/**
 * Qué cambió en el formulario "Editar clase". PUT /api/classes/:id marca la clase para
 * resincronizar con TotalPass en cuanto recibe tipo, coach, fecha u hora, aunque traigan el
 * mismo valor; por eso solo se manda lo que de verdad cambió.
 *
 * Sin imports con alias "@/": lo prueba frontend/scripts/test-calendario-cambios.ts.
 */
export interface DatosClaseEditables {
    classTypeId: string;
    instructorId: string;
    facilityId: string | null;
    /** YYYY-MM-DD */
    date: string;
    /** HH:MM */
    startTime: string;
    /** HH:MM */
    endTime: string;
    maxCapacity: number;
    intensity: number | null;
}

interface ClaseOrigen {
    class_type_id: string;
    instructor_id: string;
    facility_id?: string | null;
    date: string;
    start_time: string;
    end_time: string;
    max_capacity: number;
    intensity?: number | null;
}

/** Misma forma para los dos lados: sin sala = null, fecha sin hora, horas sin segundos, números como número. */
function normalizar(d: DatosClaseEditables): DatosClaseEditables {
    return {
        classTypeId: d.classTypeId || '',
        instructorId: d.instructorId || '',
        facilityId: d.facilityId || null,
        date: String(d.date || '').slice(0, 10),
        startTime: String(d.startTime || '').slice(0, 5),
        endTime: String(d.endTime || '').slice(0, 5),
        maxCapacity: Number(d.maxCapacity),
        intensity: d.intensity ?? null,
    };
}

/** Los datos editables de una clase tal como llega de GET /api/classes. */
export function datosEditablesDeClase(c: ClaseOrigen): DatosClaseEditables {
    return normalizar({
        classTypeId: c.class_type_id,
        instructorId: c.instructor_id,
        facilityId: c.facility_id ?? null,
        date: c.date,
        startTime: c.start_time,
        endTime: c.end_time,
        maxCapacity: c.max_capacity,
        intensity: c.intensity ?? null,
    });
}

/** Solo los campos distintos, con el valor nuevo. Quitar la intensidad o la sala manda null. */
export function cambiosDeClase(antes: DatosClaseEditables, despues: DatosClaseEditables): Partial<DatosClaseEditables> {
    const a = normalizar(antes);
    const d = normalizar(despues);
    const cambios: Partial<Record<keyof DatosClaseEditables, unknown>> = {};
    for (const campo of Object.keys(d) as (keyof DatosClaseEditables)[]) {
        if (a[campo] !== d[campo]) cambios[campo] = d[campo];
    }
    return cambios as Partial<DatosClaseEditables>;
}
```

Run: `cd frontend && npx tsx scripts/test-calendario-cambios.ts`
Expected: `✅ test-calendario-cambios OK`.

- [ ] **Step 4: Usarlo en `DialogoEditarClase.tsx`**

En `frontend/src/pages/admin/classes/calendario/DialogoEditarClase.tsx` (cada `old` aparece una vez):

a) Después de `import type { Facility } from './tipos';` agregar:

```tsx
import { cambiosDeClase, datosEditablesDeClase, type DatosClaseEditables } from './cambiosClase';
```

b) Cambiar:

```tsx
        mutationFn: async (data: EditClassForm & { id: string; originalTotalpassSpots?: number; originalMaxCapacity?: number }) => {
            const { id, originalTotalpassSpots, originalMaxCapacity, ...rest } = data;
            const res = await api.put(`/classes/${id}`, {
                classTypeId: rest.classTypeId,
                instructorId: rest.instructorId,
                facilityId: rest.facilityId || null,
                date: format(rest.date, 'yyyy-MM-dd'),
                startTime: rest.startTime,
                endTime: rest.endTime,
                maxCapacity: rest.maxCapacity,
                intensity: rest.intensity,
            });
```

por:

```tsx
        mutationFn: async (data: EditClassForm & { id: string; antes: DatosClaseEditables; originalTotalpassSpots?: number; originalMaxCapacity?: number }) => {
            const { id, antes, originalTotalpassSpots, originalMaxCapacity, ...rest } = data;
            // Solo lo que cambió: el backend marca resincronización con TotalPass si recibe
            // tipo, coach, fecha u hora, aunque sean los mismos de antes.
            const cambios = cambiosDeClase(antes, {
                classTypeId: rest.classTypeId,
                instructorId: rest.instructorId,
                facilityId: rest.facilityId || null,
                date: format(rest.date, 'yyyy-MM-dd'),
                startTime: rest.startTime,
                endTime: rest.endTime,
                maxCapacity: rest.maxCapacity,
                intensity: rest.intensity,
            });
            const huboCambiosEnClase = Object.keys(cambios).length > 0;
            const res = huboCambiosEnClase ? await api.put(`/classes/${id}`, cambios) : null;
```

c) Cambiar:

```tsx
            return res;
        },
        onSuccess: (res: any) => {
            const warning = res?.data?.payrollWarning;
```

por:

```tsx
            return { res, guardoAlgo: huboCambiosEnClase || shouldSyncChannels };
        },
        onSuccess: ({ res, guardoAlgo }: { res: any; guardoAlgo: boolean }) => {
            if (!guardoAlgo) {
                toast({ title: 'Sin cambios', description: 'No había nada que guardar.' });
                onOpenChange(false);
                return;
            }
            const warning = res?.data?.payrollWarning;
```

d) En el `onSubmit` del `<form>`, cambiar

```tsx
editMutation.mutate({ ...d, id: clase.id, originalTotalpassSpots
```

por

```tsx
editMutation.mutate({ ...d, id: clase.id, antes: datosEditablesDeClase(clase), originalTotalpassSpots
```

e) Etiquetas asociadas a sus campos (para lectores de pantalla y para la prueba). Cambiar:

```tsx
                        <Label>Capacidad</Label>
                        <Input type="number" {...editForm.register('maxCapacity')} />
```

por:

```tsx
                        <Label htmlFor="editar-capacidad">Capacidad</Label>
                        <Input id="editar-capacidad" type="number" {...editForm.register('maxCapacity')} />
```

y:

```tsx
                        <Label className="flex items-center gap-1.5">Lugares para <ChannelLogo canal="totalpass" alto={10} /></Label>
                        <Input type="number" min={0} {...editForm.register('totalpassSpots', { valueAsNumber: true })} />
```

por:

```tsx
                        <Label htmlFor="editar-cupo-totalpass" className="flex items-center gap-1.5">Lugares para <ChannelLogo canal="totalpass" alto={10} /></Label>
                        <Input id="editar-cupo-totalpass" type="number" min={0} {...editForm.register('totalpassSpots', { valueAsNumber: true })} />
```

- [ ] **Step 5: Verificación final de la rama**

Run:

```bash
cd "/Users/saidromero/Desktop/Casa She/casa-she-entrega-2/frontend"
for t in calendario-rejilla calendario-lugares calendario-cambios canales; do npx tsx scripts/test-$t.ts; done
npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -E "error TS" | grep -vE "FilterPills.tsx\(124|push.ts\(47|Events.tsx\((259|906)"
npm run build >/dev/null && echo "build ok"
./scripts/e2e-local.sh e2e/tests/admin-classes.spec.ts --project=chromium -g "semana por horas" --repeat-each=2
cd ../backend && npx tsc --noEmit && DATABASE_URL=postgresql://localhost:5432/casa_she npx tsx scripts/test-class-channels.ts
```

Expected: las cuatro pruebas `✅ … OK`; typecheck sin salida; `build ok`; Playwright `12 passed`; `tsc` del backend limpio y `test-class-channels: OK`.

Reportar además (sin arreglarlo aquí): `./scripts/e2e-local.sh e2e/tests/admin-classes.spec.ts e2e/tests/admin-channel-logos.spec.ts --project=chromium` — el caso viejo "listado de clases muestra tabla con datos" (página `/admin/classes`, no el calendario) ya fallaba en el commit base; todos los demás deben pasar.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/admin/classes/calendario/cambiosClase.ts frontend/src/pages/admin/classes/calendario/DialogoEditarClase.tsx frontend/scripts/test-calendario-cambios.ts frontend/e2e/tests/admin-classes.spec.ts
git commit -m "fix(calendario): Editar manda solo lo que cambió

Antes cada guardado mandaba todos los campos a PUT /api/classes/:id y
eso marcaba la clase para resincronizar con TotalPass aunque no hubiera
cambiado nada. Ahora se manda solo lo distinto; sin cambios no se llama
al servidor.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

No hacer push ni abrir PR: el controlador revisa la rama completa y abre el PR contra `feat/logos-canales`.
