import assert from 'node:assert/strict';
import { isBarOpenAt, computeBarTotals, canBarTransition, type BarConfig } from '../src/lib/bar.js';

const cfg: BarConfig = {
  enabled: true,
  // 0=Dom .. 6=Sáb. Mar (2) 07:00–20:00; Dom (0) cerrado.
  operating_hours: { 0: null, 1: { open: '07:00', close: '20:00' }, 2: { open: '07:00', close: '20:00' } },
  lead_time_max_hours: 4,
  pickup_offset_minutes: -2,
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

console.log('test-bar OK');
