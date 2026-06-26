-- ============================================
-- Balance Studio - Orders & Payment System Migration
-- Run this after 002_coach_system.sql
-- ============================================

-- ============================================
-- 1. CREATE ORDER STATUS ENUM
-- ============================================
DO $$ BEGIN
    CREATE TYPE order_status AS ENUM (
        'pending_payment',      -- Esperando que cliente pague
        'pending_verification', -- Comprobante subido, esperando validación
        'approved',             -- Pago aprobado, membresía activa
        'rejected',             -- Pago rechazado
        'cancelled',            -- Orden cancelada
        'expired'               -- Orden expirada (no pagó a tiempo)
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- ============================================
-- 2. ORDERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_number VARCHAR(20) UNIQUE NOT NULL,
    
    -- Relaciones
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE RESTRICT,
    membership_id UUID REFERENCES memberships(id) ON DELETE SET NULL,
    
    -- Montos (snapshot al momento de la compra)
    subtotal DECIMAL(10, 2) NOT NULL,
    tax_rate DECIMAL(5, 4) DEFAULT 0.16,
    tax_amount DECIMAL(10, 2) NOT NULL,
    total_amount DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'MXN',
    
    -- Estado
    status order_status DEFAULT 'pending_payment',
    
    -- Método de pago seleccionado
    payment_method VARCHAR(30) NOT NULL, -- 'card', 'transfer', 'cash', 'stripe', 'mercadopago'
    
    -- Para pagos con tarjeta (Stripe/MercadoPago)
    payment_intent_id VARCHAR(255),
    payment_provider VARCHAR(50), -- 'stripe', 'mercadopago'
    
    -- Validación por admin (para transferencias)
    reviewed_by UUID REFERENCES users(id),
    reviewed_at TIMESTAMP WITH TIME ZONE,
    rejection_reason TEXT,
    admin_notes TEXT,
    
    -- Notas del cliente
    customer_notes TEXT,
    
    -- Control de tiempo
    expires_at TIMESTAMP WITH TIME ZONE, -- 48hrs para subir comprobante
    reminder_sent_at TIMESTAMP WITH TIME ZONE,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    paid_at TIMESTAMP WITH TIME ZONE,
    approved_at TIMESTAMP WITH TIME ZONE,
    rejected_at TIMESTAMP WITH TIME ZONE,
    cancelled_at TIMESTAMP WITH TIME ZONE
);

-- Indexes para orders
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_payment_method ON orders(payment_method);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_pending ON orders(status) WHERE status IN ('pending_payment', 'pending_verification');

-- ============================================
-- 3. PAYMENT PROOFS TABLE (Comprobantes)
-- ============================================
CREATE TABLE IF NOT EXISTS payment_proofs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    
    -- Archivo del comprobante
    file_url TEXT NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_type VARCHAR(100), -- 'image/jpeg', 'image/png', 'application/pdf'
    file_size INTEGER, -- en bytes
    
    -- Información adicional del cliente
    last_four_digits VARCHAR(4), -- Últimos 4 dígitos cuenta origen
    bank_reference VARCHAR(100), -- Referencia bancaria
    additional_notes TEXT,
    
    -- Estado
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
    
    -- Validación
    validated_by UUID REFERENCES users(id),
    validation_notes TEXT,
    validated_at TIMESTAMP WITH TIME ZONE,
    
    -- Timestamps
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes para payment_proofs
CREATE INDEX IF NOT EXISTS idx_payment_proofs_order ON payment_proofs(order_id);
CREATE INDEX IF NOT EXISTS idx_payment_proofs_status ON payment_proofs(status);

-- ============================================
-- 4. ORDER NUMBER SEQUENCE
-- ============================================
CREATE SEQUENCE IF NOT EXISTS order_number_seq START 1;

-- Function para generar order_number
CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS TEXT AS $$
DECLARE
    new_order_number TEXT;
    year_prefix TEXT;
    sequence_num INTEGER;
BEGIN
    year_prefix := 'BS' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-';
    
    -- Obtener siguiente número
    SELECT COALESCE(MAX(CAST(SUBSTRING(order_number FROM '\d+$') AS INTEGER)), 0) + 1
    INTO sequence_num
    FROM orders
    WHERE order_number LIKE year_prefix || '%';
    
    new_order_number := year_prefix || LPAD(sequence_num::TEXT, 4, '0');
    
    RETURN new_order_number;
END;
$$ LANGUAGE plpgsql;

-- Trigger para auto-generar order_number
CREATE OR REPLACE FUNCTION set_order_number()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.order_number IS NULL OR NEW.order_number = '' THEN
        NEW.order_number := generate_order_number();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_order_number_trigger ON orders;
CREATE TRIGGER set_order_number_trigger 
    BEFORE INSERT ON orders
    FOR EACH ROW EXECUTE FUNCTION set_order_number();

