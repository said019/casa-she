-- ============================================
-- MIGRATION 009: Videos sales metadata support
-- ============================================

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'videos'
    ) THEN
        ALTER TABLE videos
            ADD COLUMN IF NOT EXISTS drive_file_id TEXT,
            ADD COLUMN IF NOT EXISTS thumbnail_drive_id TEXT,
            ADD COLUMN IF NOT EXISTS subtitle VARCHAR(160),
            ADD COLUMN IF NOT EXISTS tagline VARCHAR(200),
            ADD COLUMN IF NOT EXISTS days VARCHAR(200),
            ADD COLUMN IF NOT EXISTS brand_color VARCHAR(20),
            ADD COLUMN IF NOT EXISTS is_featured BOOLEAN NOT NULL DEFAULT false,
            ADD COLUMN IF NOT EXISTS sales_enabled BOOLEAN NOT NULL DEFAULT false,
            ADD COLUMN IF NOT EXISTS sales_price_mxn NUMERIC(10, 2),
            ADD COLUMN IF NOT EXISTS sales_class_credits INTEGER,
            ADD COLUMN IF NOT EXISTS sales_cta_text VARCHAR(120);
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'videos'
    ) THEN
        CREATE INDEX IF NOT EXISTS idx_videos_sales_enabled
            ON videos (sales_enabled)
            WHERE sales_enabled = true;
    END IF;
END $$;
