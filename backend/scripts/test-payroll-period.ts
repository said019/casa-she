import assert from 'node:assert/strict';
import {
    currentPeriodToken,
    isValidPeriodToken,
    lastDayOfMonth,
    normalizeFrequency,
    resolvePeriodToken,
} from '../src/lib/payrollPeriod.js';

// --- lastDayOfMonth ---
assert.equal(lastDayOfMonth(2026, 6), 30, 'junio 30 días');
assert.equal(lastDayOfMonth(2026, 2), 28, 'feb 2026 no bisiesto');
assert.equal(lastDayOfMonth(2024, 2), 29, 'feb 2024 bisiesto');
assert.equal(lastDayOfMonth(2026, 12), 31, 'dic 31 días');

// --- normalizeFrequency: solo 'biweekly' sobrevive; el resto (incl. legacy 'weekly') → monthly ---
assert.equal(normalizeFrequency('biweekly'), 'biweekly');
assert.equal(normalizeFrequency('monthly'), 'monthly');
assert.equal(normalizeFrequency('weekly'), 'monthly');
assert.equal(normalizeFrequency(undefined), 'monthly');
assert.equal(normalizeFrequency(null), 'monthly');

// --- isValidPeriodToken ---
assert.equal(isValidPeriodToken('2026-06'), true);
assert.equal(isValidPeriodToken('2026-06-Q1'), true);
assert.equal(isValidPeriodToken('2026-06-Q2'), true);
assert.equal(isValidPeriodToken('2026-13'), false, 'mes 13 inválido');
assert.equal(isValidPeriodToken('2026-06-Q3'), false, 'quincena 3 inválida');
assert.equal(isValidPeriodToken('2026-06-15'), false, 'fecha completa no es token');
assert.equal(isValidPeriodToken('junio'), false);

// --- resolvePeriodToken: mensual ---
const m = resolvePeriodToken('2026-06');
assert.equal(m.frequency, 'monthly');
assert.equal(m.start, '2026-06-01');
assert.equal(m.endIncl, '2026-06-30');
assert.equal(m.endExclusive, '2026-07-01');
assert.equal(m.monthStart, '2026-06-01');
assert.equal(m.label, 'Junio 2026');

// diciembre cruza de año en endExclusive
assert.equal(resolvePeriodToken('2026-12').endExclusive, '2027-01-01');

// --- resolvePeriodToken: quincena 1 (1–15) ---
const q1 = resolvePeriodToken('2026-06-Q1');
assert.equal(q1.frequency, 'biweekly');
assert.equal(q1.start, '2026-06-01');
assert.equal(q1.endIncl, '2026-06-15');
assert.equal(q1.endExclusive, '2026-06-16');
assert.equal(q1.monthStart, '2026-06-01');
assert.equal(q1.label, '1–15 Jun 2026');

// --- resolvePeriodToken: quincena 2 (16–fin de mes) ---
const q2 = resolvePeriodToken('2026-06-Q2');
assert.equal(q2.start, '2026-06-16');
assert.equal(q2.endIncl, '2026-06-30');
assert.equal(q2.endExclusive, '2026-07-01');
assert.equal(q2.monthStart, '2026-06-01');
assert.equal(q2.label, '16–30 Jun 2026');

// febrero no bisiesto: Q2 termina el 28
assert.equal(resolvePeriodToken('2026-02-Q2').endIncl, '2026-02-28');
// febrero bisiesto: Q2 termina el 29
assert.equal(resolvePeriodToken('2024-02-Q2').endIncl, '2024-02-29');
assert.equal(resolvePeriodToken('2024-02-Q2').label, '16–29 Feb 2024');

assert.throws(() => resolvePeriodToken('2026-13'), 'mes inválido lanza');
assert.throws(() => resolvePeriodToken('nope'), 'token basura lanza');

// --- currentPeriodToken ---
assert.equal(currentPeriodToken('monthly', '2026-06-09'), '2026-06');
assert.equal(currentPeriodToken('biweekly', '2026-06-01'), '2026-06-Q1');
assert.equal(currentPeriodToken('biweekly', '2026-06-15'), '2026-06-Q1', 'día 15 es Q1');
assert.equal(currentPeriodToken('biweekly', '2026-06-16'), '2026-06-Q2', 'día 16 es Q2');
assert.equal(currentPeriodToken('biweekly', '2026-06-30'), '2026-06-Q2');

// las dos quincenas cubren el mes completo sin huecos ni traslapes
const a = resolvePeriodToken('2026-06-Q1');
const b = resolvePeriodToken('2026-06-Q2');
assert.equal(a.endExclusive, b.start, 'Q1 termina justo donde empieza Q2');
assert.equal(b.endExclusive, resolvePeriodToken('2026-06').endExclusive, 'Q2 termina con el mes');

console.log('test-payroll-period: OK');
