import { Router, Request, Response } from 'express';
import { Readable } from 'stream';
import path from 'path';
import multer from 'multer';
import type { UploadApiOptions, UploadApiResponse } from 'cloudinary';
import { z } from 'zod';
import { pool, query, queryOne } from '../config/database.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import cloudinary, { generateSignedVideoUrl, generateThumbnailUrl } from '../lib/cloudinary.js';

const router = Router();

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 600 * 1024 * 1024,
    },
});

const isCloudinaryConfigured = Boolean(
    process.env.CLOUDINARY_CLOUD_NAME
    && process.env.CLOUDINARY_API_KEY
    && process.env.CLOUDINARY_API_SECRET
);

const isGoogleDriveConfigured = Boolean(
    process.env.GOOGLE_CLIENT_ID
    && process.env.GOOGLE_CLIENT_SECRET
    && process.env.GOOGLE_REFRESH_TOKEN
);

const BaseVideoSchema = z.object({
    title: z.string().min(1),
    description: z.string().max(4000).optional().nullable(),
    cloudinary_id: z.string().min(1).optional().nullable(),
    drive_file_id: z.string().min(1).optional().nullable(),
    category_id: z.string().uuid(),
    level: z.enum(['principiante', 'intermedio', 'avanzado', 'todos']),
    access_type: z.enum(['gratuito', 'miembros']),
    is_published: z.boolean().default(false),
    duration_seconds: z.coerce.number().int().min(0).optional(),
    thumbnail_url: z.string().url().optional().nullable(),
    thumbnail_drive_id: z.string().optional().nullable(),
    subtitle: z.string().max(160).optional().nullable(),
    tagline: z.string().max(200).optional().nullable(),
    days: z.string().max(200).optional().nullable(),
    brand_color: z.string().max(20).optional().nullable(),
    is_featured: z.boolean().optional().default(false),
    sales_enabled: z.boolean().optional().default(false),
    sales_unlocks_video: z.boolean().optional().default(false),
    sales_price_mxn: z.coerce.number().min(0).optional().nullable(),
    sales_class_credits: z.coerce.number().int().min(0).optional().nullable(),
    sales_cta_text: z.string().max(120).optional().nullable(),
});

const CreateVideoSchema = BaseVideoSchema.refine(
    (data) => Boolean(data.cloudinary_id || data.drive_file_id),
    {
        message: 'Debes subir un video primero',
        path: ['cloudinary_id'],
    }
).refine(
    (data) => !data.sales_enabled || (data.sales_price_mxn ?? 0) > 0,
    {
        message: 'Define un precio mayor a 0 para vender clases',
        path: ['sales_price_mxn'],
    }
);

const UpdateVideoSchema = BaseVideoSchema.partial().refine(
    (data) => data.sales_enabled !== true || (data.sales_price_mxn ?? 0) > 0,
    {
        message: 'Define un precio mayor a 0 para vender clases',
        path: ['sales_price_mxn'],
    }
);

const CreateVideoPurchaseSchema = z.object({
    notes: z.string().max(500).optional(),
});

const SubmitVideoPurchaseProofSchema = z.object({
    transfer_reference: z.string().max(120).optional(),
    transfer_date: z.string().optional().nullable(),
    notes: z.string().max(500).optional(),
    file_data: z.string().optional().nullable(),
    file_name: z.string().max(255).optional().nullable(),
    file_type: z.string().max(120).optional().nullable(),
});

const ReviewVideoPurchaseSchema = z.object({
    admin_notes: z.string().max(500).optional(),
});

function toSlug(value: string): string {
    return value
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)+/g, '');
}

function normalizeHexColor(value?: string | null): string | null {
    if (!value) return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    const withHash = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
    if (/^#[0-9A-Fa-f]{6}$/.test(withHash)) return withHash;
    return null;
}

function safeGenerateThumbnailUrl(publicId?: string | null): string | null {
    if (!publicId || !isCloudinaryConfigured) return null;
    try {
        return generateThumbnailUrl(publicId);
    } catch {
        return null;
    }
}

function safeGenerateSignedVideoUrl(publicId?: string | null): string | null {
    if (!publicId || !isCloudinaryConfigured) return null;
    try {
        return generateSignedVideoUrl(publicId);
    } catch {
        return null;
    }
}

// Quita los IDs de storage de un video para no filtrarlos al cliente: con
// cloudinary_id/drive_file_id un cliente podría abrir el archivo directo (Drive
// público) y saltarse el gate de /:id/stream. La reproducción va por /stream.
function stripVideoStorageIds<T extends Record<string, any>>(video: T): Omit<T, 'cloudinary_id' | 'drive_file_id'> {
    const { cloudinary_id, drive_file_id, ...rest } = video;
    void cloudinary_id; void drive_file_id;
    return rest;
}

async function getGoogleDriveAccessToken(): Promise<string> {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

    if (!clientId || !clientSecret || !refreshToken) {
        throw new Error('Google Drive credentials are not configured');
    }

    const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: refreshToken,
            grant_type: 'refresh_token',
        }).toString(),
    });

    const data = await response.json() as {
        access_token?: string;
        error?: string;
        error_description?: string;
    };

    if (!response.ok || !data.access_token) {
        throw new Error(`Google OAuth error: ${data.error_description || data.error || response.statusText}`);
    }

    return data.access_token;
}

async function makeGoogleDriveFilePublic(fileId: string, accessToken: string): Promise<void> {
    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            role: 'reader',
            type: 'anyone',
        }),
    });

    if (!response.ok) {
        const text = await response.text();
        console.warn('Unable to make Google Drive file public:', text);
    }
}

