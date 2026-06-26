import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { query, queryOne } from '../config/database.js';
import { awardWelcomeBonus } from '../lib/loyalty.js';
import { notifyPointsEarnedExternal } from '../lib/notifications.js';
import {
    authenticate,
    generateToken,
    generateResetToken,
    verifyResetToken,
    generateMagicLinkToken,
    verifyMagicLinkToken
} from '../middleware/auth.js';
import {
    RegisterSchema,
    LoginSchema,
    ForgotPasswordSchema,
    ResetPasswordSchema,
    User,
    JwtPayload,
} from '../types/auth.js';
import { sendInstructorMagicLink, sendPasswordResetEmail, sendClientWelcomeEmail } from '../services/email.js';
import { sendClientWelcome, sendWhatsAppMessage } from '../lib/whatsapp.js';
import { z } from 'zod';

const router = Router();

// ============================================
// POST /api/auth/register - Register new user
// ============================================
router.post('/register', async (req: Request, res: Response) => {
    try {
        // Validate input
        const validation = RegisterSchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({
                error: 'Datos inválidos',
                details: validation.error.flatten().fieldErrors,
            });
        }

        const { email, password, displayName, phone, dateOfBirth, acceptsCommunications, referralCode } = validation.data;

        // Check if user already exists
        const existingUser = await queryOne<User>(
            'SELECT id FROM users WHERE email = $1',
            [email.toLowerCase()]
        );

        if (existingUser) {
            return res.status(409).json({
                error: 'Email ya registrado',
                message: 'Ya existe una cuenta con este correo electrónico',
            });
        }

        // Check if phone already exists
        const existingPhone = await queryOne<User>(
            'SELECT id FROM users WHERE phone = $1',
            [phone]
        );

        if (existingPhone) {
            return res.status(409).json({
                error: 'Teléfono ya registrado',
                message: 'Ya existe una cuenta con este número de teléfono',
            });
        }

        // Hash password
        const passwordHash = await bcrypt.hash(password, 12);

        // Insert user
        const result = await queryOne<User>(
            `INSERT INTO users (
        email,
        password_hash,
        display_name,
        phone,
        role,
        accepts_communications,
        date_of_birth,
        accepted_terms_at
      ) VALUES ($1, $2, $3, $4, 'client', $5, $6, NOW())
      RETURNING
        id, email, phone, display_name, photo_url, role,
        emergency_contact_name, emergency_contact_phone, health_notes,
        accepts_communications, date_of_birth, receive_reminders,
        receive_promotions, receive_weekly_summary, created_at, updated_at`,
            [email.toLowerCase(), passwordHash, displayName, phone, acceptsCommunications, dateOfBirth || null]
        );

        if (!result) {
            throw new Error('Failed to create user');
        }

        // Generate referral code for new user
        try {
            const prefix = (displayName ?? 'USER')
                .normalize('NFD').replace(/[̀-ͯ]/g, '')
                .replace(/[^a-zA-Z]/g, '')
                .toUpperCase().slice(0, 5) || 'USER';
            const suffix = result.id.replace(/-/g, '').toUpperCase().slice(0, 5);
            const referralCode = `${prefix}-${suffix}`;
            // Referidos desactivados: ya NO se crea la entrada en discount_codes al
            // registrarse (se conserva el referral_code en users; reversible).
            await query(`UPDATE users SET referral_code = $1 WHERE id = $2`, [referralCode, result.id]);
        } catch (e) {
            console.error('Referral code generation error (non-blocking):', e);
        }

        // Award welcome bonus (idempotent helper, reads config from system_settings)
        try {
            const welcomePoints = await awardWelcomeBonus(result.id);
            if (welcomePoints > 0) {
                void notifyPointsEarnedExternal(result.id, welcomePoints, 'welcome');
            }
        } catch (e) {
            console.error('Welcome bonus error (non-blocking):', e);
        }

        // If referralCode was provided, link the new user to the referrer
        // (the +40 referral bonus is granted on FIRST PAID ORDER, not at signup)
        if (referralCode) {
            try {
                const refCode = await queryOne<any>(
                    `SELECT id, referral_owner_id FROM discount_codes
                     WHERE code = $1 AND is_referral = true AND is_active = true`,
                    [referralCode.toUpperCase()]
                );
                if (refCode && refCode.referral_owner_id && refCode.referral_owner_id !== result.id) {
                    await query(
                        `UPDATE users SET referred_by_user_id = $1 WHERE id = $2`,
                        [refCode.referral_owner_id, result.id]
                    );
                }
            } catch (e) {
                console.error('Referral link error (non-blocking):', e);
            }
        }

        // Send welcome email + WhatsApp (fire and forget)
        sendClientWelcomeEmail({
            to: email.toLowerCase(),
            clientName: displayName,
            email: email.toLowerCase(),
            temporaryPassword: password,
        }).catch(err => console.error('Error sending welcome email:', err));

        sendClientWelcome(
            phone,
            displayName,
            email.toLowerCase(),
            password,
        ).catch(err => console.error('Error sending welcome WhatsApp:', err));

        // Generate JWT token
        const tokenPayload: JwtPayload = {
            userId: result.id,
            email: result.email,
            role: result.role,
        };
        const token = generateToken(tokenPayload);

        // Return user and token
        res.status(201).json({
            message: 'Cuenta creada exitosamente',
            user: result,
            token,
        });
    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ error: 'Error al crear la cuenta' });
    }
});

