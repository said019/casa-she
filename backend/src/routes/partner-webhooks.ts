/**
 * partner-webhooks — Fase 6 de TotalPass: check-in de socios por webhook oficial.
 *
 * Adaptado de LUM `server/src/routes/partner-webhooks.ts` (ruta
 * `/webhooks/totalpass/checkin`) al esquema de Casa Shé. Doc oficial:
 * `TOTALPASS-OFICIAL.md` §7.
 *
 * Flujo: el socio hace check-in en su app de TotalPass → TP manda
 * `CHECK_IN_CREATED` a esta URL con datos del socio y un `endpoint` de
 * confirmación de un solo uso (`https://admin.totalpass.com/api/v1/webhook_confirmations/<TOKEN>`).
 * TP NO manda secreto/firma en este webhook (verificado en prod) — por eso esta
 * ruta NO lleva auth de sesión. La seguridad del receptor es el guard anti-SSRF:
 * solo se hace POST al `endpoint` si su host es EXACTAMENTE uno de los hosts
 * oficiales de TotalPass. El resto del payload se trata como no confiable
 * (solo se usa para display/matching, nunca para decidir a quién marcar sin
 * un match único).
 */
import { Router, Request, Response } from 'express';
import { createHash } from 'crypto';
import rateLimit from 'express-rate-limit';
import { query } from '../config/database.js';
import { localDateStr, localDateTimeUtc } from '../lib/mx-time.js';
import { totalPassOfficialFromDb } from '../lib/totalpass/client.js';

const router = Router();

// Este endpoint es público (sin auth de sesión — ver comentario más abajo) y está
// exento del limiter GLOBAL de index.ts (ese es para frenar fuerza bruta/abuso de
// la API normal, no reintentos legítimos de webhooks). Pero sigue siendo una ruta
// pública que inserta en `processed_events` por request y puede disparar un fetch
// saliente a TotalPass — necesita SU PROPIO límite, laxo pero no cero, mismo estilo
// que `apiLimiter`/`authLimiter` en index.ts.
const totalPassCheckinLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Demasiadas solicitudes. Intenta de nuevo en un momento.' },
});

// ── Guard anti-SSRF ──────────────────────────────────────────────────────────

// Hosts oficiales de confirmación de check-in TotalPass. El `endpoint` que
// manda el webhook es de un solo uso y expira rápido; solo llamamos si el host
// es EXACTAMENTE uno de estos — nunca una URL arbitraria del payload.
const TP_CONFIRMATION_ALLOWED_HOSTS = new Set(['admin.totalpass.com', 'admin.staging.totalpass.com']);

/**
 * true SOLO si `rawUrl` es https, sin userinfo, y su hostname es EXACTAMENTE
 * uno de los hosts oficiales de TotalPass (no un substring/subdominio falso
 * como `admin.totalpass.com.evil.com`, ni una IP, ni `user@host` disfrazando
 * el host real). PURA — sin red.
 */
export function isAllowedTpConfirmationHost(rawUrl: string): boolean {
    let url: URL;
    try {
        url = new URL(rawUrl);
    } catch {
        return false;
    }
    if (url.protocol !== 'https:') return false;
    if (url.username || url.password) return false;
    return TP_CONFIRMATION_ALLOWED_HOSTS.has(url.hostname);
}

/**
 * Explica POR QUÉ se rechazó una URL de confirmación, sin aflojar el guard.
 *
 * Nació de un caso real: una socia hizo check-in, TotalPass nos mandó el evento
 * y lo rechazamos con 400 — pero la rama de rechazo no guardaba nada, así que no
 * quedó forma de saber si faltó el `endpoint`, si venía por http, o si el host
 * era otro (y cuál). Sin ese dato no se puede arreglar sin adivinar, y adivinar
 * en una allowlist anti-SSRF es justo lo que no se debe hacer.
 *
 * `motivo` null = la URL pasa el guard. PURA — sin red.
 */
