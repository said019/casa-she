-- ============================================
-- Migration: Add Guest Bookings Table
-- ============================================

-- Create guest_bookings table for walk-in guests without memberships
CREATE TABLE IF NOT EXISTS guest_bookings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    guest_name VARCHAR(255) NOT NULL,
    guest_email VARCHAR(255),
    guest_phone VARCHAR(20) NOT NULL,
    confirmation_code VARCHAR(20) UNIQUE NOT NULL,
    status booking_status NOT NULL DEFAULT 'confirmed',
    payment_method payment_method NOT NULL,
    amount_paid DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'MXN',
    payment_reference VARCHAR(255),
    notes TEXT,
    checked_in_at TIMESTAMP WITH TIME ZONE,
    checked_in_by UUID REFERENCES users(id),
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for guest_bookings
CREATE INDEX idx_guest_bookings_class ON guest_bookings(class_id);
CREATE INDEX idx_guest_bookings_phone ON guest_bookings(guest_phone);
CREATE INDEX idx_guest_bookings_email ON guest_bookings(guest_email);
CREATE INDEX idx_guest_bookings_confirmation ON guest_bookings(confirmation_code);
CREATE INDEX idx_guest_bookings_created_at ON guest_bookings(created_at);

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_guest_bookings_updated_at
    BEFORE UPDATE ON guest_bookings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE guest_bookings IS 'Bookings for walk-in guests without memberships';
COMMENT ON COLUMN guest_bookings.confirmation_code IS 'Unique confirmation code for the booking';
