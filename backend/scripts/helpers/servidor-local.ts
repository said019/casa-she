// Arnés para pruebas HTTP: clona la base LOCAL (casa_she) en una base desechable, levanta
// el backend de este repo contra ella (así corren también las migraciones de arranque) y
// al terminar apaga el servidor y borra la clon. Nunca toca producción: DATABASE_URL se
// fija aquí a localhost y se ignora cualquier PG*/DATABASE_URL heredado.
import { execFileSync, spawn, ChildProcess } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BACKEND_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PG_ENV = { ...process.env } as NodeJS.ProcessEnv;
for (const k of ['PGHOST', 'PGPORT', 'PGUSER', 'PGPASSWORD', 'PGDATABASE', 'PGSERVICE']) delete PG_ENV[k];
const PG = ['-h', 'localhost', '-p', '5432'];

export interface ServidorLocal {
    base: string;
    databaseUrl: string;
    api: string;
    detener: () => Promise<void>;
}

const dormir = (ms: number) => new Promise(r => setTimeout(r, ms));

export async function levantarServidorLocal(puerto: number): Promise<ServidorLocal> {
    const origen = process.env.E2E_BASE_ORIGEN || 'casa_she';
    const base = `casa_she_test_${process.pid}_${Date.now()}`;
    let ultimoError = '';
    for (let intento = 0; intento < 20; intento++) {
        try {
            execFileSync('createdb', [...PG, '-T', origen, base], { env: PG_ENV, stdio: 'pipe' });
            ultimoError = '';
            break;
        } catch (e: any) {
            ultimoError = String(e.stderr || e.message);
            // La plantilla no admite otras conexiones abiertas: se reintenta un rato.
            await dormir(15_000);
        }
    }
    if (ultimoError) throw new Error(`no se pudo clonar ${origen}: ${ultimoError}`);

    const databaseUrl = `postgresql://localhost:5432/${base}`;
    const servidor: ChildProcess = spawn('npx', ['tsx', 'src/index.ts'], {
        cwd: BACKEND_DIR,
        env: {
            ...PG_ENV,
            DATABASE_URL: databaseUrl,
            JWT_SECRET: 'prueba-local-no-es-produccion',
            PORT: String(puerto),
            NODE_ENV: 'development',
            FRONTEND_URL: 'http://localhost:4173',
            ENABLE_CRON_JOBS: 'false', CRON_JOBS: 'NINGUNO', DISABLE_WHATSAPP: 'true',
            RESEND_API_KEY: '', ADMIN_ALERT_EMAIL: '', ADMIN_ALERT_WHATSAPP: '',
            MP_ACCESS_TOKEN: '', STRIPE_SECRET_KEY: '', EVOLUTION_API_KEY: '', EVOLUTION_API_URL: '',
            VAPID_PUBLIC_KEY: '', VAPID_PRIVATE_KEY: '',
            TOTALPASS_PARTNER_API_KEY: '', TOTALPASS_PLACE_API_KEY: '',
        },
        stdio: 'ignore',
    });

    const detener = async () => {
        servidor.kill();
        await dormir(1500);
        try { execFileSync('dropdb', [...PG, '--if-exists', '--force', base], { env: PG_ENV, stdio: 'pipe' }); } catch { /* noop */ }
    };

    const api = `http://localhost:${puerto}/api`;
    const limite = Date.now() + 120_000;
    let listo = false;
    while (Date.now() < limite) {
        try { if ((await fetch(`${api}/health`)).ok) { listo = true; break; } } catch { /* aún no */ }
        await dormir(1000);
    }
    if (!listo) { await detener(); throw new Error('el servidor local no respondió /api/health'); }
    // Las migraciones de arranque terminan antes de abrir el puerto, pero se deja un respiro.
    return { base, databaseUrl, api, detener };
}

export async function http(api: string, method: string, url: string, token?: string, body?: unknown) {
    const res = await fetch(`${api}${url}`, {
        method,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    let json: any = null;
    try { json = await res.json(); } catch { /* sin body */ }
    return { status: res.status, json };
}
