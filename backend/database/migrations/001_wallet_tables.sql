-- ============================================
-- Migration: Wallet Tables for Apple & Google Wallet
-- Date: 2026-01-19
-- ============================================

-- ----------------------------------------
-- APPLE WALLET DEVICES TABLE
-- Stores device registrations for push notifications
-- ----------------------------------------
CREATE TABLE IF NOT EXISTS apple_wallet_devices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_id VARCHAR(255) NOT NULL,
    push_token VARCHAR(255) NOT NULL,
    pass_type_id VARCHAR(255) NOT NULL,
    membership_id UUID NOT NULL REFERENCES memberships(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Prevent duplicate device registrations per pass
    CONSTRAINT unique_device_pass UNIQUE (device_id, pass_type_id, membership_id)
);

-- Indexes for apple_wallet_devices
CREATE INDEX IF NOT EXISTS idx_apple_wallet_devices_membership ON apple_wallet_devices(membership_id);
CREATE INDEX IF NOT EXISTS idx_apple_wallet_devices_device ON apple_wallet_devices(device_id);
CREATE INDEX IF NOT EXISTS idx_apple_wallet_devices_push_token ON apple_wallet_devices(push_token);

-- ----------------------------------------
-- APPLE WALLET UPDATES TABLE
-- Tracks pass updates for change notifications
-- ----------------------------------------
CREATE TABLE IF NOT EXISTS apple_wallet_updates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    membership_id UUID NOT NULL REFERENCES memberships(id) ON DELETE CASCADE,
    classes_old INTEGER,
    classes_new INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for apple_wallet_updates
CREATE INDEX IF NOT EXISTS idx_apple_wallet_updates_membership ON apple_wallet_updates(membership_id);
CREATE INDEX IF NOT EXISTS idx_apple_wallet_updates_updated ON apple_wallet_updates(updated_at);

-- ----------------------------------------
-- NOTIFICATION HISTORY TABLE
-- Tracks sent notifications for analytics
-- ----------------------------------------
CREATE TABLE IF NOT EXISTS notification_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    membership_id UUID REFERENCES memberships(id) ON DELETE SET NULL,
    type VARCHAR(50) NOT NULL, -- 'push', 'alert', 'email', etc.
    platform VARCHAR(20), -- 'apple', 'google', 'email', etc.
    title VARCHAR(255),
    body TEXT,
    status VARCHAR(50) DEFAULT 'sent', -- 'sent', 'delivered', 'failed'
    error_message TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for notification_history
CREATE INDEX IF NOT EXISTS idx_notification_history_user ON notification_history(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_history_membership ON notification_history(membership_id);
CREATE INDEX IF NOT EXISTS idx_notification_history_type ON notification_history(type);
CREATE INDEX IF NOT EXISTS idx_notification_history_created ON notification_history(created_at);

-- ----------------------------------------
-- Apply updated_at triggers
-- ----------------------------------------
CREATE TRIGGER update_apple_wallet_devices_updated_at
    BEFORE UPDATE ON apple_wallet_devices
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_apple_wallet_updates_updated_at
    BEFORE UPDATE ON apple_wallet_updates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ----------------------------------------
-- END OF MIGRATION
-- ----------------------------------------