export function motivoRechazoConfirmacion(rawUrl: string | null | undefined): { motivo: string | null; host: string | null } {
    if (!rawUrl || !String(rawUrl).trim()) return { motivo: 'sin_endpoint', host: null };
    let url: URL;
    try {
        url = new URL(String(rawUrl));
    } catch {
        return { motivo: 'url_invalida', host: null };
    }
    if (url.username || url.password) return { motivo: 'con_credenciales', host: url.hostname };
    if (url.protocol !== 'https:') return { motivo: 'no_https', host: url.hostname };
    if (!TP_CONFIRMATION_ALLOWED_HOSTS.has(url.hostname)) return { motivo: 'host_no_permitido', host: url.hostname };
    return { motivo: null, host: url.hostname };
}

// ── Match de asistencia (funciones puras) ────────────────────────────────────

export interface TpCheckinIdentity {
    document?: string | null;
    email?: string | null;
    name?: string | null;
}

export interface TpBookingCandidate {
    id: string;
    user_id: string;
    class_id: string;
    external_ref?: string | null;
    tp_document?: string | null; // partner_metadata.tp_document (CURP)
    tp_email?: string | null;    // partner_metadata.tp_email
    email?: string | null;       // u.email
    display_name?: string | null;
}

function normDoc(v: string | null | undefined): string | null {
    const s = String(v ?? '').trim().toUpperCase();
    return s || null;
}

function normEmail(v: string | null | undefined): string | null {
    const s = String(v ?? '').trim().toLowerCase();
    return s || null;
}

