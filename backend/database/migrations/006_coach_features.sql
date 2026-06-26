-- ============================================
-- Coach Features Migration
-- Sustituciones y Playlists
-- ============================================

-- ----------------------------------------
-- CLASS SUBSTITUTIONS TABLE
-- Para solicitar/aceptar cubrir clases
-- ----------------------------------------
CREATE TABLE IF NOT EXISTS class_substitutions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    original_instructor_id UUID NOT NULL REFERENCES instructors(id) ON DELETE CASCADE,
    substitute_instructor_id UUID REFERENCES instructors(id) ON DELETE SET NULL,
    reason TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled')),
    requested_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    responded_at TIMESTAMP WITH TIME ZONE,
    response_note TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_substitutions_class ON class_substitutions(class_id);
CREATE INDEX idx_substitutions_original ON class_substitutions(original_instructor_id);
CREATE INDEX idx_substitutions_substitute ON class_substitutions(substitute_instructor_id);
CREATE INDEX idx_substitutions_status ON class_substitutions(status);

-- ----------------------------------------
-- COACH PLAYLISTS TABLE
-- Playlists de música por tipo de clase
-- ----------------------------------------
CREATE TABLE IF NOT EXISTS coach_playlists (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    instructor_id UUID NOT NULL REFERENCES instructors(id) ON DELETE CASCADE,
    class_type_id UUID REFERENCES class_types(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    platform VARCHAR(50) NOT NULL DEFAULT 'spotify' CHECK (platform IN ('spotify', 'apple_music', 'youtube', 'other')),
    url TEXT NOT NULL,
    duration_minutes INTEGER,
    is_public BOOLEAN DEFAULT false, -- Si otros coaches pueden verla
    is_favorite BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_playlists_instructor ON coach_playlists(instructor_id);
CREATE INDEX idx_playlists_class_type ON coach_playlists(class_type_id);
CREATE INDEX idx_playlists_public ON coach_playlists(is_public) WHERE is_public = true;

-- ----------------------------------------
-- Add notes field to classes for instructor notes
-- ----------------------------------------
ALTER TABLE classes ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE classes ADD COLUMN IF NOT EXISTS level class_level;
ALTER TABLE classes ADD COLUMN IF NOT EXISTS facility_id UUID REFERENCES facilities(id) ON DELETE SET NULL;

-- ----------------------------------------
-- Add visible_public and coach_number to instructors if not exists
-- ----------------------------------------
ALTER TABLE instructors ADD COLUMN IF NOT EXISTS visible_public BOOLEAN DEFAULT true;
ALTER TABLE instructors ADD COLUMN IF NOT EXISTS coach_number SERIAL;
ALTER TABLE instructors ADD COLUMN IF NOT EXISTS temp_password VARCHAR(255);
ALTER TABLE instructors ADD COLUMN IF NOT EXISTS last_login TIMESTAMP WITH TIME ZONE;
ALTER TABLE instructors ADD COLUMN IF NOT EXISTS phone VARCHAR(20);
