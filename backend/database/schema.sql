-- ============================================
-- FORMA Pilates - PostgreSQL Database Schema
-- ============================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================
-- ENUMS (Custom Types)
-- ============================================

-- User roles
CREATE TYPE user_role AS ENUM ('client', 'instructor', 'admin');

-- Membership status
CREATE TYPE membership_status AS ENUM (
    'pending_payment', 
    'pending_activation', 
    'active', 
    'expired', 
    'paused', 
    'cancelled'
);

-- Payment methods
CREATE TYPE payment_method AS ENUM ('cash', 'transfer', 'card', 'online');

-- Class levels
CREATE TYPE class_level AS ENUM ('beginner', 'intermediate', 'advanced', 'all');

-- Class status
CREATE TYPE class_status AS ENUM ('scheduled', 'in_progress', 'completed', 'cancelled');

-- Booking status
CREATE TYPE booking_status AS ENUM ('confirmed', 'waitlist', 'checked_in', 'no_show', 'cancelled');

-- Loyalty points type
CREATE TYPE loyalty_points_type AS ENUM ('class_attended', 'referral', 'bonus', 'redemption');

-- Reward categories
CREATE TYPE reward_category AS ENUM ('merchandise', 'class', 'discount', 'experience');

-- Redemption status
CREATE TYPE redemption_status AS ENUM ('pending', 'fulfilled', 'cancelled');

-- Notification types
CREATE TYPE notification_type AS ENUM (
    'booking_reminder', 
    'class_cancelled', 
    'membership_expiring', 
    'points_earned', 
    'promotion'
);

-- Wallet pass platforms
CREATE TYPE wallet_platform AS ENUM ('apple', 'google');

-- ============================================
-- TABLES
-- ============================================

-- ----------------------------------------
-- USERS TABLE
-- ----------------------------------------
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(20) NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    photo_url TEXT,
    role user_role NOT NULL DEFAULT 'client',
    emergency_contact_name VARCHAR(255),
    emergency_contact_phone VARCHAR(20),
    health_notes TEXT,
    accepts_communications BOOLEAN DEFAULT false,
    date_of_birth DATE,
    receive_reminders BOOLEAN DEFAULT true,
    receive_promotions BOOLEAN DEFAULT false,
    receive_weekly_summary BOOLEAN DEFAULT false,
    firebase_uid VARCHAR(128) UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for users
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_phone ON users(phone);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_firebase_uid ON users(firebase_uid);

-- ----------------------------------------
-- PLANS TABLE
-- ----------------------------------------
CREATE TABLE plans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    price DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'MXN',
    duration_days INTEGER NOT NULL,
    class_limit INTEGER, -- NULL = unlimited
    features JSONB DEFAULT '[]'::jsonb,
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index for plans
CREATE INDEX idx_plans_active ON plans(is_active);
CREATE INDEX idx_plans_sort ON plans(sort_order);

