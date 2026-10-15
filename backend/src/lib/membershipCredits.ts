import { buildAuditRow, type AuditInput } from './audit.js';
import { effectivePermissions } from './permissions.js';

export class MembershipCreditError extends Error {
    constructor(public status: number, message: string, public code?: string) { super(message); }
}
type Connection = { query: (sql: string, args?: any[]) => Promise<{ rows: any[] }>; release: () => void };
type CreditInput = Record<string, unknown>;

/** Lock, validate, mutate and audit on one connection. A failed audit must roll back. */
export async function adjustMembershipCredits(
    pool: { connect: () => Promise<Connection> }, id: string, input: CreditInput,
    actor: { userId: string; role: string }, req?: AuditInput['req'],
) {
    const fields = ['reformer_remaining', 'multi_remaining', 'classes_remaining'] as const;
    const expectedFields = ['expected_reformer_remaining', 'expected_multi_remaining'] as const;
    for (const key of [...fields, ...expectedFields]) {
        const v = input[key];
        if (v !== undefined && v !== null && (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 0)) {
            throw new MembershipCreditError(400, `${key} debe ser un entero >= 0 o null`);
        }
    }
    if (!fields.some(key => input[key] !== undefined)) throw new MembershipCreditError(400, 'Proporciona al menos un saldo.');
    const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
    const calendar = expectedFields.some(key => input[key] !== undefined);
    if (calendar && reason.length < 5) throw new MembershipCreditError(400, 'Incluye un motivo de al menos 5 caracteres.');
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const before = (await client.query('SELECT * FROM memberships WHERE id = $1 FOR UPDATE', [id])).rows[0];
        if (!before) throw new MembershipCreditError(404, 'Membresía no encontrada');
        const staff = (await client.query('SELECT role, permissions, is_reception_master FROM users WHERE id=$1', [actor.userId])).rows[0];
        const unlimitedAdjustment = staff && (['admin', 'super_admin'].includes(staff.role) || staff.is_reception_master || effectivePermissions(staff.permissions).creditos_sin_limite);
        if (!unlimitedAdjustment && reason.length < 5) throw new MembershipCreditError(400, 'Recepción debe incluir un motivo (mínimo 5 caracteres).');
        for (const key of ['reformer_remaining', 'multi_remaining'] as const) {
            if (input[`expected_${key}`] !== undefined && input[`expected_${key}`] !== before[key]) {
                throw new MembershipCreditError(409, 'El saldo cambió. Actualiza la membresía antes de guardar.', 'CREDITS_CHANGED');
            }
            if (input[key] !== undefined && (input[key] === null) !== (before[key] === null)) {
                throw new MembershipCreditError(400, 'No se puede convertir una bolsa ilimitada en finita ni una finita en ilimitada.');
            }
        }
        for (const key of fields) {
            if (!unlimitedAdjustment && input[key] !== undefined && Math.abs(Number(input[key]) - Number(before[key])) > 3) {
                throw new MembershipCreditError(403, `Recepción solo puede ajustar hasta ±3 créditos por movimiento en ${key}.`);
            }
        }
        const reformer = input.reformer_remaining === undefined ? before.reformer_remaining : input.reformer_remaining;
        const multi = input.multi_remaining === undefined ? before.multi_remaining : input.multi_remaining;
        const legacy = reformer === null || multi === null ? null : Number(reformer) + Number(multi);
        const updated = (await client.query(`UPDATE memberships SET reformer_remaining=$1,multi_remaining=$2,classes_remaining=$3,updated_at=NOW() WHERE id=$4 RETURNING *`, [reformer, multi, legacy, id])).rows[0];
        const balances = (m: any) => ({ reformer_remaining: m.reformer_remaining, multi_remaining: m.multi_remaining, classes_remaining: m.classes_remaining });
        const audit = buildAuditRow({ adminUserId: actor.userId, actionType: 'credits_modified', entityType: 'membership', entityId: id, description: `Ajuste de créditos por ${actor.role}${reason ? `: ${reason}` : ''}`, oldData: balances(before), newData: { ...balances(updated), reason: reason || null }, req });
        await client.query(`INSERT INTO admin_actions(admin_user_id,action_type,entity_type,entity_id,description,old_data,new_data,ip_address,user_agent) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [audit.admin_user_id,audit.action_type,audit.entity_type,audit.entity_id,audit.description,audit.old_data,audit.new_data,audit.ip_address,audit.user_agent]);
        await client.query('COMMIT');
        return updated;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally { client.release(); }
}
