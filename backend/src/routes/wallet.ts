import { Router, Request, Response } from 'express';
import { authenticate, requireRole } from '../middleware/auth.js';
import { query, queryOne } from '../config/database.js';
import { createHash } from 'crypto';

// Import wallet libraries
import { 
    buildApplePassBuffer, 
    registerDevice, 
    unregisterDevice, 
    getUpdatedPassesSince,
    getSerialsForDevice,
    getLastUpdate,
    getMembershipData,
    verifyAuthToken, 
    getDevicesForMembership,
    checkAppleWalletConfig,
    notifyAllDevices,
    recordPassUpdate
} from '../lib/apple-wallet.js';
import { 
    buildGoogleSaveUrl, 
    createGoogleLoyaltyClass, 
    createAllLoyaltyClasses, 
    checkGoogleWalletConfig,
    upsertGoogleLoyaltyObject
} from '../lib/google-wallet.js';
import { 
    sendCustomNotification, 
    getNotificationHistory 
} from '../lib/notifications.js';

const router = Router();
const APPLE_AUTH_TOKEN = process.env.APPLE_AUTH_TOKEN;

// Store temporal download tokens (in production use Redis)
const downloadTokens = new Map<string, { membershipId: string; expiresAt: number }>();

type WalletMembership = {
    id: string;
    end_date: string | null;
    start_date: string | null;
    classes_remaining: number | null;
    plan_name: string;
    status: string;
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

const buildQrPayload = (userId: string, membershipId?: string | null) => {
    const secret = process.env.CHECKIN_SECRET || 'walletclub-dev';
    const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60 * 24;
    const hashSource = `${userId}:${membershipId || 'none'}:${expiresAt}:${secret}`;
    const hash = createHash('sha256').update(hashSource).digest('hex');
    const payload = {
        t: 'checkin',
        m: userId,
        ms: membershipId || null,
        e: expiresAt,
        h: hash,
    };
    return Buffer.from(JSON.stringify(payload)).toString('base64url');
};

// Build QR payload for event check-in
export const buildEventQrPayload = (userId: string, eventId: string, regId: string) => {
    const secret = process.env.CHECKIN_SECRET || 'walletclub-dev';
    const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30; // 30 days
    const hashSource = `event:${userId}:${eventId}:${regId}:${expiresAt}:${secret}`;
    const hash = createHash('sha256').update(hashSource).digest('hex');
    const payload = {
        t: 'event_checkin',
        u: userId,
        ev: eventId,
        r: regId,
        e: expiresAt,
        h: hash,
    };
    return Buffer.from(JSON.stringify(payload)).toString('base64url');
};

// Generate a secure download token
const generateDownloadToken = (membershipId: string): string => {
    const token = createHash('sha256')
        .update(`${membershipId}:${Date.now()}:${Math.random()}`)
        .digest('hex')
        .substring(0, 32);
    
    // Token expires in 5 minutes
    downloadTokens.set(token, {
        membershipId,
        expiresAt: Date.now() + 5 * 60 * 1000
    });
    
    // Cleanup old tokens
    for (const [key, value] of downloadTokens.entries()) {
        if (value.expiresAt < Date.now()) {
            downloadTokens.delete(key);
        }
    }
    
    return token;
};

const findWalletMembershipForUser = async (userId: string) => {
    return queryOne<WalletMembership>(
        `SELECT m.id, m.end_date, m.start_date, m.classes_remaining, p.name as plan_name, m.status
         FROM memberships m
         JOIN plans p ON m.plan_id = p.id
         WHERE m.user_id = $1
           AND m.status IN ('active', 'pending_activation', 'pending_payment', 'paused', 'expired')
         ORDER BY
            CASE m.status
                WHEN 'active' THEN 0
                WHEN 'pending_activation' THEN 1
                WHEN 'pending_payment' THEN 2
                WHEN 'paused' THEN 3
                WHEN 'expired' THEN 4
                ELSE 5
            END,
            m.start_date DESC NULLS LAST,
            m.created_at DESC
         LIMIT 1`,
        [userId]
    );
};

// ============================================
// Public Download Endpoint (with token)
// ============================================

/**
 * GET /api/wallet/download/apple/:token
 * Public endpoint to download Apple Wallet pass with temporary token
 */
router.get('/download/apple/:token', async (req: Request, res: Response) => {
    try {
        const { token } = req.params;
        
        const tokenData = downloadTokens.get(token);
        if (!tokenData) {
            return res.status(401).json({ error: 'Token inválido o expirado' });
        }
        
        if (tokenData.expiresAt < Date.now()) {
            downloadTokens.delete(token);
            return res.status(401).json({ error: 'Token expirado' });
        }
        
        // Delete token after use (one-time use)
        downloadTokens.delete(token);
        
        const passBuffer = await buildApplePassBuffer(tokenData.membershipId);
        
        res.set({
            'Content-Type': 'application/vnd.apple.pkpass',
            'Content-Disposition': `attachment; filename="casa-she-pass.pkpass"`,
        });
        
        res.send(passBuffer);
        
    } catch (error) {
        console.error('Apple pass download error:', error);
        res.status(500).json({ error: 'Error al generar pase Apple Wallet' });
    }
});

// ============================================
// Public Pass Info Endpoint
// ============================================

/**
 * GET /api/wallet/pass
 * Get pass information for the authenticated user
 */
router.get('/pass', authenticate, requireRole('client'), async (req: Request, res: Response) => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            return res.status(401).json({ error: 'No autorizado' });
        }

        const user = await queryOne<{
            display_name: string;
            created_at: string;
            is_founder: boolean;
        }>(
            `SELECT display_name, created_at, is_founder FROM users WHERE id = $1`,
            [userId]
        );

        const membership = await findWalletMembershipForUser(userId);

        const pointsResult = await queryOne<{ total: string | number }>(
            `SELECT COALESCE(loyalty_points, 0) as total FROM users WHERE id = $1`,
            [userId]
        );
        const pointsBalance = Number(pointsResult?.total ?? 0);

        const walletPasses = await query<{ platform: string; serial_number: string }>(
            `SELECT platform, serial_number FROM wallet_passes WHERE user_id = $1`,
            [userId]
        );

        const canDownloadPass = membership
            ? WALLET_ELIGIBLE_STATUSES.has(membership.status)
            : false;

        res.json({
            memberName: user?.display_name || 'Miembro',
            memberSince: user?.created_at || null,
            isFounder: !!user?.is_founder,
            planName: membership?.plan_name || null,
            membershipStatus: membership?.status || null,
            membershipId: membership?.id || null,
            expirationDate: membership?.end_date || null,
            classesRemaining: membership?.classes_remaining ?? null,
            pointsBalance,
            qrPayload: buildQrPayload(userId, membership?.id),
            walletPasses,
            canDownloadPass,
        });
    } catch (error) {
        console.error('Wallet pass error:', error);
        res.status(500).json({ error: 'Error al obtener el pase' });
    }
});

