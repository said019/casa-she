/**
 * retire — retiro de una clase de Casa Shé en TotalPass.
 *
 * Contraparte de `publish.ts`. Cuando el estudio cancela una clase (admin, día
 * cerrado, solape de evento) o le apaga el cupo del canal, la clase tiene que
 * DESAPARECER de la app de TotalPass. Sin esto la socia sigue viendo una clase
 * que ya no existe, la reserva, y llega al estudio a una clase cancelada.
 *
 * Diseño en dos tiempos, a propósito:
 *
 *   1. `marcarRetiroTotalpass(classId)` — solo BD, sin red. Marca el mapping
 *      como `sync_status='pending_delete'`. Es lo que corre DENTRO del flujo de
 *      cancelación: instantáneo, no puede fallar por un timeout de TotalPass, y
 *      soporta que cancelen 20 clases de un jalón (día cerrado, serie completa)
 *      sin colgar la petición del admin.
 *   2. `retirarClasesPendientesDeTotalpass()` — la parte con red. Barre todos
 *      los `pending_delete`, cancela los slots de las socias, borra la
 *      ocurrencia y limpia el mapping. Se dispara al vuelo justo después de
 *      cancelar Y por cron, así que si TotalPass estaba caído se reintenta solo.
 *
 * La intención (cancelar) queda guardada en la BD en la misma transacción lógica
 * que la cancelación; la ejecución contra la API es eventual. Un fallo de red no
 * puede perder la orden de retiro.
 *
 * Localizar la ocurrencia NO depende del `external_occurrence_id` guardado: en
 * producción 19 de 27 clases canceladas lo tenían en NULL (el create de TP no
 * siempre devuelve la ocurrencia, y el único proceso que rellenaba ese hueco —el
 * reconcile de cupo— filtra `status='scheduled'`, así que tras cancelar ya nunca
 * se podía rellenar). Por eso `findOccurrenceParaRetiro` cae en cascada a
 * externalReference y luego a título|fecha|hora, igual que hace el publicador.
 */
import { query } from '../../config/database.js';
import {
    totalPassOfficialFromDb,
    totalPassOccurrenceUuid,
    isTotalPassRateLimit,
    type TotalPassOfficialEvent,
    type TotalPassOfficialSlot,
} from './client.js';
import { esSlotVivo } from './source.js';
import { localDateTimeUtc } from '../mx-time.js';
import { isTotalpassEnabled } from './token.js';
import { withPgAdvisoryLock } from './lock.js';

// ── Parte pura (testeable sin BD ni red) ─────────────────────────────────────

/** Lo que se busca en el snapshot de TotalPass para retirar una clase. */
export interface TpRetireTarget {
    classId: string;
    title: string;
    date: string;      // "YYYY-MM-DD"
    hhmm: string;      // "HH:MM"
    /** uuid guardado en el mapping; puede ser null (19 de 27 en producción). */
    knownUuid: string | null;
}

export interface TpRetireMatch {
    eventId: string;
    occurrenceUuid: string;
    /** Reservas vivas que TotalPass reporta ahora mismo en esa ocurrencia. */
    slotsInUse: number;
}

/**
 * Localiza en el snapshot de `listEvents()` la ocurrencia que corresponde a una
 * clase de Casa Shé. Función PURA.
 *
 * Cascada de llaves, de la más confiable a la más frágil:
 *   1. `knownUuid` del mapping — directo.
 *   2. `externalReference` (de la ocurrencia o del evento) = id de la clase.
 *      Sobrevive a cambios de título y es la llave dueña del publicador.
 *   3. `título|fecha|HH:MM` con trim simétrico — última red para clases
 *      publicadas antes de que existiera externalReference.
 *
 * Un `knownUuid` que ya no está en TotalPass (lo borraron a mano en el panel) NO
 * aborta la búsqueda: cae a las siguientes llaves.
 */
