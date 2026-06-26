-- ============================================
-- Balance Studio - Coach System Migration
-- Run this after the main schema
-- ============================================

-- ============================================
-- 1. UPDATE USER ROLES ENUM
-- ============================================

-- Add new roles: super_admin, reception
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'super_admin';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'reception';

-- ============================================
-- 2. FACILITIES TABLE (Rooms/Studios)
-- ============================================

CREATE TABLE IF NOT EXISTS facilities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    capacity INTEGER NOT NULL DEFAULT 8,
    equipment JSONB DEFAULT '[]'::jsonb, -- ["reformer", "mat", "props"]
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Insert default facility
INSERT INTO facilities (name, description, capacity) 
VALUES ('Sala Principal', 'Sala principal con reformers', 12)
ON CONFLICT DO NOTHING;

-- ============================================
-- 3. INSTRUCTOR AVAILABILITY TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS instructor_availability (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    instructor_id UUID NOT NULL REFERENCES instructors(id) ON DELETE CASCADE,
    day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6), -- 0=Sunday
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    is_available BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT unique_instructor_day_time UNIQUE (instructor_id, day_of_week, start_time, end_time)
);

CREATE INDEX IF NOT EXISTS idx_instructor_availability_instructor ON instructor_availability(instructor_id);
CREATE INDEX IF NOT EXISTS idx_instructor_availability_day ON instructor_availability(day_of_week);

-- ============================================
-- 4. ADD COLUMNS TO INSTRUCTORS TABLE
-- ============================================

-- Pay rate per class
ALTER TABLE instructors ADD COLUMN IF NOT EXISTS pay_rate_per_class DECIMAL(10, 2);

-- Pay rate per hour (alternative)
ALTER TABLE instructors ADD COLUMN IF NOT EXISTS pay_rate_per_hour DECIMAL(10, 2);

-- Permissions (what they can do)
ALTER TABLE instructors ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '{"can_checkin": true, "can_view_client_notes": true, "can_edit_profile": true}'::jsonb;

-- Phone number (direct contact)
ALTER TABLE instructors ADD COLUMN IF NOT EXISTS phone VARCHAR(20);

-- Email (for notifications)
ALTER TABLE instructors ADD COLUMN IF NOT EXISTS email VARCHAR(255);

-- ============================================
-- 5. ADD FACILITY TO SCHEDULES AND CLASSES
-- ============================================

-- Add facility_id to schedules
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS facility_id UUID REFERENCES facilities(id);

-- Add facility_id to classes
ALTER TABLE classes ADD COLUMN IF NOT EXISTS facility_id UUID REFERENCES facilities(id);

-- Add level to classes (override from class_type if needed)
ALTER TABLE classes ADD COLUMN IF NOT EXISTS level class_level;

-- Add notes for the class instance
ALTER TABLE classes ADD COLUMN IF NOT EXISTS notes TEXT;

-- ============================================
-- 6. COACH SUBSTITUTIONS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS coach_substitutions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    original_instructor_id UUID NOT NULL REFERENCES instructors(id),
    new_instructor_id UUID NOT NULL REFERENCES instructors(id),
    reason TEXT,
    substituted_by UUID NOT NULL REFERENCES users(id), -- Admin who made the change
    notified_original BOOLEAN DEFAULT false,
    notified_new BOOLEAN DEFAULT false,
    notified_clients BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_substitutions_class ON coach_substitutions(class_id);
CREATE INDEX IF NOT EXISTS idx_substitutions_original ON coach_substitutions(original_instructor_id);
CREATE INDEX IF NOT EXISTS idx_substitutions_new ON coach_substitutions(new_instructor_id);

-- ============================================
-- 7. ADD CLIENT NOTES/ALERTS
-- ============================================

-- Health notes are already in users table, but let's add instructor-visible notes
ALTER TABLE users ADD COLUMN IF NOT EXISTS instructor_notes TEXT; -- Notes visible to instructors
ALTER TABLE users ADD COLUMN IF NOT EXISTS alert_flag BOOLEAN DEFAULT false; -- Show alert icon
ALTER TABLE users ADD COLUMN IF NOT EXISTS alert_message VARCHAR(255); -- Brief alert text

-- ============================================
-- 8. INSTRUCTOR STATISTICS VIEW
-- ============================================

CREATE OR REPLACE VIEW instructor_stats AS
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
    COUNT(DISTINCT CASE WHEN c.date = CURRENT_DATE THEN c.id END) AS classes_today,
    COUNT(DISTINCT CASE WHEN c.date >= date_trunc('week', CURRENT_DATE) AND c.date < date_trunc('week', CURRENT_DATE) + INTERVAL '7 days' THEN c.id END) AS classes_this_week
FROM instructors i
LEFT JOIN classes c ON c.instructor_id = i.id AND c.status != 'cancelled'
LEFT JOIN bookings b ON b.class_id = c.id AND b.status != 'cancelled'
WHERE i.is_active = true
GROUP BY i.id, i.display_name;

-- ============================================
-- 9. NOTIFICATION TYPES UPDATE
-- ============================================

-- Add coach-related notification types
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'coach_assigned';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'coach_removed';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'coach_substituted';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'class_updated';

-- ============================================
-- 10. SET DEFAULT FACILITY FOR EXISTING RECORDS
-- ============================================

-- Update existing schedules with default facility
UPDATE schedules 
SET facility_id = (SELECT id FROM facilities WHERE name = 'Sala Principal' LIMIT 1)
WHERE facility_id IS NULL;

-- Update existing classes with default facility
UPDATE classes 
SET facility_id = (SELECT id FROM facilities WHERE name = 'Sala Principal' LIMIT 1)
WHERE facility_id IS NULL;