// ============================================
// Apple Wallet Download Endpoints
// ============================================

/**
 * GET /api/wallet/apple/download/:membershipId
 * Download Apple Wallet pass for a membership
 */
router.get('/apple/download/:membershipId', authenticate, async (req: Request, res: Response) => {
    try {
        const { membershipId } = req.params;
        const userId = req.user?.userId;

        // Verify user owns this membership
        const membership = await queryOne<{ user_id: string }>(
            `SELECT user_id FROM memberships WHERE id = $1`,
            [membershipId]
        );

        if (!membership || membership.user_id !== userId) {
            return res.status(403).json({ error: 'No autorizado para este pase' });
        }

        const passBuffer = await buildApplePassBuffer(membershipId);

        res.set({
            'Content-Type': 'application/vnd.apple.pkpass',
            'Content-Disposition': `attachment; filename="casa-she-${membershipId.substring(0, 8)}.pkpass"`,
        });

        res.send(passBuffer);

    } catch (error) {
        console.error('Apple pass download error:', error);
        res.status(500).json({ error: 'Error al generar pase Apple Wallet' });
    }
});

/**
 * POST /api/wallet/pass/apple
 * Request Apple Wallet pass download URL
 */
router.post('/pass/apple', authenticate, requireRole('client'), async (req: Request, res: Response) => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            return res.status(401).json({ error: 'No autorizado' });
        }

        const membership = await findWalletMembershipForUser(userId);

        if (!membership) {
            return res.status(404).json({ error: 'No tienes una membresía disponible para generar pase' });
        }

        // Generate temporary download token
        const token = generateDownloadToken(membership.id);
        let baseUrl = process.env.BASE_URL || process.env.RAILWAY_PUBLIC_DOMAIN || 'localhost:3001';
        if (!baseUrl.startsWith('http')) baseUrl = 'https://' + baseUrl;
        const downloadUrl = `${baseUrl}/api/wallet/download/apple/${token}`;

        res.json({ downloadUrl, membershipId: membership.id });

    } catch (error) {
        console.error('Apple wallet pass error:', error);
        res.status(500).json({ error: 'Error al generar pase Apple Wallet' });
    }
});

