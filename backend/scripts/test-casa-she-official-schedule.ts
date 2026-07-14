import assert from 'node:assert/strict';
import {
  CASA_SHE_OFFICIAL_CLASS_TYPES,
  CASA_SHE_OFFICIAL_INSTRUCTORS,
  CASA_SHE_OFFICIAL_SLOTS,
  buildCasaSheOfficialScheduleRows,
} from '../src/data/casa-she-official-schedule.js';

const expectedByDay = new Map<number, number>([
  [0, 6], [1, 11], [2, 10], [3, 8], [4, 6], [5, 6], [6, 7],
]);

const rows = buildCasaSheOfficialScheduleRows();
assert.equal(rows.length, 54, 'el PDF oficial debe producir 54 plantillas semanales');

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

assert.equal(find(5, '20:00', 'Salsa')?.instructor, 'Raúl', 'la Salsa ambigua del viernes debe ser 20:00');
assert.equal(find(2, '08:00', 'Pilates Mat')?.instructor, 'Isaí', 'el coach omitido del martes debe ser Isaí');
assert.equal(find(6, '12:00', 'Navakarana')?.instructor, 'Pau', 'el coach omitido del sábado debe ser Pau');
assert.equal(find(3, '19:00', 'Sculpt Booty')?.endTime, '19:50');
assert.equal(find(3, '19:00', 'Power Vinyasa')?.endTime, '20:00');

assert.equal(CASA_SHE_OFFICIAL_SLOTS.length, 54);
console.log('✓ Horario oficial Casa Shé: 54 plantillas válidas (6/11/10/8/6/6/7).');
