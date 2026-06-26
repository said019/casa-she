// Integration: flujo de comprobantes de órdenes (reject/cancel) + activate exige paymentMethod.
// Levanta el server real en PORT_TEST y pega por HTTP como lo haría el frontend.
// Regresión de: orders reject/cancel 500 por columnas validated_*/validation_notes
// inexistentes en payment_proofs (el schema canónico usa reviewed_*/rejection_reason).
import assert from 'node:assert/strict';
import { spawn, ChildProcess } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import { pool } from '../src/config/database.js';

const PORT = 3199;
const B = `http://localhost:${PORT}/api`;
const BACKEND_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RECEIPT = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

const one = async (s: string, p: any[] = []) => (await pool.query(s, p)).rows[0];

async function http(method: string, url: string, token?: string, body?: unknown) {
  const res = await fetch(`${B}${url}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json: any = null;
  try { json = await res.json(); } catch { /* sin body */ }
  return { status: res.status, json };
}

async function login(email: string, password: string): Promise<string> {
  const r = await http('POST', '/auth/login', undefined, { email, password });
  assert.equal(r.status, 200, `login ${email}: ${JSON.stringify(r.json)}`);
  return r.json.token;
}

async function waitForHealth(timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${B}/health`);
      if (res.ok) return;
    } catch { /* aún no arriba */ }
    await new Promise(r => setTimeout(r, 1000));
  }
  throw new Error(`server no respondió /api/health en ${timeoutMs}ms`);
}

async function createOrderWithProof(cliTok: string, planId: string): Promise<string> {
  const r = await http('POST', '/orders', cliTok, { plan_id: planId, payment_method: 'transfer' });
  assert.equal(r.status, 201, `crear orden: ${JSON.stringify(r.json)}`);
  const orderId: string = r.json.order?.id ?? r.json.id;
  assert.ok(orderId, 'orden sin id');
  // El handler espera file_data (base64); igual que OrderDetail.tsx.
  const p = await http('POST', `/orders/${orderId}/upload-proof`, cliTok, { file_data: RECEIPT });
  assert.equal(p.status, 201, `subir comprobante: ${JSON.stringify(p.json)}`);
  return orderId;
}

