import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import multer from 'multer';
import { query, queryOne, pool } from '../config/database.js';
import { logAction } from '../lib/audit.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { requireElevated } from '../middleware/elevation.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { effectivePermissions, mergeRequested, validatePermissionChange, PRESETS, PresetName, PERMISSION_LABELS, isMasterPreset } from '../lib/permissions.js';
import { UpdateProfileSchema, User } from '../types/auth.js';
import { z } from 'zod';
import { sendClientWelcomeEmail, sendPlainEmail, sendReceptionAssignedEmail, sendReceptionCredentials } from '../services/email.js';
import { sendClientWelcome, sendWhatsAppMessage } from '../lib/whatsapp.js';
import { isElevated } from '../lib/elevation.js';
import { instanceByKey, instanceForFacility } from '../lib/whatsapp-instances.js';
import { resolveRequestFacility } from '../lib/requestFacility.js';
import { awardWelcomeBonus } from '../lib/loyalty.js';
import { notifyPointsEarnedExternal } from '../lib/notifications.js';
import { uploadBufferToGoogleDrive, driveImageUrl, isGoogleDriveConfigured } from '../lib/googleDrive.js';
import { isValidTag } from '../lib/clientTags.js';
import { findOrCreateGuest } from '../lib/guestUser.js';

const router = Router();

const photoUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
});

// All routes require authentication
router.use(authenticate);

// ============================================
// GET /api/users/reception - List reception staff (admin only)
// NOTE: defined before /:id routes to avoid shadowing
// ============================================
router.get('/reception', requirePermission('gestionar_permisos'), async (req: Request, res: Response) => {
    try {
        // include_admins=true → además de recepción incluye a los admins, para poder verlos y
        // degradarlos desde la gestión de equipo. La vista de recepción (TeamScreen) no lo manda,
        // así que ahí se sigue listando solo recepción (no rompe ese flujo).
        const includeAdmins = req.query.include_admins === 'true';
        // Cuentas admin de sistema/seed (no son personas del equipo) → se ocultan de la lista.
        const SYSTEM_ADMIN_EMAILS = ['admin@balanceroom.mx', 'admin@bmbstudio.mx', 'bmbstudio@admin.com'];
        const rows = await query(
            `SELECT u.id, u.email, u.phone, u.display_name, u.role, u.is_active, u.default_facility_id,
                    u.is_reception_master, u.permissions,
                    f.name AS facility_name
             FROM users u
             LEFT JOIN facilities f ON f.id = u.default_facility_id
             WHERE u.role = 'reception'${includeAdmins ? " OR (u.role = 'admin' AND u.email <> ALL($1::text[]))" : ''}
             ORDER BY (u.role = 'admin') DESC, u.display_name`,
            includeAdmins ? [SYSTEM_ADMIN_EMAILS] : []
        );
        res.json(rows);
    } catch (error) {
        console.error('List reception error:', error);
        res.status(500).json({ error: 'Error al listar recepcionistas' });
    }
});

// ============================================
// POST /api/users/reception - Create reception staff (admin only)
// ============================================
router.post('/reception', requireRole('admin', 'super_admin'), async (req: Request, res: Response) => {
    try {
        const { email, phone, display_name, password, default_facility_id } = req.body;

        if (!email || !display_name || !password) {
            return res.status(400).json({ error: 'email, display_name y password son requeridos' });
        }

        const passwordHash = await bcrypt.hash(password, 12);

        // users.phone es NOT NULL en schema; usamos placeholder si no se proporciona
        // (la admin lo puede editar después desde /admin/reception).
        const user = await queryOne(
            `INSERT INTO users (email, phone, display_name, password_hash, role, default_facility_id, temp_password)
             VALUES ($1, $2, $3, $4, 'reception', $5, true)
             RETURNING id, email, display_name, role, default_facility_id`,
            [email.toLowerCase(), phone || '0000000000', display_name, passwordHash, default_facility_id || null]
        );

        await logAction(query, {
            adminUserId: req.user!.userId,
            actionType: 'reception_created',
            entityType: 'user',
            entityId: (user as any).id,
            description: 'Alta de recepcionista',
            newData: {
                email: (user as any).email,
                display_name: (user as any).display_name,
                default_facility_id: (user as any).default_facility_id,
            },
            req,
        });

        // Enviar credenciales por correo a la recepcionista (best-effort: no rompe el alta).
        try {
            await sendReceptionCredentials({
                to: email.toLowerCase(),
                name: display_name,
                email: email.toLowerCase(),
                temporaryPassword: password,
            });
        } catch (mailErr) {
            console.error('Failed to send reception credentials:', mailErr);
        }

        res.status(201).json({ user });
    } catch (error: any) {
        if (error?.code === '23505') {
            return res.status(409).json({ error: 'Email ya registrado' });
        }
        console.error('Create reception error:', error);
        res.status(500).json({ error: 'Error al crear recepcionista' });
    }
});

// ============================================
// PUT /api/users/:id/staff - Update staff member (admin only)
// ============================================
router.put('/:id/staff', requireRole('admin', 'super_admin'), async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { default_facility_id, display_name, is_active, is_reception_master } = req.body;

        const before = await queryOne<{
            display_name: string;
            is_active: boolean;
            default_facility_id: string | null;
            is_reception_master: boolean;
        }>(
            `SELECT display_name, is_active, default_facility_id, is_reception_master FROM users WHERE id = $1`,
            [id]
        );

        const updates: string[] = [];
        const values: any[] = [];
        let paramCount = 1;

        if (display_name !== undefined) {
            updates.push(`display_name = $${paramCount++}`);
            values.push(display_name);
        }
        if (default_facility_id !== undefined) {
            updates.push(`default_facility_id = $${paramCount++}`);
            values.push(default_facility_id || null);
        }
        if (is_active !== undefined) {
            updates.push(`is_active = $${paramCount++}`);
            values.push(is_active);
        }
        if (is_reception_master !== undefined) {
            updates.push(`is_reception_master = $${paramCount++}`);
            values.push(is_reception_master === true);
        }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'No hay datos para actualizar' });
        }

        updates.push('updated_at = NOW()');
        values.push(id);

        const user = await queryOne(
            `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramCount}
             RETURNING id, email, display_name, role, is_active, default_facility_id, is_reception_master`,
            values
        );

        if (!user) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        await logAction(query, {
            adminUserId: req.user!.userId,
            actionType: 'reception_updated',
            entityType: 'user',
            entityId: id,
            description: 'Edición de staff',
            oldData: before,
            newData: {
                display_name: (user as any).display_name,
                is_active: (user as any).is_active,
                default_facility_id: (user as any).default_facility_id,
                is_reception_master: (user as any).is_reception_master,
            },
            req,
        });

        if (
            is_reception_master !== undefined &&
            before &&
            before.is_reception_master !== (is_reception_master === true)
        ) {
            await logAction(query, {
                adminUserId: req.user!.userId,
                actionType: 'reception_master_toggled',
                entityType: 'user',
                entityId: id,
                description: is_reception_master
                    ? 'Promovida a Reception Master'
                    : 'Desactivado Reception Master',
                oldData: { is_reception_master: before.is_reception_master },
                newData: { is_reception_master: is_reception_master === true },
                req,
            });
        }
        res.json({ user });
    } catch (error) {
        console.error('Update staff error:', error);
        res.status(500).json({ error: 'Error al actualizar staff' });
    }
});