async function uploadBufferToGoogleDrive(
    buffer: Buffer,
    originalName: string,
    mimeType: string
): Promise<{
    fileId: string;
    webViewLink: string;
    thumbnailUrl: string | null;
    durationSeconds: number;
}> {
    const accessToken = await getGoogleDriveAccessToken();
    const ext = path.extname(originalName) || '';
    const baseName = toSlug(path.parse(originalName).name || 'video') || 'video';
    const fileName = `${baseName}-${Date.now()}${ext}`;

    const metadata: { name: string; parents?: string[] } = { name: fileName };
    if (process.env.GOOGLE_DRIVE_FOLDER_ID) {
        metadata.parents = [process.env.GOOGLE_DRIVE_FOLDER_ID];
    }

    const boundary = `catarsis_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const metadataPart = Buffer.from(
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`
    );
    const fileHeaderPart = Buffer.from(
        `--${boundary}\r\nContent-Type: ${mimeType || 'application/octet-stream'}\r\n\r\n`
    );
    const endPart = Buffer.from(`\r\n--${boundary}--`);
    const body = Buffer.concat([metadataPart, fileHeaderPart, buffer, endPart]);

    const uploadResponse = await fetch(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink,thumbnailLink,videoMediaMetadata',
        {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': `multipart/related; boundary=${boundary}`,
            },
            body,
        }
    );

    const uploadData = await uploadResponse.json() as {
        id?: string;
        webViewLink?: string;
        thumbnailLink?: string;
        videoMediaMetadata?: {
            durationMillis?: string;
        };
        error?: {
            message?: string;
        };
    };

    if (!uploadResponse.ok || !uploadData.id) {
        throw new Error(`Google Drive upload error: ${uploadData.error?.message || uploadResponse.statusText}`);
    }

    await makeGoogleDriveFilePublic(uploadData.id, accessToken);

    const durationMillis = Number(uploadData.videoMediaMetadata?.durationMillis || 0);

    return {
        fileId: uploadData.id,
        webViewLink: uploadData.webViewLink || `https://drive.google.com/file/d/${uploadData.id}/view`,
        thumbnailUrl: uploadData.thumbnailLink || `https://drive.google.com/thumbnail?id=${uploadData.id}&sz=w640`,
        durationSeconds: Number.isFinite(durationMillis) && durationMillis > 0 ? Math.round(durationMillis / 1000) : 0,
    };
}

function uploadBufferToCloudinary(buffer: Buffer, options: UploadApiOptions): Promise<UploadApiResponse> {
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(options, (error, result) => {
            if (error || !result) {
                return reject(error || new Error('Cloudinary upload failed'));
            }
            resolve(result);
        });

        Readable.from(buffer).pipe(stream);
    });
}

function mapVideoPurchase(row: any) {
    return {
        id: row.id,
        user_id: row.user_id,
        video_id: row.video_id,
        video_title: row.video_title,
        video_thumbnail_url: row.video_thumbnail_url,
        user_name: row.user_name,
        user_email: row.user_email,
        amount: Number(row.amount || 0),
        currency: row.currency || 'MXN',
        payment_method: row.payment_method || 'transfer',
        status: row.status,
        payment_reference: row.payment_reference,
        transfer_date: row.transfer_date,
        has_proof: Boolean(row.proof_file_url),
        proof_file_url: row.proof_file_url,
        proof_file_name: row.proof_file_name,
        proof_file_type: row.proof_file_type,
        customer_notes: row.customer_notes,
        admin_notes: row.admin_notes,
        reviewed_by: row.reviewed_by,
        reviewed_at: row.reviewed_at,
        approved_at: row.approved_at,
        rejected_at: row.rejected_at,
        cancelled_at: row.cancelled_at,
        expires_at: row.expires_at,
        created_at: row.created_at,
        updated_at: row.updated_at,
    };
}

// ============================================
// GET /api/videos/categories - List categories
// ============================================
router.get('/categories', async (req: Request, res: Response) => {
    try {
        const categories = await query(`
            SELECT * FROM video_categories
            WHERE is_active = true
            ORDER BY sort_order ASC
        `);
        res.json(categories);
    } catch (error) {
        console.error('Get categories error:', error);
        res.status(500).json({ error: 'Error al obtener categorías' });
    }
});

// ============================================
// GET /api/videos/public - Public published videos (no auth)
// ============================================
router.get('/public', async (req: Request, res: Response) => {
    try {
        const videos = await query(`
            SELECT v.*, vc.name as category_name, vc.color as category_color
            FROM videos v
            LEFT JOIN video_categories vc ON v.category_id = vc.id
            WHERE v.is_published = true
            ORDER BY v.sort_order ASC, v.published_at DESC
            LIMIT 50
        `);
        res.json(videos.map(stripVideoStorageIds));
    } catch (error) {
        console.error('List public videos error:', error);
        res.status(500).json({ error: 'Error al listar videos' });
    }
});

