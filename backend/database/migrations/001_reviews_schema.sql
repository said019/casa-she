-- ============================================
-- REVIEWS & RATINGS MIGRATION
-- ============================================

-- Extensions (if not already enabled)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ----------------------------------------
-- TYPES
-- ----------------------------------------
CREATE TYPE review_status AS ENUM ('published', 'hidden', 'flagged', 'removed');
CREATE TYPE review_request_status AS ENUM ('pending', 'sent', 'completed', 'expired');
CREATE TYPE response_type AS ENUM ('thank_you', 'apology', 'explanation', 'offer', 'follow_up');

-- ----------------------------------------
-- REVIEWS TABLE
-- ----------------------------------------
CREATE TABLE reviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    instructor_id UUID NOT NULL REFERENCES instructors(id) ON DELETE CASCADE,
    
    -- Ratings
    overall_rating INTEGER NOT NULL CHECK (overall_rating BETWEEN 1 AND 5),
    instructor_rating INTEGER CHECK (instructor_rating BETWEEN 1 AND 5),
    difficulty_rating INTEGER CHECK (difficulty_rating BETWEEN 1 AND 5),
    ambiance_rating INTEGER CHECK (ambiance_rating BETWEEN 1 AND 5),
    punctuality_rating INTEGER CHECK (punctuality_rating BETWEEN 1 AND 5),
    
    -- Content
    comment TEXT,
    is_anonymous BOOLEAN DEFAULT false,
    submitted_from VARCHAR(50) DEFAULT 'app',
    
    -- Feedback
    would_recommend BOOLEAN,
    would_repeat BOOLEAN,
    
    -- Status & Moderation
    status review_status DEFAULT 'published',
    is_featured BOOLEAN DEFAULT false,
    flagged_reason TEXT,
    moderated_by UUID REFERENCES users(id),
    moderated_at TIMESTAMP WITH TIME ZONE,
    
    -- Gamification
    points_earned INTEGER DEFAULT 0,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT unique_booking_review UNIQUE (booking_id)
);

CREATE INDEX idx_reviews_instructor ON reviews(instructor_id);
CREATE INDEX idx_reviews_class ON reviews(class_id);
CREATE INDEX idx_reviews_user ON reviews(user_id);
CREATE INDEX idx_reviews_status ON reviews(status);
CREATE INDEX idx_reviews_created ON reviews(created_at);

-- ----------------------------------------
-- REVIEW TAGS TABLE (Predefined tags)
-- ----------------------------------------
CREATE TABLE review_tags (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(50) NOT NULL,
    name_en VARCHAR(50),
    category VARCHAR(20) NOT NULL CHECK (category IN ('positive', 'negative', 'neutral')),
    icon VARCHAR(50), -- Lucide icon name
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Insert default tags
INSERT INTO review_tags (name, category, icon, sort_order) VALUES
('Motivante', 'positive', 'biceps-flexed', 1),
('Buena Música', 'positive', 'music', 2),
('Clara Explicación', 'positive', 'message-circle', 3),
('Desafiante', 'positive', 'flame', 4),
('Relajante', 'positive', 'moon', 5),
('Puntual', 'positive', 'clock', 6),
('Mucha gente', 'negative', 'users', 7),
('Música alta', 'negative', 'volume-2', 8),
('Poca corrección', 'negative', 'eye-off', 9);

-- ----------------------------------------
-- REVIEW TAG SELECTIONS TABLE
-- ----------------------------------------
CREATE TABLE review_tag_selections (
    review_id UUID NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
    tag_id UUID NOT NULL REFERENCES review_tags(id) ON DELETE CASCADE,
    PRIMARY KEY (review_id, tag_id)
);

-- ----------------------------------------
-- REVIEW REQUESTS TABLE (Automation)
-- ----------------------------------------
CREATE TABLE review_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    status review_request_status DEFAULT 'pending',
    sent_at TIMESTAMP WITH TIME ZONE,
    review_id UUID REFERENCES reviews(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT unique_booking_request UNIQUE (booking_id)
);

CREATE INDEX idx_review_requests_status ON review_requests(status);

-- ----------------------------------------
-- REVIEW RESPONSES TABLE (Instructor/Admin replies)
-- ----------------------------------------
CREATE TABLE review_responses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    review_id UUID NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
    responded_by UUID NOT NULL REFERENCES users(id),
    response_type response_type NOT NULL,
    response_text TEXT NOT NULL,
    is_public BOOLEAN DEFAULT true,
    compensation_offered VARCHAR(100),
    compensation_value DECIMAL(10, 2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------------------
-- TRIGGERS
-- ----------------------------------------
CREATE TRIGGER update_reviews_updated_at
    BEFORE UPDATE ON reviews
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_review_requests_updated_at
    BEFORE UPDATE ON review_requests
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