async function main() {
  const server: ChildProcess = spawn('npx', ['tsx', 'src/index.ts'], {
    cwd: BACKEND_DIR,
    env: { ...process.env, PORT: String(PORT), DISABLE_WHATSAPP: 'true', ENABLE_CRON_JOBS: 'false' },
    stdio: 'ignore',
  });

  const ts = Date.now();
  const userIds: string[] = [];
  try {
    await waitForHealth();

    // Fixtures: admin + cliente con password conocida, plan normal (ni muestra ni por-estudio)
    const hash = bcrypt.hashSync('Pp.Test1234!', 10);
    const adminEmail = `admin_ppf_${ts}@t.local`;
    const clientEmail = `cli_ppf_${ts}@t.local`;
    const admin = await one(
      `INSERT INTO users (email,phone,display_name,role,password_hash) VALUES ($1,$2,'Admin ProofFlow','admin',$3) RETURNING id`,
      [adminEmail, `551${ts}`.slice(0, 12), hash]);
    const client = await one(
      `INSERT INTO users (email,phone,display_name,role,password_hash) VALUES ($1,$2,'Cliente ProofFlow','client',$3) RETURNING id`,
      [clientEmail, `552${ts}`.slice(0, 12), hash]);
    userIds.push(admin.id, client.id);
    const plan = await one(
      `SELECT id FROM plans
        WHERE is_active = true AND price > 0
          AND COALESCE(package_type,'') <> 'sample'
          AND COALESCE(requires_studio_selection,false) = false
        ORDER BY price LIMIT 1`);
    assert.ok(plan, 'no hay plan activo de fixture');

    const adminTok = await login(adminEmail, 'Pp.Test1234!');
    const cliTok = await login(clientEmail, 'Pp.Test1234!');

    // 1) Rechazar orden con comprobante pendiente → 200 y proof rejected con razón
    const orderA = await createOrderWithProof(cliTok, plan.id);
    // Mismo payload que OrdersVerification.tsx (admin_notes)
    const rej = await http('POST', `/orders/${orderA}/reject`, adminTok, { admin_notes: 'Comprobante ilegible' });
    assert.equal(rej.status, 200, `reject debe dar 200: ${JSON.stringify(rej.json)}`);
    const proofA = await one(`SELECT status, rejection_reason, reviewed_by FROM payment_proofs WHERE order_id = $1`, [orderA]);
    assert.equal(proofA.status, 'rejected', 'proof debe quedar rejected');
    assert.equal(proofA.rejection_reason, 'Comprobante ilegible', 'rejection_reason debe guardar las notas');
    assert.equal(proofA.reviewed_by, admin.id, 'reviewed_by debe ser el admin');

    // 2) Cliente cancela su orden con comprobante pendiente → 200 y proof fuera de la cola
    const orderB = await createOrderWithProof(cliTok, plan.id);
    const can = await http('POST', `/orders/${orderB}/cancel`, cliTok, {});
    assert.equal(can.status, 200, `cancel debe dar 200: ${JSON.stringify(can.json)}`);
    const proofB = await one(`SELECT status FROM payment_proofs WHERE order_id = $1`, [orderB]);
    assert.equal(proofB.status, 'rejected', 'proof de orden cancelada no debe quedar pending');

    // 3) Activar membresía SIN paymentMethod → 400 (sin método no hay registro de pago)
    const buy = await http('POST', '/memberships', cliTok, {
      planId: plan.id, paymentMethod: 'transfer', receiptUrl: RECEIPT,
    });
    assert.equal(buy.status, 201, `compra membresía: ${JSON.stringify(buy.json)}`);
    const membershipId = buy.json.membershipId;
    const actBad = await http('POST', `/memberships/${membershipId}/activate`, adminTok, {
      notifyMember: false, generateWalletPass: false,
    });
    assert.equal(actBad.status, 400, `activate sin paymentMethod debe dar 400, dio ${actBad.status}: ${JSON.stringify(actBad.json)}`);

    // 4) Activar CON paymentMethod → 200 y pago registrado
    const actOk = await http('POST', `/memberships/${membershipId}/activate`, adminTok, {
      paymentMethod: 'transfer', notifyMember: false, generateWalletPass: false,
    });
    assert.equal(actOk.status, 200, `activate con paymentMethod: ${JSON.stringify(actOk.json)}`);
    const pay = await one(`SELECT id FROM payments WHERE membership_id = $1 AND status = 'completed'`, [membershipId]);
    assert.ok(pay, 'la activación debe registrar el pago');

    console.log('✅ test-orders-proof-flow: reject/cancel de comprobantes y activate con pago OK');
  } finally {
    // Cleanup best-effort (el server commitea de verdad); orden respeta FKs.
    if (userIds.length) {
      const tables = [
        `DELETE FROM admin_actions WHERE admin_user_id = ANY($1)`,
        `DELETE FROM loyalty_points WHERE user_id = ANY($1)`,
        `DELETE FROM notifications WHERE user_id = ANY($1)`,
        `DELETE FROM payments WHERE user_id = ANY($1)`,
        `DELETE FROM wallet_passes WHERE membership_id IN (SELECT id FROM memberships WHERE user_id = ANY($1))`,
        `DELETE FROM memberships WHERE user_id = ANY($1)`,
        `DELETE FROM orders WHERE user_id = ANY($1)`, // payment_proofs cae por ON DELETE CASCADE
        `DELETE FROM users WHERE id = ANY($1)`,
      ];
      for (const sql of tables) {
        try { await pool.query(sql, [userIds]); } catch (e: any) { console.error('cleanup:', e.message); }
      }
    }
    server.kill('SIGTERM');
    await pool.end();
  }
}

main().catch(e => { console.error(e); process.exitCode = 1; });
