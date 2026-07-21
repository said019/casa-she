/**
 * token — renovación diaria del JWT de TotalPass fuera del ciclo normal de
 * autenticación perezosa del cliente (`TotalPassOfficial.authenticate`).
 *
 * El cliente ya renueva el token solo cuando está por vencer (60s de margen),
 * pero ese token vive en memoria del proceso: se pierde en cada deploy/reinicio
 * y no queda visible en `platform_credentials` para diagnóstico desde el panel.
 * Este job fuerza una renovación (`force = true`) y persiste el token + su
 * vencimiento aproximado (23h, un margen conservador bajo las 24h reales del
 * JWT) para que el estado sea auditable sin depender de la memoria del proceso.
 */
import { query } from '../../config/database.js';
import { totalPassOfficialFromDb } from './client.js';

/** Fuerza la renovación del JWT de TotalPass y la persiste en `platform_credentials`. */
export async function renewTotalPassToken(): Promise<void> {
    const client = await totalPassOfficialFromDb();
    if (!client) return; // sin credenciales — inerte

    const token = await client.authenticate(true);
    await query(
        `UPDATE platform_credentials
            SET access_token = $1, token_expires_at = NOW() + INTERVAL '23 hours', updated_at = NOW()
          WHERE channel = 'totalpass'`,
        [token],
    );
}