// ============================================
// POST /api/auth/login - Login user
// ============================================
router.post('/login', async (req: Request, res: Response) => {
    try {
        // Validate input
        const validation = LoginSchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({
                error: 'Datos inválidos',
                details: validation.error.flatten().fieldErrors,
            });
        }

        const { email, password } = validation.data;

        // Find user with password
        const user = await queryOne<User & { password_hash: string; is_active: boolean }>(
            `SELECT
        id, email, phone, display_name, photo_url, role,
        emergency_contact_name, emergency_contact_phone, health_notes,
        accepts_communications, date_of_birth, receive_reminders,
        receive_promotions, receive_weekly_summary, created_at, updated_at,
        is_reception_master, permissions, is_active, temp_password,
        password_hash
      FROM users
      WHERE email = $1`,
            [email.toLowerCase()]
        );

        if (!user) {
            return res.status(401).json({
                error: 'Credenciales inválidas',
                message: 'Email o contraseña incorrectos',
            });
        }

        // Verify password
        const isValidPassword = await bcrypt.compare(password, user.password_hash);
        if (!isValidPassword) {
            return res.status(401).json({
                error: 'Credenciales inválidas',
                message: 'Email o contraseña incorrectos',
            });
        }

        // Cuenta desactivada (baja de staff o cliente baneado): no se puede iniciar sesión.
        if (user.is_active === false) {
            return res.status(403).json({
                error: 'Cuenta desactivada',
                message: 'Tu cuenta está desactivada. Contacta al estudio.',
            });
        }

        // Si es coach, incluir su instructorId en el token (igual que el coach login) para que
        // su portal funcione aunque entre por el login del studio (antes faltaba → 403/0 datos).
        let instructorId: string | undefined;
        if (user.role === 'instructor') {
            const inst = await queryOne<{ id: string }>('SELECT id FROM instructors WHERE user_id = $1', [user.id]);
            instructorId = inst?.id;
        }

        // Generate JWT token
        const tokenPayload: JwtPayload = {
            userId: user.id,
            email: user.email,
            role: user.role,
            instructorId,
            isReceptionMaster: user.is_reception_master === true,
        };
        const token = generateToken(tokenPayload);

        // Remove password hash from response
        const { password_hash, ...userWithoutPassword } = user;

        res.json({
            message: 'Inicio de sesión exitoso',
            user: userWithoutPassword,
            token,
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Error al iniciar sesión' });
    }
});

// ============================================
// GET /api/auth/me - Get current user
// ============================================
router.get('/me', authenticate, async (req: Request, res: Response) => {
    try {
        const user = await queryOne<User & { instructor_id?: string; coach_number?: string; default_facility_id?: string; facility_name?: string; is_reception_master?: boolean }>(
            `SELECT
                u.id, u.email, u.phone, u.display_name, u.photo_url, u.role,
                u.emergency_contact_name, u.emergency_contact_phone, u.health_notes,
                u.accepts_communications, u.date_of_birth, u.receive_reminders,
                u.receive_promotions, u.receive_weekly_summary, u.created_at, u.updated_at,
                u.default_facility_id, u.is_reception_master, u.permissions, u.temp_password,
                u.reglamento_accepted_at,
                u.onboarding_completed_at, u.onboarding_required, u.onboarding_invite_dismissed_at,
                f.name AS facility_name,
                i.id as instructor_id, i.coach_number, i.bio as instructor_bio,
                i.photo_url as instructor_photo
            FROM users u
            LEFT JOIN facilities f ON f.id = u.default_facility_id
            LEFT JOIN instructors i ON i.user_id = u.id
            WHERE u.id = $1`,
            [req.user!.userId]
        );

        if (!user) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        // If user has instructor linked, include that info
        const response: any = {
            user: {
                ...user,
                is_instructor: !!user.instructor_id,
                is_reception_master: user.is_reception_master === true,
                permissions: (user as any).permissions ?? {},
                temp_password: (user as any).temp_password === true,
                default_facility_id: user.default_facility_id ?? null,
                facility_name: user.facility_name ?? null,
            }
        };

        // If instructor, include instructor details
        if (user.instructor_id) {
            response.instructor = {
                id: user.instructor_id,
                coach_number: user.coach_number,
            };
        }

        res.json(response);
    } catch (error) {
        console.error('Get me error:', error);
        res.status(500).json({ error: 'Error al obtener usuario' });
    }
});

// ============================================
// POST /api/auth/accept-reglamento - La usuaria acepta el reglamento del estudio.
// Obligatorio antes de su primera reserva (el gate vive en POST /api/bookings).
// ============================================
router.post('/accept-reglamento', authenticate, async (req: Request, res: Response) => {
    try {
        await query(
            `UPDATE users SET reglamento_accepted_at = COALESCE(reglamento_accepted_at, NOW()), updated_at = NOW()
             WHERE id = $1`,
            [req.user!.userId]
        );
        const row = await queryOne<{ reglamento_accepted_at: string }>(
            `SELECT reglamento_accepted_at FROM users WHERE id = $1`,
            [req.user!.userId]
        );
        res.json({ reglamento_accepted_at: row?.reglamento_accepted_at ?? null });
    } catch (error) {
        console.error('Accept reglamento error:', error);
        res.status(500).json({ error: 'Error al aceptar el reglamento' });
    }
});

// ============================================
// POST /api/auth/forgot-password - Request password reset
// ============================================
router.post('/forgot-password', async (req: Request, res: Response) => {
    try {
        const validation = ForgotPasswordSchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({
                error: 'Datos inválidos',
                details: validation.error.flatten().fieldErrors,
            });
        }

        const { email } = validation.data;

        // Find user
        const user = await queryOne<{ id: string; email: string; phone: string | null; display_name: string }>(
            'SELECT id, email, phone, display_name FROM users WHERE email = $1',
            [email.toLowerCase()]
        );

        // Always return success to prevent email enumeration
        if (!user) {
            return res.json({
                message: 'Si el email existe, recibirás instrucciones para restablecer tu contraseña',
            });
        }

        // Generate reset token
        const resetToken = generateResetToken(user.id);

        // Send email with reset link
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        const resetLink = `${frontendUrl}/reset-password?token=${resetToken}`;

        // Send email in background to prevent request timeout
        sendPasswordResetEmail({
            to: email,
            resetLink,
        }).catch(emailError => {
            console.error('Failed to send reset email:', emailError);
        });

        // WhatsApp con el enlace de reseteo (uno de los 3 mensajes permitidos por
        // la política 2026-06-23). Best-effort: solo si la cuenta tiene teléfono.
        if (user.phone) {
            sendWhatsAppMessage(
                user.phone,
                `🔑 *Restablecer contraseña*\n\n` +
                `Hola ${user.display_name},\n\n` +
                `Solicitaste restablecer tu contraseña en BMB Studio. Abre este enlace para crear una nueva:\n\n` +
                `${resetLink}\n\n` +
                `Si no fuiste tú, ignora este mensaje.`,
            ).catch(waError => {
                console.error('Failed to send reset WhatsApp:', waError);
            });
        }

        res.json({
            message: 'Si el email existe, recibirás instrucciones para restablecer tu contraseña',
            // Only in development:
            ...(process.env.NODE_ENV === 'development' && { token: resetToken }),
        });
    } catch (error) {
        console.error('Forgot password error:', error);
        res.status(500).json({ error: 'Error al procesar solicitud' });
    }
});

