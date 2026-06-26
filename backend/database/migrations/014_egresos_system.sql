-- ============================================
-- MIGRATION 014: Egresos (Expenses) System
-- Catarsis Studio - Módulo de Egresos
-- ============================================

-- Enum: categorías de egreso
DO $$ BEGIN
    CREATE TYPE egreso_category AS ENUM ('nomina', 'servicios', 'marketing');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Enum: status de egreso
DO $$ BEGIN
    CREATE TYPE egreso_status AS ENUM ('pendiente', 'pagado', 'cancelado');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================
-- TABLA PRINCIPAL
-- ============================================
CREATE TABLE IF NOT EXISTS egresos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Clasificación
    category egreso_category NOT NULL,
    concept VARCHAR(255) NOT NULL,
    description TEXT,

    -- Montos
    amount DECIMAL(12, 2) NOT NULL CHECK (amount > 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'MXN',

    -- Estado y fechas
    status egreso_status NOT NULL DEFAULT 'pendiente',
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    paid_at TIMESTAMP WITH TIME ZONE,

    -- Recurrencia
    is_recurring BOOLEAN NOT NULL DEFAULT false,
    recurring_day INTEGER CHECK (recurring_day BETWEEN 1 AND 31),

    -- Comprobante
    receipt_url TEXT,
    receipt_file_name VARCHAR(255),

    -- Distribución porcentual (ej: {"instructores": 40, "renta": 30, "marketing": 30})
    distribution JSONB DEFAULT '{}'::jsonb,

    -- Proveedor / beneficiario
    vendor VARCHAR(255),

    -- Notas
    notes TEXT,

    -- Meta
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_egresos_category ON egresos(category);
CREATE INDEX IF NOT EXISTS idx_egresos_status ON egresos(status);
CREATE INDEX IF NOT EXISTS idx_egresos_date ON egresos(date);
CREATE INDEX IF NOT EXISTS idx_egresos_recurring ON egresos(is_recurring) WHERE is_recurring = true;

-- Auto-update updated_at
CREATE TRIGGER update_egresos_updated_at
    BEFORE UPDATE ON egresos
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- VISTA: Resumen mensual de egresos
-- ============================================
CREATE OR REPLACE VIEW egresos_monthly_summary AS
SELECT
    DATE_TRUNC('month', date) AS month,
    category,
    COUNT(*) AS count,
    SUM(amount) AS total,
    SUM(CASE WHEN status = 'pagado' THEN amount ELSE 0 END) AS paid_total,
    SUM(CASE WHEN status = 'pendiente' THEN amount ELSE 0 END) AS pending_total
FROM egresos
WHERE status != 'cancelado'
GROUP BY DATE_TRUNC('month', date), category
ORDER BY month DESC, category;

-- ============================================
-- END OF MIGRATION 014
-- ============================================
