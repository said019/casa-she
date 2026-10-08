/**
 * FitPass: plan de auto-mapeo (puro), llaves de lock, y locks reales contra la BD LOCAL.
 * Correr: DATABASE_URL=postgresql://localhost:5432/casa_she npx tsx scripts/test-fitpass-lessons-locks.ts
 */
import assert from 'node:assert/strict';
import { normalizeClassName, planLessonAutoMap } from '../src/lib/fitpass/lessons.js';
import { FP_LOCKS, withFitpassLock, fitpassClassEditLockKey, withFitpassClassEditLock } from '../src/lib/fitpass/locks.js';
import { pool } from '../src/config/database.js';

assert.equal(normalizeClassName('  Pilates   Mat-GAP  '), 'pilates mat gap');
assert.equal(normalizeClassName('NAVAKARANA Yóga'), 'navakarana yoga');

const lessons = [
    { id: 47206, name: 'PILATES MAT' }, { id: 46820, name: 'BARRE' }, { id: 46834, name: 'DHARMA YOGA' },
    { id: 46823, name: 'FLEX' }, { id: 99999, name: 'INEXISTENTE' }, { id: 46832, name: 'ROCKET YOGA' },
];
const cts = [
    { id: 'a', name: 'Pilates Mat', fitpass_lesson_id: null },
    { id: 'b', name: 'Barre', fitpass_lesson_id: 11111 },            // mapeo manual: no se pisa
    { id: 'c', name: 'Yoga Dharma', fitpass_lesson_id: null },       // por alias
    { id: 'd', name: 'Reformer Classic', fitpass_lesson_id: null },
    { id: 'e', name: 'Reformer Classic', fitpass_lesson_id: null },
    { id: 'f', name: 'Flex', fitpass_lesson_id: null },
    { id: 'g', name: 'Rocket Yoga', fitpass_lesson_id: null },
    { id: 'h', name: 'rocket  yoga', fitpass_lesson_id: null },      // duplicado de nombre -> ambos
];
const plan = planLessonAutoMap(lessons, cts, { 'dharma yoga': 'yoga dharma' });
const got = Object.fromEntries(plan.assignments.map((a) => [a.classTypeId, `${a.lessonId}:${a.via}`]));
assert.deepEqual(got, { a: '47206:name', c: '46834:alias', f: '46823:name', g: '46832:name', h: '46832:name' });
assert.ok(plan.skipped.some((s) => s.classTypeId === 'b' && /no se sobreescribe/.test(s.reason)));
assert.ok(plan.skipped.some((s) => s.lessonId === 99999));
// ambiguo: dos lessons compiten por un class_type -> se salta
const amb = planLessonAutoMap([{ id: 1, name: 'Yoga' }, { id: 2, name: 'Hatha' }], [{ id: 'x', name: 'Yoga', fitpass_lesson_id: null }], { hatha: 'yoga' });
assert.equal(amb.assignments.length, 0);
assert.ok(amb.skipped.some((s) => /ambiguo/.test(s.reason)));
console.log('  ok plan de auto-map');

// Llaves
const keys = Object.values(FP_LOCKS);
assert.equal(new Set(keys).size, keys.length);
for (const k of keys) { assert.ok(Number.isInteger(k)); assert.ok(![471001, 471002, 471003, 471004, 471005].includes(k)); }
const ck = fitpassClassEditLockKey('11111111-1111-1111-1111-111111111111');
assert.ok(ck >= 473_000_000 && ck < 474_000_000);
assert.equal(ck, fitpassClassEditLockKey('11111111-1111-1111-1111-111111111111'));
console.log('  ok llaves de lock');

(async () => {
    // Lock real: el mismo lock tomado dos veces devuelve null la segunda; llaves distintas anidan.
    const out = await withFitpassLock('FP_SYNC_CYCLE', async () => {
        const same = await withFitpassLock('FP_SYNC_CYCLE', async () => 'no debe correr');
        const nested = await withFitpassLock('FP_MUTATE', async () => 'anidado');
        return { same, nested };
    });
    assert.deepEqual(out, { same: null, nested: 'anidado' });
    assert.equal(await withFitpassLock('FP_SYNC_CYCLE', async () => 'libre'), 'libre', 'el lock se libera');
    const cls = '22222222-2222-2222-2222-222222222222';
    const r = await withFitpassClassEditLock(cls, async () => withFitpassClassEditLock(cls, async () => 'x'));
    assert.equal(r, null);
    console.log('  ok locks reales (null si ocupado, se liberan)');
    console.log('test-fitpass-lessons-locks: OK');
    await pool.end();
})().catch(async (e) => { console.error(e); await pool.end(); process.exit(1); });