// ============================================
// POST /api/auth/reset-password - Reset password with token
// ============================================
router.post('/reset-password', async (req: Request, res: Response) => {
    try {
        const validation = ResetPasswordSchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({
                error: 'Datos inválidos',
                details: validation.error.flatten().fieldErrors,
            });
        }

        const { token, password } = validation.data;

        // Verify token
        const tokenData = verifyResetToken(token);
        if (!tokenData) {
            return res.status(400).json({
                error: 'Token inválido o expirado',
                message: 'El enlace de recuperación ha expirado o es inválido',
            });
        }

        // Hash new password
        const passwordHash = await bcrypt.hash(password, 12);

        // Update password (también limpia temp_password: si reseteó por este flujo, ya no es temporal).
        const result = await query(
            'UPDATE users SET password_hash = $1, temp_password = false, updated_at = NOW() WHERE id = $2',
            [passwordHash, tokenData.userId]
        );

        res.json({ message: 'Contraseña actualizada exitosamente' });
    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({ error: 'Error al restablecer contraseña' });
    }
});

// ============================================
// POST /api/auth/change-password - Change password (authenticated)
// ============================================
router.post('/change-password', authenticate, async (req: Request, res: Response) => {
    try {
        const currentPassword = typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : '';
        const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ error: 'Datos incompletos' });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres' });
        }

        if (newPassword.length > 100) {
            return res.status(400).json({ error: 'La nueva contraseña es demasiado larga' });
        }

        if (currentPassword === newPassword) {
            return res.status(400).json({ error: 'La nueva contraseña debe ser distinta a la actual' });
        }

        const user = await queryOne<{ password_hash: string }>(
            'SELECT password_hash FROM users WHERE id = $1',
            [req.user!.userId]
        );

        if (!user) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        const isValid = await bcrypt.compare(currentPassword, user.password_hash);
        if (!isValid) {
            return res.status(401).json({
                error: 'Contraseña incorrecta',
                message: 'La contraseña actual es incorrecta',
            });
        }

        const passwordHash = await bcrypt.hash(newPassword, 12);

        // También limpia temp_password: si el usuario eligió su propia contraseña, ya no es temporal.
        await query(
            'UPDATE users SET password_hash = $1, temp_password = false, updated_at = NOW() WHERE id = $2',
            [passwordHash, req.user!.userId]
        );

        res.json({ message: 'Contraseña cambiada exitosamente' });
    } catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({ error: 'Error al cambiar contraseña' });
    }
});