-- ============================================
-- 5. UPDATE TRIGGERS
-- ============================================
CREATE TRIGGER update_orders_updated_at
    BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payment_proofs_updated_at
    BEFORE UPDATE ON payment_proofs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 6. ADD ORDER REFERENCE TO MEMBERSHIPS
-- ============================================
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES orders(id) ON DELETE SET NULL;

-- ============================================
-- 7. BANK INFO IN SYSTEM SETTINGS
-- ============================================
INSERT INTO system_settings (key, value, description)
VALUES (
    'bank_info',
    '{
        "bank_name": "BBVA",
        "account_holder": "Balance Studio SA de CV",
        "account_number": "0123456789",
        "clabe": "012180001234567890",
        "reference_instructions": "Incluye tu nombre en el concepto"
    }'::jsonb,
    'Información bancaria para transferencias'
)
ON CONFLICT (key) DO NOTHING;

-- Tax rate setting
INSERT INTO system_settings (key, value, description)
VALUES ('tax_rate', '0.16'::jsonb, 'Tasa de IVA (16%)')
ON CONFLICT (key) DO NOTHING;

-- ============================================
-- 8. USEFUL VIEWS
-- ============================================

-- Vista de órdenes con detalles completos
CREATE OR REPLACE VIEW orders_with_details AS
SELECT 
    o.id,
    o.order_number,
    o.status,
    o.payment_method,
    o.subtotal,
    o.tax_amount,
    o.total_amount,
    o.currency,
    o.created_at,
    o.paid_at,
    o.approved_at,
    o.rejected_at,
    o.rejection_reason,
    o.expires_at,
    
    -- Usuario
    u.id as user_id,
    u.display_name as user_name,
    u.email as user_email,
    u.phone as user_phone,
    
    -- Plan
    p.id as plan_id,
    p.name as plan_name,
    p.class_limit as plan_classes,
    p.duration_days as plan_duration,
    
    -- Comprobante (último)
    pp.id as proof_id,
    pp.file_url as proof_url,
    pp.status as proof_status,
    pp.uploaded_at as proof_uploaded_at,
    pp.last_four_digits,
    pp.bank_reference,
    
    -- Horas desde creación/subida
    EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - o.created_at))/3600 as hours_since_created,
    EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - pp.uploaded_at))/3600 as hours_since_proof
    
FROM orders o
JOIN users u ON o.user_id = u.id
JOIN plans p ON o.plan_id = p.id
LEFT JOIN LATERAL (
    SELECT * FROM payment_proofs 
    WHERE order_id = o.id 
    ORDER BY uploaded_at DESC 
    LIMIT 1
) pp ON true;

-- Vista de stats para admin dashboard
CREATE OR REPLACE VIEW orders_dashboard_stats AS
SELECT 
    -- Pendientes de validación
    COUNT(*) FILTER (WHERE status = 'pending_verification') as pending_verification_count,
    
    -- Pendientes de pago
    COUNT(*) FILTER (WHERE status = 'pending_payment') as pending_payment_count,
    
    -- Aprobadas hoy
    COUNT(*) FILTER (WHERE status = 'approved' AND DATE(approved_at) = CURRENT_DATE) as approved_today,
    
    -- Rechazadas hoy
    COUNT(*) FILTER (WHERE status = 'rejected' AND DATE(rejected_at) = CURRENT_DATE) as rejected_today,
    
    -- Ingresos de hoy (aprobadas)
    COALESCE(SUM(total_amount) FILTER (WHERE status = 'approved' AND DATE(approved_at) = CURRENT_DATE), 0) as revenue_today,
    
    -- Ingresos de la semana
    COALESCE(SUM(total_amount) FILTER (WHERE status = 'approved' AND approved_at >= DATE_TRUNC('week', CURRENT_DATE)), 0) as revenue_week,
    
    -- Ingresos del mes
    COALESCE(SUM(total_amount) FILTER (WHERE status = 'approved' AND approved_at >= DATE_TRUNC('month', CURRENT_DATE)), 0) as revenue_month,
    
    -- Total órdenes del día
    COUNT(*) FILTER (WHERE DATE(created_at) = CURRENT_DATE) as orders_today
    
FROM orders;

-- ============================================
-- 9. ADMIN ACTIONS LOG (Auditoría)
-- ============================================
CREATE TABLE IF NOT EXISTS admin_actions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    admin_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Acción
    action_type VARCHAR(100) NOT NULL, -- 'approve_order', 'reject_order', 'cancel_order', etc.
    entity_type VARCHAR(50) NOT NULL, -- 'order', 'payment_proof', 'membership'
    entity_id UUID NOT NULL,
    
    -- Detalles
    description TEXT,
    old_data JSONB,
    new_data JSONB,
    
    -- Metadata
    ip_address INET,
    user_agent TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_admin_actions_admin ON admin_actions(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_actions_entity ON admin_actions(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_admin_actions_created ON admin_actions(created_at DESC);
