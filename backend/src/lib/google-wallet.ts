/**
 * Google Wallet Integration for Catarsis Studio
 * 
 * Implements OAuth2, Loyalty Class/Object creation, and messaging
 * Adapted for Pilates studio with memberships, classes, and loyalty points
 */

import jwt from 'jsonwebtoken';
import { query, queryOne } from '../config/database.js';

// ============================================
// Types
// ============================================

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
    next_event?: {
        title: string;
        date: string;
        start_time: string;
        location: string;
    } | null;
}

interface GoogleCredentials {
    issuerId: string;
    email: string;
    privateKey: string;
}

type PlanType = 'basico' | 'premium' | 'ilimitado' | 'intro';

// ============================================
// Configuration
// ============================================

const GOOGLE_WALLET_API = 'https://walletobjects.googleapis.com/walletobjects/v1';
const GOOGLE_OAUTH_URL = 'https://oauth2.googleapis.com/token';

// Estilos por tier — paleta BMB Studio (dorado golden-hour). Google auto-contrasta
// el texto según el fondo. Progresión: crema → dorado → dorado profundo.
const PLAN_STYLES: Record<PlanType, {
    hexBackgroundColor: string;
    badge: string;
    programName: string;
}> = {
    basico: {
        hexBackgroundColor: '#ECE1CE',  // crema
        badge: 'MEMBER',
        programName: 'Membresía',
    },
    premium: {
        hexBackgroundColor: '#CE9B25',  // dorado
        badge: 'PREMIUM',
        programName: 'Membresía Premium',
    },
    ilimitado: {
        hexBackgroundColor: '#AD6C20',  // dorado profundo
        badge: 'UNLIMITED',
        programName: 'Membresía Ilimitada',
    },
    intro: {
        hexBackgroundColor: '#ECE1CE',  // crema
        badge: 'INTRO',
        programName: 'Clase de Prueba',
    },
};

const WALLET_ELIGIBLE_STATUSES = new Set([
    'active',
    'pending_activation',
    'pending_payment',
    'paused',
    'expired',
]);

// ============================================
// Helper Functions
// ============================================

function getPlanType(planName: string): PlanType {
    const lower = planName.toLowerCase();

    if (lower.includes('premium') || lower.includes('vip') || lower.includes('gold')) {
        return 'premium';
    }
    if (lower.includes('ilimitado') || lower.includes('unlimited') || lower.includes('libre')) {
        return 'ilimitado';
    }
    if (lower.includes('intro') || lower.includes('prueba') || lower.includes('trial')) {
        return 'intro';
    }
    return 'basico';
}

function formatDate(date: Date | string | null | undefined): string {
    if (!date) return '—';
    const parsed = new Date(date);
    if (Number.isNaN(parsed.getTime())) return '—';
    return parsed.toLocaleDateString('es-MX', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    });
}

function formatClassesRemaining(classes: number | null): string {
    if (classes === null || classes === -1) {
        return '∞';
    }
    return String(classes);
}

