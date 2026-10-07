// "Editar clase" manda a PUT /api/classes/:id solo lo que cambió: mandar todo marcaba
// resincronización con TotalPass en cada guardado.
// Correr con: npx tsx scripts/test-calendario-cambios.ts
import assert from 'node:assert/strict';
import { cambiosDeClase, datosEditablesDeClase, type DatosClaseEditables } from '../src/pages/admin/classes/calendario/cambiosClase.js';

const clase = {
    class_type_id: 't1', instructor_id: 'i1', facility_id: 'f1', date: '2026-11-02',
    start_time: '07:00', end_time: '07:50', max_capacity: 7, intensity: null,
};
const antes = datosEditablesDeClase(clase);
assert.deepEqual(antes, {
    classTypeId: 't1', instructorId: 'i1', facilityId: 'f1', date: '2026-11-02',
    startTime: '07:00', endTime: '07:50', maxCapacity: 7, intensity: null,
});

// Guardar sin tocar nada → nada que mandar.
assert.deepEqual(cambiosDeClase(antes, { ...antes }), {});
// Solo la capacidad.
assert.deepEqual(cambiosDeClase(antes, { ...antes, maxCapacity: 6 }), { maxCapacity: 6 });
// El mismo valor escrito distinto no es un cambio.
const conFormatosDeLaBase = datosEditablesDeClase({
    ...clase, date: '2026-11-02T00:00:00.000Z', start_time: '07:00:00', end_time: '07:50:00', facility_id: undefined, intensity: undefined,
});
assert.deepEqual(cambiosDeClase(conFormatosDeLaBase, { ...antes, facilityId: null }), {});
assert.deepEqual(cambiosDeClase({ ...antes, facilityId: null }, { ...antes, facilityId: '' as unknown as null }), {});
assert.deepEqual(cambiosDeClase(antes, { ...antes, maxCapacity: '7' as unknown as number }), {});
// Intensidad: ponerla y quitarla (null se manda para borrarla).
assert.deepEqual(cambiosDeClase(antes, { ...antes, intensity: 2 }), { intensity: 2 });
assert.deepEqual(cambiosDeClase({ ...antes, intensity: 2 }, { ...antes, intensity: null }), { intensity: null });
// Coach y hora juntos; quitar la sala.
const despues: DatosClaseEditables = { ...antes, instructorId: 'i2', startTime: '08:00', endTime: '08:50' };
assert.deepEqual(cambiosDeClase(antes, despues), { instructorId: 'i2', startTime: '08:00', endTime: '08:50' });
assert.deepEqual(cambiosDeClase(antes, { ...antes, facilityId: null }), { facilityId: null });

console.log('✅ test-calendario-cambios OK');