// ============================================
// PUT /api/users/:id/reception-master — SOLO admin/super_admin prende/apaga el flag
// is_reception_master de una recepcionista. Minar un master = otorgar TODOS los permisos
// (nómina, gestionar_permisos, multi_sucursal); por eso NO es minteable por otra recepción
// master ni por una recepción con 'gestionar_permisos' (evita escalación de privilegios).
// Solo aplica a usuarios rol='reception'.
// ============================================
router.put('/:id/reception-master', requireRole('admin', 'super_admin'), async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const value = req.body.value === true;

        const target = await queryOne<{ role: string; is_reception_master: boolean; display_name: string }>(
            `SELECT role, is_reception_master, display_name FROM users WHERE id = $1`, [id]
        );
        if (!target) return res.status(404).json({ error: 'Usuario no encontrado' });
        if (target.role !== 'reception') {
            return res.status(403).json({ error: 'Solo se puede asignar master a recepcionistas.' });
        }
        if (target.is_reception_master === value) {
            return res.json({ ok: true, is_reception_master: value });
        }

        await query(`UPDATE users SET is_reception_master = $1, updated_at = NOW() WHERE id = $2`, [value, id]);

        await logAction(query, {
            adminUserId: req.user!.userId,
            actionType: 'reception_master_toggled',
            entityType: 'user',
            entityId: id,
            description: value ? 'Promovida a Reception Master' : 'Desactivado Reception Master',
            oldData: { is_reception_master: target.is_reception_master },
            newData: { is_reception_master: value },
            req,
        });

        res.json({ ok: true, is_reception_master: value });
    } catch (error) {
        console.error('PUT /users/:id/reception-master error:', error);
        res.status(500).json({ error: 'Error al actualizar permiso.' });
    }
});

// ============================================
// PUT /api/users/:id/role — promueve/regresa entre 'reception' y 'admin'. Solo admins reales
// (no minteable por una recepción master → evita escalación de privilegios). No toca super_admin,
// ni deja cambiar tu propio rol (evita auto-lockout). Queda en audit.
// ============================================
router.put('/:id/role', requireRole('admin', 'super_admin'), async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const newRole = req.body.role;
        if (newRole !== 'admin' && newRole !== 'reception') {
            return res.status(400).json({ error: "role debe ser 'admin' o 'reception'." });
        }
        const target = await queryOne<{ role: string; display_name: string }>(
            `SELECT role, display_name FROM users WHERE id = $1`, [id]
        );
        if (!target) return res.status(404).json({ error: 'Usuario no encontrado' });
        if (target.role === 'super_admin') {
            return res.status(403).json({ error: 'No se puede cambiar el rol de un super admin.' });
        }
        if (target.role !== 'reception' && target.role !== 'admin') {
            return res.status(403).json({ error: 'Solo aplica a personal de recepción o admin.' });
        }
        if (id === req.user!.userId) {
            return res.status(403).json({ error: 'No puedes cambiar tu propio rol.' });
        }
        if (target.role === newRole) return res.json({ ok: true, role: newRole });

        await query(`UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2`, [newRole, id]);

        await logAction(query, {
            adminUserId: req.user!.userId,
            actionType: 'user_role_changed',
            entityType: 'user',
            entityId: id,
            description: newRole === 'admin' ? 'Promovida a Admin' : 'Regresada a Recepción',
            oldData: { role: target.role },
            newData: { role: newRole },
            req,
        });

        res.json({ ok: true, role: newRole });
    } catch (error) {
        console.error('PUT /users/:id/role error:', error);
        res.status(500).json({ error: 'Error al cambiar el rol.' });
    }
});

// ============================================
// PUT /api/users/:id/permissions — set granular de permisos de una recepcionista.
// admin (sin topes) o reception con gestionar_permisos (con candado anti-escalación).
// Body: { permissions?: Record<string,bool>, preset?: 'normal'|'master' }
// ============================================
router.put('/:id/permissions', requirePermission('gestionar_permisos'), async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const presetName = req.body.preset as PresetName | undefined;
        const requestedRaw = presetName && PRESETS[presetName]
            ? PRESETS[presetName]
            : (req.body.permissions ?? {});

        const target = await queryOne<{ role: string; permissions: unknown }>(
            `SELECT role, permissions FROM users WHERE id = $1`, [id]
        );
        if (!target) return res.status(404).json({ error: 'Usuario no encontrado' });
        if (target.role !== 'reception') {
            return res.status(403).json({ error: 'Solo se asignan permisos a recepcionistas.' });
        }

        const current = effectivePermissions(target.permissions);
        const requested = mergeRequested(target.permissions, requestedRaw);

        // Permisos efectivos del actor (para el candado). Admin no se usa.
        const actorRow = await queryOne<{ role: string; permissions: unknown }>(
            `SELECT role, permissions FROM users WHERE id = $1`, [req.user!.userId]
        );
        const check = validatePermissionChange({
            actorRole: actorRow?.role ?? req.user!.role,
            actorIsSelf: req.user!.userId === id,
            actorPerms: effectivePermissions(actorRow?.permissions),
            current,
            requested,
        });
        if (!check.ok) return res.status(403).json({ error: check.error });

        // Sync is_reception_master con multi_sucursal (el scope sigue cableado a ese flag).
        const newIsMaster = requested.multi_sucursal === true;

        const updated = await queryOne(
            `UPDATE users SET permissions = $1::jsonb, is_reception_master = $2, updated_at = NOW()
             WHERE id = $3
             RETURNING id, display_name, role, is_reception_master, permissions`,
            [JSON.stringify(requested), newIsMaster, id]
        );

        await logAction(query, {
            adminUserId: req.user!.userId,
            actionType: 'reception_permissions_updated',
            entityType: 'user',
            entityId: id,
            description: presetName ? `Preset ${presetName} aplicado` : 'Permisos actualizados',
            oldData: current,
            newData: requested,
            req,
        });

        // Correo de bienvenida SOLO cuando la persona PASA a tener acceso de recepción
        // (no en cada edición ni al quitar permisos). No bloquea la respuesta.
        const SECTION_KEYS = ['caja', 'vender', 'inventario', 'checkin', 'clientes', 'reservas'] as const;
        const hasOperationalAccess = (p: typeof requested) => SECTION_KEYS.some((k) => p[k] === true);
        if (!hasOperationalAccess(current) && hasOperationalAccess(requested)) {
            queryOne<{ email: string | null; display_name: string }>(
                `SELECT email, display_name FROM users WHERE id = $1`, [id]
            ).then((row) => {
                if (!row?.email) return;
                const labels = SECTION_KEYS.filter((k) => requested[k] === true).map((k) => PERMISSION_LABELS[k]);
                return sendReceptionAssignedEmail({
                    to: row.email,
                    userName: row.display_name,
                    permissionLabels: labels,
                    isMaster: isMasterPreset(requested),
                });
            }).catch((e) => console.error('[email] sendReceptionAssignedEmail:', e));
        }

        res.json({ user: updated });
    } catch (error) {
        console.error('PUT /users/:id/permissions error:', error);
        res.status(500).json({ error: 'Error al actualizar permisos.' });
    }
});

