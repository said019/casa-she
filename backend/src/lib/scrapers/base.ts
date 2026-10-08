/**
 * BaseScraper — interfaz común para scrapers de paneles partner (FitPass admin2,
 * TotalPass dueño-gym). Mantiene cookie jar + HTTP client + helper de CSRF Rails.
 *
 * No requiere browser headless: los dos paneles son Rails server-rendered, así
 * que axios + cookies + cheerio alcanzan. Si en el futuro un panel pasa a SPA
 * con JS necesario, se reemplaza la implementación concreta por Playwright sin
 * tocar esta interfaz.
 */

import axios, { AxiosInstance } from 'axios';
import { CookieJar } from 'tough-cookie';
import { wrapper } from 'axios-cookiejar-support';

export type ScraperChannel = 'totalpass' | 'fitpass';

export interface ScraperRunResult {
    channel: ScraperChannel;
    ok: boolean;
    fetched: number;
    pushed: number;
    failed: number;
    durationMs: number;
    error?: string;
}

export interface ScraperCreds {
    email: string;
    password: string;
    panelUrl?: string;
}

export abstract class BaseScraper {
    public channel: ScraperChannel;
    protected jar: CookieJar;
    protected http: AxiosInstance;
    protected loggedIn = false;

    constructor(channel: ScraperChannel) {
        this.channel = channel;
        this.jar = new CookieJar();
        this.http = wrapper(axios.create({
            jar: this.jar,
            withCredentials: true,
            maxRedirects: 5,
            timeout: 30_000,
            validateStatus: (s) => s < 500,
            headers: {
                'User-Agent':
                    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
                    '(KHTML, like Gecko) Chrome/120.0 Safari/537.36',
                'Accept-Language': 'es-MX,es;q=0.9,en;q=0.8',
            },
        }));
    }

    abstract login(creds: ScraperCreds): Promise<void>;
    abstract syncReservations(from: Date, to: Date): Promise<ScraperRunResult>;

    /** Extrae el CSRF token de un meta tag de Rails. Devuelve null si no encuentra. */
    protected extractCsrf(html: string): string | null {
        const m = html.match(/<meta\s+name=["']csrf-token["']\s+content=["']([^"']+)["']/i);
        return m ? m[1] : null;
    }
}
