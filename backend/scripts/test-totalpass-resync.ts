/**
 * test-totalpass-resync — propagar a TotalPass los cambios de una clase.
 *
 * Hermano del bug de cancelación: editar una clase (fecha, hora, tipo, coach)
 * tampoco llegaba a TotalPass. La socia veía la hora vieja en su app, reservaba
 * a esa hora y llegaba cuando la clase ya no estaba. Peor que la cancelación,
 * porque ahí sí hay alguien esperando en la puerta.
 *
 * La decisión importa porque las dos acciones NO cuestan lo mismo:
 *  - Cambiar título o coach se hace con `updateOccurrence` sobre la misma
 *    ocurrencia: las socias ya reservadas NO se enteran ni pierden su lugar.
 *  - Mover fecha u hora obliga a borrar y recrear (TotalPass no deja mover una
 *    ocurrencia), y eso SÍ tumba las reservas existentes.
 * Confundirlas significa cancelarle la reserva a una socia por cambiarle el
 * coach a la clase. De ahí que la decisión sea una función pura y probada.
 */
import assert from 'node:assert/strict';
import { decidirResync } from '../src/lib/totalpass/resync.js';

const LOCAL = { title: 'Barre', date: '2026-08-19', hhmm: '07:00', coach: 'Ana López' };

// ── Sin cambios ─────────────────────────────────────────────────────────────
assert.equal(
    decidirResync(LOCAL, { title: 'Barre', date: '2026-08-19', hhmm: '07:00', responsible: 'Ana López' }),
    'ninguna',
    'todo igual => no se toca TotalPass',
);

// Trim simétrico: TotalPass guarda el título tal cual se lo mandaron.
assert.equal(
    decidirResync(LOCAL, { title: '  Barre  ', date: '2026-08-19', hhmm: '07:00:00', responsible: ' Ana López ' }),
    'ninguna',
    'solo diferencias de espacios/segundos => no es un cambio real',
);

// ── Cambio cosmético: se edita en su lugar, sin tocar reservas ──────────────
assert.equal(
    decidirResync(LOCAL, { title: 'Barre', date: '2026-08-19', hhmm: '07:00', responsible: 'Mariana R.' }),
    'editar',
    'cambió el coach => editar la ocurrencia (la socia NO pierde su lugar)',
);
assert.equal(
    decidirResync(LOCAL, { title: 'Sculpt', date: '2026-08-19', hhmm: '07:00', responsible: 'Ana López' }),
    'editar',
    'cambió el tipo de clase => editar la ocurrencia',
);

// ── Movimiento: hay que borrar y recrear ───────────────────────────────────
assert.equal(
    decidirResync(LOCAL, { title: 'Barre', date: '2026-08-19', hhmm: '08:00', responsible: 'Ana López' }),
    'mover',
    'cambió la hora => borrar y recrear',
);
assert.equal(
    decidirResync(LOCAL, { title: 'Barre', date: '2026-08-20', hhmm: '07:00', responsible: 'Ana López' }),
    'mover',
    'cambió la fecha => borrar y recrear',
);

// El movimiento MANDA sobre lo cosmético: si además cambió el coach, sigue siendo
// un movimiento (recrear ya trae el coach nuevo; editar no arreglaría la hora).
assert.equal(
    decidirResync(LOCAL, { title: 'Sculpt', date: '2026-08-20', hhmm: '09:00', responsible: 'Otra' }),
    'mover',
    'cambió todo => mover gana (recrear ya incluye título y coach nuevos)',
);

// TotalPass manda la fecha como "hora local marcada como UTC"; se rebana, no se
// convierte. Un ISO completo con la misma fecha NO es un cambio.
assert.equal(
    decidirResync(LOCAL, { title: 'Barre', date: '2026-08-19T00:00:00.000Z', hhmm: '07:00', responsible: 'Ana López' }),
    'ninguna',
    'fecha ISO de TotalPass con el mismo día => no es un cambio',
);

// Sin coach local, TotalPass trae el coach por defecto del gym: no es un cambio
// que valga la pena empujar (lo pondría igual al recrear).
assert.equal(
    decidirResync({ ...LOCAL, coach: null }, { title: 'Barre', date: '2026-08-19', hhmm: '07:00', responsible: 'Casa Shé' }),
    'ninguna',
    'clase sin coach asignado => no se pelea con el responsable por defecto de TP',
);

console.log('test-totalpass-resync: OK');
