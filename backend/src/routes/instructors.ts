import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import { query, queryOne } from '../config/database.js';
import { authenticate, requireRole, optionalAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/requirePermission.js';
import {
    sendInstructorCredentials,
    sendSubstitutionRequestedNotification,
    sendSubstitutionAcceptedNotification,
    sendClassAssignmentNotification,
} from '../services/email.js';
import { logAction } from '../lib/audit.js';
import {
    writeInAppNotification,
    writeInAppNotificationForInstructor,
} from '../lib/in-app-notifications.js';
import { uploadBufferToGoogleDrive, driveImageUrl, isGoogleDriveConfigured } from '../lib/googleDrive.js';
import { awardCheckinPoints } from '../lib/loyalty.js';
import { sendWhatsAppMessage } from '../lib/whatsapp.js';
import { z } from 'zod';

const photoUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const router = Router();

// ============================================
// Guard: solo el propio instructor (o staff: admin/super_admin/reception)
// puede acceder a los recursos /:id/*. Cierra la fuga por la que un coach
// podía leer datos de OTRO coach (incl. health_notes de asistentes) y por la
// que cualquier usuario autenticado (p.ej. un cliente) podía consultarlos.
// ============================================
async function requireSelfInstructorOrStaff(req: Request, res: Response, next: NextFunction) {
    try {
        const user = req.user;
        if (!user) return res.status(401).json({ error: 'No autorizado' });
        const isStaff = user.role === 'admin' || user.role === 'super_admin' || user.role === 'reception';
        if (isStaff) return next();
        if (user.role === 'instructor') {
            // Token con instructorId correcto.
            if (user.instructorId && user.instructorId === req.params.id) return next();
            // Fallback: tokens SIN instructorId (p.ej. coach que entró por el login del studio,
            // que antes no lo incluía) → resolver su instructor por user_id y permitir si
            // coincide con :id. Evita 403 en TODO el portal del coach SIN obligar a re-login.
            if (user.userId) {
                const own = await queryOne<{ id: string }>('SELECT id FROM instructors WHERE user_id = $1', [user.userId]);
                if (own?.id === req.params.id) return next();
            }
        }
        return res.status(403).json({ error: 'No tienes acceso a los datos de este instructor' });
    } catch (e) {
        console.error('requireSelfInstructorOrStaff error:', e);
        return res.status(500).json({ error: 'Error de autorización' });
    }
}

// Helper to coerce various truthy/falsy values to boolean
const coerceBool = z.preprocess((val) => {
    if (typeof val === 'boolean') return val;
    if (typeof val === 'string') {
        if (['true', '1', 'on', 'yes'].includes(val.toLowerCase())) return true;
        if (['false', '0', 'off', 'no', ''].includes(val.toLowerCase())) return false;
    }
    return val;
}, z.boolean());

// Schema for Instructor validation (existing user)
const InstructorSchema = z.object({
    userId: z.string().uuid(),
    displayName: z.string().min(2, 'El nombre es obligatorio'),
    bio: z.string().optional(),
    priorities: z.array(z.string()).default([]), // specificities JSONB
    certifications: z.array(z.string()).default([]),
    phone: z.string().optional(),
    isActive: coerceBool.default(true),
    visiblePublic: coerceBool.default(true),
    tagline: z.string().max(200).optional(), // frase corta para la tarjeta del landing
});

// Schema for creating instructor with new user (no existing account)
const InstructorCreateNewSchema = z.object({
    email: z.string().email('Email inválido'),
    displayName: z.string().min(2, 'El nombre es obligatorio'),
    bio: z.string().optional(),
    priorities: z.array(z.string()).default([]),
    certifications: z.array(z.string()).default([]),
    phone: z.string().optional(),
    isActive: coerceBool.default(true),
    visiblePublic: coerceBool.default(true),
});

// Update schema (partial)
const InstructorUpdateSchema = InstructorSchema.omit({ userId: true }).partial();

// ============================================
// GET /api/instructors - List all active instructors (Public)
// ============================================
router.get('/', optionalAuth, async (req: Request, res: Response) => {
    try {
        const isAdmin = req.user?.role === 'admin' || req.user?.role === 'super_admin';
        const { all } = req.query;

        // `all=true` es la vista de admin (incluye class_count, inactivos y emails). Si el
        // token venció o no es admin, NO degradar en silencio a la lista pública (eso hacía
        // que el admin viera "sin clases asignadas" en /admin/instructors): pedir re-login.
        if (all === 'true' && !isAdmin) {
            return res.status(401).json({ error: 'No autorizado' });
        }

        // Admin gets full data, public gets safe fields only
        const selectFields = isAdmin
            ? `i.id, i.user_id, i.display_name, i.bio, i.photo_url, i.tagline,
               i.specialties, i.certifications, i.is_active, i.visible_public,
               i.coach_number, i.temp_password, i.last_login, i.phone as instructor_phone,
               u.email, u.phone as user_phone,
               (SELECT COUNT(*) FROM classes c WHERE c.instructor_id = i.id AND c.status <> 'cancelled')::int AS class_count`
            : `i.id, i.user_id, i.display_name, i.bio, i.photo_url, i.tagline,
               i.specialties, i.certifications, i.is_active, i.visible_public`;

        // LEFT JOIN para que el admin VEA también coaches SIN cuenta (user_id NULL) — antes el
        // INNER JOIN los ocultaba, y justo esos (registros duplicados sin login) suelen ser los
        // que tienen las clases. La landing pública sigue mostrando solo coaches con cuenta.
        let queryStr = `
      SELECT ${selectFields}
      FROM instructors i
      LEFT JOIN users u ON i.user_id = u.id
    `;

        if (isAdmin && all === 'true') {
            // Admin requesting all: no filter
        } else if (isAdmin) {
            queryStr += ` WHERE i.is_active = true`;
        } else {
            // Public: only active AND publicly visible AND con cuenta (sin duplicados huérfanos)
            queryStr += ` WHERE i.is_active = true AND i.visible_public = true AND i.user_id IS NOT NULL`;
        }

        queryStr += ` ORDER BY i.display_name ASC`;

        const instructors = await query(queryStr);

        // El contenido depende del rol (admin ve class_count/emails) → que las cachés
        // compartidas no le sirvan al admin la variante pública (sin class_count), y la del
        // admin nunca se cachea.
        res.vary('Authorization');
        if (isAdmin) {
            res.set('Cache-Control', 'no-store');
        } else {
            res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=600');
        }
        res.json(instructors);
    } catch (error) {
        console.error('List instructors error:', error);
        res.status(500).json({ error: 'Error al obtener instructores' });
    }
});

// ============================================
// POST /api/instructors/:id/merge { targetId } - Fusiona el coach :id (duplicado) en targetId.
// Mueve clases, horarios, reseñas y sustituciones al destino y desactiva el duplicado.
// Caso típico: un registro sin cuenta que tiene las clases → fusionarlo en el que tiene login,
// para que el coach vea sus clases en su portal. Solo admin.
// ============================================
router.post('/:id/merge', authenticate, requireRole('admin', 'super_admin'), async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const targetId = (req.body?.targetId as string | undefined)?.trim();
        if (!targetId) return res.status(400).json({ error: 'Falta el coach destino (targetId).' });
        if (targetId === id) return res.status(400).json({ error: 'El coach a fusionar y el destino no pueden ser el mismo.' });

        const src = await queryOne<{ id: string; display_name: string }>('SELECT id, display_name FROM instructors WHERE id = $1', [id]);
        const dst = await queryOne<{ id: string; display_name: string }>('SELECT id, display_name FROM instructors WHERE id = $1', [targetId]);
        if (!src) return res.status(404).json({ error: 'Coach a fusionar no encontrado.' });
        if (!dst) return res.status(404).json({ error: 'Coach destino no encontrado.' });

        // Un solo statement atómico con CTEs (tablas distintas, sin orden ni colisión). NO se
        // mueven coach_payouts (historial de pagos; evitar choque con el unique por mes) ni
        // workouts (assigned_by/created_by quedan en el registro inactivo, inofensivo).
        const moved = await query<{ classes: number; sched: number }>(
            `WITH mc AS (
                 UPDATE classes SET instructor_id = $1, updated_at = NOW() WHERE instructor_id = $2 RETURNING 1
             ),
             ms AS (
                 UPDATE schedules SET instructor_id = $1, updated_at = NOW() WHERE instructor_id = $2 RETURNING 1
             ),
             mr AS (
                 UPDATE reviews SET instructor_id = $1 WHERE instructor_id = $2 RETURNING 1
             ),
             mcs1 AS (
                 UPDATE class_substitutions SET original_instructor_id = $1 WHERE original_instructor_id = $2 RETURNING 1
             ),
             mcs2 AS (
                 UPDATE class_substitutions SET substitute_instructor_id = $1 WHERE substitute_instructor_id = $2 RETURNING 1
             ),
             mco1 AS (
                 UPDATE coach_substitutions SET original_instructor_id = $1 WHERE original_instructor_id = $2 RETURNING 1
             ),
             mco2 AS (
                 UPDATE coach_substitutions SET new_instructor_id = $1 WHERE new_instructor_id = $2 RETURNING 1
             ),
             de AS (
                 UPDATE instructors SET is_active = false, visible_public = false, updated_at = NOW() WHERE id = $2 RETURNING 1
             )
             SELECT (SELECT count(*) FROM mc)::int AS classes, (SELECT count(*) FROM ms)::int AS sched`,
            [targetId, id]
        );
        const row = moved[0];

        await logAction(query, {
            adminUserId: req.user!.userId,
            actionType: 'class_instructor_changed',
            entityType: 'instructor',
            entityId: targetId,
            description: `Fusionó el coach "${src.display_name}" en "${dst.display_name}" (clases: ${row?.classes ?? 0}, horarios: ${row?.sched ?? 0})`,
            newData: { merged_from: id, merged_into: targetId, classes: row?.classes ?? 0, schedules: row?.sched ?? 0 },
            req,
        });

        res.json({
            message: `Coach fusionado. Se movieron ${row?.classes ?? 0} clase(s) y ${row?.sched ?? 0} horario(s) a "${dst.display_name}".`,
            classes: row?.classes ?? 0,
            schedules: row?.sched ?? 0,
        });
    } catch (error) {
        console.error('Merge instructor error:', error);
        res.status(500).json({ error: 'Error al fusionar coach' });
    }
});