export function findOccurrenceParaRetiro(
    events: TotalPassOfficialEvent[],
    target: TpRetireTarget,
): TpRetireMatch | null {
    const match = (ev: TotalPassOfficialEvent, uuid: string, slotsInUse: unknown): TpRetireMatch => ({
        eventId: String(ev.id),
        occurrenceUuid: uuid,
        slotsInUse: Number(slotsInUse ?? 0),
    });

    // 1) uuid del mapping
    if (target.knownUuid) {
        for (const ev of events || []) {
            for (const o of (ev.EventOccurrences || [])) {
                const uuid = totalPassOccurrenceUuid(o);
                if (uuid && uuid === target.knownUuid) return match(ev, uuid, o.slotsInUse);
            }
        }
    }

    // 2) externalReference (llave dueña del publicador)
    for (const ev of events || []) {
        for (const o of (ev.EventOccurrences || [])) {
            const ref = String(o.externalReference || ev.externalReference || '').trim();
            const uuid = totalPassOccurrenceUuid(o);
            if (ref && uuid && ref === target.classId) return match(ev, uuid, o.slotsInUse);
        }
    }

    // 3) título|fecha|HH:MM (trim simétrico al guardado de TP)
    const want = `${target.title.trim()}|${target.date.slice(0, 10)}|${target.hhmm.slice(0, 5)}`;
    for (const ev of events || []) {
        const evTitle = String(ev.title ?? '').trim();
        for (const o of (ev.EventOccurrences || [])) {
            const uuid = totalPassOccurrenceUuid(o);
            const key = `${evTitle}|${String(o.eventDate).slice(0, 10)}|${String(o.startTime).slice(0, 5)}`;
            if (uuid && key === want) return match(ev, uuid, o.slotsInUse);
        }
    }

    return null;
}

/**
 * Ids de los slots VIVOS de una ocurrencia — las reservas de socias que hay que
 * cancelar en TotalPass antes de borrar la clase, para que la app les avise que
 * ya no va. Función PURA.
 *
 * "Vivo" usa el mismo criterio que el import (`esSlotVivo`): solo `canceled` y
 * `denied` cuentan como caídos. Un slot sin `_id` se ignora (no hay nada que
 * cancelar) y los de OTRAS ocurrencias no se tocan.
 */
export function slotsVivosDeOcurrencia(
    slots: TotalPassOfficialSlot[],
    occurrenceUuid: string,
): string[] {
    return (slots || [])
        .filter((s) => String(s.eventOccurrenceUuid || s.occurrenceUuid || '') === occurrenceUuid)
        .filter((s) => esSlotVivo(s.status))
        .map((s) => String(s._id || ''))
        .filter(Boolean);
}

/**
 * true si todavía tiene sentido pedirle a TotalPass que borre esta ocurrencia.
 * Función PURA.
 *
 * TotalPass rechaza tocar ocurrencias que ya ocurrieron ("Event already
 * happened"). Sin este guard, cada clase cancelada del pasado se quedaría en
 * `pending_delete` reintentando cada 10 minutos contra un error garantizado,
 * quemando rate limit que necesitan las clases futuras. Y no protege a nadie:
 * una clase que ya empezó ya no se puede reservar.
 *
 * Para las del pasado el barrido solo limpia el mapping: el retiro está cumplido
 * de facto.
 */
export function valeLaPenaBorrarEnTp(date: string, hhmm: string, ahora: Date = new Date()): boolean {
    return localDateTimeUtc(date.slice(0, 10), hhmm.slice(0, 5)).getTime() > ahora.getTime();
}

// ── Marca de retiro (solo BD, sin red) ───────────────────────────────────────

/**
 * Marca la clase para que se retire de TotalPass en el próximo barrido. Solo
 * toca la BD: es seguro llamarla dentro del flujo de cancelación y en bucle.
 *
 * Devuelve true si había algo publicado que retirar. Si la clase nunca se
 * publicó en TotalPass no hace nada (y devuelve false).
 */
export async function marcarRetiroTotalpass(classId: string): Promise<boolean> {
    const rows = await query<{ class_id: string }>(
        `UPDATE partner_class_mappings
            SET sync_status = 'pending_delete', updated_at = NOW()
          WHERE class_id = $1 AND channel = 'totalpass'
            AND sync_status IN ('published', 'pending_delete')
          RETURNING class_id`,
        [classId],
    ).catch((e: any) => {
        // Nunca romper la cancelación por esto: la clase local YA se canceló y eso
        // es lo que le importa a la clienta. El barrido por cron lo recupera.
        console.error(`[tp-retire] no se pudo marcar el retiro de ${classId}:`, e?.message);
        return [] as { class_id: string }[];
    });
    return rows.length > 0;
}

