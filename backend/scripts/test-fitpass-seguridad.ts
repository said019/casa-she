/**
 * Seguridad de la integración FitPass (sin red externa: servidor HTTP local en 127.0.0.1).
 *  A. Un login fallido NO filtra password ni authenticity_token (String/JSON/inspect).
 *  B. Una sola sesión por proceso: dos get() concurrentes → un solo login; re-login 1 vez en 422.
 *  C. FITPASS_RETRY sin pendientes no hace login.
 *   DATABASE_URL=postgresql://localhost:5432/casa_she npx tsx scripts/test-fitpass-seguridad.ts
 */
import assert from 'node:assert/strict';
import http from 'node:http';
import util from 'node:util';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

process.env.APP_ENCRYPTION_KEY = 'test-key-'.padEnd(40, 'x');

const PASSWORD = 'Sup3r-Secr3t-Pw!9';
const CSRF = 'CSRF-TOKEN-ABC123xyz';

function expectNoSecrets(label: string, err: unknown): void {
    const forms = [
        String(err), (err as Error).message, (err as Error).stack ?? '',
        JSON.stringify(err), JSON.stringify(err, Object.getOwnPropertyNames(err as object)),
        util.inspect(err, { depth: 6, showHidden: true }),
    ];
    for (const f of forms) {
        assert.ok(!f.includes(PASSWORD), `${label}: filtró el password`);
        assert.ok(!f.includes(encodeURIComponent(PASSWORD)), `${label}: filtró el password (url-encoded)`);
        assert.ok(!/authenticity_token/i.test(f), `${label}: filtró authenticity_token`);
        assert.ok(!f.includes(CSRF), `${label}: filtró el token CSRF`);
    }
}

