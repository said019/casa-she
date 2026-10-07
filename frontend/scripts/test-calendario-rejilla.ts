// Semana por horas: horas visibles, compactado de las horas sin clases, posición
// de cada clase, carriles cuando dos se enciman y la línea de "ahora" en CDMX.
// Correr con: npx tsx scripts/test-calendario-rejilla.ts
import assert from 'node:assert/strict';
import {
    ALTO_FRANJA,
    ALTO_HORA,
    ALTO_TARJETA_MINIMO,
    aMinutos,
    ahoraEnCdmx,
    carriles,
    construirRejilla,
    intervaloDeClase,
    lineaAhora,
    posicionDeClase,
    tituloSemana,
    yDeMinuto,
} from '../src/pages/admin/classes/calendario/rejilla.js';

const c = (start_time: string, end_time: string) => ({ start_time, end_time });

// ── aMinutos ────────────────────────────────────────────────────────────────
assert.equal(aMinutos('07:30'), 450);
assert.equal(aMinutos('07:30:00'), 450);
assert.equal(aMinutos('7:05'), 425);
for (const malo of [null, undefined, '', 'abc', '24:00', '07:75']) {
    assert.equal(aMinutos(malo), null, `aMinutos(${JSON.stringify(malo)})`);
}

// ── intervaloDeClase: sin fin válido dura 60 min (nunca alto 0) ─────────────
assert.deepEqual(intervaloDeClase(c('07:00', '07:50')), { inicio: 420, fin: 470 });
assert.deepEqual(intervaloDeClase(c('07:00', '07:00')), { inicio: 420, fin: 480 });
assert.deepEqual(intervaloDeClase(c('07:00', '')), { inicio: 420, fin: 480 });
assert.deepEqual(intervaloDeClase(c('23:30', '')), { inicio: 1410, fin: 1440 });
assert.equal(intervaloDeClase(c('', '08:00')), null);

// ── construirRejilla: la semana de la prueba en navegador ───────────────────
// Ocupadas 7, 8, 10, 18 y 19 h. El hueco de las 9 (1 h) se queda; 11–18 se compacta.
const semana = [c('07:00', '07:50'), c('08:00', '08:50'), c('10:00', '11:00'), c('18:00', '18:50'), c('19:00', '19:50')];
const r = construirRejilla(semana);
assert.deepEqual(r.tramos, [
    { tipo: 'horas', desde: 420, hasta: 660, top: 0, alto: 4 * ALTO_HORA },
    { tipo: 'franja', desde: 660, hasta: 1080, top: 304, alto: ALTO_FRANJA, etiqueta: '11 – 18' },
    { tipo: 'horas', desde: 1080, hasta: 1200, top: 336, alto: 2 * ALTO_HORA },
]);
assert.equal(r.altoTotal, 488);
assert.deepEqual(
    r.horas.map((h) => [h.etiqueta, h.top]),
    [['7:00', 0], ['8:00', 76], ['9:00', 152], ['10:00', 228], ['18:00', 336], ['19:00', 412]],
);

// Un hueco de 1 h se ve completo; uno de 2 h ya es franja.
assert.equal(construirRejilla([c('07:00', '08:00'), c('09:00', '10:00')]).tramos.length, 1);
const dos = construirRejilla([c('07:00', '08:00'), c('10:00', '11:00')]);
assert.deepEqual(dos.tramos.map((t) => t.tipo), ['horas', 'franja', 'horas']);
assert.equal(dos.tramos[1].tipo === 'franja' ? dos.tramos[1].etiqueta : '', '8 – 10');

// Semana vacía: 7:00 a 21:00, sin franjas.
assert.deepEqual(construirRejilla([]).tramos, [{ tipo: 'horas', desde: 420, hasta: 1260, top: 0, alto: 14 * ALTO_HORA }]);
// Clases sin hora válida no rompen nada.
assert.deepEqual(construirRejilla([c('', '')]).tramos, construirRejilla([]).tramos);
// Una clase que cruza la hora en punto ocupa las dos horas.
assert.deepEqual(construirRejilla([c('07:30', '08:20')]).tramos, [{ tipo: 'horas', desde: 420, hasta: 540, top: 0, alto: 2 * ALTO_HORA }]);
// Horarios no redondos (13:05) caen en su hora.
assert.deepEqual(construirRejilla([c('13:05', '13:55')]).tramos, [{ tipo: 'horas', desde: 780, hasta: 840, top: 0, alto: ALTO_HORA }]);

// ── yDeMinuto ───────────────────────────────────────────────────────────────
assert.equal(yDeMinuto(r, 420), 0);
assert.equal(yDeMinuto(r, 505), (85 / 60) * ALTO_HORA);
assert.equal(yDeMinuto(r, 660), 304);
assert.equal(yDeMinuto(r, 870), 304 + ALTO_FRANJA / 2); // 14:30, a la mitad de la franja 11–18
assert.equal(yDeMinuto(r, 1080), 336);
assert.equal(yDeMinuto(r, 1200), 488);
assert.equal(yDeMinuto(r, 419), null);
assert.equal(yDeMinuto(r, 1201), null);

