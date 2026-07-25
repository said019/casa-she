import type { PoolClient } from 'pg';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';

export function normalizeMxPhone(raw: string): string {
    const digits = (raw || '').replace(/\D/g, '');
    return digits.slice(-10);
}

export async function findOrCreateGuest(
    db: PoolClient,
    input: { name: string; phone: string; email?: string },
): Promise<{ userId: string; created: boolean }> {
    const phone = normalizeMxPhone(input.phone);
    const email = (input.email?.trim() || `inv-${phone}@invitado.bmb`).toLowerCase();

    // Sin teléfono NO se busca por teléfono: `right(...,10) = ''` empata con CUALQUIER
    // usuario que tenga el teléfono vacío (hay varios en prod), y le colgaba la reserva
    // a una persona equivocada. Sin teléfono, la identidad la define solo el email.
    const existing = phone
        ? await db.query<{ id: string }>(
            `SELECT id FROM users
              WHERE right(regexp_replace(COALESCE(phone, ''), '\\D', '', 'g'), 10) = $1
                 OR lower(email) = $2
              LIMIT 1`,
            [phone, email],
        )
        : await db.query<{ id: string }>(
            `SELECT id FROM users WHERE lower(email) = $1 LIMIT 1`,
            [email],
        );
    if (existing.rows[0]) return { userId: existing.rows[0].id, created: false };
    const passwordHash = await bcrypt.hash(randomBytes(9).toString('base64url'), 12);
    const created = await db.query<{ id: string }>(
        `INSERT INTO users (email, phone, display_name, password_hash, role)
         VALUES ($1, $2, $3, $4, 'client')
         RETURNING id`,
        [email, phone, input.name.trim(), passwordHash],
    );
    return { userId: created.rows[0].id, created: true };
}
