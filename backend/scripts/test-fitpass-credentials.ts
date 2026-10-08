/**
 * Credenciales FitPass cifradas (BD LOCAL) + cableado de rutas/migraciones.
 * Aplica las migraciones FitPass a la BD local (idempotentes) y limpia lo que escribe.
 *   DATABASE_URL=postgresql://localhost:5432/casa_she npx tsx scripts/test-fitpass-credentials.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

process.env.APP_ENCRYPTION_KEY = 'test-key-'.padEnd(40, 'x');

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

// ── Cableado ────────────────────────────────────────────────────────────────
const routes = read('../src/routes/partners-fitpass.ts');
const index = read('../src/index.ts');
for (const re of [
    /router\.get\('\/credentials\/status'/, /router\.post\('\/credentials'/, /router\.delete\('\/credentials'/,
    /router\.get\('\/lessons'/, /router\.post\('\/lessons\/auto-map'/, /router\.put\('\/class-types\/:id\/lesson'/,
]) assert.match(routes, re);
assert.match(routes, /accountRole/, 'las rutas deben distinguir recepción por accountRole');
assert.doesNotMatch(routes, /panel_url/, 'el body no puede elegir a dónde se envía el password');
assert.match(index, /app\.use\('\/api\/partners\/fitpass', partnersFitpassRouter\)/);
assert.ok(index.indexOf("'/api/partners/fitpass'") < index.indexOf("app.use('/api/partners', partnersRouter)"), 'montar antes del router genérico');
assert.match(index, /FITPASS_MIGRATIONS/);
console.log('  ok cableado');

async function main() {
    const { pool } = await import('../src/config/database.js');
    const { FITPASS_MIGRATIONS } = await import('../src/lib/fitpass/migrations.js');
    const creds = await import('../src/lib/fitpass/credentials.js');
    const { logFitpassCron } = await import('../src/lib/fitpass/cron-log.js');

    for (const m of FITPASS_MIGRATIONS) for (const s of m.statements) await pool.query(s);
    try {
        await pool.query(`UPDATE platform_credentials SET scraper_config=NULL, is_enabled=false WHERE channel='fitpass'`);
        assert.equal(await creds.getFitpassCreds(), null);
        assert.equal((await creds.getFitpassCredentialsStatus()).configured, false);

        await creds.saveFitpassCreds({ email: 'duena@casashe.test', password: 'S3cr3t!', gymId: 9813 });
        const got = await creds.getFitpassCreds();
        assert.equal(got?.email, 'duena@casashe.test');
        assert.equal(got?.password, 'S3cr3t!');
        assert.equal(got?.gymId, 9813);

        // En reposo NO está en claro
        const raw = (await pool.query(`SELECT encode(scraper_config,'escape') AS t FROM platform_credentials WHERE channel='fitpass'`)).rows[0].t as string;
        assert.ok(!raw.includes('S3cr3t!') && !raw.includes('duena@casashe.test'));

        const st = await creds.getFitpassCredentialsStatus();
        assert.equal(st.configured, true);
        assert.equal(st.is_enabled, true);
        assert.equal(st.gym_id, 9813);
        assert.equal(st.email_masked, 'du***@casashe.test');
        assert.ok(!JSON.stringify(st).includes('S3cr3t!'), 'el status nunca expone el password');

        // Llave equivocada no descifra
        process.env.APP_ENCRYPTION_KEY = 'otra-llave-'.padEnd(40, 'y');
        await assert.rejects(() => creds.getFitpassCreds(), /decrypt|key|Wrong/i);
        process.env.APP_ENCRYPTION_KEY = 'test-key-'.padEnd(40, 'x');

        await creds.disableFitpass();
        assert.equal(await creds.getFitpassCreds(), null, 'deshabilitado => null (los crons no corren)');
        assert.equal((await creds.getFitpassCreds({ includeDisabled: true }))?.email, 'duena@casashe.test');
        await assert.rejects(() => creds.getFitpassScraper(), creds.FitpassNotConfiguredError);

        delete process.env.APP_ENCRYPTION_KEY;
        await assert.rejects(() => creds.getFitpassCreds(), /APP_ENCRYPTION_KEY/);
        process.env.APP_ENCRYPTION_KEY = 'test-key-'.padEnd(40, 'x');
        console.log('  ok cifrado/lectura/enmascarado/disable');

        await logFitpassCron('FITPASS_TEST', true, { ok: 1 });
        const log = (await pool.query(`SELECT success, details FROM cron_job_logs WHERE job_name='FITPASS_TEST' ORDER BY executed_at DESC LIMIT 1`)).rows[0];
        assert.equal(log.success, true);
        assert.deepEqual(JSON.parse(log.details), { ok: 1 });
        console.log('  ok cron log');
    } finally {
        await pool.query(`DELETE FROM cron_job_logs WHERE job_name='FITPASS_TEST'`);
        await pool.query(`UPDATE platform_credentials SET scraper_config=NULL, is_enabled=false WHERE channel='fitpass'`);
        await pool.end();
    }
    console.log('test-fitpass-credentials: OK');
}
main().catch((e) => { console.error(e); process.exit(1); });
