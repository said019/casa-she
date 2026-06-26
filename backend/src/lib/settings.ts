/**
 * Settings Service - Centralized configuration with in-memory cache
 *
 * Source of truth: PostgreSQL system_settings table
 * Cache: In-memory with TTL (auto-refreshes, invalidates on save)
 *
 * Usage:
 *   const bankInfo = await getSetting('bank_info');
 *   await setSetting('bank_info', { bank_name: 'BBVA', ... }, adminUserId);
 */

import { query, queryOne } from '../config/database.js';

// ============================================
// TYPE DEFINITIONS
// ============================================

export interface StudioInfo {
    name: string;
    address: string;
    phone: string;
    email: string;
    website: string;
    description: string;
    social_media: {
        instagram: string;
        facebook: string;
        whatsapp: string;
    };
}

export interface BookingPolicies {
    cancellation_hours: number;
    no_show_penalty: boolean;
    max_advance_days: number;
    min_hours_before_booking: number;
    max_bookings_per_day: number;
    allow_waitlist: boolean;
    auto_promote_waitlist: boolean;
}

export interface NotificationSettings {
    reminder_hours: number;
    expiring_days: number[];
    send_booking_confirmation: boolean;
    send_cancellation_notice: boolean;
    send_class_reminder: boolean;
    send_membership_expiring: boolean;
    send_points_earned: boolean;
}

export interface LoyaltyConfig {
    points_per_class: number;
    points_per_peso: number;
    enabled: boolean;
    welcome_bonus: number;
    birthday_bonus: number;
    referral_bonus: number;
}

export interface BankInfo {
    bank_name: string;
    account_holder: string;
    account_number: string;
    clabe: string;
    reference_instructions: string;
}

export interface GeneralSettings {
    timezone: string;
    currency: string;
    date_format: string;
    language: string;
    maintenance_mode: boolean;
}

export interface WhatsAppTemplates {
    send_booking_confirmation: string;
    send_cancellation_notice: string;
    send_class_reminder: string;
    send_membership_expiring: string;
    send_points_earned: string;
}

// Map of all valid setting keys to their types
export interface SettingsMap {
    studio_info: StudioInfo;
    booking_policies: BookingPolicies;
    notification_settings: NotificationSettings;
    loyalty_config: LoyaltyConfig;
    bank_info: BankInfo;
    general_settings: GeneralSettings;
    whatsapp_templates: WhatsAppTemplates;
}

export type SettingKey = keyof SettingsMap;

// ============================================
// DEFAULT VALUES
// ============================================

const DEFAULTS: SettingsMap = {
    studio_info: {
        name: 'BMB Studio',
        address: 'Calle Primero de Mayo 1, Diamante, 54763 Cuautitlán Izcalli, Méx.',
        phone: '5543860391',
        email: 'hola@bmbstudio.mx',
        website: '',
        description: '',
        social_media: { instagram: '@bmbstudio', facebook: '', whatsapp: '5543860391' },
    },
    booking_policies: {
        cancellation_hours: 5,
        no_show_penalty: true,
        max_advance_days: 14,
        min_hours_before_booking: 0,
        max_bookings_per_day: 1,
        allow_waitlist: true,
        auto_promote_waitlist: true,
    },
    notification_settings: {
        reminder_hours: 24,
        expiring_days: [7, 3, 1],
        send_booking_confirmation: true,
        send_cancellation_notice: true,
        send_class_reminder: true,
        send_membership_expiring: true,
        send_points_earned: true,
    },
    loyalty_config: {
        points_per_class: 10,
        points_per_peso: 1,
        enabled: true,
        welcome_bonus: 50,
        birthday_bonus: 100,
        referral_bonus: 200,
    },
    bank_info: {
        bank_name: 'Mercado Pago',
        account_holder: 'Karla Ivonne Pérez García',
        account_number: '',
        clabe: '722969020755786887',
        reference_instructions: 'Usa tu nombre completo como referencia',
    },
    general_settings: {
        timezone: 'America/Mexico_City',
        currency: 'MXN',
        date_format: 'DD/MM/YYYY',
        language: 'es',
        maintenance_mode: false,
    },
    whatsapp_templates: {
        send_booking_confirmation: '✅ *Reserva Confirmada*\n\nHola {nombre}!\n\nTu reserva para *{clase}* ha sido confirmada.\n\n📅 {fecha}\n⏰ {hora}\n👨‍🏫 {instructor}\n\n¡Te esperamos en Catarsis Studio!',
        send_cancellation_notice: '❌ *Reserva Cancelada*\n\nHola {nombre},\n\nTu reserva para *{clase}* del {fecha} a las {hora} ha sido cancelada.',
        send_class_reminder: '🔔 *Recordatorio de Clase*\n\nHola {nombre}!\n\nTu clase *{clase}* es en {hora}.\n\n¡No faltes! 🧘',
        send_membership_expiring: '⏰ *Membresía por vencer*\n\nHola {nombre},\n\nTu plan *{plan}* vence pronto.\n\nRenueva para seguir disfrutando.',
        send_points_earned: '⭐ *Puntos ganados*\n\nHola {nombre}!\n\nGanaste {puntos} puntos.\n\nSaldo: {saldo} puntos.',
    },
};

