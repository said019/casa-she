// Integration (HTTP): POST /classes/bulk con una cuenta de RECEPCIÓN. `authenticate` mapea
// recepción → rol 'admin' (el real vive en req.user.accountRole), así que el límite de
// sucursal tiene que leerse de accountRole. Recepción con sucursal asignada no puede
// tocar clases de otra sucursal (vista previa → 'bloqueada'; aplicar → 409 sin cambios);
// un admin sí puede, y recepción sí puede en la suya.
// Levanta el server real en PORT contra la base LOCAL y limpia lo que crea.
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
  const classIds: string[] = [];
  let facilidadAjena = '';
  try {
    await waitForHealth();
    const hash = bcrypt.hashSync('Pp.Test1234!', 10);
    const mkUser = async (rol: string, facilityId: string | null) => {
      const email = `${rol}_bulkrec_${ts}@t.local`;
      const u = await one(
        `INSERT INTO users (email,phone,display_name,role,password_hash,default_facility_id)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [email, `55${rol.length}${ts}`.slice(0, 12), `Test ${rol}`, rol, hash, facilityId]);
      userIds.push(u.id);
      return login(email, 'Pp.Test1234!');
    };

    const propia = await one(`SELECT id FROM facilities ORDER BY name LIMIT 1`);
    const ajena = await one(
      `INSERT INTO facilities (name) VALUES ($1) RETURNING id`, [`Sucursal ajena ${ts}`]);
    facilidadAjena = ajena.id;
    const ct = await one(`SELECT id FROM class_types WHERE category='multi' AND is_active=true LIMIT 1`);
    const inst = await one(`SELECT id FROM instructors WHERE is_active = true LIMIT 1`);
    assert.ok(propia && ct && inst, 'faltan fixtures locales');

    const mkClase = async (fac: string, hora: string) => {
      const c = await one(
        `INSERT INTO classes (class_type_id, instructor_id, facility_id, date, start_time, end_time, max_capacity, status)
         VALUES ($1,$2,$3,'2035-06-05',$4::time,$4::time + interval '50 minutes',7,'scheduled') RETURNING id`,
        [ct.id, inst.id, fac, hora]);
      classIds.push(c.id);
      return c.id as string;
    };
    const enAjena = await mkClase(ajena.id, '06:00');
    const enPropia = await mkClase(propia.id, '07:00');

    const recep = await mkUser('reception', propia.id);
    const admin = await mkUser('admin', null);

    // 1) Vista previa de recepción: la clase de otra sucursal sale bloqueada; la propia, ok.
    const prev = await http('POST', '/classes/bulk', recep, { classIds: [enAjena, enPropia], accion: 'cancelar', vistaPrevia: true });
    assert.equal(prev.status, 200, JSON.stringify(prev.json));
    const porId = (id: string) => prev.json.clases.find((c: any) => c.classId === id);
    assert.equal(porId(enAjena).estado, 'bloqueada', 'otra sucursal debe salir bloqueada');
    assert.match(porId(enAjena).motivo ?? '', /Es de otra sucursal/);
    assert.equal(porId(enPropia).estado, 'ok');

    // 2) Aplicar con una de otra sucursal → 409 y nada cambia.
    const apl = await http('POST', '/classes/bulk', recep, { classIds: [enAjena, enPropia], accion: 'cancelar', vistaPrevia: false });
    assert.equal(apl.status, 409, JSON.stringify(apl.json));
    const st = (await pool.query(`SELECT status::text FROM classes WHERE id = ANY($1)`, [[enAjena, enPropia]])).rows.map(r => r.status);
    assert.deepEqual(st, ['scheduled', 'scheduled'], 'no se tocó ninguna clase');

    // 3) Recepción sí puede en su sucursal.
    const propiaSola = await http('POST', '/classes/bulk', recep, { classIds: [enPropia], accion: 'cancelar', vistaPrevia: true });
    assert.equal(propiaSola.status, 200);
    assert.equal(propiaSola.json.clases[0].estado, 'ok');

    // 4) Un admin no tiene límite de sucursal.
    const adm = await http('POST', '/classes/bulk', admin, { classIds: [enAjena], accion: 'cancelar', vistaPrevia: true });
    assert.equal(adm.status, 200);
    assert.equal(adm.json.clases[0].estado, 'ok');

    console.log('✅ test-classes-bulk-recepcion: recepción limitada a su sucursal OK');
  } finally {
    try { if (classIds.length) await pool.query(`DELETE FROM classes WHERE id = ANY($1)`, [classIds]); } catch (e: any) { console.error('cleanup classes:', e.message); }
    try { if (facilidadAjena) await pool.query(`DELETE FROM facilities WHERE id = $1`, [facilidadAjena]); } catch (e: any) { console.error('cleanup facility:', e.message); }
    try { if (userIds.length) await pool.query(`DELETE FROM users WHERE id = ANY($1)`, [userIds]); } catch (e: any) { console.error('cleanup users:', e.message); }
    server.kill('SIGTERM');
    await pool.end();
  }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
