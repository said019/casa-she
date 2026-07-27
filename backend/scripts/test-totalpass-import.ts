import assert from 'node:assert/strict';
import {
    extractOfficialReservationRows,
    tpClassKey,
    decideTotalPassCancellations,
} from '../src/lib/totalpass/source.js';
import type { TotalPassOfficialSlot } from '../src/lib/totalpass/client.js';

// ── extractOfficialReservationRows ───────────────────────────────────────────
// Solo pasa 'confirmed'; rebana fecha/hora sin convertir zona; trim del título.
const slots: TotalPassOfficialSlot[] = [
    {
        _id: 'slot-confirmed',
        status: 'confirmed',
        slotDate: '2026-07-20T00:00:00.000Z',
        startTime: '18:30:00',
        user: { name: '  Ana Pérez ', email: 'ana@example.com', phone: '5512345678', document_number: 'PEXA900101' },
        event: { title: '  Reformer Flow  ' },
    },
    {
        _id: 'slot-cancelled',
        status: 'cancelled', // no confirmado → se descarta
        slotDate: '2026-07-20T00:00:00.000Z',
        startTime: '18:30:00',
        user: { name: 'Otra' },
        event: { title: 'Reformer Flow' },
    },
    {
        _id: 'slot-no-title',
        status: 'confirmed',
        slotDate: '2026-07-21T00:00:00.000Z',
        startTime: '07:00:00',
        user: { name: 'Sin Clase' },
        event: { title: '   ' }, // sin título → se descarta
    },
    {
        _id: '', // sin _id → se descarta
        status: 'confirmed',
        slotDate: '2026-07-22T00:00:00.000Z',
        startTime: '09:00:00',
        event: { title: 'Barre' },
    },
];

const rows = extractOfficialReservationRows(slots);
assert.equal(rows.length, 1, 'solo la fila confirmada, con título y _id');
assert.equal(rows[0].sourceRef, 'slot-confirmed');
assert.equal(rows[0].classTitle, 'Reformer Flow', 'título con trim');
assert.equal(rows[0].date, '2026-07-20', 'fecha rebanada (0,10), sin convertir zona');
assert.equal(rows[0].startTime, '18:30', 'hora rebanada (0,5)');
assert.equal(rows[0].displayName, 'Ana Pérez', 'nombre con trim');
assert.equal(rows[0].email, 'ana@example.com');
assert.equal(rows[0].phone, '5512345678');
assert.equal(rows[0].documentNumber, 'PEXA900101');

// Fallbacks: nombre vacío → 'Cliente TotalPass'; campos ausentes → null.
const minimal = extractOfficialReservationRows([
    {
        _id: 'slot-min',
        status: 'confirmed',
        slotDate: '2026-07-20',
        startTime: '06:00',
        event: { title: 'Sculpt' },
    },
]);
assert.equal(minimal.length, 1);
assert.equal(minimal[0].displayName, 'Cliente TotalPass');
assert.equal(minimal[0].email, null);
assert.equal(minimal[0].phone, null);
assert.equal(minimal[0].documentNumber, null);
assert.equal(minimal[0].startTime, '06:00');

// Entrada vacía / basura no truena.
assert.deepEqual(extractOfficialReservationRows([]), []);
assert.deepEqual(extractOfficialReservationRows(undefined as unknown as TotalPassOfficialSlot[]), []);

// ── tpClassKey ───────────────────────────────────────────────────────────────
assert.equal(tpClassKey('Reformer Flow', '2026-07-20', '18:30'), 'Reformer Flow|2026-07-20|18:30');
// Normaliza: trim del título, slice de fecha (0,10) y hora (0,5).
assert.equal(
    tpClassKey('  Reformer Flow  ', '2026-07-20T00:00:00Z', '18:30:00'),
    'Reformer Flow|2026-07-20|18:30',
);

// ── decideTotalPassCancellations (3 casos conservadores) ─────────────────────
const localBookings = [
    { id: 'b-present', sourceRef: 'slot-A', key: 'Reformer|2026-07-20|18:30' }, // slot presente
    { id: 'b-gone-read', sourceRef: 'slot-B', key: 'Reformer|2026-07-20|18:30' }, // ausente + clase leída
    { id: 'b-gone-unread', sourceRef: 'slot-C', key: 'Barre|2026-07-25|09:00' }, // ausente + clase NO leída
];
const presentSlotIds = new Set(['slot-A']);
const readClassKeys = new Set(['Reformer|2026-07-20|18:30']); // solo la clase de A/B se leyó

const decision = decideTotalPassCancellations(localBookings, presentSlotIds, readClassKeys);
// Caso 1: slot presente → stillActive, nunca se cancela.
assert.equal(decision.stillActive, 1);
assert.ok(!decision.toCancel.includes('b-present'));
// Caso 2: slot ausente + clase leída → toCancel.
assert.deepEqual(decision.toCancel, ['b-gone-read']);
// Caso 3: slot ausente + clase NO leída → skipped (jamás cancelar por incertidumbre).
assert.equal(decision.skipped, 1);
assert.ok(!decision.toCancel.includes('b-gone-unread'));

// Sin reservas locales → decisión vacía.
const emptyDecision = decideTotalPassCancellations([], new Set(), new Set());
assert.deepEqual(emptyDecision, { toCancel: [], stillActive: 0, skipped: 0 });

console.log('test-totalpass-import: OK');

// ── esSlotVivo: qué estados de TotalPass NO deben cancelar la reserva local ───
// Regresión del bug del 27-jul-2026: la reconciliación armaba "slots presentes"
// solo con los `confirmed`, así que al pasar la clase TotalPass marcaba la reserva
// como `expired` y nosotros la cancelábamos, borrando el historial de la socia.
import { esSlotVivo } from '../src/lib/totalpass/source.js';

// Siguen siendo reservas válidas (NO cancelar):
assert.equal(esSlotVivo('confirmed'), true);
assert.equal(esSlotVivo('expired'), true, 'expired = la clase pasó sin usarse, NO es cancelación');
assert.equal(esSlotVivo('created'), true, 'created = recién hecha, pendiente de validar');
// Sí se cayeron (cancelar):
assert.equal(esSlotVivo('canceled'), false);
assert.equal(esSlotVivo('cancelled'), false, 'tolerar la grafía con doble L');
assert.equal(esSlotVivo('denied'), false);
// Mayúsculas y basura
assert.equal(esSlotVivo('EXPIRED'), true);
assert.equal(esSlotVivo('CANCELED'), false);
assert.equal(esSlotVivo(null), true, 'sin estado: se conserva, nunca se cancela por omisión');

console.log('test-totalpass-import (esSlotVivo): OK');
