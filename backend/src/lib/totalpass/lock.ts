/**
 * lock — advisory lock de Postgres para evitar corridas concurrentes de los
 * jobs de TotalPass (import/pool/publish). Sin esto, un cron lento (p.ej. el
 * import de reservas tardándose más de 5 min) podría solaparse con su propio
 * siguiente tick, o con un trigger manual disparado desde el panel mientras
 * el cron sigue corriendo — dos corridas pisándose sobre las mismas clases.
 *
 * `pg_try_advisory_lock`/`pg_advisory_unlock` son de SESIÓN: el lock y el
 * unlock deben ir por la MISMA conexión, por eso se usa `pool.connect()` (una
 * conexión dedicada) en vez de `query()` del pool, que puede repartir cada
 * llamada a una conexión física distinta.
 */
import { pool } from '../../config/database.js';

/**
 * Corre `fn()` bajo un advisory lock de Postgres identificado por `key`.
 *
 * - Si el lock ya está tomado (otra corrida en curso), devuelve `null` de
 *   inmediato SIN ejecutar `fn` — no espera, no pisa la corrida en curso.
 * - Si lo obtiene, ejecuta `fn()` y libera el lock en `finally`, incluso si
 *   `fn()` lanza (el error se re-lanza después de liberar).
 *
 * Claves por job (evitar colisiones entre jobs distintos):
 *   471001 = import, 471002 = pool, 471003 = publish.
 */
export async function withPgAdvisoryLock<T>(key: number, fn: () => Promise<T>): Promise<T | null> {
    const client = await pool.connect();
    try {
        const lockResult = await client.query<{ pg_try_advisory_lock: boolean }>(
            'SELECT pg_try_advisory_lock($1) AS pg_try_advisory_lock',
            [key],
        );
        const acquired = lockResult.rows[0]?.pg_try_advisory_lock === true;
        if (!acquired) return null; // otra corrida en curso — no esperar, no pisar

        try {
            return await fn();
        } finally {
            await client.query('SELECT pg_advisory_unlock($1)', [key]).catch((err) => {
                // No relanzar: el resultado de fn() ya es lo importante. Un unlock fallido
                // libera solo al cerrarse la conexión (release), que sí ocurre en el finally externo.
                console.error(`[withPgAdvisoryLock] no se pudo liberar el lock ${key}:`, err);
            });
        }
    } finally {
        client.release();
    }
}