// ============================================
// POST /api/users/:id/message — enviar mensaje 1:1 al cliente (WhatsApp/Email)
// ============================================
router.post('/:id/message', requirePermission('clientes'), async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { channel, body, subject } = req.body as { channel?: string; body?: string; subject?: string };

        if (!body || !body.trim()) return res.status(400).json({ error: 'El mensaje no puede estar vacío.' });
        if (channel !== 'whatsapp' && channel !== 'email') return res.status(400).json({ error: 'Canal inválido.' });

        const user = await queryOne<{ phone: string | null; email: string | null; role: string }>(
            `SELECT phone, email, role FROM users WHERE id = $1`, [id]
        );
        if (!user) return res.status(404).json({ error: 'Cliente no encontrado.' });
        if (user.role !== 'client') return res.status(403).json({ error: 'Solo se puede enviar mensajes a clientes.' });
        if (channel === 'whatsapp' && !user.phone) return res.status(400).json({ error: 'El cliente no tiene teléfono.' });
        if (channel === 'email' && !user.email) return res.status(400).json({ error: 'El cliente no tiene email.' });

        let status: 'sent' | 'failed' = 'sent';
        let errMsg: string | null = null;
        try {
            if (channel === 'whatsapp') {
                const ok = await sendWhatsAppMessage(user.phone as string, body);
                if (!ok) { status = 'failed'; errMsg = 'No se pudo enviar el WhatsApp.'; }
            } else {
                await sendPlainEmail(user.email as string, (subject && subject.trim()) || 'Mensaje de BMB Studio', body);
            }
        } catch (e: any) {
            status = 'failed';
            errMsg = e?.message || 'Error al enviar el mensaje.';
        }

        const rec = await queryOne(
            `INSERT INTO client_messages (user_id, channel, subject, body, sent_by, status, error)
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
            [id, channel, channel === 'email' ? ((subject && subject.trim()) || null) : null, body, req.user!.userId, status, errMsg]
        );

        return res.json({ message: rec, ok: status === 'sent', error: errMsg });
    } catch (error) {
        console.error('POST /users/:id/message error:', error);
        res.status(500).json({ error: 'Error al enviar el mensaje.' });
    }
});

// ============================================
// GET /api/users/:id/messages — historial de mensajes del cliente
// ============================================
router.get('/:id/messages', requirePermission('clientes'), async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const target = await queryOne<{ role: string }>(`SELECT role FROM users WHERE id = $1`, [id]);
        if (!target) return res.status(404).json({ error: 'Cliente no encontrado.' });
        if (target.role !== 'client') return res.status(403).json({ error: 'Solo clientes.' });
        const rows = await query(
            `SELECT cm.id, cm.channel, cm.subject, cm.body, cm.status, cm.error, cm.created_at,
                    u.display_name AS sent_by_name
             FROM client_messages cm
             LEFT JOIN users u ON u.id = cm.sent_by
             WHERE cm.user_id = $1
             ORDER BY cm.created_at DESC
             LIMIT 50`,
            [id]
        );
        res.json(rows);
    } catch (error) {
        console.error('GET /users/:id/messages error:', error);
        res.status(500).json({ error: 'Error al obtener el historial.' });
    }
});

// ============================================
// FOUNDERS — admin manages founder badge + benefits
// ============================================

// Self-read endpoint for the client checkout / loyalty UI (no admin required)
router.get('/me/founder-self', async (req: Request, res: Response) => {
    try {
        const u = await queryOne<any>(
            `SELECT id, is_founder, founder_first_package_used, founder_double_points_used
             FROM users WHERE id = $1`,
            [req.user!.userId]
        );
        if (!u) return res.status(404).json({ error: 'Usuario no encontrado' });
        res.json({ user: u });
    } catch (e: any) {
        res.status(500).json({ error: 'Error al obtener estado founder' });
    }
});

router.get('/:id/founder', requireRole('admin', 'super_admin'), async (req: Request, res: Response) => {
    try {
        const u = await queryOne<any>(
            `SELECT id, display_name, email, is_founder, founder_assigned_at,
                    founder_first_package_used, founder_first_used_at,
                    founder_double_points_used, founder_double_points_used_at
             FROM users WHERE id = $1`,
            [req.params.id]
        );
        if (!u) return res.status(404).json({ error: 'Usuario no encontrado' });
        const audit = await query(
            `SELECT id, action, admin_id, metadata, created_at
             FROM founder_audit WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
            [req.params.id]
        );
        res.json({ user: u, audit });
    } catch (e: any) {
        console.error('GET founder error:', e.message);
        res.status(500).json({ error: 'Error al obtener estado founder' });
    }
});

router.put('/:id/founder', requireRole('admin', 'super_admin'), async (req: Request, res: Response) => {
    const { is_founder } = req.body;
    if (typeof is_founder !== 'boolean') {
        return res.status(400).json({ error: 'is_founder must be boolean' });
    }
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const cur = await client.query(`SELECT is_founder FROM users WHERE id = $1 FOR UPDATE`, [req.params.id]);
        if (cur.rowCount === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }
        const wasAlready = cur.rows[0].is_founder === is_founder;
        if (wasAlready) {
            await client.query('ROLLBACK');
            return res.json({ ok: true, unchanged: true });
        }
        await client.query(
            `UPDATE users SET
                is_founder = $1,
                founder_assigned_at = CASE WHEN $1 THEN NOW() ELSE founder_assigned_at END
             WHERE id = $2`,
            [is_founder, req.params.id]
        );
        await client.query(
            `INSERT INTO founder_audit (user_id, action, admin_id) VALUES ($1, $2, $3)`,
            [req.params.id, is_founder ? 'granted' : 'revoked', req.user!.userId]
        );
        await client.query('COMMIT');
        res.json({ ok: true, is_founder });
    } catch (e: any) {
        await client.query('ROLLBACK');
        console.error('PUT founder error:', e.message);
        res.status(500).json({ error: 'Error al actualizar founder', detail: e.message });
    } finally {
        client.release();
    }
});