/** Normaliza un nombre para comparar (minúsculas, sin acentos, espacios colapsados). PURA. */
export function tpNormName(v: string | null | undefined): string {
    return String(v ?? '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Matchea un check-in de TotalPass contra reservas candidatas LOCALES, por ids
 * de ALTA entropía primero (documento/CURP o email — `partner_metadata.tp_document`,
 * `partner_metadata.tp_email`/`u.email`), con nombre normalizado como último
 * recurso. PURA — el caller decide qué hacer según cuántos matches regresen
 * (0 o >1 → ambiguo, NO se marca nada; exactamente 1 → match único).
 */
export function tpMatchCheckinToBookings(
    checkin: TpCheckinIdentity,
    bookings: TpBookingCandidate[],
): TpBookingCandidate[] {
    const doc = normDoc(checkin.document);
    const email = normEmail(checkin.email);

    if (doc || email) {
        const byIdentity = bookings.filter((b) => {
            const bDoc = normDoc(b.tp_document);
            const bEmail = normEmail(b.tp_email || b.email);
            return (doc !== null && bDoc !== null && bDoc === doc)
                || (email !== null && bEmail !== null && bEmail === email);
        });
        if (byIdentity.length > 0) return byIdentity;
    }

    const name = tpNormName(checkin.name);
    if (name) {
        return bookings.filter((b) => tpNormName(b.display_name) === name);
    }

    return [];
}

// ── Idempotencia (processed_events / checkins) ───────────────────────────────

/** Reserva la llave de idempotencia. true = ya estaba procesado (dedupe hit). */
async function reserveProcessedEvent(eventId: string, channel: string, eventType: string): Promise<boolean> {
    try {
        await query(
            `INSERT INTO processed_events (event_id, channel, event_type) VALUES ($1, $2, $3)`,
            [eventId, channel, eventType],
        );
        return false;
    } catch (error: any) {
        if (error?.code === '23505') return true; // PK violation → ya procesado
        throw error;
    }
}

async function finalizeProcessedEvent(eventId: string, responseStatus: number): Promise<void> {
    await query(`UPDATE processed_events SET response_status = $2 WHERE event_id = $1`, [eventId, responseStatus]);
}

/** Libera la llave SOLO si nunca se llegó a finalizar (permite reintento del webhook). */
async function clearProcessedEvent(eventId: string): Promise<void> {
    await query(`DELETE FROM processed_events WHERE event_id = $1 AND response_status IS NULL`, [eventId]);
}

/** Upsert por `platform_event_id` (índice único parcial): reintentos del webhook
 *  convergen a la misma fila en vez de duplicar el registro de auditoría. */
async function upsertCheckinRecord(input: {
    eventId: string;
    bookingId: string | null;
    userId: string | null;
    classId: string | null;
    externalRef: string | null;
    status: 'confirmed' | 'failed';
    payload: unknown;
    platformResponse: unknown;
}): Promise<void> {
    await query(
        `INSERT INTO checkins
             (booking_id, user_id, class_id, channel, external_ref, platform_event_id,
              status, validation_method, validated_at, payload, platform_response)
         VALUES ($1, $2, $3, 'totalpass', $4, $5, $6, 'automated', NOW(), $7::jsonb, $8::jsonb)
         ON CONFLICT (platform_event_id) WHERE platform_event_id IS NOT NULL
         DO UPDATE SET
             booking_id = EXCLUDED.booking_id,
             user_id = EXCLUDED.user_id,
             class_id = EXCLUDED.class_id,
             external_ref = EXCLUDED.external_ref,
             status = EXCLUDED.status,
             validated_at = NOW(),
             payload = EXCLUDED.payload,
             platform_response = EXCLUDED.platform_response,
             updated_at = NOW()`,
        [
            input.bookingId, input.userId, input.classId, input.externalRef, input.eventId,
            input.status, JSON.stringify(input.payload ?? {}), JSON.stringify(input.platformResponse ?? {}),
        ],
    );
}

/** Hash determinístico del payload — SOLO como respaldo cuando no hay TOKEN en
 *  el `endpoint` (nunca se usa el reloj para la llave de idempotencia). */
function sha256Hex(data: unknown): string {
    return createHash('sha256').update(JSON.stringify(data ?? {})).digest('hex');
}

// ── Extracción defensiva del payload CHECK_IN_CREATED ────────────────────────

/** Extrae la URL de confirmación (`endpoint`). Se prueban variantes/anidados
 *  defensivamente por si el shape difiere entre sandbox y producción, con un
 *  deep-scan de respaldo — sin esto, el check-in del socio no se confirma. */
function extractConfirmationEndpoint(payload: any): string | null {
    const direct = payload?.endpoint
        ?? payload?.confirmation_url ?? payload?.confirmationUrl
        ?? payload?.checkin?.endpoint ?? payload?.checkin?.confirmation_url
        ?? payload?.check_in?.endpoint ?? payload?.check_in?.confirmation_url
        ?? payload?.data?.endpoint ?? payload?.data?.confirmation_url
        ?? payload?.event_data?.endpoint ?? payload?.event_data?.confirmation_url;
    if (typeof direct === 'string' && direct.trim()) return direct.trim();

    let found: string | null = null;
    const visit = (o: any, depth: number) => {
        if (found || !o || typeof o !== 'object' || depth > 5) return;
        for (const [k, v] of Object.entries(o)) {
            if (found) return;
            const key = k.toLowerCase();
            if (typeof v === 'string' && v.trim()) {
                if (key === 'endpoint' || key === 'confirmation_url' || key === 'confirmationurl') {
                    found = v.trim();
                    return;
                }
            } else if (v && typeof v === 'object') {
                visit(v, depth + 1);
            }
        }
    };
    visit(payload, 0);
    return found;
}

/** Token de la URL de confirmación (último segmento del path). Solo parseo —
 *  sin red — así que es seguro llamarlo ANTES de validar el host. */
function extractConfirmationToken(rawUrl: string | null): string | null {
    if (!rawUrl) return null;
    try {
        const url = new URL(rawUrl);
        const segments = url.pathname.split('/').filter(Boolean);
        const last = segments[segments.length - 1];
        return last ? decodeURIComponent(last) : null;
    } catch {
        return null;
    }
}

/** Datos de display/matching del payload — SIEMPRE untrusted: solo se usan
 *  para logging y para BUSCAR (nunca crear) una reserva local. */
function extractCheckinUserInfo(payload: any): { name: string | null; document: string | null; email: string | null } {
    const name = payload?.user?.name ?? payload?.name ?? payload?.member?.name
        ?? payload?.customer?.name ?? payload?.employee_name ?? null;
    const document = payload?.user?.document_number ?? payload?.document_number
        ?? payload?.user?.document ?? payload?.document
        ?? payload?.user?.curp ?? payload?.curp ?? null;
    const email = payload?.user?.email ?? payload?.email
        ?? payload?.member?.email ?? payload?.customer?.email ?? null;

    return {
        name: name != null ? (String(name).trim() || null) : null,
        document: document != null ? (String(document).trim() || null) : null,
        email: email != null ? (String(email).trim() || null) : null,
    };
}

// ── Confirmación de la visita ─────────────────────────────────────────────────

/** POST directo al endpoint de confirmación: el token de la URL ES la auth
 *  (sin headers, body vacío). Timeout corto — la ventana de confirmación de TP
 *  es chica, no vale la pena esperar de más.
 *
 *  `redirect: 'manual'` es anti-SSRF: el host ya pasó `isAllowedTpConfirmationHost`,
 *  pero un 3xx DE ESE HOST podría apuntar a un host arbitrario fuera de la
 *  allowlist. Con 'manual' fetch NO sigue el redirect — lo devuelve tal cual
 *  (Node/undici expone el status real del 3xx, no una respuesta opaca). Cualquier
 *  3xx se trata como FALLO de confirmación, igual que un status no-2xx. */
async function confirmCheckinEndpoint(url: string): Promise<{ ok: boolean; status: number; text: string }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
        const response = await fetch(url, { method: 'POST', signal: controller.signal, redirect: 'manual' });
        const text = await response.text().catch(() => '');
        const isRedirect = response.status >= 300 && response.status < 400;
        return { ok: response.ok && !isRedirect, status: response.status, text };
    } finally {
        clearTimeout(timeout);
    }
}

