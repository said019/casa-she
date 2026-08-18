/**
 * test-totalpass-retire — retiro de una clase de TotalPass cuando Casa Shé la
 * cancela (o le apaga el cupo del canal).
 *
 * El bug que originó estas pruebas: cancelar una clase en Casa Shé no la quitaba
 * de TotalPass. La socia seguía viendo la clase en su app y la podía reservar.
 * Al arreglarlo apareció el segundo piso del problema: 19 de las 27 clases
 * canceladas NO tenían `external_occurrence_id` guardado, y el único proceso que
 * lo rellenaba (el reconcile de cupo) filtra `status='scheduled'` — o sea que una
 * vez cancelada la clase, el uuid ya nunca se podía rellenar. Por eso el retiro
 * TIENE que saber localizar la ocurrencia en TotalPass sin depender del uuid.
 */
import assert from 'node:assert/strict';
import {
    findOccurrenceParaRetiro,
    slotsVivosDeOcurrencia,
    valeLaPenaBorrarEnTp,
} from '../src/lib/totalpass/retire.js';
import type { TotalPassOfficialEvent, TotalPassOfficialSlot } from '../src/lib/totalpass/client.js';

// Snapshot de listEvents() como lo devuelve TotalPass: un evento individual por
// clase de Casa Shé, cada uno con su única ocurrencia.
const EVENTS: TotalPassOfficialEvent[] = [
    {
        id: 45858744,
        title: 'Barre',
        externalReference: null,
        EventOccurrences: [{
            occurrenceUuid: 'uuid-barre-07',
            eventDate: '2026-08-19T00:00:00.000Z',
            startTime: '07:00',
            slots: 6,
            slotsInUse: 0,
            externalReference: '1c2f8ea3-ec4d-4457-ab81-a7b79cf4552e',
        }],
    },
    {
        id: 45858746,
        // Con espacios a propósito: TotalPass guarda el título tal cual y el
        // match por llave tiene que aplicar trim simétrico.
        title: '  Barre  ',
        externalReference: null,
        EventOccurrences: [{
            occurrenceUuid: 'uuid-barre-08',
            eventDate: '2026-08-19T00:00:00.000Z',
            startTime: '08:00:00',
            slots: 6,
            slotsInUse: 2,
            externalReference: null, // sin referencia: solo se puede hallar por título|fecha|hora
        }],
    },
];

// ── (a) por uuid guardado en el mapping ──────────────────────────────────────
const porUuid = findOccurrenceParaRetiro(EVENTS, {
    classId: 'da-igual',
    title: 'Barre',
    date: '2026-08-19',
    hhmm: '07:00',
    knownUuid: 'uuid-barre-07',
});
assert.equal(porUuid?.occurrenceUuid, 'uuid-barre-07', 'halla la ocurrencia por el uuid del mapping');
assert.equal(porUuid?.eventId, '45858744', 'devuelve el eventId de esa ocurrencia');
assert.equal(porUuid?.slotsInUse, 0, 'reporta slotsInUse para decidir si hay socias dentro');

// ── (b) por externalReference cuando el mapping NO tiene uuid ────────────────
// Este es el caso de las 19 clases canceladas de producción: sin uuid guardado y
// sin forma de rellenarlo. Sin esta rama, el retiro es imposible para ellas.
const porReferencia = findOccurrenceParaRetiro(EVENTS, {
    classId: '1c2f8ea3-ec4d-4457-ab81-a7b79cf4552e',
    title: 'Barre',
    date: '2026-08-19',
    hhmm: '07:00',
    knownUuid: null,
});
assert.equal(porReferencia?.occurrenceUuid, 'uuid-barre-07', 'sin uuid, halla por externalReference');

// ── (c) por título|fecha|hora como último recurso ───────────────────────────
const porLlave = findOccurrenceParaRetiro(EVENTS, {
    classId: 'clase-sin-referencia-en-tp',
    title: 'Barre',
    date: '2026-08-19',
    hhmm: '08:00',
    knownUuid: null,
});
assert.equal(porLlave?.occurrenceUuid, 'uuid-barre-08', 'sin uuid ni referencia, halla por título|fecha|hora con trim');
assert.equal(porLlave?.slotsInUse, 2, 'arrastra slotsInUse de la ocurrencia hallada por llave');