router.post('/:id/founder/reset', requireRole('admin', 'super_admin'), async (req: Request, res: Response) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const r = await client.query(
            `UPDATE users SET
                founder_first_package_used = false,
                founder_first_used_at = NULL,
                founder_double_points_used = false,
                founder_double_points_used_at = NULL
             WHERE id = $1 AND is_founder = true
             RETURNING id`,
            [req.params.id]
        );
        if (r.rowCount === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Usuario no encontrado o no es founder' });
        }
        await client.query(
            `INSERT INTO founder_audit (user_id, action, admin_id) VALUES ($1, 'reset', $2)`,
            [req.params.id, req.user!.userId]
        );
        await client.query('COMMIT');
        res.json({ ok: true });
    } catch (e: any) {
        await client.query('ROLLBACK');
        console.error('Reset founder error:', e.message);
        res.status(500).json({ error: 'Error al resetear beneficios' });
    } finally {
        client.release();
    }
});

// ============================================
// POST /api/users - Create new user (admin only)
// ============================================
const CreateMemberSchema = z.object({
    email: z.string().email('Email inválido'),
    displayName: z.string().min(2, 'El nombre debe tener al menos 2 caracteres'),
    phone: z.string().min(8, 'Teléfono inválido'),
    password: z.string().min(8).optional(),
    dateOfBirth: z.string().optional(),
    acceptsCommunications: z.boolean().optional().default(false),
    // admin/master eligen de qué WhatsApp (sucursal) sale la bienvenida con credenciales.
    whatsappKey: z.string().optional(),
});

router.post('/', requireRole('admin', 'super_admin', 'reception'), async (req: Request, res: Response) => {
    try {
        const validation = CreateMemberSchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({
                error: 'Datos inválidos',
                details: validation.error.flatten().fieldErrors,
            });
        }

        const { email, displayName, phone, password, dateOfBirth, acceptsCommunications, whatsappKey } = validation.data;

        // ¿Con qué WhatsApp (sucursal) sale la bienvenida? Mismo criterio que el reenvío:
        // admin/master eligen vía whatsappKey; recepción normal por su sucursal; si no, principal.
        let waInstance: string | undefined;
        if (whatsappKey && isElevated(req.user)) {
            waInstance = instanceByKey(whatsappKey);
        } else if (req.user?.role === 'reception') {
            const scope = await resolveRequestFacility(req.user);
            if (scope.kind === 'facility') {
                const fac = await queryOne<{ name: string }>('SELECT name FROM facilities WHERE id = $1', [scope.facilityId]);
                if (fac?.name) waInstance = instanceForFacility(fac.name);
            }
        }

        const existingUser = await queryOne<User>('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
        if (existingUser) {
            return res.status(409).json({ error: 'Email ya registrado' });
        }

        const existingPhone = await queryOne<User>('SELECT id FROM users WHERE phone = $1', [phone]);
        if (existingPhone) {
            return res.status(409).json({ error: 'Teléfono ya registrado' });
        }

        const generatedPassword = password || randomBytes(6).toString('base64url');
        const passwordHash = await bcrypt.hash(generatedPassword, 12);

        const user = await queryOne<User>(
            `INSERT INTO users (
        email, password_hash, display_name, phone, role, accepts_communications, date_of_birth
      ) VALUES ($1, $2, $3, $4, 'client', $5, $6)
      RETURNING
        id, email, phone, display_name, photo_url, role,
        emergency_contact_name, emergency_contact_phone, health_notes,
        accepts_communications, date_of_birth, receive_reminders,
        receive_promotions, receive_weekly_summary, created_at, updated_at`,
            [email.toLowerCase(), passwordHash, displayName, phone, acceptsCommunications ?? false, dateOfBirth || null]
        );

        if (!user) {
            throw new Error('Failed to create user');
        }

        // Award welcome bonus (idempotent helper, reads config from system_settings).
        // Same logic as the public signup endpoint — admin-created clients should
        // also receive the welcome points on creation.
        try {
            const welcomePoints = await awardWelcomeBonus(user.id);
            if (welcomePoints > 0) {
                void notifyPointsEarnedExternal(user.id, welcomePoints, 'welcome');
            }
        } catch (e) {
            console.error('Welcome bonus error (non-blocking):', e);
        }

        // Send welcome email + WhatsApp with credentials. We await both so the UI
        // can show real "sent" / "failed" states instead of optimistic ones, but
        // a failure does NOT abort user creation — the account already exists.
        const actualPassword = password || generatedPassword;

        const [emailResult, whatsappResult] = await Promise.allSettled([
            sendClientWelcomeEmail({
                to: email.toLowerCase(),
                clientName: displayName,
                email: email.toLowerCase(),
                temporaryPassword: actualPassword,
            }),
            sendClientWelcome(phone, displayName, email.toLowerCase(), actualPassword, undefined, waInstance),
        ]);

        const emailSent = emailResult.status === 'fulfilled' && !!emailResult.value;
        const whatsappSent = whatsappResult.status === 'fulfilled';

        if (emailResult.status === 'rejected') {
            console.error('Welcome email failed:', emailResult.reason);
        } else if (!emailResult.value) {
            console.error('Welcome email did not send (returned null) — check RESEND_API_KEY');
        }
        if (whatsappResult.status === 'rejected') {
            console.error('Welcome WhatsApp failed:', whatsappResult.reason);
        }

        res.status(201).json({
            user,
            emailSent,
            whatsappSent,
            ...(password ? {} : { tempPassword: generatedPassword }),
        });
    } catch (error) {
        console.error('Create user error:', error);
        res.status(500).json({ error: 'Error al crear usuario' });
    }
});

// ============================================
// POST /api/users/guest - Crear invitado (cliente ligero) y asignarle un plan.
// Busca por teléfono/email; si no existe lo crea. Asigna membresía 'gratis'.
// Si ya tiene membresía activa, responde 409 hasta que se confirme.
// ============================================
const GuestSchema = z.object({
    name: z.string().min(2),
    phone: z.string().min(8),
    email: z.string().email().optional(),
    planId: z.string().uuid(),
    confirm: z.boolean().optional(),
});

