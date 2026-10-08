/**
 * Credenciales de FitPass (panel admin2.fitpass.com), cifradas en reposo.
 *
 * Almacenamiento: platform_credentials(channel='fitpass').scraper_config = pgp_sym_encrypt(JSON, KEY)
 * con KEY = env APP_ENCRYPTION_KEY (>= 32 chars). La llave SIEMPRE se pasa como parámetro de la
 * consulta (no se usa set_config/current_setting), así que rutas y crons funcionan igual.
 *
 * API estable:
 *   FitpassCreds { email, password, gymId, panelUrl?, verifiedAt? }
 *   FitpassNotConfiguredError
 *   getFitpassCreds(opts?: { includeDisabled?: boolean }) -> Promise<FitpassCreds | null>
 *       null si no hay credenciales, o el canal está deshabilitado (salvo includeDisabled).
 *   getFitpassScraper() -> Promise<FitPassScraper>   (ya con login; lanza FitpassNotConfiguredError)
 *   saveFitpassCreds(creds, userId?)  cifra, guarda y pone is_enabled=true
 *   disableFitpass(userId?)           is_enabled=false (conserva credenciales)
 *   getFitpassCredentialsStatus()     estado ENMASCARADO (nunca el password)
 *   maskEmail(email)
 */
import { query, queryOne } from '../../config/database.js';
import { FitPassScraper } from '../scrapers/fitpass.js';

export interface FitpassCreds {
    email: string;
    password: string;
    gymId: number;
    panelUrl?: string;
    verifiedAt?: string;
}

export class FitpassNotConfiguredError extends Error {
    constructor(message = 'FitPass no está configurado o está deshabilitado') {
        super(message);
        this.name = 'FitpassNotConfiguredError';
    }
}

export function getEncryptionKey(): string {
    const key = process.env.APP_ENCRYPTION_KEY;
    if (!key || key.length < 32) {
        throw new Error('APP_ENCRYPTION_KEY no está configurada (mínimo 32 caracteres)');
    }
    return key;
}

export function maskEmail(email: string): string {
    const [user, domain] = String(email || '').split('@');
    if (!domain) return '***';
    const head = user.slice(0, 2);
    return `${head}${'*'.repeat(Math.max(user.length - 2, 1))}@${domain}`;
}

export async function getFitpassCreds(opts: { includeDisabled?: boolean } = {}): Promise<FitpassCreds | null> {
    const key = getEncryptionKey();
    const row = await queryOne<{ is_enabled: boolean; cfg: any }>(
        `SELECT is_enabled,
                CASE WHEN scraper_config IS NULL THEN NULL
                     ELSE pgp_sym_decrypt(scraper_config, $1)::jsonb END AS cfg
           FROM platform_credentials WHERE channel = 'fitpass'`,
        [key],
    );
    if (!row || !row.cfg) return null;
    if (!row.is_enabled && !opts.includeDisabled) return null;
    const cfg = row.cfg;
    const gymId = Number(cfg.gym_id);
    if (!cfg.email || !cfg.password || !Number.isInteger(gymId) || gymId <= 0) return null;
    return {
        email: String(cfg.email),
        password: String(cfg.password),
        gymId,
        panelUrl: cfg.panel_url ? String(cfg.panel_url) : undefined,
        verifiedAt: cfg.verified_at ? String(cfg.verified_at) : undefined,
    };
}

export async function getFitpassScraper(): Promise<FitPassScraper> {
    const creds = await getFitpassCreds();
    if (!creds) throw new FitpassNotConfiguredError();
    const scraper = new FitPassScraper(creds.panelUrl);
    await scraper.login({ email: creds.email, password: creds.password });
    return scraper;
}

export async function saveFitpassCreds(creds: FitpassCreds, userId?: string | null): Promise<void> {
    const key = getEncryptionKey();
    const payload = JSON.stringify({
        email: creds.email,
        password: creds.password,
        gym_id: creds.gymId,
        panel_url: creds.panelUrl ?? null,
        verified_at: creds.verifiedAt ?? new Date().toISOString(),
    });
    await query(
        `INSERT INTO platform_credentials (channel, is_enabled, scraper_config, updated_at, updated_by)
         VALUES ('fitpass', true, pgp_sym_encrypt($1, $2), NOW(), $3)
         ON CONFLICT (channel) DO UPDATE
            SET scraper_config = EXCLUDED.scraper_config, is_enabled = true,
                updated_at = NOW(), updated_by = EXCLUDED.updated_by`,
        [payload, key, userId ?? null],
    );
}

export async function disableFitpass(userId?: string | null): Promise<void> {
    await query(
        `UPDATE platform_credentials SET is_enabled = false, updated_at = NOW(), updated_by = $1 WHERE channel = 'fitpass'`,
        [userId ?? null],
    );
}

export async function getFitpassCredentialsStatus(): Promise<{
    configured: boolean; is_enabled: boolean; email_masked: string | null; gym_id: number | null;
    panel_url: string | null; verified_at: string | null; updated_at: string | null;
}> {
    const meta = await queryOne<{ is_enabled: boolean; has_cfg: boolean; updated_at: string | null }>(
        `SELECT is_enabled, (scraper_config IS NOT NULL) AS has_cfg, updated_at
           FROM platform_credentials WHERE channel = 'fitpass'`,
    );
    if (!meta || !meta.has_cfg) {
        return { configured: false, is_enabled: Boolean(meta?.is_enabled), email_masked: null, gym_id: null, panel_url: null, verified_at: null, updated_at: meta?.updated_at ?? null };
    }
    const creds = await getFitpassCreds({ includeDisabled: true });
    return {
        configured: Boolean(creds),
        is_enabled: meta.is_enabled,
        email_masked: creds ? maskEmail(creds.email) : null,
        gym_id: creds?.gymId ?? null,
        panel_url: creds?.panelUrl ?? null,
        verified_at: creds?.verifiedAt ?? null,
        updated_at: meta.updated_at,
    };
}
