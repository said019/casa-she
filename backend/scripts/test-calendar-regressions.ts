import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { levantarServidorLocal } from './helpers/servidor-local.js';

// Every suite runs against a disposable LOCAL database, never deployment variables.
const server = await levantarServidorLocal(3297);
const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const filters = process.argv.slice(2);
const commands: string[] = manifest.scripts.test.split(' && ').filter((command: string) => !filters.length || filters.some(filter => command.includes(filter)));
const failures: string[] = [];
try {
    for (const command of commands) {
        const [executable, ...args] = command.split(' ');
        const child = spawn(`node_modules/.bin/${executable}`, args, {
            stdio: 'inherit',
            env: {
                ...process.env, DATABASE_URL: server.databaseUrl, TEST_DATABASE_URL: server.databaseUrl,
                JWT_SECRET: 'prueba-local-no-es-produccion', NODE_ENV: 'test',
                ENABLE_CRON_JOBS: 'false', CRON_JOBS: 'NINGUNO', DISABLE_WHATSAPP: 'true',
                RESEND_API_KEY: '', MP_ACCESS_TOKEN: '', STRIPE_SECRET_KEY: '',
                EVOLUTION_API_KEY: '', EVOLUTION_API_URL: '', VAPID_PUBLIC_KEY: '', VAPID_PRIVATE_KEY: '',
                TOTALPASS_PARTNER_API_KEY: '', TOTALPASS_PLACE_API_KEY: '', APP_ENCRYPTION_KEY: '',
            },
        });
        const timeout = setTimeout(() => child.kill('SIGTERM'), 180_000);
        const code = await new Promise<number | null>(resolve => {
            child.on('exit', resolve);
            child.on('error', () => resolve(1));
        });
        clearTimeout(timeout);
        console.log(`REGRESSION ${code === 0 ? 'PASS' : 'FAIL'} ${command}`);
        if (code !== 0) failures.push(command);
    }
} finally {
    await server.detener();
}
console.log(JSON.stringify({ total: commands.length, passed: commands.length - failures.length, failures }, null, 2));
process.exitCode = failures.length ? 1 : 0;
