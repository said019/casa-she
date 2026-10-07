// Lugares de una clase (alumnas de Casa Shé, socias por plataforma, libres),
// colores de los puntos y resúmenes de día y semana.
// Correr con: npx tsx scripts/test-calendario-lugares.ts
import assert from 'node:assert/strict';
import { CANALES } from '../src/lib/canales.js';
import {
    ANILLO_LIBRE_CLARO,
    ANILLO_LIBRE_OSCURO,
    MAX_PUNTOS_TARJETA,
    estiloDeLugar,
    etiquetaCupo,
    etiquetaCupoLarga,
    lugaresDeClase,
    resumenDeClases,
    textoResumenDia,
    textoResumenSemana,
    type Lugar,
} from '../src/pages/admin/classes/calendario/lugares.js';
import {
    COLOR_ALUMNA_POR_DEFECTO,
    FONDO_TARJETA,
    colorPuntoAlumna,
    contraste,
    fondoDeTarjeta,
    mezclarConFondo,
} from '../src/pages/admin/classes/calendario/colores.js';

const tipos = (ls: Lugar[]) => ls.map((l) => (l.tipo === 'canal' ? l.canal : l.tipo));

// ── lugaresDeClase ──────────────────────────────────────────────────────────
// Barre de la prueba en navegador: 3 inscritas, 1 de TotalPass.
const barre = lugaresDeClase({ current_bookings: 3, max_capacity: 7, channels: [{ channel: 'totalpass', max: 2, booked: 1 }] });
assert.deepEqual(tipos(barre.lugares), ['alumna', 'alumna', 'totalpass', 'libre', 'libre', 'libre', 'libre']);
assert.equal(barre.alumnas, 2);
assert.equal(barre.socias, 1);
assert.equal(barre.libres, 4);
assert.equal(etiquetaCupo(barre), '3/7');
assert.equal(etiquetaCupoLarga(barre), '3 de 7 · 4 libres');

const llena = lugaresDeClase({ current_bookings: 7, max_capacity: 7, channels: [{ channel: 'totalpass', max: 2, booked: 2 }] });
assert.equal(etiquetaCupo(llena), 'Lleno');
assert.equal(etiquetaCupoLarga(llena), '7 de 7 · llena');
assert.equal(etiquetaCupoLarga(lugaresDeClase({ current_bookings: 6, max_capacity: 7 })), '6 de 7 · 1 libre');

// Orden: alumnas, canales del catálogo (TotalPass, Fitpass), otros canales, libres.
const varios = lugaresDeClase({
    current_bookings: 5,
    max_capacity: 7,
    channels: [
        { channel: 'wellhub', max: 1, booked: 1 },
        { channel: 'fitpass', max: 2, booked: 1 },
        { channel: 'totalpass', max: 2, booked: 2 },
    ],
});
assert.deepEqual(tipos(varios.lugares), ['alumna', 'totalpass', 'totalpass', 'fitpass', 'wellhub', 'libre', 'libre']);
assert.deepEqual(varios.porCanal, [
    { canal: 'totalpass', reservados: 2 },
    { canal: 'fitpass', reservados: 1 },
    { canal: 'wellhub', reservados: 1 },
]);

// Sin canales (channels ausente, vacío o null): todas son alumnas.
assert.deepEqual(tipos(lugaresDeClase({ current_bookings: 2, max_capacity: 3 }).lugares), ['alumna', 'alumna', 'libre']);
assert.deepEqual(tipos(lugaresDeClase({ current_bookings: 1, max_capacity: 2, channels: null }).lugares), ['alumna', 'libre']);

