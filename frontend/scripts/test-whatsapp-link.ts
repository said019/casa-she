// Enlace de WhatsApp para escribirle a una alumna: casos borde de teléfono y mensaje.
// Correr con: npx tsx scripts/test-whatsapp-link.ts
import assert from 'node:assert/strict';
import { enlaceWhatsApp } from '../src/lib/whatsapp.js';

const base = { nombre: 'Montserrat Rojas Pliego', clase: 'Barre', fecha: '2026-07-29', hora: '08:00' };

// Número nacional de 10 dígitos: se le antepone la lada 52.
const nacional = enlaceWhatsApp({ ...base, telefono: '2291044669' })!;
assert.match(nacional, /^https:\/\/wa\.me\/522291044669\?text=/);
assert.match(decodeURIComponent(nacional), /Hola Montserrat, te escribimos de Casa Shé sobre tu clase de Barre del 29\/07 a las 08:00\./);

// Formatos sucios: espacios, guiones, paréntesis y +52 se normalizan al mismo número.
for (const t of ['+52 229 104 4669', '(229) 104-4669', '52 229 104 4669', '229-104-4669']) {
    const url = enlaceWhatsApp({ ...base, telefono: t });
    assert.equal(url?.split('?')[0], 'https://wa.me/522291044669', `falló con "${t}"`);
}

// Ya trae lada (12 dígitos): no se le encima otro 52.
assert.match(enlaceWhatsApp({ ...base, telefono: '525538861972' })!, /wa\.me\/525538861972\?/);
assert.ok(!/wa\.me\/52525538861972/.test(enlaceWhatsApp({ ...base, telefono: '525538861972' })!));

// Extranjero (11 dígitos, EE.UU.): se respeta tal cual.
assert.match(enlaceWhatsApp({ ...base, telefono: '+1 555 123 4567' })!, /wa\.me\/15551234567\?/);

// Sin teléfono utilizable: null, para que no se pinte el botón.
for (const t of [null, undefined, '', '   ', '55 1234', 'sin número']) {
    assert.equal(enlaceWhatsApp({ ...base, telefono: t as string }), null, `debió ser null con "${t}"`);
}

// Datos de clase incompletos: se omite esa parte en vez de escribir "undefined".
const sinClase = decodeURIComponent(enlaceWhatsApp({ telefono: '2291044669', nombre: 'Ana', clase: null, fecha: null, hora: null })!);
assert.match(sinClase, /Hola Ana, te escribimos de Casa Shé\./);
assert.ok(!/undefined|null|NaN/.test(sinClase), 'no debe filtrarse undefined/null al mensaje');

const soloFecha = decodeURIComponent(enlaceWhatsApp({ ...base, hora: null, telefono: '2291044669' })!);
assert.ok(!/sobre tu clase/.test(soloFecha), 'sin hora no debe mencionar la clase a medias');

// Sin nombre: el saludo no queda con un hueco.
const sinNombre = decodeURIComponent(enlaceWhatsApp({ ...base, nombre: '', telefono: '2291044669' })!);
assert.match(sinNombre, /^https:\/\/wa\.me\/522291044669\?text=Hola, te escribimos/);

console.log('test-whatsapp-link: OK');