// ── Búsqueda de reservas candidatas (clase de hoy ±60 min) ───────────────────

async function findCandidateBookingsForCheckin(): Promise<TpBookingCandidate[]> {
    const today = localDateStr();
    const rows = await query<{
        id: string;
        user_id: string;
        class_id: string;
        external_ref: string | null;
        partner_metadata: any;
        date: string;
        start_time: string;
        email: string | null;
        display_name: string | null;
    }>(
        `SELECT b.id, b.user_id, b.class_id, b.external_ref, b.partner_metadata,
                c.date::text AS date, c.start_time::text AS start_time,
                u.email, u.display_name
           FROM bookings b
           JOIN classes c ON c.id = b.class_id
           JOIN users u ON u.id = b.user_id
          WHERE b.channel = 'totalpass'
            AND b.status = 'confirmed'
            AND c.date = $1::date`,
        [today],
    );

    const now = Date.now();
    return rows
        .filter((r) => {
            const startsAt = localDateTimeUtc(String(r.date).slice(0, 10), String(r.start_time).slice(0, 5));
            return Math.abs(startsAt.getTime() - now) <= 60 * 60 * 1000;
        })
        .map((r) => ({
            id: r.id,
            user_id: r.user_id,
            class_id: r.class_id,
            external_ref: r.external_ref,
            tp_document: r.partner_metadata?.tp_document ?? null,
            tp_email: r.partner_metadata?.tp_email ?? null,
            email: r.email,
            display_name: r.display_name,
        }));
}