/**
 * Cancela un retiro pendiente: la clase vuelve a contar como publicada.
 *
 * Hace falta cuando el estudio apaga el cupo TotalPass y lo vuelve a prender
 * antes de que corra el barrido. Sin esto quedaba un mapping en `pending_delete`
 * que el publicador ignora (busca `sync_status='published'`), así que el cron de
 * publicación creaba un evento NUEVO en TotalPass mientras el barrido borraba el
 * viejo — dos eventos peleándose por la misma clase.
 */
export async function desmarcarRetiroTotalpass(classId: string): Promise<void> {
    await query(
        `UPDATE partner_class_mappings
            SET sync_status = 'published', sync_error = NULL, updated_at = NOW()
          WHERE class_id = $1 AND channel = 'totalpass' AND sync_status = 'pending_delete'`,
        [classId],
    ).catch((e: any) => console.error(`[tp-retire] no se pudo desmarcar el retiro de ${classId}:`, e?.message));
}

// ── Barrido de retiros pendientes (red + BD) ─────────────────────────────────

export interface TpRetireSummary {
    pendientes: number;   // mappings marcados para retiro
    retiradas: number;    // ocurrencias borradas en TP
    yaNoEstaban: number;  // ya no existían en TP (solo se limpió el mapping)
    slotsCancelados: number; // reservas de socias canceladas en TP
    fallidas: number;
    skipped?: string;     // 'no-client' | 'rate-limited'
}

/**
 * Barre los mappings en `pending_delete` y los retira de TotalPass:
 * cancela los slots vivos de la ocurrencia (para que la socia se entere por su
 * app), borra la ocurrencia y elimina el mapping.
 *
 * Un solo `listEvents()` por corrida, throttle de 140ms entre llamadas y un 429
 * aborta (los que queden pendientes se retoman en el siguiente barrido — de eso
 * se trata que el estado viva en la BD). Idempotente: si la ocurrencia ya no
 * está en TP, solo limpia el mapping.
 */
