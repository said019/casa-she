-- ============================================
-- MIGRATION 012: Event Configuration Columns
-- Add persistent config settings to events table
-- ============================================

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS waitlist_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS required_payment BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS wallet_pass BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS auto_reminders BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS allow_cancellations BOOLEAN NOT NULL DEFAULT false;

-- ============================================
-- END OF MIGRATION 012
-- ============================================
