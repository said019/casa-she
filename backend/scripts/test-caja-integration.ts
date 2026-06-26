import assert from 'node:assert/strict';
import { pool } from '../src/config/database.js';
import { computeExpectedCash, computeDifference } from '../src/lib/cashReconciliation.js';

async function main() {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const one = async (s: string, p: any[] = []) => (await c.query(s, p)).rows[0];

    const facility = await one(`SELECT id FROM facilities WHERE name='BMB Studio Tepa'`);
    const plan = await one(`SELECT id, price, duration_days, reformer_credits, multi_credits FROM plans WHERE name='Multi 8'`);
    assert.ok(facility && plan, 'faltan fixtures sembrados (facility/plan)');

    const seller = await one(`INSERT INTO users (email,phone,display_name,role) VALUES ($1,$2,'Recep Test','reception') RETURNING id`,
      [`recep_${Date.now()}@t.local`, `55${Date.now()}`.slice(0,12)]);
    const member = await one(`INSERT INTO users (email,phone,display_name) VALUES ($1,$2,'Cliente Test') RETURNING id`,
      [`cli_${Date.now()}@t.local`, `54${Date.now()}`.slice(0,12)]);

    // Abrir turno (fondo 500)
    const shift = await one(`INSERT INTO cash_shifts (facility_id,opened_by,opening_float,status) VALUES ($1,$2,500,'open') RETURNING *`,
      [facility.id, seller.id]);

    // Unicidad: segundo turno abierto en la misma sucursal debe fallar (SAVEPOINT para no abortar la tx)
    await c.query('SAVEPOINT sp_dup');
    let dupRejected = false;
    try {
      await c.query(`INSERT INTO cash_shifts (facility_id,opened_by,opening_float,status) VALUES ($1,$2,0,'open')`, [facility.id, seller.id]);
    } catch { dupRejected = true; await c.query('ROLLBACK TO SAVEPOINT sp_dup'); }
    assert.ok(dupRejected, 'debe rechazar segundo turno abierto en la sucursal');
    await c.query('RELEASE SAVEPOINT sp_dup');

    // Vender membresía Multi 8 en efectivo (atribuida + ligada al turno vía payment)
    const m = await one(
      `INSERT INTO memberships (user_id,plan_id,start_date,end_date,status,reformer_remaining,multi_remaining,payment_method,activated_by,activated_at,cancellation_limit)
       VALUES ($1,$2,CURRENT_DATE,CURRENT_DATE + ($3||' days')::interval,'active',$4,$5,'cash',$6,NOW(),2) RETURNING *`,
      [member.id, plan.id, String(plan.duration_days), plan.reformer_credits, plan.multi_credits, seller.id]);
    assert.equal(m.multi_remaining, 8, 'buckets inicializados desde el plan (Multi 8)');
    await c.query(`INSERT INTO payments (user_id,membership_id,amount,payment_method,status,processed_by,shift_id)
       VALUES ($1,$2,$3,'cash','completed',$4,$5)`, [member.id, m.id, plan.price, seller.id, shift.id]);

    // Vender producto en efectivo (descuenta stock)
    const prod = await one(`INSERT INTO products (name,price,stock) VALUES ('Calcetas',120,10) RETURNING *`);
    const sale = await one(`INSERT INTO sales (user_id,seller_id,subtotal,total,payment_method,facility_id,shift_id,status)
       VALUES ($1,$2,120,120,'cash',$3,$4,'completed') RETURNING *`, [member.id, seller.id, facility.id, shift.id]);
    await c.query(`INSERT INTO sale_items (sale_id,product_id,product_name,quantity,unit_price,subtotal) VALUES ($1,$2,'Calcetas',1,120,120)`, [sale.id, prod.id]);
    await c.query(`UPDATE products SET stock = stock - 1 WHERE id=$1`, [prod.id]);
    assert.equal((await one(`SELECT stock FROM products WHERE id=$1`, [prod.id])).stock, 9, 'stock descontado');

    // cash_out 100
    await c.query(`INSERT INTO cash_movements (shift_id,type,amount,reason,created_by) VALUES ($1,'cash_out',100,'gasto',$2)`, [shift.id, seller.id]);

    // Conciliación: 500 fondo + (precio membresía + 120 producto) - 100
    const cashSales = Number(plan.price) + 120;
    const expected = computeExpectedCash({ openingFloat: 500, cashSales, cashIn: 0, cashOut: 100, cashEgresos: 0 });
    const counted = expected + 30; // sobrante simulado
    const difference = computeDifference(expected, counted);
    assert.equal(difference, 30, 'diferencia (sobrante) correcta');

    const closed = await one(`UPDATE cash_shifts SET status='closed',closed_by=$2,closed_at=NOW(),expected_cash=$3,counted_cash=$4,difference=$5
       WHERE id=$1 RETURNING *`, [shift.id, seller.id, expected, counted, difference]);
    assert.equal(closed.status, 'closed');
    assert.equal(Number(closed.difference), 30);

    // Atribución: el reporte sales-by-staff debe ver al vendedor (vía payments.processed_by y sales.seller_id)
    const attributed = await one(`SELECT
        (SELECT COUNT(*) FROM payments WHERE processed_by=$1 AND membership_id IS NOT NULL) memb,
        (SELECT COUNT(*) FROM sales WHERE seller_id=$1 AND status<>'cancelled') prod`, [seller.id]);
    assert.equal(Number(attributed.memb), 1, 'membresía atribuida al recepcionista');
    assert.equal(Number(attributed.prod), 1, 'venta de producto atribuida al recepcionista');

    await c.query('ROLLBACK');
    console.log('test-caja-integration: OK');
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    console.error('test-caja-integration: FAIL'); console.error(e); process.exitCode = 1;
  } finally { c.release(); await pool.end(); }
}
main();
