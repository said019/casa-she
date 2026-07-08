import assert from 'node:assert/strict';
import { isBarOpenAt, computeBarTotals, canBarTransition, pointsForTotal, canCustomerCancel, nextBarOpening, type BarConfig } from '../src/lib/bar.js';

const cfg: BarConfig = {
  enabled: true,
  // 0=Dom .. 6=Sáb. Mar (2) 07:00–20:00; Dom (0) cerrado.
  operating_hours: { 0: null, 1: { open: '07:00', close: '20:00' }, 2: { open: '07:00', close: '20:00' } },
  lead_time_max_hours: 4,
  pickup_offset_minutes: -2,
  cancellation_window_minutes: 60,
  card_surcharge_percent: 0,
  card_enabled: true,
  points_enabled: false,
  points_redemption_rate: 10,
  preparing_push: true,
  prep_time_minutes: 15,
};

// isBarOpenAt: dentro del horario del lunes
assert.equal(isBarOpenAt(cfg, new Date('2026-07-06T10:00:00-06:00')), true, 'lun 10:00 abierto');
// fuera de horario (antes de abrir)
assert.equal(isBarOpenAt(cfg, new Date('2026-07-06T06:00:00-06:00')), false, 'lun 06:00 cerrado');
// día cerrado (domingo)
assert.equal(isBarOpenAt(cfg, new Date('2026-07-05T10:00:00-06:00')), false, 'dom cerrado');
// barra apagada → nunca abierto
assert.equal(isBarOpenAt({ ...cfg, enabled: false }, new Date('2026-07-06T10:00:00-06:00')), false, 'apagada');

// computeBarTotals: suma líneas, redondea a 2 decimales
const t = computeBarTotals([{ unit_price_mxn: 85, quantity: 2 }, { unit_price_mxn: 75, quantity: 1 }]);
assert.equal(t.subtotal_mxn, 245);
assert.equal(t.total_mxn, 245);

// canBarTransition: máquina de estados
assert.equal(canBarTransition('pending', 'preparing', 'staff'), true);
assert.equal(canBarTransition('preparing', 'ready', 'staff'), true);
assert.equal(canBarTransition('ready', 'delivered', 'staff'), true);
assert.equal(canBarTransition('pending', 'cancelled', 'customer'), true, 'cliente cancela pending');
assert.equal(canBarTransition('preparing', 'cancelled', 'customer'), false, 'cliente NO cancela preparing');
assert.equal(canBarTransition('delivered', 'preparing', 'staff'), false, 'terminal no transiciona');
assert.equal(canBarTransition('pending', 'ready', 'staff'), false, 'no salta de pending a ready');

// computeBarTotals con recargo por tarjeta
const withFee = computeBarTotals([{ unit_price_mxn: 100, quantity: 1 }], { surchargePercent: 4 });
assert.equal(withFee.subtotal_mxn, 100);
assert.equal(withFee.surcharge_mxn, 4);
assert.equal(withFee.total_mxn, 104);
// sin recargo (default 0) — retrocompatible
const noFee = computeBarTotals([{ unit_price_mxn: 85, quantity: 2 }]);
assert.equal(noFee.subtotal_mxn, 170);
assert.equal(noFee.surcharge_mxn, 0);
assert.equal(noFee.total_mxn, 170);

// pointsForTotal: $120 a tasa 10 = 12 puntos; redondea hacia arriba
assert.equal(pointsForTotal(120, 10), 12);
assert.equal(pointsForTotal(125, 10), 13);
assert.equal(pointsForTotal(100, 0), Infinity); // tasa inválida

// canCustomerCancel: recogida a >window minutos → true
const now = new Date('2026-07-07T10:00:00-06:00');
assert.equal(canCustomerCancel(new Date('2026-07-07T12:00:00-06:00'), now, 60), true);  // 120min > 60
assert.equal(canCustomerCancel(new Date('2026-07-07T10:30:00-06:00'), now, 60), false); // 30min < 60