router.post('/guest', requireRole('admin', 'super_admin', 'reception'), async (req: Request, res: Response) => {
    const parsed = GuestSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten().fieldErrors });
    const { name, phone, email, planId, confirm } = parsed.data;
    const plan = await queryOne<any>('SELECT * FROM plans WHERE id = $1 AND is_active = true', [planId]);
    if (!plan) return res.status(404).json({ error: 'Plan no encontrado' });
    const db = await pool.connect();
    try {
        await db.query('BEGIN');
        const { userId } = await findOrCreateGuest(db, { name, phone, email });
        if (confirm !== true) {
            const active = await db.query<any>(
                `SELECT m.id, p.name FROM memberships m JOIN plans p ON p.id = m.plan_id
                  WHERE m.user_id = $1 AND m.status = 'active' ORDER BY m.end_date DESC NULLS LAST LIMIT 1`,
                [userId]);
            if (active.rows[0]) {
                await db.query('ROLLBACK');
                return res.status(409).json({ code: 'HAS_ACTIVE_MEMBERSHIP', error: `Esta persona ya tiene una membresía activa (${active.rows[0].name}). Confirma para asignar otra.`, activeMembership: active.rows[0] });
            }
        }
        const start = new Date();
        const end = new Date(start);
        end.setDate(end.getDate() + plan.duration_days);
        const policyRow = await db.query(`SELECT value FROM system_settings WHERE key = 'cancellation_policy'`);
        const cancellationLimit = Number(policyRow.rows[0]?.value?.cancellations_per_membership ?? 2);
        const membership = await db.query<any>(
            `INSERT INTO memberships (user_id, plan_id, start_date, end_date, status, classes_remaining, reformer_remaining, multi_remaining, payment_method, payment_reference, cancellation_limit, activated_by, activated_at)
             VALUES ($1,$2,$3,$4,'active',$5,$6,$7,$8,NULL,$9,$10,NOW()) RETURNING *`,
            [userId, planId, start, end, plan.class_limit ?? null, plan.reformer_credits ?? null, plan.multi_credits ?? null, 'gratis', cancellationLimit, req.user!.userId]);
        const user = await db.query<any>('SELECT id, display_name, phone, email FROM users WHERE id = $1', [userId]);
        await db.query('COMMIT');
        return res.status(201).json({ user: user.rows[0], membership: membership.rows[0] });
    } catch (e) {
        await db.query('ROLLBACK');
        console.error('Guest create error:', e);
        return res.status(500).json({ error: 'No se pudo crear el invitado' });
    } finally {
        db.release();
    }
});

// ============================================
// POST /api/users/:id/resend-credentials - Generate new temp password and resend
// (admin/super_admin y TODA recepción — la dueña pidió que recepción también pueda
// resetear credenciales de usuarios, 2026-06-23). Resets the user's password to a
// freshly generated one and sends it via email + WhatsApp. Returns the new password
// so staff can copy it manually if delivery fails.
// ============================================
router.post('/:id/resend-credentials', requireRole('admin', 'super_admin', 'reception'), async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        const target = await queryOne<{
            id: string; email: string; phone: string | null; display_name: string; role: string;
        }>(
            'SELECT id, email, phone, display_name, role FROM users WHERE id = $1',
            [id]
        );

        if (!target) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        if (!target.email && !target.phone) {
            return res.status(400).json({
                error: 'El usuario no tiene email ni teléfono — actualiza sus datos antes de reenviar.',
            });
        }

        const newPassword = randomBytes(6).toString('base64url');
        const passwordHash = await bcrypt.hash(newPassword, 12);

        await query(
            'UPDATE users SET password_hash = $1, temp_password = true, updated_at = NOW() WHERE id = $2',
            [passwordHash, id]
        );

        // ¿Con qué WhatsApp (sucursal) se manda el reenvío?
        //  - admin/super_admin/recepción master: eligen vía body.whatsappKey ('san-miguel' | 'tepa').
        //  - recepción normal: por el WhatsApp de SU sucursal (automático).
        //  - sin elección / sin sucursal: el principal (San Miguel).
        let waInstance: string | undefined;
        const whatsappKey = typeof req.body?.whatsappKey === 'string' ? req.body.whatsappKey : null;
        if (whatsappKey && isElevated(req.user)) {
            waInstance = instanceByKey(whatsappKey);
        } else if (req.user?.role === 'reception') {
            const scope = await resolveRequestFacility(req.user);
            if (scope.kind === 'facility') {
                const fac = await queryOne<{ name: string }>('SELECT name FROM facilities WHERE id = $1', [scope.facilityId]);
                if (fac?.name) waInstance = instanceForFacility(fac.name);
            }
        }

        const [emailResult, whatsappResult] = await Promise.allSettled([
            target.email
                ? (target.role === 'reception'
                    ? sendReceptionCredentials({
                        to: target.email,
                        name: target.display_name,
                        email: target.email,
                        temporaryPassword: newPassword,
                    })
                    : sendClientWelcomeEmail({
                        to: target.email,
                        clientName: target.display_name,
                        email: target.email,
                        temporaryPassword: newPassword,
                    }))
                : Promise.resolve(null),
            target.phone
                ? sendClientWelcome(target.phone, target.display_name, target.email || target.phone, newPassword, undefined, waInstance)
                : Promise.resolve(null),
        ]);

        const emailSent = !!target.email && emailResult.status === 'fulfilled' && !!emailResult.value;
        const whatsappSent = !!target.phone && whatsappResult.status === 'fulfilled';

        if (emailResult.status === 'rejected') {
            console.error('Resend credentials email failed:', emailResult.reason);
        }
        if (whatsappResult.status === 'rejected') {
            console.error('Resend credentials WhatsApp failed:', whatsappResult.reason);
        }

        res.json({
            tempPassword: newPassword,
            emailSent,
            whatsappSent,
            channels: {
                email: target.email || null,
                phone: target.phone || null,
            },
        });
    } catch (error) {
        console.error('Resend credentials error:', error);
        res.status(500).json({ error: 'Error al reenviar credenciales' });
    }
});

// ============================================
// GET /api/users/:id - Get user by ID
// ============================================
router.get('/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        // Users can only view their own profile unless admin
        if (req.user!.userId !== id && req.user!.role !== 'admin') {
            return res.status(403).json({ error: 'Acceso denegado' });
        }

        const user = await queryOne<User>(
            `SELECT
        id, email, phone, display_name, photo_url, role,
        emergency_contact_name, emergency_contact_phone, health_notes,
        tags, reception_notes,
        accepts_communications, date_of_birth, receive_reminders,
        receive_promotions, receive_weekly_summary, created_at, updated_at
      FROM users
      WHERE id = $1`,
            [id]
        );

        if (!user) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        res.json({ user });
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({ error: 'Error al obtener usuario' });
    }
});