// ============================================
// ADMIN: POST /api/videos/upload - Upload video file to Cloudinary
// ============================================
router.post(
    '/upload',
    authenticate,
    requireRole('admin', 'super_admin'),
    upload.fields([
        { name: 'video', maxCount: 1 },
        { name: 'thumbnail', maxCount: 1 },
    ]),
    async (req: Request, res: Response) => {
        try {
            const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
            const videoFile = files?.video?.[0];
            const thumbnailFile = files?.thumbnail?.[0];

            if (!videoFile) {
                return res.status(400).json({ error: 'Debes adjuntar un archivo de video' });
            }

            if (!isCloudinaryConfigured && !isGoogleDriveConfigured) {
                return res.status(503).json({ error: 'Carga de videos no configurada en el servidor' });
            }

            if (!videoFile.mimetype.startsWith('video/')) {
                return res.status(400).json({ error: 'El archivo de video no es válido' });
            }

            if (isCloudinaryConfigured) {
                const fileBaseName = toSlug(path.parse(videoFile.originalname).name || 'video') || 'video';
                const videoPublicId = `catarsis/videos/${fileBaseName}-${Date.now()}`;

                const uploadedVideo = await uploadBufferToCloudinary(videoFile.buffer, {
                    resource_type: 'video',
                    type: 'authenticated',
                    public_id: videoPublicId,
                    overwrite: false,
                });

                let thumbnailUrl = safeGenerateThumbnailUrl(uploadedVideo.public_id) || '';
                let thumbnailCloudinaryId: string | null = null;

                if (thumbnailFile) {
                    if (!thumbnailFile.mimetype.startsWith('image/')) {
                        return res.status(400).json({ error: 'La miniatura debe ser una imagen válida' });
                    }

                    const thumbnailPublicId = `catarsis/thumbnails/${fileBaseName}-${Date.now()}`;
                    const uploadedThumb = await uploadBufferToCloudinary(thumbnailFile.buffer, {
                        resource_type: 'image',
                        type: 'upload',
                        public_id: thumbnailPublicId,
                        overwrite: false,
                    });

                    thumbnailUrl = uploadedThumb.secure_url;
                    thumbnailCloudinaryId = uploadedThumb.public_id;
                }

                return res.status(201).json({
                    cloudinary_id: uploadedVideo.public_id,
                    drive_file_id: uploadedVideo.public_id,
                    thumbnail_url: thumbnailUrl,
                    thumbnail_drive_id: thumbnailCloudinaryId || '',
                    duration_seconds: Math.round(uploadedVideo.duration || 0),
                    secure_url: uploadedVideo.secure_url,
                });
            }

            const uploadedVideo = await uploadBufferToGoogleDrive(
                videoFile.buffer,
                videoFile.originalname,
                videoFile.mimetype
            );

            let thumbnailUrl = uploadedVideo.thumbnailUrl || '';
            let thumbnailDriveId: string | null = null;

            if (thumbnailFile) {
                if (!thumbnailFile.mimetype.startsWith('image/')) {
                    return res.status(400).json({ error: 'La miniatura debe ser una imagen válida' });
                }

                const uploadedThumb = await uploadBufferToGoogleDrive(
                    thumbnailFile.buffer,
                    thumbnailFile.originalname,
                    thumbnailFile.mimetype
                );

                thumbnailDriveId = uploadedThumb.fileId;
                thumbnailUrl = uploadedThumb.thumbnailUrl
                    || `https://drive.google.com/thumbnail?id=${uploadedThumb.fileId}&sz=w640`;
            }

            return res.status(201).json({
                cloudinary_id: uploadedVideo.fileId,
                drive_file_id: uploadedVideo.fileId,
                thumbnail_url: thumbnailUrl,
                thumbnail_drive_id: thumbnailDriveId || '',
                duration_seconds: uploadedVideo.durationSeconds,
                secure_url: uploadedVideo.webViewLink,
            });
        } catch (error) {
            console.error('Upload video error:', error);
            return res.status(500).json({ error: 'Error al subir video' });
        }
    }
);

// ============================================
// GET /api/videos - List videos
// ============================================
router.get('/', authenticate, async (req: Request, res: Response) => {
    try {
        const { category, level, search, limit = 20, offset = 0 } = req.query;

        let queryStr = `
            SELECT v.*, vc.name as category_name, vc.color as category_color
            FROM videos v
            LEFT JOIN video_categories vc ON v.category_id = vc.id
            WHERE 1=1
        `;
        const params: any[] = [];
        let paramCount = 1;

        const isAdmin = ['admin', 'super_admin'].includes(req.user?.role || '');

        if (!isAdmin) {
            queryStr += ' AND v.is_published = true';
        }

        if (category) {
            queryStr += ` AND v.category_id = $${paramCount++}`;
            params.push(category);
        }

        if (level) {
            queryStr += ` AND v.level = $${paramCount++}`;
            params.push(level);
        }

        if (search) {
            queryStr += ` AND (v.title ILIKE $${paramCount} OR v.description ILIKE $${paramCount})`;
            params.push(`%${search}%`);
            paramCount++;
        }

        queryStr += ` ORDER BY v.sort_order ASC, v.published_at DESC LIMIT $${paramCount++} OFFSET $${paramCount++}`;
        params.push(limit, offset);

        const videos = await query(queryStr, params);
        res.json(videos.map(stripVideoStorageIds));
    } catch (error) {
        console.error('List videos error:', error);
        res.status(500).json({ error: 'Error al listar videos' });
    }
});

// ============================================
// GET /api/videos/purchases/my - Current user video purchases
// ============================================
router.get('/purchases/my', authenticate, async (req: Request, res: Response) => {
    try {
        const userId = req.user?.userId;
        const purchases = await query(
            `SELECT vp.*,
                    v.title as video_title,
                    v.thumbnail_url as video_thumbnail_url
             FROM video_purchases vp
             JOIN videos v ON v.id = vp.video_id
             WHERE vp.user_id = $1
             ORDER BY vp.created_at DESC`,
            [userId]
        );

        res.json(purchases.map(mapVideoPurchase));
    } catch (error) {
        console.error('List my video purchases error:', error);
        res.status(500).json({ error: 'Error al obtener compras de video' });
    }
});