function parseValidDate(value: Date | string | null | undefined): Date | null {
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

// ============================================
// Credential Loading
// ============================================

let cachedCredentials: GoogleCredentials | null = null;
let cachedAccessToken: { token: string; expiresAt: number } | null = null;

function getCredentials(): GoogleCredentials {
    if (cachedCredentials) return cachedCredentials;

    const issuerId = process.env.GOOGLE_ISSUER_ID;
    const email = process.env.GOOGLE_SA_EMAIL;
    let privateKey = process.env.GOOGLE_SA_PRIVATE_KEY;

    if (!issuerId || !email || !privateKey) {
        throw new Error(
            'Missing Google Wallet configuration. Set:\n' +
            '- GOOGLE_ISSUER_ID\n' +
            '- GOOGLE_SA_EMAIL\n' +
            '- GOOGLE_SA_PRIVATE_KEY'
        );
    }

    // Handle escaped newlines in private key
    privateKey = privateKey.replace(/\\n/g, '\n');

    cachedCredentials = { issuerId, email, privateKey };
    return cachedCredentials;
}

// ============================================
// OAuth2 Authentication
// ============================================

/**
 * Get OAuth2 access token for Google Wallet API
 */
export async function getGoogleWalletAccessToken(): Promise<string> {
    // Return cached token if still valid
    if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 60000) {
        return cachedAccessToken.token;
    }

    const creds = getCredentials();
    const now = Math.floor(Date.now() / 1000);

    // Create JWT assertion
    const assertion = jwt.sign(
        {
            iss: creds.email,
            scope: 'https://www.googleapis.com/auth/wallet_object.issuer',
            aud: GOOGLE_OAUTH_URL,
            iat: now,
            exp: now + 3600,
        },
        creds.privateKey,
        { algorithm: 'RS256' }
    );

    // Exchange for access token
    const response = await fetch(GOOGLE_OAUTH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            assertion,
        }),
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to get Google access token: ${error}`);
    }

    const data = await response.json() as { access_token: string; expires_in: number };

    cachedAccessToken = {
        token: data.access_token,
        expiresAt: Date.now() + (data.expires_in * 1000),
    };

    return data.access_token;
}

// ============================================
// Database Queries
// ============================================

async function getMembershipData(membershipId: string): Promise<MembershipData | null> {
    return await queryOne<MembershipData>(`
        SELECT 
            m.id,
            m.user_id,
            m.plan_id,
            p.name as plan_name,
            p.features as plan_features,
            u.display_name as user_name,
            u.email as user_email,
            u.phone as user_phone,
            m.classes_remaining,
            COALESCE((
                SELECT COUNT(*) FROM bookings b 
                WHERE b.membership_id = m.id AND b.status = 'checked_in'
            ), 0)::int as classes_used,
            COALESCE((
                SELECT SUM(points) FROM loyalty_points lp WHERE lp.user_id = m.user_id
            ), 0)::int as loyalty_points,
            m.start_date,
            m.end_date,
            m.status,
            u.created_at as member_since
        FROM memberships m
        JOIN users u ON m.user_id = u.id
        JOIN plans p ON m.plan_id = p.id
        WHERE m.id = $1
    `, [membershipId]);
}

// ============================================
// Loyalty Class Management
// ============================================

/**
 * Create a Loyalty Class for a specific plan type
 */
export async function createGoogleLoyaltyClass(
    planType: PlanType = 'basico'
): Promise<{ success: boolean; classId: string; error?: string }> {
    try {
        const creds = getCredentials();
        const token = await getGoogleWalletAccessToken();
        const style = PLAN_STYLES[planType];

        const classId = `${creds.issuerId}.catarsis_membership_${planType}_v1`;
        const frontendUrl = process.env.FRONTEND_URL || 'https://www.bmbstudio.com.mx';
        let baseUrl = process.env.BASE_URL || 'https://valiant-imagination-production-0462.up.railway.app';
        if (!baseUrl.startsWith('http')) baseUrl = 'https://' + baseUrl;

        // Logo BMB servido desde el frontend (existe en public/).
        const logoUrl = `${frontendUrl}/bmb-studio-logo-dark.png`;

        const loyaltyClass = {
            id: classId,
            issuerName: 'BMB Studio',
            programName: style.programName,
            hexBackgroundColor: style.hexBackgroundColor,

            programLogo: {
                sourceUri: { uri: logoUrl },
                contentDescription: { defaultValue: { language: 'es', value: 'Logo de BMB Studio' } },
            },

            localizedIssuerName: {
                defaultValue: { language: 'es', value: 'BMB Studio' },
            },

            localizedProgramName: {
                defaultValue: { language: 'es', value: style.programName },
            },

            // Country code required for discoverableProgram
            countryCode: 'MX',

            // Welcome message
            discoverableProgram: {
                merchantSignupInfo: {
                    signupWebsite: { uri: frontendUrl },
                },
                merchantSigninInfo: {
                    signinWebsite: { uri: `${frontendUrl}/auth/login` },
                },
            },

            // Welcome messages
            messages: [
                {
                    header: '¡Bienvenido a BMB Studio!',
                    body: 'Tu bienestar comienza aquí. Reserva tus clases y acumula puntos con cada visita. 🧘‍♀️',
                    id: 'welcome_msg_v1',
                },
            ],

            // Business location for geofencing
            locations: getBusinessLocations(),

            // Review status
            reviewStatus: 'UNDER_REVIEW',

            // Allow multiple devices
            multipleDevicesAndHoldersAllowedStatus: 'MULTIPLE_HOLDERS',

            // Callback URL for updates
            callbackOptions: {
                url: `${baseUrl}/api/wallet/google/callback`,
            },
        };

        // Try to create, or update if exists
        let response = await fetch(`${GOOGLE_WALLET_API}/loyaltyClass`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(loyaltyClass),
        });

        if (response.status === 409) {
            // Class exists, update it
            response = await fetch(`${GOOGLE_WALLET_API}/loyaltyClass/${classId}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(loyaltyClass),
            });
        }

        if (!response.ok) {
            const error = await response.text();
            console.error('Failed to create/update loyalty class:', error);
            return { success: false, classId, error };
        }

        console.log(`✅ Google Loyalty Class created/updated: ${classId}`);
        return { success: true, classId };

    } catch (error) {
        console.error('Error creating Google Loyalty Class:', error);
        return { success: false, classId: '', error: String(error) };
    }
}

