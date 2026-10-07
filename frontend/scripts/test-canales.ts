// Catálogo de canales: detección por nombre de plan, versión del logo según el
// fondo y que los archivos existan en public/.
// Correr con: npx tsx scripts/test-canales.ts
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CANALES, canalDePlan, canalesConectados, esCanal, logoDeCanal } from '../src/lib/canales.js';

// canalDePlan: nombres de plan reales y variantes de escritura.
assert.equal(canalDePlan('Totalpass'), 'totalpass');
assert.equal(canalDePlan('TotalPass'), 'totalpass');
assert.equal(canalDePlan('Socias TOTAL PASS'), 'totalpass');
assert.equal(canalDePlan('total-pass mensual'), 'totalpass');
assert.equal(canalDePlan('Fitpass'), 'fitpass');
assert.equal(canalDePlan('FitPass Mensual'), 'fitpass');
assert.equal(canalDePlan('Fit Pass'), 'fitpass');
for (const nada of [null, undefined, '', '   ']) {
    assert.equal(canalDePlan(nada), null, `nada=${JSON.stringify(nada)}`);
}
for (const plan of ['Paquete 8 Clases', 'Ilimitado mensual', 'Pass', 'Total', 'Clase suelta']) {
    assert.equal(canalDePlan(plan), null, plan);
}

// esCanal: solo las claves del catálogo.
assert.equal(esCanal('totalpass'), true);
assert.equal(esCanal('fitpass'), true);
for (const v of ['wellhub', 'app', '', null, undefined, 3, 'TotalPass']) {
    assert.equal(esCanal(v), false, `v=${String(v)}`);
}

// Conectados: hoy solo TotalPass.
assert.deepEqual(canalesConectados().map((c) => c.clave), ['totalpass']);

// Colores de la spec.
assert.equal(CANALES.totalpass.punto, '#26D07C');
assert.equal(CANALES.totalpass.anillo, '#0F7A45');
assert.equal(CANALES.fitpass.punto, '#5A8AD0');
assert.equal(CANALES.fitpass.anillo, '#2F5BA8');

// logoDeCanal: versión según fondo, pastilla para Fitpass en oscuro, alto mínimo 8.
assert.deepEqual(logoDeCanal('totalpass', 'claro', 12), { src: '/brands/totalpass-claro.svg', alt: 'TotalPass', altoPx: 12, pastilla: false });
assert.deepEqual(logoDeCanal('totalpass', 'oscuro', 11), { src: '/brands/totalpass-oscuro.svg', alt: 'TotalPass', altoPx: 11, pastilla: false });
assert.deepEqual(logoDeCanal('fitpass', 'claro', 10), { src: '/brands/fitpass.png', alt: 'Fitpass', altoPx: 16, pastilla: false });
assert.deepEqual(logoDeCanal('fitpass', 'oscuro', 10), { src: '/brands/fitpass.png', alt: 'Fitpass', altoPx: 16, pastilla: true });
assert.equal(logoDeCanal('totalpass', 'claro', 4).altoPx, 8, 'nunca menos de 8 px');
assert.equal(logoDeCanal('fitpass', 'claro', 2).altoPx, 8, 'nunca menos de 8 px aunque escale');

// Los archivos que el catálogo nombra existen en public/.
const publico = fileURLToPath(new URL('../public/', import.meta.url));
for (const c of Object.values(CANALES)) {
    for (const ruta of [c.logoClaro, c.logoOscuro]) {
        if (!ruta) continue;
        assert.ok(existsSync(publico + ruta.replace(/^\//, '')), `falta ${ruta}`);
    }
}

console.log('✅ test-canales OK');
