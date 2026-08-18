// Test puro: la vigencia de una membresía se calcula en CDMX, no en UTC.
//
// Nace de un caso real (Elodie, 17-ago-2026): pagó a las 18:11 hora de CDMX. El servidor
// corre en UTC, donde ya eran las 00:11 del 18, así que su membresía quedó con
// start_date = 2026-08-18. El selector de reservas exige `start_date <= fecha de la clase`,
// de modo que NO pudo tomar las clases de las 19:00 y 20:00 de esa misma tarde.
import assert from 'node:assert/strict';
import { cdmxToday, addDaysToDate } from '../src/lib/schedule.js';

// --- El caso de Elodie, al minuto ---
const pagoElodie = new Date('2026-08-18T00:11:10Z'); // 17-ago 18:11 en CDMX
assert.equal(cdmxToday(pagoElodie), '2026-08-17',
  'pagar a las 6 PM del 17 debe dar membresía que arranca el 17, no el 18');

// La clase de las 19:00 de ESE día ya entra en vigencia.
const inicio = cdmxToday(pagoElodie);
assert.ok(inicio <= '2026-08-17', 'la clase del mismo día cae dentro de la vigencia');

// --- Frontera del día en CDMX ---
// 23:59:59 CDMX del 17 = 05:59:59 UTC del 18 → sigue siendo 17 en el estudio.
assert.equal(cdmxToday(new Date('2026-08-18T05:59:59Z')), '2026-08-17', 'un minuto antes de medianoche CDMX');
// 00:00:00 CDMX del 18 = 06:00:00 UTC → ya es 18.
assert.equal(cdmxToday(new Date('2026-08-18T06:00:00Z')), '2026-08-18', 'medianoche CDMX exacta');
// Mediodía UTC nunca fue ambiguo: mismo día en ambas zonas.
assert.equal(cdmxToday(new Date('2026-08-18T12:00:00Z')), '2026-08-18', 'mediodía UTC');

// --- Horario de verano: CDMX es UTC-5 en verano y UTC-6 en invierno ---
// Un offset fijo se equivocaría media parte del año; Intl lo resuelve solo.
assert.equal(cdmxToday(new Date('2026-01-15T05:30:00Z')), '2026-01-14', 'invierno (UTC-6)');
assert.equal(cdmxToday(new Date('2026-01-15T06:30:00Z')), '2026-01-15', 'invierno, ya cruzó');

// --- addDaysToDate: aritmética de calendario pura ---
assert.equal(addDaysToDate('2026-08-17', 7), '2026-08-24', 'paquete de 7 días');
assert.equal(addDaysToDate('2026-08-17', 30), '2026-09-16', 'membresía de 30 días');
assert.equal(addDaysToDate('2026-12-28', 7), '2027-01-04', 'cruza de año');
assert.equal(addDaysToDate('2028-02-27', 2), '2028-02-29', 'año bisiesto');
assert.equal(addDaysToDate('2026-08-17', 0), '2026-08-17', 'cero días');

// El resultado sigue siendo comparable como texto (así lo compara Postgres con ::date).
assert.ok('2026-08-17' <= addDaysToDate('2026-08-17', 7), 'inicio <= fin');

console.log('✅ test-membership-dates-cdmx: las vigencias se calculan en hora del estudio');
