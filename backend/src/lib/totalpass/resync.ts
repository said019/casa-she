/**
 * resync — propagar a TotalPass los cambios de una clase ya publicada.
 *
 * Hermano del retiro (`retire.ts`). Editar una clase en Casa Shé —moverla de
 * hora, cambiarle el tipo, cambiarle el coach— no llegaba a TotalPass: la socia
 * seguía viendo los datos viejos en su app, reservaba a la hora vieja y llegaba
 * al estudio cuando la clase ya no estaba ahí. Es peor que el fantasma de una
 * clase cancelada, porque aquí sí hay alguien esperando en la puerta.
 *
 * Mismo diseño en dos tiempos que el retiro, y por las mismas razones: la
 * edición marca el mapping (`sync_status='pending_resync'`, solo BD, sin red —
 * cambiar el coach de una serie toca decenas de clases de un jalón) y un barrido
 * lo ejecuta contra la API, al vuelo y por cron.
 *
 * La distinción cara: TotalPass NO deja mover una ocurrencia. Cambiar título o
 * responsable se hace con `updateOccurrence` sobre la misma ocurrencia y las
 * socias ya reservadas ni se enteran; mover fecha u hora obliga a borrar y
 * recrear, y eso SÍ les tumba la reserva. Por eso `decidirResync` es una función
 * pura y probada: confundirlas significaría cancelarle el lugar a una socia solo
 * porque le cambiaron el coach a la clase.
 */
import { query } from '../../config/database.js';
import { GYM_DEFAULT_COACH } from '../gym-config.js';
import {
    totalPassOfficialFromDb,
    isTotalPassRateLimit,
    type TotalPassOfficialEvent,
} from './client.js';
import { findOccurrenceParaRetiro, slotsVivosDeOcurrencia, valeLaPenaBorrarEnTp } from './retire.js';
import { publishTotalPassClass } from './publish.js';
import { isTotalpassEnabled } from './token.js';
import { withPgAdvisoryLock } from './lock.js';
import { avisarReservaHuerfanaTotalPass } from './alerta-admin.js';

// ── Parte pura (testeable sin BD ni red) ─────────────────────────────────────

/** Cómo se ve la clase en Casa Shé. */
export interface ClaseLocalTp {
    title: string;
    date: string;   // "YYYY-MM-DD"
    hhmm: string;   // "HH:MM"
    coach: string | null;
}

/** Cómo se ve la ocurrencia en TotalPass ahora mismo. */
export interface OcurrenciaTp {
    title: string;
    date: string;   // puede venir como ISO "…T00:00:00.000Z"
    hhmm: string;   // puede venir como "HH:MM:SS"
    responsible?: string | null;
}

export type AccionResync = 'ninguna' | 'editar' | 'mover';

/**
 * Qué hay que hacerle a la ocurrencia de TotalPass para que empate con la clase
 * de Casa Shé. Función PURA.
 *
 *  - `'mover'`  → cambió la fecha o la hora. TotalPass no deja mover una
 *                 ocurrencia: hay que borrarla y recrearla. Tumba las reservas
 *                 vivas, así que el barrido avisa al estudio de cada socia.
 *  - `'editar'` → solo cambió el título o el responsable. `updateOccurrence`
 *                 sobre la misma ocurrencia; nadie pierde su lugar.
 *  - `'ninguna'`→ ya empatan.
 *
 * Las fechas de TotalPass son "hora local marcada como UTC": se rebanan con
 * `.slice`, nunca se convierten con `new Date()`. El título se compara con trim
 * simétrico (TP lo guarda tal cual se lo mandaron) y una clase sin coach no se
 * pelea con el responsable por defecto del gym: al recrear pondría ese mismo.
 */
export function decidirResync(local: ClaseLocalTp, occ: OcurrenciaTp): AccionResync {
    const mismaFecha = local.date.slice(0, 10) === String(occ.date).slice(0, 10);
    const mismaHora = local.hhmm.slice(0, 5) === String(occ.hhmm).slice(0, 5);
    if (!mismaFecha || !mismaHora) return 'mover';

    const mismoTitulo = local.title.trim() === String(occ.title ?? '').trim();
    const coachLocal = (local.coach || '').trim() || GYM_DEFAULT_COACH;
    const mismoCoach = coachLocal === String(occ.responsible ?? '').trim();
    if (!mismoTitulo || !mismoCoach) return 'editar';

    return 'ninguna';
}

// ── Marca de resincronización (solo BD, sin red) ─────────────────────────────

/**
 * Marca una clase para que sus datos se empujen a TotalPass en el próximo
 * barrido. Solo BD: seguro dentro del handler y en bucle (cambiar el coach de
 * una serie toca decenas de clases).
 *
 * Solo aplica a clases ya publicadas: si nunca se publicó no hay nada que
 * resincronizar, y si está marcada para retiro NO se toca — retirarla gana.
 */
