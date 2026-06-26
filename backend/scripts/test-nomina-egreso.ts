import assert from 'node:assert/strict';
import { buildCoachPayrollEgreso, formatMonthLabelEs } from '../src/lib/coachPayrollEgreso.js';

// --- formatMonthLabelEs: 'YYYY-MM' -> 'Mes Año' en español ---
assert.equal(formatMonthLabelEs('2026-01'), 'Enero 2026');
assert.equal(formatMonthLabelEs('2026-05'), 'Mayo 2026');
assert.equal(formatMonthLabelEs('2026-12'), 'Diciembre 2026');
assert.throws(() => formatMonthLabelEs('2026-13'), 'mes fuera de rango debe lanzar');
assert.throws(() => formatMonthLabelEs('mayo'), 'formato inválido debe lanzar');

// --- buildCoachPayrollEgreso: arma la fila de egreso a partir del payout ---
const base = {
    payoutId: 'payout-1',
    coachName: 'Juan Pérez',
    periodLabel: formatMonthLabelEs('2026-05'),
    classesCount: 4,
    payRatePerClass: 150,
    amount: 600,
    facilityId: 'fac-1',
    createdBy: 'admin-1',
    today: '2026-06-19',
};

const e = buildCoachPayrollEgreso(base);
assert.equal(e.category, 'nomina', 'categoría debe ser nomina');
assert.equal(e.status, 'pagado', 'estado debe ser pagado');
assert.equal(e.payment_method, 'transfer', 'método de pago debe ser transfer (no toca caja)');
assert.equal(e.concept, 'Nómina Juan Pérez - Mayo 2026');
assert.equal(e.description, '4 clases × $150');

// --- periodo quincenal: la etiqueta llega ya formateada ---
assert.equal(
    buildCoachPayrollEgreso({ ...base, periodLabel: '1–15 May 2026' }).concept,
    'Nómina Juan Pérez - 1–15 May 2026',
);
assert.equal(e.amount, 600);
assert.equal(e.date, '2026-06-19', 'fecha = día de pago inyectado');
assert.equal(e.vendor, 'Juan Pérez');
assert.equal(e.facility_id, 'fac-1');
assert.equal(e.source_payout_id, 'payout-1', 'vínculo con el payout');
assert.equal(e.created_by, 'admin-1');

// --- singular: 1 clase (no "1 clases") ---
assert.equal(buildCoachPayrollEgreso({ ...base, classesCount: 1 }).description, '1 clase × $150');

// --- facility nula permitida (nómina total del mes) ---
assert.equal(buildCoachPayrollEgreso({ ...base, facilityId: null }).facility_id, null);

console.log('test-nomina-egreso: OK');