// ============================================
// ADMIN: GET /api/videos/purchases/pending - Pending video purchases
// ============================================
router.get('/purchases/pending', authenticate, requireRole('admin', 'super_admin', 'reception'), async (req: Request, res: Response) => {
    try {
        const purchases = await query(
            `SELECT vp.*,
                    v.title as video_title,
                    v.thumbnail_url as video_thumbnail_url,
                    u.display_name as user_name,
                    u.email as user_email
             FROM video_purchases vp
             JOIN videos v ON v.id = vp.video_id
             JOIN users u ON u.id = vp.user_id
             WHERE vp.status IN ('pending_payment', 'pending_verification')
             ORDER BY
                CASE WHEN vp.status = 'pending_verification' THEN 0 ELSE 1 END,
                vp.created_at ASC`
        );

        res.json(purchases.map(mapVideoPurchase));
    } catch (error) {
        console.error('List pending video purchases error:', error);
        res.status(500).json({ error: 'Error al obtener compras pendientes de video' });
    }
});

// ============================================
// ADMIN: POST /api/videos/purchases/:purchaseId/approve - Approve video purchase
// ============================================
router.post('/purchases/:purchaseId/approve', authenticate, requireRole('admin', 'super_admin'), async (req: Request, res: Response) => {
    try {
        const { purchaseId } = req.params;
        const adminUserId = req.user?.userId;
        const validation = ReviewVideoPurchaseSchema.safeParse(req.body);

        if (!validation.success) {
            return res.status(400).json({ error: 'Datos inválidos', details: validation.error.flatten().fieldErrors });
        }

        const adminNotes = validation.data.admin_notes || null;

        const purchase = await queryOne(
            `SELECT vp.*, v.title as video_title
             FROM video_purchases vp
             JOIN videos v ON v.id = vp.video_id
             WHERE vp.id = $1`,
            [purchaseId]
        );

        if (!purchase) {
            return res.status(404).json({ error: 'Compra no encontrada' });
        }

        if (!['pending_payment', 'pending_verification'].includes(purchase.status)) {
            return res.status(400).json({ error: 'Solo se pueden aprobar compras pendientes' });
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const updated = await client.query(
                `UPDATE video_purchases
                 SET status = 'approved',
                     admin_notes = $1,
                     reviewed_by = $2,
                     reviewed_at = NOW(),
                     approved_at = NOW(),
                     updated_at = NOW()
                 WHERE id = $3
                 RETURNING *`,
                [adminNotes, adminUserId, purchaseId]
            );

            await client.query(
                `INSERT INTO payments (
                    user_id, membership_id, amount, currency,
                    payment_method, reference, notes, status, processed_by
                ) VALUES ($1, NULL, $2, $3, 'transfer', $4, $5, 'completed', $6)`,
                [
                    purchase.user_id,
                    purchase.amount,
                    purchase.currency || 'MXN',
                    purchase.payment_reference || null,
                    `Compra video: ${purchase.video_title || purchase.video_id}`,
                    adminUserId,
                ]
            );

            await client.query('COMMIT');

            res.json({
                message: 'Compra aprobada y video desbloqueado',
                purchase: mapVideoPurchase(updated.rows[0]),
            });
        } catch (txError) {
            await client.query('ROLLBACK');
            throw txError;
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Approve video purchase error:', error);
        res.status(500).json({ error: 'Error al aprobar compra de video' });
    }
});

// ============================================
// ADMIN: POST /api/videos/purchases/:purchaseId/reject - Reject video purchase
// ============================================
router.post('/purchases/:purchaseId/reject', authenticate, requireRole('admin', 'super_admin'), async (req: Request, res: Response) => {
    try {
        const { purchaseId } = req.params;
        const adminUserId = req.user?.userId;
        const validation = ReviewVideoPurchaseSchema.safeParse(req.body);

        if (!validation.success) {
            return res.status(400).json({ error: 'Datos inválidos', details: validation.error.flatten().fieldErrors });
        }

        const adminNotes = validation.data.admin_notes || null;
        const purchase = await queryOne(`SELECT id, status FROM video_purchases WHERE id = $1`, [purchaseId]);

        if (!purchase) {
            return res.status(404).json({ error: 'Compra no encontrada' });
        }

        if (!['pending_payment', 'pending_verification'].includes(purchase.status)) {
            return res.status(400).json({ error: 'Solo se pueden rechazar compras pendientes' });
        }

        const updated = await queryOne(
            `UPDATE video_purchases
             SET status = 'rejected',
                 admin_notes = $1,
                 reviewed_by = $2,
                 reviewed_at = NOW(),
                 rejected_at = NOW(),
                 updated_at = NOW()
             WHERE id = $3
             RETURNING *`,
            [adminNotes, adminUserId, purchaseId]
        );

        res.json({
            message: 'Compra rechazada',
            purchase: updated ? mapVideoPurchase(updated) : null,
        });
    } catch (error) {
        console.error('Reject video purchase error:', error);
        res.status(500).json({ error: 'Error al rechazar compra de video' });
    }
});

// ============================================
// GET /api/videos/:id/purchase - Current user purchase for video
// ============================================
router.get('/:id/purchase', authenticate, async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const userId = req.user?.userId;
        const isAdmin = ['admin', 'super_admin'].includes(req.user?.role || '');

        const video = await queryOne(
            `SELECT id, is_published FROM videos WHERE id = $1`,
            [id]
        );

        if (!video || (!isAdmin && !video.is_published)) {
            return res.status(404).json({ error: 'Video no encontrado' });
        }

        const purchase = await queryOne(
            `SELECT vp.*, v.title as video_title, v.thumbnail_url as video_thumbnail_url
             FROM video_purchases vp
             JOIN videos v ON v.id = vp.video_id
             WHERE vp.video_id = $1 AND vp.user_id = $2
             ORDER BY vp.created_at DESC
             LIMIT 1`,
            [id, userId]
        );

        res.json({ purchase: purchase ? mapVideoPurchase(purchase) : null });
    } catch (error) {
        console.error('Get video purchase error:', error);
        res.status(500).json({ error: 'Error al obtener compra de video' });
    }
});

