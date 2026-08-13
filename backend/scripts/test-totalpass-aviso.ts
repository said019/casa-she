// Aviso al estudio cuando entra una reserva de TotalPass: formato del mensaje.
import assert from 'node:assert/strict';
import { construirMensaje, destinatariosWhatsApp } from '../src/lib/totalpass/alerta-admin.js';

const base = { socia: 'Montserrat Rojas', clase: 'Barre', fecha: '2026-07-27', hora: '08:00' };

const normal = construirMensaje({ ...base, coach: 'Regina' });
assert.match(normal, /Nueva reserva de TotalPass/);
assert.match(normal, /Montserrat Rojas/);
assert.match(normal, /Barre · lunes 27 jul, 08:00/);
assert.match(normal, /Coach: Regina/);
assert.ok(!/sobre el cupo/i.test(normal), 'sin sobrecupo no debe advertir');
assert.ok(!/Pago en estudio/.test(normal), 'sin pago en efectivo no debe mostrar la etiqueta');

const pagoEnEstudio = construirMensaje({ ...base, coach: 'Regina', pagoEnEstudio: true });
assert.match(pagoEnEstudio, /Pago en estudio/);

// Sin coach: no aparece la línea vacía "Coach:"
const sinCoach = construirMensaje({ ...base, coach: null });
assert.ok(!/Coach:/.test(sinCoach), 'sin coach no debe imprimir la etiqueta');

// Sobrecupo: debe advertirlo explícitamente
const lleno = construirMensaje({ ...base, sobrecupo: true });
assert.match(lleno, /por encima del cupo/);

// Fechas de otros días/meses se traducen bien (se arma por partes, sin Date local)
assert.match(construirMensaje({ ...base, fecha: '2026-12-01' }), /martes 1 dic/);
assert.match(construirMensaje({ ...base, fecha: '2026-08-09' }), /domingo 9 ago/);

// ── Varios destinatarios ────────────────────────────────────────────────────
// El estudio tiene DOS administradoras. Con un solo número, la otra nunca se
// enteraba de las reservas nuevas.
assert.deepEqual(destinatariosWhatsApp('+525538861972,+525541822309'), ['+525538861972', '+525541822309']);
assert.deepEqual(destinatariosWhatsApp('+525538861972, +525541822309 '), ['+525538861972', '+525541822309']);
assert.deepEqual(destinatariosWhatsApp('+525538861972;+525541822309'), ['+525538861972', '+525541822309']);
assert.deepEqual(destinatariosWhatsApp('+525538861972'), ['+525538861972']);
// Vacíos y comas de más no generan destinatarios fantasma.
assert.deepEqual(destinatariosWhatsApp(''), []);
assert.deepEqual(destinatariosWhatsApp(undefined), []);
assert.deepEqual(destinatariosWhatsApp(' , , '), []);
assert.deepEqual(destinatariosWhatsApp('+525538861972,,'), ['+525538861972']);

// ── El aviso distingue de dónde vino la reserva ─────────────────────────────
assert.match(construirMensaje({ ...base, origen: 'totalpass' }), /Nueva reserva de TotalPass/);
assert.match(construirMensaje({ ...base, origen: 'app' }), /Nueva reserva desde la app/);
assert.match(construirMensaje({ ...base, origen: 'recepcion' }), /Nueva reserva desde recepción/);
// Sin origen sigue diciendo TotalPass (es de donde nació el aviso).
assert.match(construirMensaje(base), /Nueva reserva de TotalPass/);

console.log('test-totalpass-aviso: OK');
