import { pool } from '../config/database.js';

export interface FinalizeEventOpts { provider: string; paymentRef: string | null; paidAmount?: number | null; }

/** Cliente de Postgres o el pool. Permite inyectar la tx del test (BEGIN → assert → ROLLBACK). */
type Db = { query: (text: string, params?: any[]) => Promise<{ rows: any[] }> };

/**
 * El trabajo real de confirmar. Asume que YA se está dentro de una transacción: el
 * SELECT ... FOR UPDATE no sirve de nada fuera de una.
 */
async function confirmOnDb(db: Db, registrationId: string, opts: FinalizeEventOpts): Promise<boolean> {
    const locked = await db.query(
        `SELECT status, amount, user_id, hold_expires_at
           FROM event_registrations WHERE id = $1 FOR UPDATE`,
        [registrationId]
    );
    const reg = locked.rows[0];
    if (!reg) {
        console.warn('finalizeEventRegistration: no existe', registrationId);
        return false;
    }
    if (reg.status === 'confirmed') return false; // idempotente

    // Reconciliación: MP debió cobrar exactamente el monto de la inscripción.
    if (opts.paidAmount != null) {
        const expected = Number(reg.amount);
        if (Number.isFinite(expected) && Math.abs(Number(opts.paidAmount) - expected) > 0.01) {
            console.warn(`finalizeEventRegistration: pagado ($${opts.paidAmount}) != esperado ($${expected}) en ${registrationId}`);
        }
    }

    // El pago manda sobre el hold: si el lugar expiró mientras pagaba, se confirma igual.
    // Preferimos sobrevender un lugar antes que cobrarle a alguien y no darle entrada.
    if (reg.hold_expires_at && new Date(reg.hold_expires_at).getTime() < Date.now()) {
        console.warn(`finalizeEventRegistration: ${registrationId} pagó con el hold ya vencido — se confirma de todos modos`);
    }

    await db.query(
        `UPDATE event_registrations
            SET status = 'confirmed', paid_at = NOW(), hold_expires_at = NULL,
                mp_payment_id = $1, provider = $2, updated_at = NOW()
          WHERE id = $3`,
        [opts.paymentRef, opts.provider, registrationId]
    );

    if (reg.user_id) {
        await db.query(
            `INSERT INTO payments (user_id, amount, currency, payment_method, status, provider, reference_id)
             VALUES ($1, $2, 'MXN', 'card', 'completed', $3, $4)`,
            [reg.user_id, reg.amount, opts.provider, opts.paymentRef]
        );
    }
    return true;
}

/**
 * Confirma una inscripción a evento al aprobarse el pago con tarjeta. Idempotente.
 *
 * El estado se re-lee con FOR UPDATE DENTRO de la transacción: un guard leído fuera no
 * protege contra dos ejecuciones concurrentes (reintento del webhook de MP + sync manual),
 * y sin el lock ambas pasarían el guard y escribirían dos filas en `payments` = doble cobro
 * registrado. Mismo criterio que finalizePaidOrder y finalizeBarOrder.
 *
 * Si se pasa `db`, se asume que el llamador ya abrió la transacción (lo usan los tests).
 */
export async function finalizeEventRegistration(
    registrationId: string, opts: FinalizeEventOpts, db?: Db
): Promise<void> {
    if (db) {
        const done = await confirmOnDb(db, registrationId, opts);
        if (done) console.log(`finalizeEventRegistration ${opts.paymentRef} → inscripción ${registrationId} confirmada`);
        return;
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const done = await confirmOnDb(client, registrationId, opts);
        await client.query('COMMIT');
        if (done) console.log(`finalizeEventRegistration ${opts.paymentRef} → inscripción ${registrationId} confirmada`);
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
    }
}

/**
 * Libera los lugares apartados por un checkout de tarjeta que nunca se pagó.
 *
 * Solo toca holds de TARJETA: una transferencia pendiente espera a que alguien del estudio
 * confirme el comprobante, y cancelarla borraría el registro de quien ya mandó el dinero.
 *
 * No decrementa `events.registered` a mano — el trigger update_event_registration_count lo
 * hace al salir la fila de ('confirmed','pending').
 */
export async function releaseExpiredEventHolds(eventId?: string, db?: Db): Promise<number> {
    const runner: Db = db ?? pool;
    const params: any[] = [];
    let scope = '';
    if (eventId) {
        params.push(eventId);
        scope = ` AND event_id = $${params.length}`;
    }
    const res = await runner.query(
        `UPDATE event_registrations
            SET status = 'cancelled', hold_expires_at = NULL, updated_at = NOW()
          WHERE status = 'pending'
            AND payment_method = 'card'
            AND hold_expires_at IS NOT NULL
            AND hold_expires_at < NOW()${scope}
        RETURNING id`,
        params
    );
    if (res.rows.length) {
        console.log(`releaseExpiredEventHolds: ${res.rows.length} lugar(es) liberado(s)`);
    }
    return res.rows.length;
}