async function main() {
    const { FitPassScraper, FitPassHttpError } = await import('../src/lib/scrapers/fitpass.js');
    const { sanitizeError, safeErrorMessage } = await import('../src/lib/scrapers/sanitize.js');
    const { createFitpassSessionManager } = await import('../src/lib/fitpass/session.js');

    // ── A. login fallido (422 con el form reflejado en el HTML) ───────────────
    let mode: 'login-422' | 'login-500' = 'login-422';
    const server = http.createServer((req, res) => {
        if (req.method === 'GET' && req.url === '/sessions/new') {
            res.writeHead(200, { 'content-type': 'text/html' });
            return res.end(`<html><head><meta name="csrf-token" content="${CSRF}"></head></html>`);
        }
        if (req.method === 'POST' && req.url === '/sessions') {
            let body = '';
            req.on('data', (c) => (body += c));
            req.on('end', () => {
                res.writeHead(mode === 'login-422' ? 422 : 500, { 'content-type': 'text/html' });
                res.end(`<html>InvalidAuthenticityToken ${body}</html>`);
            });
            return;
        }
        res.writeHead(404); res.end();
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const base = `http://127.0.0.1:${(server.address() as any).port}`;

    for (const m of ['login-422', 'login-500'] as const) {
        mode = m;
        const scraper = new FitPassScraper(base);
        let caught: unknown;
        try { await scraper.login({ email: 'duena@casashe.test', password: PASSWORD }); } catch (e) { caught = e; }
        assert.ok(caught instanceof FitPassHttpError, `${m}: debe ser FitPassHttpError sanitizado`);
        const e = caught as InstanceType<typeof FitPassHttpError>;
        assert.equal(e.status, m === 'login-422' ? 422 : 500);
        assert.equal(e.method, 'POST');
        assert.equal(e.path, '/sessions');
        assert.ok(!('config' in e) && !('response' in e) && !('request' in e), 'sin config/response/request');
        expectNoSecrets(m, e);
    }
    // conexión rechazada (sin respuesta): tampoco filtra
    await new Promise<void>((r) => server.close(() => r()));
    {
        const scraper = new FitPassScraper(base);
        let caught: unknown;
        try { await scraper.login({ email: 'a@b.test', password: PASSWORD }); } catch (e) { caught = e; }
        assert.ok(caught, 'conexión rechazada debe lanzar');
        expectNoSecrets('econnrefused', caught);
    }
    // sanitizeError sobre un AxiosError sintético con config.data / headers / response.data
    {
        const fake: any = new Error('Request failed with status code 422');
        fake.isAxiosError = true;
        fake.config = {
            method: 'post', url: 'https://admin2.fitpass.com/sessions?x=1',
            data: `authenticity_token=${CSRF}&login_user[email]=a%40b.test&login_user[password]=${encodeURIComponent(PASSWORD)}`,
            headers: { Cookie: `_admin_session=${CSRF}` },
        };
        fake.response = { status: 422, data: `<html>${PASSWORD}</html>` };
        fake.toJSON = () => ({ config: fake.config });
        const s = sanitizeError(fake);
        assert.ok(s instanceof FitPassHttpError);
        assert.equal((s as any).path, '/sessions');
        expectNoSecrets('sintético', s);
        // un Error normal con secretos en el mensaje se redacta
        const plain = sanitizeError(new Error(`boom authenticity_token=${CSRF}&login_user[password]=${PASSWORD}`));
        expectNoSecrets('plain', plain);
        assert.ok(!safeErrorMessage(`authenticity_token=${CSRF}`).includes(CSRF));
    }
    console.log('  ok A: errores sanitizados');

    // ── B. sesión única + mutex + re-login ───────────────────────────────────
    {
        let logins = 0;
        let failNext = false;
        const mk = () => {
            const s: any = {
                loggedIn: false,
                async login() { logins++; await new Promise((r) => setTimeout(r, 30)); if (failNext) throw new FitPassHttpError('login 422', 422, 'POST', '/sessions'); },
                async listSchedules() { return [{ id: 1 }]; },
            };
            return s;
        };
        const mgr = createFitpassSessionManager({
            loadCreds: async () => ({ email: 'a@b.test', password: PASSWORD }),
            makeScraper: () => mk(),
        });
        const [a, b, c] = await Promise.all([mgr.get(), mgr.get(), mgr.get()]);
        assert.equal(logins, 1, 'tres get() concurrentes → un solo login');
        await a.listSchedules(1, new Date(), new Date());
        await mgr.get();
        assert.equal(logins, 1, 'la sesión se reutiliza');
        void b; void c;

        // re-login único ante 422 y reintento de la llamada
        mgr.reset(); logins = 0;
        let calls = 0;
        const flaky = createFitpassSessionManager({
            loadCreds: async () => ({ email: 'a@b.test', password: PASSWORD }),
            makeScraper: () => ({
                async login() { logins++; },
                async listSchedules() { calls++; if (calls === 1) throw new FitPassHttpError('x', 422, 'GET', '/calendars/schedules'); return ['ok']; },
            }) as any,
        });
        const sc = await flaky.get();
        assert.deepEqual(await sc.listSchedules(1, new Date(), new Date()), ['ok']);
        assert.equal(logins, 2, 'un re-login tras el 422');
        assert.equal(calls, 2, 'la llamada se reintenta UNA vez');

        // si vuelve a fallar tras el reintento, no hay bucle
        let n = 0;
        const bad = createFitpassSessionManager({
            loadCreds: async () => ({ email: 'a@b.test', password: PASSWORD }),
            makeScraper: () => ({ async login() { /* ok */ }, async listSchedules() { n++; throw new FitPassHttpError('x', 401, 'GET', '/'); } }) as any,
        });
        await assert.rejects(async () => (await bad.get()).listSchedules(1, new Date(), new Date()), FitPassHttpError);
        assert.equal(n, 2, 'máximo 2 intentos (original + 1 reintento)');

        // errores que no son de sesión (404) no provocan re-login
        let l404 = 0;
        const nf = createFitpassSessionManager({
            loadCreds: async () => ({ email: 'a@b.test', password: PASSWORD }),
            makeScraper: () => ({ async login() { l404++; }, async cancelSchedule() { throw new FitPassHttpError('x', 404); } }) as any,
        });
        await assert.rejects(async () => (await nf.get()).cancelSchedule(1), FitPassHttpError);
        assert.equal(l404, 1);

        // login fallido: no se cachea y el siguiente get() reintenta
        logins = 0; failNext = true;
        const m2 = createFitpassSessionManager({
            loadCreds: async () => ({ email: 'a@b.test', password: PASSWORD }),
            makeScraper: () => mk(),
        });
        const results = await Promise.allSettled([m2.get(), m2.get()]);
        assert.ok(results.every((r) => r.status === 'rejected'));
        assert.equal(logins, 1, 'los concurrentes comparten el mismo login fallido');
        failNext = false;
        await m2.get();
        assert.equal(logins, 2, 'tras un fallo se vuelve a loguear (nada cacheado)');
        // credenciales distintas invalidan la sesión
        let pw = 'one'; let l3 = 0;
        const m3 = createFitpassSessionManager({
            loadCreds: async () => ({ email: 'a@b.test', password: pw }),
            makeScraper: () => ({ async login() { l3++; } }) as any,
        });
        await m3.get(); await m3.get(); assert.equal(l3, 1);
        pw = 'two'; await m3.get(); assert.equal(l3, 2);
    }
    console.log('  ok B: sesión compartida, mutex y re-login');

    // ── C. FITPASS_RETRY sin pendientes no hace login ─────────────────────────
    {
        const src = readFileSync(fileURLToPath(new URL('../src/lib/fitpass/outbox.ts', import.meta.url)), 'utf8');
        const body = src.slice(src.indexOf('export async function retryFitpassOutbox'));
        assert.ok(body.indexOf('nothing-pending') !== -1 && body.indexOf('nothing-pending') < body.indexOf('getPanelCtx()'),
            'el chequeo de pendientes va ANTES de getPanelCtx()');
        const { pool } = await import('../src/config/database.js');
        try {
            const { FITPASS_MIGRATIONS } = await import('../src/lib/fitpass/migrations.js');
            for (const mg of FITPASS_MIGRATIONS) for (const st of mg.statements) await pool.query(st);
            const { rows } = await pool.query(`SELECT count(*)::int AS n FROM partner_class_mappings WHERE channel='fitpass' AND sync_status IN ('pending_delete','pending_resync')`);
            if (rows[0].n === 0) {
                const { retryFitpassOutbox } = await import('../src/lib/fitpass/outbox.js');
                const r = await retryFitpassOutbox();
                assert.equal(r.skipped, 'nothing-pending');
                assert.equal(r.cancel, null);
                console.log('  ok C: sin pendientes → no login');
            } else {
                console.log('  skip C (BD local con pendientes); verificado por orden de código');
            }
        } finally {
            await pool.end();
        }
    }
    console.log('test-fitpass-seguridad OK');
}

main().catch((e) => { console.error(e); process.exit(1); });