/**
 * Create all loyalty classes for each plan type
 */
export async function createAllLoyaltyClasses(): Promise<void> {
    const planTypes: PlanType[] = ['basico', 'premium', 'ilimitado', 'intro'];

    for (const planType of planTypes) {
        await createGoogleLoyaltyClass(planType);
    }

    console.log('✅ All Google Loyalty Classes created');
}

function getBusinessLocations(): Array<{ latitude: number; longitude: number }> {
    const lat = parseFloat(process.env.BUSINESS_LATITUDE || '0');
    const lng = parseFloat(process.env.BUSINESS_LONGITUDE || '0');

    if (lat === 0 && lng === 0) return [];

    return [{ latitude: lat, longitude: lng }];
}

// ============================================
// Loyalty Object Management
// ============================================

/**
 * Create or update a Loyalty Object (the actual pass)
 */
export async function upsertGoogleLoyaltyObject(
    membershipId: string
): Promise<{ success: boolean; objectId: string; error?: string }> {
    try {
        const creds = getCredentials();
        const token = await getGoogleWalletAccessToken();

        const membership = await getMembershipData(membershipId);
        if (!membership) {
            return { success: false, objectId: '', error: 'Membership not found' };
        }

        const planType = getPlanType(membership.plan_name);
        const style = PLAN_STYLES[planType];

        const objectId = `${creds.issuerId}.${membership.id}_v1`;
        const classId = `${creds.issuerId}.catarsis_membership_${planType}_v1`;
        const frontendUrl = process.env.FRONTEND_URL || 'https://www.bmbstudio.com.mx';

        const startDate = parseValidDate(membership.start_date);
        const endDate = parseValidDate(membership.end_date);
        const daysRemainingText = endDate
            ? `${Math.max(0, Math.ceil((endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))} días`
            : 'Sin vencimiento';

        const loyaltyObject: Record<string, unknown> = {
            id: objectId,
            classId: classId,
            state: membership.status === 'active' ? 'active' : 'inactive',

            // Account info
            accountId: membership.id,
            accountName: membership.user_name,

            // Barcode for check-in
            barcode: {
                type: 'QR_CODE',
                value: membership.id,
                alternateText: membership.id.substring(0, 8).toUpperCase(),
            },

            // Points display
            loyaltyPoints: {
                balance: { int: membership.loyalty_points },
                label: 'PUNTOS',
            },

            secondaryLoyaltyPoints: {
                balance: {
                    string: formatClassesRemaining(membership.classes_remaining)
                },
                label: 'CLASES',
            },

            // Custom text fields
            textModulesData: [
                {
                    id: 'member_name',
                    header: 'MIEMBRO',
                    body: membership.user_name,
                },
                {
                    id: 'plan_type',
                    header: 'PLAN',
                    body: `${membership.plan_name} (${style.badge})`,
                },
                {
                    id: 'classes_used',
                    header: 'CLASES TOMADAS',
                    body: `${membership.classes_used} clases`,
                },
                {
                    id: 'days_remaining',
                    header: 'DÍAS RESTANTES',
                    body: daysRemainingText,
                },
                {
                    id: 'valid_until',
                    header: 'VÁLIDO HASTA',
                    body: formatDate(membership.end_date),
                },
                {
                    id: 'member_since',
                    header: 'MIEMBRO DESDE',
                    body: formatDate(membership.member_since),
                },
                ...(membership.next_event ? [{
                    id: 'next_event',
                    header: 'PRÓXIMO EVENTO',
                    body: `${membership.next_event.title}\n${formatDate(membership.next_event.date)} • ${membership.next_event.start_time}\n${membership.next_event.location}`,
                }] : []),
            ],

            // Image module removed - optional and images not available
            // imageModulesData: [...],

            // Links
            linksModuleData: {
                uris: [
                    {
                        uri: `${frontendUrl}/client/dashboard`,
                        description: 'Ver mi cuenta',
                        id: 'dashboard_link',
                    },
                    {
                        uri: `${frontendUrl}/client/schedule`,
                        description: 'Reservar clase',
                        id: 'schedule_link',
                    },
                    {
                        uri: `${frontendUrl}/client/rewards`,
                        description: 'Ver recompensas',
                        id: 'rewards_link',
                    },
                ],
            },

            // Locations
            locations: getBusinessLocations(),

            hexBackgroundColor: style.hexBackgroundColor,
        };

        if (startDate && endDate && endDate.getTime() > Date.now()) {
            loyaltyObject.validTimeInterval = {
                start: { date: startDate.toISOString() },
                end: { date: endDate.toISOString() },
            };
        }

        // Try to get existing object
        let response = await fetch(`${GOOGLE_WALLET_API}/loyaltyObject/${objectId}`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` },
        });

        if (response.status === 404) {
            // Create new object
            response = await fetch(`${GOOGLE_WALLET_API}/loyaltyObject`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(loyaltyObject),
            });
        } else {
            // Update existing object
            response = await fetch(`${GOOGLE_WALLET_API}/loyaltyObject/${objectId}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(loyaltyObject),
            });
        }

        if (!response.ok) {
            const error = await response.text();
            console.error('Failed to upsert loyalty object:', error);
            return { success: false, objectId, error };
        }

        console.log(`✅ Google Loyalty Object upserted: ${objectId}`);
        console.log(`   Member: ${membership.user_name}`);
        console.log(`   Plan: ${membership.plan_name}`);
        console.log(`   Classes: ${formatClassesRemaining(membership.classes_remaining)}`);

        return { success: true, objectId };

    } catch (error) {
        console.error('Error upserting Google Loyalty Object:', error);
        return { success: false, objectId: '', error: String(error) };
    }
}

