// Aviso al estudio cuando entra una reserva de TotalPass: formato del mensaje.
import assert from 'node:assert/strict';
import { construirMensaje } from '../src/lib/totalpass/alerta-admin.js';

const base = { socia: 'Montserrat Rojas', clase: 'Barre', fecha: '2026-07-27', hora: '08:00' };

const normal = construirMensaje({ ...base, coach: 'Regina' });
assert.match(normal, /Nueva reserva de TotalPass/);
assert.match(normal, /Montserrat Rojas/);
assert.match(normal, /Barre · lunes 27 jul, 08:00/);
assert.match(normal, /Coach: Regina/);
assert.ok(!/sobre el cupo/i.test(normal), 'sin sobrecupo no debe advertir');

// Sin coach: no aparece la línea vacía "Coach:"
const sinCoach = construirMensaje({ ...base, coach: null });
assert.ok(!/Coach:/.test(sinCoach), 'sin coach no debe imprimir la etiqueta');

// Sobrecupo: debe advertirlo explícitamente
const lleno = construirMensaje({ ...base, sobrecupo: true });
assert.match(lleno, /por encima del cupo/);

// Fechas de otros días/meses se traducen bien (se arma por partes, sin Date local)
assert.match(construirMensaje({ ...base, fecha: '2026-12-01' }), /martes 1 dic/);
assert.match(construirMensaje({ ...base, fecha: '2026-08-09' }), /domingo 9 ago/);

console.log('test-totalpass-aviso: OK');
