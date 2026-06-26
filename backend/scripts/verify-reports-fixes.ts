import assert from 'node:assert/strict';
import { query } from '../src/config/database.js';

const TZ = 'America/Mexico_City';
const start = new Date(Date.now() - 90 * 864e5).toISOString().split('T')[0];
const end = new Date().toISOString().split('T')[0];

async function main() {
    // 1. renewal-by-plan ya no truena por plans.category
    await query(
        `SELECT p.name FROM memberships m JOIN plans p ON p.id = m.plan_id LIMIT 1`
    );
    const cols = await query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'plans'`
    );
    assert.ok(!cols.some(c => c.column_name === 'category'), 'plans.category no debe usarse');

    // 2. ingresos-por-tipo reconcilia con /revenue (mismo total de pagos + eventos)
    const byType = await query<{ total: string }>(`
        SELECT COALESCE(SUM(pay.amount),0)::float AS total FROM payments pay
        WHERE pay.membership_id IS NOT NULL AND pay.status='completed'
          AND (COALESCE(pay.completed_at, pay.created_at) AT TIME ZONE '${TZ}')::date BETWEEN $1 AND $2
        UNION ALL
        SELECT COALESCE(SUM(pay.amount),0)::float FROM payments pay
        WHERE pay.order_id IS NOT NULL AND pay.status='completed'
          AND (COALESCE(pay.completed_at, pay.created_at) AT TIME ZONE '${TZ}')::date BETWEEN $1 AND $2
        UNION ALL
        SELECT COALESCE(SUM(amount),0)::float FROM event_registrations
        WHERE status='confirmed' AND amount>0
          AND (paid_at AT TIME ZONE '${TZ}')::date BETWEEN $1 AND $2`, [start, end]);
    const typeTotal = byType.reduce((s, r) => s + Number(r.total), 0);

    const revTotal = await query<{ total: string }>(`
        SELECT COALESCE(SUM(t),0)::float AS total FROM (
          SELECT pay.amount AS t FROM payments pay
          WHERE pay.status='completed'
            AND (COALESCE(pay.completed_at, pay.created_at) AT TIME ZONE '${TZ}')::date BETWEEN $1 AND $2
          UNION ALL
          SELECT amount FROM event_registrations
          WHERE status='confirmed' AND amount>0
            AND (paid_at AT TIME ZONE '${TZ}')::date BETWEEN $1 AND $2
        ) x`, [start, end]);
    assert.equal(
        Math.round(typeTotal),
        Math.round(Number(revTotal[0].total)),
        'Total por tipo debe igualar total de ingresos'
    );

    console.log('verify-reports-fixes: OK', { typeTotal, revTotal: revTotal[0].total });
    process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
