import assert from 'node:assert/strict';
import { formatTpCancelDeadlinePanel, TP_CANCEL_HOURS } from '../src/lib/totalpass/cancel-format.js';
import { buildIndividualInput, placeNameMatchesCasaShe } from '../src/lib/totalpass/publish.js';

// ── (a) formatTpCancelDeadlinePanel: parte pura DST-aware ─────────────────────
// Clase 19:00 hora CDMX − 4h = 15:00 = 03:00 PM, mismo día, formato panel.
assert.equal(
    formatTpCancelDeadlinePanel('2026-07-20', '19:00', 4),
    '2026-07-20 03:00 PM',
    'deadline 19:00 -4h => 2026-07-20 03:00 PM',
);
// Cruce de medianoche: 01:00 − 4h = 21:00 del día anterior.
assert.equal(
    formatTpCancelDeadlinePanel('2026-07-20', '01:00', 4),
    '2026-07-19 09:00 PM',
    'deadline 01:00 -4h => 2026-07-19 09:00 PM',
);
assert.equal(TP_CANCEL_HOURS, 4, 'TP_CANCEL_HOURS = 4');

// ── (b) buildIndividualInput: arma el TotalPassIndividualInput oficial ────────
const input = buildIndividualInput(
    { id: 'class-abc', date: '2026-07-20', start_time: '19:00:00' },
    { name: '  Reformer Flow  ', duration_minutes: 50 },
    'Ana López',
    5,
    42,
);
assert.equal(input.title, 'Reformer Flow', 'title con trim');
assert.equal(input.responsible, 'Ana López', 'responsible = coach del día');
assert.equal(input.duration, 50, 'duration del tipo');
assert.equal(input.slots, 5, 'slots = techo del canal (parametrizado)');
assert.equal(input.planId, 42, 'planId parametrizado');
assert.equal(input.timezone, 'es-MX', 'timezone es-MX');
assert.equal(input.eventDate, '2026-07-20', 'eventDate YYYY-MM-DD');
assert.equal(input.startTime, '07:00 PM', 'startTime en 12h hh:mm AM/PM');
assert.equal(input.status, 'ACTIVE', 'status ACTIVE');
assert.equal(input.externalReference, 'class-abc', 'externalReference = classId');
assert.ok(input.maxTimeToCancel, 'maxTimeToCancel presente');
assert.equal(input.maxTimeToCancel, '2026-07-20 03:00 PM', 'maxTimeToCancel = deadline panel');

// Fallbacks: sin coach => GYM_DEFAULT_COACH; sin duración => 50; start_time "HH:MM".
const fallback = buildIndividualInput(
    { id: 'c2', date: '2026-07-21', start_time: '08:30' },
    { name: 'Barre', duration_minutes: null },
    null,
    3,
    7,
);
assert.equal(fallback.duration, 50, 'duración default 50 cuando el tipo no la trae');
assert.ok(fallback.responsible.length > 0, 'responsible default no vacío (GYM_DEFAULT_COACH)');
assert.equal(fallback.startTime, '08:30 AM', 'startTime 08:30 => 08:30 AM');
assert.equal(fallback.externalReference, 'c2', 'externalReference = classId (fallback)');

// ── (c) placeNameMatchesCasaShe: salvaguarda spec §6 (Fix 2) ─────────────────
assert.equal(placeNameMatchesCasaShe('Casa Shé'), true, 'acepta nombre exacto con acento');
assert.equal(placeNameMatchesCasaShe('CASA SHE'), true, 'acepta mayúsculas sin acento');
assert.equal(placeNameMatchesCasaShe('Casa She Studio'), true, 'acepta que el nombre CONTENGA casa she');
assert.equal(placeNameMatchesCasaShe('Otro Studio'), false, 'rechaza un place distinto');
assert.equal(placeNameMatchesCasaShe(''), false, 'rechaza nombre vacío');

console.log('test-totalpass-publish: OK');