// ============================================
// POST /api/videos/:id/purchase - Create purchase request for video unlock
// ============================================
router.post('/:id/purchase', authenticate, async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const userId = req.user?.userId;
        const isAdmin = ['admin', 'super_admin'].includes(req.user?.role || '');

        const validation = CreateVideoPurchaseSchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({ error: 'Datos inválidos', details: validation.error.flatten().fieldErrors });
        }

        const video = await queryOne(
            `SELECT id, title, is_published, sales_enabled, sales_price_mxn, sales_unlocks_video
             FROM videos
             WHERE id = $1`,
            [id]
        );

        if (!video || (!isAdmin && !video.is_published)) {
            return res.status(404).json({ error: 'Video no encontrado' });
        }

        const price = Number(video.sales_price_mxn || 0);
        if (!video.sales_enabled || !video.sales_unlocks_video || price <= 0) {
            return res.status(400).json({
                error: 'Este video no está configurado para compra individual',
            });
        }

        const existing = await queryOne(
            `SELECT *
             FROM video_purchases
             WHERE user_id = $1
               AND video_id = $2
               AND status IN ('pending_payment', 'pending_verification', 'approved')
             ORDER BY created_at DESC
             LIMIT 1`,
            [userId, id]
        );

        if (existing) {
            return res.json({
                message: existing.status === 'approved'
                    ? 'Ya tienes acceso a este video'
                    : 'Ya tienes una solicitud de compra activa para este video',
                purchase: mapVideoPurchase(existing),
            });
        }

        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 48);

        const purchase = await queryOne(
            `INSERT INTO video_purchases (
                user_id, video_id, amount, currency, payment_method,
                status, customer_notes, expires_at
            ) VALUES ($1, $2, $3, 'MXN', 'transfer', 'pending_payment', $4, $5)
            RETURNING *`,
            [userId, id, price, validation.data.notes || null, expiresAt]
        );

        res.status(201).json({
            message: 'Compra creada. Sube tu comprobante para validación.',
            purchase: purchase ? mapVideoPurchase({ ...purchase, video_title: video.title }) : null,
        });
    } catch (error: any) {
        if (error?.code === '23505') {
            const { id } = req.params;
            const userId = req.user?.userId;
            const existing = await queryOne(
                `SELECT *
                 FROM video_purchases
                 WHERE user_id = $1
                   AND video_id = $2
                   AND status IN ('pending_payment', 'pending_verification', 'approved')
                 ORDER BY created_at DESC
                 LIMIT 1`,
                [userId, id]
            );

            return res.json({
                message: 'Ya existe una compra activa para este video',
                purchase: existing ? mapVideoPurchase(existing) : null,
            });
        }
        console.error('Create video purchase error:', error);
        res.status(500).json({ error: 'Error al crear compra de video' });
    }
});

// ============================================
// PUT /api/videos/:id/purchase/proof - Submit transfer proof for video purchase
// ============================================
router.put('/:id/purchase/proof', authenticate, async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const userId = req.user?.userId;

        const validation = SubmitVideoPurchaseProofSchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({ error: 'Datos inválidos', details: validation.error.flatten().fieldErrors });
        }

        const {
            transfer_reference,
            transfer_date,
            notes,
            file_data,
            file_name,
            file_type,
        } = validation.data;

        if (!transfer_reference && !file_data) {
            return res.status(400).json({
                error: 'Debes proporcionar una referencia de transferencia o un comprobante',
            });
        }

        const purchase = await queryOne(
            `SELECT *
             FROM video_purchases
             WHERE user_id = $1
               AND video_id = $2
               AND status IN ('pending_payment', 'pending_verification', 'rejected')
             ORDER BY created_at DESC
             LIMIT 1`,
            [userId, id]
        );

        if (!purchase) {
            return res.status(404).json({
                error: 'No tienes una compra pendiente para este video',
            });
        }

        const updated = await queryOne(
            `UPDATE video_purchases
             SET status = 'pending_verification',
                 payment_method = 'transfer',
                 payment_reference = COALESCE($1, payment_reference),
                 transfer_date = COALESCE($2, transfer_date),
                 proof_file_url = COALESCE($3, proof_file_url),
                 proof_file_name = COALESCE($4, proof_file_name),
                 proof_file_type = COALESCE($5, proof_file_type),
                 customer_notes = COALESCE($6, customer_notes),
                 admin_notes = NULL,
                 reviewed_by = NULL,
                 reviewed_at = NULL,
                 approved_at = NULL,
                 rejected_at = NULL,
                 updated_at = NOW()
             WHERE id = $7
             RETURNING *`,
            [
                transfer_reference || null,
                transfer_date || null,
                file_data || null,
                file_name || null,
                file_type || null,
                notes || null,
                purchase.id,
            ]
        );

        res.json({
            message: 'Comprobante enviado. Tu pago será validado por el equipo.',
            purchase: updated ? mapVideoPurchase(updated) : null,
        });
    } catch (error) {
        console.error('Submit video purchase proof error:', error);
        res.status(500).json({ error: 'Error al enviar comprobante de video' });
    }
});

