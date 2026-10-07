// "Editar clase" (PUT /api/classes/:id) avisa a las alumnas de la app cuando cambia el
// día o la hora, y "Limpiar semana" (POST /bulk-delete, que BORRABA clases) ya no existe.
// Correr con: npx tsx scripts/test-avisos-clase.ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { avisoCambioDeHorario } from '../src/lib/avisos-clase.js';

const antes = { tipo: 'Barre', fecha: '2026-11-04', inicio: '08:00' };
assert.equal(avisoCambioDeHorario(antes, { ...antes }), null, 'sin cambio de día ni hora, no hay aviso');
assert.equal(avisoCambioDeHorario(antes, { ...antes, tipo: 'Pilates Mat' }), null, 'cambiar solo el tipo no avisa por aquí');
assert.deepEqual(avisoCambioDeHorario(antes, { ...antes, inicio: '09:30' }), {
    title: 'Tu clase cambió de hora',
    body: 'Barre del miércoles 4 de noviembre ahora es a las 9:30 (antes 8:00).',
});
assert.deepEqual(avisoCambioDeHorario(antes, { ...antes, fecha: '2026-11-05' }), {
    title: 'Tu clase cambió de día',
    body: 'Barre del miércoles 4 de noviembre a las 8:00 ahora es el jueves 5 de noviembre a las 8:00.',
});
console.log('  texto del aviso: OK');

const ruta = readFileSync(fileURLToPath(new URL('../src/routes/classes.ts', import.meta.url)), 'utf8');
const put = ruta.slice(ruta.indexOf("router.put('/:id',"), ruta.indexOf("router.put('/:id/channels',"));
assert.match(put, /horarioDeClase\(id\)[\s\S]*UPDATE classes[\s\S]*horarioDeClase\(id\)/, 'lee el horario antes y después del UPDATE');
assert.match(put, /avisarAlumnasDeLaApp\(id, avisoHorario\)/, 'avisa a las alumnas cuando cambió');
assert.doesNotMatch(ruta, /bulk-delete/, 'POST /bulk-delete se eliminó');
assert.doesNotMatch(ruta, /DELETE FROM classes/, 'ninguna ruta de clases borra clases: se cancelan');
console.log('  cableado: OK');

console.log('test-avisos-clase: OK');