// ============================================
// Google Wallet Endpoints
// ============================================

/**
 * POST /api/wallet/pass/google
 * Get Google Wallet save URL
 */
router.post('/pass/google', authenticate, requireRole('client'), async (req: Request, res: Response) => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            return res.status(401).json({ error: 'No autorizado' });
        }

        const membership = await findWalletMembershipForUser(userId);

        if (!membership) {
            return res.status(404).json({ error: 'No tienes una membresía disponible para generar pase' });
        }

        const saveUrl = await buildGoogleSaveUrl(membership.id);

        res.json({ saveUrl, membershipId: membership.id });

    } catch (error) {
        console.error('Google wallet pass error:', error);
        res.status(500).json({ error: 'Error al generar pase Google Wallet' });
    }
});

/**
 * POST /api/wallet/google/callback
 * Callback for Google Wallet events
 */
router.post('/google/callback', async (req: Request, res: Response) => {
    console.log('📱 Google Wallet callback:', JSON.stringify(req.body, null, 2));
    res.status(200).json({ received: true });
});

// ============================================
// Apple Wallet Web Service Protocol
// These endpoints are called by iOS when passes are added/updated
// Reference: https://developer.apple.com/documentation/walletpasses/adding-a-web-service-to-update-passes
// ============================================

/**
 * POST /api/wallet/v1/devices/:deviceId/registrations/:passTypeId/:serial
 * Register a device to receive push notifications for a pass
 */
router.post('/v1/devices/:deviceId/registrations/:passTypeId/:serial', async (req: Request, res: Response) => {
    try {
        const { deviceId, passTypeId, serial } = req.params;
        const authHeader = req.headers.authorization;

        console.log(`📱 Apple: Register device ${deviceId} for pass ${serial}`);

        // Verify auth token
        if (!verifyAuthToken(authHeader as string, serial)) {
            console.log('   ❌ Invalid auth token');
            return res.status(401).send('Unauthorized');
        }

        const pushToken = req.body.pushToken;
        if (!pushToken) {
            console.log('   ❌ No push token provided');
            return res.status(400).send('Missing pushToken');
        }

        await registerDevice(deviceId, pushToken, passTypeId, serial);

        console.log(`   ✅ Device registered`);
        res.status(201).send('Registered');

    } catch (error) {
        console.error('Device registration error:', error);
        res.status(500).send('Internal error');
    }
});

/**
 * GET /api/wallet/v1/devices/:deviceId/registrations/:passTypeId
 * Get serial numbers of passes that have been updated since a given tag
 */
router.get('/v1/devices/:deviceId/registrations/:passTypeId', async (req: Request, res: Response) => {
    try {
        const { deviceId, passTypeId } = req.params;
        const passesUpdatedSince = req.query.passesUpdatedSince as string | undefined;

        console.log(`📱 Apple: Check updates for device ${deviceId}`);
        console.log(`   Since: ${passesUpdatedSince || 'beginning'}`);

        // Parse date from query parameter (ISO string or epoch timestamp)
        let lastUpdated: Date;
        if (passesUpdatedSince) {
            const timestamp = parseInt(passesUpdatedSince, 10);
            if (!isNaN(timestamp)) {
                lastUpdated = new Date(timestamp * 1000); // Unix timestamp
            } else {
                lastUpdated = new Date(passesUpdatedSince); // ISO string
            }
        } else {
            lastUpdated = new Date(0); // Beginning of time
        }

        const serialNumbers = await getUpdatedPassesSince(deviceId, passTypeId, lastUpdated);

        if (serialNumbers.length === 0) {
            console.log('   No updates');
            return res.status(204).send();
        }

        console.log(`   Found ${serialNumbers.length} updated passes`);
        res.json({
            serialNumbers,
            lastUpdated: Math.floor(Date.now() / 1000).toString(),
        });

    } catch (error) {
        console.error('Check updates error:', error);
        res.status(500).send('Internal error');
    }
});