// ============================================
// PUT /api/users/:id - Update user profile
// ============================================
router.put('/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const role = req.user!.role;
        const isAdmin = role === 'admin' || role === 'super_admin';
        const isReception = role === 'reception';
        const isSelf = req.user!.userId === id;

        // Permisos:
        // - El propio usuario edita su perfil.
        // - admin/super_admin edita a cualquiera (incluye is_active).
        // - reception edita SOLO clientes; campos limitados (no is_active, no role).
        if (!isSelf && !isAdmin && !isReception) {
            return res.status(403).json({ error: 'Acceso denegado' });
        }
        if (isReception && !isSelf) {
            const target = await queryOne<{ role: string }>('SELECT role FROM users WHERE id = $1', [id]);
            if (!target) return res.status(404).json({ error: 'Usuario no encontrado' });
            if (target.role !== 'client') {
                return res.status(403).json({ error: 'Recepción solo puede editar perfiles de clientes' });
            }
        }

        // is_active solo para admin (ni el propio usuario ni reception lo pueden tocar).
        if (req.body.isActive !== undefined && isAdmin) {
            const user = await queryOne<User>(
                'UPDATE users SET is_active = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
                [req.body.isActive, id]
            );
            return res.json({ message: 'Estado de usuario actualizado', user });
        }

        // Validate input

        const validation = UpdateProfileSchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({
                error: 'Datos inválidos',
                details: validation.error.flatten().fieldErrors,
            });
        }

        const data = validation.data;

        // Build dynamic update query
        const updates: string[] = [];
        const values: any[] = [];
        let paramCount = 1;

        if (data.displayName !== undefined) {
            updates.push(`display_name = $${paramCount++}`);
            values.push(data.displayName);
        }
        if (data.email !== undefined) {
            const normalizedEmail = data.email.trim().toLowerCase();
            const taken = await queryOne<{ id: string }>(
                `SELECT id FROM users WHERE lower(email) = $1 AND id <> $2`,
                [normalizedEmail, id]
            );
            if (taken) {
                return res.status(409).json({ error: 'Ese correo ya está en uso por otra cuenta.' });
            }
            updates.push(`email = $${paramCount++}`);
            values.push(normalizedEmail);
        }
        if (data.phone !== undefined) {
            updates.push(`phone = $${paramCount++}`);
            values.push(data.phone);
        }
        if (data.dateOfBirth !== undefined) {
            updates.push(`date_of_birth = $${paramCount++}`);
            values.push(data.dateOfBirth || null);
        }
        if (data.emergencyContactName !== undefined) {
            updates.push(`emergency_contact_name = $${paramCount++}`);
            values.push(data.emergencyContactName || null);
        }
        if (data.emergencyContactPhone !== undefined) {
            updates.push(`emergency_contact_phone = $${paramCount++}`);
            values.push(data.emergencyContactPhone || null);
        }
        if (data.healthNotes !== undefined) {
            updates.push(`health_notes = $${paramCount++}`);
            values.push(data.healthNotes || null);
        }
        // tags y reception_notes no forman parte de UpdateProfileSchema (Zod descarta
        // claves desconocidas), así que se leen directo de req.body.
        if (req.body.tags !== undefined) {
            const tags = Array.isArray(req.body.tags)
                ? (req.body.tags as string[]).filter((t) => isValidTag(t))
                : [];
            updates.push(`tags = $${paramCount++}`);
            values.push(tags);
        }
        if (req.body.receptionNotes !== undefined) {
            updates.push(`reception_notes = $${paramCount++}`);
            values.push(req.body.receptionNotes || null);
        }
        if (data.receiveReminders !== undefined) {
            updates.push(`receive_reminders = $${paramCount++}`);
            values.push(data.receiveReminders);
        }
        if (data.receivePromotions !== undefined) {
            updates.push(`receive_promotions = $${paramCount++}`);
            values.push(data.receivePromotions);
        }
        if (data.receiveWeeklySummary !== undefined) {
            updates.push(`receive_weekly_summary = $${paramCount++}`);
            values.push(data.receiveWeeklySummary);
        }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'No hay datos para actualizar' });
        }

        updates.push('updated_at = NOW()');
        values.push(id);

        const user = await queryOne<User>(
            `UPDATE users 
       SET ${updates.join(', ')} 
       WHERE id = $${paramCount}
       RETURNING
        id, email, phone, display_name, photo_url, role,
        emergency_contact_name, emergency_contact_phone, health_notes,
        tags, reception_notes,
        accepts_communications, date_of_birth, receive_reminders,
        receive_promotions, receive_weekly_summary, created_at, updated_at`,
            values
        );

        if (!user) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        res.json({
            message: 'Perfil actualizado exitosamente',
            user
        });
    } catch (error) {
        console.error('Update user error:', error);
        res.status(500).json({ error: 'Error al actualizar usuario' });
    }
});

