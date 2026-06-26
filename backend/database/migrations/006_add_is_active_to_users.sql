-- Add is_active column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Index for better performance when filtering active users
CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active);
