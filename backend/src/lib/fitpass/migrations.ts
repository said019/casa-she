/**
 * Migraciones de la integración FitPass (122–127), SQL idempotente.
 *
 * Viven aquí (y no sólo inline en index.ts) para poder probarlas contra la BD local
 * dentro de BEGIN/ROLLBACK (scripts/test-fitpass-migrations.ts). index.ts las corre
 * en runStartupMigrations, cada una en su propio try/catch.
 *
 *   122  pgcrypto + platform_credentials.scraper_config (BYTEA, pgp_sym_encrypt) + extra_config
 *        + fila 'fitpass' deshabilitada
 *   123  class_types.fitpass_lesson_id / fitpass_quota
 *   124  trigger ensure_channel_inventory_for_class: TotalPass (como antes) + FitPass (fitpass_quota>0)
 *   125  users.source (usuarios fantasma de FitPass: 'fitpass')
 *   126  ownership: una schedule FP activa = una sola clase (índice único parcial)
 *   127  cron_job_logs (bitácora de crons partner)
 */
export interface FitpassMigration {
    n: number;
    name: string;
    statements: string[];
}

export const FITPASS_MIGRATIONS: FitpassMigration[] = [
    {
        n: 122,
        name: 'platform_credentials.scraper_config + fila fitpass',
        statements: [
            `CREATE EXTENSION IF NOT EXISTS "pgcrypto"`,
            `ALTER TABLE platform_credentials ADD COLUMN IF NOT EXISTS scraper_config BYTEA`,
            `ALTER TABLE platform_credentials ADD COLUMN IF NOT EXISTS extra_config JSONB NOT NULL DEFAULT '{}'::jsonb`,
            `COMMENT ON COLUMN platform_credentials.scraper_config IS
                'JSON {email,password,gym_id,panel_url,verified_at} cifrado con pgp_sym_encrypt; llave en env APP_ENCRYPTION_KEY'`,
            `INSERT INTO platform_credentials (channel, is_enabled) VALUES ('fitpass', false) ON CONFLICT (channel) DO NOTHING`,
        ],
    },
    {
        n: 123,
        name: 'class_types.fitpass_lesson_id / fitpass_quota',
        statements: [
            `ALTER TABLE class_types ADD COLUMN IF NOT EXISTS fitpass_lesson_id INTEGER`,
            `ALTER TABLE class_types ADD COLUMN IF NOT EXISTS fitpass_quota INTEGER NOT NULL DEFAULT 0`,
            `DO $$ BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'class_types_fitpass_quota_non_negative') THEN
                    ALTER TABLE class_types ADD CONSTRAINT class_types_fitpass_quota_non_negative CHECK (fitpass_quota >= 0);
                END IF;
            END $$`,
            `CREATE INDEX IF NOT EXISTS idx_class_types_fitpass_lesson ON class_types(fitpass_lesson_id) WHERE fitpass_lesson_id IS NOT NULL`,
        ],
    },
    {
        n: 124,
        name: 'trigger ensure_channel_inventory_for_class (+fitpass)',
        statements: [
            `CREATE OR REPLACE FUNCTION ensure_channel_inventory_for_class() RETURNS TRIGGER AS $$
            DECLARE tp_default INTEGER; fp_quota INTEGER;
            BEGIN
                SELECT COALESCE(totalpass_default_spots, 0), COALESCE(fitpass_quota, 0)
                  INTO tp_default, fp_quota FROM class_types WHERE id = NEW.class_type_id;
                IF tp_default > 0 THEN
                    INSERT INTO channel_inventory (class_id, channel, max_spots)
                    VALUES (NEW.id, 'totalpass', tp_default)
                    ON CONFLICT (class_id, channel) DO NOTHING;
                END IF;
                IF fp_quota > 0 THEN
                    INSERT INTO channel_inventory (class_id, channel, max_spots)
                    VALUES (NEW.id, 'fitpass', fp_quota)
                    ON CONFLICT (class_id, channel) DO NOTHING;
                END IF;
                RETURN NEW;
            END; $$ LANGUAGE plpgsql`,
            `DROP TRIGGER IF EXISTS trg_ensure_channel_inventory ON classes`,
            `CREATE TRIGGER trg_ensure_channel_inventory AFTER INSERT ON classes
                FOR EACH ROW EXECUTE FUNCTION ensure_channel_inventory_for_class()`,
        ],
    },
    {
        n: 125,
        name: 'users.source',
        statements: [
            `ALTER TABLE users ADD COLUMN IF NOT EXISTS source VARCHAR(20) DEFAULT 'app'`,
        ],
    },
    {
        n: 126,
        name: 'ownership de schedules FitPass',
        statements: [
            `CREATE UNIQUE INDEX IF NOT EXISTS uq_partner_fitpass_slot_owner
                ON partner_class_mappings (external_slot_id)
                WHERE channel = 'fitpass' AND external_slot_id IS NOT NULL AND sync_enabled = true`,
        ],
    },
    {
        n: 127,
        name: 'cron_job_logs',
        statements: [
            `CREATE TABLE IF NOT EXISTS cron_job_logs (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                job_name VARCHAR(100) NOT NULL,
                success BOOLEAN NOT NULL,
                details TEXT,
                executed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            )`,
            `CREATE INDEX IF NOT EXISTS idx_cron_job_logs_job_time ON cron_job_logs(job_name, executed_at DESC)`,
        ],
    },
    {
        n: 128,
        name: 'lesson por defecto de FitPass por nombre de tipo',
        statements: [
            // Casa Shé tiene un tipo por familia y FitPass variantes por horario: este id es SOLO el
            // default al CREAR una schedule nueva (publicación). Nunca pisa un mapeo existente.
            `UPDATE class_types ct SET fitpass_lesson_id = d.lesson_id
               FROM (VALUES
                    ('Barre', 46820),
                    ('Pilates Mat', 47206),
                    ('Sculpt Full Body', 46821),
                    ('Sculpt (Abs & Butt)', 47184),
                    ('Sculpt', 46821),
                    ('Power Abs', 47134),
                    ('Mat Power Abs', 47182),
                    ('Barre Funcional', 47189),
                    ('Pilates Booty', 46819),
                    ('Navakarana', 46833),
                    ('Rocket Yoga', 46832),
                    ('Flex', 46823),
                    ('Flex & Flow', 46823),
                    ('Power Vinyasa', 46831),
                    ('Yoga Vinyasa', 46831),
                    ('Yoga Dharma', 46834),
                    ('Flow Yoga', 46835),
                    ('Morning Flow', 46835),
                    ('Inicios de Ashtanga', 46822)
               ) AS d(name, lesson_id)
              WHERE lower(trim(ct.name)) = lower(d.name) AND ct.fitpass_lesson_id IS NULL`,
        ],
    },
];