// ============================================
// POST /api/instructors - Create instructor (Admin)
// Supports two flows:
//   1) userId provided → link existing user as instructor
//   2) email provided (no userId) → create user + instructor automatically
// ============================================
router.post('/', authenticate, requireRole('admin'), async (req: Request, res: Response) => {
    try {
        const hasUserId = req.body.userId && req.body.userId !== '';

        let userId: string;
        let displayName: string;
        let bio: string | undefined;
        let priorities: string[] = [];
        let certifications: string[] = [];
        let phone: string | undefined;
        let isActive = true;
        let visiblePublic = true;
        let createdCredentials: { email: string; password: string; coachNumber: string } | null = null;

        if (hasUserId) {
            // ── Flow 1: Link existing user ──
            const validation = InstructorSchema.safeParse(req.body);
            if (!validation.success) {
                return res.status(400).json({
                    error: 'Datos inválidos',
                    details: validation.error.flatten().fieldErrors,
                });
            }
            const data = validation.data;
            userId = data.userId;
            displayName = data.displayName;
            bio = data.bio;
            priorities = data.priorities;
            certifications = data.certifications;
            phone = data.phone;
            isActive = data.isActive;
            visiblePublic = data.visiblePublic;
        } else {
            // ── Flow 2: Create new user from email ──
            const validation = InstructorCreateNewSchema.safeParse(req.body);
            if (!validation.success) {
                return res.status(400).json({
                    error: 'Datos inválidos',
                    details: validation.error.flatten().fieldErrors,
                });
            }
            const data = validation.data;
            const email = data.email.toLowerCase().trim();

            // Check if email already exists
            const existingUser = await queryOne<{ id: string }>('SELECT id FROM users WHERE email = $1', [email]);
            if (existingUser) {
                // User exists but wasn't found via search — use them
                userId = existingUser.id;
            } else {
                // Create new user with random password
                const tempPassword = Math.random().toString(36).slice(-8) + 'A1!';
                const passwordHash = await bcrypt.hash(tempPassword, 12);

                const newUser = await queryOne<{ id: string }>(
                    `INSERT INTO users (email, phone, display_name, role, password_hash)
                     VALUES ($1, $2, $3, 'instructor', $4)
                     RETURNING id`,
                    [email, data.phone || '', data.displayName, passwordHash]
                );

                if (!newUser) {
                    return res.status(500).json({ error: 'Error al crear el usuario' });
                }

                userId = newUser.id;

                // Generate coach number
                const coachNum = await queryOne<{ generate_coach_number: string }>('SELECT generate_coach_number()');
                const coachNumber = coachNum?.generate_coach_number || `COACH-${Date.now()}`;

                createdCredentials = { email, password: tempPassword, coachNumber };

                // We'll set the coach_number after creating the instructor record
            }

            displayName = data.displayName;
            bio = data.bio;
            priorities = data.priorities;
            certifications = data.certifications;
            phone = data.phone;
            isActive = data.isActive;
            visiblePublic = data.visiblePublic;
        }

        // Check if user is already an instructor
        const existing = await queryOne('SELECT id FROM instructors WHERE user_id = $1', [userId]);
        if (existing) {
            return res.status(400).json({ error: 'El usuario ya es instructor' });
        }

        // Update user role to instructor if not already
        await query('UPDATE users SET role = $1 WHERE id = $2', ['instructor', userId]);

        // Get user photo (default to profile photo)
        const user = await queryOne<{ photo_url: string | null }>('SELECT photo_url FROM users WHERE id = $1', [userId]);

        const newInstructor = await queryOne<any>(
            `INSERT INTO instructors (
                user_id, display_name, bio, photo_url, specialties, certifications, 
                is_active, visible_public, phone
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING *`,
            [
                userId,
                displayName,
                bio || null,
                user?.photo_url || null,
                JSON.stringify(priorities),
                JSON.stringify(certifications),
                isActive,
                visiblePublic,
                phone || null,
            ]
        );

        // If we created credentials, set coach_number and password on the instructor record
        if (createdCredentials && newInstructor) {
            const passwordHash = await bcrypt.hash(createdCredentials.password, 12);
            await query(
                `UPDATE instructors SET coach_number = $1, password_hash = $2, temp_password = true WHERE id = $3`,
                [createdCredentials.coachNumber, passwordHash, newInstructor.id]
            );
            newInstructor.coach_number = createdCredentials.coachNumber;
        }

        res.status(201).json({
            ...newInstructor,
            credentials: createdCredentials ? {
                email: createdCredentials.email,
                password: createdCredentials.password,
                coachNumber: createdCredentials.coachNumber,
            } : undefined,
        });
    } catch (error) {
        console.error('Create instructor error:', error);
        res.status(500).json({ error: 'Error al crear instructor' });
    }
});

// ============================================
// Self-service del coach: /me usa el userId del token (cualquier instructor logueado)
// Se colocan ANTES de /:id para que Express no matchee 'me' como :id.
// ============================================

const InstructorSelfUpdateSchema = z.object({
    displayName: z.string().min(2, 'El nombre es obligatorio').optional(),
    bio: z.string().optional(),
    specialties: z.array(z.string()).optional(),
    certifications: z.array(z.string()).optional(),
    phone: z.string().optional(),
    tagline: z.string().max(200).optional(),
});

async function getOwnInstructor(userId: string): Promise<{ id: string } | null> {
    const direct = await queryOne<{ id: string }>(`SELECT id FROM instructors WHERE user_id = $1`, [userId]);
    if (direct) return direct;
    // Auto-vínculo: si el coach inició sesión pero su registro de instructor quedó sin
    // user_id (p.ej. creado por separado en la siembra), lo ligamos por EMAIL coincidente.
    // Match seguro: solo un registro SIN user_id cuyo email == el del usuario logueado.
    const linked = await queryOne<{ id: string }>(
        `UPDATE instructors i SET user_id = $1, updated_at = NOW()
         FROM users u
         WHERE u.id = $1
           AND i.user_id IS NULL
           AND u.email IS NOT NULL
           AND i.email IS NOT NULL
           AND LOWER(i.email) = LOWER(u.email)
         RETURNING i.id`,
        [userId]
    );
    return linked ?? null;
}

// GET /api/instructors/me - Get caller's own instructor profile + availability
router.get('/me', authenticate, async (req: Request, res: Response) => {
    try {
        const userId = req.user?.userId;
        if (!userId) return res.status(401).json({ error: 'No autorizado' });
        // Resuelve (y auto-vincula por email si hace falta) el instructor del usuario.
        await getOwnInstructor(userId);
        const profile = await queryOne(
            `SELECT i.id, i.user_id, i.display_name, i.bio, i.tagline, i.photo_url,
                    i.specialties, i.certifications, i.is_active, i.visible_public,
                    i.coach_number, i.phone, u.email
             FROM instructors i JOIN users u ON u.id = i.user_id
             WHERE i.user_id = $1`,
            [userId]
        );
        if (!profile) return res.status(403).json({ error: 'No tienes un perfil de instructor' });
        const availability = await query(
            `SELECT day_of_week, start_time, end_time, is_available
             FROM instructor_availability WHERE instructor_id = $1
             ORDER BY day_of_week, start_time`,
            [(profile as any).id]
        );
        res.json({ ...(profile as any), availability });
    } catch (error) {
        console.error('Get /me instructor error:', error);
        res.status(500).json({ error: 'Error al obtener perfil' });
    }
});

// PUT /api/instructors/me - Update own profile (safe fields only)
router.put('/me', authenticate, async (req: Request, res: Response) => {
    try {
        const userId = req.user?.userId;
        if (!userId) return res.status(401).json({ error: 'No autorizado' });
        const validation = InstructorSelfUpdateSchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({ error: 'Datos inválidos', details: validation.error.flatten().fieldErrors });
        }
        const own = await getOwnInstructor(userId);
        if (!own) return res.status(403).json({ error: 'No tienes un perfil de instructor' });
        const data = validation.data;
        const fields: string[] = [];
        const params: unknown[] = [];
        let i = 1;
        const map: Record<string, string> = {
            displayName: 'display_name', bio: 'bio', tagline: 'tagline',
            specialties: 'specialties', certifications: 'certifications', phone: 'phone',
        };
        for (const [k, col] of Object.entries(map)) {
            const v = (data as Record<string, unknown>)[k];
            if (v === undefined) continue;
            if (col === 'specialties' || col === 'certifications') {
                fields.push(`${col} = $${i++}::jsonb`);
                params.push(JSON.stringify(v));
            } else {
                fields.push(`${col} = $${i++}`);
                params.push(v);
            }
        }
        if (fields.length === 0) return res.status(400).json({ error: 'Nada que actualizar' });
        params.push(own.id);
        const row = await queryOne(
            `UPDATE instructors SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${i} RETURNING *`,
            params
        );
        res.json(row);
    } catch (error) {
        console.error('Update /me instructor error:', error);
        res.status(500).json({ error: 'Error al actualizar perfil' });
    }
});

// POST /api/instructors/me/photo - Upload own photo
router.post('/me/photo', authenticate, photoUpload.single('photo'), async (req: Request, res: Response) => {
    try {
        const userId = req.user?.userId;
        if (!userId) return res.status(401).json({ error: 'No autorizado' });
        const own = await getOwnInstructor(userId);
        if (!own) return res.status(403).json({ error: 'No tienes un perfil de instructor' });
        const file = req.file;
        if (!file) return res.status(400).json({ error: 'No se proporcionó imagen' });

        let photoUrl: string;
        if (isGoogleDriveConfigured) {
            try {
                const uploaded = await uploadBufferToGoogleDrive(file.buffer, `instructor-${own.id}.jpg`, file.mimetype);
                photoUrl = driveImageUrl(uploaded.fileId, 1600);
            } catch (err) {
                console.warn('[me/photo] Drive upload failed, fallback to base64:', err);
                photoUrl = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
            }
        } else {
            if (file.buffer.length > 2 * 1024 * 1024) {
                return res.status(400).json({ error: 'Imagen demasiado grande (máx 2MB sin Drive)' });
            }
            photoUrl = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
        }
        await query(`UPDATE instructors SET photo_url = $1, updated_at = NOW() WHERE id = $2`, [photoUrl, own.id]);
        res.json({ photo_url: photoUrl });
    } catch (error) {
        console.error('Update /me photo error:', error);
        res.status(500).json({ error: 'Error al subir foto' });
    }
});

