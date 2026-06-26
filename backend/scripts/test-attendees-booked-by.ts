// Integration: GET /bookings/class/:classId debe incluir la atribución de quién reservó
// (booked_by / booked_by_name / booked_by_role) para que el panel de asistentes distinga
// una reserva hecha por recepción/admin de una hecha por la propia alumna.
// Regresión de: ese endpoint no traía booked_by → el front siempre mostraba "la alumna".
import assert from 'node:assert/strict';
import { spawn, ChildProcess } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import { pool } from '../src/config/database.js';

const PORT = 3204;
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

async function main() {
  const server: ChildProcess = spawn('npx', ['tsx', 'src/index.ts'], {
    cwd: BACKEND_DIR,
    env: { ...process.env, PORT: String(PORT), DISABLE_WHATSAPP: 'true', ENABLE_CRON_JOBS: 'false' },
    stdio: 'ignore',
  });

  const ts = Date.now();
  const userIds: string[] = [];
  let classId = '';
  try {
    await waitForHealth();

    const hash = bcrypt.hashSync('Pp.Test1234!', 10);
    const mk = async (suffix: string, role: string, name: string) => {
      const u = await one(
        `INSERT INTO users (email, phone, display_name, role, password_hash)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [`${suffix}_${ts}@t.local`, `5${suffix}${ts}`.slice(0, 12), name, role, hash]);
      userIds.push(u.id);
      return u.id;
    };
    const adminId = await mk('adm', 'admin', 'Admin BookedBy');
    const recId = await mk('rec', 'reception', 'Recepción Tepa');
    const cliAId = await mk('cla', 'client', 'Alumna A');
    const cliBId = await mk('clb', 'client', 'Alumna B');

    const ct = await one(`SELECT id FROM class_types WHERE is_active = true LIMIT 1`);
    assert.ok(ct, 'no hay class_type de fixture');
    const inst = await one(`SELECT id FROM instructors LIMIT 1`);
    assert.ok(inst, 'no hay instructor de fixture');
    const cls = await one(
      `INSERT INTO classes (class_type_id, instructor_id, date, start_time, end_time, max_capacity)
       VALUES ($1, $2, '2035-04-01', '07:00', '07:50', 10) RETURNING id`,
      [ct.id, inst.id]);
    classId = cls.id;

    // Reserva A: la hizo RECEPCIÓN a nombre de la alumna A (booked_by = recepción)
    await one(
      `INSERT INTO bookings (class_id, user_id, status, is_free_booking, booked_by)
       VALUES ($1, $2, 'confirmed', false, $3)`,
      [classId, cliAId, recId]);
    // Reserva B: la hizo la propia alumna B (booked_by = ella misma)
    await one(
      `INSERT INTO bookings (class_id, user_id, status, is_free_booking, booked_by)
       VALUES ($1, $2, 'confirmed', false, $2)`,
      [classId, cliBId]);

    const adminTok = await login(`adm_${ts}@t.local`, 'Pp.Test1234!');

    const r = await http('GET', `/bookings/class/${classId}`, adminTok);
    assert.equal(r.status, 200, `asistentes: ${JSON.stringify(r.json)}`);
    const rows: any[] = r.json;
    const a = rows.find((x) => x.user_id === cliAId);
    const b = rows.find((x) => x.user_id === cliBId);
    assert.ok(a, 'debe aparecer la alumna A');
    assert.ok(b, 'debe aparecer la alumna B');

    // A: reservada por recepción → el endpoint debe exponer la atribución del staff
    assert.equal(a.booked_by, recId, 'booked_by de A debe ser la recepción');
    assert.equal(a.booked_by_role, 'reception', 'booked_by_role de A debe ser reception');
    assert.equal(a.booked_by_name, 'Recepción Tepa', 'booked_by_name de A debe ser el nombre de la recepción');

    // B: reserva propia → booked_by = la misma alumna (el front lo muestra como "la alumna")
    assert.equal(b.booked_by, cliBId, 'booked_by de B debe ser la propia alumna');
    assert.equal(b.booked_by_role, 'client', 'booked_by_role de B debe ser client');

    console.log('✅ test-attendees-booked-by: el panel de asistentes distingue reserva de recepción vs de la alumna');
  } finally {
    try { if (classId) await pool.query(`DELETE FROM bookings WHERE class_id = $1`, [classId]); } catch (e: any) { console.error('cleanup bookings:', e.message); }
    try { if (classId) await pool.query(`DELETE FROM classes WHERE id = $1`, [classId]); } catch (e: any) { console.error('cleanup class:', e.message); }
    if (userIds.length) {
      try { await pool.query(`DELETE FROM users WHERE id = ANY($1)`, [userIds]); } catch (e: any) { console.error('cleanup users:', e.message); }
    }
    server.kill('SIGTERM');
    await pool.end();
  }
}

main().catch(e => { console.error(e); process.exitCode = 1; });