// ============================================
// Save URL Generation
// ============================================

/**
 * Build a "Save to Google Wallet" URL
 */
export async function buildGoogleSaveUrl(membershipId: string): Promise<string> {
    const membership = await getMembershipData(membershipId);

    if (!membership) {
        throw new Error(`Membership not found: ${membershipId}`);
    }

    if (!WALLET_ELIGIBLE_STATUSES.has(membership.status)) {
        throw new Error(`Membership is not eligible for wallet: ${membership.status}`);
    }

    const planType = getPlanType(membership.plan_name);

    // Ensure class exists
    await createGoogleLoyaltyClass(planType);

    // Upsert object
    await upsertGoogleLoyaltyObject(membershipId);

    const creds = getCredentials();
    const objectId = `${creds.issuerId}.${membership.id}_v1`;

    // Create JWT for save URL
    const claims = {
        iss: creds.email,
        aud: 'google',
        origins: [process.env.FRONTEND_URL || 'https://www.bmbstudio.com.mx'],
        typ: 'savetowallet',
        payload: {
            loyaltyObjects: [{ id: objectId }],
        },
    };

    const token = jwt.sign(claims, creds.privateKey, { algorithm: 'RS256' });

    return `https://pay.google.com/gp/v/save/${token}`;
}

// ============================================
// Messaging
// ============================================

/**
 * Send a message to a loyalty object (visible in Google Wallet)
 */