// PUT /api/instructors/me/availability - Set own availability
router.put('/me/availability', authenticate, async (req: Request, res: Response) => {
    try {
        const userId = req.user?.userId;
        if (!userId) return res.status(401).json({ error: 'No autorizado' });
        const own = await getOwnInstructor(userId);
        if (!own) return res.status(403).json({ error: 'No tienes un perfil de instructor' });
        const { availability } = req.body;
        if (!Array.isArray(availability)) return res.status(400).json({ error: 'Formato de disponibilidad inválido' });

        await query('DELETE FROM instructor_availability WHERE instructor_id = $1', [own.id]);
        for (const slot of availability) {
            if (!slot || slot.day_of_week === undefined || !slot.start_time || !slot.end_time) continue;
            await query(
                `INSERT INTO instructor_availability (instructor_id, day_of_week, start_time, end_time, is_available)
                 VALUES ($1, $2, $3, $4, $5)`,
                [own.id, slot.day_of_week, slot.start_time, slot.end_time, slot.is_available ?? true]
            );
        }
        const updated = await query(
            `SELECT day_of_week, start_time, end_time, is_available FROM instructor_availability
             WHERE instructor_id = $1 ORDER BY day_of_week, start_time`,
            [own.id]
        );
        res.json(updated);
    } catch (error) {
        console.error('Update /me availability error:', error);
        res.status(500).json({ error: 'Error al actualizar disponibilidad' });
    }
});

// ============================================
// PUT /api/instructors/:id - Update instructor (Admin)
// ============================================
router.put('/:id', authenticate, requirePermission('editar_coaches'), async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        console.log(`[UPDATE INSTRUCTOR] Starting update for ID: ${id}`);
        console.log(`[UPDATE INSTRUCTOR] Body keys: ${Object.keys(req.body)}`);
        console.log(`[UPDATE INSTRUCTOR] Body size: ${JSON.stringify(req.body).length} bytes`);

        const validation = InstructorUpdateSchema.safeParse(req.body);

        if (!validation.success) {
            console.log(`[UPDATE INSTRUCTOR] Validation failed:`, validation.error.flatten().fieldErrors);
            return res.status(400).json({
                error: 'Datos inválidos',
                details: validation.error.flatten().fieldErrors,
            });
        }

        const data = validation.data;
        console.log(`[UPDATE INSTRUCTOR] Validation passed, data keys: ${Object.keys(data)}`);

        const existing = await queryOne<{ id: string; user_id: string }>(
            'SELECT id, user_id FROM instructors WHERE id = $1',
            [id]
        );
        if (!existing) {
            console.log(`[UPDATE INSTRUCTOR] Instructor not found for ID: ${id}`);
            return res.status(404).json({ error: 'Instructor no encontrado' });
        }

        console.log(`[UPDATE INSTRUCTOR] Found existing instructor: ${existing.id}`);

        // Update email in users table if provided
        if (req.body.email) {
            const emailLower = req.body.email.toLowerCase();
            console.log(`[UPDATE INSTRUCTOR] Updating email: ${emailLower}`);

            // Check if email is already taken by another user
            const emailTaken = await queryOne<{ id: string; role: string }>(
                'SELECT id, role FROM users WHERE email = $1 AND id != $2',
                [emailLower, existing.user_id]
            );
            if (emailTaken) {
                // If the email belongs to a client, reassign that user to this instructor
                if (emailTaken.role === 'client') {
                    console.log(`[UPDATE INSTRUCTOR] Reassigning client user ${emailTaken.id} to instructor`);

                    // Update the client user's role to instructor
                    await query('UPDATE users SET role = $1 WHERE id = $2', ['instructor', emailTaken.id]);

                    // Point this instructor to the existing user
                    await query('UPDATE instructors SET user_id = $1, email = $2 WHERE id = $3', [emailTaken.id, emailLower, id]);

                    // If the old user_id was different and has no other references, leave it
                    // (the old user record stays but is no longer linked)
                } else {
                    return res.status(409).json({ error: 'Este email ya está en uso por otro usuario con rol ' + emailTaken.role });
                }
            } else {
                // Email is free or same user — just update
                if (existing.user_id) {
                    await query(
                        'UPDATE users SET email = $1 WHERE id = $2',
                        [emailLower, existing.user_id]
                    );
                }

                // Also update email in instructors table for consistency
                await query(
                    'UPDATE instructors SET email = $1 WHERE id = $2',
                    [emailLower, id]
                );
            }
        }

        const updates: string[] = [];
        const values: any[] = [];
        let paramCount = 1;

        if (data.displayName !== undefined) {
            updates.push(`display_name = $${paramCount++}`);
            values.push(data.displayName);
            console.log(`[UPDATE INSTRUCTOR] Will update display_name`);
        }
        if (data.bio !== undefined) {
            updates.push(`bio = $${paramCount++}`);
            values.push(data.bio);
            console.log(`[UPDATE INSTRUCTOR] Will update bio`);
        }

        // Allow admin to update photo_url directly (external URL or base64)
        if (req.body.photoUrl !== undefined) {
            const photoSize = req.body.photoUrl ? req.body.photoUrl.length : 0;
            console.log(`[UPDATE INSTRUCTOR] Will update photo_url, size: ${photoSize} bytes`);
            updates.push(`photo_url = $${paramCount++}`);
            values.push(req.body.photoUrl);
        }

        if (data.priorities !== undefined) {
            updates.push(`specialties = $${paramCount++}`);
            values.push(JSON.stringify(data.priorities));
            console.log(`[UPDATE INSTRUCTOR] Will update specialties/priorities`);
        }
        if (data.certifications !== undefined) {
            updates.push(`certifications = $${paramCount++}`);
            values.push(JSON.stringify(data.certifications));
            console.log(`[UPDATE INSTRUCTOR] Will update certifications`);
        }
        if (data.phone !== undefined) {
            updates.push(`phone = $${paramCount++}`);
            values.push(data.phone);
            console.log(`[UPDATE INSTRUCTOR] Will update phone`);
        }
        if (data.isActive !== undefined) {
            updates.push(`is_active = $${paramCount++}`);
            values.push(data.isActive);
            console.log(`[UPDATE INSTRUCTOR] Will update is_active`);
        }
        if (data.visiblePublic !== undefined) {
            updates.push(`visible_public = $${paramCount++}`);
            values.push(data.visiblePublic);
            console.log(`[UPDATE INSTRUCTOR] Will update visible_public`);
        }
        if (data.tagline !== undefined) {
            updates.push(`tagline = $${paramCount++}`);
            values.push(data.tagline);
        }

        if (updates.length > 0) {
            console.log(`[UPDATE INSTRUCTOR] Executing ${updates.length} updates: ${updates.join(', ')}`);
            values.push(id);
            const result = await queryOne(
                `UPDATE instructors SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`,
                values
            );
            console.log(`[UPDATE INSTRUCTOR] Update successful for ID: ${id}`);
            return res.json(result);
        }

        console.log(`[UPDATE INSTRUCTOR] No updates needed for ID: ${id}`);
        res.json(existing);
    } catch (error) {
        console.error(`[UPDATE INSTRUCTOR] Error for ID: ${req.params.id}`, error);
        res.status(500).json({ error: 'Error al actualizar instructor' });
    }
});

// ============================================
// DELETE /api/instructors/:id - Deactivate instructor
// ============================================
router.delete('/:id', authenticate, requireRole('admin'), async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        const inst = await queryOne<{ id: string; user_id: string }>(
            'SELECT id, user_id FROM instructors WHERE id = $1', [id]
        );
        if (!inst) return res.status(404).json({ error: 'Instructor no encontrado' });

        // Borrado DURO solo si el coach NO tiene historial relevante (clases, pagos, reseñas,
        // sustituciones, workouts). Importante: coach_payouts y reviews son ON DELETE CASCADE,
        // así que un borrado duro los eliminaría en silencio — por eso se chequea explícito.
        const dep = await queryOne<{ n: string }>(
            `SELECT (
                (SELECT count(*) FROM classes WHERE instructor_id = $1)
              + (SELECT count(*) FROM coach_payouts WHERE instructor_id = $1)
              + (SELECT count(*) FROM reviews WHERE instructor_id = $1)
              + (SELECT count(*) FROM coach_substitutions WHERE original_instructor_id = $1 OR new_instructor_id = $1)
              + (SELECT count(*) FROM class_substitutions WHERE original_instructor_id = $1 OR substitute_instructor_id = $1)
              + (SELECT count(*) FROM class_workouts WHERE assigned_by = $1)
              + (SELECT count(*) FROM workout_templates WHERE created_by = $1)
             ) AS n`,
            [id]
        );

        if (Number(dep?.n ?? 0) > 0) {
            // Tiene historial → se desactiva (preserva integridad y reportes).
            await query('UPDATE instructors SET is_active = false WHERE id = $1', [id]);
            return res.json({
                message: 'El instructor tiene historial (clases, pagos o reseñas), así que se desactivó en vez de borrarse.',
                deleted: false,
            });
        }

        // Sin historial → borrado DURO. La cascada limpia disponibilidad/playlists/favoritos del coach.
        await query('DELETE FROM instructors WHERE id = $1', [id]);
        return res.json({ message: 'Instructor eliminado.', deleted: true });
    } catch (error) {
        console.error('Delete instructor error:', error);
        res.status(500).json({ error: 'Error al eliminar instructor' });
    }
});

// ============================================
// POST /api/instructors/:id/photo - Upload instructor photo
// ============================================
router.post('/:id/photo', authenticate, requirePermission('editar_coaches'), photoUpload.single('photo'), async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const file = req.file;

        if (!file) {
            return res.status(400).json({ error: 'No se proporcionó imagen' });
        }

        let photoUrl: string;

        if (isGoogleDriveConfigured) {
            try {
                const uploaded = await uploadBufferToGoogleDrive(
                    file.buffer,
                    `instructor-${id}.jpg`,
                    file.mimetype,
                );
                photoUrl = driveImageUrl(uploaded.fileId, 1600);
            } catch (err) {
                console.warn('[instructor photo] Drive upload failed, falling back to base64:', err);
                photoUrl = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
            }
        } else {
            if (file.buffer.length > 2 * 1024 * 1024) {
                return res.status(413).json({ error: 'Imagen demasiado grande para almacenamiento local (máx 2MB sin Drive)' });
            }
            photoUrl = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
        }

        const result = await queryOne(
            'UPDATE instructors SET photo_url = $1 WHERE id = $2 RETURNING id, photo_url',
            [photoUrl, id]
        );

        if (!result) {
            return res.status(404).json({ error: 'Instructor no encontrado' });
        }

        res.json({ message: 'Foto actualizada', photo_url: result.photo_url });
    } catch (error) {
        console.error('Upload photo error:', error);
        res.status(500).json({ error: 'Error al subir foto' });
    }
});

