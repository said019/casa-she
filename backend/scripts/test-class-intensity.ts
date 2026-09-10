import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { intensitySchema } from '../src/lib/classIntensity.js';
import { intensityReference, referenceIntensity, planIntensitySeed } from '../src/lib/classIntensityReference.js';

for (const value of [undefined, null, 1, 2, 3]) assert.equal(intensitySchema.safeParse(value).success, true);
for (const value of [0, 4, -1, 1.5, '2', '', true, {}, [], NaN, Infinity]) {
  assert.equal(intensitySchema.safeParse(value).success, false, String(value));
}
const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const classes = read('../src/routes/classes.ts');
assert.equal((classes.match(/intensity: intensitySchema/g) ?? []).length, 3, 'create, recurring and update validators');
assert.match(classes, /sched\.intensity \?\? null/, 'generation copies schedule intensity');
assert.match(classes, /if \(data\.intensity !== undefined\)/, 'omitted update must preserve intensity');
const copy = read('../src/lib/copy-week.ts');
assert.match(copy, /c\.intensity \?\? null/, 'copy must keep the session value, including null');
assert.match(read('../src/services/cron-jobs.ts'), /schedule\.intensity \?\? null/, 'automatic generation keeps intensity');
assert.match(read('../src/index.ts'), /await query\(classIntensityDDL\)/, 'schema must exist before serving');
console.log('test-class-intensity: OK');

assert.equal(intensityReference.length, 47);
for (const [day, time, discipline, instructor, intensity] of intensityReference) {
  assert.equal(referenceIntensity(day, time, discipline, instructor), intensity);
}
assert.equal(referenceIntensity(2, '20:00:00', 'Barre', 'SHELLE'), 2);
assert.equal(referenceIntensity(2, '19:00', 'Barre', 'Shelle'), 3);
assert.equal(referenceIntensity(3, '09:00', 'Pilates Mat', 'Regina'), 3);
assert.equal(referenceIntensity(1, '09:00', 'Pilates Mat', 'Regina'), 2);
assert.equal(referenceIntensity(6, '09:00', 'Barre', 'Raúl'), 3);
assert.equal(referenceIntensity(1, '19:00', 'Sculpt (Abs & Butt)', 'Raúl'), 3);
assert.equal(referenceIntensity(5, '19:30', 'Salsa', 'Ricardo'), null);
assert.equal(referenceIntensity(1, '09:00', 'Pilates Mat', 'Otro'), null);
assert.equal(referenceIntensity(1, '10:00', 'Pilates Mat', 'Regina'), null);
const row = { id: 'a', day: 1, time: '09:00', discipline: 'Pilates Mat', instructor: 'Regina', intensity: null, facility_id: 'x' };
assert.deepEqual(planIntensitySeed([row]).updates, [{ id: 'a', intensity: 2 }]);
assert.equal(planIntensitySeed([row, { ...row, id: 'b', facility_id: 'y' }]).updates.length, 0);
assert.equal(planIntensitySeed([{ ...row, intensity: 1 }]).updates.length, 0, 'keep manually assigned intensity');
const aliasRow = { ...row, time: '07:00', discipline: 'Dharma' };
assert.equal(planIntensitySeed([aliasRow, { ...aliasRow, id: 'b', discipline: 'Yoga Dharma' }]).updates.length, 0);
const coachAliasRow = { ...row, day: 2, time: '07:00', discipline: 'Flow Yoga', instructor: 'Rob' };
assert.equal(planIntensitySeed([coachAliasRow, { ...coachAliasRow, id: 'b', instructor: 'Roby' }]).updates.length, 0);
assert.equal(planIntensitySeed([{ ...row, date: '2026-09-14' }, { ...row, id: 'b', date: '2026-09-21' }]).updates.length, 2);
console.log('test-class-intensity-reference: OK');