// ============================================
// GET /api/videos/:id - Get video details
// ============================================
router.get('/:id', authenticate, async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const userId = req.user?.userId;
        const isAdmin = ['admin', 'super_admin'].includes(req.user?.role || '');

        const video = await queryOne(
            `SELECT v.*, vc.name as category_name,
                    EXISTS(SELECT 1 FROM video_likes vl WHERE vl.video_id = v.id AND vl.user_id = $1) as liked,
                    vh.last_position, vh.completed, vh.watched_at
             FROM videos v
             LEFT JOIN video_categories vc ON v.category_id = vc.id
             LEFT JOIN video_history vh ON v.id = vh.video_id AND vh.user_id = $1
             WHERE v.id = $2 ${isAdmin ? '' : 'AND v.is_published = true'}`,
            [userId, id]
        );

        if (!video) {
            return res.status(404).json({ error: 'Video no encontrado' });
        }

        if (!video.thumbnail_url && (video.cloudinary_id || video.drive_file_id)) {
            const generatedThumbnail = safeGenerateThumbnailUrl(video.cloudinary_id || video.drive_file_id);
            if (generatedThumbnail) {
                video.thumbnail_url = generatedThumbnail;
            }
        }

        // No filtrar los IDs de storage al cliente: con ellos podría abrir el archivo
        // directo (Drive público) y saltarse el gate de /stream (pago/miembros).
        // La reproducción va SIEMPRE por /:id/stream, que valida acceso.
        if (!isAdmin) {
            delete video.cloudinary_id;
            delete video.drive_file_id;
        }

        res.json(video);
    } catch (error) {
        console.error('Get video error:', error);
        res.status(500).json({ error: 'Error al obtener video' });
    }
});

// ============================================
// GET /api/videos/:id/stream - Get signed URL / embed URL
// ============================================
router.get('/:id/stream', authenticate, async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const userId = req.user?.userId;
        const isAdmin = ['admin', 'super_admin'].includes(req.user?.role || '');

        const video = await queryOne(`SELECT * FROM videos WHERE id = $1`, [id]);

        if (!video) {
            return res.status(404).json({ error: 'Video no encontrado' });
        }

        let hasApprovedPurchase = false;
        const videoPrice = Number(video.sales_price_mxn || 0);
        if (!isAdmin && video.sales_unlocks_video && video.sales_enabled && videoPrice > 0) {
            const purchase = await queryOne(
                `SELECT id
                 FROM video_purchases
                 WHERE user_id = $1
                   AND video_id = $2
                   AND status = 'approved'
                 LIMIT 1`,
                [userId, id]
            );

            hasApprovedPurchase = Boolean(purchase);

            if (!hasApprovedPurchase) {
                return res.status(403).json({
                    error: 'Este video requiere compra previa.',
                    code: 'VIDEO_PURCHASE_REQUIRED',
                    purchase_price_mxn: videoPrice,
                });
            }
        }

        if (!isAdmin && video.access_type === 'miembros' && !hasApprovedPurchase) {
            const activeMembership = await queryOne(
                `SELECT 1 FROM memberships
                 WHERE user_id = $1
                   AND status = 'active'
                   AND (end_date >= CURRENT_DATE OR end_date IS NULL)`,
                [userId]
            );

            if (!activeMembership) {
                return res.status(403).json({
                    error: 'Este video es exclusivo para miembros.',
                    code: 'MEMBERSHIP_REQUIRED',
                });
            }
        }

        if (video.cloudinary_id) {
            const signedUrl = safeGenerateSignedVideoUrl(video.cloudinary_id);
            if (!signedUrl && !video.drive_file_id) {
                return res.status(503).json({ error: 'Reproducción de video no configurada en el servidor' });
            }
            if (!signedUrl) {
                return res.json({
                    embed_url: `https://drive.google.com/file/d/${video.drive_file_id}/preview`,
                });
            }
            return res.json({
                url: signedUrl,
                proxy_url: signedUrl,
            });
        }

        if (video.drive_file_id) {
            return res.json({
                embed_url: `https://drive.google.com/file/d/${video.drive_file_id}/preview`,
            });
        }

        return res.status(400).json({ error: 'El video no tiene una fuente de reproducción configurada' });
    } catch (error) {
        console.error('Stream video error:', error);
        res.status(500).json({ error: 'Error al generar URL de video' });
    }
});

// ============================================
// POST /api/videos/:id/progress - Update history
// ============================================
const ProgressSchema = z.object({
    position: z.number().min(0),
    completed: z.boolean().optional(),
});

router.post('/:id/progress', authenticate, async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const userId = req.user?.userId;

        const validation = ProgressSchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({ error: 'Datos inválidos' });
        }

        const { position, completed } = validation.data;

        await query(
            `INSERT INTO video_history (user_id, video_id, last_position, completed, watched_at)
             VALUES ($1, $2, $3, $4, NOW())
             ON CONFLICT (user_id, video_id)
             DO UPDATE SET
                 last_position = $3,
                 completed = CASE WHEN video_history.completed THEN true ELSE $4 END,
                 watched_at = NOW()`,
            [userId, id, position, completed || false]
        );

        res.json({ success: true });
    } catch (error) {
        console.error('Update progress error:', error);
        res.status(500).json({ error: 'Error al actualizar progreso' });
    }
});