// Datos que no cuadran: nunca negativos ni lugares perdidos.
// Los canales dicen más que el total (el contador se atrasó) → 0 alumnas, se ven las socias.
const desfasada = lugaresDeClase({ current_bookings: 1, max_capacity: 7, channels: [{ channel: 'totalpass', max: 3, booked: 2 }] });
assert.equal(desfasada.alumnas, 0);
assert.equal(desfasada.ocupados, 2);
assert.deepEqual(tipos(desfasada.lugares).slice(0, 3), ['totalpass', 'totalpass', 'libre']);
// Más inscritas que cupo (bajaron la capacidad) → se ven todas y dice Lleno.
const sobrevendida = lugaresDeClase({ current_bookings: 8, max_capacity: 7, channels: [] });
assert.equal(sobrevendida.lugares.length, 8);
assert.equal(etiquetaCupo(sobrevendida), 'Lleno');
// Números como texto, nulos y negativos.
const rara = lugaresDeClase({ current_bookings: '3', max_capacity: '7', channels: [{ channel: 'totalpass', max: 2, booked: -1 }, null] });
assert.equal(rara.alumnas, 3);
assert.equal(rara.libres, 4);
assert.equal(lugaresDeClase({ current_bookings: null, max_capacity: null }).lugares.length, 0);
assert.equal(MAX_PUNTOS_TARJETA, 12);

// ── estiloDeLugar: cada canal SIEMPRE con punto y anillo ────────────────────
for (const canal of Object.values(CANALES)) {
    assert.deepEqual(estiloDeLugar({ tipo: 'canal', canal: canal.clave }, '#2A4E36'), { relleno: canal.punto, anillo: canal.anillo });
    assert.notEqual(canal.anillo, canal.punto, `${canal.clave}: el anillo debe distinguirse del relleno`);
}
const sinCatalogo = estiloDeLugar({ tipo: 'canal', canal: 'wellhub' }, '#2A4E36');
assert.ok(sinCatalogo.relleno && sinCatalogo.anillo && sinCatalogo.relleno !== sinCatalogo.anillo);
assert.deepEqual(estiloDeLugar({ tipo: 'alumna' }, '#7A3550'), { relleno: '#7A3550', anillo: '#7A3550' });
assert.deepEqual(estiloDeLugar({ tipo: 'libre' }, '#7A3550'), { relleno: 'transparent', anillo: ANILLO_LIBRE_CLARO });
assert.deepEqual(estiloDeLugar({ tipo: 'libre' }, '#F6F0E4', 'oscuro'), { relleno: 'transparent', anillo: ANILLO_LIBRE_OSCURO });

// ── colores: el punto de alumna se distingue (≥ 3:1) aunque el tipo sea pálido ─
for (const color of ['#B7AE9B', '#6B8445', '#2E5B45', '#6C9999', '#FFFFFF', '#F6F0E4', '#7A3550', '#abc', null, undefined, 'rojo']) {
    const punto = colorPuntoAlumna(color);
    assert.ok(contraste(punto, fondoDeTarjeta(color)) >= 3, `${String(color)} → ${punto}`);
}
assert.equal(colorPuntoAlumna('#2A4E36'), '#2A4E36', 'un color que ya contrasta se queda igual');
assert.equal(colorPuntoAlumna(null), COLOR_ALUMNA_POR_DEFECTO);
assert.equal(mezclarConFondo('#000000', 0), FONDO_TARJETA.toLowerCase());
assert.equal(mezclarConFondo('#000000', 1), '#000000');
assert.equal(contraste('#000000', '#FFFFFF').toFixed(1), '21.0');

// ── resúmenes ───────────────────────────────────────────────────────────────
const lunes = [
    { current_bookings: 3, max_capacity: 7, channels: [{ channel: 'totalpass', max: 2, booked: 1 }] },
    { current_bookings: 7, max_capacity: 7, channels: [{ channel: 'totalpass', max: 2, booked: 2 }] },
    { current_bookings: 0, max_capacity: 7, status: 'cancelled', channels: [] },
];
assert.deepEqual(resumenDeClases(lunes), { clases: 2, libres: 4, socias: 3 });
assert.equal(textoResumenDia(resumenDeClases(lunes)), '2 clases · 4 libres');
assert.equal(textoResumenDia({ clases: 1, libres: 1, socias: 0 }), '1 clase · 1 libre');
assert.equal(textoResumenDia(resumenDeClases([lunes[2]])), 'Sin clases', 'solo canceladas = sin clases');
assert.equal(textoResumenDia(resumenDeClases([])), 'Sin clases');
assert.equal(textoResumenSemana({ clases: 4, libres: 11, socias: 3 }), '4 clases · 11 lugares libres · 3 socias');
assert.equal(textoResumenSemana({ clases: 1, libres: 1, socias: 1 }), '1 clase · 1 lugar libre · 1 socia');

console.log('✅ test-calendario-lugares OK');
