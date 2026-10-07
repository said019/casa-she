// "Varias a la vez": selección, atajos desde la última clase tocada, textos de la barra
// y de los botones, y la acción inversa de "Deshacer".
// Correr con: npx tsx scripts/test-calendario-seleccion.ts
import assert from 'node:assert/strict';
import {
    alternar,
    alternarGrupo,
    atajosDesde,
    clasesSeleccionadas,
    duracion,
    inversaDe,
    listaSeleccion,
    quitarBloqueadas,
    resumenSeleccion,
    textoAvisadas,
    textoBoton,
    textoHecho,
    type ClaseSeleccionable,
    type RespuestaLote,
} from '../src/pages/admin/classes/calendario/seleccion.js';

const clase = (id: string, datos: Partial<ClaseSeleccionable>): ClaseSeleccionable => ({
    id, date: '2026-11-02', start_time: '07:00:00', status: 'scheduled', instructor_id: 'ana', instructor_name: 'Ana',
    class_type_id: 'barre', class_type_name: 'Barre', current_bookings: 0, max_capacity: 7, channels: [], ...datos,
});
// Lun 7:00 Barre Ana (3 inscritas, 1 de TotalPass) · Lun 8:00 Mat Sofía · Mié 7:00 Barre Ana · Mié 8:00 Barre Ana cancelada
const lun7 = clase('lun7', { current_bookings: 3, channels: [{ channel: 'totalpass', max: 2, booked: 1 }] });
const lun8 = clase('lun8', { start_time: '08:00:00', instructor_id: 'sofia', instructor_name: 'Sofía', class_type_id: 'mat', class_type_name: 'Pilates Mat', current_bookings: 2 });
const mie7 = clase('mie7', { date: '2026-11-04T00:00:00.000Z' });
const mie8 = clase('mie8', { date: '2026-11-04', start_time: '08:00', status: 'cancelled' });
const semana = [lun8, mie8, mie7, lun7];

// ── Selección ───────────────────────────────────────────────────────────────
assert.deepEqual([...alternar(new Set(), 'a')], ['a']);
assert.deepEqual([...alternar(new Set(['a', 'b']), 'a')], ['b']);
// Encabezado del día: agrega las seleccionables; si ya estaban todas, las quita. La cancelada nunca.
const lunes = [lun7, lun8];
assert.deepEqual([...alternarGrupo(new Set(['lun7']), lunes)].sort(), ['lun7', 'lun8']);
assert.deepEqual([...alternarGrupo(new Set(['lun7', 'lun8', 'mie7']), lunes)], ['mie7']);
assert.deepEqual([...alternarGrupo(new Set(), [mie7, mie8])], ['mie7']);
assert.deepEqual([...alternarGrupo(new Set(['x']), [mie8])], ['x'], 'un día sin seleccionables no cambia nada');
assert.deepEqual(clasesSeleccionadas(new Set(['mie7', 'lun8', 'lun7']), semana).map((c) => c.id), ['lun7', 'lun8', 'mie7']);
console.log('  selección: OK');

// ── Atajos ──────────────────────────────────────────────────────────────────
assert.deepEqual(atajosDesde(null, semana), []);
const atajos = atajosDesde(lun7, semana);
assert.deepEqual(atajos.map((a) => a.etiqueta), ['Mismo horario (7:00)', 'Las de Ana', 'Todas las Barre', 'Todo el lunes']);
assert.deepEqual(atajos.map((a) => a.ids.sort()), [['lun7', 'mie7'], ['lun7', 'mie7'], ['lun7', 'mie7'], ['lun7', 'lun8']], 'nunca la cancelada');
const sinCoach = atajosDesde(clase('x', { instructor_name: null, date: '2026-11-08' }), [mie7]);
assert.deepEqual(sinCoach.map((a) => a.etiqueta), ['Mismo horario (7:00)', 'Todas las Barre', 'Todo el domingo'], 'sin coach no hay "Las de…"');
console.log('  atajos: OK');

// ── Barra y lista ───────────────────────────────────────────────────────────
assert.deepEqual(resumenSeleccion([]), { titulo: 'Ninguna clase', detalle: 'Toca una clase para empezar', inscritas: 0, totalpass: 0 });
const r = resumenSeleccion([lun7, lun8]);
assert.equal(r.titulo, '2 clases');
assert.equal(r.detalle, '5 inscritas · 1 de TotalPass');
assert.equal(resumenSeleccion([lun7]).titulo, '1 clase');
assert.equal(listaSeleccion([lun7, mie7]), 'Barre · lun 7:00, mié 7:00');
assert.equal(listaSeleccion([lun7, lun8]), 'Barre lun 7:00, Pilates Mat lun 8:00');
assert.equal(listaSeleccion([]), 'Ninguna clase seleccionada');
console.log('  barra y lista: OK');

