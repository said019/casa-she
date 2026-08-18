import { query, queryOne } from '../../config/database.js';
import { marcarRetiroTotalpass, desmarcarRetiroTotalpass } from './retire.js';

// Matemática de cupo por canal (portada de Hundred partner-pool.ts). Fórmula ÚNICA de todo el sistema.
export function channelCapAvailable(capacity: number, totalBooked: number, channelBooked: number, cap: number | null): number {
  if (cap == null) return 0;
  const physicalFree = Math.max(0, Math.floor(capacity) - Math.max(0, Math.floor(totalBooked)));
  const capRoom = Math.max(0, Math.floor(cap) - Math.max(0, Math.floor(channelBooked)));
  return Math.max(0, Math.min(capRoom, physicalFree));
}

/** Número a EMPUJAR a la plataforma como `slots`. */
export function channelCapCeiling(capacity: number, totalBooked: number, channelBooked: number, cap: number | null): number {
  const chBooked = Math.max(0, Math.floor(channelBooked));
  return chBooked + channelCapAvailable(capacity, totalBooked, channelBooked, cap);
}

export interface PoolSnapshotCounts { capacity: number; total: number; totalpass: number }
export function buildPoolSnapshot(c: PoolSnapshotCounts, tpCap: number | null) {
  const capacity = Math.max(0, Math.floor(c.capacity));
  const total = Math.max(0, Math.floor(c.total));
  return {
    capacity,
    totalBooked: total,
    physicalFree: Math.max(0, capacity - total),
    tpAvailable: channelCapAvailable(capacity, total, c.totalpass, tpCap),
    tpCeiling: channelCapCeiling(capacity, total, c.totalpass, tpCap),
  };
}

// Valida un cambio de cupo TotalPass antes de persistirlo.
export function validateCap(maxSpots: number, booked: number, capacity: number): null | 'CAP_BELOW_BOOKED' | 'CAP_EXCEEDS_CAPACITY' {
  if (maxSpots < booked) return 'CAP_BELOW_BOOKED';
  if (maxSpots > capacity) return 'CAP_EXCEEDS_CAPACITY';
  return null;
}

// Lee el cupo TotalPass configurado para una clase (null = canal apagado, sin fila).
export async function getChannelCaps(classId: string): Promise<{ totalpass: number | null }> {
  const row = await queryOne<{ max_spots: number }>(
    `SELECT max_spots FROM channel_inventory WHERE class_id = $1 AND channel = 'totalpass'`, [classId]);
  return { totalpass: row ? Number(row.max_spots) : null };
}

// Fija (o apaga con 0) el cupo TotalPass de una clase. UPSERT sobre channel_inventory.
export async function setTotalpassCap(classId: string, maxSpots: number): Promise<{ max_spots: number; booked_spots: number }> {
  const cls = await queryOne<{ max_capacity: number }>(
    `SELECT max_capacity FROM classes WHERE id = $1`, [classId]);
  if (!cls) throw Object.assign(new Error('Clase no encontrada'), { code: 'CLASS_NOT_FOUND' });
  const inv = await queryOne<{ booked_spots: number }>(
    `SELECT booked_spots FROM channel_inventory WHERE class_id = $1 AND channel = 'totalpass'`, [classId]);
  const booked = inv ? Number(inv.booked_spots) : 0;
  const err = validateCap(maxSpots, booked, Number(cls.max_capacity));
  if (err) throw Object.assign(new Error(err), { code: err, booked });
  if (maxSpots === 0) {
    // Apagar el canal: borra la fila solo si no hay reservas activas (booked_spots = 0).
    await query(`DELETE FROM channel_inventory WHERE class_id = $1 AND channel = 'totalpass' AND booked_spots = 0`, [classId]);
    // …y RETIRAR la clase de TotalPass. Sin esto quedaba fantasma: el reconcile de
    // cupo hace JOIN con `max_spots > 0`, así que al borrar la fila dejaba de tocar
    // esa clase y el evento se quedaba vivo en TP con su cupo viejo, para siempre.
    await marcarRetiroTotalpass(classId);
    return { max_spots: 0, booked_spots: booked };
  }
  const saved = await queryOne<{ max_spots: number; booked_spots: number }>(
    `INSERT INTO channel_inventory (class_id, channel, max_spots) VALUES ($1, 'totalpass', $2)
     ON CONFLICT (class_id, channel) DO UPDATE SET max_spots = EXCLUDED.max_spots, updated_at = NOW()
     RETURNING max_spots, booked_spots`, [classId, maxSpots]);
  // Volver a prender el canal cancela un retiro pendiente: si el barrido todavía no
  // corría, dejarlo en 'pending_delete' haría que el publicador creara un evento
  // NUEVO (busca mappings 'published') mientras el barrido borra el viejo.
  await desmarcarRetiroTotalpass(classId);
  return saved!;
}