// ============================================
// IN-MEMORY CACHE
// ============================================

const CACHE_TTL_MS = 60 * 1000; // 1 minute

interface CacheEntry {
    value: unknown;
    expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

function getCached<K extends SettingKey>(key: K): SettingsMap[K] | null {
    const entry = cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
        cache.delete(key);
        return null;
    }
    return entry.value as SettingsMap[K];
}

function setCache(key: string, value: unknown): void {
    cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

export function invalidateCache(key?: string): void {
    if (key) {
        cache.delete(key);
    } else {
        cache.clear();
    }
}

// ============================================
// PUBLIC API
// ============================================

/**
 * Get a setting by key. Uses cache, falls back to DB, then defaults.
 */
export async function getSetting<K extends SettingKey>(key: K): Promise<SettingsMap[K]> {
    // Check cache first
    const cached = getCached(key);
    if (cached !== null) return cached;

    // Query DB
    try {
        const row = await queryOne<{ value: unknown }>(
            `SELECT value FROM system_settings WHERE key = $1`,
            [key]
        );

        if (row?.value) {
            const value = (typeof row.value === 'string' ? JSON.parse(row.value) : row.value) as SettingsMap[K];
            // Merge with defaults to fill any missing fields
            const merged = { ...DEFAULTS[key], ...value } as SettingsMap[K];
            setCache(key, merged);
            return merged;
        }
    } catch (error) {
        console.error(`[Settings] Error reading ${key}:`, error);
    }

    // Return defaults
    return DEFAULTS[key];
}

/**
 * Save a setting. Updates DB and invalidates cache.
 */
export async function setSetting<K extends SettingKey>(
    key: K,
    value: SettingsMap[K],
    updatedBy?: string
): Promise<void> {
    try {
        await query(
            `INSERT INTO system_settings (key, value, updated_by)
             VALUES ($1, $2, $3)
             ON CONFLICT (key) DO UPDATE
             SET value = $2, updated_at = CURRENT_TIMESTAMP, updated_by = $3`,
            [key, JSON.stringify(value), updatedBy || null]
        );
        // Invalidate cache so next read gets fresh data
        invalidateCache(key);
    } catch (error) {
        console.error(`[Settings] Error saving ${key}:`, error);
        throw error;
    }
}

/**
 * Get all settings as a typed object.
 */
export async function getAllSettings(): Promise<Partial<SettingsMap>> {
    try {
        const rows = await query<{ key: string; value: unknown }>(
            `SELECT key, value FROM system_settings`
        );

        const result: Partial<SettingsMap> = {};
        for (const row of rows) {
            const key = row.key as SettingKey;
            if (key in DEFAULTS) {
                const value = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
                (result as any)[key] = { ...DEFAULTS[key], ...value };
                setCache(key, (result as any)[key]);
            }
        }
        return result;
    } catch (error) {
        console.error('[Settings] Error reading all:', error);
        return {};
    }
}

/**
 * Seed default settings (only inserts if key doesn't exist).
 */
export async function seedDefaults(): Promise<void> {
    for (const [key, value] of Object.entries(DEFAULTS)) {
        try {
            await query(
                `INSERT INTO system_settings (key, value, description)
                 VALUES ($1, $2, $3)
                 ON CONFLICT (key) DO NOTHING`,
                [key, JSON.stringify(value), `Default ${key} configuration`]
            );
        } catch (error) {
            console.error(`[Settings] Error seeding ${key}:`, error);
        }
    }
    console.log('[Settings] Defaults seeded');
}
