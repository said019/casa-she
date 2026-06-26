-- ============================================
-- Migration: Workout Templates / Class Plans
-- Created: 2026-01-21
-- Description: Templates for class exercises that coaches can share
-- ============================================

-- ----------------------------------------
-- WORKOUT TEMPLATES TABLE
-- Main template that groups exercises
-- ----------------------------------------
CREATE TABLE IF NOT EXISTS workout_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    class_type_id UUID REFERENCES class_types(id) ON DELETE SET NULL,
    created_by UUID NOT NULL REFERENCES instructors(id) ON DELETE CASCADE,
    duration_minutes INTEGER DEFAULT 50,
    difficulty VARCHAR(20) DEFAULT 'intermediate' CHECK (difficulty IN ('beginner', 'intermediate', 'advanced')),
    equipment_needed JSONB DEFAULT '[]'::jsonb, -- ["mat", "weights", "barre", "ball"]
    music_playlist_url TEXT,
    is_public BOOLEAN DEFAULT true, -- If false, only creator can see
    is_featured BOOLEAN DEFAULT false, -- Admin can feature best templates
    uses_count INTEGER DEFAULT 0, -- How many times used in classes
    tags JSONB DEFAULT '[]'::jsonb, -- ["cardio", "strength", "flexibility"]
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_workout_templates_class_type ON workout_templates(class_type_id);
CREATE INDEX IF NOT EXISTS idx_workout_templates_created_by ON workout_templates(created_by);
CREATE INDEX IF NOT EXISTS idx_workout_templates_public ON workout_templates(is_public);
CREATE INDEX IF NOT EXISTS idx_workout_templates_featured ON workout_templates(is_featured);

-- ----------------------------------------
-- WORKOUT EXERCISES TABLE
-- Individual exercises within a template
-- ----------------------------------------
CREATE TABLE IF NOT EXISTS workout_exercises (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    template_id UUID NOT NULL REFERENCES workout_templates(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    duration_seconds INTEGER, -- Duration for timed exercises
    reps INTEGER, -- For rep-based exercises
    sets INTEGER DEFAULT 1,
    rest_seconds INTEGER DEFAULT 0, -- Rest after this exercise
    sort_order INTEGER NOT NULL DEFAULT 0,
    section VARCHAR(50) DEFAULT 'main', -- warm_up, main, cool_down
    video_url TEXT, -- Optional demo video
    image_url TEXT, -- Optional image
    notes TEXT, -- Coach notes for execution
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_workout_exercises_template ON workout_exercises(template_id);
CREATE INDEX IF NOT EXISTS idx_workout_exercises_order ON workout_exercises(template_id, sort_order);

-- ----------------------------------------
-- CLASS WORKOUT ASSIGNMENTS
-- Link a template to a specific class
-- ----------------------------------------
CREATE TABLE IF NOT EXISTS class_workouts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    template_id UUID NOT NULL REFERENCES workout_templates(id) ON DELETE CASCADE,
    assigned_by UUID NOT NULL REFERENCES instructors(id),
    notes TEXT, -- Class-specific notes
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT unique_class_workout UNIQUE (class_id)
);

-- Index
CREATE INDEX IF NOT EXISTS idx_class_workouts_class ON class_workouts(class_id);
CREATE INDEX IF NOT EXISTS idx_class_workouts_template ON class_workouts(template_id);

-- ----------------------------------------
-- TEMPLATE FAVORITES
-- Coaches can favorite templates they like
-- ----------------------------------------
CREATE TABLE IF NOT EXISTS template_favorites (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    template_id UUID NOT NULL REFERENCES workout_templates(id) ON DELETE CASCADE,
    instructor_id UUID NOT NULL REFERENCES instructors(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT unique_favorite UNIQUE (template_id, instructor_id)
);

-- Index
CREATE INDEX IF NOT EXISTS idx_template_favorites_instructor ON template_favorites(instructor_id);

-- ----------------------------------------
-- Update uses_count trigger
-- ----------------------------------------
CREATE OR REPLACE FUNCTION update_template_uses_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE workout_templates SET uses_count = uses_count + 1 WHERE id = NEW.template_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE workout_templates SET uses_count = uses_count - 1 WHERE id = OLD.template_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_template_uses ON class_workouts;
CREATE TRIGGER trigger_update_template_uses
AFTER INSERT OR DELETE ON class_workouts
FOR EACH ROW EXECUTE FUNCTION update_template_uses_count();

-- ----------------------------------------
-- Sample templates for seeding
-- ----------------------------------------
-- These will be created via the API by coaches

COMMENT ON TABLE workout_templates IS 'Templates for class workouts that coaches can create and share';
COMMENT ON TABLE workout_exercises IS 'Individual exercises within a workout template';
COMMENT ON TABLE class_workouts IS 'Links workout templates to specific class instances';
COMMENT ON TABLE template_favorites IS 'Allows coaches to save favorite templates';