// ── Ruta: CHECK_IN_CREATED ────────────────────────────────────────────────────
//
// TP no manda secreto/firma en este webhook (verificado en prod), así que esta
// ruta NO pasa por ningún middleware de auth (fail-closed rechazaría siempre
// por falta de firma). La seguridad es el guard anti-SSRF de arriba: solo se
// llama al `endpoint` si su host es un host TotalPass conocido.
router.post('/totalpass/checkin', totalPassCheckinLimiter, async (req: Request, res: Response) => {
    const payload = req.body ?? {};
    const rawEndpoint = extractConfirmationEndpoint(payload);
    const token = extractConfirmationToken(rawEndpoint);
    // Idempotencia: TOKEN de la URL si existe; si no, hash del payload (NUNCA el reloj).
    const eventId = `totalpass:checkin:${token || sha256Hex(payload)}`;

    let alreadyProcessed: boolean;
    try {
        alreadyProcessed = await reserveProcessedEvent(eventId, 'totalpass', 'checkin');
    } catch (error) {
        console.error('[tp-checkin] error reservando idempotencia:', error);
        return res.status(500).json({ ok: false, error: 'internal_error' });
    }
    if (alreadyProcessed) {
        return res.status(200).json({ status: 'already_processed' });
    }

    const userInfo = extractCheckinUserInfo(payload);
    const who = userInfo.name || userInfo.document || userInfo.email || 'desconocido';

    try {
        // Guard anti-SSRF: sin esto, NO se hace el POST de confirmación.
        if (!rawEndpoint || !isAllowedTpConfirmationHost(rawEndpoint)) {
            // Se deja rastro del MOTIVO y del host. Antes esta rama devolvía 400 y
            // no guardaba nada: un check-in real de una socia se perdió sin que
            // quedara forma de saber por qué (ni de que el estudio se enterara).
            const { motivo, host } = motivoRechazoConfirmacion(rawEndpoint);
            console.error(`[tp-checkin] confirmación rechazada para ${who} — motivo=${motivo} host=${host ?? '—'} endpoint=${JSON.stringify(rawEndpoint)}`);
            await upsertCheckinRecord({
                eventId, bookingId: null, userId: null, classId: null, externalRef: null,
                status: 'failed', payload,
                platformResponse: { rechazado: true, motivo, host, endpoint: rawEndpoint ?? null },
            }).catch((e) => console.error('[tp-checkin] error registrando checkin rechazado:', e));
            await finalizeProcessedEvent(eventId, 400).catch(() => { /* best-effort */ });
            return res.status(400).json({ ok: false, error: 'invalid_confirmation_endpoint' });
        }

        // Confirmar la visita — token de la URL = auth, body vacío.
        let confirmation: { ok: boolean; status: number; text: string };
        try {
            confirmation = await confirmCheckinEndpoint(rawEndpoint);
        } catch (networkError: any) {
            // Sin respuesta definitiva de TP (timeout/red): no sabemos si confirmó.
            // Se libera la llave de idempotencia para que un eventual reintento del
            // webhook pueda volver a intentarlo (el token puede seguir vivo).
            console.error(`[tp-checkin] error de red confirmando ${who}:`, networkError?.message || networkError);
            await clearProcessedEvent(eventId).catch(() => { /* best-effort */ });
            await upsertCheckinRecord({
                eventId, bookingId: null, userId: null, classId: null, externalRef: null,
                status: 'failed', payload, platformResponse: { error: String(networkError?.message || networkError) },
            }).catch((e) => console.error('[tp-checkin] error registrando checkin fallido (red):', e));
            return res.status(502).json({ ok: false, confirmed: false, matched: false, error: 'confirm_network_error' });
        }

        console.log(`[tp-checkin] confirmación TP para ${who}: ${confirmation.ok ? 'ok' : `error_${confirmation.status}`}`);

        // Marcar asistencia local: best-effort, SOLO con match único.
        let matchedBooking: TpBookingCandidate | null = null;
        try {
            const candidates = await findCandidateBookingsForCheckin();
            const matches = tpMatchCheckinToBookings(userInfo, candidates);
            if (matches.length === 1) {
                matchedBooking = matches[0];
            } else if (matches.length === 0) {
                console.warn(`[tp-checkin] sin reserva local para ${who} (0 candidatos en la ventana)`);
            } else {
                console.warn(`[tp-checkin] match ambiguo para ${who} (${matches.length} candidatos) — no se marca`);
            }
        } catch (matchError) {
            console.error(`[tp-checkin] error buscando reserva local para ${who}:`, matchError);
        }

        if (confirmation.ok && matchedBooking) {
            try {
                await query(
                    `UPDATE bookings
                        SET status = 'checked_in', checked_in_at = NOW(), checked_in_method = 'auto', updated_at = NOW()
                      WHERE id = $1 AND status <> 'cancelled'`,
                    [matchedBooking.id],
                );
            } catch (updateError) {
                console.error(`[tp-checkin] error marcando checked_in para booking ${matchedBooking.id}:`, updateError);
            }
        }

        try {
            await upsertCheckinRecord({
                eventId,
                bookingId: matchedBooking?.id ?? null,
                userId: matchedBooking?.user_id ?? null,
                classId: matchedBooking?.class_id ?? null,
                externalRef: matchedBooking?.external_ref ?? null,
                status: confirmation.ok ? 'confirmed' : 'failed',
                payload,
                platformResponse: { status: confirmation.status, text: (confirmation.text || '').slice(0, 300) },
            });
        } catch (checkinError) {
            console.error('[tp-checkin] error registrando fila de checkins:', checkinError);
        }

        await finalizeProcessedEvent(eventId, confirmation.status).catch(() => { /* best-effort */ });

        return res.status(200).json({ ok: true, confirmed: confirmation.ok, matched: Boolean(matchedBooking) });
    } catch (error: any) {
        // Red de seguridad: cualquier excepción no prevista se loguea (nunca 500 mudo).
        // El mensaje real SOLO va al log del servidor — el caller no está autenticado,
        // así que el JSON de respuesta lleva un mensaje genérico (nada de detalles internos).
        console.error('[tp-checkin] error inesperado procesando check-in:', error);
        await finalizeProcessedEvent(eventId, 500).catch(() => { /* best-effort */ });
        return res.status(500).json({ ok: false, error: 'internal_error' });
    }
});

