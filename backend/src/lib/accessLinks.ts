import { createHash, randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import { pool } from '../config/database.js';

/**
 * Links de acceso: la alumna creada por recepción crea su contraseña desde WhatsApp.
 * El token es opaco (32 bytes aleatorios, base64url), NO es un JWT: no puede usarse como
 * sesión. En la base solo vive su sha256. Vence a los 7 días, se usa una sola vez y
 * generar uno nuevo revoca los anteriores de esa alumna.
 */

export type AccessDb = {
    query: (text: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount: number | null }>;
};

export const VIGENCIA_DIAS = 7;

export type EstadoLink = 'LINK_VENCIDO' | 'LINK_USADO' | 'LINK_INVALIDO';

export function hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
}

function frontendUrl(): string {
    return (process.env.FRONTEND_URL || 'https://casashe.mx').replace(/\/+$/, '');
}

/** Crea un link nuevo y revoca los activos de esa alumna. Corre en el `db` que se le pase.
 *  Si es el pool, abre su propia transacción con un advisory lock por alumna: dos llamadas
 *  concurrentes se serializan y nunca quedan dos links activos. Si es un cliente (la
 *  transacción del alta rápida, donde la alumna es nueva), usa esa conexión tal cual. */
export async function crearLinkAcceso(
    db: AccessDb,
    userId: string,
    creadoPor: string | null,
): Promise<{ url: string; venceEl: string }> {
    const conPool = db as AccessDb & { connect?: () => Promise<AccessDb & { release: () => void }> };
    // Un PoolClient también tiene `connect`, pero se distingue por `release`.
    if (typeof conPool.connect !== 'function' || 'release' in db) return crearLinkEn(db, userId, creadoPor);
    const client = await conPool.connect();
    try {
        await client.query('BEGIN');
        await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`access-link:${userId}`]);
        const r = await crearLinkEn(client, userId, creadoPor);
        await client.query('COMMIT');
        return r;
    } catch (e) {
        try { await client.query('ROLLBACK'); } catch { /* ya cerrada */ }
        throw e;
    } finally {
        client.release();
    }
}

async function crearLinkEn(
    db: AccessDb,
    userId: string,
    creadoPor: string | null,
): Promise<{ url: string; venceEl: string }> {
    await db.query(
        `UPDATE access_links SET revoked_at = NOW()
          WHERE user_id = $1 AND used_at IS NULL AND revoked_at IS NULL`,
        [userId],
    );
    const token = randomBytes(32).toString('base64url');
    const { rows } = await db.query(
        `INSERT INTO access_links (user_id, token_hash, created_by, expires_at)
         VALUES ($1, $2, $3, NOW() + make_interval(days => $4))
         RETURNING expires_at`,
        [userId, hashToken(token), creadoPor, VIGENCIA_DIAS],
    );
    return {
        url: `${frontendUrl()}/acceso/${token}`,
        venceEl: new Date(rows[0].expires_at).toISOString(),
    };
}

type FilaLink = {
    id: string; user_id: string; expires_at: Date; used_at: Date | null; revoked_at: Date | null;
    display_name: string; email: string; is_active: boolean | null;
};

function estadoDe(f: FilaLink | undefined): EstadoLink | null {
    if (!f) return 'LINK_INVALIDO';
    if (f.used_at) return 'LINK_USADO';
    if (f.revoked_at) return 'LINK_INVALIDO';
    if (new Date(f.expires_at).getTime() <= Date.now()) return 'LINK_VENCIDO';
    if (f.is_active === false) return 'LINK_INVALIDO';
    return null;
}

const SELECT_LINK = `
    SELECT l.id, l.user_id, l.expires_at, l.used_at, l.revoked_at,
           u.display_name, u.email, u.is_active
      FROM access_links l JOIN users u ON u.id = l.user_id
     WHERE l.token_hash = $1`;

/** Datos para saludar a la alumna, o el motivo por el que el link ya no sirve. */
export async function consultarLinkAcceso(
    token: string,
    db: AccessDb = pool,
): Promise<{ ok: true; nombre: string; email: string } | { ok: false; code: EstadoLink }> {
    if (typeof token !== 'string' || token.length < 20 || token.length > 200) {
        return { ok: false, code: 'LINK_INVALIDO' };
    }
    const { rows } = await db.query(SELECT_LINK, [hashToken(token)]);
    const fila = rows[0] as FilaLink | undefined;
    const code = estadoDe(fila);
    if (code) return { ok: false, code };
    return { ok: true, nombre: fila!.display_name, email: fila!.email };
}

/** Consume el link (un solo uso, atómico) y guarda la contraseña. Devuelve el userId. */
export async function usarLinkAcceso(
    token: string,
    password: string,
): Promise<{ ok: true; userId: string } | { ok: false; code: EstadoLink }> {
    if (typeof token !== 'string' || token.length < 20 || token.length > 200) {
        return { ok: false, code: 'LINK_INVALIDO' };
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        // FOR UPDATE OF l: dos usos simultáneos se serializan y el segundo ve used_at.
        const { rows } = await client.query(`${SELECT_LINK} FOR UPDATE OF l`, [hashToken(token)]);
        const fila = rows[0] as FilaLink | undefined;
        const code = estadoDe(fila);
        if (code) {
            await client.query('ROLLBACK');
            return { ok: false, code };
        }
        await client.query('UPDATE access_links SET used_at = NOW() WHERE id = $1', [fila!.id]);
        await client.query(
            'UPDATE users SET password_hash = $1, temp_password = false, updated_at = NOW() WHERE id = $2',
            [passwordHash, fila!.user_id],
        );
        await client.query('COMMIT');
        return { ok: true, userId: fila!.user_id };
    } catch (e) {
        try { await client.query('ROLLBACK'); } catch { /* noop */ }
        throw e;
    } finally {
        client.release();
    }
}
