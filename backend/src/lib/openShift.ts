import { queryOne } from '../config/database.js';

// Turno de caja ABIERTO del usuario (vendedor), o null. Se usa para ligar un cobro al
// corte de caja (shift_id) y heredar su sucursal (facility_id) — igual que el POS de
// productos (sales). Si el usuario no tiene caja abierta (p. ej. admin de back-office),
// devuelve null y el cobro queda sin shift_id (no entra a ningún corte, que es lo correcto).
export async function openShiftForUser(
    userId: string,
): Promise<{ id: string; facility_id: string | null } | null> {
    if (!userId) return null;
    return queryOne<{ id: string; facility_id: string | null }>(
        `SELECT id, facility_id FROM cash_shifts WHERE opened_by = $1 AND status = 'open'`,
        [userId],
    );
}
