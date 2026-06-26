// Integration: POST /classes/recurring — crea una tanda de clases recurrentes
// (varios días, rango desde→hasta), saltando choques y días cerrados.
// Levanta el server real en PORT y pega por HTTP como el frontend.
import assert from 'node:assert/strict';
import { spawn, ChildProcess } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import { pool } from '../src/config/database.js';

const PORT = 3203;
const B = `http://localhost:${PORT}/api`;
const BACKEND_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const one = async (s: string, p: any[] = []) => (await pool.query(s, p)).rows[0];

async function http(method: string, url: string, token?: string, body?: unknown) {
  const res = await fetch(`${B}${url}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
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
    try { const res = await fetch(`${B}/health`); if (res.ok) return; } catch { /* aún no */ }
    await new Promise(r => setTimeout(r, 1000));
  }
  throw new Error(`server no respondió /api/health en ${timeoutMs}ms`);
}

// Expande las fechas del rango [start,end] cuyo getUTCDay ∈ weekdays (misma lógica que el endpoint).
function expand(startDate: string, endDate: string, weekdays: number[]): string[] {
  const set = new Set(weekdays);
  const out: string[] = [];
  const cur = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  while (cur <= end) {
    if (set.has(cur.getUTCDay())) out.push(cur.toISOString().split('T')[0]);
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

async function main() {
  const server: ChildProcess = spawn('npx', ['tsx', 'src/index.ts'], {
    cwd: BACKEND_DIR,
    env: { ...process.env, PORT: String(PORT), DISABLE_WHATSAPP: 'true', ENABLE_CRON_JOBS: 'false' },
    stdio: 'ignore',
  });

  const ts = Date.now();
  const userIds: string[] = [];
  let facilityId = '';
  const START = '2035-03-01', END = '2035-03-31';
  const WEEKDAYS = [1, 4]; // Lunes y Jueves
  try {
    await waitForHealth();

    // Fixtures
    const hash = bcrypt.hashSync('Pp.Test1234!', 10);
    const adminEmail = `admin_rec_${ts}@t.local`;
    const admin = await one(
      `INSERT INTO users (email,phone,display_name,role,password_hash) VALUES ($1,$2,'Admin Recurring','admin',$3) RETURNING id`,
      [adminEmail, `553${ts}`.slice(0, 12), hash]);
    userIds.push(admin.id);
    const adminTok = await login(adminEmail, 'Pp.Test1234!');

    const ctMulti = await one(`SELECT id FROM class_types WHERE category='multi' AND is_active=true LIMIT 1`);
    assert.ok(ctMulti, 'no hay class_type multi de fixture');
    const ctReformer = await one(`SELECT id FROM class_types WHERE category='reformer' LIMIT 1`);
    assert.ok(ctReformer, 'no hay class_type reformer de fixture');
    const inst = await one(`SELECT id FROM instructors LIMIT 1`);
    assert.ok(inst, 'no hay instructor de fixture');
    const fac = await one(`SELECT id FROM facilities LIMIT 1`);
    assert.ok(fac, 'no hay facility de fixture');
    facilityId = fac.id;

    const expected = expand(START, END, WEEKDAYS);
    assert.ok(expected.length >= 4, `el rango debe tener varias fechas (${expected.length})`);
    const conflictDate = expected[0];
    const closedDate = expected[1];

    // Pre-crear una clase que choca (misma fecha+hora+sucursal) y un día cerrado
    await one(
      `INSERT INTO classes (class_type_id, instructor_id, facility_id, date, start_time, end_time, max_capacity)
       VALUES ($1,$2,$3,$4,'07:00','07:50',10) RETURNING id`,
      [ctMulti.id, inst.id, facilityId, conflictDate]);
    await one(`INSERT INTO studio_closed_days (date, reason) VALUES ($1,'Test cerrado') ON CONFLICT (date) DO NOTHING`, [closedDate]);

    // 1) Tanda recurrente: debe crear todas menos el choque y el día cerrado
    const r = await http('POST', '/classes/recurring', adminTok, {
      classTypeId: ctMulti.id, instructorId: inst.id, facilityId,
      startTime: '07:00', endTime: '07:50', maxCapacity: 10,
      startDate: START, endDate: END, weekdays: WEEKDAYS,
    });
    assert.equal(r.status, 201, `recurring debe dar 201: ${JSON.stringify(r.json)}`);
    assert.equal(r.json.creadas, expected.length - 2, `creadas esperado ${expected.length - 2}, dio ${r.json.creadas}`);
    const motivos = new Map((r.json.saltadas as any[]).map(s => [s.fecha, s.motivo]));
    assert.equal(motivos.get(conflictDate), 'ocupado', 'el día con choque debe saltarse como ocupado');
    assert.equal(motivos.get(closedDate), 'cerrado', 'el día cerrado debe saltarse como cerrado');

    // 2) En DB: total de clases en el rango (la del choque + las creadas) y sin duplicados de fecha
    const rows = await pool.query(
      `SELECT date FROM classes WHERE facility_id=$1 AND start_time='07:00' AND date>=$2 AND date<=$3 ORDER BY date`,
      [facilityId, START, END]);
    const dates = rows.rows.map((x: any) => (x.date instanceof Date ? x.date.toISOString().split('T')[0] : String(x.date).split('T')[0]));
    assert.equal(dates.length, expected.length - 1, 'total en DB = choque preexistente + creadas');
    assert.equal(new Set(dates).size, dates.length, 'no debe haber fechas duplicadas');
    for (const d of dates) assert.ok(WEEKDAYS.includes(new Date(`${d}T00:00:00Z`).getUTCDay()), `fecha ${d} fuera de weekdays`);

    // 3) Capacidad inválida para reformer (> 8) → 400
    const cap = await http('POST', '/classes/recurring', adminTok, {
      classTypeId: ctReformer.id, instructorId: inst.id, facilityId,
      startTime: '08:00', endTime: '08:50', maxCapacity: 9,
      startDate: START, endDate: END, weekdays: WEEKDAYS,
    });
    assert.equal(cap.status, 400, `capacidad reformer 9 debe dar 400: ${JSON.stringify(cap.json)}`);

    // 4) Rango > 6 meses → 400
    const big = await http('POST', '/classes/recurring', adminTok, {
      classTypeId: ctMulti.id, instructorId: inst.id, facilityId,
      startTime: '08:00', endTime: '08:50', maxCapacity: 10,
      startDate: '2035-01-01', endDate: '2036-01-01', weekdays: WEEKDAYS,
    });
    assert.equal(big.status, 400, `rango > 6 meses debe dar 400: ${JSON.stringify(big.json)}`);

    // 5) weekdays vacío → 400 (zod)
    const empty = await http('POST', '/classes/recurring', adminTok, {
      classTypeId: ctMulti.id, instructorId: inst.id, facilityId,
      startTime: '08:00', endTime: '08:50', maxCapacity: 10,
      startDate: START, endDate: END, weekdays: [],
    });
    assert.equal(empty.status, 400, `weekdays vacío debe dar 400: ${JSON.stringify(empty.json)}`);

    // 6) Una clase CANCELADA en un slot NO debe bloquear la creación (no es "ocupado")
    const cancelledDate = expected[2];
    await one(
      `INSERT INTO classes (class_type_id, instructor_id, facility_id, date, start_time, end_time, max_capacity, status)
       VALUES ($1,$2,$3,$4,'09:00','09:50',10,'cancelled') RETURNING id`,
      [ctMulti.id, inst.id, facilityId, cancelledDate]);
    const r6 = await http('POST', '/classes/recurring', adminTok, {
      classTypeId: ctMulti.id, instructorId: inst.id, facilityId,
      startTime: '09:00', endTime: '09:50', maxCapacity: 10,
      startDate: START, endDate: END, weekdays: WEEKDAYS,
    });
    assert.equal(r6.status, 201, `recurring 09:00 debe dar 201: ${JSON.stringify(r6.json)}`);
    const motivos6 = new Map((r6.json.saltadas as any[]).map(s => [s.fecha, s.motivo]));
    assert.notEqual(motivos6.get(cancelledDate), 'ocupado', 'una clase cancelada no debe contar como ocupado');
    const created09 = await one(
      `SELECT id FROM classes WHERE facility_id=$1 AND start_time='09:00' AND date=$2 AND status!='cancelled'`,
      [facilityId, cancelledDate]);
    assert.ok(created09, 'debe haberse creado una clase nueva (no cancelada) en el slot que solo tenía una cancelada');

    console.log('✅ test-recurring-classes: tanda recurrente, choques, día cerrado, capacidad y tope de rango OK');
  } finally {
    try { await pool.query(`DELETE FROM classes WHERE facility_id=$1 AND date>=$2 AND date<=$3`, [facilityId, '2035-01-01', '2036-12-31']); } catch (e: any) { console.error('cleanup classes:', e.message); }
    try { await pool.query(`DELETE FROM studio_closed_days WHERE reason='Test cerrado' AND date>=$1 AND date<=$2`, ['2035-01-01', '2036-12-31']); } catch (e: any) { console.error('cleanup closed:', e.message); }
    if (userIds.length) {
      try { await pool.query(`DELETE FROM users WHERE id = ANY($1)`, [userIds]); } catch (e: any) { console.error('cleanup users:', e.message); }
    }
    server.kill('SIGTERM');
    await pool.end();
  }
}

main().catch(e => { console.error(e); process.exitCode = 1; });