// ============================================
// POST /api/instructors/:id/generate-access - Generate coach portal credentials
// ============================================
router.post('/:id/generate-access', authenticate, requireRole('admin'), async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        // Check if instructor exists and get user email
        const instructor = await queryOne<{
            id: string;
            display_name: string;
            coach_number: string | null;
            user_id: string;
        }>(
            'SELECT i.id, i.display_name, i.coach_number, i.user_id FROM instructors i WHERE i.id = $1',
            [id]
        );

        if (!instructor) {
            return res.status(404).json({ error: 'Instructor no encontrado' });
        }

        // Get user email
        const user = await queryOne<{ email: string }>(
            'SELECT email FROM users WHERE id = $1',
            [instructor.user_id]
        );

        if (!user) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        // Check if already has coach access
        if (instructor.coach_number) {
            return res.status(400).json({
                error: 'El instructor ya tiene acceso al portal',
                email: user.email,
                coachNumber: instructor.coach_number
            });
        }

        // Generate coach number
        const coachNumber = await queryOne<{ generate_coach_number: string }>(
            'SELECT generate_coach_number()',
            []
        );

        if (!coachNumber?.generate_coach_number) {
            throw new Error('Failed to generate coach number');
        }

        // Generate temporary secure password (12 chars, mixed)
        const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%&*';
        let tempPassword = '';
        for (let i = 0; i < 12; i++) {
            tempPassword += charset.charAt(Math.floor(Math.random() * charset.length));
        }

        // Hash the password
        const passwordHash = await bcrypt.hash(tempPassword, 12);

        // Update instructor with credentials
        await queryOne(
            `UPDATE instructors 
             SET coach_number = $1, password_hash = $2, temp_password = true 
             WHERE id = $3`,
            [coachNumber.generate_coach_number, passwordHash, id]
        );

        // Update user password as well
        await queryOne(
            'UPDATE users SET password_hash = $1 WHERE id = $2',
            [passwordHash, instructor.user_id]
        );

        // Return credentials (password shown only once)
        res.json({
            message: 'Credenciales generadas exitosamente',
            email: user.email,
            coachNumber: coachNumber.generate_coach_number,
            tempPassword: tempPassword,
            instructorName: instructor.display_name,
            warning: 'Guarda esta contraseña. No se mostrará nuevamente.',
        });
    } catch (error) {
        console.error('Generate access error:', error);
        res.status(500).json({ error: 'Error al generar acceso' });
    }
});

// ============================================
// POST /api/instructors/:id/reset-password - Reset coach password (admin)
// ============================================
router.post('/:id/reset-password', authenticate, requireRole('admin'), async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        const instructor = await queryOne<{
            id: string;
            display_name: string;
            coach_number: string;
            user_id: string;
        }>(
            'SELECT i.id, i.display_name, i.coach_number, i.user_id FROM instructors i WHERE i.id = $1',
            [id]
        );

        if (!instructor || !instructor.coach_number) {
            return res.status(404).json({ error: 'Instructor sin acceso al portal' });
        }

        // Get user email
        const user = await queryOne<{ email: string }>(
            'SELECT email FROM users WHERE id = $1',
            [instructor.user_id]
        );

        if (!user) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        // Generate new temporary password
        const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%&*';
        let tempPassword = '';
        for (let i = 0; i < 12; i++) {
            tempPassword += charset.charAt(Math.floor(Math.random() * charset.length));
        }

        const passwordHash = await bcrypt.hash(tempPassword, 12);

        await queryOne(
            `UPDATE instructors 
             SET password_hash = $1, temp_password = true 
             WHERE id = $2`,
            [passwordHash, id]
        );

        // Also update user password
        await queryOne(
            'UPDATE users SET password_hash = $1 WHERE id = $2',
            [passwordHash, instructor.user_id]
        );

        res.json({
            message: 'Contraseña restablecida',
            email: user.email,
            coachNumber: instructor.coach_number,
            tempPassword: tempPassword,
            warning: 'Guarda esta contraseña. No se mostrará nuevamente.',
        });
    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({ error: 'Error al restablecer contraseña' });
    }
});

// ============================================
// GET /api/instructors/:id/availability - Get instructor availability
// ============================================
router.get('/:id/availability', authenticate, requireSelfInstructorOrStaff, async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        const availability = await query(
            `SELECT * FROM instructor_availability 
             WHERE instructor_id = $1 AND is_available = true
             ORDER BY day_of_week, start_time`,
            [id]
        );

        res.json(availability);
    } catch (error) {
        console.error('Get availability error:', error);
        res.status(500).json({ error: 'Error al obtener disponibilidad' });
    }
});

// ============================================
// PUT /api/instructors/:id/availability - Update instructor availability
// ============================================
router.put('/:id/availability', authenticate, requirePermission('editar_coaches'), async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { availability } = req.body; // Array of { day_of_week, start_time, end_time, is_available }

        if (!Array.isArray(availability)) {
            return res.status(400).json({ error: 'Formato de disponibilidad inválido' });
        }

        // Delete existing availability
        await query('DELETE FROM instructor_availability WHERE instructor_id = $1', [id]);

        // Insert new availability
        for (const slot of availability) {
            await queryOne(
                `INSERT INTO instructor_availability (instructor_id, day_of_week, start_time, end_time, is_available)
                 VALUES ($1, $2, $3, $4, $5)`,
                [id, slot.day_of_week, slot.start_time, slot.end_time, slot.is_available ?? true]
            );
        }

        // Return updated availability
        const updated = await query(
            `SELECT * FROM instructor_availability 
             WHERE instructor_id = $1 
             ORDER BY day_of_week, start_time`,
            [id]
        );

        res.json(updated);
    } catch (error) {
        console.error('Update availability error:', error);
        res.status(500).json({ error: 'Error al actualizar disponibilidad' });
    }
});

// ============================================
// GET /api/instructors/:id/stats - Get instructor statistics
// ============================================
router.get('/:id/stats', authenticate, requireSelfInstructorOrStaff, async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        // Get basic stats
        const stats = await queryOne(`
            SELECT 
                i.id AS instructor_id,
                i.display_name,
                COUNT(DISTINCT c.id) AS total_classes_taught,
                COUNT(DISTINCT b.id) AS total_bookings,
                COUNT(DISTINCT CASE WHEN b.status = 'checked_in' THEN b.id END) AS total_checkins,
                ROUND(
                    CASE 
                        WHEN COUNT(DISTINCT b.id) > 0 
                        THEN (COUNT(DISTINCT CASE WHEN b.status = 'checked_in' THEN b.id END)::DECIMAL / COUNT(DISTINCT b.id)) * 100 
                        ELSE 0 
                    END, 
                    1
                ) AS attendance_rate,
                COUNT(DISTINCT CASE WHEN c.date = (NOW() AT TIME ZONE 'America/Mexico_City')::date THEN c.id END) AS classes_today,
                COUNT(DISTINCT CASE WHEN c.date >= date_trunc('week', (NOW() AT TIME ZONE 'America/Mexico_City')::date) AND c.date < date_trunc('week', (NOW() AT TIME ZONE 'America/Mexico_City')::date) + INTERVAL '7 days' THEN c.id END) AS classes_this_week,
                SUM(CASE WHEN c.date >= date_trunc('week', (NOW() AT TIME ZONE 'America/Mexico_City')::date) AND c.date < date_trunc('week', (NOW() AT TIME ZONE 'America/Mexico_City')::date) + INTERVAL '7 days' THEN c.current_bookings ELSE 0 END) AS bookings_this_week
            FROM instructors i
            LEFT JOIN classes c ON c.instructor_id = i.id AND c.status != 'cancelled'
            LEFT JOIN bookings b ON b.class_id = c.id AND b.status != 'cancelled'
            WHERE i.id = $1
            GROUP BY i.id, i.display_name
        `, [id]);

        if (!stats) {
            return res.status(404).json({ error: 'Instructor no encontrado' });
        }

        // Calculate average occupancy for this week
        const occupancyStats = await queryOne(`
            SELECT 
                COALESCE(AVG(
                    CASE WHEN c.max_capacity > 0 
                    THEN (c.current_bookings::DECIMAL / c.max_capacity) * 100 
                    ELSE 0 END
                ), 0) AS avg_occupancy
            FROM classes c
            WHERE c.instructor_id = $1 
              AND c.date >= date_trunc('week', (NOW() AT TIME ZONE 'America/Mexico_City')::date)
              AND c.date < date_trunc('week', (NOW() AT TIME ZONE 'America/Mexico_City')::date) + INTERVAL '7 days'
              AND c.status != 'cancelled'
        `, [id]);

        // Calificación del coach (cómo lo califican los clientes). Reseñas publicadas,
        // todo el histórico (sin filtro de fecha). Mismo origen que el reporte de instructores.
        const reviewStats = await queryOne<{ total_reviews: string; avg_rating: string | null }>(`
            SELECT
                COUNT(*) AS total_reviews,
                ROUND(AVG(overall_rating), 1) AS avg_rating
            FROM reviews
            WHERE instructor_id = $1
              AND status = 'published'
        `, [id]);

        res.json({
            ...stats,
            avg_occupancy: Math.round(occupancyStats?.avg_occupancy || 0),
            total_reviews: Number(reviewStats?.total_reviews || 0),
            avg_rating: reviewStats?.avg_rating != null ? Number(reviewStats.avg_rating) : null,
        });
    } catch (error) {
        console.error('Get stats error:', error);
        res.status(500).json({ error: 'Error al obtener estadísticas' });
    }
});

// ============================================
// GET /api/instructors/:id/classes - Get instructor's classes (for coach portal)
// ============================================
router.get('/:id/classes', authenticate, requireSelfInstructorOrStaff, async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { date, from, to } = req.query;

        let whereClause = 'WHERE c.instructor_id = $1 AND c.status != $2';
        const params: any[] = [id, 'cancelled'];
        let paramCount = 3;

        if (date) {
            whereClause += ` AND c.date = $${paramCount++}`;
            params.push(date);
        } else if (from && to) {
            whereClause += ` AND c.date >= $${paramCount++} AND c.date <= $${paramCount++}`;
            params.push(from, to);
        } else {
            // Default: today and future classes
            whereClause += ` AND c.date >= (NOW() AT TIME ZONE 'America/Mexico_City')::date`;
        }

        const classes = await query(`
            SELECT 
                c.id,
                c.date,
                c.start_time,
                c.end_time,
                c.max_capacity,
                c.current_bookings,
                c.status,
                c.notes,
                c.level,
                ct.id AS class_type_id,
                ct.name AS class_type_name,
                ct.description AS class_type_description,
                ct.color AS class_type_color,
                ct.icon AS class_type_icon,
                f.id AS facility_id,
                f.name AS facility_name,
                (SELECT COUNT(*) FROM bookings b WHERE b.class_id = c.id AND b.status = 'waitlist') AS waitlist_count
            FROM classes c
            JOIN class_types ct ON c.class_type_id = ct.id
            LEFT JOIN facilities f ON c.facility_id = f.id
            ${whereClause}
            ORDER BY c.date, c.start_time
        `, params);

        res.json(classes);
    } catch (error) {
        console.error('Get instructor classes error:', error);
        res.status(500).json({ error: 'Error al obtener clases' });
    }
});