export async function marcarResyncTotalpass(classIds: string[]): Promise<number> {
    if (!classIds.length) return 0;
    const rows = await query<{ class_id: string }>(
        `UPDATE partner_class_mappings
            SET sync_status = 'pending_resync', updated_at = NOW()
          WHERE channel = 'totalpass'
            AND class_id = ANY($1::uuid[])
            AND sync_status IN ('published', 'pending_resync')
          RETURNING class_id`,
        [classIds],
    ).catch((e: any) => {
        // Nunca romper la edición por esto: el cambio local YA quedó guardado.
        console.error('[tp-resync] no se pudo marcar la resincronización:', e?.message);
        return [] as { class_id: string }[];
    });
    return rows.length;
}

// ── Barrido de resincronizaciones pendientes (red + BD) ──────────────────────

export interface TpResyncSummary {
    pendientes: number;
    editadas: number;    // updateOccurrence en su lugar
    movidas: number;     // borradas y recreadas
    sinCambio: number;   // ya empataban
    noEstaban: number;   // ya no viven en TP
    sociasAvisadas: number; // reservas que se cayeron al mover
    fallidas: number;
    skipped?: string;
}

interface FilaResync {
    class_id: string;
    title: string;
    date: string;
    hhmm: string;
    coach: string | null;
    external_occurrence_id: string | null;
}

/**
 * Empuja a TotalPass los datos de las clases marcadas. Un solo `listEvents()`
 * por corrida, throttle de 140ms y un 429 corta (lo que quede se retoma en el
 * siguiente barrido: el estado vive en la BD).
 *
 * Al MOVER se cancelan primero los slots de las socias —TotalPass les avisa— y
 * se manda un aviso al estudio por cada una, porque la socia había apartado una
 * hora que ya no existe y alguien tiene que hablarle.
 */