// ============================================
// POST /api/auth/complete-onboarding - Primer ingreso con contraseña temporal:
// el usuario fija su contraseña nueva y completa sus datos (nombre + teléfono).
// No pide la contraseña actual (ya está autenticado por el token de ese primer login).
// ============================================
router.post('/complete-onboarding', authenticate, async (req: Request, res: Response) => {
    try {
        const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';
        const displayName = typeof req.body?.displayName === 'string' ? req.body.displayName.trim() : '';
        const phone = typeof req.body?.phone === 'string' ? req.body.phone.trim() : '';

        if (newPassword.length < 6) {
            return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
        }
        if (newPassword.length > 100) {
            return res.status(400).json({ error: 'La contraseña es demasiado larga' });
        }
        if (!displayName) {
            return res.status(400).json({ error: 'Tu nombre es requerido' });
        }
        if (!phone || phone.replace(/\D/g, '').length < 10) {
            return res.status(400).json({ error: 'Un teléfono válido (10 dígitos) es requerido' });
        }

        // Solo aplica en el PRIMER ingreso (temp_password=true). Si no, este camino (que no pide la
        // contraseña actual) no debe usarse: hay que cambiarla por /change-password. Cierra el bypass.
        const me = await queryOne<{ temp_password: boolean }>(
            'SELECT temp_password FROM users WHERE id = $1',
            [req.user!.userId]
        );
        if (!me || me.temp_password !== true) {
            return res.status(403).json({ error: 'Este paso solo aplica en el primer ingreso.' });
        }

        const passwordHash = await bcrypt.hash(newPassword, 12);
        const updated = await queryOne(
            `UPDATE users SET password_hash = $1, display_name = $2, phone = $3,
                              temp_password = false, updated_at = NOW()
             WHERE id = $4
             RETURNING id, email, display_name, phone, role, is_reception_master`,
            [passwordHash, displayName, phone, req.user!.userId]
        );

        if (!updated) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        res.json({ message: 'Acceso completado', user: updated });
    } catch (error) {
        console.error('Complete onboarding error:', error);
        res.status(500).json({ error: 'Error al completar el acceso' });
    }
});