/**
 * GET /api/wallet/v1/passes/:passTypeId/:serial
 * Download the latest version of a pass
 */
router.get('/v1/passes/:passTypeId/:serial', async (req: Request, res: Response) => {
    try {
        const { serial } = req.params;
        const authHeader = req.headers.authorization;

        console.log(`📱 Apple: Download pass ${serial}`);

        // Verify auth token
        if (!verifyAuthToken(authHeader as string, serial)) {
            console.log('   ❌ Invalid auth token');
            return res.status(401).send('Unauthorized');
        }

        // serial is the membership_id
        const passBuffer = await buildApplePassBuffer(serial);

        res.set({
            'Content-Type': 'application/vnd.apple.pkpass',
            'Last-Modified': new Date().toUTCString(),
        });

        console.log(`   ✅ Pass sent`);
        res.send(passBuffer);

    } catch (error) {
        console.error('Pass download error:', error);
        res.status(500).send('Internal error');
    }
});

/**
 * DELETE /api/wallet/v1/devices/:deviceId/registrations/:passTypeId/:serial
 * Unregister a device
 */
router.delete('/v1/devices/:deviceId/registrations/:passTypeId/:serial', async (req: Request, res: Response) => {
    try {
        const { deviceId, passTypeId, serial } = req.params;
        const authHeader = req.headers.authorization;

        console.log(`📱 Apple: Unregister device ${deviceId} from pass ${serial}`);

        // Verify auth token
        if (!verifyAuthToken(authHeader as string, serial)) {
            console.log('   ❌ Invalid auth token');
            return res.status(401).send('Unauthorized');
        }

        await unregisterDevice(deviceId, passTypeId, serial);

        console.log(`   ✅ Device unregistered`);
        res.status(200).send('Unregistered');

    } catch (error) {
        console.error('Device unregister error:', error);
        res.status(500).send('Internal error');
    }
});

/**
 * POST /api/wallet/v1/log
 * Receive error logs from iOS
 */
router.post('/v1/log', (req: Request, res: Response) => {
    console.log('📱 Apple Wallet Log:', JSON.stringify(req.body, null, 2));
    res.status(200).send('Logged');
});

// ============================================
// Admin Endpoints
// ============================================

/**
 * POST /api/wallet/admin/refresh-passes
 * Rebuild wallet data for memberships to apply latest branding/palette
 */
