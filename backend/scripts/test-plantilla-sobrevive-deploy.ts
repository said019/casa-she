// La plantilla (schedules) de Casa Shé debe sobrevivir a un despliegue.
//
// Existe porque no sobrevivía: la migración 048, heredada del código de BMB y
// sin bandera, corría en CADA arranque y borraba las plantillas de toda sede
// que no empezara con "BMB" — o sea, la de Casa Shé. Se cargaron 64 horarios,
// se desplegó, y desaparecieron sin un solo error en los logs.
//
// Correr con: npx tsx scripts/test-plantilla-sobrevive-deploy.ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
    CASA_SHE_OFFICIAL_SLOTS,
    CASA_SHE_OFFICIAL_CLASS_TYPES,
    CASA_SHE_OFFICIAL_INSTRUCTORS,
    CASA_SHE_OFFICIAL_FACILITY,
    buildCasaSheOfficialScheduleRows,
} from '../src/data/casa-she-official-schedule.js';

// ── 1. Ninguna migración puede borrar schedules sin protección ──────────────
const index = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');

// Se buscan los DELETE sobre schedules que NO estén acotados a una sede concreta
// por parámetro ($1) — esos son los que pueden barrer la plantilla entera.
const borradosAmplios = [...index.matchAll(/DELETE FROM schedules(?![\s\S]{0,120}facility_id = \$1)[\s\S]{0,220}?`/g)];
for (const m of borradosAmplios) {
    const fragmento = m[0];
    if (!/facility_id/.test(fragmento)) continue;   // borrados por id puntual: no barren la sede
    assert.ok(
        /Casa Shé — Condesa/.test(fragmento),
        `Hay un DELETE FROM schedules por sede que no excluye a Casa Shé:\n${fragmento.slice(0, 200)}`,
    );
}

// La 048 concretamente: debe estar detrás de una bandera de ejecución única.
const i048 = index.indexOf('Migration 048');
assert.ok(i048 > 0, 'no se encontró la migración 048');
const bloque048 = index.slice(i048, i048 + 1400);
assert.match(bloque048, /migration_048_cruft_schedules/, 'la migración 048 debe estar protegida por bandera');
assert.match(bloque048, /Casa Shé — Condesa/, 'la migración 048 debe excluir la sede de Casa Shé');
console.log('  ninguna migración barre la plantilla de Casa Shé: OK');

// ── 2. El horario canónico es coherente ─────────────────────────────────────
const tipos = new Set(CASA_SHE_OFFICIAL_CLASS_TYPES.map((t) => t.name));
const coaches = new Set<string>(CASA_SHE_OFFICIAL_INSTRUCTORS as readonly string[]);
for (const s of CASA_SHE_OFFICIAL_SLOTS) {
    assert.ok(tipos.has(s.classType), `el horario usa un tipo de clase no declarado: ${s.classType}`);
    assert.ok(coaches.has(s.instructor), `el horario usa un coach no declarado: ${s.instructor}`);
    assert.match(s.startTime, /^([01]\d|2[0-3]):[0-5]\d$/, `hora inválida: ${s.startTime}`);
    assert.ok(s.dayOfWeek >= 0 && s.dayOfWeek <= 6, `día inválido: ${s.dayOfWeek}`);
}
assert.equal(CASA_SHE_OFFICIAL_FACILITY, 'Casa Shé — Condesa');
console.log(`  ${CASA_SHE_OFFICIAL_SLOTS.length} horarios, todos con tipo y coach declarados: OK`);

// Un mismo coach no puede estar en dos clases a la vez.
const ocupacion = new Map<string, string>();
for (const s of CASA_SHE_OFFICIAL_SLOTS) {
    const k = `${s.dayOfWeek}|${s.startTime}|${s.instructor}`;
    assert.equal(ocupacion.get(k), undefined,
        `${s.instructor} aparece dos veces el día ${s.dayOfWeek} a las ${s.startTime} (${ocupacion.get(k)} y ${s.classType})`);
    ocupacion.set(k, s.classType);
}
console.log('  ningún coach duplicado en el mismo horario: OK');

// El cupo debe ser el real del estudio (7 lugares; Salsa 6). Con 12 —el valor que
// venía heredado— la plantilla generaría clases sobrevendidas.
for (const t of CASA_SHE_OFFICIAL_CLASS_TYPES) {
    assert.ok(t.maxCapacity <= 7, `${t.name} tiene cupo ${t.maxCapacity}; el salón es de 7`);
}
console.log('  cupos dentro de la capacidad real del salón: OK');

// El builder no truena y calcula la hora de fin de todos.
const filas = buildCasaSheOfficialScheduleRows();
assert.equal(filas.length, CASA_SHE_OFFICIAL_SLOTS.length);
assert.ok(filas.every((f) => /^([01]\d|2[0-3]):[0-5]\d$/.test(f.endTime)), 'alguna hora de fin quedó mal');
console.log('  builder genera las filas completas: OK');

console.log('test-plantilla-sobrevive-deploy: OK');