// ── Textos de las acciones ──────────────────────────────────────────────────
assert.equal(duracion(30), '30 min');
assert.equal(duracion(-60), '1 h');
assert.equal(duracion(90), '1 h 30 min');
assert.equal(textoBoton('coach', { instructorId: 's' }, 4, { coach: 'Sofía' }), 'Cambiar a Sofía en 4 clases');
assert.equal(textoBoton('cupo_canal', { canal: 'totalpass', lugares: 3 }, 1), 'Guardar 3 lugares en 1 clase');
assert.equal(textoBoton('cupo_canal', { canal: 'totalpass', lugares: 1 }, 2), 'Guardar 1 lugar en 2 clases');
assert.equal(textoBoton('mover', { minutos: 30 }, 2), 'Mover 2 clases 30 min más tarde');
assert.equal(textoBoton('mover', { minutos: -60 }, 2), 'Mover 2 clases 1 h antes');
assert.equal(textoBoton('mover', { minutos: 0, classTypeId: 'mat' }, 2, { tipo: 'Pilates Mat' }), 'Cambiar 2 clases a Pilates Mat');
assert.equal(textoBoton('mover', { minutos: 30, classTypeId: 'mat' }, 2, { tipo: 'Pilates Mat' }), 'Mover 2 clases 30 min más tarde y cambiarlas a Pilates Mat');
assert.equal(textoBoton('cancelar', {}, 3), 'Cancelar 3 clases');
const respuesta = (ok: number, alumnasAvisadas = 0): RespuestaLote => ({
    clases: [], resumen: { ok, bloqueadas: 0, alumnasAvisadas, sociasPierdenLugar: 0 }, aplicado: true,
});
assert.equal(textoHecho('coach', {}, respuesta(4, 9), { coach: 'Sofía' }), 'Listo: 4 clases ahora con Sofía. Avisamos a 9 alumnas.');
assert.equal(textoHecho('cancelar', {}, respuesta(1)), '1 clase cancelada. Siguen en el calendario, marcadas.');
assert.equal(textoHecho('cupo_canal', { lugares: 2 }, respuesta(3)), 'Guardado: 2 lugares para TotalPass en 3 clases.');
assert.equal(textoHecho('mover', { minutos: 30 }, respuesta(2, 1)), 'Listo: 2 clases actualizadas. Avisamos a 1 alumna.');
assert.equal(textoAvisadas('coach', 0), 'No hay alumnas inscritas que avisar.');
assert.equal(textoAvisadas('cancelar', 2), '2 alumnas recuperan su crédito y reciben aviso.');
assert.equal(textoAvisadas('mover', 1), 'Avisamos del cambio a 1 alumna por la app.');
console.log('  textos: OK');

// ── Quitar bloqueadas ───────────────────────────────────────────────────────
const conBloqueada: RespuestaLote = {
    clases: [
        { classId: 'lun7', estado: 'ok', alumnasAvisadas: 0, sociasPorCanal: {}, sociasPierdenLugar: 0, advertencias: [] },
        { classId: 'lun8', estado: 'bloqueada', motivo: 'Ya empezó.', alumnasAvisadas: 0, sociasPorCanal: {}, sociasPierdenLugar: 0, advertencias: [] },
    ],
    resumen: { ok: 1, bloqueadas: 1, alumnasAvisadas: 0, sociasPierdenLugar: 0 },
    aplicado: false,
};
assert.deepEqual([...quitarBloqueadas(new Set(['lun7', 'lun8']), conBloqueada)], ['lun7']);
console.log('  quitar bloqueadas: OK');

// ── Deshacer ────────────────────────────────────────────────────────────────
assert.deepEqual(inversaDe('coach', { instructorId: 'sofia' }, [lun7, mie7]), { classIds: ['lun7', 'mie7'], accion: 'coach', instructorId: 'ana' });
assert.equal(inversaDe('coach', { instructorId: 'pau' }, [lun7, lun8]), null, 'tenían coaches distintas');
assert.equal(inversaDe('coach', { instructorId: 'ana' }, [lun7]), null, 'no cambió nada');
assert.deepEqual(inversaDe('mover', { minutos: 30 }, [lun7, lun8]), { classIds: ['lun7', 'lun8'], accion: 'mover', minutos: -30 });
assert.deepEqual(inversaDe('mover', { minutos: -60, classTypeId: 'mat' }, [lun7, mie7]), { classIds: ['lun7', 'mie7'], accion: 'mover', minutos: 60, classTypeId: 'barre' });
assert.deepEqual(inversaDe('mover', { minutos: 0, classTypeId: 'mat' }, [lun7]), { classIds: ['lun7'], accion: 'mover', minutos: 0, classTypeId: 'barre' });
assert.equal(inversaDe('mover', { minutos: 30, classTypeId: 'flex' }, [lun7, lun8]), null, 'tenían tipos distintos');
assert.deepEqual(inversaDe('mover', { minutos: 30, classTypeId: 'barre' }, [lun7]), { classIds: ['lun7'], accion: 'mover', minutos: -30 }, 'el tipo no cambió');
assert.equal(inversaDe('cupo_canal', { canal: 'totalpass', lugares: 2 }, [lun7]), null);
assert.equal(inversaDe('cancelar', {}, [lun7]), null);
assert.equal(inversaDe('coach', { instructorId: 'x' }, []), null);
console.log('  deshacer: OK');

console.log('✅ test-calendario-seleccion OK');
