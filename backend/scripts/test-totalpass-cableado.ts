/**
 * test-totalpass-cableado — que el retiro de TotalPass esté CONECTADO.
 *
 * Este test existe por el bug que lo originó: `cancelClassOnTotalpass` estaba
 * escrita, documentada y correcta… y tenía CERO llamadores. Nadie la invocaba
 * desde ninguna vía de cancelación, así que durante meses las clases canceladas
 * siguieron vivas y reservables en la app de TotalPass. Las pruebas unitarias de
 * la función habrían pasado en verde todo ese tiempo.
 *
 * Por eso este archivo no prueba lógica: prueba CABLEADO. Revisa el código fuente
 * y falla si alguien vuelve a dejar el retiro desconectado, si se borra el job del
 * cron, o si la migración del estado 'pending_delete' desaparece.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const leer = (rel: string) => readFileSync(join(SRC, rel), 'utf8');

// ── (a) Las 3 vías de cancelación desembocan en cancelClassWithRefunds, y ESA
//        función tiene que marcar el retiro. Un solo punto, tres vías cubiertas.
const cancelClass = leer('lib/cancel-class.ts');
assert.match(
    cancelClass,
    /import\s*\{[^}]*marcarRetiroTotalpass[^}]*\}\s*from\s*['"][^'"]*totalpass\/retire\.js['"]/,
    'cancel-class.ts debe importar marcarRetiroTotalpass',
);
assert.match(
    cancelClass,
    /marcarRetiroTotalpass\s*\(/,
    'cancelClassWithRefunds debe marcar el retiro de TotalPass al cancelar la clase',
);

// Y las tres vías tienen que seguir pasando por ahí (si alguien inventa una
// cuarta que haga UPDATE directo, este test no la ve — pero estas tres sí).
for (const via of ['routes/classes.ts', 'routes/closed-days.ts', 'routes/events.ts']) {
    assert.match(
        leer(via),
        /cancelClassWithRefunds/,
        `${via} debe cancelar clases vía cancelClassWithRefunds (no con UPDATE directo)`,
    );
}

// ── (b) Apagar el cupo del canal también deja fantasma si no se retira ───────
// setTotalpassCap(id, 0) borraba la fila de channel_inventory y ahí moría: el
// reconcile de cupo hace JOIN con max_spots > 0, así que dejaba de tocar esa
// clase y el evento se quedaba vivo en TotalPass para siempre.
const caps = leer('lib/totalpass/caps.ts');
assert.match(caps, /marcarRetiroTotalpass\s*\(/, 'setTotalpassCap(0) debe marcar el retiro de TotalPass');
assert.match(
    caps,
    /desmarcarRetiroTotalpass\s*\(/,
    'volver a poner cupo > 0 debe CANCELAR el retiro pendiente (o el publicador crearía un evento duplicado mientras el barrido borra el otro)',
);

// ── (c) El barrido tiene que correr solo ────────────────────────────────────
const crons = leer('services/cron-jobs.ts');
assert.match(
    crons,
    /retirarClasesPendientesDeTotalpass/,
    'cron-jobs.ts debe cablear el barrido de retiros pendientes',
);
assert.match(
    crons,
    /TOTALPASS_RETIRE/,
    'debe existir el job TOTALPASS_RETIRE (reintenta solo si TotalPass estaba caído)',
);

// ── (c2) Editar una clase también tiene que llegar a TotalPass ─────────────
// Mismo bug que la cancelación, un piso más arriba: mover una clase de hora o
// cambiarle el coach no se propagaba, y la socia llegaba a la hora vieja.
const clases = leer('routes/classes.ts');
assert.match(
    clases,
    /marcarResyncTotalpass\s*\(/,
    'PUT /classes/:id debe marcar la resincronización cuando cambia tipo, coach, fecha u hora',
);
// Las tres vías de edición: PUT general, cambio de coach por serie y sustitución.
assert.ok(
    (clases.match(/marcarResyncTotalpass\s*\(/g) || []).length >= 3,
    'las tres vías de edición (PUT, cambio de coach, sustitución) deben marcar resync',
);
assert.match(
    crons,
    /TOTALPASS_RESYNC/,
    'debe existir el job TOTALPASS_RESYNC',
);

// ── (d) El estado 'pending_delete' tiene que ser válido en la BD ────────────
// partner_class_mappings.sync_status tiene un CHECK; sin migración, el UPDATE
// del marcado truena y el retiro se pierde en silencio.
const index = leer('index.ts');
assert.match(
    index,
    /sync_status[^;]*pending_delete/s,
    'index.ts debe migrar el CHECK de sync_status para aceptar pending_delete',
);
assert.match(
    index,
    /sync_status[^;]*pending_resync/s,
    'index.ts debe migrar el CHECK de sync_status para aceptar pending_resync',
);

// ── (d2) …y esa migración NUNCA puede colgar el arranque ───────────────────
// `app.listen()` espera a que terminen TODAS las migraciones. Un ALTER TABLE pide
// ACCESS EXCLUSIVE, y durante un deploy la instancia VIEJA sigue viva consultando
// esa misma tabla con sus crons: el ALTER se forma en la cola de locks y el
// servidor nunca llega a escuchar. El healthcheck de Railway da 100 segundos.
// Esto tumbó un deploy real.
assert.match(
    index,
    /lock_timeout/,
    'la migración del CHECK debe fijar lock_timeout: sin él, un lock ocupado cuelga el arranque y el deploy muere en el healthcheck',
);
// Y tiene que ser condicional: después del primer arranque exitoso no debe volver
// a pedir el lock nunca más.
assert.match(
    index,
    /pg_get_constraintdef/,
    'la migración debe LEER el CHECK actual (pg_get_constraintdef) para saltarse el ALTER cuando ya está al día',
);

// ── (e) El barrido se auto-cura ─────────────────────────────────────────────
// Al desplegar este arreglo ya había 27 clases canceladas con el mapping en
// 'published' y vivas en TotalPass. Nadie las va a marcar a mano: el barrido
// tiene que recogerlas solo, tomando también los mappings publicados cuya clase
// ya está cancelada. Eso además tapa cualquier deriva futura (una vía nueva de
// cancelación que se olvide de marcar el retiro).
const retire = leer('lib/totalpass/retire.ts');
assert.match(
    retire,
    /sync_status\s*=\s*'published'[\s\S]{0,120}c\.status\s*=\s*'cancelled'/,
    "el barrido debe recoger también los mappings 'published' de clases ya canceladas (auto-cura)",
);

// ── (f) Una socia que reserva una clase que ya no existe no puede pasar en silencio
// El import descarta con razón la reserva (no se puede reservar una clase
// cancelada), pero eso solo se escribía en un log que nadie lee: la socia llegaba
// al estudio sin que recepción supiera nada.
const source = leer('lib/totalpass/source.ts');
assert.match(
    source,
    /avisarReservaHuerfanaTotalPass/,
    'el import debe avisar al estudio cuando una reserva de TotalPass no empata con ninguna clase',
);

console.log('test-totalpass-cableado: OK');