// ── posicionDeClase: 2 px de aire arriba y abajo ────────────────────────────
assert.deepEqual(posicionDeClase(r, c('07:00', '07:50')), { top: 2, alto: 59, completa: true });
assert.deepEqual(posicionDeClase(r, c('08:00', '08:50')), { top: 78, alto: 59, completa: true });
assert.deepEqual(posicionDeClase(r, c('10:00', '11:00')), { top: 230, alto: 72, completa: true });
assert.deepEqual(posicionDeClase(r, c('18:00', '18:50')), { top: 338, alto: 59, completa: true });
const corta = construirRejilla([c('07:00', '07:30')]);
assert.deepEqual(posicionDeClase(corta, c('07:00', '07:30')), { top: 2, alto: 34, completa: false });
assert.deepEqual(posicionDeClase(corta, c('07:00', '07:10')), { top: 2, alto: ALTO_TARJETA_MINIMO, completa: false });
assert.deepEqual(posicionDeClase(corta, c('07:00', '07:00')), { top: 2, alto: 72, completa: true }); // sin fin: 60 min
assert.equal(posicionDeClase(corta, c('09:00', '09:50')), null); // fuera de la rejilla
assert.equal(posicionDeClase(corta, c('', '07:50')), null);

// ── carriles ────────────────────────────────────────────────────────────────
const iv = (id: string, inicio: string, fin: string) => ({ id, ...intervaloDeClase(c(inicio, fin))! });
assert.deepEqual(Object.fromEntries(carriles([iv('a', '07:00', '07:50'), iv('b', '08:00', '08:50')])), {
    a: { carril: 0, total: 1 },
    b: { carril: 0, total: 1 },
});
// Una cancelada y su reemplazo a la misma hora: lado a lado, ninguna tapa a la otra.
assert.deepEqual(Object.fromEntries(carriles([iv('nueva', '19:00', '19:50'), iv('cancelada', '19:00', '19:50')])), {
    cancelada: { carril: 0, total: 2 },
    nueva: { carril: 1, total: 2 },
});
// Cadena A 7:00–8:00, B 7:30–8:30, C 8:00–9:00: dos columnas; C reusa la de A.
assert.deepEqual(Object.fromEntries(carriles([iv('A', '07:00', '08:00'), iv('B', '07:30', '08:30'), iv('C', '08:00', '09:00')])), {
    A: { carril: 0, total: 2 },
    B: { carril: 1, total: 2 },
    C: { carril: 0, total: 2 },
});
// Pegadas (una termina cuando empieza la otra) no se enciman.
assert.equal(carriles([iv('x', '07:00', '08:00'), iv('y', '08:00', '09:00')]).get('y')?.total, 1);
assert.equal(carriles([]).size, 0);

// ── ahoraEnCdmx: CDMX es UTC−6 todo el año ──────────────────────────────────
assert.deepEqual(ahoraEnCdmx(new Date('2026-11-04T14:25:00Z')), { fecha: '2026-11-04', minutos: 505 });
// 03:30 UTC del 8 de octubre todavía es el 7 a las 21:30 en el estudio.
assert.deepEqual(ahoraEnCdmx(new Date('2026-10-08T03:30:00Z')), { fecha: '2026-10-07', minutos: 1290 });
// Medianoche: minuto 0, nunca 24:00.
assert.deepEqual(ahoraEnCdmx(new Date('2026-11-05T06:00:00Z')), { fecha: '2026-11-05', minutos: 0 });

// ── lineaAhora ──────────────────────────────────────────────────────────────
const fechas = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08'];
assert.deepEqual(lineaAhora(r, fechas, { fecha: '2026-11-04', minutos: 505 }), { fecha: '2026-11-04', top: 108 });
assert.deepEqual(lineaAhora(r, fechas, { fecha: '2026-11-04', minutos: 870 }), { fecha: '2026-11-04', top: 320 });
assert.equal(lineaAhora(r, fechas, { fecha: '2026-11-09', minutos: 505 }), null); // otra semana
assert.equal(lineaAhora(r, fechas, { fecha: '2026-11-04', minutos: 6 * 60 }), null); // antes de la primera hora

// ── tituloSemana ────────────────────────────────────────────────────────────
assert.equal(tituloSemana(new Date(2026, 10, 2)), '2 – 8 de noviembre de 2026');
assert.equal(tituloSemana(new Date(2026, 8, 28)), '28 de septiembre – 4 de octubre de 2026');
assert.equal(tituloSemana(new Date(2026, 11, 28)), '28 de diciembre de 2026 – 3 de enero de 2027');

console.log('✅ test-calendario-rejilla OK');
