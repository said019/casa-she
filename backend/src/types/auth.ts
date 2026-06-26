import { z } from 'zod';

// User role enum - includes all system roles
export const UserRole = z.enum(['client', 'instructor', 'admin', 'super_admin', 'reception']);
export type UserRole = z.infer<typeof UserRole>;

// User interface matching database
export interface User {
    id: string;
    email: string;
    phone: string;
    display_name: string;
    photo_url: string | null;
    role: UserRole;
    emergency_contact_name: string | null;
    emergency_contact_phone: string | null;
    health_notes: string | null;
    accepts_communications: boolean;
    date_of_birth: Date | null;
    receive_reminders: boolean;
    receive_promotions: boolean;
    receive_weekly_summary: boolean;
    created_at: Date;
    updated_at: Date;
    is_reception_master?: boolean;
    permissions?: Record<string, boolean>;
}

// User with password hash (for internal use)
export interface UserWithPassword extends User {
    password_hash: string;
}

// Registration schema
export const RegisterSchema = z.object({
    email: z.string().email('Email inválido'),
    password: z
        .string()
        .min(8, 'La contraseña debe tener al menos 8 caracteres')
        .regex(/[A-Z]/, 'La contraseña debe contener al menos una mayúscula')
        .regex(/[0-9]/, 'La contraseña debe contener al menos un número'),
    displayName: z.string().min(2, 'El nombre debe tener al menos 2 caracteres'),
    phone: z
        .string()
        .regex(/^\+52[0-9]{10}$/, 'Teléfono debe ser formato mexicano: +52XXXXXXXXXX'),
    dateOfBirth: z.string().optional(),
    acceptsTerms: z.boolean().refine(val => val === true, 'Debes aceptar los términos'),
    acceptsCommunications: z.boolean().default(false),
    referralCode: z.string().optional(),
});

export type RegisterInput = z.infer<typeof RegisterSchema>;

// Login schema
export const LoginSchema = z.object({
    email: z.string().email('Email inválido'),
    password: z.string().min(1, 'La contraseña es requerida'),
});

export type LoginInput = z.infer<typeof LoginSchema>;

// Forgot password schema
export const ForgotPasswordSchema = z.object({
    email: z.string().email('Email inválido'),
});

export type ForgotPasswordInput = z.infer<typeof ForgotPasswordSchema>;

// Reset password schema
export const ResetPasswordSchema = z.object({
    token: z.string().min(1, 'Token requerido'),
    password: z
        .string()
        .min(8, 'La contraseña debe tener al menos 8 caracteres')
        .regex(/[A-Z]/, 'La contraseña debe contener al menos una mayúscula')
        .regex(/[0-9]/, 'La contraseña debe contener al menos un número'),
});

export type ResetPasswordInput = z.infer<typeof ResetPasswordSchema>;

// Update profile schema
// phone: relajado a string libre (los datos legacy vienen en formatos
// distintos al canónico +52XXXXXXXXXX). Si fuera estricto, cualquier
// edit del usuario reenviando su phone original tirar 400.
export const UpdateProfileSchema = z.object({
    displayName: z.string().min(2).optional(),
    email: z.string().email('Email inválido').optional(),
    phone: z.string().min(8).max(20).optional(),
    dateOfBirth: z.string().optional().nullable(),
    emergencyContactName: z.string().optional().nullable(),
    emergencyContactPhone: z.string().optional().nullable(),
    healthNotes: z.string().optional().nullable(),
    receiveReminders: z.boolean().optional(),
    receivePromotions: z.boolean().optional(),
    receiveWeeklySummary: z.boolean().optional(),
});

export type UpdateProfileInput = z.infer<typeof UpdateProfileSchema>;

// JWT Payload
export interface JwtPayload {
    userId: string;
    email: string;
    role: UserRole;
    instructorId?: string; // Optional: set when user is an instructor
    isReceptionMaster?: boolean; // Optional: true when reception user has elevated master privileges
}

// Auth response (sent to client)
export interface AuthResponse {
    user: Omit<User, 'password_hash'>;
    token: string;
}