export async function resincronizarClasesPendientes(): Promise<TpResyncSummary> {
    const base: TpResyncSummary = {
        pendientes: 0, editadas: 0, movidas: 0, sinCambio: 0,
        noEstaban: 0, sociasAvisadas: 0, fallidas: 0,
    };

    const pendientes = await query<FilaResync>(
        `SELECT pcm.class_id, ct.name AS title, c.date::text AS date,
                substr(c.start_time::text, 1, 5) AS hhmm, i.display_name AS coach,
                pcm.external_occurrence_id
           FROM partner_class_mappings pcm
           JOIN classes c ON c.id = pcm.class_id
           JOIN class_types ct ON ct.id = c.class_type_id
           LEFT JOIN instructors i ON i.id = c.instructor_id
          WHERE pcm.channel = 'totalpass'
            AND pcm.sync_status = 'pending_resync'
            AND c.status = 'scheduled'
          ORDER BY c.date, c.start_time
          LIMIT 200`,
    );
    base.pendientes = pendientes.length;
    if (!pendientes.length) return base;
    if (pendientes.length >= 200) {
        console.warn('[tp-resync] tope de 200 por corrida alcanzado; el resto entra al siguiente barrido');
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

    const summary: TpResyncSummary = { ...base };
    for (const p of pendientes) {
        try {
            // La ocurrencia se localiza por el ESTADO VIEJO que TP todavía tiene, así
            // que buscar por título|fecha|hora nueva no serviría cuando la clase se
            // movió. Por eso el uuid guardado y el externalReference (= id de la clase,
            // que no cambia nunca) son las llaves que importan aquí.
            const found = findOccurrenceParaRetiro(events, {
                classId: p.class_id, title: p.title, date: p.date, hhmm: p.hhmm,
                knownUuid: p.external_occurrence_id,
            });
            if (!found) {
                // Ya no está en TP: que el publicador la cree de cero.
                await limpiarMapping(p.class_id);
                await publishTotalPassClass(p.class_id);
                summary.noEstaban++;
                continue;
            }

            const occ = ocurrenciaDelSnapshot(events, found.occurrenceUuid);
            const accion = occ ? decidirResync(p, occ) : 'mover';

            if (accion === 'ninguna') {
                await marcarPublicado(p.class_id);
                summary.sinCambio++;
                continue;
            }

            if (accion === 'editar') {
                await client.updateOccurrence(found.occurrenceUuid, {
                    title: p.title.trim(),
                    responsible: (p.coach || '').trim() || GYM_DEFAULT_COACH,
                });
                await marcarPublicado(p.class_id);
                summary.editadas++;
            } else {
                // MOVER: cancelar las reservas vivas (TotalPass le avisa a la socia),
                // avisar al estudio de cada una, borrar y dejar que el publicador la
                // recree con los datos nuevos.
                if (found.slotsInUse > 0) {
                    const slots = await client.listSlots({ eventOccurrenceUuid: found.occurrenceUuid });
                    for (const slotId of slotsVivosDeOcurrencia(slots, found.occurrenceUuid)) {
                        await client.cancelSlot(slotId);
                        summary.sociasAvisadas++;
                        await avisarSociaDesplazada(slots, slotId, p);
                        await new Promise((r) => setTimeout(r, 140));
                    }
                }
                if (valeLaPenaBorrarEnTp(p.date, p.hhmm)) {
                    await client.deleteOccurrence(found.occurrenceUuid);
                }
                await limpiarMapping(p.class_id);
                // Si la clase quedó a menos de ~4.5h de empezar, el publicador la
                // rechaza ('too-soon': TotalPass exige que el tope de cancelación sea
                // futuro) y la clase simplemente NO vuelve a aparecer en TotalPass.
                // Es el desenlace correcto: preferimos que la socia no la vea a que la
                // vea en un horario equivocado. El cron de publicación la retomará si
                // en algún momento vuelve a calificar.
                await publishTotalPassClass(p.class_id);
                summary.movidas++;
            }
        } catch (e) {
            const msg = (e as Error).message;
            summary.fallidas++;
            await query(
                `UPDATE partner_class_mappings SET sync_error = $2, updated_at = NOW()
                  WHERE class_id = $1 AND channel = 'totalpass'`,
                [p.class_id, msg.slice(0, 500)],
            ).catch(() => { /* best-effort */ });
            console.error(`[tp-resync] ${p.title} ${p.date} ${p.hhmm}:`, msg);
            if (isTotalPassRateLimit(e)) return { ...summary, skipped: 'rate-limited' };
        }
        await new Promise((r) => setTimeout(r, 140));
    }

    if (summary.editadas || summary.movidas || summary.fallidas) {
        console.log(`[tp-resync] editadas=${summary.editadas} movidas=${summary.movidas} sin-cambio=${summary.sinCambio} no-estaban=${summary.noEstaban} socias-avisadas=${summary.sociasAvisadas} fallas=${summary.fallidas}`);
    }
    return summary;
}

/**
 * Dispara el barrido sin esperarlo, para que el cambio llegue a TotalPass en
 * segundos y no en el próximo tick del cron. Mismos dos candados que el cron
 * (`is_enabled` y el advisory lock). Nunca lanza: la marca ya está en la BD.
 */
export function dispararResyncTotalpass(): void {
    void (async () => {
        if (!(await isTotalpassEnabled())) return;
        await withPgAdvisoryLock(471005, () => resincronizarClasesPendientes());
    })().catch((e: any) =>
        console.error('[tp-resync] barrido al vuelo falló (lo retoma el cron):', e?.message),
    );
}

// ── Auxiliares ───────────────────────────────────────────────────────────────

/** La ocurrencia cruda del snapshot, para comparar sus datos con los de la clase. */
function ocurrenciaDelSnapshot(events: TotalPassOfficialEvent[], uuid: string): OcurrenciaTp | null {
    for (const ev of events || []) {
        for (const o of (ev.EventOccurrences || [])) {
            if ((o.occurrenceUuid ?? o.eventOccurrenceUuid) === uuid) {
                return {
                    title: String(ev.title ?? ''),
                    date: String(o.eventDate ?? ''),
                    hhmm: String(o.startTime ?? ''),
                    responsible: (o.responsible ?? ev.responsible ?? null) as string | null,
                };
            }
        }
    }
    return null;
}

/**
 * Avisa al estudio que a una socia se le cayó la reserva porque la clase se
 * movió. Reusa el aviso de reserva huérfana: el caso es el mismo desde donde
 * importa (una socia con una reserva que ya no corresponde a nada) y lo que hace
 * falta también — que alguien le hable.
 */
async function avisarSociaDesplazada(slots: any[], slotId: string, p: FilaResync): Promise<void> {
    const slot = (slots || []).find((s) => String(s?._id) === slotId);
    await avisarReservaHuerfanaTotalPass({
        socia: String(slot?.user?.name || '').trim() || 'Socia de TotalPass',
        clase: p.title,
        fecha: String(slot?.slotDate || p.date).slice(0, 10),
        hora: String(slot?.startTime || p.hhmm).slice(0, 5),
        telefono: slot?.user?.phone ? String(slot.user.phone) : null,
    }).catch((e: any) => console.error('[tp-resync] aviso de socia desplazada falló:', e?.message));
}

async function marcarPublicado(classId: string): Promise<void> {
    await query(
        `UPDATE partner_class_mappings
            SET sync_status = 'published', sync_error = NULL, last_synced_at = NOW(), updated_at = NOW()
          WHERE class_id = $1 AND channel = 'totalpass'`,
        [classId],
    );
}

async function limpiarMapping(classId: string): Promise<void> {
    await query(
        `DELETE FROM partner_class_mappings WHERE class_id = $1 AND channel = 'totalpass'`,
        [classId],
    );
}