export async function retirarClasesPendientesDeTotalpass(): Promise<TpRetireSummary> {
    const base: TpRetireSummary = { pendientes: 0, retiradas: 0, yaNoEstaban: 0, slotsCancelados: 0, fallidas: 0 };

    const pendientes = await query<{
        class_id: string;
        title: string;
        date: string;
        hhmm: string;
        external_occurrence_id: string | null;
    }>(
        `SELECT pcm.class_id, ct.name AS title, c.date::text AS date,
                substr(c.start_time::text, 1, 5) AS hhmm, pcm.external_occurrence_id
           FROM partner_class_mappings pcm
           JOIN classes c ON c.id = pcm.class_id
           JOIN class_types ct ON ct.id = c.class_type_id
          WHERE pcm.channel = 'totalpass'
            AND (
                  -- Orden explícita que dejó el flujo de cancelación.
                  pcm.sync_status = 'pending_delete'
                  -- AUTO-CURA: mapping que quedó publicado aunque la clase ya está
                  -- cancelada. Al desplegar este arreglo había 27 así, vivas y
                  -- reservables en TotalPass, y nadie las iba a marcar a mano. Tapa
                  -- además cualquier deriva futura (una vía nueva de cancelación que
                  -- se olvide de marcar el retiro no vuelve a dejar fantasmas).
                  -- Se limita a 'cancelled' a propósito: una clase 'completed' se dio
                  -- de verdad y su mapping es historial, no basura.
                  OR (pcm.sync_status = 'published' AND c.status = 'cancelled')
                )
          ORDER BY c.date, c.start_time
          LIMIT 200`,
    );
    base.pendientes = pendientes.length;
    if (!pendientes.length) return base;
    // El LIMIT existe para que un error de datos no se convierta en un borrado masivo
    // en TotalPass de una sola corrida. Si se llena, se dice: un tope silencioso se
    // lee como "ya quedó limpio" cuando no lo está. Lo que sobre entra al próximo tick.
    if (pendientes.length >= 200) {
        console.warn('[tp-retire] tope de 200 por corrida alcanzado; el resto se retira en el siguiente barrido');
    }

    const client = await totalPassOfficialFromDb();
    if (!client) return { ...base, skipped: 'no-client' };

    let events: TotalPassOfficialEvent[];
    try {
        events = await client.listEvents();
    } catch (e) {
        if (isTotalPassRateLimit(e)) return { ...base, skipped: 'rate-limited' };
        throw e;
    }

    const summary: TpRetireSummary = { ...base };
    for (const p of pendientes) {
        // Clase ya empezada: TotalPass no deja borrarla y no hay nada que proteger.
        // Se limpia el mapping para que no reintente cada 10 min contra un 422.
        if (!valeLaPenaBorrarEnTp(p.date, p.hhmm)) {
            await limpiarMapping(p.class_id);
            summary.yaNoEstaban++;
            continue;
        }

        const found = findOccurrenceParaRetiro(events, {
            classId: p.class_id,
            title: p.title,
            date: p.date,
            hhmm: p.hhmm,
            knownUuid: p.external_occurrence_id,
        });

        // Ya no está en TotalPass (la borraron a mano o un barrido previo la quitó):
        // el retiro está cumplido, solo queda limpiar el mapping.
        if (!found) {
            await limpiarMapping(p.class_id);
            summary.yaNoEstaban++;
            continue;
        }

        try {
            // 1) Cancelar las reservas de las socias que TotalPass reporta vivas.
            //    Va PRIMERO: borrar la ocurrencia con reservas dentro deja a la
            //    socia con una reserva a una clase que ya no existe.
            if (found.slotsInUse > 0) {
                const slots = await client.listSlots({ eventOccurrenceUuid: found.occurrenceUuid });
                for (const slotId of slotsVivosDeOcurrencia(slots, found.occurrenceUuid)) {
                    await client.cancelSlot(slotId);
                    summary.slotsCancelados++;
                    await new Promise((r) => setTimeout(r, 140));
                }
            }

            // 2) Borrar la ocurrencia y limpiar el mapping.
            await client.deleteOccurrence(found.occurrenceUuid);
            await limpiarMapping(p.class_id);
            summary.retiradas++;
        } catch (e) {
            const msg = (e as Error).message;
            summary.fallidas++;
            await query(
                `UPDATE partner_class_mappings SET sync_error = $2, updated_at = NOW()
                  WHERE class_id = $1 AND channel = 'totalpass'`,
                [p.class_id, msg.slice(0, 500)],
            ).catch(() => { /* best-effort */ });
            console.error(`[tp-retire] ${p.title} ${p.date} ${p.hhmm}:`, msg);
            if (isTotalPassRateLimit(e)) {
                // Los que falten siguen en 'pending_delete': el próximo barrido los toma.
                return { ...summary, skipped: 'rate-limited' };
            }
        }
        await new Promise((r) => setTimeout(r, 140));
    }

    if (summary.retiradas || summary.fallidas || summary.slotsCancelados) {
        console.log(`[tp-retire] retiradas=${summary.retiradas} ya-no-estaban=${summary.yaNoEstaban} slots-cancelados=${summary.slotsCancelados} fallas=${summary.fallidas}`);
    }
    return summary;
}

/**
 * Dispara el barrido sin esperarlo, para que el retiro ocurra en segundos y no
 * en el próximo tick del cron (hasta 10 min después). Se llama al FINAL de cada
 * vía de cancelación, una sola vez, cuando ya se marcaron todas las clases del
 * lote (una serie o un día cerrado marcan varias).
 *
 * No se llama desde `cancelClassWithRefunds` a propósito: ahí correría una vez
 * por clase y todas menos la primera chocarían con el lock, dejando el resto del
 * lote esperando al cron.
 *
 * Nunca lanza: el retiro pendiente ya está guardado en la BD, así que si esto
 * falla el cron lo recupera. La respuesta al admin no debe depender de TotalPass.
 */
export function dispararRetiroTotalpass(): void {
    void (async () => {
        // Mismos dos candados que el cron: sin `is_enabled` el canal todavía no se
        // probó desde el panel y no debemos pegarle a la API real; y el advisory lock
        // (misma llave que TOTALPASS_RETIRE) evita que este disparo se solape con un
        // tick del cron sobre las mismas ocurrencias.
        if (!(await isTotalpassEnabled())) return;
        await withPgAdvisoryLock(471004, () => retirarClasesPendientesDeTotalpass());
    })().catch((e: any) =>
        console.error('[tp-retire] barrido al vuelo falló (lo retoma el cron):', e?.message),
    );
}

/** Borra el mapping: la clase ya no vive en TotalPass. */
async function limpiarMapping(classId: string): Promise<void> {
    await query(
        `DELETE FROM partner_class_mappings WHERE class_id = $1 AND channel = 'totalpass'`,
        [classId],
    );
}
