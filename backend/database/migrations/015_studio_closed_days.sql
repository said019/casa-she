-- ============================================
-- MIGRATION 015: Studio Closed Days
-- Días festivos / cerrados del estudio
-- ============================================

CREATE TABLE IF NOT EXISTS studio_closed_days (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    date DATE NOT NULL UNIQUE,
    reason VARCHAR(255) NOT NULL DEFAULT '',
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_studio_closed_days_date ON studio_closed_days(date);

-- ============================================
-- END OF MIGRATION 015
-- ============================================