// ============================================
// GET /api/users - List all users (admin only)
// ============================================
router.get('/', requireRole('admin', 'super_admin', 'reception'), async (req: Request, res: Response) => {
    try {
        let { role } = req.query;
        const {
            search, limit = 50, offset = 0, withMembership,
            membershipStatus, planId, facilityId, tag, sort, withCounts,
        } = req.query;

        // Defensa: recepción solo enumera clientes, no staff. Forzamos role='client'
        // independientemente de lo que venga en el query (404 si pide otro role).
        if (req.user?.role === 'reception') {
            if (role && role !== 'client') {
                return res.status(403).json({ error: 'Solo puedes listar clientes' });
            }
            role = 'client';
        }

        // ¿Necesitamos el join con la membresía vigente? (para filtrar/ordenar o mostrar plan)
        const needMemb =
            withMembership === 'true' ||
            withCounts === 'true' ||
            !!membershipStatus ||
            !!planId ||
            !!facilityId ||
            sort === 'expiring';

        const membJoin = needMemb ? `
      LEFT JOIN LATERAL (
        SELECT * FROM memberships
        WHERE user_id = u.id
        ORDER BY
          CASE WHEN status = 'active' THEN 0
               WHEN status = 'pending_activation' THEN 1
               WHEN status = 'pending_payment' THEN 2
               ELSE 3 END,
          created_at DESC
        LIMIT 1
      ) m ON true
      LEFT JOIN plans p ON m.plan_id = p.id
      ` : '';

        // WHERE compartido entre la query de datos y la de conteo.
        const params: any[] = [];
        let paramCount = 1;
        let where = ' WHERE 1=1';

        if (role) {
            where += ` AND u.role = $${paramCount++}`;
            params.push(role);
        }
        if (search) {
            // Búsqueda por NOMBRE insensible a acentos Y a espacios extra (ej. "Raul Sanchez"
            // encuentra "Raúl  Sánchez Ávila"). translate() quita acentos; regexp_replace colapsa
            // espacios; lower() ignora mayúsculas. Email/teléfono se buscan tal cual.
            const norm = (col: string) =>
                `regexp_replace(translate(lower(${col}), 'áéíóúüñ', 'aeiouun'), '\\s+', ' ', 'g')`;
            where += ` AND (${norm('u.display_name')} ILIKE ${norm(`$${paramCount}`)} OR u.email ILIKE $${paramCount} OR u.phone ILIKE $${paramCount})`;
            params.push(`%${search}%`);
            paramCount++;
        }
        if (tag) {
            where += ` AND $${paramCount++} = ANY(u.tags)`;
            params.push(tag);
        }
        if (planId) {
            where += ` AND m.plan_id = $${paramCount++}`;
            params.push(planId);
        }
        if (facilityId) {
            where += ` AND m.facility_id = $${paramCount++}`;
            params.push(facilityId);
        }
        // WHERE base SIN el filtro de estado: los conteos por estado se calculan sobre esto
        // (mismos params) para que el total de cada estado no dependa del estado seleccionado.
        const whereNoStatus = where;
        // Condición de estado de membresía AL FINAL (no agrega params).
        if (membershipStatus === 'none') {
            where += ` AND m.id IS NULL`;
        } else if (membershipStatus === 'active') {
            where += ` AND m.status = 'active'`;
        } else if (membershipStatus === 'expired') {
            where += ` AND m.id IS NOT NULL AND (m.status IN ('expired','cancelled') OR (m.end_date IS NOT NULL AND m.end_date < CURRENT_DATE))`;
        }

        // Orden.
        let orderBy = ' ORDER BY u.created_at DESC';
        if (sort === 'name') orderBy = ' ORDER BY u.display_name ASC';
        else if (sort === 'expiring' && needMemb) orderBy = ' ORDER BY m.end_date ASC NULLS LAST';

        const membCols = needMemb ? `,
        m.id as membership_id,
        m.status as membership_status,
        m.start_date as membership_start_date,
        m.end_date as membership_end_date,
        m.classes_remaining, m.reformer_remaining, m.multi_remaining,
        m.facility_id as membership_facility_id,
        p.id as plan_id, p.name as plan_name, p.class_limit, p.price as plan_price` : '';

        const fromClause = ` FROM users u ${membJoin}`;
        const dataQuery = `SELECT
        u.id, u.email, u.phone, u.display_name, u.photo_url, u.role, u.is_active,
        u.is_founder, u.founder_first_package_used, u.founder_double_points_used,
        u.tags, u.reception_notes, u.health_notes, u.created_at, u.updated_at${membCols}
      ${fromClause}${where}${orderBy} LIMIT $${paramCount++} OFFSET $${paramCount}`;
        const users = await query<User>(dataQuery, [...params, Number(limit), Number(offset)]);

        const countResult = await queryOne<{ total: string }>(
            `SELECT COUNT(*) as total${fromClause}${where}`,
            params
        );
        const total = parseInt(countResult?.total || '0', 10);

        // Conteos por estado de membresía (para mostrar el número en cada filtro). Se calculan
        // sobre whereNoStatus, así que no cambian al seleccionar un estado. Mismos params.
        let counts: { active: number; expired: number; none: number; total: number } | undefined;
        if (withCounts === 'true') {
            const c = await queryOne<{ active: string; expired: string; none: string; total: string }>(
                `SELECT
                    COUNT(*) FILTER (WHERE m.status = 'active') AS active,
                    COUNT(*) FILTER (WHERE m.id IS NOT NULL AND (m.status IN ('expired','cancelled') OR (m.end_date IS NOT NULL AND m.end_date < CURRENT_DATE))) AS expired,
                    COUNT(*) FILTER (WHERE m.id IS NULL) AS none,
                    COUNT(*) AS total
                 ${fromClause}${whereNoStatus}`,
                params
            );
            counts = {
                active: parseInt(c?.active || '0', 10),
                expired: parseInt(c?.expired || '0', 10),
                none: parseInt(c?.none || '0', 10),
                total: parseInt(c?.total || '0', 10),
            };
        }

        res.json({
            users,
            pagination: {
                total,
                limit: Number(limit),
                offset: Number(offset),
            },
            ...(counts ? { counts } : {}),
        });
    } catch (error) {
        console.error('List users error:', error);
        res.status(500).json({ error: 'Error al listar usuarios' });
    }
});

