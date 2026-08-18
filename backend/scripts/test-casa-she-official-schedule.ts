import assert from 'node:assert/strict';
import {
  CASA_SHE_OFFICIAL_CLASS_TYPES,
  CASA_SHE_OFFICIAL_INSTRUCTORS,
  CASA_SHE_OFFICIAL_SLOTS,
  buildCasaSheOfficialScheduleRows,
} from '../src/data/casa-she-official-schedule.js';

// Horario canónico de agosto 2026 (commit 8d34a47, "horario de agosto canónico"):
// pasó de 54 a 64 slots con 7 tipos de clase nuevos y las coaches Shelle, Sol y
// Ricardo. Ese commit actualizó la prueba nueva pero dejó ésta clavada en los 54
// viejos, así que el `npm test` completo llevaba semanas cortándose aquí y ningún
// test posterior de la cadena llegaba a correr.
const expectedByDay = new Map<number, number>([
  [0, 6], [1, 11], [2, 12], [3, 10], [4, 9], [5, 7], [6, 9],
]);

const rows = buildCasaSheOfficialScheduleRows();
assert.equal(rows.length, 64, 'el horario oficial de agosto debe producir 64 plantillas semanales');
assert.equal(
  [...expectedByDay.values()].reduce((a, b) => a + b, 0),
  rows.length,
  'la suma por día debe cuadrar con el total (si no, la expectativa quedó a medio actualizar)',
);

for (const [day, expected] of expectedByDay) {
  assert.equal(rows.filter((row) => row.dayOfWeek === day).length, expected, `total incorrecto para día ${day}`);
}

const typeNames = new Set(CASA_SHE_OFFICIAL_CLASS_TYPES.map((type) => type.name));
const instructorNames = new Set<string>(CASA_SHE_OFFICIAL_INSTRUCTORS);
for (const row of rows) {
  assert.ok(typeNames.has(row.classType), `tipo no definido: ${row.classType}`);
  assert.ok(instructorNames.has(row.instructor), `coach no definido: ${row.instructor}`);
  assert.match(row.startTime, /^([01]\d|2[0-3]):[0-5]\d$/);
  assert.match(row.endTime, /^([01]\d|2[0-3]):[0-5]\d$/);
}

const uniqueKeys = new Set(rows.map((row) =>
  `${row.dayOfWeek}|${row.startTime}|${row.classType}|${row.instructor}`
));
assert.equal(uniqueKeys.size, rows.length, 'hay plantillas oficiales duplicadas');

const find = (day: number, time: string, type: string) =>
  rows.find((row) => row.dayOfWeek === day && row.startTime === time && row.classType === type);

// Ricardo tomó la Salsa del viernes en el horario de agosto (Raúl sigue con el
// Barre del miércoles, no desapareció).
assert.equal(find(5, '20:00', 'Salsa')?.instructor, 'Ricardo', 'la Salsa ambigua del viernes debe ser 20:00');
assert.equal(find(2, '08:00', 'Pilates Mat')?.instructor, 'Isaí', 'el coach omitido del martes debe ser Isaí');
assert.equal(find(6, '12:00', 'Navakarana')?.instructor, 'Pau', 'el coach omitido del sábado debe ser Pau');
// Dos clases arrancan a la misma hora con duraciones distintas (50 vs 60 min);
// "Sculpt Booty" se llama solo "Sculpt" desde el horario de agosto.
assert.equal(find(3, '19:00', 'Sculpt')?.endTime, '19:50');
assert.equal(find(3, '19:00', 'Power Vinyasa')?.endTime, '20:00');

assert.equal(CASA_SHE_OFFICIAL_SLOTS.length, 64);
console.log('✓ Horario oficial Casa Shé: 64 plantillas válidas (6/11/12/10/9/7/9).');