router.post('/admin/refresh-passes', authenticate, requireRole('admin'), async (req: Request, res: Response) => {
    try {
        const requestedPlatforms = Array.isArray(req.body?.platforms)
            ? req.body.platforms.filter((p: unknown) => p === 'apple' || p === 'google')
            : ['apple', 'google'];

        if (requestedPlatforms.length === 0) {
            return res.status(400).json({ error: 'platforms must include apple and/or google' });
        }

        const membershipIdFilter = typeof req.body?.membershipId === 'string'
            ? req.body.membershipId.trim()
            : '';
        const activeOnly = req.body?.activeOnly !== false;
        const dryRun = req.body?.dryRun === true;
        const notifyAppleDevices = req.body?.notifyAppleDevices !== false;

        const rawLimit = Number(req.body?.limit);
        const limit = Number.isFinite(rawLimit) && rawLimit > 0
            ? Math.min(Math.floor(rawLimit), 500)
            : 100;

        const params: Array<string | number> = [];
        const where: string[] = [];

        if (membershipIdFilter) {
            params.push(membershipIdFilter);
            where.push(`m.id = $${params.length}`);
        }
        if (activeOnly) {
            params.push('active');
            where.push(`m.status = $${params.length}`);
        }

        params.push(limit);
        const queryText = `
            SELECT m.id, m.user_id, m.status
            FROM memberships m
            ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
            ORDER BY m.updated_at DESC NULLS LAST, m.created_at DESC
            LIMIT $${params.length}
        `;

        const memberships = await query<{ id: string; user_id: string; status: string }>(queryText, params);

        // Ensure Google classes exist before object upserts
        if (!dryRun && requestedPlatforms.includes('google')) {
            await createAllLoyaltyClasses();
        }

        const summary = {
            processed: 0,
            succeeded: 0,
            failed: 0,
            details: [] as Array<{
                membershipId: string;
                status: 'success' | 'failed' | 'dry-run';
                platforms: string[];
                appleDevicesNotified?: number;
                error?: string;
            }>,
        };

        for (const membership of memberships) {
            summary.processed += 1;
            let appleDevicesNotified = 0;

            try {
                for (const platform of requestedPlatforms) {
                    const existingPass = await queryOne<{ exists: number }>(
                        `SELECT 1 as exists
                         FROM wallet_passes
                         WHERE membership_id = $1 AND platform = $2
                         LIMIT 1`,
                        [membership.id, platform]
                    );

                    if (!existingPass) {
                        await query(
                            `INSERT INTO wallet_passes (
                                user_id, membership_id, platform, serial_number, pass_type_identifier, last_updated
                            ) VALUES ($1, $2, $3, $4, $5, NOW())`,
                            [
                                membership.user_id,
                                membership.id,
                                platform,
                                createHash('sha256').update(`${membership.id}:${platform}:${Date.now()}`).digest('hex').substring(0, 32),
                                platform === 'apple' ? process.env.APPLE_PASS_TYPE_IDENTIFIER || null : null,
                            ]
                        );
                    }

                    if (!dryRun) {
                        if (platform === 'apple') {
                            // Rebuild pass to validate generation with latest palette.
                            await buildApplePassBuffer(membership.id);
                            await recordPassUpdate(membership.id, null, null);
                            if (notifyAppleDevices) {
                                appleDevicesNotified = await notifyAllDevices(membership.id);
                            }
                        } else if (platform === 'google') {
                            const result = await upsertGoogleLoyaltyObject(membership.id);
                            if (!result.success) {
                                throw new Error(result.error || 'Google loyalty object upsert failed');
                            }
                        }
                    }

                    await query(
                        `UPDATE wallet_passes
                         SET last_updated = NOW()
                         WHERE membership_id = $1 AND platform = $2`,
                        [membership.id, platform]
                    );
                }

                summary.succeeded += 1;
                summary.details.push({
                    membershipId: membership.id,
                    status: dryRun ? 'dry-run' : 'success',
                    platforms: requestedPlatforms,
                    ...(requestedPlatforms.includes('apple') && !dryRun && notifyAppleDevices
                        ? { appleDevicesNotified }
                        : {}),
                });
            } catch (error) {
                summary.failed += 1;
                summary.details.push({
                    membershipId: membership.id,
                    status: 'failed',
                    platforms: requestedPlatforms,
                    error: String(error),
                });
            }
        }

        res.json({
            success: summary.failed === 0,
            dryRun,
            activeOnly,
            totalSelected: memberships.length,
            summary,
        });
    } catch (error) {
        console.error('Refresh wallet passes error:', error);
        res.status(500).json({ error: String(error) });
    }
});

/**
 * POST /api/wallet/admin/setup-google
 * Create all Google Wallet loyalty classes
 */
router.post('/admin/setup-google', authenticate, requireRole('admin'), async (req: Request, res: Response) => {
    try {
        await createAllLoyaltyClasses();
        res.json({ success: true, message: 'Google Wallet loyalty classes created' });
    } catch (error) {
        console.error('Google setup error:', error);
        res.status(500).json({ error: String(error) });
    }
});

/**
 * POST /api/wallet/admin/notify
 * Send custom notification to a membership
 */