// ============================================
// POST /api/videos/:id/like - Toggle like
// ============================================
router.post('/:id/like', authenticate, async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const userId = req.user?.userId;

        const existing = await queryOne(`SELECT 1 FROM video_likes WHERE user_id = $1 AND video_id = $2`, [userId, id]);

        if (existing) {
            await query(`DELETE FROM video_likes WHERE user_id = $1 AND video_id = $2`, [userId, id]);
            await query(`UPDATE videos SET likes_count = GREATEST(0, likes_count - 1) WHERE id = $1`, [id]);
            return res.json({ liked: false });
        }

        await query(`INSERT INTO video_likes (user_id, video_id) VALUES ($1, $2)`, [userId, id]);
        await query(`UPDATE videos SET likes_count = likes_count + 1 WHERE id = $1`, [id]);
        return res.json({ liked: true });
    } catch (error) {
        console.error('Like video error:', error);
        res.status(500).json({ error: 'Error al dar like' });
    }
});

// ============================================
// GET /api/videos/:id/comments - List comments
// ============================================
router.get('/:id/comments', authenticate, async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        const comments = await query(
            `SELECT c.*, u.display_name as user_name, u.photo_url as user_avatar,
                    (SELECT COUNT(*) FROM video_comments r WHERE r.parent_id = c.id) as reply_count
             FROM video_comments c
             JOIN users u ON c.user_id = u.id
             WHERE c.video_id = $1 AND c.parent_id IS NULL AND c.status = 'approved'
             ORDER BY c.created_at DESC`,
            [id]
        );

        res.json(comments);
    } catch (error) {
        console.error('Get comments error:', error);
        res.status(500).json({ error: 'Error al obtener comentarios' });
    }
});

// ============================================
// POST /api/videos/:id/comments - Add comment
// ============================================
const CommentSchema = z.object({
    content: z.string().min(1).max(500),
    parentId: z.string().uuid().optional(),
});

router.post('/:id/comments', authenticate, async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const userId = req.user?.userId;

        const validation = CommentSchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({ error: 'Comentario inválido' });
        }

        const { content, parentId } = validation.data;

        const activeMembership = await queryOne(
            `SELECT 1 FROM memberships
             WHERE user_id = $1
               AND status = 'active'`,
            [userId]
        );

        if (!activeMembership) {
            return res.status(403).json({ error: 'Necesitas una membresía activa para comentar' });
        }

        const comment = await queryOne(
            `INSERT INTO video_comments (video_id, user_id, content, parent_id)
             VALUES ($1, $2, $3, $4)
             RETURNING *`,
            [id, userId, content, parentId || null]
        );

        await query(`UPDATE videos SET comments_count = comments_count + 1 WHERE id = $1`, [id]);

        const user = await queryOne(`SELECT display_name, photo_url FROM users WHERE id = $1`, [userId]);

        res.status(201).json({
            ...comment,
            user_name: user.display_name,
            user_avatar: user.photo_url,
        });
    } catch (error) {
        console.error('Add comment error:', error);
        res.status(500).json({ error: 'Error al publicar comentario' });
    }
});

// ============================================
// ADMIN: POST /api/videos - Create video
// ============================================
router.post('/', authenticate, requireRole('admin', 'super_admin'), async (req: Request, res: Response) => {
    try {
        const validation = CreateVideoSchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({ error: 'Datos inválidos', details: validation.error.format() });
        }

        const data = validation.data;
        const cloudinaryId = data.cloudinary_id || data.drive_file_id!;
        const driveFileId = data.drive_file_id || cloudinaryId;
        const slug = toSlug(data.title);

        const thumbnailUrl = data.thumbnail_url || safeGenerateThumbnailUrl(cloudinaryId);
        const brandColor = normalizeHexColor(data.brand_color);

        const salesEnabled = Boolean(data.sales_enabled);
        const salesPrice = salesEnabled ? Number(data.sales_price_mxn || 0) : null;
        const salesUnlocksVideo = salesEnabled ? Boolean(data.sales_unlocks_video) : false;
        const salesClassCredits = salesEnabled ? (data.sales_class_credits ?? null) : null;
        const salesCtaText = salesEnabled ? (data.sales_cta_text?.trim() || 'Comprar clases') : null;

        if (salesUnlocksVideo && (!salesEnabled || Number(salesPrice || 0) <= 0)) {
            return res.status(400).json({
                error: 'Para desbloquear por compra debes activar venta y definir un precio mayor a 0',
            });
        }

        const video = await queryOne(
            `INSERT INTO videos (
                title, slug, description, cloudinary_id, drive_file_id,
                thumbnail_url, thumbnail_drive_id, category_id, level, access_type,
                is_published, duration_seconds, subtitle, tagline, days,
                brand_color, is_featured, sales_enabled, sales_price_mxn,
                sales_class_credits, sales_cta_text, sales_unlocks_video, published_at
            ) VALUES (
                $1, $2, $3, $4, $5,
                $6, $7, $8, $9, $10,
                $11, $12, $13, $14, $15,
                $16, $17, $18, $19,
                $20, $21, $22, CASE WHEN $11 THEN NOW() ELSE NULL END
            )
            RETURNING *`,
            [
                data.title,
                slug,
                data.description || null,
                cloudinaryId,
                driveFileId,
                thumbnailUrl,
                data.thumbnail_drive_id || null,
                data.category_id,
                data.level,
                data.access_type,
                data.is_published,
                data.duration_seconds || 0,
                data.subtitle || null,
                data.tagline || null,
                data.days || null,
                brandColor,
                data.is_featured || false,
                salesEnabled,
                salesPrice,
                salesClassCredits,
                salesCtaText,
                salesUnlocksVideo,
            ]
        );

        res.status(201).json(video);
    } catch (error) {
        console.error('Create video error:', error);
        res.status(500).json({ error: 'Error al crear video' });
    }
});

