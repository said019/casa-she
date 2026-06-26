-- Migration: Add fields for Coach Portal Authentication
-- Date: 2026-01-18
-- Purpose: Add coach portal login credentials and visibility controls

-- Add new columns to instructors table
ALTER TABLE instructors
ADD COLUMN IF NOT EXISTS visible_public BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS coach_number VARCHAR(20) UNIQUE,
ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255),
ADD COLUMN IF NOT EXISTS temp_password BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS last_login TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS phone VARCHAR(20);

-- Create index for coach_number lookup
CREATE INDEX IF NOT EXISTS idx_instructors_coach_number ON instructors(coach_number);

-- Add fields to users table for instructor notes (if not exists)
ALTER TABLE users
ADD COLUMN IF NOT EXISTS instructor_notes TEXT,
ADD COLUMN IF NOT EXISTS alert_flag BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS alert_message TEXT;

-- Create instructor_availability table if not exists
CREATE TABLE IF NOT EXISTS instructor_availability (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    instructor_id UUID NOT NULL REFERENCES instructors(id) ON DELETE CASCADE,
    day_of_week INTEGER CHECK (day_of_week >= 0 AND day_of_week <= 6), -- 0=Sunday
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    is_available BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_availability_instructor ON instructor_availability(instructor_id);
CREATE INDEX IF NOT EXISTS idx_availability_day ON instructor_availability(day_of_week);

-- Create password_reset_tokens table for coach password recovery
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(255) NOT NULL UNIQUE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    used BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_reset_tokens_token ON password_reset_tokens(token);
CREATE INDEX IF NOT EXISTS idx_reset_tokens_user ON password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_reset_tokens_expires ON password_reset_tokens(expires_at);

-- Add trigger for instructor_availability updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER IF NOT EXISTS update_instructor_availability_updated_at
    BEFORE UPDATE ON instructor_availability
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to generate coach number
CREATE OR REPLACE FUNCTION generate_coach_number()
RETURNS VARCHAR(20) AS $$
DECLARE
    new_number VARCHAR(20);
    max_num INTEGER;
BEGIN
    -- Get the highest existing coach number
    SELECT COALESCE(MAX(CAST(SUBSTRING(coach_number FROM 7) AS INTEGER)), 0) 
    INTO max_num
    FROM instructors 
    WHERE coach_number IS NOT NULL;
    
    -- Generate new coach number
    new_number := 'COACH-' || LPAD((max_num + 1)::TEXT, 4, '0');
    
    RETURN new_number;
END;
$$ LANGUAGE plpgsql;

-- Add notes about migration
COMMENT ON COLUMN instructors.visible_public IS 'Whether this instructor is visible on the public website';
COMMENT ON COLUMN instructors.coach_number IS 'Unique identifier for coach login (e.g., COACH-0001)';
COMMENT ON COLUMN instructors.password_hash IS 'Bcrypt hashed password for coach portal access';
COMMENT ON COLUMN instructors.temp_password IS 'Flag indicating if current password is temporary (must change on first login)';
COMMENT ON COLUMN instructors.last_login IS 'Timestamp of last successful login to coach portal';