// ── (d) ya no está en TotalPass ─────────────────────────────────────────────
const ausente = findOccurrenceParaRetiro(EVENTS, {
    classId: 'clase-fantasma',
    title: 'Flow Yoga',
    date: '2026-08-19',
    hhmm: '07:00',
    knownUuid: null,
});
assert.equal(ausente, null, 'devuelve null si la ocurrencia ya no existe en TotalPass');

// El uuid del mapping puede apuntar a algo borrado a mano en el panel de TP: no
// debe caerse ni inventar, simplemente no la encuentra por uuid y cae a las otras llaves.
const uuidMuerto = findOccurrenceParaRetiro(EVENTS, {
    classId: '1c2f8ea3-ec4d-4457-ab81-a7b79cf4552e',
    title: 'Barre',
    date: '2026-08-19',
    hhmm: '07:00',
    knownUuid: 'uuid-que-ya-no-existe',
});
assert.equal(uuidMuerto?.occurrenceUuid, 'uuid-barre-07', 'uuid muerto en el mapping: cae a externalReference');

// ── (e) slots vivos de la ocurrencia (las socias a cancelar en TP) ──────────
const SLOTS: TotalPassOfficialSlot[] = [
    { _id: 'slot-1', status: 'confirmed', eventOccurrenceUuid: 'uuid-barre-08' },
    { _id: 'slot-2', status: 'created', occurrenceUuid: 'uuid-barre-08' },
    { _id: 'slot-3', status: 'canceled', eventOccurrenceUuid: 'uuid-barre-08' },
    { _id: 'slot-4', status: 'denied', eventOccurrenceUuid: 'uuid-barre-08' },
    { _id: 'slot-5', status: 'confirmed', eventOccurrenceUuid: 'otra-ocurrencia' },
    { _id: '', status: 'confirmed', eventOccurrenceUuid: 'uuid-barre-08' },
];
const vivos = slotsVivosDeOcurrencia(SLOTS, 'uuid-barre-08');
assert.deepEqual(
    vivos.sort(),
    ['slot-1', 'slot-2'],
    'solo los slots vivos (confirmed/created) de ESA ocurrencia, sin ids vacíos',
);
assert.deepEqual(
    slotsVivosDeOcurrencia(SLOTS, 'uuid-sin-reservas'),
    [],
    'ocurrencia sin reservas => lista vacía',
);
assert.deepEqual(slotsVivosDeOcurrencia([], 'uuid-barre-08'), [], 'feed vacío => lista vacía');

// ── (f) una clase que ya empezó no se intenta borrar en TotalPass ───────────
// TotalPass rechaza tocar ocurrencias que ya ocurrieron. Sin este guard, cada
// clase cancelada del pasado se quedaría en 'pending_delete' reintentando cada
// 10 minutos para siempre, gastando rate limit contra un 422 garantizado. Y no
// hay nada que proteger: nadie puede reservar una clase que ya pasó.
const AHORA = new Date('2026-08-18T18:00:00.000Z'); // = 12:00 en CDMX
assert.equal(
    valeLaPenaBorrarEnTp('2026-08-19', '07:00', AHORA),
    true,
    'clase de mañana: sí se borra de TotalPass (todavía es reservable)',
);
assert.equal(
    valeLaPenaBorrarEnTp('2026-08-18', '07:00', AHORA),
    false,
    'clase de hoy que ya pasó: no se intenta borrar, solo se limpia el mapping',
);
assert.equal(
    valeLaPenaBorrarEnTp('2026-08-18', '19:00', AHORA),
    true,
    'clase de hoy más tarde: sí se borra (todavía no empieza)',
);
assert.equal(
    valeLaPenaBorrarEnTp('2026-07-30', '08:00', AHORA),
    false,
    'clase de hace semanas: no se intenta borrar',
);

console.log('test-totalpass-retire: OK');
