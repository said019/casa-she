/**
 * Apple Wallet Integration for Casa Shé
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import jwt from 'jsonwebtoken';
import { createHmac, timingSafeEqual } from 'crypto';
import * as http2 from 'node:http2';
import { PKPass } from 'passkit-generator';
import { query, queryOne } from '../config/database.js';

console.log('[APPLE WALLET] Modulo inicializado');

const APPLE_AUTH_TOKEN = process.env.APPLE_AUTH_TOKEN;
// Secreto para derivar el authenticationToken POR PASE (HMAC del serial). Antes el token era el
// propio serial (= membership id), así que conocer un serial bastaba para autenticarse y bajar el
// pase ajeno. Con HMAC el token va dentro del pase firmado y no se puede recomputar sin el secreto.
const PASS_AUTH_SECRET = process.env.APPLE_PASS_SECRET || APPLE_AUTH_TOKEN || process.env.JWT_SECRET || '';
function computePassAuthToken(serial: string): string {
    return createHmac('sha256', PASS_AUTH_SECRET).update(`applepass:${serial}`).digest('hex');
}
const APPLE_TEAM_ID = process.env.APPLE_TEAM_ID;
const APPLE_PASS_TYPE_ID = process.env.APPLE_PASS_TYPE_ID;
const APPLE_KEY_ID = process.env.APPLE_KEY_ID;
const APPLE_APNS_KEY_BASE64 = process.env.APPLE_APNS_KEY_BASE64;
const APPLE_ORG_NAME = process.env.APPLE_ORG_NAME || 'Casa Shé';

interface MembershipData {
    id: string;
    user_id: string;
    plan_id: string;
    plan_name: string;
    plan_features: string[];
    user_name: string;
    user_email: string;
    user_phone: string;
    classes_remaining: number | null;
    classes_used: number;
    loyalty_points: number;
    start_date: Date | null;
    end_date: Date | null;
    status: string;
    member_since: Date;
    next_class_date: string | null;
    referral_code: string | null;
    next_event?: {
        title: string;
        date: string;
        start_time: string;
        location: string;
    } | null;
}

type PlanType = 'basico' | 'premium' | 'ilimitado' | 'intro';

// Casa Shé wallet palette.
// Warm gold: #A48550, olive: #81836F, sand: #D3C39F, cream: #F6F6EA, dark chocolate: #322A1E.

// Paleta Casa Shé (dorado golden-hour). Progresión por tier:
//   intro/básico → crema (claro, amable) · premium → dorado · ilimitado → dorado profundo.
// crema #ECE1CE, dorado #CE9B25, dorado profundo #AD6C20, tinta #2A2118, papel #FCFAF5.
const PLAN_STYLES: Record<PlanType, { badge: string; backgroundColor: string; foregroundColor: string; labelColor: string; stripPrefix: string; }> = {
    basico: { badge: 'MEMBER', backgroundColor: 'rgb(236, 225, 206)', foregroundColor: 'rgb(42, 33, 24)', labelColor: 'rgb(173, 108, 32)', stripPrefix: 'hero' },
    intro: { badge: 'INTRO', backgroundColor: 'rgb(236, 225, 206)', foregroundColor: 'rgb(42, 33, 24)', labelColor: 'rgb(173, 108, 32)', stripPrefix: 'hero' },
    premium: { badge: 'PREMIUM', backgroundColor: 'rgb(206, 155, 37)', foregroundColor: 'rgb(42, 33, 24)', labelColor: 'rgb(94, 62, 18)', stripPrefix: 'hero' },
    ilimitado: { badge: 'UNLIMITED', backgroundColor: 'rgb(173, 108, 32)', foregroundColor: 'rgb(252, 250, 245)', labelColor: 'rgb(241, 231, 210)', stripPrefix: 'hero' },
};

const WALLET_ELIGIBLE_STATUSES = new Set([
    'active',
    'pending_activation',
    'pending_payment',
    'paused',
    'expired',
]);

function getPlanType(planName: string): PlanType {
    const lower = planName.toLowerCase();
    if (lower.includes('premium') || lower.includes('vip')) return 'premium';
    if (lower.includes('ilimitado') || lower.includes('unlimited')) return 'ilimitado';
    if (lower.includes('intro') || lower.includes('prueba')) return 'intro';
    return 'basico';
}

function formatDate(date: Date | string | null | undefined): string {
    if (!date) return '—';
    const parsed = new Date(date);
    if (Number.isNaN(parsed.getTime())) return '—';
    return parsed.toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatClassesRemaining(classes: number | null): string {
    if (classes === null || classes === -1) return 'ILIMITADAS';
    if (classes === 0) return 'SIN CRÉDITOS';
    return classes + ' restantes';
}

function getValidDate(date: Date | string | null | undefined): Date | null {
    if (!date) return null;
    const parsed = new Date(date);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function getMembershipData(membershipId: string): Promise<MembershipData | null> {
    try {
        // Keep the requested membership as serial, but display the user's current wallet summary.
        const membership = await queryOne<MembershipData>(`
            SELECT m.id, m.user_id, m.plan_id,
                COALESCE((
                    SELECT p2.name FROM memberships m2 JOIN plans p2 ON m2.plan_id = p2.id
                    WHERE m2.user_id = m.user_id AND m2.status = 'active'
                    ORDER BY m2.created_at DESC LIMIT 1
                ), p.name) as plan_name,
                p.features as plan_features,
                u.display_name as user_name, u.email as user_email, u.phone as user_phone,
                CASE
                    WHEN EXISTS (
                        SELECT 1
                        FROM memberships m2
                        JOIN plans p2 ON m2.plan_id = p2.id
                        WHERE m2.user_id = m.user_id
                          AND m2.status = 'active'
                          AND (m2.classes_remaining IS NULL OR p2.class_limit IS NULL)
                    ) THEN NULL
                    ELSE COALESCE((
                        SELECT SUM(GREATEST(COALESCE(m2.classes_remaining, 0), 0))
                        FROM memberships m2
                        WHERE m2.user_id = m.user_id AND m2.status = 'active'
                    ), 0)::int
                END as classes_remaining,
                COALESCE((SELECT COUNT(*) FROM bookings b WHERE b.user_id = m.user_id AND b.status = 'checked_in'), 0)::int as classes_used,
                COALESCE(u.loyalty_points, 0)::int as loyalty_points,
                COALESCE((
                    SELECT MIN(m4.start_date) FROM memberships m4
                    WHERE m4.user_id = m.user_id AND m4.status = 'active'
                ), m.start_date) as start_date,
                COALESCE((
                    SELECT MAX(m3.end_date) FROM memberships m3
                    WHERE m3.user_id = m.user_id AND m3.status = 'active'
                ), m.end_date) as end_date,
                CASE
                    WHEN EXISTS (
                        SELECT 1 FROM memberships ma
                        WHERE ma.user_id = m.user_id AND ma.status = 'active'
                    ) THEN 'active'
                    ELSE m.status
                END as status,
                u.created_at as member_since,
                (SELECT rc.code FROM referral_codes rc WHERE rc.user_id = m.user_id LIMIT 1) as referral_code,
                (SELECT (c.date || 'T' || SUBSTRING(c.start_time::text, 1, 5) || ':00-06:00')
                 FROM bookings b2 JOIN classes c ON b2.class_id = c.id
                 WHERE b2.user_id = m.user_id AND b2.status = 'confirmed'
                 AND (c.date + c.start_time) > (NOW() AT TIME ZONE 'America/Mexico_City')
                 ORDER BY c.date ASC, c.start_time ASC LIMIT 1
                ) as next_class_date
            FROM memberships m
            JOIN users u ON m.user_id = u.id
            JOIN plans p ON m.plan_id = p.id
            WHERE m.id = $1`, [membershipId]);

        // Fetch next confirmed event for this user
        if (membership) {
            const nextEvent = await queryOne<{
                title: string; date: string; start_time: string; location: string;
            }>(`
                SELECT e.title, e.date::text, e.start_time::text, e.location
                FROM event_registrations r
                JOIN events e ON r.event_id = e.id
                WHERE r.user_id = $1 AND r.status = 'confirmed'
                  AND e.date >= CURRENT_DATE AND e.status = 'published'
                ORDER BY e.date ASC, e.start_time ASC
                LIMIT 1
            `, [membership.user_id]);
            membership.next_event = nextEvent || null;
        }

        return membership;
    } catch (error) {
        console.error('[APPLE] Error obteniendo membresia:', error);
        return null;
    }
}

export async function registerDevice(deviceId: string, pushToken: string, passTypeId: string, membershipId: string): Promise<void> {
    await query('INSERT INTO apple_wallet_devices (device_id, push_token, pass_type_id, membership_id) VALUES ($1, $2, $3, $4) ON CONFLICT (device_id, pass_type_id, membership_id) DO UPDATE SET push_token = $2, updated_at = NOW()', [deviceId, pushToken, passTypeId, membershipId]);
}

export async function unregisterDevice(deviceId: string, passTypeId: string, membershipId: string): Promise<void> {
    await query('DELETE FROM apple_wallet_devices WHERE device_id = $1 AND pass_type_id = $2 AND membership_id = $3', [deviceId, passTypeId, membershipId]);
}

export async function getDevicesForMembership(membershipId: string): Promise<Array<{ device_id: string; push_token: string }>> {
    return await query<{ device_id: string; push_token: string }>('SELECT device_id, push_token FROM apple_wallet_devices WHERE membership_id = $1', [membershipId]);
}

export async function getSerialsForDevice(deviceId: string, passTypeId: string): Promise<Array<{ serial_number: string; last_updated: string }>> {
    const devices = await query<{ membership_id: string; updated_at: Date }>('SELECT membership_id, updated_at FROM apple_wallet_devices WHERE device_id = $1 AND pass_type_id = $2', [deviceId, passTypeId]);
    return devices.map((d) => ({ serial_number: d.membership_id, last_updated: d.updated_at.toISOString() }));
}

export async function recordPassUpdate(membershipId: string, classesOld: number | null, classesNew: number | null): Promise<void> {
    await query('INSERT INTO apple_wallet_updates (membership_id, classes_old, classes_new) VALUES ($1, $2, $3)', [membershipId, classesOld, classesNew]);
}

export async function getLastUpdate(membershipId: string): Promise<{ updated_at: Date } | null> {
    return await queryOne<{ updated_at: Date }>('SELECT updated_at FROM apple_wallet_updates WHERE membership_id = $1 ORDER BY updated_at DESC LIMIT 1', [membershipId]);
}

export async function getUpdatedPassesSince(deviceId: string, passTypeId: string, lastUpdated: Date): Promise<string[]> {
    // Subtract 2 seconds to avoid race conditions
    const adjustedDate = new Date(lastUpdated.getTime() - 2000);
    const result = await query<{ membership_id: string }>(
        `SELECT DISTINCT awu.membership_id
         FROM apple_wallet_updates awu
         JOIN apple_wallet_devices awd ON awu.membership_id = awd.membership_id
         WHERE awd.device_id = $1 AND awd.pass_type_id = $2 AND awu.updated_at > $3`,
        [deviceId, passTypeId, adjustedDate]
    );
    return result.map(r => r.membership_id);
}

function getAPNsConfig() {
    if (!APPLE_KEY_ID || !APPLE_TEAM_ID || !APPLE_APNS_KEY_BASE64) throw new Error('Faltan credenciales APNs');
    return { keyId: APPLE_KEY_ID, teamId: APPLE_TEAM_ID, key: Buffer.from(APPLE_APNS_KEY_BASE64, 'base64').toString('utf8') };
}

function generateAPNsToken(): string {
    const config = getAPNsConfig();
    return jwt.sign({ iss: config.teamId, iat: Math.floor(Date.now() / 1000) }, config.key, { algorithm: 'ES256', header: { alg: 'ES256', kid: config.keyId } });
}

export async function sendAPNsPushNotification(pushToken: string): Promise<boolean> {
    try {
        const token = generateAPNsToken();
        const client = http2.connect('https://api.push.apple.com:443');
        return new Promise((resolve) => {
            client.on('error', (err) => { console.error('[APNs Silent] Connection error:', err.message); client.close(); resolve(false); });
            const req = client.request({ ':method': 'POST', ':path': '/3/device/' + pushToken, authorization: 'bearer ' + token, 'apns-topic': APPLE_PASS_TYPE_ID, 'apns-push-type': 'background', 'apns-priority': '5' });
            req.on('response', (headers) => {
                let responseBody = '';
                req.on('data', (chunk: Buffer) => { responseBody += chunk.toString(); });
                req.on('end', () => {
                    const status = headers[':status'];
                    console.log(`[APNs Silent] Status: ${status}, Response: ${responseBody || 'empty'}`);
                    client.close();
                    resolve(status === 200);
                });
            });
            req.on('error', (err) => { console.error('[APNs Silent] Request error:', err.message); client.close(); resolve(false); });
            req.end(JSON.stringify({}));
        });
    } catch (error) { console.error('[APNs Silent] Error:', error); return false; }
}

export async function sendAPNsAlertNotification(pushToken: string, title: string, body: string): Promise<boolean> {
    try {
        const token = generateAPNsToken();
        const payload = JSON.stringify({ aps: { alert: { title, body }, sound: 'default' } });
        const client = http2.connect('https://api.push.apple.com:443');
        return new Promise((resolve) => {
            client.on('error', (err) => { console.error('[APNs Alert] Connection error:', err.message); client.close(); resolve(false); });
            const req = client.request({
                ':method': 'POST',
                ':path': '/3/device/' + pushToken,
                authorization: 'bearer ' + token,
                'apns-topic': APPLE_PASS_TYPE_ID,
                'apns-push-type': 'alert',
                'apns-priority': '10',
                'content-type': 'application/json'
            });
            req.on('response', (headers) => {
                let responseBody = '';
                req.on('data', (chunk: Buffer) => { responseBody += chunk.toString(); });
                req.on('end', () => {
                    const status = headers[':status'];
                    console.log(`[APNs Alert] Status: ${status}, Response: ${responseBody || 'empty'}, Token: ${pushToken.substring(0, 20)}...`);
                    client.close();
                    resolve(status === 200);
                });
            });
            req.on('error', (err) => { console.error('[APNs Alert] Request error:', err.message); client.close(); resolve(false); });
            req.end(payload);
        });
    } catch (error) {
        console.error('[APNs Alert] Error:', error);
        return false;
    }
}

export async function notifyAllDevices(membershipId: string, title?: string, message?: string): Promise<number> {
    const devices = await getDevicesForMembership(membershipId);
    let count = 0;
    for (const d of devices) {
        // 1. Silent push to trigger pass update
        const silentOk = await sendAPNsPushNotification(d.push_token);
        // 2. Alert push for visible notification on lock screen
        if (title && message) {
            await sendAPNsAlertNotification(d.push_token, title, message);
        }
        if (silentOk) count++;
        // Auto-clean bad tokens would go here (410 handling)
    }
    return count;
}

export async function notifyAllUserDevices(userId: string, title?: string, message?: string): Promise<number> {
    // Find ALL devices registered for ANY membership of this user
    const devices = await query<{ push_token: string; membership_id: string }>(
        `SELECT DISTINCT awd.push_token, awd.membership_id
         FROM apple_wallet_devices awd
         JOIN memberships m ON awd.membership_id = m.id
         WHERE m.user_id = $1`, [userId]
    );
    let count = 0;
    for (const d of devices) {
        await recordPassUpdate(d.membership_id, null, null);
        const silentOk = await sendAPNsPushNotification(d.push_token);
        if (title && message) {
            await sendAPNsAlertNotification(d.push_token, title, message);
        }
        if (silentOk) count++;
    }
    return count;
}

export async function sendAlertToAllDevices(title: string, message: string): Promise<number> {
    const devices = await query<{ push_token: string }>('SELECT DISTINCT push_token FROM apple_wallet_devices');
    let count = 0;
    for (const d of devices) {
        const ok = await sendAPNsAlertNotification(d.push_token, title, message);
        if (ok) count++;
        // Small delay to avoid rate limiting
        if (devices.length > 10) await new Promise(r => setTimeout(r, 100));
    }
    console.log(`[APNs] Alert sent to ${count}/${devices.length} devices`);
    return count;
}

export function verifyAuthToken(authHeader: string | undefined, serial?: string): boolean {
    if (!authHeader || !authHeader.startsWith('ApplePass ')) return false;
    const token = authHeader.substring('ApplePass '.length).trim();
    if (!token || !serial || !PASS_AUTH_SECRET) return false;
    // El token válido es el HMAC del serial con el secreto del servidor (el mismo que va dentro del
    // pase firmado). NO se acepta el serial en crudo. Comparación en tiempo constante.
    const expected = computePassAuthToken(serial);
    const a = Buffer.from(token);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
}

function readPemFile(filePath: string): string {
    const absPath = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
    if (!fs.existsSync(absPath)) throw new Error('No existe: ' + absPath);
    const raw = fs.readFileSync(absPath, 'utf8').trim();
    const match = raw.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/);
    return match ? match[0].trim() : raw;
}

function buildTempModelDir(m: MembershipData, style: typeof PLAN_STYLES.basico, cancelInfo: { minHours: number; maxCancel: number } = { minHours: 12, maxCancel: 2 }): string {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'apple-pass-'));
    const dir = base + '.pass';
    fs.mkdirSync(dir, { recursive: true });
    let baseUrl = process.env.BASE_URL || process.env.RAILWAY_PUBLIC_DOMAIN || 'localhost:3001';
    if (!baseUrl.startsWith('http')) baseUrl = 'https://' + baseUrl;

    const endDate = getValidDate(m.end_date);
    const hasFutureEndDate = Boolean(endDate && endDate.getTime() > Date.now());

    const passJson = {
        formatVersion: 1,
        passTypeIdentifier: APPLE_PASS_TYPE_ID,
        teamIdentifier: APPLE_TEAM_ID,
        serialNumber: m.id,
        webServiceURL: baseUrl + '/api/wallet',
        authenticationToken: computePassAuthToken(m.id),
        organizationName: APPLE_ORG_NAME,
        description: 'Membresía ' + m.plan_name + ' · Casa Shé',
        logoText: 'Casa Shé',
        storeCard: {
            headerFields: [{ key: 'plan_badge', label: 'PLAN', value: m.plan_name.toUpperCase() }],
            primaryFields: [],
            secondaryFields: [
                { key: 'member_name', label: 'NOMBRE', value: m.user_name },
                { key: 'classes', label: 'CLASES', value: formatClassesRemaining(m.classes_remaining), changeMessage: 'Casa Shé: %@ clases disponibles 🧘' },
                { key: 'valid_until', label: 'VENCE', value: formatDate(endDate) }
            ],
            auxiliaryFields: [
                { key: 'points', label: 'PUNTOS', value: m.loyalty_points + ' pts' },
                ...(m.next_event ? [{ key: 'next_event', label: 'PRÓXIMO EVENTO', value: m.next_event.title }] : []),
            ],
            backFields: [
                ...(m.next_event ? [{
                    key: 'event_details',
                    label: 'Tu próximo evento',
                    value: `${m.next_event.title}\n${formatDate(m.next_event.date)} • ${m.next_event.start_time.substring(0, 5)}\n${m.next_event.location}`,
                }] : []),
                { key: 'member_since', label: 'Miembro desde', value: formatDate(m.member_since) },
                { key: 'classes_used', label: 'Clases tomadas', value: m.classes_used + ' clases' },
                ...(m.referral_code ? [{ key: 'referral', label: 'Tu codigo de referido', value: `${m.referral_code} — Comparte con tus amigas y gana puntos` }] : []),
                { key: 'contact', label: 'Contacto', value: 'Casa Shé\nAlfonso Reyes 131, Condesa, CDMX\n\nInstagram: @casashe.mx\ncasashecondesa@gmail.com' },
                { key: 'website', label: 'Reserva en', value: 'casashe.mx' },
                { key: 'terms', label: 'Terminos', value: `Membresia personal e intransferible.\nCancelaciones: minimo ${cancelInfo.minHours} hora${cancelInfo.minHours === 1 ? '' : 's'} antes.\nMaximo ${cancelInfo.maxCancel} cancelaciones por membresia.` }
            ]
        },
        backgroundColor: style.backgroundColor,
        foregroundColor: style.foregroundColor,
        labelColor: style.labelColor,
        barcodes: [{ format: 'PKBarcodeFormatQR', message: m.id, messageEncoding: 'iso-8859-1' }],
        expirationDate: hasFutureEndDate ? new Date(endDate!.getTime() + 86400000).toISOString() : undefined,
        // relevantDate makes the pass appear on lock screen near the time
        ...(() => {
            let eventDateStr: string | null = null;
            if (m.next_event) {
                // Normalize time to HH:MM format
                const timeParts = m.next_event.start_time.split(':');
                const normalizedTime = `${timeParts[0]}:${timeParts[1] || '00'}`;
                eventDateStr = `${m.next_event.date}T${normalizedTime}:00-06:00`;
            }
            const relevantDateStr = [m.next_class_date, eventDateStr]
                .filter(Boolean)
                .sort()[0] || null;
            return relevantDateStr ? { relevantDate: relevantDateStr } : {};
        })(),
        // Location-based: show pass when near the studio.
        // Lock-screen cerca de Casa Shé — Alfonso Reyes 131, Condesa, CDMX
        // (coordenadas aprox.; ajustar con BUSINESS_LATITUDE/LONGITUDE si se definen).
        locations: [
            {
                latitude: parseFloat(process.env.BUSINESS_LATITUDE || '19.4092'),
                longitude: parseFloat(process.env.BUSINESS_LONGITUDE || '-99.1782'),
                relevantText: '¡Prepárate para tu clase en Casa Shé!',
            },
        ],
    };
    fs.writeFileSync(path.join(dir, 'pass.json'), JSON.stringify(passJson, null, 2));
    const assetsDir = path.resolve(process.cwd(), 'wallet-assets');

    for (const img of ['icon.png', 'icon@2x.png', 'icon@3x.png', 'logo.png', 'logo@2x.png', 'logo@3x.png']) {
        const src = path.join(assetsDir, img);
        if (fs.existsSync(src)) fs.copyFileSync(src, path.join(dir, img));
    }

    const stripsDir = path.join(assetsDir, 'strips');
    const stripLevel = m.classes_remaining === null || m.classes_remaining === -1
        ? 6
        : Math.min(6, Math.max(0, Math.floor((m.classes_remaining / 10) * 6)));
    const stripBase = `strip-${style.stripPrefix}-${stripLevel}`;
    const stripFiles = [
        { src: path.join(stripsDir, `${stripBase}.png`), fallback: path.join(assetsDir, 'strip.png'), dest: 'strip.png' },
        { src: path.join(stripsDir, `${stripBase}@2x.png`), fallback: path.join(assetsDir, 'strip@2x.png'), dest: 'strip@2x.png' },
        { src: path.join(stripsDir, `${stripBase}@3x.png`), fallback: path.join(assetsDir, 'strip@3x.png'), dest: 'strip@3x.png' },
    ];
    for (const file of stripFiles) {
        const src = fs.existsSync(file.src) ? file.src : file.fallback;
        if (fs.existsSync(src)) fs.copyFileSync(src, path.join(dir, file.dest));
    }

    console.log('[APPLE] Modelo: ' + dir);
    return dir;
}

export async function buildApplePassBuffer(membershipId: string): Promise<Buffer> {
    console.log('[APPLE] Generando pase para:', membershipId);
    const m = await getMembershipData(membershipId);
    if (!m) throw new Error('Membresia no encontrada: ' + membershipId);
    if (!WALLET_ELIGIBLE_STATUSES.has(m.status)) throw new Error('Membresia no elegible para wallet: ' + m.status);
    if (!APPLE_TEAM_ID || !APPLE_PASS_TYPE_ID) throw new Error('Faltan APPLE_TEAM_ID o APPLE_PASS_TYPE_ID');
    const planType = getPlanType(m.plan_name);
    const style = PLAN_STYLES[planType];
    const assetsDir = path.resolve(process.cwd(), 'wallet-assets');
    const certPath = process.env.APPLE_PASS_CERT || path.join(assetsDir, 'pass.pem');
    const keyPath = process.env.APPLE_PASS_KEY || path.join(assetsDir, 'pass.key');
    const wwdrPath = process.env.APPLE_WWDR || path.join(assetsDir, 'wwdr.pem');
    // Preferir el CONTENIDO en env (base64) para no depender de las llaves en el
    // repo; si la env no está, se cae al archivo en wallet-assets/ (compatibilidad).
    const fromB64 = (v?: string): string | null => (v ? Buffer.from(v, 'base64').toString('utf8') : null);
    const signerCert = fromB64(process.env.APPLE_PASS_CERT_BASE64) ?? readPemFile(certPath);
    const signerKey = fromB64(process.env.APPLE_PASS_KEY_BASE64)
        ?? fs.readFileSync(path.isAbsolute(keyPath) ? keyPath : path.resolve(process.cwd(), keyPath), 'utf8');
    const wwdr = fromB64(process.env.APPLE_WWDR_BASE64) ?? readPemFile(wwdrPath);
    const cancelPol = await queryOne<{ value: { min_hours?: number; cancellations_per_membership?: number } }>(
        "SELECT value FROM system_settings WHERE key = 'cancellation_policy'"
    );
    const cancelInfo = {
        minHours: Number(cancelPol?.value?.min_hours ?? 12),
        maxCancel: Number(cancelPol?.value?.cancellations_per_membership ?? 2),
    };
    const modelDir = buildTempModelDir(m, style, cancelInfo);
    const buffers: { [key: string]: Buffer } = {};
    for (const file of fs.readdirSync(modelDir)) {
        const fp = path.join(modelDir, file);
        if (fs.statSync(fp).isFile()) buffers[file] = fs.readFileSync(fp);
    }
    const passJsonData = JSON.parse(buffers['pass.json'].toString('utf8'));
    const pass = new PKPass(buffers, { wwdr, signerCert, signerKey, signerKeyPassphrase: process.env.APPLE_CERT_PASSWORD || undefined }, {
        serialNumber: m.id, passTypeIdentifier: APPLE_PASS_TYPE_ID, teamIdentifier: APPLE_TEAM_ID,
        organizationName: APPLE_ORG_NAME, description: passJsonData.description,
        backgroundColor: passJsonData.backgroundColor, foregroundColor: passJsonData.foregroundColor, labelColor: passJsonData.labelColor,
        webServiceURL: passJsonData.webServiceURL, authenticationToken: passJsonData.authenticationToken
    });
    if (!pass.type) {
        pass.type = 'storeCard';
        const sc = passJsonData.storeCard;
        if (sc.headerFields) pass.headerFields.push(...sc.headerFields);
        if (sc.primaryFields) pass.primaryFields.push(...sc.primaryFields);
        if (sc.secondaryFields) pass.secondaryFields.push(...sc.secondaryFields);
        if (sc.auxiliaryFields) pass.auxiliaryFields.push(...sc.auxiliaryFields);
        if (sc.backFields) pass.backFields.push(...sc.backFields);
    }
    if (passJsonData.barcodes) pass.setBarcodes(...passJsonData.barcodes);
    if (passJsonData.expirationDate) pass.setExpirationDate(new Date(passJsonData.expirationDate));
    const buffer = pass.getAsBuffer();
    try { fs.rmSync(modelDir, { recursive: true, force: true }); } catch (e) { }
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw new Error('El .pkpass resulto vacio');
    console.log('[APPLE] Pase generado (' + buffer.length + ' bytes) para: ' + m.user_name);
    return buffer;
}

export async function onClassAttended(membershipId: string): Promise<void> {
    const m = await getMembershipData(membershipId);
    if (m) {
        await notifyAllUserDevices(m.user_id, '🧘 ¡Clase completada!', `Ganaste 1 punto. Total: ${m.loyalty_points} pts`);
    }
}

export async function onPointsEarned(membershipId: string, points?: number): Promise<void> {
    const m = await getMembershipData(membershipId);
    if (m) {
        await notifyAllUserDevices(m.user_id, '⭐ ¡Puntos actualizados!', `Ahora tienes ${m.loyalty_points} pts`);
    }
}

export async function onMembershipRenewed(membershipId: string): Promise<void> {
    const m = await getMembershipData(membershipId);
    if (m) {
        await notifyAllUserDevices(m.user_id, '🎉 ¡Membresía activada!', `${m.plan_name} - ${formatClassesRemaining(m.classes_remaining)}`);
    } else {
        await recordPassUpdate(membershipId, null, null);
        await notifyAllDevices(membershipId, '🎉 ¡Membresía activada!', 'Tu pase se actualizó');
    }
}

export async function checkAppleWalletConfig(): Promise<{ configured: boolean; teamId: string | null; passTypeId: string | null; hasAuthToken: boolean; hasAPNsKey: boolean; hasKeyId: boolean; hasCertificates: boolean; canSendPush: boolean; error?: string; }> {
    const result = { configured: false, teamId: null as string | null, passTypeId: null as string | null, hasAuthToken: false, hasAPNsKey: false, hasKeyId: false, hasCertificates: false, canSendPush: false, error: undefined as string | undefined };
    try {
        result.teamId = APPLE_TEAM_ID || null;
        result.passTypeId = APPLE_PASS_TYPE_ID || null;
        result.hasAuthToken = !!APPLE_AUTH_TOKEN;
        result.hasAPNsKey = !!APPLE_APNS_KEY_BASE64;
        result.hasKeyId = !!APPLE_KEY_ID;
        const assetsDir = path.resolve(process.cwd(), 'wallet-assets');
        result.hasCertificates = fs.existsSync(path.join(assetsDir, 'pass.pem')) && fs.existsSync(path.join(assetsDir, 'pass.key')) && fs.existsSync(path.join(assetsDir, 'wwdr.pem'));
        result.configured = !!(result.teamId && result.passTypeId && result.hasAuthToken && result.hasCertificates);
        result.canSendPush = !!(result.teamId && result.hasAPNsKey && result.hasKeyId);
    } catch (error) { result.error = String(error); }
    return result;
}

export default { getMembershipData, buildApplePassBuffer, sendAPNsPushNotification, sendAPNsAlertNotification, registerDevice, unregisterDevice, getDevicesForMembership, getSerialsForDevice, notifyAllDevices, recordPassUpdate, getLastUpdate, getUpdatedPassesSince, verifyAuthToken, onClassAttended, onPointsEarned, onMembershipRenewed, checkAppleWalletConfig };