// ============================================
// ADMIN: PUT /api/videos/:id - Update video
// ============================================
router.put('/:id', authenticate, requireRole('admin', 'super_admin'), async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const validation = UpdateVideoSchema.safeParse(req.body);

        if (!validation.success) {
            return res.status(400).json({ error: 'Datos inválidos', details: validation.error.format() });
        }

        const currentVideo = await queryOne(
            `SELECT id, sales_enabled, sales_price_mxn, sales_unlocks_video
             FROM videos
             WHERE id = $1`,
            [id]
        );

        if (!currentVideo) {
            return res.status(404).json({ error: 'Video no encontrado' });
        }

        const data = validation.data;
        const updates: string[] = [];
        const params: any[] = [id];
        let paramCount = 2;

        const setValue = (column: string, value: any) => {
            updates.push(`${column} = $${paramCount++}`);
            params.push(value);
        };

        if (data.title !== undefined) {
            setValue('title', data.title);
            setValue('slug', toSlug(data.title));
        }
        if (data.description !== undefined) setValue('description', data.description || null);
        if (data.category_id !== undefined) setValue('category_id', data.category_id);
        if (data.level !== undefined) setValue('level', data.level);
        if (data.access_type !== undefined) setValue('access_type', data.access_type);
        if (data.is_published !== undefined) setValue('is_published', data.is_published);
        if (data.duration_seconds !== undefined) setValue('duration_seconds', data.duration_seconds);
        if (data.cloudinary_id !== undefined) setValue('cloudinary_id', data.cloudinary_id || null);
        if (data.drive_file_id !== undefined) setValue('drive_file_id', data.drive_file_id || null);
        if (data.thumbnail_url !== undefined) setValue('thumbnail_url', data.thumbnail_url || null);
        if (data.thumbnail_drive_id !== undefined) setValue('thumbnail_drive_id', data.thumbnail_drive_id || null);
        if (data.subtitle !== undefined) setValue('subtitle', data.subtitle || null);
        if (data.tagline !== undefined) setValue('tagline', data.tagline || null);
        if (data.days !== undefined) setValue('days', data.days || null);
        if (data.brand_color !== undefined) setValue('brand_color', normalizeHexColor(data.brand_color));
        if (data.is_featured !== undefined) setValue('is_featured', data.is_featured);

        const finalSalesEnabled = data.sales_enabled !== undefined
            ? Boolean(data.sales_enabled)
            : Boolean(currentVideo.sales_enabled);
        const finalSalesPrice = data.sales_price_mxn !== undefined
            ? Number(data.sales_price_mxn || 0)
            : Number(currentVideo.sales_price_mxn || 0);
        const finalSalesUnlocksVideo = data.sales_unlocks_video !== undefined
            ? Boolean(data.sales_unlocks_video)
            : Boolean(currentVideo.sales_unlocks_video);

        if (finalSalesUnlocksVideo && (!finalSalesEnabled || finalSalesPrice <= 0)) {
            return res.status(400).json({
                error: 'Para desbloquear por compra debes activar venta y definir un precio mayor a 0',
            });
        }

        if (data.sales_enabled !== undefined) {
            setValue('sales_enabled', data.sales_enabled);
            if (!data.sales_enabled) {
                setValue('sales_price_mxn', null);
                setValue('sales_class_credits', null);
                setValue('sales_cta_text', null);
                setValue('sales_unlocks_video', false);
            }
        }
        if (data.sales_unlocks_video !== undefined && finalSalesEnabled) {
            setValue('sales_unlocks_video', data.sales_unlocks_video);
        }
        if (data.sales_price_mxn !== undefined) setValue('sales_price_mxn', data.sales_price_mxn);
        if (data.sales_class_credits !== undefined) setValue('sales_class_credits', data.sales_class_credits);
        if (data.sales_cta_text !== undefined) setValue('sales_cta_text', data.sales_cta_text || null);

        if (data.cloudinary_id && data.thumbnail_url === undefined) {
            const generatedThumbnail = safeGenerateThumbnailUrl(data.cloudinary_id);
            if (generatedThumbnail) {
                setValue('thumbnail_url', generatedThumbnail);
            }
        }

        if (data.is_published === true) {
            updates.push('published_at = COALESCE(published_at, NOW())');
        }

        if (updates.length === 0) {
            return res.json({ message: 'No changes' });
        }

        updates.push('updated_at = NOW()');

        const video = await queryOne(
            `UPDATE videos
             SET ${updates.join(', ')}
             WHERE id = $1
             RETURNING *`,
            params
        );

        if (!video) {
            return res.status(404).json({ error: 'Video no encontrado' });
        }

        res.json(video);
    } catch (error) {
        console.error('Update video error:', error);
        res.status(500).json({ error: 'Error al actualizar video' });
    }
});

// ============================================
// ADMIN: DELETE /api/videos/:id - Delete video
// ============================================
router.delete('/:id', authenticate, requireRole('admin', 'super_admin'), async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        const deleted = await queryOne(`DELETE FROM videos WHERE id = $1 RETURNING id`, [id]);

        if (!deleted) {
            return res.status(404).json({ error: 'Video no encontrado' });
        }

        res.json({ message: 'Video eliminado' });
    } catch (error) {
        console.error('Delete video error:', error);
        res.status(500).json({ error: 'Error al eliminar video' });
    }
});

export default router;
