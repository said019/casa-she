export interface Instructor {
    id: string;
    user_id: string;
    display_name: string;
    bio: string | null;
    tagline?: string | null;
    photo_url: string | null;
    specialties: string[];
    certifications: string[];
    is_active: boolean;
    visible_public: boolean;
    coach_number?: string | null;
    temp_password?: boolean;
    last_login?: string | null;
    instructor_phone?: string | null;
    email?: string;
    user_phone?: string;
    created_at: string;
}

export type ClassLevel = 'beginner' | 'intermediate' | 'advanced' | 'all';

export interface ClassType {
    id: string;
    name: string;
    description: string | null;
    level: ClassLevel;
    duration_minutes: number;
    max_capacity: number;
    icon: string | null;
    color: string | null;
    is_active: boolean;
    created_at: string;
}

export interface Schedule {
    id: string;
    class_type_id: string;
    instructor_id: string;
    day_of_week: number;
    start_time: string; // HH:MM
    end_time: string; // HH:MM
    max_capacity: number;
    is_recurring: boolean;
    specific_date?: string;
    is_active: boolean;
    class_type_name?: string;
    class_type_color?: string;
    instructor_name?: string;
    facility_id?: string;
    facility_name?: string | null;
}

export interface Class {
    id: string;
    schedule_id?: string;
    class_type_id: string;
    instructor_id: string;
    facility_id?: string;
    date: string; // YYYY-MM-DD
    start_time: string;
    end_time: string;
    max_capacity: number;
    current_bookings: number;
    status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
    class_type_name?: string;
    class_type_color?: string;
    instructor_name?: string;
    instructor_user_id?: string;
    facility_name?: string;
    available_spots?: number;
    is_free?: boolean;
    free_label?: string | null;
    booking_closed?: boolean;
    category?: string;
}