// nextBarOpening tests
const cfgHours: BarConfig = {
  enabled: true,
  operating_hours: {
    0: null, // domingo cerrado
    1: { open: '08:00', close: '20:00' },
    2: { open: '08:00', close: '20:00' },
    3: { open: '08:00', close: '20:00' },
    4: { open: '08:00', close: '20:00' },
    5: { open: '08:00', close: '20:00' },
    6: null, // sábado cerrado
  },
  lead_time_max_hours: 4,
  pickup_offset_minutes: -2,
  cancellation_window_minutes: 60,
  card_surcharge_percent: 0,
  card_enabled: true,
  points_enabled: false,
  points_redemption_rate: 10,
  preparing_push: true,
  prep_time_minutes: 15,
};

// (a) From a Saturday → label mentions "el lunes a las 08:00"
// July 11 2026 is a Saturday
const fromSaturday = new Date(2026, 6, 11, 10, 0, 0); // local time
assert.equal(fromSaturday.getDay(), 6, 'July 11 2026 is Saturday');
const resultA = nextBarOpening(cfgHours, fromSaturday);
assert.ok(resultA !== null, 'Saturday: should find next opening');
assert.equal(resultA!.label, 'el lunes a las 08:00', `Saturday label: ${resultA!.label}`);

// (b) From a weekday before 08:00 → "hoy a las 08:00"
// July 6 2026 is a Monday
const fromMonday0700 = new Date(2026, 6, 6, 7, 0, 0); // local time
assert.equal(fromMonday0700.getDay(), 1, 'July 6 2026 is Monday');
const resultB = nextBarOpening(cfgHours, fromMonday0700);
assert.ok(resultB !== null, 'Monday 07:00: should find next opening');
assert.equal(resultB!.label, 'hoy a las 08:00', `Monday 07:00 label: ${resultB!.label}`);

// (c) From a Friday after 20:00 → "el lunes a las 08:00" (skips weekend)
// July 10 2026 is a Friday
const fromFriday2100 = new Date(2026, 6, 10, 21, 0, 0); // local time
assert.equal(fromFriday2100.getDay(), 5, 'July 10 2026 is Friday');
const resultC = nextBarOpening(cfgHours, fromFriday2100);
assert.ok(resultC !== null, 'Friday 21:00: should find next opening');
assert.equal(resultC!.label, 'el lunes a las 08:00', `Friday 21:00 label: ${resultC!.label}`);

// (d) All-null hours → returns null
const cfgAllNull: BarConfig = { ...cfgHours, operating_hours: { 0: null, 1: null, 2: null, 3: null, 4: null, 5: null, 6: null } };
const resultD = nextBarOpening(cfgAllNull, fromSaturday);
assert.equal(resultD, null, 'All-null hours should return null');

// priceSelectedExtras: dedup + filtra catálogo + snapshot + total
import { priceSelectedExtras, type BarExtra } from '../src/lib/barExtras.js';
const CAT: BarExtra[] = [
  { id: 'a', name: 'Leche de avena', group_label: 'Leche', is_single: true, price_mxn: 10 },
  { id: 'b', name: 'Shot extra', group_label: 'Agregados', is_single: false, price_mxn: 15 },
  { id: 'c', name: 'Sin azúcar', group_label: 'Agregados', is_single: false, price_mxn: 0 },
];
let r = priceSelectedExtras(['a','b'], CAT);
assert.equal(r.total, 25, 'suma precios de extras');
assert.equal(r.snapshot.length, 2, 'snapshot con 2');
r = priceSelectedExtras(['a','a','zzz'], CAT); // dedup + ignora desconocido
assert.equal(r.total, 10, 'dedup + ignora id inexistente');
assert.equal(r.snapshot.length, 1, 'snapshot dedup');
r = priceSelectedExtras([], CAT);
assert.equal(r.total, 0, 'sin extras = 0');

console.log('test-bar OK');
