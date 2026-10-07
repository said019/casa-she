/**
 * Avisos a las alumnas de la app cuando su clase cambia de día u hora desde
 * "Editar clase" (PUT /api/classes/:id). Mismo mecanismo que los cambios en bloque:
 * notificación in-app + web push (`writeInAppNotification`).
 */
import { query, queryOne } from '../config/database.js';
import { writeInAppNotification } from './in-app-notifications.js';
import { fechaLarga, horaLegible } from './classes-bulk.js';

export interface HorarioDeClase {
    tipo: string;
    fecha: string;   // YYYY-MM-DD
    inicio: string;  // HH:MM
}

/** Tipo, fecha e inicio tal como están en la base (null si la clase no existe). */
export async function horarioDeClase(classId: string): Promise<HorarioDeClase | null> {
    return queryOne<HorarioDeClase>(
        `SELECT ct.name AS tipo, to_char(c.date, 'YYYY-MM-DD') AS fecha, to_char(c.start_time, 'HH24:MI') AS inicio
           FROM classes c JOIN class_types ct ON ct.id = c.class_type_id
          WHERE c.id = $1`,
        [classId],
    );
}

/** El aviso cuando cambió el día o la hora de inicio; null si no cambió ninguno. Pura. */
export function avisoCambioDeHorario(antes: HorarioDeClase, despues: HorarioDeClase): { title: string; body: string } | null {
    if (antes.fecha === despues.fecha && antes.inicio === despues.inicio) return null;
    if (antes.fecha === despues.fecha) {
        return {
            title: 'Tu clase cambió de hora',
            body: `${antes.tipo} del ${fechaLarga(antes.fecha)} ahora es a las ${horaLegible(despues.inicio)} (antes ${horaLegible(antes.inicio)}).`,
        };
    }
    return {
        title: 'Tu clase cambió de día',
        body: `${antes.tipo} del ${fechaLarga(antes.fecha)} a las ${horaLegible(antes.inicio)} ahora es el ${fechaLarga(despues.fecha)} a las ${horaLegible(despues.inicio)}.`,
    };
}

/** Manda el aviso a cada inscrita de la app (confirmada o en espera). Nunca lanza. Devuelve a cuántas. */
export async function avisarAlumnasDeLaApp(classId: string, aviso: { title: string; body: string }): Promise<number> {
    try {
        const alumnas = await query<{ user_id: string }>(
            `SELECT DISTINCT user_id FROM bookings
              WHERE class_id = $1 AND status IN ('confirmed', 'waitlist') AND channel = 'app'`,
            [classId],
        );
        for (const a of alumnas) {
            await writeInAppNotification({ userId: a.user_id, ...aviso, type: 'class_updated', data: { classId } });
        }
        return alumnas.length;
    } catch (e) {
        console.error('[avisos-clase] no se pudo avisar del cambio de horario:', e);
        return 0;
    }
}