export async function sendGoogleWalletMessage(params: {
    membershipId: string;
    title: string;
    body: string;
}): Promise<boolean> {
    try {
        const creds = getCredentials();
        const token = await getGoogleWalletAccessToken();
        const objectId = `${creds.issuerId}.${params.membershipId}_v1`;

        const messageId = `msg_${Date.now()}_${Math.random().toString(36).substring(7)}`;
        const now = new Date();
        const end = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours

        const message = {
            message: {
                header: params.title,
                body: params.body,
                id: messageId,
                messageType: 'TEXT',
                displayInterval: {
                    start: { date: now.toISOString() },
                    end: { date: end.toISOString() },
                },
            },
        };

        const response = await fetch(
            `${GOOGLE_WALLET_API}/loyaltyObject/${objectId}/addMessage`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(message),
            }
        );

        if (!response.ok) {
            const error = await response.text();
            console.error('Failed to send Google Wallet message:', error);
            return false;
        }

        console.log(`✅ Google Wallet message sent to ${params.membershipId.substring(0, 8)}...`);
        return true;

    } catch (error) {
        console.error('Error sending Google Wallet message:', error);
        return false;
    }
}

// ============================================
// Diagnostics
// ============================================

/**
 * Check Google Wallet configuration status
 */
export async function checkGoogleWalletConfig(): Promise<{
    configured: boolean;
    issuerId: string | null;
    email: string | null;
    hasPrivateKey: boolean;
    canAuthenticate: boolean;
    error?: string;
}> {
    const result = {
        configured: false,
        issuerId: null as string | null,
        email: null as string | null,
        hasPrivateKey: false,
        canAuthenticate: false,
        error: undefined as string | undefined,
    };

    try {
        const creds = getCredentials();
        result.issuerId = creds.issuerId;
        result.email = creds.email;
        result.hasPrivateKey = !!creds.privateKey;
        result.configured = true;

        // Try to get access token
        await getGoogleWalletAccessToken();
        result.canAuthenticate = true;

    } catch (error) {
        result.error = String(error);
    }

    return result;
}

// ============================================
// High-Level Functions for App Integration
// ============================================

/**
 * Called when a class is attended
 */
export async function onClassAttended(membershipId: string): Promise<void> {
    await upsertGoogleLoyaltyObject(membershipId);
    console.log(`✅ Google pass updated after class attendance`);
}

/**
 * Called when points are earned
 */
export async function onPointsEarned(membershipId: string, points: number): Promise<void> {
    await upsertGoogleLoyaltyObject(membershipId);
    await sendGoogleWalletMessage({
        membershipId,
        title: '¡Puntos ganados! ⭐',
        body: `Ganaste ${points} puntos. ¡Sigue acumulando!`,
    });
}

/**
 * Called when membership is renewed
 */
export async function onMembershipRenewed(membershipId: string): Promise<void> {
    await upsertGoogleLoyaltyObject(membershipId);
    await sendGoogleWalletMessage({
        membershipId,
        title: '¡Membresía renovada! 🎉',
        body: 'Tu membresía ha sido renovada exitosamente.',
    });
}

/**
 * Send message to ALL active Google Wallet objects (for event announcements)
 */
export async function sendMessageToAllGoogleObjects(title: string, body: string): Promise<number> {
    try {
        const memberships = await query<{ id: string }>(`
            SELECT m.id FROM memberships m WHERE m.status = 'active'
        `);
        let count = 0;
        for (const m of memberships) {
            try {
                await sendGoogleWalletMessage({ membershipId: m.id, title, body });
                count++;
            } catch { /* skip individual failures */ }
            if (memberships.length > 10) await new Promise(r => setTimeout(r, 150));
        }
        console.log(`[Google Wallet] Message sent to ${count}/${memberships.length} objects`);
        return count;
    } catch (error) {
        console.error('[Google Wallet] sendMessageToAllGoogleObjects error:', error);
        return 0;
    }
}

export default {
    getGoogleWalletAccessToken,
    createGoogleLoyaltyClass,
    createAllLoyaltyClasses,
    upsertGoogleLoyaltyObject,
    buildGoogleSaveUrl,
    sendGoogleWalletMessage,
    sendMessageToAllGoogleObjects,
    checkGoogleWalletConfig,
    onClassAttended,
    onPointsEarned,
    onMembershipRenewed,
};
