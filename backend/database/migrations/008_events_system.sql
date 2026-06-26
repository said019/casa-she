-- ============================================
-- MIGRATION 008: Events System
-- Catarsis Studio - Sistema de Eventos
-- ============================================

-- ============================================
-- ENUMS
-- ============================================

-- Event types
CREATE TYPE event_type AS ENUM (
    'masterclass',
    'workshop',
    'retreat',
    'challenge',
    'openhouse',
    'special'
);

-- Event status
CREATE TYPE event_status AS ENUM (
    'draft',
    'published',
    'cancelled',
    'completed'
);

-- Event registration status
CREATE TYPE event_registration_status AS ENUM (
    'confirmed',
    'pending',
    'waitlist',
    'cancelled',
    'no_show'
);

-- ============================================
-- TABLES
-- ============================================

-- ----------------------------------------
-- EVENTS TABLE
-- ----------------------------------------
CREATE TABLE events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Basic info
    title VARCHAR(255) NOT NULL,
    description TEXT,
    type event_type NOT NULL DEFAULT 'special',
    status event_status NOT NULL DEFAULT 'draft',
    
    -- Schedule
    date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    
    -- Location
    location VARCHAR(255) DEFAULT 'Catarsis Studio',
    
    -- Capacity
    capacity INTEGER NOT NULL DEFAULT 20,
    registered INTEGER NOT NULL DEFAULT 0,
    
    -- Pricing
    price DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    currency VARCHAR(3) DEFAULT 'MXN',
    early_bird_price DECIMAL(10, 2),
    early_bird_deadline DATE,
    member_discount INTEGER DEFAULT 0, -- Percentage 0-100
    
    -- Media
    image TEXT,
    
    -- Instructor
    instructor_id UUID REFERENCES instructors(id) ON DELETE SET NULL,
    instructor_name VARCHAR(255), -- Denormalized for display / external instructors
    instructor_photo TEXT,
    
    -- Details
    requirements TEXT,
    includes JSONB DEFAULT '[]'::jsonb,
    tags JSONB DEFAULT '[]'::jsonb,
    
    -- Metadata
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for events
CREATE INDEX idx_events_date ON events(date);
CREATE INDEX idx_events_type ON events(type);
CREATE INDEX idx_events_status ON events(status);
CREATE INDEX idx_events_instructor ON events(instructor_id);
CREATE INDEX idx_events_upcoming ON events(date, start_time) WHERE status = 'published';

-- ----------------------------------------
-- EVENT REGISTRATIONS TABLE
-- ----------------------------------------
CREATE TABLE event_registrations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    
    -- Participant info (for guests or denormalized)
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    
    -- Registration details
    status event_registration_status NOT NULL DEFAULT 'pending',
    amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    payment_method payment_method,
    payment_reference VARCHAR(255),
    paid_at TIMESTAMP WITH TIME ZONE,
    
    -- Check-in
    checked_in BOOLEAN DEFAULT false,
    checked_in_at TIMESTAMP WITH TIME ZONE,
    checked_in_by UUID REFERENCES users(id),
    
    -- Waitlist
    waitlist_position INTEGER,
    
    -- Notes
    notes TEXT,
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Prevent duplicate registrations per email per event
    CONSTRAINT unique_event_registration UNIQUE (event_id, email)
);

-- Indexes for event_registrations
CREATE INDEX idx_event_reg_event ON event_registrations(event_id);
CREATE INDEX idx_event_reg_user ON event_registrations(user_id);
CREATE INDEX idx_event_reg_status ON event_registrations(status);
CREATE INDEX idx_event_reg_email ON event_registrations(email);

-- ============================================
-- TRIGGERS
-- ============================================

-- Auto-update updated_at on events
CREATE TRIGGER update_events_updated_at
    BEFORE UPDATE ON events
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Auto-update updated_at on event_registrations
CREATE TRIGGER update_event_registrations_updated_at
    BEFORE UPDATE ON event_registrations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ----------------------------------------
-- Auto-update registered count on events
-- ----------------------------------------
CREATE OR REPLACE FUNCTION update_event_registration_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.status IN ('confirmed', 'pending') THEN
            UPDATE events 
            SET registered = registered + 1 
            WHERE id = NEW.event_id;
        END IF;
    ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.status NOT IN ('confirmed', 'pending') AND NEW.status IN ('confirmed', 'pending') THEN
            UPDATE events 
            SET registered = registered + 1 
            WHERE id = NEW.event_id;
        ELSIF OLD.status IN ('confirmed', 'pending') AND NEW.status NOT IN ('confirmed', 'pending') THEN
            UPDATE events 
            SET registered = GREATEST(registered - 1, 0) 
            WHERE id = NEW.event_id;
        END IF;
    ELSIF TG_OP = 'DELETE' THEN
        IF OLD.status IN ('confirmed', 'pending') THEN
            UPDATE events 
            SET registered = GREATEST(registered - 1, 0) 
            WHERE id = OLD.event_id;
        END IF;
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_event_registration_count
    AFTER INSERT OR UPDATE OR DELETE ON event_registrations
    FOR EACH ROW EXECUTE FUNCTION update_event_registration_count();

-- ============================================
-- VIEWS
-- ============================================

-- View for upcoming events with details
CREATE VIEW upcoming_events_view AS
SELECT 
    e.id,
    e.title,
    e.description,
    e.type,
    e.status,
    e.date,
    e.start_time,
    e.end_time,
    e.location,
    e.capacity,
    e.registered,
    e.price,
    e.currency,
    e.early_bird_price,
    e.early_bird_deadline,
    e.member_discount,
    e.image,
    e.instructor_name,
    e.instructor_photo,
    e.requirements,
    e.includes,
    e.tags,
    (e.capacity - e.registered) AS available_spots,
    CASE 
        WHEN e.early_bird_deadline IS NOT NULL AND CURRENT_DATE <= e.early_bird_deadline 
        THEN e.early_bird_price 
        ELSE e.price 
    END AS current_price
FROM events e
WHERE e.date >= CURRENT_DATE
AND e.status = 'published'
ORDER BY e.date, e.start_time;

-- ============================================
-- END OF MIGRATION 008
-- ============================================
