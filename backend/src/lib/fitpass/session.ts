/**
 * session — UNA sesión logueada de FitPass por proceso.
 *
 * Antes cada cron (SYNC/POOL/RETRY) y cada ruta creaba su scraper y hacía login por su
 * cuenta; cuando coincidían en el mismo minuto FitPass rechazaba el POST /sessions con 422
 * (InvalidAuthenticityToken). Aquí el scraper logueado se cachea en módulo y el login pasa
 * por un mutex en proceso (promesa compartida): nunca hay dos logins concurrentes.
 *
 * El scraper que se entrega es un proxy: si un método falla con 401/302/422 (sesión caída o
 * token rotado) se descarta la sesión, se hace UN re-login (compartido) y se reintenta la
 * llamada UNA vez. Un login fallido nunca queda cacheado.
 *
 * Sin imports de BD: las credenciales y la fábrica del scraper se inyectan (testeable sin red).
 */
import { FitPassScraper, FitPassHttpError } from '../scrapers/fitpass.js';
import { safeErrorMessage } from '../scrapers/sanitize.js';

export interface SessionCreds { email: string; password: string; panelUrl?: string }

export interface FitpassSessionDeps {
    /** Credenciales vigentes; debe lanzar (p. ej. FitpassNotConfiguredError) si no hay. */
    loadCreds(): Promise<SessionCreds>;
    makeScraper(panelUrl?: string): FitPassScraper;
}

const RELOGIN_STATUSES = new Set([401, 302, 303, 422]);

export function isSessionExpiredError(e: unknown): boolean {
    return e instanceof FitPassHttpError && RELOGIN_STATUSES.has(e.status);
}

export function createFitpassSessionManager(deps: FitpassSessionDeps) {
    let cached: { key: string; scraper: FitPassScraper } | null = null;
    let inflight: { key: string; promise: Promise<FitPassScraper> } | null = null;

    const keyOf = (c: SessionCreds) => `${c.panelUrl ?? ''}\u0000${c.email}\u0000${c.password}`;

    async function raw(): Promise<FitPassScraper> {
        const creds = await deps.loadCreds();
        const key = keyOf(creds);
        if (cached && cached.key === key) return cached.scraper;
        if (inflight && inflight.key === key) return inflight.promise;
        const promise = (async () => {
            const scraper = deps.makeScraper(creds.panelUrl);
            try {
                await scraper.login({ email: creds.email, password: creds.password });
            } catch (e) {
                // Nunca dejar nada cacheado tras un login fallido; el error ya viene sanitizado.
                cached = null;
                throw e;
            }
            cached = { key, scraper };
            return scraper;
        })();
        const slot = { key, promise };
        inflight = slot;
        const clear = () => { if (inflight === slot) inflight = null; };
        promise.then(clear, clear);
        return promise;
    }

    /** Descarta la sesión `bad` (si sigue siendo la vigente) y devuelve una sesión fresca. */
    async function refresh(bad: FitPassScraper): Promise<FitPassScraper> {
        if (cached && cached.scraper === bad) cached = null;
        return raw();
    }

    function wrap(scraper: FitPassScraper): FitPassScraper {
        return new Proxy(scraper, {
            get(target, prop, receiver) {
                const v = Reflect.get(target, prop, receiver);
                if (typeof v !== 'function' || prop === 'login' || prop === 'constructor' || typeof prop === 'symbol') return v;
                return async (...args: unknown[]) => {
                    try {
                        return await (v as (...a: unknown[]) => unknown).apply(target, args);
                    } catch (e) {
                        if (!isSessionExpiredError(e)) throw e;
                        console.warn(`[fitpass-session] ${String(prop)}: sesión rechazada (${(e as FitPassHttpError).status}); re-login y reintento único`);
                        let fresh: FitPassScraper;
                        try { fresh = await refresh(target); } catch (le) {
                            throw new Error(`FitPass: re-login falló: ${safeErrorMessage(le)}`);
                        }
                        return await (fresh as any)[prop](...args);
                    }
                };
            },
        });
    }

    return {
        /** Scraper logueado y compartido (proxy con re-login automático). */
        async get(): Promise<FitPassScraper> { return wrap(await raw()); },
        /** Olvida la sesión (credenciales cambiadas/deshabilitadas). */
        reset(): void { cached = null; inflight = null; },
    };
}
