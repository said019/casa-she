// Links de acceso (Entrega 5): vencen a los 7 días, un solo uso, uno nuevo revoca el anterior,
// el token NO es una sesión, y POST /auth/acceso/:token entrega una sesión válida.
// Levanta el backend contra una CLON desechable de la base local (nunca producción).
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { levantarServidorLocal, http } from './helpers/servidor-local.js';

const PORT = 3211;

async function main() {
    const srv = await levantarServidorLocal(PORT);
    process.env.DATABASE_URL = srv.databaseUrl;
    const { pool } = await import('../src/config/database.js');
    const { crearLinkAcceso } = await import('../src/lib/accessLinks.js');
    const A = srv.api;
    const sha = (t: string) => createHash('sha256').update(t).digest('hex');
    const tokenDe = (url: string) => url.split('/acceso/')[1];
    const sql = async (s: string, p: any[] = []) => (await pool.query(s, p)).rows;
    try {
        const ts = Date.now();
        const clave = 'Clave-Admin-1';
        const hash = await bcrypt.hash(clave, 4);
        const mk = async (rol: string, tag: string) => (await sql(
            `INSERT INTO users (email, phone, display_name, role, password_hash, is_active, temp_password)
             VALUES ($1, $2, $3, $4, $5, true, true) RETURNING id, email`,
            [`${tag}-${ts}@acceso.test`, `55${String(ts).slice(-8)}`.slice(0, 10), `Daniela ${tag}`, rol, hash]))[0];
        const admin = await mk('admin', 'adm');
        const recep = await mk('reception', 'rec');
        const otroAdmin = await mk('admin', 'adm2');
        const alumna = await mk('client', 'alu');
        const superAdm = await mk('super_admin', 'sup');
        const login = async (email: string) => (await http(A, 'POST', '/auth/login', undefined, { email, password: clave })).json.token as string;
        const tAdmin = await login(admin.email);
        const tRecep = await login(recep.email);
        const tSuper = await login(superAdm.email);
        const tAlumna = await login(alumna.email);

        // --- Generar link ---
        const r1 = await http(A, 'POST', `/users/${alumna.id}/acceso`, tAdmin);
        assert.equal(r1.status, 201, JSON.stringify(r1.json));
        const token1 = tokenDe(r1.json.url);
        assert.match(r1.json.url, /^http:\/\/localhost:4173\/acceso\/[A-Za-z0-9_-]{43}$/, '32 bytes en base64url = 43 caracteres');
        const vence = new Date(r1.json.venceEl).getTime();
        const sieteDias = 7 * 24 * 3600 * 1000;
        assert.ok(Math.abs(vence - (Date.now() + sieteDias)) < 5 * 60 * 1000, 'vence a los 7 días');
        // Solo se guarda el hash; el token en claro no está en ninguna columna.
        const filas1 = await sql('SELECT * FROM access_links WHERE user_id = $1', [alumna.id]);
        assert.equal(filas1.length, 1);
        assert.equal(filas1[0].token_hash, sha(token1));
        assert.ok(!Object.values(filas1[0]).some(v => v === token1), 'el token en claro no se guarda');
        assert.equal(filas1[0].created_by, admin.id);
        const dias = (new Date(filas1[0].expires_at).getTime() - new Date(filas1[0].created_at).getTime()) / 86400000;
        assert.ok(Math.abs(dias - 7) < 0.01, `expires_at = created_at + 7 días (${dias})`);

        // --- Consulta pública ---
        const g1 = await http(A, 'GET', `/auth/acceso/${token1}`);
        assert.equal(g1.status, 200);
        assert.deepEqual(g1.json, { nombre: alumna.email ? `Daniela alu` : '', email: alumna.email });
        assert.match(g1.headers.get('cache-control') || '', /no-store/, 'GET /auth/acceso/:token no se cachea');

        // --- El token NO es una sesión ---
        for (const ruta of ['/auth/me', `/users/${alumna.id}`]) {
            const r = await http(A, 'GET', ruta, token1);
            assert.equal(r.status, 401, `el token de acceso como Bearer en ${ruta} debe ser 401, fue ${r.status}`);
        }
        // Y tampoco sirve para generar otro link ni para nada de staff.
        assert.equal((await http(A, 'POST', `/users/${alumna.id}/acceso`, token1)).status, 401);

        // --- Permisos al generar ---
        assert.equal((await http(A, 'POST', `/users/${alumna.id}/acceso`, tAlumna)).status, 403, 'una clienta no genera links');
        assert.equal((await http(A, 'POST', `/users/${otroAdmin.id}/acceso`, tRecep)).status, 403, 'recepción no genera link de un admin');
        // El link permite fijar la contraseña de la cuenta: solo a clientes (admin NO a otro admin).
        assert.equal((await http(A, 'POST', `/users/${otroAdmin.id}/acceso`, tAdmin)).status, 403, 'admin no genera link de otro admin');
        assert.equal((await http(A, 'POST', `/users/${superAdm.id}/acceso`, tAdmin)).status, 403, 'admin no genera link de un super_admin');
        assert.equal((await http(A, 'POST', `/users/${recep.id}/acceso`, tAdmin)).status, 403, 'admin no genera link de recepción');
        assert.equal((await http(A, 'POST', `/users/${otroAdmin.id}/acceso`, tSuper)).status, 201, 'super_admin sí puede a cualquier rol');
        assert.equal((await http(A, 'POST', `/users/${alumna.id}/acceso`, tAdmin)).status, 201, 'admin sí genera para una clienta');
        assert.equal((await http(A, 'POST', `/users/${alumna.id}/acceso`)).status, 401, 'sin sesión no se genera');
        assert.equal((await http(A, 'POST', `/users/00000000-0000-0000-0000-000000000000/acceso`, tAdmin)).status, 404);
        assert.equal((await http(A, 'POST', `/users/${alumna.id}/acceso`, tRecep)).status, 201, 'recepción sí genera para una clienta');
        // (ese último revocó token1)
        const gRevocado = await http(A, 'GET', `/auth/acceso/${token1}`);
        assert.equal(gRevocado.status, 410);
        assert.match(gRevocado.headers.get('cache-control') || '', /no-store/, 'también el 410 va con no-store');
        assert.equal(gRevocado.json.code, 'LINK_INVALIDO');

        // --- Un link nuevo revoca el anterior ---
        const r2 = await http(A, 'POST', `/users/${alumna.id}/acceso`, tAdmin);
        const token2 = tokenDe(r2.json.url);
        assert.notEqual(token2, token1);
        const activos = await sql(`SELECT count(*)::int n FROM access_links WHERE user_id = $1 AND used_at IS NULL AND revoked_at IS NULL`, [alumna.id]);
        assert.equal(activos[0].n, 1, 'solo queda un link activo por alumna');
        const pRev = await http(A, 'POST', `/auth/acceso/${token1}`, undefined, { password: 'Nueva-Clave-9' });
        assert.equal(pRev.status, 410);
        assert.equal(pRev.json.code, 'LINK_INVALIDO');
        const sinCambio = await sql('SELECT temp_password FROM users WHERE id = $1', [alumna.id]);
        assert.equal(sinCambio[0].temp_password, true, 'un link revocado no cambia la contraseña');

        // --- Contraseña débil: 400 y el link sigue vivo ---
        for (const debil of ['corta1A', 'sinmayuscula1', 'SinNumeroAqui']) {
            const r = await http(A, 'POST', `/auth/acceso/${token2}`, undefined, { password: debil });
            assert.equal(r.status, 400, `"${debil}" debe rechazarse`);
        }
        assert.equal((await http(A, 'GET', `/auth/acceso/${token2}`)).status, 200, 'el link sigue vivo tras un intento inválido');

        // --- Vencido ---
        await pool.query(`UPDATE access_links SET expires_at = NOW() - interval '1 minute' WHERE token_hash = $1`, [sha(token2)]);
        const gV = await http(A, 'GET', `/auth/acceso/${token2}`);
        assert.equal(gV.status, 410);
        assert.equal(gV.json.code, 'LINK_VENCIDO');
        const pV = await http(A, 'POST', `/auth/acceso/${token2}`, undefined, { password: 'Nueva-Clave-9' });
        assert.equal(pV.status, 410);
        assert.equal(pV.json.code, 'LINK_VENCIDO');

        // --- Uso: sesión válida y un solo uso (también en paralelo) ---
        const r3 = await http(A, 'POST', `/users/${alumna.id}/acceso`, tAdmin);
        const token3 = tokenDe(r3.json.url);
        const [x, y] = await Promise.all([
            http(A, 'POST', `/auth/acceso/${token3}`, undefined, { password: 'Primera-Clave-1' }),
            http(A, 'POST', `/auth/acceso/${token3}`, undefined, { password: 'Segunda-Clave-2' }),
        ]);
        const ok = [x, y].filter(r => r.status === 200);
        const muerto = [x, y].filter(r => r.status === 410);
        assert.equal(ok.length, 1, `exactamente un uso gana: ${x.status}/${y.status}`);
        assert.equal(muerto.length, 1);
        assert.equal(muerto[0].json.code, 'LINK_USADO');
        assert.match(ok[0].headers.get('cache-control') || '', /no-store/, 'POST /auth/acceso/:token (devuelve sesión) no se cachea');
        const sesion = ok[0].json;
        const clavePuesta = ok[0] === x ? 'Primera-Clave-1' : 'Segunda-Clave-2';
        assert.equal(sesion.user.email, alumna.email);
        assert.equal(sesion.user.role, 'client');
        assert.equal(sesion.user.password_hash, undefined, 'la respuesta no filtra el hash');
        assert.ok(typeof sesion.token === 'string' && sesion.token.split('.').length === 3, 'devuelve un JWT de sesión');
        const me = await http(A, 'GET', '/auth/me', sesion.token);
        assert.equal(me.status, 200, 'la sesión entregada es válida');
        const fila = (await sql('SELECT temp_password FROM users WHERE id = $1', [alumna.id]))[0];
        assert.equal(fila.temp_password, false);
        assert.ok((await sql('SELECT used_at FROM access_links WHERE token_hash = $1', [sha(token3)]))[0].used_at);
        // La contraseña elegida funciona en el login normal; la de WhatsApp-anterior (temporal) ya no.
        const lg = await http(A, 'POST', '/auth/login', undefined, { email: alumna.email, password: clavePuesta });
        assert.equal(lg.status, 200);
        assert.equal((await http(A, 'POST', '/auth/login', undefined, { email: alumna.email, password: clave })).status, 401);
        // Segundo intento con el mismo link: usado.
        const again = await http(A, 'POST', `/auth/acceso/${token3}`, undefined, { password: 'Tercera-Clave-3' });
        assert.equal(again.status, 410);
        assert.equal(again.json.code, 'LINK_USADO');
        assert.equal((await http(A, 'GET', `/auth/acceso/${token3}`)).json.code, 'LINK_USADO');

        // --- Basura ---
        for (const t of ['x', 'a'.repeat(43), 'A'.repeat(300)]) {
            const r = await http(A, 'GET', `/auth/acceso/${t}`);
            assert.equal(r.status, 410);
            assert.equal(r.json.code, 'LINK_INVALIDO');
        }

        // --- Concurrencia: dos crearLinkAcceso en paralelo con el pool dejan EXACTAMENTE un link activo ---
        const alumnaCarrera = await mk('client', 'car');
        for (let i = 0; i < 5; i++) {
            const lotes = await Promise.all([1, 2, 3, 4].map(() => crearLinkAcceso(pool, alumnaCarrera.id, admin.id)));
            assert.equal(new Set(lotes.map(l => l.url)).size, 4, 'cada llamada devuelve un token distinto');
            const act = await sql(`SELECT count(*)::int n FROM access_links WHERE user_id = $1 AND used_at IS NULL AND revoked_at IS NULL`, [alumnaCarrera.id]);
            assert.equal(act[0].n, 1, `ronda ${i}: exactamente un link activo tras llamadas concurrentes, hay ${act[0].n}`);
        }

        // --- Cuenta desactivada: el link no sirve ---
        const r4 = await http(A, 'POST', `/users/${alumna.id}/acceso`, tAdmin);
        await pool.query('UPDATE users SET is_active = false WHERE id = $1', [alumna.id]);
        assert.equal((await http(A, 'GET', `/auth/acceso/${tokenDe(r4.json.url)}`)).status, 410);
        assert.equal((await http(A, 'POST', `/users/${alumna.id}/acceso`, tAdmin)).status, 409);

        console.log('test-access-links: OK');
    } finally {
        await srv.detener();
        try { const { pool } = await import('../src/config/database.js'); await pool.end(); } catch { /* noop */ }
    }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