// ── Registro del webhook (llamado desde el endpoint admin en partners.ts) ────

/**
 * Registra el webhook de CHECKIN ante TotalPass. ¡OJO, host distinto al de
 * `booking-api` (client.ts)!: `gym-service-api.totalpass.com` — en booking-api
 * este path da 404. Usa el mismo Bearer de `/partner/auth`.
 */
export async function registerTotalPassCheckinWebhook(): Promise<{ webhookId: string | number | null; raw: unknown }> {
    const baseUrl = String(process.env.PUBLIC_BASE_URL || process.env.APP_URL || '').trim().replace(/\/+$/, '');
    if (!baseUrl) {
        throw new Error('Falta PUBLIC_BASE_URL (o APP_URL): no se puede registrar el webhook de TotalPass sin una URL pública.');
    }

    const client = await totalPassOfficialFromDb();
    if (!client) {
        throw new Error('Faltan credenciales de TotalPass (platform_credentials) para registrar el webhook.');
    }
    const token = await client.authenticate();
    const webhookUrl = `${baseUrl}/webhooks/totalpass/checkin`;

    const response = await fetch('https://gym-service-api.totalpass.com/partner/webhook/create', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ webhook_url: webhookUrl, webhook_type: 'CHECKIN' }),
    });

    const raw = await response.json().catch(() => null);
    if (!response.ok) {
        const body = raw ? JSON.stringify(raw) : await response.text().catch(() => '');
        throw new Error(`TotalPass /partner/webhook/create falló (${response.status}): ${String(body).slice(0, 300)}`);
    }

    const data = raw as any;
    const webhookId = data?.id ?? data?.webhook?.id ?? data?.webhook_id ?? null;
    return { webhookId, raw };
}

export default router;