// ============================================
// POST /api/auth/coach/login - Coach portal login
// ============================================
router.post('/coach/login', async (req: Request, res: Response) => {
    try {
        const { identifier, password } = req.body;

        if (!identifier || !password) {
            return res.status(400).json({ error: 'Datos incompletos' });
        }

        // Find instructor by coach_number or email
        const instructor = await queryOne<{
            id: string;
            user_id: string;
            display_name: string;
            coach_number: string;
            password_hash: string;
            temp_password: boolean;
            email: string;
        }>(
            `SELECT 
                i.id, i.user_id, i.display_name, i.coach_number, 
                i.password_hash, i.temp_password,
                u.email, u.role
             FROM instructors i
             JOIN users u ON i.user_id = u.id
             WHERE (i.coach_number = $1 OR u.email = $1) 
               AND i.password_hash IS NOT NULL
               AND i.is_active = true`,
            [identifier.trim()]
        );

        if (!instructor) {
            return res.status(401).json({
                error: 'Credenciales inválidas',
                message: 'Número de coach, email o contraseña incorrectos',
            });
        }

        // Verify password
        const isValidPassword = await bcrypt.compare(password, instructor.password_hash);
        if (!isValidPassword) {
            return res.status(401).json({
                error: 'Credenciales inválidas',
                message: 'Número de coach, email o contraseña incorrectos',
            });
        }

        // Update last_login
        await query(
            'UPDATE instructors SET last_login = NOW() WHERE id = $1',
            [instructor.id]
        );

        // Generate JWT token with instructor role
        const tokenPayload: JwtPayload = {
            userId: instructor.user_id,
            email: instructor.email,
            role: 'instructor',
            instructorId: instructor.id,
        };
        const token = generateToken(tokenPayload);

        res.json({
            message: 'Inicio de sesión exitoso',
            instructor: {
                id: instructor.id,
                userId: instructor.user_id,
                displayName: instructor.display_name,
                coachNumber: instructor.coach_number,
                email: instructor.email,
            },
            token,
            tempPassword: instructor.temp_password, // Flag to force password change
        });
    } catch (error) {
        console.error('Coach login error:', error);
        res.status(500).json({ error: 'Error al iniciar sesión' });
    }
});

// ============================================
// POST /api/auth/coach/change-password - Change coach password
// ============================================
router.post('/coach/change-password', authenticate, async (req: Request, res: Response) => {
    try {
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ error: 'Datos incompletos' });
        }

        if (newPassword.length < 8) {
            return res.status(400).json({
                error: 'Contraseña muy corta',
                message: 'La contraseña debe tener al menos 8 caracteres'
            });
        }

        // Get instructor by user_id
        const instructor = await queryOne<{
            id: string;
            password_hash: string;
            temp_password: boolean;
        }>(
            'SELECT id, password_hash, temp_password FROM instructors WHERE user_id = $1',
            [req.user!.userId]
        );

        if (!instructor) {
            return res.status(404).json({ error: 'Instructor no encontrado' });
        }

        // Verify current password
        const isValid = await bcrypt.compare(currentPassword, instructor.password_hash);
        if (!isValid) {
            return res.status(401).json({
                error: 'Contraseña incorrecta',
                message: 'La contraseña actual es incorrecta',
            });
        }

        // Hash new password
        const passwordHash = await bcrypt.hash(newPassword, 12);

        // Update password and clear temp flag
        await query(
            'UPDATE instructors SET password_hash = $1, temp_password = false WHERE id = $2',
            [passwordHash, instructor.id]
        );

        res.json({
            message: 'Contraseña actualizada exitosamente',
            tempPasswordCleared: instructor.temp_password
        });
    } catch (error) {
        console.error('Coach change password error:', error);
        res.status(500).json({ error: 'Error al cambiar contraseña' });
    }
});

