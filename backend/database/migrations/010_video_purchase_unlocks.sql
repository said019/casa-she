-- ============================================
-- MIGRATION 010: Video purchases by transfer + unlock flow
-- ============================================

-- 1) Add flag on videos to indicate that purchase unlock is required
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'videos'
    ) THEN
        ALTER TABLE videos
            ADD COLUMN IF NOT EXISTS sales_unlocks_video BOOLEAN NOT NULL DEFAULT false;

        CREATE INDEX IF NOT EXISTS idx_videos_sales_unlocks_video
            ON videos (sales_unlocks_video)
            WHERE sales_unlocks_video = true;
    END IF;
END $$;

-- 2) Purchases for paid video unlocks
CREATE TABLE IF NOT EXISTS video_purchases (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    video_id UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
    amount NUMERIC(10, 2) NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'MXN',
    payment_method VARCHAR(20) NOT NULL DEFAULT 'transfer',
    status VARCHAR(30) NOT NULL DEFAULT 'pending_payment', -- pending_payment | pending_verification | approved | rejected | cancelled | expired
    payment_reference VARCHAR(120),
    transfer_date DATE,
    proof_file_url TEXT,
    proof_file_name VARCHAR(255),
    proof_file_type VARCHAR(120),
    customer_notes TEXT,
    admin_notes TEXT,
    reviewed_by UUID REFERENCES users(id),
    reviewed_at TIMESTAMP WITH TIME ZONE,
    approved_at TIMESTAMP WITH TIME ZONE,
    rejected_at TIMESTAMP WITH TIME ZONE,
    cancelled_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_video_purchases_user ON video_purchases(user_id);
CREATE INDEX IF NOT EXISTS idx_video_purchases_video ON video_purchases(video_id);
CREATE INDEX IF NOT EXISTS idx_video_purchases_status ON video_purchases(status);
CREATE INDEX IF NOT EXISTS idx_video_purchases_created_at ON video_purchases(created_at DESC);

-- Only one active purchase process or approved unlock per user/video
CREATE UNIQUE INDEX IF NOT EXISTS idx_video_purchases_user_video_active
    ON video_purchases(user_id, video_id)
    WHERE status IN ('pending_payment', 'pending_verification', 'approved');

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'video_purchases'
    ) AND EXISTS (
        SELECT 1
        FROM information_schema.routines
        WHERE routine_schema = 'public' AND routine_name = 'update_updated_at_column'
    ) THEN
        DROP TRIGGER IF EXISTS update_video_purchases_updated_at ON video_purchases;
        CREATE TRIGGER update_video_purchases_updated_at
            BEFORE UPDATE ON video_purchases
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
