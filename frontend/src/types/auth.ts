// User roles
export type UserRole = 'client' | 'instructor' | 'admin' | 'super_admin' | 'reception';

// User interface
export interface User {
    id: string;
    email: string;
    phone: string;
    display_name: string;
    full_name?: string; // Alias for display_name for compatibility
    photo_url: string | null;
    avatar_url?: string | null; // Alias for photo_url for compatibility
    role: UserRole;
    emergency_contact_name: string | null;
    emergency_contact_phone: string | null;
    health_notes: string | null;
    accepts_communications: boolean;
    date_of_birth: string | null;
    receive_reminders: boolean;
    receive_promotions: boolean;
    receive_weekly_summary: boolean;
    created_at: string;
    updated_at: string;
    // Instructor info (if linked)
    is_instructor?: boolean;
    instructor_id?: string;
    coach_number?: string;
    // Reception master flag
    is_reception_master?: boolean;
    // Permisos granulares de recepción
    permissions?: Record<string, boolean>;
    // Contraseña temporal: si true, el usuario debe completar su acceso (datos + nueva contraseña).
    temp_password?: boolean;
}

// Plan interface
export interface Plan {
    id: string;
    name: string;
    description: string | null;
    price: number;
    currency: string;
    duration_days: number;
    class_limit: number | null;
    classes_included?: number; // Alias for frontend compatibility
    // BMB usa estos dos en lugar de class_limit. null = ilimitado en ese bucket.
    reformer_credits?: number | null;
    multi_credits?: number | null;
    features: string[];
    is_active: boolean;
    sort_order: number;
    created_at?: string;
    package_type?: 'individual' | 'mixto' | 'sample';
    requires_studio_selection?: boolean;
}

// Membership interface
export interface Membership {
    id: string;
    user_id: string;
    plan_id: string;
    start_date: string | null;
    end_date: string | null;
    status: 'active' | 'expired' | 'cancelled' | 'pending_payment' | 'pending_activation' | 'paused';
    credits_total: number | null;
    credits_remaining: number | null;
    // Créditos por categoría (fuente real para mostrar; classes_remaining no se usa).
    reformer_remaining?: number | null;
    multi_remaining?: number | null;
    price_paid: number;
    payment_method?: 'cash' | 'transfer' | 'card' | 'online' | null;
    payment_reference?: string | null;
    receipt_url?: string | null;
    activated_at?: string | null;
    activated_by?: string | null;
    order_id?: string | null;
    is_migration?: boolean;
    // Trazabilidad de adquisición (calculada en backend a partir de señales fiables).
    acquisition?: {
        channel: 'online_card' | 'online_transfer' | 'staff' | 'migration' | 'request' | 'unknown';
        method?: 'cash' | 'transfer' | 'card' | 'online' | null;
        seller_name?: string | null;
        provider?: string | null;
    };
    created_at: string;
    updated_at: string;
    // Joins
    user_name?: string;
    activated_by_name?: string | null;
    user_email?: string;
    user_phone?: string | null;
    plan_name?: string;
    plan_price?: number | null;
    plan_currency?: string | null;
    plan_duration_days?: number | null;
}

// Admin Stats
export interface StudioClassCount {
    facilityId: string;
    name: string;
    count: number;
}

export interface AdminStats {
    scheduledClasses: number;
    confirmedBookings: number;
    activeMemberships: number;
    revenue: number;
    revenueGross?: number;
    revenueNet?: number;
    revenueCardFees?: number;
    classesByStudio?: StudioClassCount[];
}

// Login credentials
export interface LoginCredentials {
    email: string;
    password: string;
}

// Registration data
export interface RegisterData {
    email: string;
    password: string;
    displayName: string;
    phone: string;
    dateOfBirth?: string;
    acceptsTerms: boolean;
    acceptsCommunications: boolean;
    referralCode?: string;
}

// Update profile data
export interface UpdateProfileData {
    displayName?: string;
    phone?: string;
    dateOfBirth?: string;
    emergencyContactName?: string;
    emergencyContactPhone?: string;
    healthNotes?: string;
    receiveReminders?: boolean;
    receivePromotions?: boolean;
    receiveWeeklySummary?: boolean;
}

// Auth response from API
export interface AuthResponse {
    message: string;
    user: User;
    token: string;
}

// API Error response
export interface ApiError {
    error: string;
    message?: string;
    details?: Record<string, string[]>;
}

// Class Schedule interface
export interface ClassSchedule {
    id: string;
    name: string;
    date: string;
    start_time: string;
    end_time: string;
    max_capacity: number;
    current_capacity: number;
    instructor?: {
        id: string;
        name: string;
    };
    class_type_id?: string;
    status?: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
}