router.post('/admin/notify', authenticate, requireRole('admin'), async (req: Request, res: Response) => {
    try {
        const { membershipId, title, message, sendApple, sendGoogle } = req.body;

        if (!membershipId || !title || !message) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const result = await sendCustomNotification({
            membershipId,
            title,
            message,
            sendApple: sendApple !== false,
            sendGoogle: sendGoogle !== false,
        });

        res.json({ success: true, result });

    } catch (error) {
        console.error('Notify error:', error);
        res.status(500).json({ error: String(error) });
    }
});

/**
 * GET /api/wallet/admin/notifications
 * Get notification history
 */
router.get('/admin/notifications', authenticate, requireRole('admin'), async (req: Request, res: Response) => {
    try {
        const membershipId = req.query.membershipId as string | undefined;
        const limit = parseInt(req.query.limit as string || '50', 10);

        const history = await getNotificationHistory(membershipId, limit);

        res.json({ notifications: history });

    } catch (error) {
        console.error('Get notifications error:', error);
        res.status(500).json({ error: String(error) });
    }
});

// ============================================
// Diagnostics Endpoints
// ============================================

/**
 * GET /api/wallet/google/diagnostics
 * Check Google Wallet configuration status
 */
router.get('/google/diagnostics', authenticate, requireRole('admin', 'super_admin'), async (req: Request, res: Response) => {
    try {
        const config = await checkGoogleWalletConfig();
        res.json(config);
    } catch (error) {
        res.json({
            configured: false,
            error: String(error),
        });
    }
});

/**
 * GET /api/wallet/apple/diagnostics
 * Check Apple Wallet configuration status
 */
router.get('/apple/diagnostics', authenticate, requireRole('admin', 'super_admin'), async (req: Request, res: Response) => {
    try {
        const config = await checkAppleWalletConfig();
        res.json(config);
    } catch (error) {
        res.json({
            configured: false,
            error: String(error),
        });
    }
});

/**
 * GET /api/wallet/diagnostics
 * Combined diagnostics for both platforms
 */
router.get('/diagnostics', authenticate, requireRole('admin', 'super_admin'), async (req: Request, res: Response) => {
    try {
        const [apple, google] = await Promise.all([
            checkAppleWalletConfig(),
            checkGoogleWalletConfig(),
        ]);

        res.json({
            apple,
            google,
            timestamp: new Date().toISOString(),
        });

    } catch (error) {
        res.status(500).json({ error: String(error) });
    }
});

/**
 * POST /api/wallet/test-push
 * Test push notification to a specific membership's Apple Wallet pass
 */
router.post('/test-push', authenticate, requireRole('admin', 'super_admin'), async (req: Request, res: Response) => {
    try {
        const { membershipId } = req.body;
        if (!membershipId) {
            return res.status(400).json({ error: 'membershipId requerido' });
        }

        // Record update so iOS fetches new pass
        await recordPassUpdate(membershipId, null, null);

        // Get membership data for the alert message
        const m = await getMembershipData(membershipId);
        const alertTitle = '✨ Casa Shé';
        const classesText = m?.classes_remaining === null ? 'Ilimitadas' : `${m?.classes_remaining ?? 0} clases`;
        const alertBody = m ? `${m.user_name}, tu pase se actualizó. ${m.loyalty_points} pts | ${classesText}` : 'Tu pase se actualizó';

        // Send silent push (update pass) + alert push (visible notification)
        const count = await notifyAllDevices(membershipId, alertTitle, alertBody);

        res.json({
            success: true,
            devicesNotified: count,
            message: count > 0 ? `Push enviada a ${count} dispositivo(s)` : 'No hay dispositivos registrados para este pase',
        });
    } catch (error) {
        console.error('Test push error:', error);
        res.status(500).json({ error: String(error) });
    }
});

/**
 * GET /api/wallet/google/setup
 * Create Google Wallet loyalty classes (temporary public endpoint)
 */
router.get('/google/setup', authenticate, requireRole('admin', 'super_admin'), async (req: Request, res: Response) => {
    try {
        console.log('[GOOGLE WALLET] Starting class setup...');
        await createAllLoyaltyClasses();
        res.json({ success: true, message: 'Google Wallet loyalty classes created/updated' });
    } catch (error) {
        console.error('[GOOGLE WALLET] Setup error:', error);
        res.status(500).json({ error: String(error) });
    }
});

export default router;