// ============================================
// DELETE /api/users/:id - Delete user account
// ============================================
router.delete('/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        if (req.user!.role !== 'admin') {
            return res.status(403).json({ error: 'Acceso denegado. Solo administradores pueden eliminar usuarios.' });
        }

        if (req.user!.userId === id) {
            return res.status(400).json({ error: 'No puedes eliminar tu propio usuario.' });
        }

        const existing = await queryOne<{ id: string }>('SELECT id FROM users WHERE id = $1', [id]);
        if (!existing) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        // Borrado SIEMPRE permanente (decisión de la dueña: "borrar de verdad").
        // Los registros PROPIOS del cliente (bookings/memberships/payments/orders.user_id)
        // son ON DELETE CASCADE o SET NULL, así que se borran o se desligan solos. Las
        // columnas "by/staff" (created_by, checked_in_by, processed_by, etc.) son NO ACTION
        // y se anulan abajo. Si alguna referencia obligatoria (NOT NULL, típica de cuentas
        // de staff) impidiera el borrado, hay un fallback a desactivar para no romper.

        // HARD DELETE — wrapped in a transaction so we can null out non-cascade
        // FK references (activated_by, cancelled_by, etc) before deleting users.
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Null out user references in tables that don't cascade.
            // Each UPDATE runs inside its own SAVEPOINT so a failure (e.g. column is
            // NOT NULL, table missing, etc.) doesn't abort the whole transaction.
            // Columnas "by/staff" que referencian users con NO ACTION (verificadas en prod).
            // Se anulan antes de borrar para no quedar bloqueados. Las que no existen o no
            // son nullable se ignoran por SAVEPOINT más abajo.
            const nullableRefs: Array<[string, string]> = [
                ['memberships', 'activated_by'],
                ['bookings', 'cancelled_by'],
                ['bookings', 'checked_in_by'],
                ['bookings', 'booked_by'],
                ['orders', 'fulfilled_by'],
                ['orders', 'approved_by'],
                ['orders', 'rejected_by'],
                ['payments', 'processed_by'],
                ['settings', 'updated_by'],
                ['system_settings', 'updated_by'],
                ['referrals', 'created_by'],
                ['admin_notes', 'created_by'],
                ['cash_shifts', 'opened_by'],
                ['cash_shifts', 'closed_by'],
                ['cash_movements', 'created_by'],
                ['client_messages', 'sent_by'],
                ['coach_payouts', 'paid_by'],
                ['commission_payouts', 'paid_by'],
                ['classes', 'cancelled_by'],
                ['checkin_logs', 'checked_in_by'],
                ['event_registrations', 'checked_in_by'],
                ['guest_bookings', 'checked_in_by'],
                ['guest_bookings', 'created_by'],
                ['manual_incomes', 'processed_by'],
                ['payment_proofs', 'reviewed_by'],
                ['redemptions', 'fulfilled_by'],
                ['reviews', 'moderated_by'],
                ['suspicious_activity', 'reviewed_by'],
                ['video_purchases', 'approved_by'],
                ['video_purchases', 'rejected_by'],
            ];
            const blockingRefs: Array<{ table: string; col: string; detail: string }> = [];
            for (const [table, col] of nullableRefs) {
                await client.query('SAVEPOINT null_ref');
                try {
                    await client.query(`UPDATE ${table} SET ${col} = NULL WHERE ${col} = $1`, [id]);
                    await client.query('RELEASE SAVEPOINT null_ref');
                } catch (e: any) {
                    await client.query('ROLLBACK TO SAVEPOINT null_ref');
                    // 42P01 (undefined_table) and 42703 (undefined_column) are safe to ignore.
                    // 23502 (not_null_violation) means we cannot null this ref — record it so
                    // the outer handler can fall back to soft delete with a useful detail.
                    if (e?.code === '42P01' || e?.code === '42703') continue;
                    if (e?.code === '23502') {
                        blockingRefs.push({ table, col, detail: e.detail || e.message });
                        continue;
                    }
                    throw e;
                }
            }

            if (blockingRefs.length > 0) {
                await client.query('ROLLBACK');
                await query(
                    'UPDATE users SET is_active = false, updated_at = NOW() WHERE id = $1',
                    [id]
                );
                return res.json({
                    message: 'No se pudo borrar permanentemente: el usuario tiene registros con referencias obligatorias (notas/historial); se desactivó en su lugar.',
                    type: 'soft_delete',
                    blocked_by: blockingRefs.map((r) => `${r.table}.${r.col}`),
                });
            }

            const { rows } = await client.query(
                'DELETE FROM users WHERE id = $1 RETURNING id',
                [id]
            );

            if (rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ error: 'Usuario no encontrado' });
            }

            await client.query('COMMIT');
            return res.json({
                message: 'Usuario eliminado permanentemente.',
                type: 'hard_delete',
                id: rows[0].id,
            });
        } catch (err: any) {
            try { await client.query('ROLLBACK'); } catch { /* noop */ }

            // FK violation we can't resolve — fall back to soft delete with clear message.
            if (err?.code === '23503') {
                console.error('Hard delete blocked by FK, falling back to soft delete:', err.detail || err);
                await query(
                    'UPDATE users SET is_active = false, updated_at = NOW() WHERE id = $1',
                    [id]
                );
                return res.json({
                    message: 'No se pudo borrar permanentemente por datos relacionados; se desactivó el usuario en su lugar.',
                    type: 'soft_delete',
                    detail: err.detail || null,
                });
            }
            throw err;
        } finally {
            client.release();
        }
    } catch (error: any) {
        console.error('Delete user error:', error);
        res.status(500).json({ error: error?.message || 'Error al eliminar cuenta' });
    }
});

// ============================================
// PATCH /api/users/:id/status - Toggle user active status (admin)
// ============================================
router.patch('/:id/status', requireRole('admin'), async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { is_active } = req.body;

        if (typeof is_active !== 'boolean') {
            return res.status(400).json({ error: 'is_active debe ser un booleano' });
        }

        const user = await queryOne(
            `UPDATE users SET is_active = $1, updated_at = NOW()
             WHERE id = $2
             RETURNING id, email, display_name, is_active, updated_at`,
            [is_active, id]
        );

        if (!user) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        res.json({ message: is_active ? 'Usuario activado' : 'Usuario desactivado', user });
    } catch (error) {
        console.error('Toggle user status error:', error);
        res.status(500).json({ error: 'Error al actualizar estado del usuario' });
    }
});

// ============================================
// POST /api/users/:id/photo - Upload profile photo (multipart)
// ============================================
router.post('/:id/photo', photoUpload.single('photo'), async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        if (req.user!.userId !== id && req.user!.role !== 'admin') {
            return res.status(403).json({ error: 'Acceso denegado' });
        }

        const file = req.file;
        if (!file) return res.status(400).json({ error: 'Debes adjuntar una imagen' });
        if (!file.mimetype.startsWith('image/')) {
            return res.status(400).json({ error: 'El archivo debe ser una imagen' });
        }

        let photoUrl: string | null = null;

        if (isGoogleDriveConfigured) {
            try {
                const uploaded = await uploadBufferToGoogleDrive(
                    file.buffer,
                    `profile-${id}.jpg`,
                    file.mimetype,
                );
                photoUrl = driveImageUrl(uploaded.fileId, 1600);
            } catch (err) {
                console.warn('[photo] Drive upload failed, falling back to base64 DB:', err);
            }
        }

        if (!photoUrl) {
            // Base64 fallback: imagen ya viene optimizada desde el cliente
            if (file.size > 2 * 1024 * 1024) {
                return res.status(413).json({
                    error: 'Imagen demasiado grande para almacenamiento local (máx 2MB)',
                });
            }
            photoUrl = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
        }

        const user = await queryOne<User>(
            `UPDATE users SET photo_url = $1, updated_at = NOW() WHERE id = $2
             RETURNING id, email, phone, display_name, photo_url, role,
             emergency_contact_name, emergency_contact_phone, health_notes,
             accepts_communications, date_of_birth, receive_reminders,
             receive_promotions, receive_weekly_summary, created_at, updated_at`,
            [photoUrl, id]
        );

        if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

        res.json({ message: 'Foto actualizada', user, photo_url: photoUrl });
    } catch (error: any) {
        console.error('Upload profile photo error:', error);
        const detail = error?.message || String(error);
        res.status(500).json({ error: `Error al subir la foto: ${detail}` });
    }
});

export default router;
