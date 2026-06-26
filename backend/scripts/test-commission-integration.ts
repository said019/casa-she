import assert from 'node:assert/strict';
import { pool } from '../src/config/database.js';
import { computeCommission } from '../src/lib/commission.js';
import { getStaffSales, getStaffSalesDetail } from '../src/lib/staffSales.js';

async function main() {
  const c = await pool.connect();
  // Ejecutor que corre DENTRO de la transacción de prueba.
  const exec = async <T = any>(s: string, p: any[] = []) => (await c.query(s, p)).rows as T[];
  try {
    await c.query('BEGIN');
    const one = async (s: string, p: any[] = []) => (await c.query(s, p)).rows[0];

    const facility = await one(`SELECT id FROM facilities LIMIT 1`);
    assert.ok(facility, 'falta una facility sembrada');

    // recepcionista + cliente de prueba
    const recep = await one(
      `INSERT INTO users (email,phone,display_name,role,is_active)
       VALUES ($1,$2,'Comisión Test','reception',true) RETURNING id`,
      [`comis_${Date.now()}@t.local`, `57${Date.now()}`.slice(0, 12)]);
    const member = await one(
      `INSERT INTO users (email,phone,display_name) VALUES ($1,$2,'Cliente Comis') RETURNING id`,
      [`comiscli_${Date.now()}@t.local`, `58${Date.now()}`.slice(0, 12)]);

    // Plan PÚBLICO (is_active=true) y plan INACTIVO (is_active=false)
    const planPub = await one(
      `INSERT INTO plans (name,price,duration_days,is_active) VALUES ('Plan Público Test',800,30,true) RETURNING id`);
    const planOff = await one(
      `INSERT INTO plans (name,price,duration_days,is_active) VALUES ('Plan Interno Test',700,30,false) RETURNING id`);

    // Rango = mes actual en CDMX
    const monthRow = await one(`SELECT TO_CHAR((NOW() AT TIME ZONE 'America/Mexico_City')::date,'YYYY-MM') m`);
    const month: string = monthRow.m;
    const from = `${month}-01`;
    const to = (await one(`SELECT TO_CHAR(($1::date + INTERVAL '1 month' - INTERVAL '1 day'),'YYYY-MM-DD') d`, [from])).d;

    // Producto $1200 (cuenta) + producto cancelado $999 (NO cuenta)
    await c.query(`INSERT INTO sales (user_id,seller_id,subtotal,total,payment_method,facility_id,status)
       VALUES ($1,$2,1200,1200,'cash',$3,'completed')`, [member.id, recep.id, facility.id]);
    await c.query(`INSERT INTO sales (user_id,seller_id,subtotal,total,payment_method,facility_id,status)
       VALUES ($1,$2,999,999,'cash',$3,'cancelled')`, [member.id, recep.id, facility.id]);

    // Membresía de plan PÚBLICO $800 (cuenta y comisiona)
    const mPub = await one(`INSERT INTO memberships (user_id,plan_id,start_date,end_date,status)
       VALUES ($1,$2,CURRENT_DATE,CURRENT_DATE,'active') RETURNING id`, [member.id, planPub.id]);
    await c.query(`INSERT INTO payments (user_id,membership_id,amount,payment_method,status,processed_by)
       VALUES ($1,$2,800,'cash','completed',$3)`, [member.id, mPub.id, recep.id]);
    // Membresía de plan INACTIVO $700 (cuenta en total, pero NO comisiona)
    const mOff = await one(`INSERT INTO memberships (user_id,plan_id,start_date,end_date,status)
       VALUES ($1,$2,CURRENT_DATE,CURRENT_DATE,'active') RETURNING id`, [member.id, planOff.id]);
    await c.query(`INSERT INTO payments (user_id,membership_id,amount,payment_method,status,processed_by)
       VALUES ($1,$2,700,'cash','completed',$3)`, [member.id, mOff.id, recep.id]);

    // --- getStaffSales (dentro de la tx) ---
    const rows = await getStaffSales(from, to, { exec });
    const row = rows.find(r => r.user_id === recep.id);
    assert.ok(row, 'el recepcionista de prueba aparece en getStaffSales');
    assert.equal(row!.public_memberships_amount, 800, 'solo la membresía de plan PÚBLICO comisiona');
    assert.equal(row!.public_memberships_count, 1, 'una membresía pública');
    assert.equal(row!.memberships_amount, 1500, 'memberships_amount = 800 + 700 (todas)');
    assert.equal(row!.products_amount, 1200, 'producto cuenta; cancelado excluido');
    assert.equal(row!.products_count, 1, 'un producto');

    // --- getStaffSalesDetail ---
    const detail = await getStaffSalesDetail(recep.id, from, to, { exec });
    assert.equal(detail.memberships.length, 1, 'el desglose solo lista la membresía pública');
    assert.equal(detail.memberships[0].plan_name, 'Plan Público Test');
    assert.equal(detail.products.length, 1, 'el desglose lista un producto (no el cancelado)');

    // --- comisión: base = membresías públicas (800), objetivo 500, 10% → 80 ---
    const { reached, commission } = computeCommission({
      commissionableSales: row!.public_memberships_amount, monthlyTarget: 500, commissionRate: 10,
    });
    assert.equal(reached, true);
    assert.equal(commission, 80);

    // payout snapshot + UNIQUE rechaza duplicado (period_month)
    await c.query(`INSERT INTO commission_payouts (user_id,period_month,total_sales,monthly_target,commission_rate,amount,paid_by)
       VALUES ($1,$2::date,$3,500,10,$4,$1)`, [recep.id, from, row!.public_memberships_amount, commission]);
    await c.query('SAVEPOINT sp_dup');
    let dupRejected = false;
    try {
      await c.query(`INSERT INTO commission_payouts (user_id,period_month,total_sales,monthly_target,commission_rate,amount,paid_by)
         VALUES ($1,$2::date,$3,500,10,$4,$1)`, [recep.id, from, row!.public_memberships_amount, commission]);
    } catch { dupRejected = true; await c.query('ROLLBACK TO SAVEPOINT sp_dup'); }
    assert.ok(dupRejected, 'UNIQUE(user_id, period_month) rechaza payout duplicado');

    await c.query('ROLLBACK');
    console.log('test-commission-integration: OK');
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    console.error('test-commission-integration: FAIL'); console.error(e); process.exitCode = 1;
  } finally {
    c.release(); await pool.end();
  }
}
main();