-- ----------------------------------------
-- MEMBERSHIPS TABLE
-- ----------------------------------------
CREATE TABLE memberships (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE RESTRICT,
    status membership_status NOT NULL DEFAULT 'pending_payment',
    classes_remaining INTEGER, -- NULL = unlimited
    start_date DATE,
    end_date DATE,
    activated_by UUID REFERENCES users(id),
    activated_at TIMESTAMP WITH TIME ZONE,
    payment_method payment_method,
    payment_reference VARCHAR(255),
    paused_at TIMESTAMP WITH TIME ZONE,
    pause_reason TEXT,
    cancelled_at TIMESTAMP WITH TIME ZONE,
    cancellation_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for memberships
CREATE INDEX idx_memberships_user ON memberships(user_id);
CREATE INDEX idx_memberships_status ON memberships(status);
CREATE INDEX idx_memberships_end_date ON memberships(end_date);
CREATE INDEX idx_memberships_active ON memberships(user_id, status) WHERE status = 'active';

-- ----------------------------------------
-- CLASS TYPES TABLE
-- ----------------------------------------
CREATE TABLE class_types (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    level class_level DEFAULT 'all',
    duration_minutes INTEGER NOT NULL DEFAULT 60,
    max_capacity INTEGER NOT NULL DEFAULT 8,
    icon VARCHAR(50),
    color VARCHAR(7), -- Hex color
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index for class_types
CREATE INDEX idx_class_types_active ON class_types(is_active);

-- ----------------------------------------
-- INSTRUCTORS TABLE
-- ----------------------------------------
CREATE TABLE instructors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    display_name VARCHAR(255) NOT NULL,
    bio TEXT,
    photo_url TEXT,
    specialties JSONB DEFAULT '[]'::jsonb,
    certifications JSONB DEFAULT '[]'::jsonb,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for instructors
CREATE INDEX idx_instructors_user ON instructors(user_id);
CREATE INDEX idx_instructors_active ON instructors(is_active);

-- ----------------------------------------
-- SCHEDULES TABLE (Recurring class templates)
-- ----------------------------------------
CREATE TABLE schedules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    class_type_id UUID NOT NULL REFERENCES class_types(id) ON DELETE CASCADE,
    instructor_id UUID NOT NULL REFERENCES instructors(id) ON DELETE CASCADE,
    day_of_week INTEGER CHECK (day_of_week >= 0 AND day_of_week <= 6), -- 0=Sunday
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    max_capacity INTEGER NOT NULL DEFAULT 8,
    is_recurring BOOLEAN DEFAULT true,
    specific_date DATE, -- For non-recurring schedules
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for schedules
CREATE INDEX idx_schedules_day ON schedules(day_of_week) WHERE is_recurring = true;
CREATE INDEX idx_schedules_instructor ON schedules(instructor_id);
CREATE INDEX idx_schedules_class_type ON schedules(class_type_id);
CREATE INDEX idx_schedules_active ON schedules(is_active);

-- ----------------------------------------
-- CLASSES TABLE (Actual class instances)
-- ----------------------------------------
CREATE TABLE classes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    schedule_id UUID REFERENCES schedules(id) ON DELETE SET NULL,
    class_type_id UUID NOT NULL REFERENCES class_types(id) ON DELETE RESTRICT,
    instructor_id UUID NOT NULL REFERENCES instructors(id) ON DELETE RESTRICT,
    date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    max_capacity INTEGER NOT NULL DEFAULT 8,
    current_bookings INTEGER DEFAULT 0,
    status class_status DEFAULT 'scheduled',
    cancellation_reason TEXT,
    cancelled_by UUID REFERENCES users(id),
    cancelled_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for classes
CREATE INDEX idx_classes_date ON classes(date);
CREATE INDEX idx_classes_instructor ON classes(instructor_id);
CREATE INDEX idx_classes_status ON classes(status);
CREATE INDEX idx_classes_date_time ON classes(date, start_time);

-- ----------------------------------------
-- BOOKINGS TABLE
-- ----------------------------------------
CREATE TABLE bookings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    membership_id UUID REFERENCES memberships(id) ON DELETE SET NULL,
    status booking_status NOT NULL DEFAULT 'confirmed',
    waitlist_position INTEGER,
    checked_in_at TIMESTAMP WITH TIME ZONE,
    checked_in_by UUID REFERENCES users(id),
    cancelled_at TIMESTAMP WITH TIME ZONE,
    cancellation_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Prevent duplicate bookings
    CONSTRAINT unique_booking UNIQUE (class_id, user_id)
);

-- Indexes for bookings
CREATE INDEX idx_bookings_class ON bookings(class_id);
CREATE INDEX idx_bookings_user ON bookings(user_id);
CREATE INDEX idx_bookings_status ON bookings(status);
CREATE INDEX idx_bookings_membership ON bookings(membership_id);

-- ----------------------------------------
-- LOYALTY POINTS TABLE
-- ----------------------------------------
CREATE TABLE loyalty_points (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    points INTEGER NOT NULL, -- Positive = earned, negative = redeemed
    type loyalty_points_type NOT NULL,
    description TEXT,
    related_booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
    related_reward_id UUID, -- Will be FK to rewards
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for loyalty_points
CREATE INDEX idx_loyalty_points_user ON loyalty_points(user_id);
CREATE INDEX idx_loyalty_points_type ON loyalty_points(type);
CREATE INDEX idx_loyalty_points_created ON loyalty_points(created_at);

-- ----------------------------------------
-- REWARDS TABLE
-- ----------------------------------------
CREATE TABLE rewards (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    points_cost INTEGER NOT NULL,
    category reward_category NOT NULL,
    image_url TEXT,
    stock INTEGER, -- NULL = unlimited
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Add FK to loyalty_points after rewards table exists
ALTER TABLE loyalty_points 
ADD CONSTRAINT fk_loyalty_related_reward 
FOREIGN KEY (related_reward_id) REFERENCES rewards(id) ON DELETE SET NULL;

-- Index for rewards
CREATE INDEX idx_rewards_active ON rewards(is_active);
CREATE INDEX idx_rewards_category ON rewards(category);

-- ----------------------------------------
-- REDEMPTIONS TABLE
-- ----------------------------------------
CREATE TABLE redemptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reward_id UUID NOT NULL REFERENCES rewards(id) ON DELETE RESTRICT,
    points_spent INTEGER NOT NULL,
    status redemption_status NOT NULL DEFAULT 'pending',
    fulfilled_at TIMESTAMP WITH TIME ZONE,
    fulfilled_by UUID REFERENCES users(id),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for redemptions
CREATE INDEX idx_redemptions_user ON redemptions(user_id);
CREATE INDEX idx_redemptions_status ON redemptions(status);

-- ----------------------------------------
-- NOTIFICATIONS TABLE
-- ----------------------------------------
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE, -- NULL = broadcast
    title VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    type notification_type NOT NULL,
    data JSONB DEFAULT '{}'::jsonb,
    is_read BOOLEAN DEFAULT false,
    sent_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for notifications
CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_read ON notifications(is_read);
CREATE INDEX idx_notifications_type ON notifications(type);
CREATE INDEX idx_notifications_created ON notifications(created_at);

-- ----------------------------------------
-- WALLET PASSES TABLE
-- ----------------------------------------
CREATE TABLE wallet_passes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    membership_id UUID NOT NULL REFERENCES memberships(id) ON DELETE CASCADE,
    platform wallet_platform NOT NULL,
    serial_number VARCHAR(255) NOT NULL UNIQUE,
    pass_type_identifier VARCHAR(255),
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for wallet_passes
CREATE INDEX idx_wallet_passes_user ON wallet_passes(user_id);
CREATE INDEX idx_wallet_passes_membership ON wallet_passes(membership_id);
CREATE INDEX idx_wallet_passes_serial ON wallet_passes(serial_number);

-- ----------------------------------------
-- PAYMENTS TABLE (Additional for payment tracking)
-- ----------------------------------------
CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    membership_id UUID REFERENCES memberships(id) ON DELETE SET NULL,
    amount DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'MXN',
    payment_method payment_method NOT NULL,
    reference VARCHAR(255),
    notes TEXT,
    status VARCHAR(50) DEFAULT 'completed',
    processed_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for payments
CREATE INDEX idx_payments_user ON payments(user_id);
CREATE INDEX idx_payments_membership ON payments(membership_id);
CREATE INDEX idx_payments_date ON payments(created_at);

-- ----------------------------------------
-- SYSTEM SETTINGS TABLE
-- ----------------------------------------
CREATE TABLE system_settings (
    key VARCHAR(100) PRIMARY KEY,
    value JSONB NOT NULL,
    description TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_by UUID REFERENCES users(id)
);

-- ----------------------------------------
-- ADMIN NOTES TABLE (Internal notes for clients)
-- ----------------------------------------
CREATE TABLE admin_notes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_by UUID NOT NULL REFERENCES users(id),
    note TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index for admin_notes
CREATE INDEX idx_admin_notes_user ON admin_notes(user_id);

-- ============================================
-- FUNCTIONS AND TRIGGERS
-- ============================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at trigger to all relevant tables
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_plans_updated_at
    BEFORE UPDATE ON plans
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_memberships_updated_at
    BEFORE UPDATE ON memberships
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_class_types_updated_at
    BEFORE UPDATE ON class_types
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_instructors_updated_at
    BEFORE UPDATE ON instructors
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_schedules_updated_at
    BEFORE UPDATE ON schedules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_classes_updated_at
    BEFORE UPDATE ON classes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_bookings_updated_at
    BEFORE UPDATE ON bookings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_rewards_updated_at
    BEFORE UPDATE ON rewards
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_redemptions_updated_at
    BEFORE UPDATE ON redemptions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ----------------------------------------
-- Function to update current_bookings count
-- ----------------------------------------
CREATE OR REPLACE FUNCTION update_class_booking_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.status IN ('confirmed', 'checked_in') THEN
            UPDATE classes 
            SET current_bookings = current_bookings + 1 
            WHERE id = NEW.class_id;
        END IF;
    ELSIF TG_OP = 'UPDATE' THEN
        -- Handle status changes
        IF OLD.status NOT IN ('confirmed', 'checked_in') AND NEW.status IN ('confirmed', 'checked_in') THEN
            UPDATE classes 
            SET current_bookings = current_bookings + 1 
            WHERE id = NEW.class_id;
        ELSIF OLD.status IN ('confirmed', 'checked_in') AND NEW.status NOT IN ('confirmed', 'checked_in') THEN
            UPDATE classes 
            SET current_bookings = GREATEST(current_bookings - 1, 0) 
            WHERE id = NEW.class_id;
        END IF;
    ELSIF TG_OP = 'DELETE' THEN
        IF OLD.status IN ('confirmed', 'checked_in') THEN
            UPDATE classes 
            SET current_bookings = GREATEST(current_bookings - 1, 0) 
            WHERE id = OLD.class_id;
        END IF;
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_booking_count
    AFTER INSERT OR UPDATE OR DELETE ON bookings
    FOR EACH ROW EXECUTE FUNCTION update_class_booking_count();

-- ----------------------------------------
-- Function to calculate user's total loyalty points
-- ----------------------------------------
CREATE OR REPLACE FUNCTION get_user_points(p_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
    total_points INTEGER;
BEGIN
    SELECT COALESCE(SUM(points), 0) INTO total_points
    FROM loyalty_points
    WHERE user_id = p_user_id;
    
    RETURN total_points;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------
-- Function to decrement classes remaining
-- ----------------------------------------
CREATE OR REPLACE FUNCTION decrement_membership_classes()
RETURNS TRIGGER AS $$
BEGIN
    -- Only when status changes to checked_in
    IF OLD.status <> 'checked_in' AND NEW.status = 'checked_in' AND NEW.membership_id IS NOT NULL THEN
        UPDATE memberships
        SET classes_remaining = GREATEST(classes_remaining - 1, 0)
        WHERE id = NEW.membership_id
        AND classes_remaining IS NOT NULL;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_decrement_classes
    AFTER UPDATE ON bookings
    FOR EACH ROW EXECUTE FUNCTION decrement_membership_classes();

-- ============================================
-- VIEWS FOR COMMON QUERIES
-- ============================================

-- View for active memberships with user info
CREATE VIEW active_memberships_view AS
SELECT 
    m.id as membership_id,
    m.status,
    m.classes_remaining,
    m.start_date,
    m.end_date,
    u.id as user_id,
    u.email,
    u.display_name,
    u.phone,
    p.name as plan_name,
    p.class_limit as plan_class_limit
FROM memberships m
JOIN users u ON m.user_id = u.id
JOIN plans p ON m.plan_id = p.id
WHERE m.status = 'active';

-- View for upcoming classes with details
CREATE VIEW upcoming_classes_view AS
SELECT 
    c.id as class_id,
    c.date,
    c.start_time,
    c.end_time,
    c.max_capacity,
    c.current_bookings,
    c.status,
    ct.name as class_type_name,
    ct.level,
    ct.duration_minutes,
    ct.color,
    i.display_name as instructor_name,
    i.photo_url as instructor_photo,
    (c.max_capacity - c.current_bookings) as available_spots
FROM classes c
JOIN class_types ct ON c.class_type_id = ct.id
JOIN instructors i ON c.instructor_id = i.id
WHERE c.date >= CURRENT_DATE
AND c.status = 'scheduled'
ORDER BY c.date, c.start_time;

-- View for user bookings with class details
CREATE VIEW user_bookings_view AS
SELECT 
    b.id as booking_id,
    b.user_id,
    b.status as booking_status,
    b.waitlist_position,
    b.checked_in_at,
    c.id as class_id,
    c.date,
    c.start_time,
    c.end_time,
    ct.name as class_type_name,
    ct.level,
    ct.color as class_type_color,
    i.display_name as instructor_name
FROM bookings b
JOIN classes c ON b.class_id = c.id
JOIN class_types ct ON c.class_type_id = ct.id
JOIN instructors i ON c.instructor_id = i.id
ORDER BY c.date DESC, c.start_time DESC;

-- ============================================
-- INITIAL DATA (Default plans and settings)
-- ============================================

-- Insert default membership plans
INSERT INTO plans (name, description, price, duration_days, class_limit, features, sort_order) VALUES
('Drop-in', 'Clase individual perfecta para probar', 350.00, 30, 1, '["Acceso a una clase", "Válido por 30 días"]', 1),
('Pack 5', 'Paquete de 5 clases para establecer tu rutina', 1500.00, 45, 5, '["5 clases", "Válido por 45 días", "Ahorro de $250"]', 2),
('Pack 10', 'Paquete de 10 clases para comprometerte', 2700.00, 60, 10, '["10 clases", "Válido por 60 días", "Ahorro de $800"]', 3),
('Ilimitado Mensual', 'Acceso ilimitado todo el mes', 3500.00, 30, NULL, '["Clases ilimitadas", "Válido por 30 días", "Reserva anticipada", "Acceso prioritario"]', 4);

-- Insert default system settings
INSERT INTO system_settings (key, value, description) VALUES
('studio_info', '{"name": "Catarsis Studio", "address": "", "phone": "", "email": "", "social_media": {}}', 'Información del estudio'),
('booking_policies', '{"cancellation_hours": 12, "no_show_penalty": true, "max_advance_days": 14}', 'Políticas de reservación'),
('loyalty_settings', '{"points_per_class": 10, "welcome_bonus": 50, "referral_bonus": 100}', 'Configuración del programa de lealtad'),
('notification_settings', '{"reminder_hours": 24, "expiring_days": [7, 3, 1]}', 'Configuración de notificaciones');

-- Insert default class types
INSERT INTO class_types (name, description, level, duration_minutes, max_capacity, icon, color) VALUES
('Barre Studio', 'Trabajo en barra para postura, fuerza y tono con control.', 'all', 50, 12, 'sparkles', '#8C8475'),
('Pilates Mat', 'Core y movilidad en colchoneta con secuencias controladas.', 'all', 50, 12, 'circle-dot', '#A2A88B'),
('Yoga Sculpt', 'Flujo dinamico con pesas ligeras para esculpir y elevar el ritmo.', 'intermediate', 50, 12, 'leaf', '#B7AE9B');

-- ============================================
-- GRANTS (Adjust based on your PostgreSQL users)
-- ============================================

-- Example: GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO your_app_user;
-- Example: GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO your_app_user;

-- ============================================
-- END OF SCHEMA
-- ============================================
