import { filas, type ClienteTx } from '../db-tx.js';
import { validateCap } from '../totalpass/caps.js';

/**
 * Fija (o apaga con 0) el cupo FitPass de una clase: UPSERT sobre channel_inventory.
 * Mismas reglas que TotalPass: no bajar de lo ya reservado por FitPass ni pasar de la capacidad.
 * Apagar (0) borra la fila (solo sin reservas): el pool de respaldo empuja entonces
 * ceiling = reservas FP = 0 y FitPass deja de vender; NO cancela la schedule (eso es una
 * decisión de cancelar la clase, no de cerrar el canal).
 */
export async function setFitpassCap(classId: string, maxSpots: number, db?: ClienteTx): Promise<{ max_spots: number; booked_spots: number }> {
    const [cls] = await filas<{ max_capacity: number }>(db, `SELECT max_capacity FROM classes WHERE id = $1`, [classId]);
    if (!cls) throw Object.assign(new Error('Clase no encontrada'), { code: 'CLASS_NOT_FOUND' });
    const [inv] = await filas<{ booked_spots: number }>(db,
        `SELECT booked_spots FROM channel_inventory WHERE class_id = $1 AND channel = 'fitpass'`, [classId]);
    const booked = inv ? Number(inv.booked_spots) : 0;
    const err = validateCap(maxSpots, booked, Number(cls.max_capacity));
    if (err) throw Object.assign(new Error(err), { code: err, booked });
    if (maxSpots === 0) {
        await filas(db, `DELETE FROM channel_inventory WHERE class_id = $1 AND channel = 'fitpass' AND booked_spots = 0`, [classId]);
        return { max_spots: 0, booked_spots: booked };
    }
    const [saved] = await filas<{ max_spots: number; booked_spots: number }>(db,
        `INSERT INTO channel_inventory (class_id, channel, max_spots) VALUES ($1, 'fitpass', $2)
         ON CONFLICT (class_id, channel) DO UPDATE SET max_spots = EXCLUDED.max_spots, updated_at = NOW()
         RETURNING max_spots, booked_spots`, [classId, maxSpots]);
    return saved!;
}