// ============================================
// GET /api/instructors/:id/classes/:classId/attendees - Get class attendees
// ============================================
router.get('/:id/classes/:classId/attendees', authenticate, requireSelfInstructorOrStaff, async (req: Request, res: Response) => {
    try {
        const { id, classId } = req.params;

        // Verify the class belongs to this instructor
        const classData = await queryOne(
            'SELECT id, instructor_id FROM classes WHERE id = $1',
            [classId]
        );

        if (!classData) {
            return res.status(404).json({ error: 'Clase no encontrada' });
        }

        // If user is instructor, verify it's their class
        if (req.user?.role === 'instructor' && classData.instructor_id !== id) {
            return res.status(403).json({ error: 'No tienes acceso a esta clase' });
        }

        const attendees = await query(`
            SELECT 
                b.id AS booking_id,
                b.status,
                b.waitlist_position,
                b.checked_in_at,
                u.id AS user_id,
                u.display_name,
                u.email,
                u.phone,
                u.photo_url,
                u.health_notes,
                u.instructor_notes,
                u.alert_flag,
                u.alert_message
            FROM bookings b
            JOIN users u ON b.user_id = u.id
            WHERE b.class_id = $1 AND b.status != 'cancelled'
            ORDER BY 
                CASE b.status 
                    WHEN 'waitlist' THEN 2 
                    ELSE 1 
                END,
                b.waitlist_position NULLS LAST,
                b.created_at
        `, [classId]);

        const confirmed = attendees.filter((a: any) => a.status !== 'waitlist');
        const waitlist = attendees.filter((a: any) => a.status === 'waitlist');

        res.json({ confirmed, waitlist });
    } catch (error) {
        console.error('Get attendees error:', error);
        res.status(500).json({ error: 'Error al obtener asistentes' });
    }
});

// ============================================
// POST /api/instructors/:id/classes/:classId/checkin - Check in attendee(s)
// ============================================
router.post('/:id/classes/:classId/checkin', authenticate, requireSelfInstructorOrStaff, async (req: Request, res: Response) => {
    try {
        const { id, classId } = req.params;
        const { bookingIds, all } = req.body; // bookingIds array or all=true for mass check-in

        // Verify instructor has access to this class
        const classData = await queryOne(
            'SELECT id, instructor_id FROM classes WHERE id = $1',
            [classId]
        );

        if (!classData) {
            return res.status(404).json({ error: 'Clase no encontrada' });
        }

        // Check permissions
        const userRole = req.user?.role;
        const isInstructor = userRole === 'instructor';

        if (isInstructor && classData.instructor_id !== id) {
            return res.status(403).json({ error: 'No tienes acceso a esta clase' });
        }

        let checkedIn = 0;

        if (all) {
            // Mass check-in
            const result = await query<{ id: string; user_id: string }>(`
                UPDATE bookings
                SET status = 'checked_in', checked_in_at = CURRENT_TIMESTAMP, checked_in_by = $1
                WHERE class_id = $2 AND status = 'confirmed'
                RETURNING id, user_id
            `, [req.user?.userId, classId]);
            checkedIn = result.length;
            // Award attendance points for each booking that was just checked in
            for (const row of result) {
                void awardCheckinPoints(row.user_id, row.id);
            }
        } else if (Array.isArray(bookingIds) && bookingIds.length > 0) {
            // Individual check-ins
            for (const bookingId of bookingIds) {
                const row = await queryOne<{ id: string; user_id: string }>(`
                    UPDATE bookings
                    SET status = 'checked_in', checked_in_at = CURRENT_TIMESTAMP, checked_in_by = $1
                    WHERE id = $2 AND class_id = $3 AND status = 'confirmed'
                    RETURNING id, user_id
                `, [req.user?.userId, bookingId, classId]);
                if (row) {
                    checkedIn++;
                    void awardCheckinPoints(row.user_id, row.id);
                }
            }
        } else {
            return res.status(400).json({ error: 'Se requiere bookingIds o all=true' });
        }

        res.json({ message: `${checkedIn} asistente(s) registrado(s)`, checked_in: checkedIn });
    } catch (error) {
        console.error('Check-in error:', error);
        res.status(500).json({ error: 'Error al registrar asistencia' });
    }
});

// ============================================
// GET /api/instructors/available - Get available instructors for a time slot
// ============================================
router.get('/available/slot', authenticate, requireRole('admin'), async (req: Request, res: Response) => {
    try {
        const { date, start_time, end_time, exclude_instructor_id } = req.query;

        if (!date || !start_time) {
            return res.status(400).json({ error: 'Se requiere fecha y hora de inicio' });
        }

        // Get day of week from date
        const dayOfWeek = new Date(date as string).getDay();

        // Find instructors available at this time
        let queryStr = `
            SELECT DISTINCT 
                i.id, 
                i.display_name, 
                i.photo_url, 
                i.specialties,
                CASE WHEN ia.id IS NOT NULL THEN true ELSE false END AS has_availability
            FROM instructors i
            LEFT JOIN instructor_availability ia ON i.id = ia.instructor_id 
                AND ia.day_of_week = $1 
                AND ia.start_time <= $2::TIME 
                AND ia.end_time >= COALESCE($3::TIME, $2::TIME + INTERVAL '1 hour')
                AND ia.is_available = true
            WHERE i.is_active = true
        `;

        const params: any[] = [dayOfWeek, start_time, end_time || null];
        let paramCount = 4;

        // Exclude instructor if specified (for substitutions)
        if (exclude_instructor_id) {
            queryStr += ` AND i.id != $${paramCount++}`;
            params.push(exclude_instructor_id);
        }

        // Check they don't have another class at this time
        queryStr += `
            AND NOT EXISTS (
                SELECT 1 FROM classes c 
                WHERE c.instructor_id = i.id 
                  AND c.date = $${paramCount++}::DATE
                  AND c.status != 'cancelled'
                  AND (
                      (c.start_time <= $${paramCount++}::TIME AND c.end_time > $${paramCount++}::TIME)
                      OR (c.start_time < COALESCE($${paramCount++}::TIME, $${paramCount++}::TIME + INTERVAL '1 hour') AND c.end_time >= COALESCE($${paramCount++}::TIME, $${paramCount++}::TIME + INTERVAL '1 hour'))
                  )
            )
        `;
        params.push(date, start_time, start_time, end_time, start_time, end_time, start_time);

        queryStr += ` ORDER BY has_availability DESC, i.display_name`;

        const instructors = await query(queryStr, params);
        res.json(instructors);
    } catch (error) {
        console.error('Get available instructors error:', error);
        res.status(500).json({ error: 'Error al buscar instructores disponibles' });
    }
});

// ============================================
// POST /api/instructors/:id/send-credentials - Send credentials email to instructor (Admin)
// ============================================
const SendCredentialsSchema = z.object({
    email: z.string().email('Email inválido').optional(),
    phone: z.string().optional(),
    channel: z.enum(['email', 'whatsapp']).default('email'),
    generatePassword: z.boolean().default(true),
    customPassword: z.string().optional(),
});

router.post('/:id/send-credentials', authenticate, requireRole('admin'), async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const validation = SendCredentialsSchema.safeParse(req.body);

        if (!validation.success) {
            return res.status(400).json({
                error: 'Datos inválidos',
                details: validation.error.flatten().fieldErrors,
            });
        }

        const { email, phone, channel, generatePassword, customPassword } = validation.data;

        if (channel === 'email' && !email) {
            return res.status(400).json({ error: 'Se requiere el email para enviar por correo.' });
        }

        // Get instructor info (incluye teléfono propio y el del usuario, para WhatsApp)
        const instructor = await queryOne<{
            id: string;
            user_id: string;
            display_name: string;
            instructor_phone: string | null;
            user_phone: string | null;
        }>(
            `SELECT i.id, i.user_id, i.display_name,
                    i.phone AS instructor_phone, u.phone AS user_phone
             FROM instructors i
             LEFT JOIN users u ON u.id = i.user_id
             WHERE i.id = $1`,
            [id]
        );

        if (!instructor) {
            return res.status(404).json({ error: 'Instructor no encontrado' });
        }

        // Teléfono a usar para WhatsApp: el que mande el admin, o el del instructor/usuario.
        const targetPhone = (phone || instructor.instructor_phone || instructor.user_phone || '').trim();
        if (channel === 'whatsapp' && !targetPhone) {
            return res.status(400).json({ error: 'El coach no tiene teléfono registrado para WhatsApp.' });
        }

        // Update user email if different (solo si se proporcionó)
        if (email) {
            await query(
                'UPDATE users SET email = $1 WHERE id = $2',
                [email.toLowerCase(), instructor.user_id]
            );
        }

        // Generate or use custom password
        const temporaryPassword = generatePassword
            ? Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-8).toUpperCase()
            : customPassword || Math.random().toString(36).slice(-8);

        // Hash password and save to INSTRUCTOR table (coach login uses instructors.password_hash)
        const passwordHash = await bcrypt.hash(temporaryPassword, 12);

        // Generate coach number if doesn't exist
        const coachNumber = await queryOne<{ coach_number: string }>(
            `SELECT coach_number FROM instructors WHERE id = $1`,
            [id]
        );

        let newCoachNumber = coachNumber?.coach_number;
        if (!newCoachNumber) {
            const lastCoach = await queryOne<{ coach_number: string }>(
                `SELECT coach_number FROM instructors WHERE coach_number IS NOT NULL ORDER BY coach_number DESC LIMIT 1`
            );
            const nextNum = lastCoach?.coach_number
                ? parseInt(lastCoach.coach_number.replace('COACH-', '')) + 1
                : 1;
            newCoachNumber = `COACH-${nextNum.toString().padStart(4, '0')}`;
        }

        // Update instructor with credentials
        await query(
            `UPDATE instructors 
             SET password_hash = $1, temp_password = true, coach_number = $2 
             WHERE id = $3`,
            [passwordHash, newCoachNumber, id]
        );

        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        const loginUrl = `${frontendUrl}/coach/login`;

        // ── Canal WhatsApp ──────────────────────────────────────────────────
        if (channel === 'whatsapp') {
            const message =
                `¡Hola ${instructor.display_name}! 👋\n\n` +
                `Estas son tus credenciales para el portal de coaches de Casa Shé:\n\n` +
                `👤 Coach: ${newCoachNumber}\n` +
                (email ? `📧 Email: ${email}\n` : '') +
                `🔑 Contraseña temporal: ${temporaryPassword}\n\n` +
                `Inicia sesión aquí: ${loginUrl}\n\n` +
                `Por seguridad, cambia tu contraseña al entrar.`;

            const ok = await sendWhatsAppMessage(targetPhone, message);
            if (!ok) {
                // Credenciales guardadas, pero el WhatsApp no salió: devolvemos la
                // contraseña para que el admin la comparta manualmente.
                return res.json({
                    success: true,
                    warning: 'Credenciales guardadas, pero el WhatsApp no pudo enviarse. Verifica la conexión de WhatsApp.',
                    phone: targetPhone,
                    coachNumber: newCoachNumber,
                    tempPassword: temporaryPassword,
                });
            }
            return res.json({
                success: true,
                message: `Credenciales enviadas por WhatsApp a ${targetPhone}`,
                phone: targetPhone,
                coachNumber: newCoachNumber,
            });
        }

        // ── Canal Email (default) ───────────────────────────────────────────
        console.log('Attempting to send credentials email to:', email);
        console.log('Instructor name:', instructor.display_name);
        console.log('Login URL:', loginUrl);

        try {
            await sendInstructorCredentials({
                to: email!,
                instructorName: instructor.display_name,
                email: email!,
                temporaryPassword: temporaryPassword,
                loginUrl: loginUrl,
                coachNumber: newCoachNumber,
            });
            console.log('✅ Credentials email sent successfully to:', email);
        } catch (emailError: any) {
            console.error('❌ Failed to send credentials email:', emailError);

            // Check if it's a Gmail error
            const warningMessage = emailError.message?.includes('GMAIL') || emailError.code === 'EAUTH'
                ? `⚠️ Email no enviado: Verifica las credenciales de Gmail en las variables de entorno.`
                : 'Credenciales guardadas pero el email no pudo enviarse.';

            // Still return success since credentials were saved, but note the email failed
            return res.json({
                success: true,
                warning: warningMessage,
                email: email,
                coachNumber: newCoachNumber,
                tempPassword: temporaryPassword, // Return password so admin can copy it manually
            });
        }

        res.json({
            success: true,
            message: `Credenciales enviadas a ${email}`,
            email: email,
            coachNumber: newCoachNumber,
        });
    } catch (error) {
        console.error('Send instructor credentials error:', error);
        res.status(500).json({ error: 'Error al enviar credenciales' });
    }
});