// ============================================
// POST /api/auth/instructor/request-access - Request magic link for instructor
// ============================================
const RequestAccessSchema = z.object({
    email: z.string().email('Email inválido'),
});

router.post('/instructor/request-access', async (req: Request, res: Response) => {
    try {
        const validation = RequestAccessSchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({
                error: 'Email inválido',
                details: validation.error.flatten().fieldErrors,
            });
        }

        const { email } = validation.data;

        // Check if instructor exists with this email
        const instructor = await queryOne<{ id: string; display_name: string; email: string }>(
            'SELECT id, display_name, email FROM instructors WHERE email = $1 AND is_active = true',
            [email.toLowerCase()]
        );

        // Always return success even if instructor doesn't exist (security)
        if (!instructor) {
            return res.json({
                message: 'Si el correo está registrado como instructor, recibirás un enlace de acceso.'
            });
        }

        // Generate magic link token
        const token = generateMagicLinkToken(instructor.email);
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        const magicLink = `${frontendUrl}/instructor/magic-login?token=${token}`;

        // Send email with magic link in background
        sendInstructorMagicLink({
            to: instructor.email,
            instructorName: instructor.display_name,
            magicLink,
        }).catch(err => {
            console.error('Failed to send magic link:', err);
        });

        res.json({
            message: 'Si el correo está registrado como instructor, recibirás un enlace de acceso.',
            success: true
        });
    } catch (error) {
        console.error('Request instructor access error:', error);
        res.status(500).json({ error: 'Error al procesar la solicitud' });
    }
});

// ============================================
// POST /api/auth/instructor/verify-magic-link - Verify magic link and login
// ============================================
const VerifyMagicLinkSchema = z.object({
    token: z.string().min(1, 'Token requerido'),
});

router.post('/instructor/verify-magic-link', async (req: Request, res: Response) => {
    try {
        const validation = VerifyMagicLinkSchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({
                error: 'Token inválido',
                details: validation.error.flatten().fieldErrors,
            });
        }

        const { token } = validation.data;

        // Verify the magic link token
        const payload = verifyMagicLinkToken(token);
        if (!payload) {
            return res.status(401).json({
                error: 'Enlace inválido o expirado',
                message: 'El enlace ha expirado o no es válido. Solicita uno nuevo.',
            });
        }

        // Get instructor by email
        const instructor = await queryOne<{
            id: string;
            user_id: string;
            email: string;
            display_name: string;
            role: string;
            is_active: boolean;
        }>(
            `SELECT i.id, i.user_id, i.email, u.role, i.display_name, i.is_active
             FROM instructors i
             JOIN users u ON u.id = i.user_id
             WHERE i.email = $1`,
            [payload.email]
        );

        if (!instructor || instructor.is_active !== true) {
            return res.status(404).json({
                error: 'Instructor no encontrado',
                message: 'No se encontró un instructor activo con este correo.',
            });
        }

        // JWT de sesión: userId = users.id (lo que esperan /auth/me y los endpoints);
        // instructorId = instructors.id (para los guards de self-instructor).
        const jwtPayload: JwtPayload = {
            userId: instructor.user_id,
            email: instructor.email,
            role: instructor.role as 'instructor',
            instructorId: instructor.id,
        };

        const authToken = generateToken(jwtPayload);

        res.json({
            token: authToken,
            user: {
                id: instructor.user_id,
                instructor_id: instructor.id,
                email: instructor.email,
                displayName: instructor.display_name,
                role: instructor.role,
            },
        });
    } catch (error) {
        console.error('Verify magic link error:', error);
        res.status(500).json({ error: 'Error al verificar el enlace' });
    }
});

export default router;
