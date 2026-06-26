-- ============================================
-- CATARSIS STUDIO - Apple Wallet & Google Wallet Tables
-- Run this migration to add wallet support
-- ============================================

-- ----------------------------------------
-- APPLE WALLET DEVICES TABLE
-- Stores registered iOS devices for push notifications
-- ----------------------------------------
CREATE TABLE IF NOT EXISTS apple_wallet_devices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_id VARCHAR(255) NOT NULL,  -- Device Library Identifier
    push_token VARCHAR(255) NOT NULL, -- APNs Push Token
    pass_type_id VARCHAR(255) NOT NULL, -- Pass Type Identifier
    membership_id UUID NOT NULL REFERENCES memberships(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Unique constraint: one registration per device/pass type/membership
    CONSTRAINT unique_device_registration UNIQUE (device_id, pass_type_id, membership_id)
);

-- Indexes for apple_wallet_devices
CREATE INDEX IF NOT EXISTS idx_awd_membership ON apple_wallet_devices(membership_id);
CREATE INDEX IF NOT EXISTS idx_awd_device ON apple_wallet_devices(device_id);
CREATE INDEX IF NOT EXISTS idx_awd_push_token ON apple_wallet_devices(push_token);

-- ----------------------------------------
-- APPLE WALLET UPDATES TABLE
-- Tracks pass updates for iOS sync
-- ----------------------------------------
CREATE TABLE IF NOT EXISTS apple_wallet_updates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    membership_id UUID NOT NULL REFERENCES memberships(id) ON DELETE CASCADE,
    classes_old INT,
    classes_new INT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index for apple_wallet_updates
CREATE INDEX IF NOT EXISTS idx_awu_membership ON apple_wallet_updates(membership_id);
CREATE INDEX IF NOT EXISTS idx_awu_updated ON apple_wallet_updates(updated_at);

-- ----------------------------------------
-- NOTIFICATION LOGS TABLE
-- Tracks all wallet notifications sent
-- ----------------------------------------
CREATE TYPE notification_channel AS ENUM ('apple', 'google');
CREATE TYPE notification_status AS ENUM ('pending', 'sent', 'failed');

CREATE TABLE IF NOT EXISTS notification_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    membership_id UUID NOT NULL REFERENCES memberships(id) ON DELETE CASCADE,
    title VARCHAR(255),
    message TEXT NOT NULL,
    channel notification_channel NOT NULL,
    status notification_status NOT NULL DEFAULT 'pending',
    error TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for notification_logs
CREATE INDEX IF NOT EXISTS idx_nl_membership ON notification_logs(membership_id);
CREATE INDEX IF NOT EXISTS idx_nl_created ON notification_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_nl_channel ON notification_logs(channel);
CREATE INDEX IF NOT EXISTS idx_nl_status ON notification_logs(status);

-- ----------------------------------------
-- UPDATE wallet_passes TABLE
-- Add new columns if they don't exist
-- ----------------------------------------
DO $$ 
BEGIN
    -- Add google_object_id column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'wallet_passes' AND column_name = 'google_object_id'
    ) THEN
        ALTER TABLE wallet_passes ADD COLUMN google_object_id VARCHAR(255);
    END IF;

    -- Add auth_token column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'wallet_passes' AND column_name = 'auth_token'
    ) THEN
        ALTER TABLE wallet_passes ADD COLUMN auth_token VARCHAR(255);
    END IF;
END $$;

-- ----------------------------------------
-- FUNCTION: Update timestamp trigger
-- ----------------------------------------
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for apple_wallet_devices
DROP TRIGGER IF EXISTS update_apple_wallet_devices_updated_at ON apple_wallet_devices;
CREATE TRIGGER update_apple_wallet_devices_updated_at
    BEFORE UPDATE ON apple_wallet_devices
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- SUCCESS MESSAGE
-- ============================================
DO $$
BEGIN
    RAISE NOTICE '✅ Wallet tables created successfully!';
    RAISE NOTICE '   - apple_wallet_devices';
    RAISE NOTICE '   - apple_wallet_updates';
    RAISE NOTICE '   - notification_logs';
END $$;