// ============================================
// GET /api/instructors/:id/history - Get class history (Coach)
// ============================================
router.get('/:id/history', authenticate, requireSelfInstructorOrStaff, async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { from, to, classTypeId, page = '1', limit = '20' } = req.query;

        const pageNum = parseInt(page as string);
        const limitNum = parseInt(limit as string);
        const offset = (pageNum - 1) * limitNum;

        let queryStr = `
            SELECT 
                c.id,
                c.date,
                c.start_time,
                c.end_time,
                c.max_capacity,
                c.current_bookings,
                c.status,
                ct.name as class_type_name,
                ct.color as class_type_color,
                f.name as facility_name,
                (SELECT COUNT(*) FROM bookings b WHERE b.class_id = c.id AND b.status = 'checked_in') as checked_in_count,
                (SELECT COUNT(*) FROM bookings b WHERE b.class_id = c.id AND b.status = 'no_show') as no_show_count
            FROM classes c
            JOIN class_types ct ON c.class_type_id = ct.id
            LEFT JOIN facilities f ON c.facility_id = f.id
            WHERE c.instructor_id = $1
            AND c.date < (NOW() AT TIME ZONE 'America/Mexico_City')::date
        `;

        const params: any[] = [id];
        let paramIndex = 2;

        if (from) {
            queryStr += ` AND c.date >= $${paramIndex}`;
            params.push(from);
            paramIndex++;
        }
        if (to) {
            queryStr += ` AND c.date <= $${paramIndex}`;
            params.push(to);
            paramIndex++;
        }
        if (classTypeId) {
            queryStr += ` AND c.class_type_id = $${paramIndex}`;
            params.push(classTypeId);
            paramIndex++;
        }

        // Count total
        const countQuery = queryStr.replace(/SELECT[\s\S]*?FROM/, 'SELECT COUNT(*) as total FROM');
        const countResult = await queryOne<{ total: string }>(countQuery, params);
        const total = parseInt(countResult?.total || '0');

        queryStr += ` ORDER BY c.date DESC, c.start_time DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        params.push(limitNum, offset);

        const classes = await query(queryStr, params);

        res.json({
            classes,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total,
                totalPages: Math.ceil(total / limitNum)
            }
        });
    } catch (error) {
        console.error('Get class history error:', error);
        res.status(500).json({ error: 'Error al obtener historial' });
    }
});

// ============================================
// GET /api/instructors/:id/history/:classId/attendees - Get attendees for past class
// ============================================
router.get('/:id/history/:classId/attendees', authenticate, requireSelfInstructorOrStaff, async (req: Request, res: Response) => {
    try {
        const { classId } = req.params;

        // requireSelfInstructorOrStaff garantiza que :id es el propio coach (o staff),
        // pero NO que la clase sea suya: un instructor solo ve asistentes de SUS clases.
        if (req.user!.role === 'instructor') {
            const own = await queryOne(
                `SELECT 1 FROM classes c
                 JOIN instructors i ON i.id = c.instructor_id
                 WHERE c.id = $1 AND i.user_id = $2`,
                [classId, req.user!.userId]
            );
            if (!own) {
                return res.status(403).json({ error: 'Esta clase no es tuya' });
            }
        }

        const attendees = await query(`
            SELECT 
                b.id as booking_id,
                b.status,
                b.checked_in_at,
                u.id as user_id,
                u.display_name,
                u.email,
                u.phone,
                u.photo_url
            FROM bookings b
            JOIN users u ON b.user_id = u.id
            WHERE b.class_id = $1
            ORDER BY b.status DESC, u.display_name ASC
        `, [classId]);

        res.json(attendees);
    } catch (error) {
        console.error('Get history attendees error:', error);
        res.status(500).json({ error: 'Error al obtener asistentes' });
    }
});

// ============================================
// GET /api/instructors/:id/stats/by-class-type - Stats by class type
// ============================================
router.get('/:id/stats/by-class-type', authenticate, requireSelfInstructorOrStaff, async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        const stats = await query(`
            SELECT 
                ct.id,
                ct.name,
                ct.color,
                COUNT(c.id) as total_classes,
                COALESCE(SUM(c.current_bookings), 0) as total_bookings,
                COALESCE(SUM((SELECT COUNT(*) FROM bookings b WHERE b.class_id = c.id AND b.status = 'checked_in')), 0) as total_checkins,
                ROUND(AVG(c.current_bookings::decimal / NULLIF(c.max_capacity, 0) * 100), 1) as avg_occupancy
            FROM classes c
            JOIN class_types ct ON c.class_type_id = ct.id
            WHERE c.instructor_id = $1
            AND c.date < (NOW() AT TIME ZONE 'America/Mexico_City')::date
            AND c.status = 'completed'
            GROUP BY ct.id, ct.name, ct.color
            ORDER BY total_classes DESC
        `, [id]);

        res.json(stats);
    } catch (error) {
        console.error('Get stats by class type error:', error);
        res.status(500).json({ error: 'Error al obtener estadísticas' });
    }
});

// ============================================
// SUBSTITUTIONS ROUTES
// ============================================

// GET /api/instructors/:id/substitutions - Get substitution requests
router.get('/:id/substitutions', authenticate, requireSelfInstructorOrStaff, async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { type = 'all' } = req.query; // 'requested' | 'available' | 'all'

        let queryStr = `
            SELECT 
                cs.id,
                cs.class_id,
                cs.original_instructor_id,
                cs.substitute_instructor_id,
                cs.reason,
                cs.status,
                cs.requested_at,
                cs.responded_at,
                cs.response_note,
                c.date,
                c.start_time,
                c.end_time,
                ct.name as class_type_name,
                ct.color as class_type_color,
                oi.display_name as original_instructor_name,
                si.display_name as substitute_instructor_name
            FROM class_substitutions cs
            JOIN classes c ON cs.class_id = c.id
            JOIN class_types ct ON c.class_type_id = ct.id
            JOIN instructors oi ON cs.original_instructor_id = oi.id
            LEFT JOIN instructors si ON cs.substitute_instructor_id = si.id
            WHERE c.date >= (NOW() AT TIME ZONE 'America/Mexico_City')::date
        `;

        if (type === 'requested') {
            queryStr += ` AND cs.original_instructor_id = $1`;
        } else if (type === 'available') {
            queryStr += ` AND cs.original_instructor_id != $1 AND cs.status = 'pending'`;
        } else {
            queryStr += ` AND (cs.original_instructor_id = $1 OR cs.substitute_instructor_id = $1 OR (cs.status = 'pending' AND cs.original_instructor_id != $1))`;
        }

        queryStr += ` ORDER BY c.date ASC, c.start_time ASC`;

        const substitutions = await query(queryStr, [id]);
        res.json(substitutions);
    } catch (error) {
        console.error('Get substitutions error:', error);
        res.status(500).json({ error: 'Error al obtener sustituciones' });
    }
});

// POST /api/instructors/:id/substitutions - Request substitution
router.post('/:id/substitutions', authenticate, requireSelfInstructorOrStaff, async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { classId, reason } = req.body;

        // Verify class belongs to this instructor
        const classData = await queryOne<{ instructor_id: string }>(
            'SELECT instructor_id FROM classes WHERE id = $1',
            [classId]
        );

        if (!classData || classData.instructor_id !== id) {
            return res.status(403).json({ error: 'No puedes solicitar sustitución para esta clase' });
        }

        // Check if already requested
        const existing = await queryOne(
            'SELECT id FROM class_substitutions WHERE class_id = $1 AND status = $2',
            [classId, 'pending']
        );

        if (existing) {
            return res.status(400).json({ error: 'Ya existe una solicitud pendiente para esta clase' });
        }

        const substitution = await queryOne(`
            INSERT INTO class_substitutions (class_id, original_instructor_id, reason)
            VALUES ($1, $2, $3)
            RETURNING *
        `, [classId, id, reason]);

        // Notificación: avisa a todos los admins activos por correo. No bloquea la respuesta.
        try {
            const info = await queryOne<{
                class_name: string; class_date: string; start_time: string; end_time: string;
                original_coach_name: string;
            }>(
                `SELECT ct.name AS class_name, c.date::text AS class_date,
                        c.start_time::text AS start_time, c.end_time::text AS end_time,
                        i.display_name AS original_coach_name
                 FROM classes c
                 JOIN class_types ct ON ct.id = c.class_type_id
                 JOIN instructors i ON i.id = c.instructor_id
                 WHERE c.id = $1`,
                [classId]
            );
            if (info) {
                const admins = await query<{ email: string }>(
                    `SELECT DISTINCT email FROM users
                     WHERE role IN ('admin','super_admin') AND is_active = true AND email IS NOT NULL`
                );
                for (const a of admins) {
                    await sendSubstitutionRequestedNotification({
                        to: a.email,
                        originalCoachName: info.original_coach_name,
                        className: info.class_name,
                        classDate: info.class_date,
                        startTime: info.start_time.slice(0, 5),
                        endTime: info.end_time.slice(0, 5),
                        reason: reason || null,
                    });
                }
                // Espejo in-app: una fila para cada admin.
                const adminUsers = await query<{ id: string }>(
                    `SELECT id FROM users
                     WHERE role IN ('admin','super_admin') AND is_active = true`
                );
                for (const u of adminUsers) {
                    await writeInAppNotification({
                        userId: u.id,
                        type: 'substitution_requested',
                        title: 'Sustitución solicitada',
                        body: `${info.original_coach_name} pide sustituto para ${info.class_name} (${info.class_date} ${info.start_time.slice(0,5)}).`,
                        data: { class_id: classId, substitution_id: (substitution as { id?: string } | null)?.id, reason: reason || null },
                    });
                }
            }
        } catch (notifErr) {
            console.error('[notify] substitution requested failed:', notifErr);
        }

        res.status(201).json(substitution);
    } catch (error) {
        console.error('Request substitution error:', error);
        res.status(500).json({ error: 'Error al solicitar sustitución' });
    }
});

// PUT /api/instructors/:id/substitutions/:subId/accept - Coach OFFERS to cover (no longer reassigns — admin must approve)
router.put('/:id/substitutions/:subId/accept', authenticate, requireSelfInstructorOrStaff, async (req: Request, res: Response) => {
    try {
        const { id, subId } = req.params;
        const { note } = req.body;

        // Load the sub joined with its class to get date + start_time.
        // Only match rows that are still pending AND nobody has offered yet.
        const substitution = await queryOne<{
            class_id: string;
            original_instructor_id: string;
            class_date: string;
            class_start: string;
        }>(
            `SELECT s.class_id, s.original_instructor_id,
                    c.date::text AS class_date, c.start_time::text AS class_start
             FROM class_substitutions s
             JOIN classes c ON c.id = s.class_id
             WHERE s.id = $1 AND s.status = 'pending' AND s.substitute_instructor_id IS NULL`,
            [subId]
        );

        if (!substitution) {
            return res.status(404).json({ error: 'Solicitud no encontrada, ya tiene a alguien ofrecido, o ya fue procesada' });
        }

        if (substitution.original_instructor_id === id) {
            return res.status(400).json({ error: 'No puedes aceptar tu propia solicitud' });
        }

        // Availability validation: offerer must not already have a class at the same slot.
        const conflict = await queryOne(
            `SELECT 1 FROM classes
             WHERE instructor_id = $1
               AND date = $2
               AND start_time = $3
               AND status != 'cancelled'
               AND id != $4
             LIMIT 1`,
            [id, substitution.class_date, substitution.class_start, substitution.class_id]
        );

        if (conflict) {
            return res.status(400).json({ error: 'Ya tienes una clase a esa misma hora; no puedes cubrir esta.' });
        }

        // Record the offer — status STAYS 'pending', class is NOT reassigned yet.
        await queryOne(
            `UPDATE class_substitutions
             SET substitute_instructor_id = $1, responded_at = NOW(), response_note = $2
             WHERE id = $3`,
            [id, note || null, subId]
        );

        // Notify admins (best-effort) that someone offered.
        try {
            const info = await queryOne<{
                class_name: string; class_date: string; start_time: string;
                offerer_name: string;
            }>(
                `SELECT ct.name AS class_name, c.date::text AS class_date,
                        c.start_time::text AS start_time,
                        sub.display_name AS offerer_name
                 FROM classes c
                 JOIN class_types ct ON ct.id = c.class_type_id
                 JOIN instructors sub ON sub.id = $1
                 WHERE c.id = $2`,
                [id, substitution.class_id]
            );
            if (info) {
                const adminUsers = await query<{ id: string }>(
                    `SELECT id FROM users WHERE role IN ('admin','super_admin') AND is_active = true`
                );
                for (const u of adminUsers) {
                    await writeInAppNotification({
                        userId: u.id,
                        type: 'substitution_offered',
                        title: 'Sustitución: alguien se ofreció',
                        body: `${info.offerer_name} se ofreció a cubrir ${info.class_name} (${info.class_date} ${info.start_time.slice(0, 5)}). Aprueba o rechaza.`,
                        data: { substitution_id: subId, class_id: substitution.class_id },
                    });
                }
            }
        } catch (notifErr) {
            console.error('[notify] substitution offered failed:', notifErr);
        }

        res.json({ message: 'Te ofreciste a cubrir. Falta la aprobación del admin.' });
    } catch (error) {
        console.error('Accept substitution error:', error);
        res.status(500).json({ error: 'Error al registrar oferta de sustitución' });
    }
});

// PUT /api/instructors/:id/substitutions/:subId/cancel - Cancel substitution request
router.put('/:id/substitutions/:subId/cancel', authenticate, requireSelfInstructorOrStaff, async (req: Request, res: Response) => {
    try {
        const { id, subId } = req.params;

        const result = await queryOne(`
            UPDATE class_substitutions 
            SET status = 'cancelled'
            WHERE id = $1 AND original_instructor_id = $2 AND status = 'pending'
            RETURNING id
        `, [subId, id]);

        if (!result) {
            return res.status(404).json({ error: 'Solicitud no encontrada o no puedes cancelarla' });
        }

        res.json({ message: 'Solicitud cancelada' });
    } catch (error) {
        console.error('Cancel substitution error:', error);
        res.status(500).json({ error: 'Error al cancelar solicitud' });
    }
});

// ============================================
// ADMIN SUBSTITUTION MANAGEMENT ROUTES
// These use literal /substitutions (no :id param) so they never collide with /:id/substitutions/...
// ============================================

// GET /api/instructors/substitutions/pending - List all pending substitution requests (admin)
router.get('/substitutions/pending', authenticate, requireRole('admin', 'super_admin'), async (req: Request, res: Response) => {
    try {
        const rows = await query<{
            id: string;
            class_id: string;
            reason: string | null;
            requested_at: string;
            response_note: string | null;
            original_instructor_id: string;
            original_coach_name: string;
            substitute_instructor_id: string | null;
            substitute_coach_name: string | null;
            class_name: string;
            class_date: string;
            start_time: string;
            end_time: string;
            facility_name: string | null;
        }>(
            `SELECT s.id, s.class_id, s.reason, s.requested_at, s.response_note,
                    s.original_instructor_id, orig.display_name AS original_coach_name,
                    s.substitute_instructor_id, sub.display_name AS substitute_coach_name,
                    ct.name AS class_name, c.date::text AS class_date,
                    c.start_time::text AS start_time, c.end_time::text AS end_time,
                    f.name AS facility_name
             FROM class_substitutions s
             JOIN classes c ON c.id = s.class_id
             JOIN class_types ct ON ct.id = c.class_type_id
             JOIN instructors orig ON orig.id = s.original_instructor_id
             LEFT JOIN instructors sub ON sub.id = s.substitute_instructor_id
             LEFT JOIN facilities f ON f.id = c.facility_id
             WHERE s.status = 'pending'
             ORDER BY c.date ASC, c.start_time ASC`
        );
        res.json(rows);
    } catch (error) {
        console.error('Get pending substitutions error:', error);
        res.status(500).json({ error: 'Error al obtener solicitudes pendientes' });
    }
});

// POST /api/instructors/substitutions/:subId/approve - Admin approves substitution (reassigns class)
router.post('/substitutions/:subId/approve', authenticate, requireRole('admin', 'super_admin'), async (req: Request, res: Response) => {
    try {
        const { subId } = req.params;

        const sub = await queryOne<{
            class_id: string;
            original_instructor_id: string;
            substitute_instructor_id: string | null;
        }>(
            `SELECT class_id, original_instructor_id, substitute_instructor_id
             FROM class_substitutions
             WHERE id = $1 AND status = 'pending'`,
            [subId]
        );

        if (!sub) {
            return res.status(404).json({ error: 'Solicitud no encontrada o ya procesada' });
        }

        if (!sub.substitute_instructor_id) {
            return res.status(400).json({ error: 'Nadie se ha ofrecido a cubrir esta clase todavía.' });
        }

        const { class_id, original_instructor_id, substitute_instructor_id } = sub;

        // Reassign the class and mark the substitution accepted.
        await queryOne(
            `UPDATE classes SET instructor_id = $1 WHERE id = $2 AND status != 'cancelled'`,
            [substitute_instructor_id, class_id]
        );
        await queryOne(
            `UPDATE class_substitutions SET status = 'accepted' WHERE id = $1`,
            [subId]
        );

        // Notify coaches (best-effort).
        try {
            const info = await queryOne<{
                class_name: string; class_date: string; start_time: string; end_time: string;
                capacity: number;
                original_email: string | null; original_name: string;
                substitute_email: string | null; substitute_name: string;
            }>(
                `SELECT ct.name AS class_name, c.date::text AS class_date,
                        c.start_time::text AS start_time, c.end_time::text AS end_time,
                        c.capacity,
                        orig.email AS original_email, orig.display_name AS original_name,
                        sub.email AS substitute_email, sub.display_name AS substitute_name
                 FROM classes c
                 JOIN class_types ct ON ct.id = c.class_type_id
                 JOIN instructors orig ON orig.id = $1
                 JOIN instructors sub ON sub.id = $2
                 WHERE c.id = $3`,
                [original_instructor_id, substitute_instructor_id, class_id]
            );
            if (info) {
                // Email + in-app to original coach.
                if (info.original_email) {
                    await sendSubstitutionAcceptedNotification({
                        to: info.original_email,
                        originalCoachName: info.original_name,
                        substituteCoachName: info.substitute_name,
                        className: info.class_name,
                        classDate: info.class_date,
                        startTime: info.start_time.slice(0, 5),
                        endTime: info.end_time.slice(0, 5),
                        note: null,
                    });
                }
                await writeInAppNotificationForInstructor(original_instructor_id, {
                    type: 'coach_substituted',
                    title: 'Tu clase ya tiene sustituto',
                    body: `El admin aprobó que ${info.substitute_name} cubra tu clase ${info.class_name} (${info.class_date} ${info.start_time.slice(0, 5)}).`,
                    data: { class_id, substitution_id: subId, substitute_id: substitute_instructor_id },
                });
                // Email + in-app to substitute coach.
                if (info.substitute_email) {
                    await sendClassAssignmentNotification({
                        to: info.substitute_email,
                        coachName: info.substitute_name,
                        className: info.class_name,
                        classDate: info.class_date,
                        startTime: info.start_time.slice(0, 5),
                        endTime: info.end_time.slice(0, 5),
                        capacity: info.capacity,
                    });
                }
                await writeInAppNotificationForInstructor(substitute_instructor_id, {
                    type: 'coach_assigned',
                    title: 'Nueva clase asignada',
                    body: `El admin aprobó tu oferta. Ahora eres el coach de ${info.class_name} (${info.class_date} ${info.start_time.slice(0, 5)}).`,
                    data: { class_id, substitution_id: subId },
                });
            }
        } catch (notifErr) {
            console.error('[notify] substitution approved failed:', notifErr);
        }

        await logAction(query, {
            adminUserId: req.user!.userId,
            actionType: 'substitution_approved',
            entityType: 'class',
            entityId: class_id,
            description: 'Sustitución aprobada',
            newData: { substitution_id: subId, substitute_instructor_id },
            req,
        });

        res.json({ message: 'Sustitución aprobada. La clase fue reasignada.' });
    } catch (error) {
        console.error('Approve substitution error:', error);
        res.status(500).json({ error: 'Error al aprobar sustitución' });
    }
});

// POST /api/instructors/substitutions/:subId/reject - Admin rejects substitution offer
router.post('/substitutions/:subId/reject', authenticate, requireRole('admin', 'super_admin'), async (req: Request, res: Response) => {
    try {
        const { subId } = req.params;
        const { reason } = req.body;

        const sub = await queryOne<{
            original_instructor_id: string;
            substitute_instructor_id: string | null;
            class_id: string;
        }>(
            `UPDATE class_substitutions
             SET status = 'declined', responded_at = NOW()
             WHERE id = $1 AND status = 'pending'
             RETURNING original_instructor_id, substitute_instructor_id, class_id`,
            [subId]
        );

        if (!sub) {
            return res.status(404).json({ error: 'Solicitud no encontrada o ya procesada' });
        }

        const { original_instructor_id, substitute_instructor_id, class_id } = sub;

        // Notify coaches (best-effort).
        try {
            await writeInAppNotificationForInstructor(original_instructor_id, {
                type: 'substitution_rejected',
                title: 'Sustitución rechazada',
                body: `El admin rechazó la sustitución de tu clase. Sigues asignada.${reason ? ' Motivo: ' + reason : ''}`,
                data: { class_id, substitution_id: subId },
            });
            if (substitute_instructor_id) {
                await writeInAppNotificationForInstructor(substitute_instructor_id, {
                    type: 'substitution_rejected',
                    title: 'Sustitución rechazada',
                    body: `La sustitución que ofreciste no fue aprobada.${reason ? ' Motivo: ' + reason : ''}`,
                    data: { class_id, substitution_id: subId },
                });
            }
        } catch (notifErr) {
            console.error('[notify] substitution rejected failed:', notifErr);
        }

        await logAction(query, {
            adminUserId: req.user!.userId,
            actionType: 'substitution_rejected',
            entityType: 'class',
            entityId: class_id,
            description: 'Sustitución rechazada',
            newData: { substitution_id: subId, reason: reason || null },
            req,
        });

        res.json({ message: 'Solicitud rechazada.' });
    } catch (error) {
        console.error('Reject substitution error:', error);
        res.status(500).json({ error: 'Error al rechazar sustitución' });
    }
});

// ============================================
// PLAYLISTS ROUTES
// ============================================

// GET /api/instructors/:id/playlists - Get playlists
router.get('/:id/playlists', authenticate, requireSelfInstructorOrStaff, async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { classTypeId, includePublic = 'true' } = req.query;

        let queryStr = `
            SELECT 
                p.id,
                p.instructor_id,
                p.class_type_id,
                p.name,
                p.description,
                p.platform,
                p.url,
                p.duration_minutes,
                p.is_public,
                p.is_favorite,
                p.created_at,
                i.display_name as instructor_name,
                ct.name as class_type_name,
                ct.color as class_type_color
            FROM coach_playlists p
            JOIN instructors i ON p.instructor_id = i.id
            LEFT JOIN class_types ct ON p.class_type_id = ct.id
            WHERE (p.instructor_id = $1 ${includePublic === 'true' ? 'OR p.is_public = true' : ''})
        `;

        const params: any[] = [id];

        if (classTypeId) {
            queryStr += ` AND p.class_type_id = $2`;
            params.push(classTypeId);
        }

        queryStr += ` ORDER BY p.is_favorite DESC, p.created_at DESC`;

        const playlists = await query(queryStr, params);
        res.json(playlists);
    } catch (error) {
        console.error('Get playlists error:', error);
        res.status(500).json({ error: 'Error al obtener playlists' });
    }
});

// POST /api/instructors/:id/playlists - Create playlist
router.post('/:id/playlists', authenticate, requireSelfInstructorOrStaff, async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        let { name, description, classTypeId, platform, url, durationMinutes, isPublic, thumbnailUrl } = req.body;

        if (!url) {
            return res.status(400).json({ error: 'URL es requerida' });
        }

        // Auto-fetch metadata if name or thumbnail is missing
        if (!name || !thumbnailUrl) {
            try {
                const metadata = await fetchPlaylistMetadata(url);
                if (!name && metadata.title) name = metadata.title;
                if (!thumbnailUrl && metadata.thumbnail) thumbnailUrl = metadata.thumbnail;

                // If platform wasn't provided, try to detect it from metadata author or logic
                if (!platform) {
                    if (url.includes('spotify.com')) platform = 'spotify';
                    else if (url.includes('apple.com')) platform = 'apple_music';
                    else if (url.includes('youtube.com') || url.includes('youtu.be')) platform = 'youtube';
                }
            } catch (e) {
                console.error('Error fetching metadata on create:', e);
            }
        }

        if (!name) {
            return res.status(400).json({ error: 'Nombre es requerido' });
        }

        const playlist = await queryOne(`
            INSERT INTO coach_playlists (instructor_id, class_type_id, name, description, platform, url, duration_minutes, is_public, thumbnail_url)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING *
        `, [id, classTypeId || null, name, description, platform || 'spotify', url, durationMinutes, isPublic || false, thumbnailUrl || null]);

        res.status(201).json(playlist);
    } catch (error) {
        console.error('Create playlist error:', error);
        res.status(500).json({ error: 'Error al crear playlist' });
    }
});

// PUT /api/instructors/:id/playlists/:playlistId - Update playlist
router.put('/:id/playlists/:playlistId', authenticate, requireSelfInstructorOrStaff, async (req: Request, res: Response) => {
    try {
        const { id, playlistId } = req.params;
        let { name, description, classTypeId, platform, url, durationMinutes, isPublic, isFavorite, thumbnailUrl } = req.body;

        // Auto-fetch metadata if URL changes/exists and thumbnail is missing
        if (url && !thumbnailUrl) {
            try {
                const metadata = await fetchPlaylistMetadata(url);
                if (!name && metadata.title) name = metadata.title;
                if (metadata.thumbnail) thumbnailUrl = metadata.thumbnail;

                if (!platform) {
                    if (url.includes('spotify.com')) platform = 'spotify';
                    else if (url.includes('apple.com')) platform = 'apple_music';
                    else if (url.includes('youtube.com') || url.includes('youtu.be')) platform = 'youtube';
                }
            } catch (e) {
                console.error('Error fetching metadata on update:', e);
            }
        }

        const playlist = await queryOne(`
            UPDATE coach_playlists 
            SET name = COALESCE($1, name),
                description = COALESCE($2, description),
                class_type_id = $3,
                platform = COALESCE($4, platform),
                url = COALESCE($5, url),
                duration_minutes = COALESCE($6, duration_minutes),
                is_public = COALESCE($7, is_public),
                is_favorite = COALESCE($8, is_favorite),
                thumbnail_url = COALESCE($9, thumbnail_url),
                updated_at = NOW()
            WHERE id = $10 AND instructor_id = $11
            RETURNING *
        `, [name, description, classTypeId, platform, url, durationMinutes, isPublic, isFavorite, thumbnailUrl || null, playlistId, id]);

        if (!playlist) {
            return res.status(404).json({ error: 'Playlist no encontrada' });
        }

        res.json(playlist);
    } catch (error) {
        console.error('Update playlist error:', error);
        res.status(500).json({ error: 'Error al actualizar playlist' });
    }
});

// DELETE /api/instructors/:id/playlists/:playlistId - Delete playlist
router.delete('/:id/playlists/:playlistId', authenticate, requireSelfInstructorOrStaff, async (req: Request, res: Response) => {
    try {
        const { id, playlistId } = req.params;

        const result = await queryOne(
            'DELETE FROM coach_playlists WHERE id = $1 AND instructor_id = $2 RETURNING id',
            [playlistId, id]
        );

        if (!result) {
            return res.status(404).json({ error: 'Playlist no encontrada' });
        }

        res.json({ message: 'Playlist eliminada' });
    } catch (error) {
        console.error('Delete playlist error:', error);
        res.status(500).json({ error: 'Error al eliminar playlist' });
    }
});

import { fetchPlaylistMetadata } from '../services/metadata.js';

// ... (existing imports)

// GET /api/instructors/playlist-metadata - Get metadata from playlist URL using oEmbed
router.get('/playlist-metadata', async (req: Request, res: Response) => {
    try {
        const url = req.query.url as string;
        if (!url) {
            return res.status(400).json({ error: 'URL requerida' });
        }

        const metadata = await fetchPlaylistMetadata(url);
        res.json(metadata);
    } catch (error) {
        console.error('Get playlist metadata error:', error);
        res.status(500).json({ error: 'Error al obtener metadata' });
    }
});

export default router;
