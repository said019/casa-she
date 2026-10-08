/**
 * Sanitización de errores del scraper FitPass.
 *
 * Un AxiosError trae `config.data` (el form del login con la contraseña en claro y el
 * authenticity_token), `config.headers` (cookies) y `response.data` (HTML). Nada de eso
 * debe llegar a logs, cron_job_logs ni respuestas HTTP. `sanitizeError` lo reduce a
 * estado + método + path.
 */

/** Error HTTP del panel; `status` permite tratar 404/410 como idempotente y 401/422 como sesión caída. */
export class FitPassHttpError extends Error {
    constructor(
        message: string,
        public readonly status: number,
        public readonly method?: string,
        public readonly path?: string,
    ) {
        super(message);
        this.name = 'FitPassHttpError';
    }
}

const SECRET_PATTERNS: Array<[RegExp, string]> = [
    [/authenticity_token(=|%3D|"?\s*:\s*"?)[^&\s"'<>]+/gi, '[csrf-redacted]'],
    [/login_user(\[|%5B)password(\]|%5D)(=|%3D)[^&\s"'<>]+/gi, 'login_user[password]=[redacted]'],
    [/(password|passwd)(=|%3D)[^&\s"'<>]+/gi, '$1=[redacted]'],
    [/(_admin_session|_session|session_id|cookie)=[^;\s"']+/gi, '$1=[redacted]'],
];

/** Texto seguro: sin tokens CSRF, password ni cookies, en una línea y acotado. */
export function redactSecrets(text: string, max = 300): string {
    let s = String(text ?? '');
    for (const [re, rep] of SECRET_PATTERNS) s = s.replace(re, rep);
    return s.replace(/\s+/g, ' ').slice(0, max);
}

function isAxiosLike(e: any): boolean {
    return !!e && typeof e === 'object' && (e.isAxiosError === true || (e.config && typeof e.toJSON === 'function'));
}

function pathOf(url: unknown): string {
    const raw = String(url ?? '');
    if (!raw) return '';
    try { return new URL(raw, 'http://x').pathname; } catch { return raw.split(/[?#]/)[0]; }
}

/**
 * Devuelve un Error seguro para loguear/persistir/serializar.
 *  - AxiosError → FitPassHttpError(status, método, path) sin config/data/headers/response.
 *  - FitPassHttpError → igual (su mensaje se redacta por si trae un cuerpo recortado).
 *  - Otro Error → mismo error si su mensaje está limpio; si no, uno nuevo con el mensaje redactado.
 */
export function sanitizeError(err: unknown): Error {
    const e = err as any;
    if (isAxiosLike(e)) {
        const status = Number(e.response?.status) || 0;
        const method = String(e.config?.method || 'GET').toUpperCase();
        const path = pathOf(e.config?.url);
        const why = status ? `status ${status}` : String(e.code || 'sin respuesta');
        return new FitPassHttpError(`FitPass ${method} ${path} falló (${why})`, status, method, path);
    }
    if (e instanceof Error) {
        const clean = redactSecrets(e.message, 500);
        if (clean === e.message && !('config' in e) && !('request' in e)) return e;
        if (e instanceof FitPassHttpError) return new FitPassHttpError(clean, e.status, e.method, e.path);
        const out = new Error(clean);
        out.name = e.name;
        return out;
    }
    return new Error(redactSecrets(String(err)));
}

/** Mensaje seguro para logs/respuestas. */
export function safeErrorMessage(err: unknown): string {
    return redactSecrets(sanitizeError(err).message);
}
