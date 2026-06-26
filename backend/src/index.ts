import express from 'express';
import cors from 'cors';
import compression from 'compression';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { pool } from './config/database.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import planRoutes from './routes/plans.js';
import membershipRoutes from './routes/memberships.js';
import adminRoutes from './routes/admin.js';
import auditRoutes from './routes/audit.js';
import instructorRoutes from './routes/instructors.js';
import classTypeRoutes from './routes/class-types.js';
import scheduleRoutes from './routes/schedules.js';
import classRoutes from './routes/classes.js';
import bookingRoutes from './routes/bookings.js';
import clientsRouter from './routes/clients.js';
import walletRoutes from './routes/wallet.js';
import checkinRoutes from './routes/checkin.js';
import paymentRoutes from './routes/payments.js';
import settingsRoutes from './routes/settings.js';
import loyaltyRoutes from './routes/loyalty.js';
import reportsRoutes from './routes/reports.js';
import reformersRoutes from './routes/reformers.js';
import facilitiesRoutes from './routes/facilities.js';
import ordersRoutes from './routes/orders.js';
import reviewsRoutes from './routes/reviews.js';
import cronRoutes from './routes/cron.js';
import workoutTemplatesRoutes from './routes/workout-templates.js';
import videoRoutes from './routes/videos.js';
import eventRoutes from './routes/events.js';
import discountCodeRoutes from './routes/discount-codes.js';
import evolutionRoutes from './routes/evolution.js';
import webhookEvolutionRoutes from './routes/webhook-evolution.js';
import migrationRoutes from './routes/migrations.js';
import productRoutes from './routes/products.js';
import salesRoutes from './routes/sales.js';
import commissionsRoutes from './routes/commissions.js';
import coachPayrollRoutes from './routes/coach-payroll.js';
import notificationsRoutes from './routes/notifications.js';
import searchRoutes from './routes/search.js';
import receptionDashboardRoutes from './routes/reception-dashboard.js';
import cashShiftRoutes from './routes/cash-shifts.js';
import egresosRoutes from './routes/egresos.js';
import closedDaysRoutes from './routes/closed-days.js';
import statsRoutes from './routes/stats.js';
import stripeWebhook from './routes/stripe-webhook.js';
import { validateStripeConfig } from './lib/stripe.js';
import { query, queryOne } from './config/database.js';
import { buildScheduleRows } from './lib/schedule.js';
import { PRESET_MASTER, PRESET_NORMAL } from './lib/permissions.js';
import { DEFAULT_RULES as ONBOARDING_DEFAULT_RULES } from './lib/onboarding-recommend.js';
import { SEED_INSTRUCTORS, SEED_CLASS_TYPES, FICHAS } from './data/bmb-schedules.js';
import { PHONE_BACKFILL, DOB_BACKFILL } from './data/fitune-backfill.js';
import { PHONE_BY_EMAIL, DOB_BY_EMAIL } from './data/fitune-contact-backfill.js';
import { FITUNE_INACTIVE_EMAILS } from './data/fitune-inactive-members.js';
import { REAL_START_BY_EMAIL } from './data/fitune-start-dates.js';
import { CREDIT_FIXES } from './data/fitune-credit-fixes.js';
import initializeCronJobs from './services/cron-jobs.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Detrás del proxy de Railway: necesario para que req.ip sea la IP real del
// cliente (X-Forwarded-For) y el rate-limit no agrupe a todos bajo el proxy.
app.set('trust proxy', 1);

// Cabeceras de seguridad. CSP off (es una API JSON, no sirve HTML) y CORP off
// para no interferir con la entrega cross-origin de pases/recursos.
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: false }));

// Rate-limiting. Global generoso (frena abuso/DoS sin estorbar el uso normal) y
// uno estricto para /api/auth (frena fuerza bruta de login y spam de correos).
const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 600,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) =>
        req.path === '/api/health' ||
        req.path.startsWith('/api/stripe/webhook') ||
        req.path.startsWith('/api/evolution/webhook'),
    message: { error: 'Demasiadas solicitudes. Intenta de nuevo en un momento.' },
});
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    // Solo cuenta intentos REALES (POST: login/register/forgot/reset). Excluye
    // GET /me (validación de sesión en cada carga de la app): no es blanco de
    // fuerza bruta y, en un estudio donde recepción + clientas comparten una
    // sola IP pública, era lo que agotaba el límite y bloqueaba hasta el login.
    skip: (req) => req.method !== 'POST',
    message: { error: 'Demasiados intentos. Espera unos minutos e intenta de nuevo.' },
});

// Middleware
const corsOptions: cors.CorsOptions = {
    origin: (origin, callback) => {
        // Allow all origins (including null for mobile/desktop apps)
        callback(null, origin || '*');
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    optionsSuccessStatus: 200,
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // Handle ALL preflight requests
app.use(compression());
// Stripe webhook necesita el body crudo → va ANTES de express.json(). Solo si Stripe está configurado.
if (process.env.STRIPE_SECRET_KEY) {
    const _cfg = validateStripeConfig(process.env);
    if (!_cfg.ok) console.warn('⚠️ Stripe config incompleta:', _cfg.errors.join(', '));
    app.use('/api/stripe/webhook', stripeWebhook);
}
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Límite global de tasa (excluye health y webhooks vía skip).
app.use(apiLimiter);

// Request logging in development
if (process.env.NODE_ENV !== 'production') {
    app.use((req, res, next) => {
        console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
        next();
    });
}

// Health Check (liveness): keep this endpoint 200 so Railway does not restart
// the container when PostgreSQL has a transient outage.
app.get('/api/health', async (req, res) => {
    try {
        const result = await query('SELECT NOW()');
        res.json({ status: 'ok', time: result[0].now, database: 'connected' });
    } catch (error) {
        res.json({ status: 'degraded', time: new Date().toISOString(), database: 'disconnected' });
    }
});

// Init DB adjustments — migraciones de arranque. Se ejecutan ANTES de aceptar
// requests (app.listen las espera) y bajo un ADVISORY LOCK en una conexión dedicada
// para que dos instancias no migren a la vez durante un deploy. Cada migración
// conserva su propio try/catch, así que un error puntual no detiene el arranque.
const MIGRATION_LOCK_KEY = 4815162342;
async function runStartupMigrations(): Promise<void> {
  const lockClient = await pool.connect();
  try {
    await lockClient.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);

    try {
        // We deduct credits on booking creation, so we must DISABLE the trigger that deducts on check-in
        // to avoid double charging. Also drop the dormant function so it can't be re-wired by accident.
        await query(`DROP TRIGGER IF EXISTS trigger_decrement_classes ON bookings`);
        await query(`DROP FUNCTION IF EXISTS decrement_membership_classes() CASCADE`);
        console.log('Database triggers adjusted for booking logic.');
    } catch (e) {
        console.error('Error adjusting DB triggers:', e);
    }

    // Migración 010: columnas Clip + payment_events + unmatched_webhooks
    // Idempotente (todas las DDLs usan IF NOT EXISTS).
    try {
        await query(`ALTER TABLE payments
            ADD COLUMN IF NOT EXISTS provider VARCHAR(40),
            ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
            ADD COLUMN IF NOT EXISTS clip_payment_request_id VARCHAR(120),
            ADD COLUMN IF NOT EXISTS clip_checkout_url TEXT,
            ADD COLUMN IF NOT EXISTS clip_receipt_no VARCHAR(120),
            ADD COLUMN IF NOT EXISTS clip_auth_code VARCHAR(60),
            ADD COLUMN IF NOT EXISTS clip_card_brand VARCHAR(20),
            ADD COLUMN IF NOT EXISTS clip_card_last4 VARCHAR(4),
            ADD COLUMN IF NOT EXISTS reference_id VARCHAR(120),
            ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE,
            ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP WITH TIME ZONE,
            ADD COLUMN IF NOT EXISTS raw_webhook JSONB`);

        await query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_reference_id ON payments(reference_id) WHERE reference_id IS NOT NULL`);
        await query(`CREATE INDEX IF NOT EXISTS idx_payments_clip_payment_request_id ON payments(clip_payment_request_id) WHERE clip_payment_request_id IS NOT NULL`);
        await query(`CREATE INDEX IF NOT EXISTS idx_payments_clip_receipt_no ON payments(clip_receipt_no) WHERE clip_receipt_no IS NOT NULL`);

        await query(`CREATE TABLE IF NOT EXISTS payment_events (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
            event_type VARCHAR(60) NOT NULL,
            from_status VARCHAR(50),
            to_status VARCHAR(50),
            payload JSONB,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )`);
        await query(`CREATE INDEX IF NOT EXISTS idx_payment_events_payment ON payment_events(payment_id, created_at DESC)`);

        await query(`CREATE TABLE IF NOT EXISTS unmatched_webhooks (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            provider VARCHAR(40) NOT NULL,
            payload JSONB NOT NULL,
            received_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            resolved_at TIMESTAMP WITH TIME ZONE,
            resolved_payment_id UUID REFERENCES payments(id) ON DELETE SET NULL
        )`);
        await query(`CREATE INDEX IF NOT EXISTS idx_unmatched_webhooks_received ON unmatched_webhooks(received_at DESC) WHERE resolved_at IS NULL`);

        console.log('Clip payments migration applied (010).');
    } catch (e) {
        console.error('Error applying Clip payments migration:', e);
    }

    // Migration 017: Ensure exactly the 5 official Balance Room plans exist (idempotent)
    try {
        // Delete all plans then reinsert – runs on every boot but is idempotent
        // because we wipe first. Safe as long as memberships reference plan IDs
        // that are re-created with consistent names each time.
        // Use a transaction so the table is never empty mid-request.
        // Casa Shé: neutralizado. El catálogo de planes lo gobierna el bloque consolidado
        // "Casa Shé v1" al final (no este seed de Balance Room, que además BORRABA en cada
        // arranque los planes no-oficiales — incluidos los de Casa Shé).
        console.log('Plans (017): neutralizado para Casa Shé (catálogo lo fija el bloque consolidado).');
    } catch (e) {
        console.error('Error seeding plans (017):', e);
    }

    // Migration 018: Referral system tables + columns (each step isolated)
    try { await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code VARCHAR(30) UNIQUE`); } catch (e) { console.error('018a:', e); }
    try { await query(`ALTER TABLE discount_codes ADD COLUMN IF NOT EXISTS is_referral BOOLEAN DEFAULT false`); } catch (e) { console.error('018b:', e); }
    try { await query(`ALTER TABLE discount_codes ADD COLUMN IF NOT EXISTS referral_owner_id UUID REFERENCES users(id) ON DELETE SET NULL`); } catch (e) { console.error('018c:', e); }
    try {
        await query(`
            CREATE TABLE IF NOT EXISTS referral_redemptions (
                id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                code           VARCHAR(30) NOT NULL,
                referrer_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                referred_id    UUID NOT NULL UNIQUE,
                order_id       UUID REFERENCES orders(id) ON DELETE SET NULL,
                points_awarded INT NOT NULL DEFAULT 10,
                created_at     TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await query(`CREATE INDEX IF NOT EXISTS idx_referral_redemptions_referrer ON referral_redemptions(referrer_id)`);
        await query(`CREATE INDEX IF NOT EXISTS idx_users_referral_code ON users(referral_code) WHERE referral_code IS NOT NULL`);
        console.log('Migration 018: referral system tables ready.');
    } catch (e) { console.error('018d:', e); }

    // Fix missing columns in orders + other tables
    try { await query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS tax_rate NUMERIC(5,4) DEFAULT 0`); } catch(e) { console.error('fix-orders-a:', e); }
    try { await query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS tax_amount NUMERIC(10,2) DEFAULT 0`); } catch(e) { console.error('fix-orders-b:', e); }
    try { await query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_code_id UUID`); } catch(e) { console.error('fix-orders-c:', e); }
    try { await query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(10,2)`); } catch(e) { console.error('fix-orders-d:', e); }
    try { await query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ`); } catch(e) { console.error('fix-orders-e:', e); }
    try { await query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_notes TEXT`); } catch(e) { console.error('fix-orders-f:', e); }
    try { await query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS currency VARCHAR(10) DEFAULT 'MXN'`); } catch(e) { console.error('fix-orders-g:', e); }
    // Card processing fee (4% platform fee for MercadoPago card payments)
    try { await query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS card_fee_amount NUMERIC(10,2) DEFAULT 0`); } catch(e) { console.error('fix-orders-h:', e); }
    // Bookings: replace strict UNIQUE (class_id, user_id) with a partial index that
    // ignores cancelled rows, so a client who cancels can re-book the same class.
    try {
        await query(`ALTER TABLE bookings DROP CONSTRAINT IF EXISTS unique_booking`);
        await query(`CREATE UNIQUE INDEX IF NOT EXISTS unique_booking_active
                     ON bookings (class_id, user_id) WHERE status <> 'cancelled'`);
    } catch (e) { console.error('fix-bookings-unique:', e); }

    // Migration 019: Spot selection system
    try { await query(`ALTER TABLE facilities ADD COLUMN IF NOT EXISTS background_url TEXT`); } catch (e) { console.error('019a:', e); }
    try { await query(`ALTER TABLE facilities ADD COLUMN IF NOT EXISTS default_reformer_image_url TEXT`); } catch (e) { console.error('019b:', e); }
    try { await query(`ALTER TABLE facilities ADD COLUMN IF NOT EXISTS front_position_x NUMERIC(5,2) DEFAULT 50`); } catch (e) { console.error('019c:', e); }
    try { await query(`ALTER TABLE facilities ADD COLUMN IF NOT EXISTS front_position_y NUMERIC(5,2) DEFAULT 92`); } catch (e) { console.error('019d:', e); }
    try { await query(`ALTER TABLE facilities ADD COLUMN IF NOT EXISTS map_notes TEXT`); } catch (e) { console.error('019e:', e); }
    try { await query(`ALTER TABLE class_types ADD COLUMN IF NOT EXISTS spot_icon VARCHAR(20) DEFAULT 'reformer' CHECK (spot_icon IN ('reformer','mat','barre','generic'))`); } catch (e) { console.error('019f:', e); }
    try { await query(`ALTER TABLE class_types ADD COLUMN IF NOT EXISTS facility_id UUID REFERENCES facilities(id)`); } catch (e) { console.error('019g:', e); }
    try { await query(`ALTER TABLE classes ADD COLUMN IF NOT EXISTS facility_id UUID REFERENCES facilities(id)`); } catch (e) { console.error('019h:', e); }
    try {
        await query(`
            CREATE TABLE IF NOT EXISTS reformers (
                id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                facility_id UUID NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
                number      INTEGER NOT NULL,
                label       TEXT,
                position_x  NUMERIC(5,2) NOT NULL DEFAULT 50,
                position_y  NUMERIC(5,2) NOT NULL DEFAULT 50,
                rotation    INTEGER NOT NULL DEFAULT 0,
                scale       NUMERIC(4,2) NOT NULL DEFAULT 1.0,
                image_url   TEXT,
                is_active   BOOLEAN NOT NULL DEFAULT TRUE,
                created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                UNIQUE(facility_id, number)
            )
        `);
        await query(`
            CREATE TABLE IF NOT EXISTS booking_reformers (
                id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                booking_id  UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
                class_id    UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
                reformer_id UUID NOT NULL REFERENCES reformers(id) ON DELETE CASCADE,
                assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                UNIQUE(booking_id),
                UNIQUE(class_id, reformer_id)
            )
        `);
        console.log('Migration 019: spot selection tables ready.');
    } catch (e) { console.error('019i:', e); }

    // Migration 020: Seed Balance Room facilities + link class types
    try {
        // Fix spot_icon constraint to include 'wunda'
        await query(`ALTER TABLE class_types DROP CONSTRAINT IF EXISTS class_types_spot_icon_check`);
        await query(`ALTER TABLE class_types ADD CONSTRAINT class_types_spot_icon_check CHECK (spot_icon IN ('reformer','mat','barre','generic','wunda'))`);

        // Desambiguar nombres de sucursales duplicados (cruft de la base, p.ej. "Sala Principal" x2)
        // ANTES de crear el UNIQUE, o el ADD CONSTRAINT falla. No destructivo: conserva todas las
        // filas y sus FKs; solo renombra los duplicados (2º en adelante) con un sufijo único por id.
        await query(`
            UPDATE facilities f
            SET name = f.name || ' #' || left(f.id::text, 8), updated_at = NOW()
            FROM (
                SELECT id, ROW_NUMBER() OVER (PARTITION BY name ORDER BY sort_order, created_at, id) AS rn
                FROM facilities
            ) sub
            WHERE f.id = sub.id AND sub.rn > 1
        `);

        // UNIQUE on facilities.name and reformers (facility_id, number) — prevents duplicates from rerunning seeds
        await query(`
            DO $$ BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'facilities_name_unique') THEN
                    ALTER TABLE facilities ADD CONSTRAINT facilities_name_unique UNIQUE (name);
                END IF;
                IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reformers_facility_number_unique') THEN
                    ALTER TABLE reformers ADD CONSTRAINT reformers_facility_number_unique UNIQUE (facility_id, number);
                END IF;
            END $$;
        `);

        // Casa Shé mono-sede: NO se crean salas/sucursales cruft (Wunda/Barre/Hot Room).

        // Link class types to facilities and set correct spot_icon
        // Barre
        await query(`
            UPDATE class_types
            SET facility_id = (SELECT id FROM facilities WHERE name = 'Barre' LIMIT 1),
                spot_icon = 'barre'
            WHERE LOWER(name) LIKE '%barre%'
        `);

        // Hot Room classes: Sculpt, Yoga, Pilates Mat, Hot Yoga, Hot Pilates
        await query(`
            UPDATE class_types
            SET facility_id = (SELECT id FROM facilities WHERE name = 'Hot Room' LIMIT 1),
                spot_icon = 'mat'
            WHERE LOWER(name) LIKE ANY(ARRAY['%sculpt%','%yoga%','%pilates mat%','%hot pilates%'])
        `);

        // Wunda — everything not already assigned
        await query(`
            UPDATE class_types
            SET facility_id = (SELECT id FROM facilities WHERE name = 'Wunda' LIMIT 1),
                spot_icon = 'wunda'
            WHERE facility_id IS NULL AND is_active = true
        `);

        console.log('Migration 020: facilities seeded and class types linked.');
    } catch (e) { console.error('Migration 020 error:', e); }

    // Migration 021: Seed schedules 7/8/9am + 5/6/7pm for all 3 studios + generate classes
    // Guarded by a one-time flag so deploys never re-seed after the user deletes schedules.
    try {
        await query(`CREATE TABLE IF NOT EXISTS migration_flags (
            name VARCHAR(100) PRIMARY KEY,
            applied_at TIMESTAMPTZ DEFAULT NOW()
        )`);
        const m021Applied = await query(`SELECT 1 FROM migration_flags WHERE name = 'migration_021_schedules'`);
        if (m021Applied.length > 0) {
            console.log('Migration 021: already applied, skipping schedule seed.');
        } else {
        await query(`
            DO $$
            DECLARE
                wunda_id    UUID;
                barre_id    UUID;
                hot_id      UUID;
                wunda_ct    UUID;
                barre_ct    UUID;
                hot_ct      UUID;
                inst_id     UUID;
                inst_user   UUID;
                times       TEXT[][] := ARRAY[
                    ARRAY['07:00','08:00'],
                    ARRAY['08:00','09:00'],
                    ARRAY['09:00','10:00'],
                    ARRAY['17:00','18:00'],
                    ARRAY['18:00','19:00'],
                    ARRAY['19:00','20:00']
                ];
                t           TEXT[];
                dow         INT;
                target_date DATE;
            BEGIN
                -- Casa Shé mono-sede: no se generan salas/horarios cruft de Balance Room.
                RETURN;
                -- (código BMB original deshabilitado)
                INSERT INTO facilities (name, capacity, is_active, sort_order)
                VALUES ('Wunda', 8, true, 1), ('Barre', 10, true, 2), ('Hot Room', 15, true, 3)
                ON CONFLICT DO NOTHING;

                SELECT id INTO wunda_id FROM facilities WHERE name = 'Wunda'    LIMIT 1;
                SELECT id INTO barre_id FROM facilities WHERE name = 'Barre'    LIMIT 1;
                SELECT id INTO hot_id   FROM facilities WHERE name = 'Hot Room' LIMIT 1;

                -- Ensure class types exist for each facility
                INSERT INTO class_types (name, color, duration_minutes, max_capacity, facility_id, spot_icon, is_active)
                SELECT 'Silla Wunda', '#6F776C', 50, 8, wunda_id, 'wunda', true
                WHERE NOT EXISTS (SELECT 1 FROM class_types WHERE facility_id = wunda_id AND is_active = true);

                INSERT INTO class_types (name, color, duration_minutes, max_capacity, facility_id, spot_icon, is_active)
                SELECT 'Barre', '#837A70', 50, 10, barre_id, 'barre', true
                WHERE NOT EXISTS (SELECT 1 FROM class_types WHERE facility_id = barre_id AND is_active = true);

                INSERT INTO class_types (name, color, duration_minutes, max_capacity, facility_id, spot_icon, is_active)
                SELECT 'Yoga', '#7E8579', 50, 15, hot_id, 'mat', true
                WHERE NOT EXISTS (SELECT 1 FROM class_types WHERE facility_id = hot_id AND is_active = true);

                SELECT id INTO wunda_ct FROM class_types WHERE facility_id = wunda_id AND is_active = true LIMIT 1;
                SELECT id INTO barre_ct FROM class_types WHERE facility_id = barre_id AND is_active = true LIMIT 1;
                SELECT id INTO hot_ct   FROM class_types WHERE facility_id = hot_id   AND is_active = true LIMIT 1;

                -- Ensure at least one instructor exists
                SELECT id INTO inst_id FROM instructors WHERE is_active = true LIMIT 1;
                IF inst_id IS NULL THEN
                    INSERT INTO users (email, password_hash, display_name, phone, role, is_active)
                    VALUES ('coach@balanceroom.mx', '$2b$10$ELPrfYdYroo/URqPraoj9eWP7KfYNGZfEbFpYq8uYLN.tnfdQY15S', 'Coach Balance', '0000000000', 'instructor', true)
                    ON CONFLICT (email) DO UPDATE SET role = 'instructor'
                    RETURNING id INTO inst_user;
                    INSERT INTO instructors (user_id, display_name, is_active)
                    SELECT inst_user, 'Coach Balance', true
                    WHERE inst_user IS NOT NULL AND NOT EXISTS (SELECT 1 FROM instructors WHERE user_id = inst_user);
                    SELECT id INTO inst_id FROM instructors WHERE is_active = true LIMIT 1;
                END IF;

                IF inst_id IS NULL THEN
                    RAISE NOTICE 'Migration 021: still no instructor, skipping';
                    RETURN;
                END IF;

                -- Delete old schedules for these facilities (clean slate)
                DELETE FROM schedules WHERE facility_id IN (wunda_id, barre_id, hot_id);

                -- Create schedules Mon-Sat (1-6) x 6 times x 3 facilities
                FOREACH t SLICE 1 IN ARRAY times LOOP
                    FOR dow IN 1..6 LOOP
                        INSERT INTO schedules (class_type_id, instructor_id, facility_id, day_of_week, start_time, end_time, max_capacity, is_recurring, is_active)
                        VALUES (wunda_ct, inst_id, wunda_id, dow, t[1]::time, t[2]::time, 8,  true, true),
                               (barre_ct, inst_id, barre_id, dow, t[1]::time, t[2]::time, 10, true, true),
                               (hot_ct,   inst_id, hot_id,   dow, t[1]::time, t[2]::time, 15, true, true);
                    END LOOP;
                END LOOP;

                -- Delete existing scheduled classes WITHOUT bookings (preserve user reservations)
                DELETE FROM classes c
                WHERE c.facility_id IN (wunda_id, barre_id, hot_id)
                  AND c.date >= CURRENT_DATE
                  AND c.status = 'scheduled'
                  AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.class_id = c.id);

                -- Generate classes for the next 30 days
                FOR i IN 0..29 LOOP
                    target_date := CURRENT_DATE + i;
                    dow := EXTRACT(DOW FROM target_date)::INT;
                    IF dow BETWEEN 1 AND 6 THEN
                        INSERT INTO classes (schedule_id, class_type_id, instructor_id, facility_id, date, start_time, end_time, max_capacity, status)
                        SELECT s.id, s.class_type_id, s.instructor_id, s.facility_id,
                               target_date, s.start_time, s.end_time, s.max_capacity, 'scheduled'
                        FROM schedules s
                        WHERE s.is_active = true AND s.day_of_week = dow
                          AND s.facility_id IN (wunda_id, barre_id, hot_id)
                          AND NOT EXISTS (
                              SELECT 1 FROM classes c2
                              WHERE c2.schedule_id = s.id AND c2.date = target_date
                          );
                    END IF;
                END LOOP;

                RAISE NOTICE 'Migration 021: schedules and classes seeded OK.';
            END $$;
        `);
            await query(`INSERT INTO migration_flags (name) VALUES ('migration_021_schedules') ON CONFLICT DO NOTHING`);
            console.log('Migration 021: schedules 7/8/9am + 5/6/7pm seeded for Wunda, Barre, Hot Room (30 days).');
        }
    } catch (e) { console.error('Migration 021 error:', e); }

    // Migration 029: package types (individual/mixto/sample), studio binding,
    // manual incomes, payment concept/facility. Schema is idempotent; data seed
    // is guarded by migration_flags so reruns never duplicate plans.
    try {
        await query(`ALTER TABLE plans
            ADD COLUMN IF NOT EXISTS package_type VARCHAR(20) NOT NULL DEFAULT 'mixto',
            ADD COLUMN IF NOT EXISTS requires_studio_selection BOOLEAN NOT NULL DEFAULT false`);
        // Constrain package_type to known values; DROP+ADD keeps it idempotent on rerun.
        await query(`ALTER TABLE plans DROP CONSTRAINT IF EXISTS plans_package_type_check`);
        await query(`ALTER TABLE plans ADD CONSTRAINT plans_package_type_check
            CHECK (package_type IN ('individual', 'mixto', 'sample'))`);
        await query(`ALTER TABLE orders
            ADD COLUMN IF NOT EXISTS facility_id UUID REFERENCES facilities(id)`);
        await query(`ALTER TABLE memberships
            ADD COLUMN IF NOT EXISTS facility_id UUID REFERENCES facilities(id)`);
        await query(`ALTER TABLE payments
            ADD COLUMN IF NOT EXISTS facility_id UUID REFERENCES facilities(id),
            ADD COLUMN IF NOT EXISTS concept VARCHAR(255)`);
        await query(`CREATE TABLE IF NOT EXISTS manual_incomes (
            id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            amount         DECIMAL(10, 2) NOT NULL,
            currency       VARCHAR(3) DEFAULT 'MXN',
            concept        VARCHAR(255) NOT NULL,
            payment_method payment_method NOT NULL,
            facility_id    UUID REFERENCES facilities(id),
            notes          TEXT,
            income_date    DATE NOT NULL DEFAULT CURRENT_DATE,
            processed_by   UUID REFERENCES users(id),
            created_at     TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )`);

        await query(`CREATE TABLE IF NOT EXISTS migration_flags (
            name VARCHAR(100) PRIMARY KEY,
            applied_at TIMESTAMPTZ DEFAULT NOW()
        )`);
        // Flag key intentionally kept as 'migration_022_pricing' (block relabeled 029
        // only in comments/logs to avoid a duplicate "Migration 022" label).
        const m022 = await query(`SELECT 1 FROM migration_flags WHERE name = 'migration_022_pricing'`);
        if (m022.length > 0) {
            console.log('Migration 029: already applied, skipping pricing seed.');
        } else {
            await query(`UPDATE plans SET is_active = false WHERE is_active = true`);
            // Planes viejos (los que ya tienen usuarios/membresías) quedan como
            // mixto y sin atadura de estudio, para no restringir reservas existentes.
            await query(`UPDATE plans SET package_type = 'mixto', requires_studio_selection = false WHERE is_active = false`);
            await query(`
                INSERT INTO plans (name, description, price, currency, duration_days, class_limit, features, is_active, sort_order, package_type, requires_studio_selection)
                VALUES
                ('Individual · Clase Suelta',      'Clase suelta en un solo estudio',        180,  'MXN', 30, 1,  '[]'::jsonb, true, 10, 'individual', true),
                ('Individual · Paquete 4 Clases',  'Paquete 4 clases en un solo estudio',    600,  'MXN', 30, 4,  '[]'::jsonb, true, 11, 'individual', true),
                ('Individual · Paquete 8 Clases',  'Paquete 8 clases en un solo estudio',    1100, 'MXN', 30, 8,  '[]'::jsonb, true, 12, 'individual', true),
                ('Individual · Paquete 12 Clases', 'Paquete 12 clases en un solo estudio',   1700, 'MXN', 30, 12, '[]'::jsonb, true, 13, 'individual', true),
                ('Individual · Paquete 24 Clases', 'Paquete 24 clases en un solo estudio',   2000, 'MXN', 30, 24, '[]'::jsonb, true, 14, 'individual', true),
                ('Mixto · Paquete 4 Clases',       'Paquete 4 clases en cualquier estudio',  670,  'MXN', 30, 4,  '[]'::jsonb, true, 20, 'mixto', false),
                ('Mixto · Paquete 8 Clases',       'Paquete 8 clases en cualquier estudio',  1300, 'MXN', 30, 8,  '[]'::jsonb, true, 21, 'mixto', false),
                ('Mixto · Paquete 12 Clases',      'Paquete 12 clases en cualquier estudio', 1890, 'MXN', 30, 12, '[]'::jsonb, true, 22, 'mixto', false),
                ('Mixto · Paquete 24 Clases',      'Paquete 24 clases en cualquier estudio', 2600, 'MXN', 30, 24, '[]'::jsonb, true, 23, 'mixto', false),
                ('Clase Muestra',                  'Clase muestra (gratis si compras un paquete) — vigencia 7 días', 99, 'MXN', 7, 1, '[]'::jsonb, true, 30, 'sample', false)
            `);
            await query(`INSERT INTO migration_flags (name) VALUES ('migration_022_pricing') ON CONFLICT DO NOTHING`);
            console.log('Migration 029: pricing/studio/manual-income applied.');
        }
    } catch (e) {
        console.error('Error applying Migration 029:', e);
    }

    // Cleanup: borra planes viejos inactivos que ya no tienen membresías ni
    // órdenes. Idempotente y seguro: los planes aún referenciados se respetan
    // (no rompe integridad). Corre en cada arranque.
    try {
        const del = await query(`
            DELETE FROM plans p
            WHERE p.is_active = false
              AND NOT EXISTS (SELECT 1 FROM memberships m WHERE m.plan_id = p.id)
              AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.plan_id = p.id)
            RETURNING p.id`);
        if (Array.isArray(del) && del.length > 0) {
            console.log(`Cleanup: removed ${del.length} unreferenced legacy plan(s).`);
        }
    } catch (e) {
        console.error('Error cleaning legacy plans:', e);
    }

    // Backstop de idempotencia: una orden no puede generar 2 membresías.
    // Bloquea la carrera webhook-vs-cron de reconciliación a nivel BD
    // (el 2º proceso concurrente aborta su transacción completa).
    try {
        await query(`CREATE UNIQUE INDEX IF NOT EXISTS uniq_memberships_order_id
            ON memberships (order_id) WHERE order_id IS NOT NULL`);
    } catch (e) {
        console.error('Error creating uniq_memberships_order_id:', e);
    }

    // Migration 021b: Seed spots (lugares) for Wunda, Barre, Hot Room
    try {
        // Ensure required columns exist on reformers
        await query(`ALTER TABLE reformers
            ADD COLUMN IF NOT EXISTS spot_kind VARCHAR(20),
            ADD COLUMN IF NOT EXISTS label VARCHAR(50),
            ADD COLUMN IF NOT EXISTS position_x INT DEFAULT 0,
            ADD COLUMN IF NOT EXISTS position_y INT DEFAULT 0,
            ADD COLUMN IF NOT EXISTS rotation INT DEFAULT 0,
            ADD COLUMN IF NOT EXISTS scale NUMERIC(4,2) DEFAULT 1,
            ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true`);
        await query(`
            DO $$
            DECLARE
                f_wunda UUID;
                f_barre UUID;
                f_hot   UUID;
                i INT;
                col INT;
                row_n INT;
                px INT;
                py INT;
            BEGIN
                SELECT id INTO f_wunda FROM facilities WHERE LOWER(name) LIKE '%wunda%' LIMIT 1;
                SELECT id INTO f_barre FROM facilities WHERE LOWER(name) LIKE '%barre%' LIMIT 1;
                SELECT id INTO f_hot   FROM facilities WHERE LOWER(name) LIKE '%hot%'   LIMIT 1;

                -- Wunda: 8 sillas en 2 filas de 4 (porcentajes 0-100)
                IF f_wunda IS NOT NULL THEN
                    DELETE FROM reformers WHERE facility_id = f_wunda;
                    FOR i IN 1..8 LOOP
                        col := ((i - 1) % 4);
                        row_n := ((i - 1) / 4);
                        px := 22 + col * 19;
                        py := 35 + row_n * 28;
                        INSERT INTO reformers (facility_id, number, label, position_x, position_y, rotation, scale, is_active)
                        VALUES (f_wunda, i, 'W' || i, px, py, 0, 1, true);
                    END LOOP;
                END IF;

                -- Barre: 12 mats en 2 filas de 6
                IF f_barre IS NOT NULL THEN
                    DELETE FROM reformers WHERE facility_id = f_barre;
                    FOR i IN 1..12 LOOP
                        col := ((i - 1) % 6);
                        row_n := ((i - 1) / 6);
                        px := 13 + col * 14;
                        py := 35 + row_n * 28;
                        INSERT INTO reformers (facility_id, number, label, position_x, position_y, rotation, scale, is_active)
                        VALUES (f_barre, i, 'B' || i, px, py, 0, 1, true);
                    END LOOP;
                END IF;

                -- Hot Room: 16 mats en 2 filas de 8
                IF f_hot IS NOT NULL THEN
                    DELETE FROM reformers WHERE facility_id = f_hot;
                    FOR i IN 1..16 LOOP
                        col := ((i - 1) % 8);
                        row_n := ((i - 1) / 8);
                        px := 10 + col * 11;
                        py := 35 + row_n * 28;
                        INSERT INTO reformers (facility_id, number, label, position_x, position_y, rotation, scale, is_active)
                        VALUES (f_hot, i, 'H' || i, px, py, 0, 1, true);
                    END LOOP;
                END IF;

                -- Update spot_kind labels for icon rendering
                UPDATE reformers SET spot_kind = 'wunda' WHERE facility_id = f_wunda AND spot_kind IS NULL;
                UPDATE reformers SET spot_kind = 'barre' WHERE facility_id = f_barre AND spot_kind IS NULL;
                UPDATE reformers SET spot_kind = 'mat'   WHERE facility_id = f_hot   AND spot_kind IS NULL;

                RAISE NOTICE 'Migration 021b: spots seeded for Wunda(8), Barre(12), Hot Room(16).';
            END $$;
        `);
        console.log('Migration 021b: spots seeded for Wunda(8), Barre(12), Hot Room(16).');
    } catch (e) { console.error('Migration 021b error:', e); }

    // Migration 027: Founders members — flags + audit
    try {
        await query(`ALTER TABLE users
            ADD COLUMN IF NOT EXISTS is_founder BOOLEAN NOT NULL DEFAULT false,
            ADD COLUMN IF NOT EXISTS founder_assigned_at TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS founder_first_package_used BOOLEAN NOT NULL DEFAULT false,
            ADD COLUMN IF NOT EXISTS founder_double_points_used BOOLEAN NOT NULL DEFAULT false,
            ADD COLUMN IF NOT EXISTS founder_first_used_at TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS founder_double_points_used_at TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS sample_class_discount_used BOOLEAN NOT NULL DEFAULT false,
            ADD COLUMN IF NOT EXISTS sample_class_discount_used_at TIMESTAMPTZ`);
        await query(`CREATE TABLE IF NOT EXISTS founder_audit (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            action VARCHAR(40) NOT NULL CHECK (action IN
                ('granted','revoked','discount_used','points_used','reset','discount_rolled_back')),
            admin_id UUID REFERENCES users(id) ON DELETE SET NULL,
            metadata JSONB DEFAULT '{}',
            created_at TIMESTAMPTZ DEFAULT NOW()
        )`);
        await query(`CREATE INDEX IF NOT EXISTS idx_founder_audit_user ON founder_audit(user_id, created_at DESC)`);
        console.log('Migration 027: founders columns + audit ready.');
    } catch (e) { console.error('Migration 027 error:', e); }

    // Migration 028: Free classes (Opening Day)
    try {
        await query(`ALTER TABLE classes
            ADD COLUMN IF NOT EXISTS is_free BOOLEAN NOT NULL DEFAULT false,
            ADD COLUMN IF NOT EXISTS free_label VARCHAR(100)`);
        await query(`ALTER TABLE bookings
            ADD COLUMN IF NOT EXISTS is_free_booking BOOLEAN NOT NULL DEFAULT false`);
        await query(`CREATE INDEX IF NOT EXISTS idx_classes_is_free ON classes(is_free) WHERE is_free = true`);
        console.log('Migration 028: free classes columns ready.');
    } catch (e) { console.error('Migration 028 error:', e); }

    // Migration 030: membership categories (reformer/multi) + per-category credit buckets
    try {
        await query(`DO $$ BEGIN CREATE TYPE class_category AS ENUM ('reformer','multi'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;`);
        await query(`ALTER TABLE class_types ADD COLUMN IF NOT EXISTS category class_category NOT NULL DEFAULT 'multi'`);
        await query(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS reformer_credits INTEGER`);
        await query(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS multi_credits INTEGER`);
        await query(`ALTER TABLE memberships ADD COLUMN IF NOT EXISTS reformer_remaining INTEGER`);
        await query(`ALTER TABLE memberships ADD COLUMN IF NOT EXISTS multi_remaining INTEGER`);
        await query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS consumed_category class_category`);
        // Nota: no se agregan UNIQUE(name) porque las tablas base traen nombres
        // duplicados (p.ej. "Sala Principal"). El seed (031) es idempotente vía NOT EXISTS.
        console.log('Migration 030: membership categories + buckets ready.');
    } catch (e) { console.error('Migration 030 error:', e); }

    // Migration 031: seed base. Casa Shé es UN SOLO LUGAR: NO se crean las sucursales BMB
    // (Tepa/San Miguel). La única sede ('Casa Shé — Condesa') la crea el bloque consolidado.
    try {
        // (Sucursales BMB Tepa/San Miguel eliminadas — Casa Shé es mono-sede.)
        await query(`INSERT INTO class_types (name, category, level, duration_minutes, max_capacity)
            SELECT v.name, v.category::class_category, v.level::class_level, v.duration_minutes, v.max_capacity
            FROM (VALUES
              ('Pilates Reformer','reformer','all',50,8),
              ('Yoga','multi','all',50,12),
              ('Hot Yoga','multi','all',50,12),
              ('Barre','multi','all',50,12),
              ('Hot Barre','multi','all',50,12),
              ('Sculpt','multi','all',50,12),
              ('Hot Sculpt','multi','all',50,12),
              ('Hot Pilates','multi','all',50,12),
              ('Pole Fitness','multi','all',50,10),
              ('Pole Dance','multi','all',50,10),
              ('Flex','multi','all',50,12),
              ('Funcional','multi','all',50,12),
              ('Twerk','multi','all',50,12)
            ) AS v(name, category, level, duration_minutes, max_capacity)
            WHERE NOT EXISTS (SELECT 1 FROM class_types ct WHERE ct.name = v.name)`);
        await query(`INSERT INTO plans (name, reformer_credits, multi_credits, price, duration_days, is_active, sort_order)
            SELECT v.name, v.reformer_credits, v.multi_credits, v.price, v.duration_days, v.is_active, v.sort_order
            FROM (VALUES
              ('Reformer 4',4,0,800,30,true,10),('Reformer 8',8,0,1200,30,true,11),('Reformer 12',12,0,1550,30,true,12),
              ('Reformer 16',16,0,1850,30,true,13),('Reformer 20',20,0,2100,30,true,14),('Reformer 30',30,0,3000,45,true,15),
              ('Multi 4',0,4,550,30,true,20),('Multi 8',0,8,900,30,true,21),('Multi 12',0,12,1200,30,true,22),
              ('Multi 16',0,16,1440,30,true,23),('Multi 20',0,20,1600,30,true,24),('Multi 30',0,30,2100,45,true,25),
              ('Mixta 12',6,6,1450,30,true,30),('Mixta 16',8,8,1700,30,true,31),('Mixta 20',10,10,1900,30,true,32),
              ('Multi full',0,NULL,2800,45,true,40),('Reformer full',NULL,0,3500,45,true,41),('Full access',NULL,NULL,4000,45,true,42),
              ('1ra vez reformer',1,0,100,7,true,50),('1ra vez multi',0,1,75,7,true,51),
              ('Reformer individual',1,0,250,7,true,52),('Multi individual',0,1,150,7,true,53),('Personalizada',1,0,550,7,true,54)
            ) AS v(name, reformer_credits, multi_credits, price, duration_days, is_active, sort_order)
            WHERE NOT EXISTS (SELECT 1 FROM plans p WHERE p.name = v.name)`);
        // Casa Shé: cancelación 5h. Sin forzar en cada arranque (el bloque consolidado del
        // final fija el valor una sola vez; así la admin puede ajustarlo después desde la UI).
        await query(`INSERT INTO system_settings (key, value) VALUES ('cancellation_policy', '{"enabled": true, "min_hours": 5, "refund_credit_on_cancel": true, "cancellations_per_membership": 999}'::jsonb)
            ON CONFLICT (key) DO NOTHING`);
        console.log('Migration 031: catálogo base + cancelación 5h sembrados.');
    } catch (e) { console.error('Migration 031 error:', e); }

    // Migration 032: POS (catálogo + ventas) + caja (turnos) + atribución
    try {
        await query(`CREATE TABLE IF NOT EXISTS product_categories (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name VARCHAR(100) NOT NULL, description TEXT, is_active BOOLEAN DEFAULT true,
            created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`);
        await query(`CREATE TABLE IF NOT EXISTS products (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name VARCHAR(200) NOT NULL, description TEXT,
            price NUMERIC(10,2) NOT NULL DEFAULT 0, cost NUMERIC(10,2) DEFAULT 0,
            stock INTEGER NOT NULL DEFAULT 0, min_stock_alert INTEGER DEFAULT 5,
            sku VARCHAR(50), image_url TEXT,
            category_id UUID REFERENCES product_categories(id) ON DELETE SET NULL,
            is_active BOOLEAN DEFAULT true,
            created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`);
        await query(`CREATE TABLE IF NOT EXISTS sales (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID REFERENCES users(id) ON DELETE SET NULL,
            seller_id UUID REFERENCES users(id) ON DELETE SET NULL,
            subtotal NUMERIC(10,2) NOT NULL DEFAULT 0, discount NUMERIC(10,2) DEFAULT 0,
            total NUMERIC(10,2) NOT NULL DEFAULT 0, payment_method VARCHAR(20) NOT NULL DEFAULT 'cash',
            notes TEXT, status VARCHAR(20) DEFAULT 'completed',
            created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`);
        await query(`CREATE TABLE IF NOT EXISTS sale_items (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
            product_id UUID REFERENCES products(id) ON DELETE SET NULL,
            product_name VARCHAR(200) NOT NULL, quantity INTEGER NOT NULL DEFAULT 1,
            unit_price NUMERIC(10,2) NOT NULL DEFAULT 0, subtotal NUMERIC(10,2) NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ DEFAULT NOW())`);
        await query(`CREATE TABLE IF NOT EXISTS cash_shifts (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            facility_id UUID NOT NULL REFERENCES facilities(id),
            opened_by UUID REFERENCES users(id), opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            opening_float NUMERIC(10,2) NOT NULL DEFAULT 0,
            closed_by UUID REFERENCES users(id), closed_at TIMESTAMPTZ,
            expected_cash NUMERIC(10,2), counted_cash NUMERIC(10,2), difference NUMERIC(10,2),
            status VARCHAR(10) NOT NULL DEFAULT 'open', notes TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW())`);
        // Caja POR RECEPCIONISTA: una caja abierta por USUARIO (no por sucursal). Varias
        // recepcionistas pueden tener su propia caja abierta a la vez en la misma sucursal.
        await query(`DROP INDEX IF EXISTS uq_one_open_shift_per_facility`);
        await query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_one_open_shift_per_user
            ON cash_shifts(opened_by) WHERE status = 'open'`);
        await query(`CREATE TABLE IF NOT EXISTS cash_movements (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            shift_id UUID NOT NULL REFERENCES cash_shifts(id) ON DELETE CASCADE,
            type VARCHAR(10) NOT NULL CHECK (type IN ('cash_in','cash_out')),
            amount NUMERIC(10,2) NOT NULL, reason TEXT,
            created_by UUID REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT NOW())`);
        await query(`ALTER TABLE sales ADD COLUMN IF NOT EXISTS facility_id UUID REFERENCES facilities(id)`);
        await query(`ALTER TABLE sales ADD COLUMN IF NOT EXISTS shift_id UUID REFERENCES cash_shifts(id)`);
        await query(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS shift_id UUID REFERENCES cash_shifts(id)`);
        await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS default_facility_id UUID REFERENCES facilities(id)`);
        console.log('Migration 032: POS + caja + atribución ready.');
    } catch (e) { console.error('Migration 032 error:', e); }
    // Migration 032b: egresos.shift_id (non-fatal — table may not exist yet)
    try {
        await query(`ALTER TABLE egresos ADD COLUMN IF NOT EXISTS shift_id UUID REFERENCES cash_shifts(id)`);
    } catch (_) { /* egresos table not yet created — will apply once it exists */ }

    // Migration 033: completar bootstrap base que faltaba en schema_complete.sql
    // (users.password_hash → necesario para login; tabla egresos → módulo de gastos + reportes)
    try {
        await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255)`);
        await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS temp_password BOOLEAN DEFAULT false`);
        await query(`DO $$ BEGIN CREATE TYPE egreso_category AS ENUM ('nomina','servicios','marketing','renta','internet','insumos','mantenimiento','seguros','otros'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;`);
        await query(`DO $$ BEGIN CREATE TYPE egreso_status AS ENUM ('pendiente','pagado','cancelado'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;`);
        await query(`CREATE TABLE IF NOT EXISTS egresos (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            category egreso_category NOT NULL, concept VARCHAR(255) NOT NULL, description TEXT,
            amount DECIMAL(12,2) NOT NULL CHECK (amount > 0), currency VARCHAR(3) NOT NULL DEFAULT 'MXN',
            status egreso_status NOT NULL DEFAULT 'pendiente', date DATE NOT NULL DEFAULT CURRENT_DATE, paid_at TIMESTAMP WITH TIME ZONE,
            is_recurring BOOLEAN NOT NULL DEFAULT false, recurring_day INTEGER CHECK (recurring_day BETWEEN 1 AND 31),
            receipt_url TEXT, receipt_file_name VARCHAR(255), distribution JSONB DEFAULT '{}'::jsonb,
            vendor VARCHAR(255), notes TEXT,
            created_by UUID REFERENCES users(id) ON DELETE SET NULL,
            shift_id UUID REFERENCES cash_shifts(id),
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP)`);
        await query(`CREATE INDEX IF NOT EXISTS idx_egresos_category ON egresos(category)`);
        await query(`CREATE INDEX IF NOT EXISTS idx_egresos_date ON egresos(date)`);
        console.log('Migration 033: users.password_hash + egresos table ready.');
    } catch (e) { console.error('Migration 033 error:', e); }

    // Migration 034: comisiones (settings default+override por persona, payouts con snapshot)
    try {
        await query(`CREATE TABLE IF NOT EXISTS commission_settings (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID REFERENCES users(id) ON DELETE CASCADE,
            monthly_target NUMERIC(10,2) NOT NULL DEFAULT 0,
            commission_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
            updated_at TIMESTAMPTZ DEFAULT NOW())`);
        await query(`CREATE UNIQUE INDEX IF NOT EXISTS commission_settings_global_uniq
            ON commission_settings ((user_id IS NULL)) WHERE user_id IS NULL`);
        await query(`CREATE UNIQUE INDEX IF NOT EXISTS commission_settings_user_uniq
            ON commission_settings (user_id) WHERE user_id IS NOT NULL`);
        await query(`INSERT INTO commission_settings (user_id, monthly_target, commission_rate)
            SELECT NULL, 0, 0 WHERE NOT EXISTS (SELECT 1 FROM commission_settings WHERE user_id IS NULL)`);
        await query(`CREATE TABLE IF NOT EXISTS commission_payouts (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            period_month DATE NOT NULL,
            total_sales NUMERIC(10,2) NOT NULL,
            monthly_target NUMERIC(10,2) NOT NULL,
            commission_rate NUMERIC(5,2) NOT NULL,
            amount NUMERIC(10,2) NOT NULL,
            paid_at TIMESTAMPTZ DEFAULT NOW(),
            paid_by UUID REFERENCES users(id),
            UNIQUE (user_id, period_month))`);
        console.log('Migration 034: commission_settings + commission_payouts ready.');
    } catch (e) { console.error('Migration 034 error:', e); }

    // Migration 035: video_categories.color — la consulta de videos y el frontend ya lo usan,
    // pero la columna faltaba en el bootstrap (causaba 500 en GET /api/videos: "column vc.color does not exist").
    try {
        await query(`ALTER TABLE video_categories ADD COLUMN IF NOT EXISTS color VARCHAR(20)`);
        console.log('Migration 035: video_categories.color ready.');
    } catch (e) { console.error('Migration 035 error:', e); }

    // Migration 036: videos.level + videos.published_at — el listado de videos los consulta
    // (WHERE v.level / ORDER BY v.published_at) pero faltaban en el bootstrap → 500 en GET /api/videos.
    try {
        await query(`ALTER TABLE videos ADD COLUMN IF NOT EXISTS level VARCHAR(20)`);
        await query(`ALTER TABLE videos ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ`);
        console.log('Migration 036: videos.level + videos.published_at ready.');
    } catch (e) { console.error('Migration 036 error:', e); }

    // Migration 037: backfill facility_id en clases generadas antes del fix (red de seguridad)
    try {
        await query(`UPDATE classes c SET facility_id = s.facility_id
                     FROM schedules s WHERE c.schedule_id = s.id AND c.facility_id IS NULL AND s.facility_id IS NOT NULL`);
        console.log('Migration 037: backfill classes.facility_id ready.');
    } catch (e) { console.error('Migration 037 error:', e); }

    // Migration 038: sembrar instructoras + class_types faltantes + horarios reales (4 fichas).
    // GUARDADA con flag de una sola vez: así editar/borrar/mover horarios desde el admin NO se
    // revierte en cada deploy (antes re-insertaba los slots de la ficha en cada boot).
    try {
        const done038 = await queryOne(`SELECT 1 AS x FROM system_settings WHERE key='migration_038_seeded'`);
        if (!done038) {
        // 1) Instructoras (instructors.user_id es NOT NULL → crear users role 'instructor')
        for (const name of SEED_INSTRUCTORS) {
            const slug = name.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '');
            const email = `${slug || 'coach'}@bmb.instructor.local`;
            await query(
                `INSERT INTO users (email, display_name, role, phone)
                 SELECT $1::varchar, $2::varchar, 'instructor', '0000000000'
                 WHERE NOT EXISTS (SELECT 1 FROM instructors WHERE display_name = $2::varchar)
                   AND NOT EXISTS (SELECT 1 FROM users WHERE email = $1::varchar)`,
                [email, name]
            );
            await query(
                `INSERT INTO instructors (user_id, display_name)
                 SELECT u.id, $1::varchar FROM users u WHERE u.email = $2::varchar
                 AND NOT EXISTS (SELECT 1 FROM instructors WHERE display_name = $1::varchar)`,
                [name, email]
            );
        }

        // 2) class_types faltantes
        for (const ct of SEED_CLASS_TYPES) {
            await query(
                `INSERT INTO class_types (name, category, duration_minutes, max_capacity)
                 SELECT $1::varchar, $2::class_category, 50, 12
                 WHERE NOT EXISTS (SELECT 1 FROM class_types WHERE name = $1::varchar AND category = $2::class_category)`,
                [ct.name, ct.category]
            );
        }

        // FIX viernes Tepa: la ficha tenía INVERTIDOS los nombres de 9:10 y 10:10. En Fitune (verdad)
        // el viernes en Tepa con Vane es 9:10=Flexibilidad(Flex), 10:10=Pole Fitness; BMB los mostraba
        // al revés. Se intercambia el class_type en el schedule recurrente Y en las clases futuras ya
        // generadas (las reservas viven en classes.id, no se tocan). Solo viernes (dow=5); NO toca el
        // Pole de lun/mié (Vero). Idempotente (filtra por el tipo actual). Corre ANTES del re-seed para
        // que la ficha ya corregida no duplique slots.
        try {
            const tepaFix = await queryOne<{ id: string }>(`SELECT id FROM facilities WHERE name='BMB Studio Tepa'`);
            const flexCt = await queryOne<{ id: string }>(`SELECT id FROM class_types WHERE name='Flex' AND category='multi' LIMIT 1`);
            const poleCt = await queryOne<{ id: string }>(`SELECT id FROM class_types WHERE name='Pole Fitness' AND category='multi' LIMIT 1`);
            if (tepaFix && flexCt && poleCt) {
                await query(`UPDATE schedules SET class_type_id=$1, updated_at=NOW() WHERE facility_id=$2 AND day_of_week=5 AND start_time='09:10' AND class_type_id=$3`, [flexCt.id, tepaFix.id, poleCt.id]);
                await query(`UPDATE schedules SET class_type_id=$1, updated_at=NOW() WHERE facility_id=$2 AND day_of_week=5 AND start_time='10:10' AND class_type_id=$3`, [poleCt.id, tepaFix.id, flexCt.id]);
                await query(`UPDATE classes SET class_type_id=$1, updated_at=NOW() WHERE facility_id=$2 AND start_time='09:10' AND class_type_id=$3 AND date >= CURRENT_DATE AND EXTRACT(DOW FROM date)::int=5`, [flexCt.id, tepaFix.id, poleCt.id]);
                await query(`UPDATE classes SET class_type_id=$1, updated_at=NOW() WHERE facility_id=$2 AND start_time='10:10' AND class_type_id=$3 AND date >= CURRENT_DATE AND EXTRACT(DOW FROM date)::int=5`, [poleCt.id, tepaFix.id, flexCt.id]);
            }
        } catch (e) { console.error('Fix viernes Tepa Flex/Pole error:', e); }

        // 3) Schedules de las 4 fichas (resuelve IDs por nombre; inserta si no existe)
        for (const ficha of FICHAS) {
            for (const row of buildScheduleRows(ficha)) {
                const fac = await queryOne<{ id: string }>(`SELECT id FROM facilities WHERE name = $1`, [row.facility]);
                const ct = await queryOne<{ id: string }>(`SELECT id FROM class_types WHERE name = $1 AND category = $2 ORDER BY created_at NULLS FIRST LIMIT 1`, [row.class_type, row.category]);
                const inst = await queryOne<{ id: string }>(`SELECT id FROM instructors WHERE display_name = $1 LIMIT 1`, [row.instructor]);
                if (!fac || !ct || !inst) { console.warn('Seed 038: faltan refs', row.facility, row.class_type, row.instructor); continue; }
                // Idempotencia por (sucursal, tipo de clase, día, hora): se asume UN solo instructor
                // por slot. Cambiar el instructor de un slot ya sembrado NO crea uno nuevo (el NOT EXISTS
                // ya hace match); para reasignar un slot existente usa una migración (ver Migration 068).
                await query(
                    `INSERT INTO schedules (class_type_id, instructor_id, facility_id, day_of_week, start_time, end_time, max_capacity, is_recurring, is_active)
                     SELECT $1, $2, $3, $4, $5, $6, $7, true, $8
                     WHERE NOT EXISTS (
                       SELECT 1 FROM schedules WHERE facility_id = $3 AND class_type_id = $1 AND day_of_week = $4 AND start_time = $5
                     )`,
                    [ct.id, inst.id, fac.id, row.day_of_week, row.start_time, row.end_time, row.max_capacity, row.is_active]
                );
            }
        }
        await query(`INSERT INTO system_settings (key, value) VALUES ('migration_038_seeded', 'true'::jsonb) ON CONFLICT (key) DO NOTHING`);
        console.log('Migration 038: BMB schedules seeded (una sola vez — respeta ediciones del admin).');
        }
    } catch (e) { console.error('Migration 038 error:', e); }

    // Migration 069: Tepa — Mar/Jue de la franja 18:00 pasan a 18:10 (Mar Pole Fitness, Jue Pole Dance).
    // La ficha (bmb-schedules) ya define los slots correctos a las 18:10; aquí se eliminan los renglones
    // VIEJOS de 18:00 Pole Fitness Aranza (día 2 y 4) que quedaron duplicados porque el seed 038 los
    // re-insertaba al ver "vacío" el slot 18:00. Una sola vez (gateada).
    try {
        const done069 = await queryOne<{ k: string }>(
            `SELECT key AS k FROM system_settings WHERE key='migration_069_tepa_pole_1810'`
        );
        if (!done069) {
            const tepa = await queryOne<{ id: string }>(`SELECT id FROM facilities WHERE name = 'BMB Studio Tepa'`);
            const pf = await queryOne<{ id: string }>(`SELECT id FROM class_types WHERE name = 'Pole Fitness' ORDER BY created_at NULLS FIRST LIMIT 1`);
            const aranza = await queryOne<{ id: string }>(`SELECT id FROM instructors WHERE display_name = 'Aranza' LIMIT 1`);
            if (tepa && pf && aranza) {
                // Borra clases futuras SIN reservas generadas desde los renglones viejos de 18:00 (evita huérfanas).
                await query(
                    `DELETE FROM classes c USING schedules s
                     WHERE c.schedule_id = s.id AND c.current_bookings = 0 AND c.date >= CURRENT_DATE
                       AND s.facility_id = $1 AND s.class_type_id = $2 AND s.instructor_id = $3
                       AND s.day_of_week IN (2,4) AND s.start_time = '18:00'`,
                    [tepa.id, pf.id, aranza.id]
                );
                // Borra los renglones de plantilla viejos (18:00). Los correctos (18:10 / Pole Dance) se conservan.
                await query(
                    `DELETE FROM schedules
                     WHERE facility_id = $1 AND class_type_id = $2 AND instructor_id = $3
                       AND day_of_week IN (2,4) AND start_time = '18:00'`,
                    [tepa.id, pf.id, aranza.id]
                );
            }
            await query(`INSERT INTO system_settings (key, value) VALUES ('migration_069_tepa_pole_1810', 'true'::jsonb) ON CONFLICT (key) DO NOTHING`);
            console.log('Migration 069: Tepa 18:00 Pole Fitness Aranza (Mar/Jue) duplicados eliminados.');
        }
    } catch (e) { console.error('Migration 069 error:', e); }

    // Migration 039: Stripe (customer cache + dedupe de webhooks + columnas en orders)
    try {
        await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT`);
        await query(`CREATE TABLE IF NOT EXISTS stripe_webhook_events (
            event_id TEXT PRIMARY KEY, type TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
        await query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS stripe_session_id TEXT`);
        await query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS stripe_checkout_url TEXT`);
        await query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT`);
        await query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS stripe_payment_status TEXT`);
        await query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_provider TEXT`);
        console.log('Migration 039: Stripe columns + stripe_webhook_events ready.');
    } catch (e) { console.error('Migration 039 error:', e); }

    // Migration 040: limpiar calendario (retirar salas cruft del base) + coaches reales de Reformer.
    // Las sucursales reales son 'BMB Studio %'; Wunda/Barre/Hot Room/Sala Principal son cruft de Balance Room.
    // GUARDADA con flag de una sola vez: la reasignación de coaches de Reformer ya NO se re-aplica en
    // cada deploy, para no pisar los cambios de instructor que haga el admin desde el panel.
    try {
        const done040 = await queryOne(`SELECT 1 AS x FROM system_settings WHERE key='migration_040_done'`);
        if (!done040) {
        // 1) Desactivar horarios de salas que NO son sucursales BMB (dejan de generar clases).
        await query(`UPDATE schedules s SET is_active = false, updated_at = NOW()
                     FROM facilities f
                     WHERE s.facility_id = f.id AND f.name NOT ILIKE 'BMB%' AND s.is_active = true`);
        // 2) Borrar clases futuras de esas salas SIN reservas (no toca clases con reservas reales).
        await query(`DELETE FROM classes c USING facilities f
                     WHERE c.facility_id = f.id AND f.name NOT ILIKE 'BMB%'
                       AND c.date >= CURRENT_DATE AND c.status = 'scheduled' AND COALESCE(c.current_bookings,0) = 0`);
        // 3) Reasignar coaches reales de Reformer por sucursal + AM/PM (los crea la Migration 038 vía SEED_INSTRUCTORS).
        const reassign = async (facility: string, ampm: 'am' | 'pm', coach: string) => {
            const cmp = ampm === 'am' ? `s.start_time < '12:00:00'` : `s.start_time >= '12:00:00'`;
            await query(
                `UPDATE schedules s SET instructor_id = i.id, updated_at = NOW()
                 FROM facilities f, class_types ct, instructors i
                 WHERE s.facility_id = f.id AND s.class_type_id = ct.id
                   AND ct.category = 'reformer' AND f.name = $1 AND ${cmp} AND i.display_name = $2`,
                [facility, coach]
            );
        };
        await reassign('BMB Studio Tepa', 'am', 'Jessi Tavira');
        await reassign('BMB Studio Tepa', 'pm', 'Sofi Maes');
        await reassign('BMB Studio San Miguel', 'am', 'Aaron Domínguez');
        await reassign('BMB Studio San Miguel', 'pm', 'Jessi Tavira');
        await query(`INSERT INTO system_settings (key, value) VALUES ('migration_040_done', 'true'::jsonb) ON CONFLICT (key) DO NOTHING`);
        console.log('Migration 040: calendario limpio + coaches Reformer reasignados (una sola vez — respeta ediciones del admin).');
        }
    } catch (e) { console.error('Migration 040 error:', e); }

    // Migration 041: desactivar salas cruft del base (Wunda/Barre/Hot Room/Sala Principal).
    // BMB solo opera 'BMB Studio %'. GET /facilities y las stats ya filtran is_active=true,
    // así que desactivarlas las saca de dashboard, toggles y formularios sin borrar datos.
    // Casa Shé: neutralizado. Este bloque desactivaba TODA sede que no fuera 'BMB%' en cada
    // arranque, lo que apagaba la sede 'Casa Shé — Condesa'. El estado de sedes lo fija ahora
    // el bloque consolidado "Casa Shé v1".
    try {
        console.log('Migration 041: neutralizado para Casa Shé.');
    } catch (e) { console.error('Migration 041 error:', e); }

    // Migration 042: dirección + link de mapa por sucursal (para mostrar en el resumen de reserva).
    try {
        await query(`ALTER TABLE facilities ADD COLUMN IF NOT EXISTS address TEXT`);
        await query(`ALTER TABLE facilities ADD COLUMN IF NOT EXISTS maps_url TEXT`);
        console.log('Migration 042: facilities.address + maps_url ready.');
    } catch (e) { console.error('Migration 042 error:', e); }

    // Migration 043: sembrar dirección + maps_url reales de las 2 sucursales (resumen de reserva).
    // Idempotente: UPDATE por nombre exacto, solo toca las facilities BMB.
    try {
        await query(`UPDATE facilities
                        SET address = 'Cam. a Tepotzotlán 6D, Axotlan, 54715 Cuautitlán Izcalli, Méx.',
                            maps_url = 'https://maps.app.goo.gl/Pk1Wvc9EpUaJQ31m9'
                      WHERE name = 'BMB Studio San Miguel'`);
        await query(`UPDATE facilities
                        SET address = 'Av. Primero de Mayo Mz 4 Lote 1, Santiago, Tepalcapa, 54743 Cuautitlán Izcalli, Méx.',
                            maps_url = 'https://maps.app.goo.gl/Ms5XdnaaTVHSusLz8'
                      WHERE name = 'BMB Studio Tepa'`);
        console.log('Migration 043: direcciones de sucursales sembradas.');
    } catch (e) { console.error('Migration 043 error:', e); }

    // Migration 044: borrar paquetes legacy rotos (Clase suelta / Paquete 4·8·12·24 clases).
    // Usaban class_limit en vez de créditos reformer/multi, así que el motor los leía como
    // ILIMITADOS por error (reformer_remaining/multi_remaining NULL => sin descuento).
    // Reemplazados por la estructura BMB real (Multi N, Reformer N, Mixtas, Full). Sin referencias.
    try {
        await query(`DELETE FROM plans
                      WHERE name IN ('Clase suelta','Paquete 4 clases','Paquete 8 clases','Paquete 12 clases','Paquete 24 clases')
                        AND class_limit IS NOT NULL`);
        console.log('Migration 044: paquetes legacy rotos borrados.');
    } catch (e) { console.error('Migration 044 error:', e); }

    // Migration 045: ventana de reserva = 30 días (reglamento BMB: "reservar hasta con 30 días de anticipación").
    // Merge que preserva las otras llaves de booking_policies (cancellation_hours, no_show_penalty).
    try {
        await query(`
            INSERT INTO system_settings (key, value)
            VALUES ('booking_policies', '{"max_advance_days": 30, "cancellation_hours": 12, "no_show_penalty": true}'::jsonb)
            ON CONFLICT (key) DO UPDATE
            SET value = system_settings.value || jsonb_build_object('max_advance_days', 30)
        `);
        console.log('Migration 045: booking_policies.max_advance_days = 30.');
    } catch (e) { console.error('Migration 045 error:', e); }

    // Migration 046: desactivar tipo de clase "Silla Wunda" (BMB no maneja Wunda; sin clases que lo usen).
    try {
        await query(`UPDATE class_types SET is_active = false, updated_at = NOW()
                      WHERE name ILIKE '%wunda%' AND is_active = true`);
        console.log('Migration 046: tipo de clase Silla Wunda desactivado.');
    } catch (e) { console.error('Migration 046 error:', e); }

    // Migration 047: crear studio_closed_days (faltaba en esta base => POST /bookings tronaba con 500).
    // Definida en database/migrations/015 pero nunca aplicada aquí (schema drift del base).
    try {
        await query(`
            CREATE TABLE IF NOT EXISTS studio_closed_days (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                date DATE NOT NULL UNIQUE,
                reason VARCHAR(255) NOT NULL DEFAULT '',
                created_by UUID REFERENCES users(id) ON DELETE SET NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await query(`CREATE INDEX IF NOT EXISTS idx_studio_closed_days_date ON studio_closed_days(date)`);
        console.log('Migration 047: studio_closed_days lista.');
    } catch (e) { console.error('Migration 047 error:', e); }

    // Migration 048: borrar plantillas (schedules) de salas cruft del base (Hot Room/Wunda/Barre).
    // 108 filas con coach placeholder "Coach Balance"; las reales son de BMB Tepa/San Miguel.
    // classes.schedule_id es ON DELETE SET NULL, así que es seguro.
    try {
        await query(`DELETE FROM schedules
                      WHERE facility_id IN (SELECT id FROM facilities WHERE name NOT ILIKE 'BMB%')`);
        console.log('Migration 048: plantillas de salas cruft borradas.');
    } catch (e) { console.error('Migration 048 error:', e); }

    // Migration 049: facility_id en egresos (asignar gastos a una sucursal -> utilidad por local).
    try {
        await query(`ALTER TABLE egresos ADD COLUMN IF NOT EXISTS facility_id UUID REFERENCES facilities(id) ON DELETE SET NULL`);
        console.log('Migration 049: egresos.facility_id ready.');
    } catch (e) { console.error('Migration 049 error:', e); }

    // Migration 050: lealtad — fuente única loyalty_config + enum 'adjustment' para auditar ajustes.
    try {
        await query(`
            INSERT INTO system_settings (key, value)
            SELECT 'loyalty_config',
                   COALESCE((SELECT value FROM system_settings WHERE key = 'loyalty_settings'), '{}'::jsonb)
            WHERE NOT EXISTS (SELECT 1 FROM system_settings WHERE key = 'loyalty_config')
        `);
        await query(`ALTER TYPE loyalty_points_type ADD VALUE IF NOT EXISTS 'adjustment'`);
        console.log('Migration 050: loyalty_config consolidado + enum adjustment.');
    } catch (e) { console.error('Migration 050 error:', e); }

    // Migration 051: el FK redemptions.reward_id apuntaba a la tabla vieja 'rewards' (vacía/sin uso);
    // las recompensas viven en loyalty_rewards. Repuntar arregla el canje (violación de FK).
    try {
        await query(`ALTER TABLE redemptions DROP CONSTRAINT IF EXISTS redemptions_reward_id_fkey`);
        await query(`ALTER TABLE redemptions ADD CONSTRAINT redemptions_reward_id_fkey FOREIGN KEY (reward_id) REFERENCES loyalty_rewards(id) ON DELETE CASCADE`);
        console.log('Migration 051: redemptions.reward_id -> loyalty_rewards.');
    } catch (e) { console.error('Migration 051 error:', e); }

    // Migration 052: Reformer en 4 formatos comerciales (Classic / Sculpt / Flow / Cardio).
    // Mantiene category='reformer' y los créditos (planes Reformer/Mixta consumen igual).
    // Gateado con system_settings para correr una sola vez y no pisar ediciones manuales del admin.
    try {
        const done = await queryOne<{ k: string }>(`SELECT key AS k FROM system_settings WHERE key='migration_052_reformer_formats'`);
        if (!done) {
            // 1) Rename: Pilates Reformer -> Reformer Classic (preserva id y FKs).
            await query(`UPDATE class_types SET name='Reformer Classic', updated_at=NOW() WHERE name='Pilates Reformer'`);
            // 2) Crear los 3 formatos nuevos (idempotente por nombre).
            const newTypes = [
                { name: 'Reformer Sculpt',  color: '#B85C38' }, // fuerza / sculpt
                { name: 'Reformer Flow',    color: '#6B8E7B' }, // flow / movilidad
                { name: 'Cardio Reformer',  color: '#D4A857' }, // cardio / energía
            ];
            for (const t of newTypes) {
                await query(
                    `INSERT INTO class_types (name, category, duration_minutes, max_capacity, color, is_active)
                     SELECT $1, 'reformer', 50, 8, $2, true
                     WHERE NOT EXISTS (SELECT 1 FROM class_types WHERE name=$1)`,
                    [t.name, t.color]
                );
            }
            // 3) Reasignar plantillas (schedules) por día de la semana. Mar(2) y Sáb(6) quedan en Classic.
            await query(`
                UPDATE schedules s
                   SET class_type_id = CASE s.day_of_week
                       WHEN 1 THEN (SELECT id FROM class_types WHERE name='Reformer Sculpt')
                       WHEN 3 THEN (SELECT id FROM class_types WHERE name='Cardio Reformer')
                       WHEN 4 THEN (SELECT id FROM class_types WHERE name='Reformer Flow')
                       WHEN 5 THEN (SELECT id FROM class_types WHERE name='Reformer Sculpt')
                       WHEN 0 THEN (SELECT id FROM class_types WHERE name='Reformer Flow')
                       ELSE s.class_type_id END
                 WHERE s.class_type_id = (SELECT id FROM class_types WHERE name='Reformer Classic')
                   AND s.day_of_week IN (0, 1, 3, 4, 5)
            `);
            // 4) Reasignar clases futuras (EXTRACT(DOW): 0=Dom, 1=Lun, ..., 6=Sáb).
            await query(`
                UPDATE classes c
                   SET class_type_id = CASE EXTRACT(DOW FROM c.date)::int
                       WHEN 1 THEN (SELECT id FROM class_types WHERE name='Reformer Sculpt')
                       WHEN 3 THEN (SELECT id FROM class_types WHERE name='Cardio Reformer')
                       WHEN 4 THEN (SELECT id FROM class_types WHERE name='Reformer Flow')
                       WHEN 5 THEN (SELECT id FROM class_types WHERE name='Reformer Sculpt')
                       WHEN 0 THEN (SELECT id FROM class_types WHERE name='Reformer Flow')
                       ELSE c.class_type_id END
                 WHERE c.class_type_id = (SELECT id FROM class_types WHERE name='Reformer Classic')
                   AND c.date >= CURRENT_DATE AND c.status = 'scheduled'
                   AND EXTRACT(DOW FROM c.date)::int IN (0, 1, 3, 4, 5)
            `);
            // 5) Marcar como aplicada.
            await query(`INSERT INTO system_settings (key, value) VALUES ('migration_052_reformer_formats', 'true'::jsonb) ON CONFLICT (key) DO NOTHING`);
            console.log('Migration 052: Reformer en 4 formatos aplicado.');
        }
    } catch (e) { console.error('Migration 052 error:', e); }

    // Migration 053: tablas faltantes del módulo videos (likes / history / comments).
    // El código de videos.ts las usa pero no existían → endpoints del cliente 500. Idempotente.
    try {
        await query(`CREATE TABLE IF NOT EXISTS video_likes (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            video_id UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (user_id, video_id)
        )`);
        await query(`CREATE INDEX IF NOT EXISTS idx_video_likes_video ON video_likes(video_id)`);
        await query(`CREATE INDEX IF NOT EXISTS idx_video_likes_user ON video_likes(user_id)`);

        await query(`CREATE TABLE IF NOT EXISTS video_history (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            video_id UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
            last_position INTEGER DEFAULT 0,
            completed BOOLEAN DEFAULT FALSE,
            watched_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (user_id, video_id)
        )`);
        await query(`CREATE INDEX IF NOT EXISTS idx_video_history_user ON video_history(user_id)`);

        await query(`CREATE TABLE IF NOT EXISTS video_comments (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            video_id UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            content TEXT NOT NULL,
            parent_id UUID REFERENCES video_comments(id) ON DELETE CASCADE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )`);
        await query(`CREATE INDEX IF NOT EXISTS idx_video_comments_video ON video_comments(video_id)`);
        await query(`CREATE INDEX IF NOT EXISTS idx_video_comments_parent ON video_comments(parent_id)`);
        console.log('Migration 053: tablas de videos (likes/history/comments) listas.');
    } catch (e) { console.error('Migration 053 error:', e); }

    // Migration 054: coach_payouts — snapshot de nómina de coaches por mes (+ sucursal opcional).
    // Espeja la estructura de commission_payouts (recepción) pero por instructor y por clases impartidas.
    // facility_id NULL = nómina total de ese mes; con valor = solo clases de esa sucursal.
    try {
        await query(`CREATE TABLE IF NOT EXISTS coach_payouts (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            instructor_id UUID NOT NULL REFERENCES instructors(id) ON DELETE CASCADE,
            period_month DATE NOT NULL,
            facility_id UUID REFERENCES facilities(id) ON DELETE SET NULL,
            classes_count INTEGER NOT NULL,
            pay_rate_per_class NUMERIC(10,2) NOT NULL,
            amount NUMERIC(10,2) NOT NULL,
            paid_at TIMESTAMPTZ DEFAULT NOW(),
            paid_by UUID REFERENCES users(id))`);
        // Unicidad: una nómina por (coach, mes, sucursal). NULL ≠ NULL en UNIQUE, así que
        // usamos un índice expression con COALESCE para que (NULL) sea único también.
        await query(`CREATE UNIQUE INDEX IF NOT EXISTS coach_payouts_uniq
            ON coach_payouts (instructor_id, period_month, COALESCE(facility_id, '00000000-0000-0000-0000-000000000000'::uuid))`);
        await query(`CREATE INDEX IF NOT EXISTS coach_payouts_month_idx ON coach_payouts(period_month)`);
        console.log('Migration 054: coach_payouts ready.');
    } catch (e) { console.error('Migration 054 error:', e); }

    // Migration 055: notificaciones in-app — extiende el enum notification_type con
    // 'review_received' (cliente deja reseña → coach) y 'substitution_requested'
    // (coach pide sustituto → admin). El resto de los tipos (coach_assigned/_substituted)
    // ya existían y se reutilizan.
    try {
        await query(`ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'review_received'`);
        await query(`ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'substitution_requested'`);
        console.log('Migration 055: notification_type enum extended.');
    } catch (e) { console.error('Migration 055 error:', e); }

    // Migration 057: 5to formato Reformer ("Restore Reformer", domingos) + dedupe de schedules
    // y clases que se generaron por duplicado. Gateada con system_settings.
    // Background: la auditoría 2026-05-26 mostró que cada slot Reformer existía 2× en classes
    // (mismo date/start_time/instructor/class_type/facility) — claramente el job de generación
    // o algún seed corrió dos veces. Hay 0 bookings actualmente, así que dedupe es seguro.
    try {
        const done057 = await queryOne<{ k: string }>(
            `SELECT key AS k FROM system_settings WHERE key='migration_057_restore_and_dedupe'`
        );
        if (!done057) {
            // 1) Crear Restore Reformer si no existe. Misma categoría/créditos que el resto.
            await query(
                `INSERT INTO class_types (name, category, duration_minutes, max_capacity, color, is_active)
                 SELECT 'Restore Reformer', 'reformer', 50, 8, '#8AA0B8', true
                 WHERE NOT EXISTS (SELECT 1 FROM class_types WHERE name='Restore Reformer')`
            );

            // 2) Reasignar Domingos: schedules y futuras clases que sean Reformer Flow en Dom → Restore.
            await query(`
                UPDATE schedules SET class_type_id = (SELECT id FROM class_types WHERE name='Restore Reformer')
                 WHERE day_of_week = 0
                   AND class_type_id = (SELECT id FROM class_types WHERE name='Reformer Flow')
            `);
            await query(`
                UPDATE classes SET class_type_id = (SELECT id FROM class_types WHERE name='Restore Reformer')
                 WHERE EXTRACT(DOW FROM date)::int = 0
                   AND class_type_id = (SELECT id FROM class_types WHERE name='Reformer Flow')
                   AND date >= CURRENT_DATE
                   AND status = 'scheduled'
            `);

            // 3) Dedupe schedules: mismo (day_of_week, start_time, instructor_id, class_type_id, facility_id)
            //    Conservar el más antiguo por created_at, borrar los demás.
            await query(`
                WITH ranked AS (
                    SELECT id,
                        ROW_NUMBER() OVER (
                            PARTITION BY day_of_week, start_time, instructor_id, class_type_id, facility_id
                            ORDER BY created_at ASC, id ASC
                        ) AS rn
                    FROM schedules
                )
                DELETE FROM schedules WHERE id IN (SELECT id FROM ranked WHERE rn > 1)
            `);

            // 4) Dedupe clases futuras: prioridad a la que tiene más bookings activos; tie-break por created_at.
            //    status='scheduled' y date>=CURRENT_DATE para no tocar el histórico.
            await query(`
                WITH ranked AS (
                    SELECT c.id,
                        ROW_NUMBER() OVER (
                            PARTITION BY c.date, c.start_time, c.instructor_id, c.class_type_id, c.facility_id
                            ORDER BY
                                (SELECT COUNT(*) FROM bookings b WHERE b.class_id = c.id AND b.status NOT IN ('cancelled')) DESC,
                                c.created_at ASC, c.id ASC
                        ) AS rn
                    FROM classes c
                    WHERE c.date >= CURRENT_DATE AND c.status = 'scheduled'
                )
                DELETE FROM classes WHERE id IN (SELECT id FROM ranked WHERE rn > 1)
            `);

            // 5) Índice único parcial para evitar reaparición. Si algo intenta crear duplicado,
            //    Postgres rechaza con 23505 y nos enteramos (mejor que tener data sucia silenciosa).
            await query(`
                CREATE UNIQUE INDEX IF NOT EXISTS classes_slot_unique
                ON classes (date, start_time, instructor_id, class_type_id, facility_id)
                WHERE status = 'scheduled'
            `);
            await query(`
                CREATE UNIQUE INDEX IF NOT EXISTS schedules_slot_unique
                ON schedules (day_of_week, start_time, instructor_id, class_type_id, facility_id)
            `);

            // 6) Marcar como aplicada.
            await query(`INSERT INTO system_settings (key, value) VALUES ('migration_057_restore_and_dedupe', 'true'::jsonb) ON CONFLICT (key) DO NOTHING`);
            console.log('Migration 057: Restore Reformer + dedupe aplicado.');
        }
    } catch (e) { console.error('Migration 057 error:', e); }

    // Migration 058: limpiar TODAS las fotos almacenadas (request del usuario 2026-05-27).
    // Pone a NULL: instructors.photo_url, products.image_url, users.photo_url.
    // Gateada con system_settings para correr una sola vez. Si después quieren restaurar,
    // re-subirlas desde el portal admin/coach.
    try {
        const done058 = await queryOne<{ k: string }>(
            `SELECT key AS k FROM system_settings WHERE key='migration_058_clear_all_photos'`
        );
        if (!done058) {
            await query(`UPDATE instructors SET photo_url = NULL, updated_at = NOW() WHERE photo_url IS NOT NULL`);
            await query(`UPDATE products SET image_url = NULL, updated_at = NOW() WHERE image_url IS NOT NULL`);
            await query(`UPDATE users SET photo_url = NULL, updated_at = NOW() WHERE photo_url IS NOT NULL`);
            await query(`INSERT INTO system_settings (key, value) VALUES ('migration_058_clear_all_photos', 'true'::jsonb) ON CONFLICT (key) DO NOTHING`);
            console.log('Migration 058: todas las fotos (photo_url/image_url) limpiadas.');
        }
    } catch (e) { console.error('Migration 058 error:', e); }

    // Migration 059: Reception Master — recepcionista elevada que ve ambas sucursales
    // y edita catálogo (planes/productos/coaches/audit). El rol sigue siendo 'reception';
    // el flag is_reception_master modifica el scope y los poderes. Gateada en system_settings.
    try {
        const done059 = await queryOne<{ k: string }>(
            `SELECT key AS k FROM system_settings WHERE key='migration_059_reception_master'`
        );
        if (!done059) {
            await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_reception_master BOOLEAN NOT NULL DEFAULT FALSE`);
            await query(`CREATE INDEX IF NOT EXISTS idx_users_reception_master ON users(is_reception_master) WHERE is_reception_master = true`);
            await query(`INSERT INTO system_settings (key, value) VALUES ('migration_059_reception_master', 'true'::jsonb) ON CONFLICT (key) DO NOTHING`);
            console.log('Migration 059: users.is_reception_master agregado.');
        }
    } catch (e) { console.error('Migration 059 error:', e); }

    // Migration 060: CRM de cliente en recepción — tags, notas de recepción, historial de mensajes.
    try {
        const done060 = await queryOne<{ k: string }>(
            `SELECT key AS k FROM system_settings WHERE key='migration_060_client_crm'`
        );
        if (!done060) {
            await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}'`);
            await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS reception_notes TEXT`);
            await query(`
                CREATE TABLE IF NOT EXISTS client_messages (
                    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    channel TEXT NOT NULL CHECK (channel IN ('whatsapp','email')),
                    subject TEXT,
                    body TEXT NOT NULL,
                    sent_by UUID REFERENCES users(id),
                    status TEXT NOT NULL CHECK (status IN ('sent','failed')),
                    error TEXT,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
                )`);
            await query(`CREATE INDEX IF NOT EXISTS idx_client_messages_user ON client_messages(user_id, created_at DESC)`);
            await query(`INSERT INTO system_settings (key, value) VALUES ('migration_060_client_crm', 'true'::jsonb) ON CONFLICT (key) DO NOTHING`);
            console.log('Migration 060: client CRM (tags, reception_notes, client_messages) agregado.');
        }
    } catch (e) { console.error('Migration 060 error:', e); }

    // Migration 061: comprobante de transferencia en memberships.
    // El cliente sube el comprobante (data URL base64) al comprar con transferencia;
    // recepción master/admin lo revisa y aprueba/rechaza.
    try {
        const done061 = await queryOne<{ k: string }>(
            `SELECT key AS k FROM system_settings WHERE key='migration_061_membership_receipt'`
        );
        if (!done061) {
            await query(`ALTER TABLE memberships ADD COLUMN IF NOT EXISTS receipt_url TEXT`);
            await query(`INSERT INTO system_settings (key, value) VALUES ('migration_061_membership_receipt', 'true'::jsonb) ON CONFLICT (key) DO NOTHING`);
            console.log('Migration 061: memberships.receipt_url agregado.');
        }
    } catch (e) { console.error('Migration 061 error:', e); }

    // Migration 062: permisos granulares de recepción. Columna JSONB + backfill por
    // preset (master→todo, normal→secciones operativas). Gateada en system_settings.
    try {
        const done062 = await queryOne<{ k: string }>(
            `SELECT key AS k FROM system_settings WHERE key='migration_062_reception_permissions'`
        );
        if (!done062) {
            await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS permissions JSONB NOT NULL DEFAULT '{}'::jsonb`);
            // Backfill: solo filas reception aún en '{}'.
            await query(
                `UPDATE users SET permissions = $1::jsonb
                 WHERE role = 'reception' AND is_reception_master = true AND permissions = '{}'::jsonb`,
                [JSON.stringify(PRESET_MASTER)]
            );
            await query(
                `UPDATE users SET permissions = $1::jsonb
                 WHERE role = 'reception' AND is_reception_master = false AND permissions = '{}'::jsonb`,
                [JSON.stringify(PRESET_NORMAL)]
            );
            await query(`INSERT INTO system_settings (key, value) VALUES ('migration_062_reception_permissions', 'true'::jsonb) ON CONFLICT (key) DO NOTHING`);
            console.log('Migration 062: users.permissions agregado y backfilled.');
        }
    } catch (e) { console.error('Migration 062 error:', e); }

    // Migration 063: registro de consentimiento del aviso de privacidad. El registro
    // ya exigía acceptsTerms pero no lo persistía → sin evidencia auditable (LFPDPPP).
    try {
        await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS accepted_terms_at TIMESTAMPTZ`);
        console.log('Migration 063: users.accepted_terms_at listo.');
    } catch (e) { console.error('Migration 063 error:', e); }

    // Migration 064: índice compuesto para el calendario por sucursal (query caliente:
    // WHERE facility_id = $ AND date BETWEEN $ AND $). idx_classes_date solo cubre date.
    try {
        await query(`CREATE INDEX IF NOT EXISTS idx_classes_facility_date ON classes(facility_id, date)`);
        console.log('Migration 064: idx_classes_facility_date listo.');
    } catch (e) { console.error('Migration 064 error:', e); }

    // Migration 066: biografías de coaches en instructors.bio (se muestran en el landing al
    // tocar la tarjeta y al reservar). Solo setea si está vacía, para no pisar ediciones del admin.
    try {
        const COACH_BIOS: Array<[string, string]> = [
            ['Aaron Domínguez', 'Soy Aaron Domínguez. Ingeniero de profesión, pero entrenador por pasión. Desde hace 6 años guío a las personas a romper sus propios límites a través del movimiento. Empecé en Cross Training, funcional y musculación, hasta que el Pilates llegó a mi vida tras una lesión: gracias al método hoy hago todo lo que me gusta sin dolor y sin miedo, y eso es lo que quiero que logres tú. Creo en la disciplina, la fuerza y la evolución constante. ¿Listo para reinventar tu mejor versión? ⚡🦾'],
            ['Frida', '¡Hola, soy Frida Dalí! Licenciada en Filosofía y bailarina, con enfoque en la Fenomenología del Cuerpo. Desde hace más de 15 años movilizo mi cuerpo en consciencia. Llegué al Yoga porque en él descubrí la integración y otra manera de habitar el mundo; me certifiqué como instructora internacional por la India (YACEP). Hoy amo compartir respiraciones que afinan la consciencia y posturas que aquietan la mente mientras revelan tu propia esencia.'],
            ['Estrella', 'Hola, soy Estrella Chávez ✨ Bailarina desde los 4 años y apasionada del movimiento y el empoderamiento femenino. He explorado ballet, jazz, hip-hop y twerk (una de mis especialidades). Formé parte de Spirit Dance Company durante 8 años, representando a México en competencias como WOD San Diego. Hoy sigo preparándome en heels, pole, reformer y flex. Soy una coach divertida, paciente y comprometida, enfocada en que cada alumna conecte con su cuerpo, gane seguridad y disfrute el movimiento 💖'],
            ['Aranza', 'Hola, soy Aranza: godín de día e instructora de pole por las tardes. Hace cinco años llegué al pole en uno de los momentos más tristes e inseguros de mi vida, sin imaginar que me enseñaría tanto sobre mí. Entre moretones, risas nerviosas y muchos «seguro ahora sí sale», descubrí que el crecimiento a veces se siente así: cardíaco, incómodo y emocionante a la vez. El pole me recuerda quién soy cuando me siento perdida; por eso sigo aquí, porque pocas cosas se sienten tan auténticas como volver a encontrarte en un lugar que te hace sentir libre, fuerte y completamente tú.'],
            ['Sofi Maes', '¡Hola! Soy Sofía Maes ✨ Tengo 25 años y me verás en Reformer y Hot Pilates. Practiqué ballet, jazz, contemporáneo y folklore, hasta que estudié Arquitectura. Con el tiempo descubrí que mi pasión también estaba en el movimiento y la enseñanza: me certifiqué en indoor cycling, fuerza y luego en Pilates (MAT y Reformer), además de estudios en nutrición deportiva y entrenamiento de fuerza. Me encantan las clases dinámicas, híbridas y con flow, siempre buscando que disfrutes el movimiento y conectes contigo misma ✨'],
            ['Jaqui', 'Soy Jaqueline Bermúdez, todos me dicen Jako. Diseñadora Gráfica con maestría en Sistemas de Información. Siempre me he dedicado al deporte desde niña: gimnasia artística, natación, americano, tocho, volleyball y ahora funcional. Llevo un par de años enseñando funcional y me sigo preparando con cursos de entrenamientos híbridos, personalizados y parkour.'],
            ['Pao', '¡Hola! Soy Paola Martínez. Fui Ingeniera Química Industrial por profesión durante más de 15 años, hasta que dejé la industria para ver crecer a mi versión chiquita (mi hija) y decidí tomar un camino apegado a lo que más me gusta: bailar. Practico baile en varias disciplinas, pero las que más me apasionan son el flamenco (que aún practico) y el ballet, que me acercó al mundo del Barre. Desde la pandemia estoy certificada en Barre clásico por Barrexercise CO, LLC, y aún participo con la fundadora en su programa de certificación de instructores de Barre en línea. Llevo 46 años viviendo en Izcalli y tuve la oportunidad de impartir clases de ballet y folklore en escuelas privadas. Hoy doy Barre en BMB Studio, retando cada día el tener una mejor versión de mí para ti 😉.'],
            ['Fer', 'Hola, mi nombre es Fer Reyes. Fui oficinista muchos años y un día decidí hacer de mi hobby mi trabajo, para recordarnos que el que quiere puede y agradecerle a tu cuerpo todo lo que puede lograr con un poquito de disciplina. Soy competidora Federada con registro ante CONADE y coach de competencia, con 7 años de experiencia y 4 como profesora de pole fitness, chair dance, floorwork, Strip & Lap Dance, Twerk y especialmente Exotic Pole.\n\nTengo la certificación Teachers Pole Course otorgada por Susana López y Susy Ordóñez, campeonas mundiales máster 60+ de Pole Sport. He tomado talleres con campeonas over all como Laura Moya; con profesores Federados y medallistas como Sandra Núñez, Joel Tapia, Irving Murillo y Cris Sáenz; y con atletas como Olga Ovchinnikova (Exotic Ruso), Vianey Centeno (intro Polinesio), Naomy Padilla (heels), Lorena Gaspar (geometría y líneas), Cecy Torreblanca (kips), Diana Cruz (Exotic hard), Ina Molina (Exotic), Ana Karen (Exotic flow) y Fred García (jazz y contempo).\n\nSoy creadora de Polemical Collective, grupo de artistas, atletas aéreos y bailarines con presencia en festivales, conciertos y shows. Medallista en competencias regionales y nacionales de Femex, Abierto de Pole Sport & Exotic y Competwerk desde 2021, con participación internacional en Exotic Generation México, además de múltiples showcases y teatro.\n\nActualmente sigo aprendiendo y creciendo con talleres, clases y cursos en diferentes estilos de danza; imparto clases en diversos estudios y coacheo a atletas independientes, showcases y grupos de competencia. El Pole es un deporte aún con mucho tabú, pero con muchísimas variantes, niveles y estilos: trabajas todo tu cuerpo y tu mente, y siempre hay más que aprender.'],
            ['Vero', '¡Hola! Soy Vero Téllez y hace más de dos años descubrí una pasión que transformó mi vida: el pole dance. Lo que comenzó como un reto personal, hoy es un estilo de vida que me inspira a moverme con constancia, disciplina y amor propio.\n\nEsta disciplina ha fortalecido mi cuerpo, mente y alma. He tenido el privilegio de formarme con increíbles coaches como Vanessa Silva y Sandra Núñez, quienes me enseñaron no solo técnica, sino también cómo transmitir seguridad y confianza en cada movimiento. Gracias a ellas, mi crecimiento ha sido profundo y significativo.\n\nImparto clases de Pole Dance, y compartir lo aprendido es una experiencia que me llena de alegría y propósito. Creo firmemente en la mejora continua, por eso pronto comenzaré una certificación profesional para ofrecer a mis alumnas una enseñanza más completa y segura.\n\nEl pole dance es empoderamiento, arte y superación. Cada clase es una oportunidad para crecer juntas, porque cuando una mujer se atreve, descubre que es capaz de lograr cosas extraordinarias.'],
            ['Jess', '¡Hola! ✨ Soy Jessica Maldonado, ingeniera biomédica de profesión, actualmente desarrollándome en la industria energética, y coach certificada de barre por pasión.\n\nAunque gran parte de mi trayectoria profesional se ha desarrollado en el mundo corporativo, siempre he encontrado en el movimiento una forma de conectar conmigo misma. Fue cuando descubrí barre que encontré una disciplina que reunía todo lo que buscaba: fuerza, control, resistencia, equilibrio y bienestar.\n\nA lo largo de los años he aprendido que el ejercicio va mucho más allá de la apariencia física. Es un espacio para desconectarnos de las exigencias del día a día, ganar confianza, fortalecer nuestro cuerpo y descubrir todo lo que somos capaces de lograr.\n\nLo que más amo de enseñar es acompañar a cada alumna en ese proceso: ver cómo, clase tras clase, desarrollan fuerza, seguridad y una mejor conexión con ellas mismas. Mi objetivo es crear un espacio donde te sientas bienvenida, motivada y libre.\n\nPara mí, barre no solo transformó mi forma de entrenar, también transformó mi manera de sentirme y de cuidarme. Me enseñó que la fuerza también está en la constancia, la disciplina y el amor propio que construimos día a día. Te invito a vivir esta experiencia conmigo, a retarte, divertirte y descubrir la fuerza que ya existe dentro de ti. 🤍✨'],
        ];
        for (const [name, bio] of COACH_BIOS) {
            await query(
                `UPDATE instructors SET bio = $2, updated_at = NOW()
                 WHERE display_name = $1 AND (bio IS NULL OR bio = '')`,
                [name, bio]
            );
        }
        console.log('Migration 066: biografías de coaches cargadas.');
    } catch (e) { console.error('Migration 066 error:', e); }

    // Migration 067: tarifa por clase (pay_rate_per_class) de cada coach, en MXN. Valores que
    // dictó la dueña. Solo setea cuando está en NULL ("Sin tarifa"), para NO pisar lo que el
    // admin/recepción master haya editado en la página de Nómina; idempotente al reiniciar.
    // Nota: solo hay una Sofi real ('Sofi Maes', Reformer); el registro sobrante 'Sofi' se
    // fusiona en ella en la Migration 068 (ver abajo), así que aquí basta con tarifar 'Sofi Maes'.
    try {
        const COACH_RATES: Array<[string, number]> = [
            ['Karla', 0],
            ['Jessi Tavira', 200],
            ['Aaron Domínguez', 250],
            ['Indie', 250],
            ['Sofi Maes', 300],
            ['Frida', 250],
            ['Vane', 300],
            ['Pao', 270],
            ['Estrella', 200],
            ['Jaqui', 250],
            ['Vero', 200],
            ['Fer', 300],
            ['Aranza', 200],
            ['Jess', 250],
        ];
        for (const [name, rate] of COACH_RATES) {
            await query(
                `UPDATE instructors SET pay_rate_per_class = $2, updated_at = NOW()
                 WHERE display_name = $1 AND pay_rate_per_class IS NULL`,
                [name, rate]
            );
        }
        console.log('Migration 067: tarifas por clase de coaches cargadas.');
    } catch (e) { console.error('Migration 067 error:', e); }

    // Migration 068: consolidar el registro sobrante 'Sofi' en 'Sofi Maes'. La dueña confirmó
    // que solo hay una Sofi; el seed dejó dos registros: 'Sofi' (multiclases, con un único
    // horario de Hot Pilates dom 08:00) y 'Sofi Maes' (Reformer/Hot, turno PM). Reasigna ese
    // horario y todas sus clases a 'Sofi Maes' y desactiva/oculta el registro sobrante.
    // Guardado e idempotente: si no existe el duplicado (o ya se consolidó), es un no-op.
    try {
        const dup = await queryOne<{ id: string }>(`SELECT id FROM instructors WHERE display_name = 'Sofi'`);
        const real = await queryOne<{ id: string }>(`SELECT id FROM instructors WHERE display_name = 'Sofi Maes'`);
        if (dup && real && dup.id !== real.id) {
            // Un solo statement con CTEs que escriben → atómico (todo o nada): si algo falla,
            // ni los horarios ni las clases ni la desactivación quedan a medias. Las CTEs tocan
            // tablas distintas (schedules/classes/instructors), así que no hay orden ni colisión.
            const res = await query<{ sched: number; classes: number }>(
                `WITH moved_sched AS (
                     UPDATE schedules SET instructor_id = $1, updated_at = NOW()
                     WHERE instructor_id = $2 RETURNING 1
                 ),
                 moved_classes AS (
                     UPDATE classes SET instructor_id = $1, updated_at = NOW()
                     WHERE instructor_id = $2 RETURNING 1
                 ),
                 deact AS (
                     UPDATE instructors SET is_active = false, visible_public = false, updated_at = NOW()
                     WHERE id = $2 RETURNING 1
                 )
                 SELECT (SELECT count(*) FROM moved_sched)::int   AS sched,
                        (SELECT count(*) FROM moved_classes)::int AS classes`,
                [real.id, dup.id]
            );
            const row = res[0];
            console.log(`Migration 068: 'Sofi' consolidada en 'Sofi Maes' (horarios: ${row?.sched ?? 0}, clases: ${row?.classes ?? 0}); registro sobrante desactivado.`);
        } else {
            console.log('Migration 068: sin registro duplicado de Sofi (no-op).');
        }
    } catch (e) { console.error('Migration 068 error:', e); }

    // Migration 069: asignar Karla a la clase de San Miguel, lunes 09:10 (Sculpt), que la dueña
    // reportó sin coach correcto. NO está en el seed (SM no tiene slot los lunes 09:10), así que
    // se corrige solo en los datos vivos. Se ejecuta UNA sola vez (marca en system_settings) para
    // NO revertir reasignaciones que el admin/recepción haga después desde el panel. Se empareja
    // por el slot exacto (sucursal + lunes + 09:10), que identifica esa única clase.
    try {
        const already = await queryOne<{ x: number }>(
            `SELECT 1 AS x FROM system_settings WHERE key = 'mig069_sm_mon_0910_karla'`
        );
        if (!already) {
            const karla = await queryOne<{ id: string }>(`SELECT id FROM instructors WHERE display_name = 'Karla'`);
            const fac = await queryOne<{ id: string }>(`SELECT id FROM facilities WHERE name ILIKE 'BMB Studio San Miguel'`);
            const sculpt = await queryOne<{ id: string }>(`SELECT id FROM class_types WHERE name = 'Sculpt' ORDER BY created_at NULLS FIRST LIMIT 1`);
            if (karla && fac && sculpt) {
                // Un solo statement con CTEs que escriben → atómico (todo o nada). Empareja por el
                // slot EXACTO: sucursal SM + lunes (day_of_week/DOW=1) + 09:10 + tipo Sculpt, para no
                // tocar otra clase que pudiera existir en ese mismo horario.
                const res = await query<{ sched: number; classes: number }>(
                    `WITH moved_sched AS (
                         UPDATE schedules SET instructor_id = $1, updated_at = NOW()
                         WHERE facility_id = $2 AND day_of_week = 1 AND start_time = '09:10' AND class_type_id = $3
                         RETURNING 1
                     ),
                     moved_classes AS (
                         UPDATE classes SET instructor_id = $1, updated_at = NOW()
                         WHERE facility_id = $2 AND start_time = '09:10' AND class_type_id = $3
                           AND EXTRACT(DOW FROM date) = 1 AND date >= CURRENT_DATE
                         RETURNING 1
                     )
                     SELECT (SELECT count(*) FROM moved_sched)::int   AS sched,
                            (SELECT count(*) FROM moved_classes)::int AS classes`,
                    [karla.id, fac.id, sculpt.id]
                );
                const row = res[0];
                const total = (row?.sched ?? 0) + (row?.classes ?? 0);
                if (total > 0) {
                    // Marca de "ya corrió" SOLO si de verdad reasignó algo, para no bloquear el
                    // reintento si los datos aún no estaban; y para no revertir cambios futuros del admin.
                    await query(
                        `INSERT INTO system_settings (key, value) VALUES ('mig069_sm_mon_0910_karla', '"done"'::jsonb)
                         ON CONFLICT (key) DO NOTHING`
                    );
                    console.log(`Migration 069: SM lunes 09:10 (Sculpt) → Karla (horarios: ${row?.sched ?? 0}, clases futuras: ${row?.classes ?? 0}).`);
                } else {
                    console.warn('Migration 069: no se encontró clase SM lunes 09:10 (Sculpt); se reintentará en el próximo arranque.');
                }
            } else {
                console.log('Migration 069: faltan refs (Karla, sucursal SM o tipo Sculpt); se reintentará en el próximo arranque.');
            }
        }
    } catch (e) { console.error('Migration 069 error:', e); }

    // Migration 070: slots de Reformer que faltaban (confirmados por la dueña con fotos):
    //  - Tepa SÁBADO 07:10 (antes empezaba 08:10) → formato Classic, coach Jessi Tavira.
    //  - DOMINGO 07:10 y 08:10 en AMBAS sucursales → formato Flow (rotación dom=Flow de la Mig 052),
    //    coach AM de cada sucursal (Tepa: Jessi Tavira, SM: Aaron Domínguez).
    // (San Miguel ya tenía el sábado desde 07:10.) Inserta en `schedules` solo si no existe ese slot
    // (mismo patrón idempotente del seed); el cron diario GENERATE_CLASSES (o "Generar semana" en
    // recepción) materializa las clases reservables. Nota: el class_type 'Pilates Reformer' del seed
    // ya fue renombrado por la Mig 052, por eso aquí se usan los nombres actuales.
    try {
        const tepa = await queryOne<{ id: string }>(`SELECT id FROM facilities WHERE name ILIKE 'BMB Studio Tepa'`);
        const sm = await queryOne<{ id: string }>(`SELECT id FROM facilities WHERE name ILIKE 'BMB Studio San Miguel'`);
        const classic = await queryOne<{ id: string }>(`SELECT id FROM class_types WHERE name = 'Reformer Classic'`);
        // Domingo = 'Restore Reformer' (la Mig 057 ya define ese formato para los domingos), no 'Reformer Flow'.
        const restore = await queryOne<{ id: string }>(`SELECT id FROM class_types WHERE name = 'Restore Reformer'`);
        const jessi = await queryOne<{ id: string }>(`SELECT id FROM instructors WHERE display_name = 'Jessi Tavira'`);
        const aaron = await queryOne<{ id: string }>(`SELECT id FROM instructors WHERE display_name = 'Aaron Domínguez'`);

        if (!tepa || !sm || !classic || !restore || !jessi || !aaron) {
            const missing = ([['Tepa', tepa], ['San Miguel', sm], ['Reformer Classic', classic],
                ['Restore Reformer', restore], ['Jessi Tavira', jessi], ['Aaron Domínguez', aaron]] as Array<[string, { id: string } | null]>)
                .filter(([, v]) => !v).map(([k]) => k);
            console.warn(`Migration 070: faltan refs [${missing.join(', ')}]; se reintentará en el próximo arranque (no-op).`);
        } else {
            // [facility, class_type, instructor, day_of_week, start, end] — end = start + 50 min.
            // Sábado = Classic; Domingo = Restore Reformer (formato de domingo, ver Mig 057).
            const slots: Array<[{ id: string }, { id: string }, { id: string }, number, string, string]> = [
                [tepa, classic, jessi, 6, '07:10', '08:00'], // Tepa sábado 07:10 (Classic)
                [tepa, restore, jessi, 0, '07:10', '08:00'], // Tepa domingo 07:10 (Restore)
                [tepa, restore, jessi, 0, '08:10', '09:00'], // Tepa domingo 08:10 (Restore)
                [sm, restore, aaron, 0, '07:10', '08:00'],   // SM domingo 07:10 (Restore)
                [sm, restore, aaron, 0, '08:10', '09:00'],   // SM domingo 08:10 (Restore)
            ];
            let added = 0;
            for (const [fac, ct, inst, day, start, end] of slots) {
                // NOT EXISTS por (sucursal, tipo, día, hora) como el seed; ON CONFLICT DO NOTHING por si
                // existe el índice único de la Mig 057 (day_of_week, start_time, instructor_id, class_type_id, facility_id).
                const r = await query(
                    `INSERT INTO schedules (class_type_id, instructor_id, facility_id, day_of_week, start_time, end_time, max_capacity, is_recurring, is_active)
                     SELECT $1, $2, $3, $4, $5, $6, 8, true, true
                     WHERE NOT EXISTS (
                       SELECT 1 FROM schedules WHERE facility_id = $3 AND class_type_id = $1 AND day_of_week = $4 AND start_time = $5
                     )
                     ON CONFLICT DO NOTHING
                     RETURNING id`,
                    [ct.id, inst.id, fac.id, day, start, end]
                );
                added += r.length;
            }
            console.log(`Migration 070: slots Reformer sáb/dom — agregados: ${added}, ya existían: ${5 - added}.`);
        }
    } catch (e) { console.error('Migration 070 error:', e); }

    // Migration 071: renombrar el formato Reformer del miércoles 'Cardio Reformer' → 'Jumpboard'
    // (nombre que usa el calendario real de la dueña). Solo cambia el nombre del class_type:
    // preserva id, color y FKs, así que las clases/horarios/reservas existentes no se tocan.
    // Idempotente: tras renombrar, 'Cardio Reformer' ya no existe → no-op al reiniciar.
    try {
        await query(`UPDATE class_types SET name = 'Jumpboard', updated_at = NOW() WHERE name = 'Cardio Reformer'`);
        console.log('Migration 071: class_type Cardio Reformer → Jumpboard.');
    } catch (e) { console.error('Migration 071 error:', e); }

    // Migration 072: limpiar las clases Reformer DUPLICADAS de tipo 'Pilates Reformer' (datos viejos).
    // Causa raíz: el seed base de class_types (línea ~750) re-crea 'Pilates Reformer' después de que
    // la Mig 052 lo renombró a 'Reformer Classic', y el seed 038 vuelve a sembrar horarios
    // 'Pilates Reformer' → cada slot Reformer queda con DOS clases (el formato del día + 'Pilates
    // Reformer'). Verificado en prod: las 'Pilates Reformer' futuras tienen 0 reservas y todas tienen
    // su hermano de formato en el mismo slot. Se ejecuta UNA vez (marca en system_settings).
    // Estrategia estable: DESACTIVAR (no borrar) los horarios y el class_type 'Pilates Reformer'
    //  → deja de generar Y bloquea el re-insert del seed (su NOT EXISTS sigue encontrando las filas
    //    inactivas, y el seed de class_types no recrea el tipo porque ya existe). Borrar el class_type
    //    no es opción (clases históricas lo referencian con ON DELETE RESTRICT).
    try {
        const done = await queryOne<{ x: number }>(`SELECT 1 AS x FROM system_settings WHERE key='migration_072_dedupe_pilates_reformer'`);
        if (!done) {
            // Prerrequisito: la Mig 052 (formatos Reformer) ya debe haber corrido; si no, los "hermanos
            // de formato" no existen y el dedupe no tendría con qué comparar. Si aún no, se pospone.
            const m052 = await queryOne<{ x: number }>(`SELECT 1 AS x FROM system_settings WHERE key='migration_052_reformer_formats'`);
            if (!m052) {
                console.warn('Migration 072: la Mig 052 (formatos Reformer) aún no corrió; se pospone al próximo arranque.');
            } else {
                // Un SOLO statement con CTEs que escriben → atómico (todo o nada): desactiva horarios,
                // borra clases futuras duplicadas y desactiva el class_type, juntos. Tocan tablas distintas,
                // así que no interfieren entre sí. Guardas del DELETE:
                //  - solo class_type 'Pilates Reformer' ACTIVO (pr), date >= hoy, status 'scheduled'
                //  - 0 reservas activas (regular o invitado) y current_bookings = 0
                //  - EXISTE un hermano Reformer (otro formato) en el mismo slot+coach → nunca borra la
                //    última clase Reformer de un horario. facility_id con IS NOT DISTINCT FROM (NULL-safe).
                const res = await query<{ sched: number; del: number }>(
                    `WITH pr AS (
                         SELECT id FROM class_types WHERE name = 'Pilates Reformer' AND is_active = true
                     ),
                     deact_sched AS (
                         UPDATE schedules SET is_active = false, updated_at = NOW()
                         WHERE class_type_id IN (SELECT id FROM pr) AND is_active = true
                         RETURNING 1
                     ),
                     del AS (
                         DELETE FROM classes c
                         WHERE c.class_type_id IN (SELECT id FROM pr)
                           AND c.status = 'scheduled' AND c.date >= CURRENT_DATE
                           AND COALESCE(c.current_bookings, 0) = 0
                           AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.class_id = c.id AND b.status NOT IN ('cancelled'))
                           AND NOT EXISTS (SELECT 1 FROM guest_bookings g WHERE g.class_id = c.id AND g.status NOT IN ('cancelled'))
                           AND EXISTS (
                             SELECT 1 FROM classes s
                             JOIN class_types sct ON sct.id = s.class_type_id AND sct.category = 'reformer'
                             WHERE s.id <> c.id AND s.status = 'scheduled'
                               AND s.date = c.date AND s.start_time = c.start_time
                               AND s.facility_id IS NOT DISTINCT FROM c.facility_id
                               AND s.instructor_id = c.instructor_id
                               AND s.class_type_id <> c.class_type_id
                           )
                         RETURNING 1
                     ),
                     deact_type AS (
                         UPDATE class_types SET is_active = false, updated_at = NOW()
                         WHERE id IN (SELECT id FROM pr)
                         RETURNING 1
                     )
                     SELECT (SELECT count(*) FROM deact_sched)::int AS sched,
                            (SELECT count(*) FROM del)::int        AS del`
                );
                const row = res[0];
                await query(`INSERT INTO system_settings (key, value) VALUES ('migration_072_dedupe_pilates_reformer', '"done"'::jsonb) ON CONFLICT (key) DO NOTHING`);
                console.log(`Migration 072: dedupe Pilates Reformer — horarios desactivados: ${row?.sched ?? 0}, clases futuras borradas: ${row?.del ?? 0}.`);
            }
        }
    } catch (e) { console.error('Migration 072 error:', e); }

    // Migration 073: waitlist de clases — defaults de política (merge sin pisar lo
    // configurado) + valor de enum para la notificación in-app de promoción. Idempotente.
    try {
        await query(`
            UPDATE system_settings SET value =
                jsonb_build_object(
                    'allow_waitlist', true,
                    'auto_promote_waitlist', true,
                    'waitlist_cutoff_hours', 2,
                    'waitlist_max_size', 5
                ) || value
            WHERE key = 'booking_policies'`);
        await query(`INSERT INTO system_settings (key, value, description)
            SELECT 'booking_policies',
                   '{"allow_waitlist":true,"auto_promote_waitlist":true,"waitlist_cutoff_hours":2,"waitlist_max_size":5}'::jsonb,
                   'Políticas de reserva'
            WHERE NOT EXISTS (SELECT 1 FROM system_settings WHERE key='booking_policies')`);
        await query(`ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'waitlist_promoted'`);
        console.log('Migration 073: waitlist policy defaults + enum listos.');
    } catch (e) { console.error('Migration 073 error:', e); }

    // Migration 074: San Miguel — Mar 20:10 cambia de Yoga a Hot Yoga (la ficha ya siembra Hot Yoga).
    // Borra el renglón viejo de Yoga (Frida) en ese slot + sus clases futuras sin reservas, para no
    // duplicar. (Lun 09:10 Sculpt y Mié 20:10 Hot Sculpt son slots nuevos: los agrega el seed 038.)
    try {
        const done074 = await queryOne<{ k: string }>(
            `SELECT key AS k FROM system_settings WHERE key='migration_074_sm_mar2010_hotyoga'`
        );
        if (!done074) {
            const sm = await queryOne<{ id: string }>(`SELECT id FROM facilities WHERE name = 'BMB Studio San Miguel'`);
            const yoga = await queryOne<{ id: string }>(`SELECT id FROM class_types WHERE name = 'Yoga' ORDER BY created_at NULLS FIRST LIMIT 1`);
            const frida = await queryOne<{ id: string }>(`SELECT id FROM instructors WHERE display_name = 'Frida' LIMIT 1`);
            if (sm && yoga && frida) {
                await query(
                    `DELETE FROM classes c USING schedules s
                     WHERE c.schedule_id = s.id AND c.current_bookings = 0 AND c.date >= CURRENT_DATE
                       AND s.facility_id = $1 AND s.class_type_id = $2 AND s.instructor_id = $3
                       AND s.day_of_week = 2 AND s.start_time = '20:10'`,
                    [sm.id, yoga.id, frida.id]
                );
                await query(
                    `DELETE FROM schedules
                     WHERE facility_id = $1 AND class_type_id = $2 AND instructor_id = $3
                       AND day_of_week = 2 AND start_time = '20:10'`,
                    [sm.id, yoga.id, frida.id]
                );
            }
            await query(`INSERT INTO system_settings (key, value) VALUES ('migration_074_sm_mar2010_hotyoga', 'true'::jsonb) ON CONFLICT (key) DO NOTHING`);
            console.log('Migration 074: SM Mar 20:10 Yoga→Hot Yoga (renglón viejo Yoga eliminado).');
        }
    } catch (e) { console.error('Migration 074 error:', e); }

    // Migration 025: cancel_booking() SQL function — single source of truth for cancellation rules
    try {
        // Seed cancellation_policy with full schema (idempotent merge — preserves operator overrides)
        await query(`
            INSERT INTO system_settings (key, value)
            VALUES ('cancellation_policy', $1::jsonb)
            ON CONFLICT (key) DO UPDATE SET value =
                jsonb_build_object(
                    'enabled',                      COALESCE((system_settings.value->>'enabled')::boolean, true),
                    'min_hours',                    COALESCE((system_settings.value->>'min_hours')::numeric, 5),
                    'refund_credit_on_cancel',      COALESCE((system_settings.value->>'refund_credit_on_cancel')::boolean, true),
                    'cancellations_per_membership', COALESCE((system_settings.value->>'cancellations_per_membership')::int, 2),
                    'late_cancel_message',          COALESCE(system_settings.value->>'late_cancel_message',
                        'Esta clase ya no puede cancelarse a tiempo para recuperar tu crédito.')
                )
        `, [JSON.stringify({
            enabled: true,
            min_hours: 4,
            refund_credit_on_cancel: true,
            cancellations_per_membership: 2,
            late_cancel_message: 'Esta clase ya no puede cancelarse a tiempo para recuperar tu crédito.',
        })]);

        // Drop and recreate the function (idempotent). Se dropean firmas previas (3 y 4 args)
        // para poder recrear con la firma de 5 args (p_force) sin overloads ambiguos.
        await query(`DROP FUNCTION IF EXISTS cancel_booking(uuid, uuid, boolean)`);
        await query(`DROP FUNCTION IF EXISTS cancel_booking(uuid, uuid, boolean, boolean)`);
        await query(`
            CREATE OR REPLACE FUNCTION cancel_booking(
                p_booking_id UUID,
                p_user_id UUID,
                p_is_admin BOOLEAN,
                p_force_refund BOOLEAN DEFAULT NULL,
                p_force BOOLEAN DEFAULT false
            ) RETURNS TABLE(
                out_booking_id UUID,
                out_refunded BOOLEAN,
                out_refund_amount INT,
                out_cancellations_used INT,
                out_cancellation_limit INT,
                out_hours_until_class NUMERIC
            ) AS $func$
            DECLARE
                v_booking RECORD;
                v_class RECORD;
                v_membership RECORD;
                v_class_start TIMESTAMPTZ;
                v_now TIMESTAMPTZ := NOW();
                v_hours NUMERIC;
                v_policy JSONB;
                v_min_hours NUMERIC;
                v_enabled BOOLEAN;
                v_refund_enabled BOOLEAN;
                v_should_refund BOOLEAN := false;
            BEGIN
                -- Read full cancellation policy
                SELECT value INTO v_policy FROM system_settings WHERE key = 'cancellation_policy';
                v_min_hours      := COALESCE((v_policy->>'min_hours')::numeric, 5);
                v_enabled        := COALESCE((v_policy->>'enabled')::boolean, true);
                v_refund_enabled := COALESCE((v_policy->>'refund_credit_on_cancel')::boolean, true);

                -- LOCK booking row to prevent double-cancel race
                SELECT * INTO v_booking FROM bookings WHERE id = p_booking_id FOR UPDATE;

                IF v_booking IS NULL THEN
                    RAISE EXCEPTION 'BOOKING_NOT_FOUND';
                END IF;

                IF NOT p_is_admin AND v_booking.user_id <> p_user_id THEN
                    RAISE EXCEPTION 'NOT_OWNER';
                END IF;

                IF v_booking.status = 'cancelled' THEN
                    RAISE EXCEPTION 'ALREADY_CANCELLED';
                END IF;

                -- p_force (quitar forzado por staff): permite quitar reservas ya atendidas
                -- (checked_in / no_show), no solo confirmed/waitlist.
                IF v_booking.status NOT IN ('confirmed','waitlist') AND NOT p_force THEN
                    RAISE EXCEPTION 'INVALID_STATUS:%', v_booking.status;
                END IF;

                -- Salirse de la lista de espera: sin ventana, sin reembolso,
                -- sin quemar el contador de cancelaciones (no se gastó crédito).
                IF v_booking.status = 'waitlist' THEN
                    UPDATE bookings SET status = 'cancelled', cancelled_at = NOW(),
                        cancelled_by = p_user_id,
                        cancellation_reason = COALESCE(cancellation_reason, 'Salida de lista de espera')
                    WHERE id = p_booking_id;
                    RETURN QUERY SELECT p_booking_id, false, 0, 0, 0, NULL::numeric;
                    RETURN;
                END IF;

                -- New rule: cancellations toggled off by admin (admins can still bypass)
                IF NOT p_is_admin AND NOT v_enabled THEN
                    RAISE EXCEPTION 'CANCELLATIONS_DISABLED';
                END IF;

                -- Compose class start in Mexico City TZ (DB stores local times)
                SELECT id, date, start_time INTO v_class FROM classes WHERE id = v_booking.class_id;
                IF v_class IS NULL THEN
                    RAISE EXCEPTION 'CLASS_NOT_FOUND';
                END IF;

                v_class_start := (v_class.date::text || ' ' || v_class.start_time::text)::timestamp
                                 AT TIME ZONE 'America/Mexico_City';
                v_hours := EXTRACT(EPOCH FROM (v_class_start - v_now)) / 3600.0;

                -- Hard rule: cannot cancel a class that already started or finished.
                -- p_force permite a staff quitar a una alumna aun después de iniciada/terminada.
                IF v_class_start <= v_now AND NOT p_force THEN
                    RAISE EXCEPTION 'CLASS_ALREADY_STARTED';
                END IF;

                -- Window: only admin can bypass
                IF NOT p_is_admin AND v_hours < v_min_hours THEN
                    RAISE EXCEPTION 'CANCELLATION_WINDOW_EXCEEDED:%h', v_min_hours;
                END IF;

                -- Determine refund eligibility:
                --   admin always refunds, otherwise gated by:
                --     refund_credit_on_cancel toggle AND personal cancellation limit.
                --   Free-class bookings NEVER refund (no credit was deducted).
                IF v_booking.is_free_booking THEN
                    v_should_refund := false;
                ELSIF p_force_refund IS NOT NULL THEN
                    -- Override explícito del staff (el switch "Devolver crédito" del diálogo).
                    -- Manda sobre la lógica automática (clase gratis nunca devuelve, va antes).
                    v_should_refund := p_force_refund;
                ELSIF p_is_admin THEN
                    v_should_refund := true;
                ELSIF NOT v_refund_enabled THEN
                    v_should_refund := false;
                ELSIF v_booking.membership_id IS NOT NULL THEN
                    SELECT id, COALESCE(cancellations_used, 0) AS cu, COALESCE(cancellation_limit, 2) AS cl,
                           classes_remaining INTO v_membership
                    FROM memberships WHERE id = v_booking.membership_id FOR UPDATE;
                    IF v_membership.cu < v_membership.cl THEN
                        v_should_refund := true;
                    END IF;
                ELSE
                    v_should_refund := true;
                END IF;

                -- Apply refund + counters in same transaction
                IF v_should_refund AND v_booking.membership_id IS NOT NULL THEN
                    UPDATE memberships SET
                        cancellations_used = COALESCE(cancellations_used, 0) + (CASE WHEN p_is_admin THEN 0 ELSE 1 END),
                        reformer_remaining = CASE
                            WHEN v_booking.consumed_category = 'reformer' AND reformer_remaining IS NOT NULL
                            THEN reformer_remaining + 1 ELSE reformer_remaining END,
                        multi_remaining = CASE
                            WHEN v_booking.consumed_category = 'multi' AND multi_remaining IS NOT NULL
                            THEN multi_remaining + 1 ELSE multi_remaining END
                    WHERE id = v_booking.membership_id;
                END IF;

                -- Cancel the booking
                UPDATE bookings SET
                    status = 'cancelled',
                    cancelled_at = NOW(),
                    cancelled_by = p_user_id,
                    cancellation_reason = CASE
                        WHEN v_should_refund THEN 'Cancelada (con devolución)'
                        ELSE 'Cancelada (sin devolución)'
                    END,
                    updated_at = NOW()
                WHERE id = p_booking_id;

                out_booking_id := p_booking_id;
                out_refunded := v_should_refund;
                out_refund_amount := CASE WHEN v_should_refund THEN 1 ELSE 0 END;
                BEGIN
                    out_cancellations_used := COALESCE(v_membership.cu, 0) + (CASE WHEN v_should_refund AND NOT p_is_admin THEN 1 ELSE 0 END);
                    out_cancellation_limit := COALESCE(v_membership.cl, 2);
                EXCEPTION WHEN OTHERS THEN
                    -- v_membership wasn't populated (no membership or refund disabled path)
                    out_cancellations_used := 0;
                    out_cancellation_limit := 2;
                END;
                out_hours_until_class := v_hours;
                RETURN NEXT;
            END;
            $func$ LANGUAGE plpgsql;
        `);
        console.log('Migration 025: cancel_booking() function ready.');

        // Companion: preview function — same rules, no mutations
        await query(`DROP FUNCTION IF EXISTS preview_cancel_booking(uuid, uuid, boolean)`);
        await query(`
            CREATE OR REPLACE FUNCTION preview_cancel_booking(
                p_booking_id UUID,
                p_user_id UUID,
                p_is_admin BOOLEAN
            ) RETURNS TABLE(
                out_can_cancel BOOLEAN,
                out_would_refund BOOLEAN,
                out_hours_until_class NUMERIC,
                out_min_hours NUMERIC,
                out_cancellations_used INT,
                out_cancellation_limit INT,
                out_reason TEXT,
                out_error_code TEXT
            ) AS $func$
            DECLARE
                v_booking RECORD;
                v_class RECORD;
                v_membership RECORD;
                v_class_start TIMESTAMPTZ;
                v_now TIMESTAMPTZ := NOW();
                v_hours NUMERIC;
                v_policy JSONB;
                v_min_hours NUMERIC;
                v_enabled BOOLEAN;
                v_refund_enabled BOOLEAN;
            BEGIN
                SELECT value INTO v_policy FROM system_settings WHERE key = 'cancellation_policy';
                v_min_hours      := COALESCE((v_policy->>'min_hours')::numeric, 5);
                v_enabled        := COALESCE((v_policy->>'enabled')::boolean, true);
                v_refund_enabled := COALESCE((v_policy->>'refund_credit_on_cancel')::boolean, true);

                SELECT * INTO v_booking FROM bookings WHERE id = p_booking_id;
                IF v_booking IS NULL THEN
                    out_can_cancel := false; out_would_refund := false;
                    out_error_code := 'BOOKING_NOT_FOUND'; out_reason := 'Reserva no encontrada';
                    RETURN NEXT; RETURN;
                END IF;
                IF NOT p_is_admin AND v_booking.user_id <> p_user_id THEN
                    out_can_cancel := false; out_would_refund := false;
                    out_error_code := 'NOT_OWNER'; out_reason := 'No autorizado';
                    RETURN NEXT; RETURN;
                END IF;
                IF v_booking.status = 'cancelled' THEN
                    out_can_cancel := false; out_would_refund := false;
                    out_error_code := 'ALREADY_CANCELLED'; out_reason := 'Ya estaba cancelada';
                    RETURN NEXT; RETURN;
                END IF;
                IF NOT p_is_admin AND NOT v_enabled THEN
                    out_can_cancel := false; out_would_refund := false;
                    out_error_code := 'CANCELLATIONS_DISABLED';
                    out_reason := 'Las cancelaciones están desactivadas por el studio';
                    RETURN NEXT; RETURN;
                END IF;

                SELECT id, date, start_time INTO v_class FROM classes WHERE id = v_booking.class_id;
                v_class_start := (v_class.date::text || ' ' || v_class.start_time::text)::timestamp
                                 AT TIME ZONE 'America/Mexico_City';
                v_hours := EXTRACT(EPOCH FROM (v_class_start - v_now)) / 3600.0;
                out_hours_until_class := v_hours;
                out_min_hours := v_min_hours;

                IF v_class_start <= v_now THEN
                    out_can_cancel := false; out_would_refund := false;
                    out_error_code := 'CLASS_ALREADY_STARTED';
                    out_reason := 'La clase ya empezó o terminó — no se puede cancelar';
                    RETURN NEXT; RETURN;
                END IF;

                IF NOT p_is_admin AND v_hours < v_min_hours THEN
                    out_can_cancel := false; out_would_refund := false;
                    out_error_code := 'CANCELLATION_WINDOW_EXCEEDED';
                    out_reason := 'Cancelaciones permitidas hasta ' || v_min_hours || 'h antes de la clase';
                    RETURN NEXT; RETURN;
                END IF;

                -- Eligible to cancel — compute refund
                out_can_cancel := true;
                out_error_code := NULL;
                IF p_is_admin THEN
                    out_would_refund := true;
                    out_reason := 'Admin siempre devuelve crédito';
                ELSIF NOT v_refund_enabled THEN
                    out_would_refund := false;
                    out_reason := 'El studio no devuelve crédito al cancelar';
                ELSIF v_booking.membership_id IS NOT NULL THEN
                    SELECT COALESCE(cancellations_used, 0) AS cu, COALESCE(cancellation_limit, 2) AS cl
                      INTO v_membership
                      FROM memberships WHERE id = v_booking.membership_id;
                    out_cancellations_used := v_membership.cu;
                    out_cancellation_limit := v_membership.cl;
                    IF v_membership.cu < v_membership.cl THEN
                        out_would_refund := true;
                        out_reason := 'Se devolverá tu crédito';
                    ELSE
                        out_would_refund := false;
                        out_reason := 'Ya usaste tus ' || v_membership.cl || ' cancelaciones con devolución';
                    END IF;
                ELSE
                    out_would_refund := true;
                    out_reason := 'Se devolverá tu crédito';
                END IF;
                RETURN NEXT;
            END;
            $func$ LANGUAGE plpgsql;
        `);
        console.log('Migration 025: preview_cancel_booking() function ready.');
    } catch (e) { console.error('Migration 025 error:', e); }

    // Migration 024: Final spot layout per facility (owner-confirmed orientation)
    // Wunda: 6 spots, two stair-step groups of 3
    // Barre: 6 spots, two columns of 3
    // Hot Room: 6 spots, single zigzag row
    // Free any spot assignments outside the new 1..6 range so users re-pick.
    try {
        await query(`
            DO $$
            DECLARE
                f_wunda UUID;
                f_barre UUID;
                f_hot   UUID;
            BEGIN
                SELECT id INTO f_wunda FROM facilities WHERE LOWER(name) LIKE '%wunda%' LIMIT 1;
                SELECT id INTO f_barre FROM facilities WHERE LOWER(name) LIKE '%barre%' LIMIT 1;
                SELECT id INTO f_hot   FROM facilities WHERE LOWER(name) LIKE '%hot%'   LIMIT 1;

                -- Free booking_reformers that point at spots we are about to delete
                DELETE FROM booking_reformers br
                WHERE br.reformer_id IN (
                    SELECT r.id FROM reformers r
                    WHERE r.facility_id IN (f_wunda, f_barre, f_hot)
                      AND r.number > 6
                );

                -- Delete spots beyond #6 (only if no remaining booking_reformers reference them)
                DELETE FROM reformers r
                WHERE r.facility_id IN (f_wunda, f_barre, f_hot)
                  AND r.number > 6;

                -- WUNDA: 6 spots, two Z-shaped groups of 3 with a clear vertical gap between groups
                IF f_wunda IS NOT NULL THEN
                    UPDATE reformers SET position_x = 28, position_y = 10, rotation = 0 WHERE facility_id = f_wunda AND number = 1;
                    UPDATE reformers SET position_x = 45, position_y = 22, rotation = 0 WHERE facility_id = f_wunda AND number = 2;
                    UPDATE reformers SET position_x = 28, position_y = 34, rotation = 0 WHERE facility_id = f_wunda AND number = 3;
                    UPDATE reformers SET position_x = 28, position_y = 62, rotation = 0 WHERE facility_id = f_wunda AND number = 4;
                    UPDATE reformers SET position_x = 45, position_y = 74, rotation = 0 WHERE facility_id = f_wunda AND number = 5;
                    UPDATE reformers SET position_x = 28, position_y = 86, rotation = 0 WHERE facility_id = f_wunda AND number = 6;
                    -- Ensure all 6 exist (insert if any missing)
                    INSERT INTO reformers (facility_id, number, label, position_x, position_y, rotation, scale, is_active, spot_kind)
                    SELECT f_wunda, n, 'W'||n,
                           CASE WHEN n IN (2,5) THEN 45 ELSE 28 END,
                           CASE WHEN n=1 THEN 10 WHEN n=2 THEN 22 WHEN n=3 THEN 34
                                WHEN n=4 THEN 62 WHEN n=5 THEN 74 ELSE 86 END,
                           0, 1, true, 'wunda'
                    FROM generate_series(1,6) n
                    WHERE NOT EXISTS (SELECT 1 FROM reformers WHERE facility_id = f_wunda AND number = n);
                END IF;

                -- BARRE: 6 mats, two columns facing wall barres (left col rotated -90, right col rotated 90)
                IF f_barre IS NOT NULL THEN
                    UPDATE reformers SET position_x = 28, position_y = 65, rotation = -90 WHERE facility_id = f_barre AND number = 1;
                    UPDATE reformers SET position_x = 28, position_y = 45, rotation = -90 WHERE facility_id = f_barre AND number = 2;
                    UPDATE reformers SET position_x = 28, position_y = 25, rotation = -90 WHERE facility_id = f_barre AND number = 3;
                    UPDATE reformers SET position_x = 72, position_y = 25, rotation =  90 WHERE facility_id = f_barre AND number = 4;
                    UPDATE reformers SET position_x = 72, position_y = 45, rotation =  90 WHERE facility_id = f_barre AND number = 5;
                    UPDATE reformers SET position_x = 72, position_y = 65, rotation =  90 WHERE facility_id = f_barre AND number = 6;
                    INSERT INTO reformers (facility_id, number, label, position_x, position_y, rotation, scale, is_active, spot_kind)
                    SELECT f_barre, n, 'B'||n,
                           CASE WHEN n IN (1,2,3) THEN 28 ELSE 72 END,
                           CASE WHEN n=1 THEN 65 WHEN n=2 THEN 45 WHEN n=3 THEN 25
                                WHEN n=4 THEN 25 WHEN n=5 THEN 45 ELSE 65 END,
                           CASE WHEN n IN (1,2,3) THEN -90 ELSE 90 END,
                           1, true, 'barre'
                    FROM generate_series(1,6) n
                    WHERE NOT EXISTS (SELECT 1 FROM reformers WHERE facility_id = f_barre AND number = n);
                END IF;

                -- HOT ROOM: 6 spots, single zigzag row (1,3,5 high; 2,4,6 low)
                IF f_hot IS NOT NULL THEN
                    UPDATE reformers SET position_x = 18, position_y = 48 WHERE facility_id = f_hot AND number = 1;
                    UPDATE reformers SET position_x = 32, position_y = 58 WHERE facility_id = f_hot AND number = 2;
                    UPDATE reformers SET position_x = 46, position_y = 48 WHERE facility_id = f_hot AND number = 3;
                    UPDATE reformers SET position_x = 60, position_y = 58 WHERE facility_id = f_hot AND number = 4;
                    UPDATE reformers SET position_x = 74, position_y = 48 WHERE facility_id = f_hot AND number = 5;
                    UPDATE reformers SET position_x = 88, position_y = 58 WHERE facility_id = f_hot AND number = 6;
                    INSERT INTO reformers (facility_id, number, label, position_x, position_y, rotation, scale, is_active, spot_kind)
                    SELECT f_hot, n, 'H'||n,
                           18 + (n-1) * 14,
                           CASE WHEN n % 2 = 1 THEN 48 ELSE 58 END,
                           0, 1, true, 'mat'
                    FROM generate_series(1,6) n
                    WHERE NOT EXISTS (SELECT 1 FROM reformers WHERE facility_id = f_hot AND number = n);
                END IF;

                -- Update facility capacity to reflect 6 spots
                UPDATE facilities SET capacity = 6
                WHERE id IN (f_wunda, f_barre, f_hot);

                RAISE NOTICE 'Migration 024: 6-spot layout applied to all 3 facilities.';
            END $$;
        `);
        console.log('Migration 024: spot layout (6 per facility) applied.');
    } catch (e) { console.error('Migration 024 error:', e); }

    // Migration 022_pre: Create missing tables that other routes depend on
    try {
        await query(`CREATE TABLE IF NOT EXISTS video_categories (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            name VARCHAR(100) NOT NULL,
            description TEXT,
            sort_order INT DEFAULT 0,
            is_active BOOLEAN DEFAULT true,
            created_at TIMESTAMPTZ DEFAULT NOW()
        )`);
        await query(`CREATE TABLE IF NOT EXISTS loyalty_rewards (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            name VARCHAR(100) NOT NULL,
            description TEXT,
            points_required INT NOT NULL DEFAULT 0,
            reward_type VARCHAR(50),
            reward_value JSONB,
            is_active BOOLEAN DEFAULT true,
            created_at TIMESTAMPTZ DEFAULT NOW()
        )`);
        // Add loyalty_points column to users if missing
        await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS loyalty_points INT DEFAULT 0`);
        await query(`ALTER TABLE videos ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES video_categories(id) ON DELETE SET NULL`);
        console.log('Migration 022_pre: missing tables/columns created.');
    } catch (e) { console.error('Migration 022_pre error:', e); }

    // Migration 023: discount_codes + related tables (production was missing them entirely)
    try {
        await query(`CREATE TABLE IF NOT EXISTS discount_codes (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            code VARCHAR(50) UNIQUE NOT NULL,
            description TEXT,
            discount_type VARCHAR(20) NOT NULL,
            discount_value NUMERIC(10,2) NOT NULL,
            max_uses INT,
            current_uses INT DEFAULT 0,
            valid_from TIMESTAMPTZ DEFAULT NOW(),
            valid_until TIMESTAMPTZ,
            min_purchase NUMERIC(10,2) DEFAULT 0,
            is_active BOOLEAN DEFAULT true,
            user_id UUID REFERENCES users(id) ON DELETE CASCADE,
            is_referral BOOLEAN DEFAULT false,
            referral_owner_id UUID REFERENCES users(id) ON DELETE SET NULL,
            created_by UUID REFERENCES users(id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ DEFAULT NOW()
        )`);
        await query(`CREATE TABLE IF NOT EXISTS discount_code_plans (
            discount_code_id UUID NOT NULL REFERENCES discount_codes(id) ON DELETE CASCADE,
            plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
            PRIMARY KEY (discount_code_id, plan_id)
        )`);
        await query(`CREATE TABLE IF NOT EXISTS discount_redemptions (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            discount_code_id UUID NOT NULL REFERENCES discount_codes(id) ON DELETE CASCADE,
            order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            discount_amount NUMERIC(10,2) NOT NULL,
            redeemed_at TIMESTAMPTZ DEFAULT NOW()
        )`);
        // Personal-code support (added for QA suite — admin can assign code to specific user)
        await query(`ALTER TABLE discount_codes ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE`);
        console.log('Migration 023: discount_codes / discount_code_plans / discount_redemptions ready.');
    } catch (e) { console.error('Migration 023 error:', e); }

    // Migration 023c: ensure memberships has cancellations_used + cancellation_limit
    try {
        await query(`ALTER TABLE memberships
            ADD COLUMN IF NOT EXISTS cancellations_used INT DEFAULT 0,
            ADD COLUMN IF NOT EXISTS cancellation_limit INT DEFAULT 999`);
        console.log('Migration 023c: memberships cancellation columns ready.');
    } catch (e) { console.error('Migration 023c error:', e); }

    // Migration 075: columnas de migración en memberships (las usa POST /migrations/client,
    // que estaba roto en prod por faltar estas columnas). Idempotente.
    try {
        await query(`ALTER TABLE memberships
            ADD COLUMN IF NOT EXISTS is_migration BOOLEAN NOT NULL DEFAULT false,
            ADD COLUMN IF NOT EXISTS migration_notes TEXT,
            ADD COLUMN IF NOT EXISTS classes_used_before_migration INT DEFAULT 0`);
        console.log('Migration 075: memberships migration columns ready.');
    } catch (e) { console.error('Migration 075 error:', e); }

    // Migration 076: marca de migración en bookings. La usa POST /migrations/booking
    // (recrea reservas futuras traídas de Fitune sin consumir créditos). Idempotente.
    try {
        await query(`ALTER TABLE bookings
            ADD COLUMN IF NOT EXISTS is_migration BOOLEAN NOT NULL DEFAULT false`);
        console.log('Migration 076: bookings.is_migration ready.');
    } catch (e) { console.error('Migration 076 error:', e); }

    // Migration 078: coach de Reformer por (sucursal, DÍA, HORA). La Migration 040 reasigna
    // TODO el reformer por sucursal + AM/PM (Aaron/Jessi/Sofi en bloque), pero el coach real
    // cambia por día y por horario. Esta migración corre DESPUÉS de la 040 y cada boot
    // re-aplica el mapa correcto a `schedules` (si no, la 040 lo deja en blanco). Las clases
    // YA generadas se corrigen UNA sola vez (gated) para no pisar suplencias futuras.
    // dow = convención Postgres (Dom=0..Sáb=6).
    try {
        const REFORMER_COACHES: Array<{ fac: string; dow: number; t: string; coach: string }> = [
            { fac: "BMB Studio San Miguel", dow: 0, t: "07:10:00", coach: "Sofi Maes" },
            { fac: "BMB Studio San Miguel", dow: 0, t: "08:10:00", coach: "Indie" },
            { fac: "BMB Studio San Miguel", dow: 1, t: "07:10:00", coach: "Aaron Domínguez" },
            { fac: "BMB Studio San Miguel", dow: 1, t: "08:10:00", coach: "Aaron Domínguez" },
            { fac: "BMB Studio San Miguel", dow: 1, t: "09:10:00", coach: "Aaron Domínguez" },
            { fac: "BMB Studio San Miguel", dow: 1, t: "17:10:00", coach: "Karla" },
            { fac: "BMB Studio San Miguel", dow: 1, t: "18:10:00", coach: "Jessi Tavira" },
            { fac: "BMB Studio San Miguel", dow: 1, t: "19:10:00", coach: "Jessi Tavira" },
            { fac: "BMB Studio San Miguel", dow: 1, t: "20:10:00", coach: "Karla" },
            { fac: "BMB Studio San Miguel", dow: 2, t: "07:10:00", coach: "Karla" },
            { fac: "BMB Studio San Miguel", dow: 2, t: "08:10:00", coach: "Karla" },
            { fac: "BMB Studio San Miguel", dow: 2, t: "09:10:00", coach: "Karla" },
            { fac: "BMB Studio San Miguel", dow: 2, t: "17:10:00", coach: "Karla" },
            { fac: "BMB Studio San Miguel", dow: 2, t: "18:10:00", coach: "Karla" },
            { fac: "BMB Studio San Miguel", dow: 2, t: "19:10:00", coach: "Karla" },
            { fac: "BMB Studio San Miguel", dow: 2, t: "20:10:00", coach: "Karla" },
            { fac: "BMB Studio San Miguel", dow: 3, t: "07:10:00", coach: "Karla" },
            { fac: "BMB Studio San Miguel", dow: 3, t: "08:10:00", coach: "Karla" },
            { fac: "BMB Studio San Miguel", dow: 3, t: "09:10:00", coach: "Jessi Tavira" },
            { fac: "BMB Studio San Miguel", dow: 3, t: "17:10:00", coach: "Karla" },
            { fac: "BMB Studio San Miguel", dow: 3, t: "18:10:00", coach: "Jessi Tavira" },
            { fac: "BMB Studio San Miguel", dow: 3, t: "19:10:00", coach: "Jessi Tavira" },
            { fac: "BMB Studio San Miguel", dow: 3, t: "20:10:00", coach: "Jessi Tavira" },
            { fac: "BMB Studio San Miguel", dow: 4, t: "07:10:00", coach: "Aaron Domínguez" },
            { fac: "BMB Studio San Miguel", dow: 4, t: "08:10:00", coach: "Aaron Domínguez" },
            { fac: "BMB Studio San Miguel", dow: 4, t: "09:10:00", coach: "Aaron Domínguez" },
            { fac: "BMB Studio San Miguel", dow: 4, t: "17:10:00", coach: "Karla" },
            { fac: "BMB Studio San Miguel", dow: 4, t: "18:10:00", coach: "Karla" },
            { fac: "BMB Studio San Miguel", dow: 4, t: "19:10:00", coach: "Karla" },
            { fac: "BMB Studio San Miguel", dow: 4, t: "20:10:00", coach: "Karla" },
            { fac: "BMB Studio San Miguel", dow: 5, t: "07:10:00", coach: "Jessi Tavira" },
            { fac: "BMB Studio San Miguel", dow: 5, t: "08:10:00", coach: "Jessi Tavira" },
            { fac: "BMB Studio San Miguel", dow: 5, t: "09:10:00", coach: "Jessi Tavira" },
            { fac: "BMB Studio San Miguel", dow: 5, t: "10:10:00", coach: "Sofi Maes" },
            { fac: "BMB Studio San Miguel", dow: 5, t: "17:10:00", coach: "Aaron Domínguez" },
            { fac: "BMB Studio San Miguel", dow: 5, t: "18:10:00", coach: "Aaron Domínguez" },
            { fac: "BMB Studio San Miguel", dow: 5, t: "19:10:00", coach: "Aaron Domínguez" },
            { fac: "BMB Studio San Miguel", dow: 6, t: "07:10:00", coach: "Sofi Maes" },
            { fac: "BMB Studio San Miguel", dow: 6, t: "08:10:00", coach: "Sofi Maes" },
            { fac: "BMB Studio San Miguel", dow: 6, t: "09:10:00", coach: "Sofi Maes" },
            { fac: "BMB Studio Tepa", dow: 1, t: "08:10:00", coach: "Jessi Tavira" },
            { fac: "BMB Studio Tepa", dow: 1, t: "17:10:00", coach: "Sofi Maes" },
            { fac: "BMB Studio Tepa", dow: 1, t: "18:10:00", coach: "Sofi Maes" },
            { fac: "BMB Studio Tepa", dow: 1, t: "19:10:00", coach: "Indie" },
            { fac: "BMB Studio Tepa", dow: 2, t: "07:10:00", coach: "Jessi Tavira" },
            { fac: "BMB Studio Tepa", dow: 2, t: "08:10:00", coach: "Jessi Tavira" },
            { fac: "BMB Studio Tepa", dow: 2, t: "09:10:00", coach: "Jessi Tavira" },
            { fac: "BMB Studio Tepa", dow: 2, t: "18:10:00", coach: "Jessi Tavira" },
            { fac: "BMB Studio Tepa", dow: 2, t: "19:10:00", coach: "Jessi Tavira" },
            { fac: "BMB Studio Tepa", dow: 3, t: "07:10:00", coach: "Aaron Domínguez" },
            { fac: "BMB Studio Tepa", dow: 3, t: "08:10:00", coach: "Aaron Domínguez" },
            { fac: "BMB Studio Tepa", dow: 3, t: "09:10:00", coach: "Aaron Domínguez" },
            { fac: "BMB Studio Tepa", dow: 3, t: "18:10:00", coach: "Sofi Maes" },
            { fac: "BMB Studio Tepa", dow: 3, t: "19:10:00", coach: "Indie" },
            { fac: "BMB Studio Tepa", dow: 4, t: "09:10:00", coach: "Karla" },
            { fac: "BMB Studio Tepa", dow: 4, t: "17:10:00", coach: "Jessi Tavira" },
            { fac: "BMB Studio Tepa", dow: 4, t: "18:10:00", coach: "Jessi Tavira" },
            { fac: "BMB Studio Tepa", dow: 4, t: "19:10:00", coach: "Jessi Tavira" },
            { fac: "BMB Studio Tepa", dow: 4, t: "20:10:00", coach: "Jessi Tavira" },
            { fac: "BMB Studio Tepa", dow: 5, t: "08:10:00", coach: "Karla" },
            { fac: "BMB Studio Tepa", dow: 5, t: "09:10:00", coach: "Karla" },
            { fac: "BMB Studio Tepa", dow: 5, t: "17:10:00", coach: "Karla" },
            { fac: "BMB Studio Tepa", dow: 5, t: "18:10:00", coach: "Karla" },
            { fac: "BMB Studio Tepa", dow: 5, t: "19:10:00", coach: "Karla" },
            { fac: "BMB Studio Tepa", dow: 6, t: "08:10:00", coach: "Jessi Tavira" },
            { fac: "BMB Studio Tepa", dow: 6, t: "09:10:00", coach: "Jessi Tavira" },
            { fac: "BMB Studio Tepa", dow: 6, t: "10:10:00", coach: "Jessi Tavira" },
        ];
        // Resolver coach -> instructor_id (una vez, evita ambigüedad por nombres repetidos)
        const coachIds = new Map<string, string>();
        for (const name of new Set(REFORMER_COACHES.map((r) => r.coach))) {
            const row = await queryOne<{ id: string }>(
                `SELECT id FROM instructors WHERE display_name = $1 ORDER BY created_at NULLS FIRST LIMIT 1`, [name]);
            if (row) coachIds.set(name, row.id);
            else console.warn('Migration 078: instructor no encontrado:', name);
        }
        // schedules: GUARDADO con flag de una sola vez (antes corría en cada boot y pisaba
        // los cambios de instructor que el admin hiciera en los horarios recurrentes).
        const done078sched = await queryOne(`SELECT 1 AS x FROM system_settings WHERE key='mig_reformer_coaches_schedules_v1'`);
        if (!done078sched) {
        for (const r of REFORMER_COACHES) {
            const cid = coachIds.get(r.coach); if (!cid) continue;
            await query(
                `UPDATE schedules s SET instructor_id = $4, updated_at = NOW()
                 FROM facilities f, class_types ct
                 WHERE s.facility_id = f.id AND s.class_type_id = ct.id AND ct.category = 'reformer'
                   AND f.name = $1 AND s.day_of_week = $2 AND s.start_time = $3`,
                [r.fac, r.dow, r.t, cid]
            );
        }
        await query(`INSERT INTO system_settings (key, value) VALUES ('mig_reformer_coaches_schedules_v1', 'true'::jsonb) ON CONFLICT (key) DO NOTHING`);
        }
        // clases ya generadas (futuras): una sola vez, para no pisar suplencias posteriores
        const done077 = await queryOne(`SELECT 1 FROM system_settings WHERE key = 'mig_reformer_coaches_classes_v1'`);
        if (!done077) {
            for (const r of REFORMER_COACHES) {
                const cid = coachIds.get(r.coach); if (!cid) continue;
                await query(
                    `UPDATE classes c SET instructor_id = $4, updated_at = NOW()
                     FROM facilities f, class_types ct
                     WHERE c.facility_id = f.id AND c.class_type_id = ct.id AND ct.category = 'reformer'
                       AND f.name = $1 AND EXTRACT(DOW FROM c.date)::int = $2 AND c.start_time = $3
                       AND c.date >= CURRENT_DATE`,
                    [r.fac, r.dow, r.t, cid]
                );
            }
            await query(`INSERT INTO system_settings (key, value, description) VALUES ('mig_reformer_coaches_classes_v1', 'true'::jsonb, 'Coaches Reformer por día/hora aplicados a clases existentes') ON CONFLICT (key) DO NOTHING`);
        }
        console.log('Migration 078: coaches Reformer por día/hora aplicados (schedules cada boot; clases 1 vez).');
    } catch (e) { console.error('Migration 078 error:', e); }

    // FIX jueves Tepa PM (coaches): faltaban en la tabla de la Mig 078 las entradas reformer de 17:10 y
    // 20:10, así que el blanket de la Mig 040 las dejaba en Sofi Maes; en Fitune ese reformer (Tepa) lo
    // da Jessi Tavira. Ya se agregaron a REFORMER_COACHES (corrige el schedule cada boot); aquí se
    // corrigen las CLASES futuras ya generadas (solo donde está Sofi Maes -> Jessi Tavira) una sola vez,
    // sin tocar suplencias de otros slots. Las reservas no se tocan (solo cambia el coach).
    try {
        const doneJue = await queryOne(`SELECT 1 FROM system_settings WHERE key='fix_tepa_jue_pm_jessi_v1'`);
        if (!doneJue) {
            await query(
                `UPDATE classes c SET instructor_id = (SELECT id FROM instructors WHERE display_name='Jessi Tavira' ORDER BY created_at NULLS FIRST LIMIT 1), updated_at = NOW()
                 FROM facilities f, class_types ct
                 WHERE c.facility_id=f.id AND c.class_type_id=ct.id AND ct.category='reformer'
                   AND f.name='BMB Studio Tepa' AND c.start_time IN ('17:10','20:10')
                   AND EXTRACT(DOW FROM c.date)::int=4 AND c.date >= CURRENT_DATE
                   AND c.instructor_id = (SELECT id FROM instructors WHERE display_name='Sofi Maes' ORDER BY created_at NULLS FIRST LIMIT 1)`
            );
            await query(`INSERT INTO system_settings (key, value) VALUES ('fix_tepa_jue_pm_jessi_v1','true'::jsonb) ON CONFLICT (key) DO NOTHING`);
            console.log('Fix jueves Tepa PM: reformer 17:10/20:10 Sofi Maes -> Jessi Tavira (clases futuras).');
        }
    } catch (e) { console.error('Fix jueves Tepa PM error:', e); }

    // Migration 080: capacidad de Reformer = 6 (hay 6 reformers reales por sucursal).
    // El seed histórico ponía 8 (sobre-cupo: 2 personas sin máquina). Cada boot forzamos
    // schedules y clases FUTURAS a 6 (idempotente; el WHERE max_capacity<>6 evita updates
    // inútiles). Corre cada boot para ganarle al re-seed/regeneración. Multi NO se toca.
    try {
        await query(`UPDATE schedules s SET max_capacity = 6, updated_at = NOW()
            FROM class_types ct WHERE ct.id = s.class_type_id AND ct.category = 'reformer' AND s.max_capacity <> 6`);
        await query(`UPDATE classes c SET max_capacity = 6, updated_at = NOW()
            FROM class_types ct WHERE ct.id = c.class_type_id AND ct.category = 'reformer' AND c.date >= CURRENT_DATE AND c.max_capacity <> 6`);
        console.log('Migration 080: capacidad Reformer forzada a 6 (schedules + clases futuras).');
    } catch (e) { console.error('Migration 080 error:', e); }

    // Migration 081: método de pago en egresos (para que el corte de caja reste los
    // egresos pagados EN EFECTIVO dentro del turno). La tabla ya tiene shift_id; faltaba
    // saber si el egreso salió de la caja en efectivo. Default 'cash' (lo más común).
    try {
        await query(`ALTER TABLE egresos ADD COLUMN IF NOT EXISTS payment_method VARCHAR(20) DEFAULT 'cash'`);
        console.log('Migration 081: egresos.payment_method agregado.');
    } catch (e) { console.error('Migration 081 error:', e); }

    // Migration 082: foto real de Jaqui y Sofi Maes en su ficha (instructors.photo_url). Antes estaban
    // en NULL ("Foto pronto"); ya se subieron sus fotos (Fotos_mayo). Solo setea si está en NULL para
    // no pisar una foto que el admin/coach haya subido después. Idempotente.
    try {
        const COACH_PHOTOS: Array<[string, string]> = [
            ['Jaqui', '/coaches/jaqui.jpg'],
            ['Sofi Maes', '/coaches/sofi-maes.jpg'],
        ];
        for (const [name, photo] of COACH_PHOTOS) {
            await query(
                `UPDATE instructors SET photo_url = $2, updated_at = NOW()
                 WHERE display_name = $1 AND (photo_url IS NULL OR photo_url = '')`,
                [name, photo]
            );
        }
        console.log('Migration 082: fotos de Jaqui y Sofi Maes cargadas en su ficha.');
    } catch (e) { console.error('Migration 082 error:', e); }

    // Migration 083: backfill de teléfono + fecha de nacimiento de clientas migradas de Fitune
    // (datos preparados en data/fitune-backfill.ts). Solo llena lo VACÍO; nunca pisa datos buenos.
    // Run-once. OJO: solo cubre a quienes traían teléfono en el export; faltan muchas (el export de
    // Fitune vino sin teléfono para la mayoría) → esas requieren un export completo.
    try {
        const done = await queryOne<{ x: number }>(`SELECT 1 AS x FROM system_settings WHERE key='migration_083_fitune_contact_backfill'`);
        if (!done) {
            let ph = 0, db = 0;
            for (const [id, phone] of PHONE_BACKFILL) {
                const r = await query(
                    `UPDATE users SET phone = $2, updated_at = NOW()
                     WHERE id = $1 AND (phone IS NULL OR phone = '' OR phone ~ '^0+$') RETURNING id`,
                    [id, phone]
                );
                ph += r.length;
            }
            for (const [id, dob] of DOB_BACKFILL) {
                const r = await query(
                    `UPDATE users SET date_of_birth = $2::date, updated_at = NOW()
                     WHERE id = $1 AND date_of_birth IS NULL RETURNING id`,
                    [id, dob]
                );
                db += r.length;
            }
            await query(`INSERT INTO system_settings (key, value) VALUES ('migration_083_fitune_contact_backfill', '"done"'::jsonb) ON CONFLICT (key) DO NOTHING`);
            console.log(`Migration 083: backfill Fitune — teléfonos: ${ph}, fechas de nac.: ${db}.`);
        }
    } catch (e) { console.error('Migration 083 error:', e); }

    // Migration 084: backfill COMPLETO de teléfono + fecha de nac. de clientas de Fitune, por EMAIL.
    // Datos sacados leyendo ficha por ficha en Fitune (data/fitune-contact-backfill.ts): 309 teléfonos
    // (incluye a Michelle Aguilar y a las que el export venía SIN número) + 146 fechas con año real.
    // Empata por email (case-insensitive) y SOLO llena lo vacío/placeholder; nunca pisa un dato bueno.
    // Run-once. Reemplaza el hueco que dejó la 083 (el export viejo no traía casi teléfonos).
    try {
        const done = await queryOne<{ x: number }>(`SELECT 1 AS x FROM system_settings WHERE key='migration_084_fitune_email_backfill'`);
        if (!done) {
            let ph = 0, db = 0;
            for (const [email, phone] of PHONE_BY_EMAIL) {
                const r = await query(
                    `UPDATE users SET phone = $2, updated_at = NOW()
                     WHERE lower(email) = lower($1)
                       AND (phone IS NULL OR phone = '' OR phone ~ '^[+]?0' OR phone LIKE '00000%') RETURNING id`,
                    [email, phone]
                );
                ph += r.length;
            }
            for (const [email, dob] of DOB_BY_EMAIL) {
                const r = await query(
                    `UPDATE users SET date_of_birth = $2::date, updated_at = NOW()
                     WHERE lower(email) = lower($1) AND date_of_birth IS NULL RETURNING id`,
                    [email, dob]
                );
                db += r.length;
            }
            await query(`INSERT INTO system_settings (key, value) VALUES ('migration_084_fitune_email_backfill', '"done"'::jsonb) ON CONFLICT (key) DO NOTHING`);
            console.log(`Migration 084: backfill Fitune por email — teléfonos: ${ph}, fechas de nac.: ${db}.`);
        }
    } catch (e) { console.error('Migration 084 error:', e); }

    // Migration 085: reconciliación de membresías con Fitune (fuente de verdad). Había alumnas con la
    // membresía MIGRADA todavía activa en BMB que en Fitune ya están como "Ex-plan de una vez". Se
    // verificó ficha por ficha en Fitune (jun 2026) → 18 emails en data/fitune-inactive-members.ts.
    // SEGURIDAD: solo toca membresías con is_migration=true Y status='active' (jamás una compra
    // orgánica nueva del cliente). Empata por email. Las pasa a 'expired'. Run-once.
    try {
        const done = await queryOne<{ x: number }>(`SELECT 1 AS x FROM system_settings WHERE key='migration_085_fitune_membership_reconcile'`);
        if (!done) {
            const r = await query(
                `UPDATE memberships SET
                    status = 'expired',
                    migration_notes = COALESCE(migration_notes, '') || ' | Reconciliación: inactiva en Fitune (jun 2026)',
                    updated_at = NOW()
                 WHERE is_migration = true AND status = 'active'
                   AND user_id IN (SELECT id FROM users WHERE lower(email) = ANY($1::text[]))
                 RETURNING id`,
                [FITUNE_INACTIVE_EMAILS]
            );
            await query(`INSERT INTO system_settings (key, value) VALUES ('migration_085_fitune_membership_reconcile', '"done"'::jsonb) ON CONFLICT (key) DO NOTHING`);
            console.log(`Migration 085: reconciliación membresías Fitune — expiradas ${r.length} de ${FITUNE_INACTIVE_EMAILS.length} candidatas (solo is_migration=true activas).`);
        }
    } catch (e) { console.error('Migration 085 error:', e); }

    // Migration 086: corrige start_date de membresías migradas. La migración original puso
    // start_date = día de la migración (14-jun-2026) en las 223 migradas (bug: no se pasaba la fecha
    // real). Aquí se pone la fecha real "Cliente desde" de Fitune (data/fitune-start-dates.ts, 220 de
    // 223; falta solo ojitosbonitos885 por colisión de email). SEGURIDAD: solo toca is_migration=true cuyo
    // start_date siga siendo el día de migración (13/14/15-jun) — no pisa fechas ya corregidas. Run-once.
    try {
        const done = await queryOne<{ x: number }>(`SELECT 1 AS x FROM system_settings WHERE key='migration_086_fitune_start_dates'`);
        if (!done) {
            let n = 0;
            for (const [email, realDate] of REAL_START_BY_EMAIL) {
                const r = await query(
                    `UPDATE memberships m SET start_date = $2::date, updated_at = NOW()
                     FROM users u
                     WHERE m.user_id = u.id AND lower(u.email) = lower($1)
                       AND m.is_migration = true
                       AND m.start_date IN (DATE '2026-06-13', DATE '2026-06-14', DATE '2026-06-15')
                     RETURNING m.id`,
                    [email, realDate]
                );
                n += r.length;
            }
            await query(`INSERT INTO system_settings (key, value) VALUES ('migration_086_fitune_start_dates', '"done"'::jsonb) ON CONFLICT (key) DO NOTHING`);
            console.log(`Migration 086: start_date real corregido en ${n} membresías migradas (de ${REAL_START_BY_EMAIL.length} fechas).`);
        }
    } catch (e) { console.error('Migration 086 error:', e); }

    // Migration 087: completa la última membresía que la 086 no cubrió. La clienta "Dulce Gomez frias"
    // usa ojitosbonitos885@gmail.com en BMB pero dulgom76@gmail.com en Fitune (misma persona, confirmado
    // por la dueña) → su alta real es 2025-05-07. Solo toca si sigue en día de migración. Run-once.
    try {
        const done = await queryOne<{ x: number }>(`SELECT 1 AS x FROM system_settings WHERE key='migration_087_dulce_start'`);
        if (!done) {
            const r = await query(
                `UPDATE memberships m SET start_date = DATE '2025-05-07', updated_at = NOW()
                 FROM users u
                 WHERE m.user_id = u.id AND lower(u.email) = 'ojitosbonitos885@gmail.com'
                   AND m.is_migration = true
                   AND m.start_date IN (DATE '2026-06-13', DATE '2026-06-14', DATE '2026-06-15')
                 RETURNING m.id`
            );
            await query(`INSERT INTO system_settings (key, value) VALUES ('migration_087_dulce_start', '"done"'::jsonb) ON CONFLICT (key) DO NOTHING`);
            console.log(`Migration 087: start_date de Dulce (ojitosbonitos885) → 2025-05-07 (${r.length} fila).`);
        }
    } catch (e) { console.error('Migration 087 error:', e); }

    // Migration 088: reconciliación de CRÉDITOS con Fitune (clientas marcadas por recepción cuyos
    // créditos en BMB no cuadran porque siguieron usando Fitune tras la migración). Lista en
    // data/fitune-credit-fixes.ts: [email, reformer, multi, genérico]. SOLO toca is_migration=true y
    // status='active'; empata por email. Run-once (cada lote nuevo = migración nueva).
    try {
        const done = await queryOne<{ x: number }>(`SELECT 1 AS x FROM system_settings WHERE key='migration_088_credit_reconcile'`);
        if (!done) {
            let n = 0;
            for (const [email, ref, multi, gen] of CREDIT_FIXES) {
                const r = await query(
                    `UPDATE memberships m SET reformer_remaining=$2, multi_remaining=$3, classes_remaining=$4, updated_at=NOW()
                     FROM users u
                     WHERE m.user_id=u.id AND lower(u.email)=lower($1)
                       AND m.is_migration=true AND m.status='active'
                     RETURNING m.id`,
                    [email, ref, multi, gen]
                );
                n += r.length;
            }
            await query(`INSERT INTO system_settings (key, value) VALUES ('migration_088_credit_reconcile', '"done"'::jsonb) ON CONFLICT (key) DO NOTHING`);
            console.log(`Migration 088: créditos reconciliados — ${n} de ${CREDIT_FIXES.length} membresías.`);
        }
    } catch (e) { console.error('Migration 088 error:', e); }

    // Migration 089: reconciliación de clientas marcadas por el dueño/recepción (solo estas 2).
    //  (a) Yael Curiel: en Fitune es "Mixto reformer 3, 14 créditos" (= SOLO reformer, regla de Vale);
    //      en BMB tenía ref14+multi14 (doble crédito y podía reservar multi) -> reformer=14, multi=0.
    //  (b) Lissete Villalba: socia ACTIVA en Fitune (Mixto reformer 1 = 6 reformer + Mixto 1 = 6 multi,
    //      15-jun→15-jul, transferencia) pero SIN membresía en BMB -> se le crea su Mixta 12 (6/6).
    //  Empata por email; guarda NOT EXISTS para no duplicar. Run-once vía marker migration_089_reconcile_v3.
    try {
        const done = await queryOne<{ x: number }>(`SELECT 1 AS x FROM system_settings WHERE key='migration_089_reconcile_v3'`);
        if (!done) {
            // (a) Yael Curiel — Mixto reformer 3 = solo reformer, 14 créditos
            const a = await query(
                `UPDATE memberships m SET reformer_remaining=14, multi_remaining=0, classes_remaining=14, updated_at=NOW()
                 FROM users u
                 WHERE m.user_id=u.id AND lower(u.email)='yacmaa@hotmail.com'
                   AND m.is_migration=true AND m.status='active'`
            );
            // (b) Lissete Villalba — crear su membresía Mixta 12 (6 reformer + 6 multi) si no tiene ninguna
            const b = await query(
                `INSERT INTO memberships (user_id, plan_id, status, start_date, end_date,
                     reformer_remaining, multi_remaining, classes_remaining, payment_method, is_migration, migration_notes)
                 SELECT u.id, 'cb6913c6-1d1c-4d2f-8310-ead7a752f07e', 'active', '2026-06-15', '2026-07-15',
                     6, 6, 12, 'transfer', true, 'Migración Fitune (Mixto reformer 1+Mixto 1)'
                 FROM users u
                 WHERE lower(u.email)='lizza.vo31@gmail.com'
                   AND NOT EXISTS (SELECT 1 FROM memberships m WHERE m.user_id=u.id)
                 RETURNING id`
            );
            await query(`INSERT INTO system_settings (key, value) VALUES ('migration_089_reconcile_v3', '"done"'::jsonb) ON CONFLICT (key) DO NOTHING`);
            console.log(`Migration 089: Yael créditos (${a.length}); Lissete membresía creada (${b.length}).`);
        }
    } catch (e) { console.error('Migration 089 error:', e); }

    // Migration 090: reconciliación de CRÉDITOS marcada por recepción (Vale), verificada 1×1 en Fitune.
    // [email, reformer, multi]. SOLO toca is_migration=true + status='active'; empata por email. Run-once.
    try {
        const done = await queryOne<{ x: number }>(`SELECT 1 AS x FROM system_settings WHERE key='migration_090_credit_reconcile'`);
        if (!done) {
            const fixes: Array<[string, number, number]> = [
                ['erika021181@hotmail.com', 5, 0],  // Erika Zavala — Fitune Reformer 3: 5 de 12 (BMB tenía 4)
                ['ximenabizzle@hotmail.com', 0, 7], // Ximena Díaz — Multiclases 3: 7 de 12 (BMB tenía 6)
                ['dania_yaz@hotmail.com', 1, 0],    // Nadia Godínez — Mixto reformer 3: 1 de 10 (clase jue cancelada; BMB 0)
                ['paridcha@hotmail.com', 5, 6],     // Paola Chacón — Mixto reformer 1: 5 + Mixto 1: 6 (BMB ref 6)
                ['mafervt06@gmail.com', 0, 5],      // Mª Fernanda Villanueva — Multiclases 2: 5 de 8 (BMB tenía 6)
            ];
            let n = 0;
            for (const [email, ref, multi] of fixes) {
                const r = await query(
                    `UPDATE memberships m SET reformer_remaining=$2, multi_remaining=$3,
                        classes_remaining = (COALESCE($2,0) + COALESCE($3,0)), updated_at=NOW()
                     FROM users u
                     WHERE m.user_id=u.id AND lower(u.email)=lower($1)
                       AND m.is_migration=true AND m.status='active'
                     RETURNING m.id`,
                    [email, ref, multi]
                );
                n += r.length;
            }
            await query(`INSERT INTO system_settings (key, value) VALUES ('migration_090_credit_reconcile', '"done"'::jsonb) ON CONFLICT (key) DO NOTHING`);
            console.log(`Migration 090: créditos reconciliados (Vale) — ${n} de ${fixes.length}.`);
        }
    } catch (e) { console.error('Migration 090 error:', e); }

    // Migration 091: reconciliación GRANDE de los casos "reconciliar"/inmortales/ilimitados de la
    // auditoría, verificada 1×1 en Fitune (18-jun). Cada entrada: {email, ref, multi, plan?, end?}.
    // ref/multi=null => ilimitado. plan = reasignar plan_id (nombre correcto). end = fijar end_date
    // (arregla membresías "inmortales" sin vencimiento). SOLO is_migration=true + status='active';
    // empata por email. NO incluye a Alma ni Rodrigo (ya estaban correctos en Fitune). Run-once.
    try {
        const done = await queryOne<{ x: number }>(`SELECT 1 AS x FROM system_settings WHERE key='migration_091_recon_grande'`);
        if (!done) {
            const recon: Array<{ email: string; ref: number | null; multi: number | null; plan?: string; end?: string }> = [
                { email: 'vero.beriv@gmail.com', ref: 0, multi: 2 },                       // Multiclases 1 (2 multi) + Reformer 6 sub (0 ref)
                { email: 'elisatapiaco@gmail.com', ref: 2, multi: 0 },                     // Reformer 1 (2 ref) + Multiclases 1 (0 multi)
                { email: 'alessandravillalobos17@gmail.com', ref: 11, multi: 0, plan: '6c8a1e10-e97b-4a37-88fa-4191315c1fd0' }, // Reformer 3 11/12 -> Reformer 12
                { email: 'lilianfajardo720@gmail.com', ref: 5, multi: 5, plan: 'cb6913c6-1d1c-4d2f-8310-ead7a752f07e' },        // Mixto ref 1 (5)+Mixto 1 (5) -> Mixta 12
                { email: 'mfab2809@gmail.com', ref: 0, multi: 2 },                         // Multiclases 6 sub (2 multi)
                { email: 'monsert_12@hotmail.com', ref: 0, multi: 8, plan: 'b511c7f4-afda-472a-bb86-b30f086fbbc4' },           // Multiclases 3 8/12 -> Multi 12
                { email: 'yeslucero29@gmail.com', ref: 0, multi: 5, end: '2026-07-17' },   // Multiclases 2 (5 multi) + fin (era inmortal)
                { email: 'ashtorres0412@gmail.com', ref: 0, multi: 1, end: '2026-12-31' }, // Créditos Manuales (1) + fin (era inmortal)
                { email: 'danycis32@gmail.com', ref: null, multi: null, plan: 'fe978f7c-e7ea-4edc-b7f3-ac38e77c6418' },        // Full access ilimitado real -> plan Full access
                { email: 'garelizabeth2010@gmail.com', ref: null, multi: null, plan: 'fe978f7c-e7ea-4edc-b7f3-ac38e77c6418' }, // Full access
                { email: 'liliannallely13@gmail.com', ref: null, multi: null, plan: 'fe978f7c-e7ea-4edc-b7f3-ac38e77c6418' },  // Full access
            ];
            let n = 0;
            for (const r of recon) {
                const gen = (r.ref === null || r.multi === null) ? null : (r.ref + r.multi);
                const params: any[] = [r.email, r.ref, r.multi, gen];
                const sets = ['reformer_remaining=$2', 'multi_remaining=$3', 'classes_remaining=$4', 'updated_at=NOW()'];
                if (r.plan) { params.push(r.plan); sets.push(`plan_id=$${params.length}`); }
                if (r.end) { params.push(r.end); sets.push(`end_date=$${params.length}`); }
                const res = await query(
                    `UPDATE memberships m SET ${sets.join(', ')}
                     FROM users u
                     WHERE m.user_id=u.id AND lower(u.email)=lower($1)
                       AND m.is_migration=true AND m.status='active'
                     RETURNING m.id`,
                    params
                );
                n += res.length;
            }
            await query(`INSERT INTO system_settings (key, value) VALUES ('migration_091_recon_grande', '"done"'::jsonb) ON CONFLICT (key) DO NOTHING`);
            console.log(`Migration 091: reconciliación grande — ${n} de ${recon.length} membresías.`);
        }
    } catch (e) { console.error('Migration 091 error:', e); }

    // Migration 092: Frida Ramirez (frystef_26) — en Fitune su Reformer 1 ya está en 0 de 4 (sin
    // créditos), pero BMB marcaba reformer=1. Se pone en 0. SOLO is_migration=true + active. Run-once.
    // (Silvia Carrasco NO se toca: en Fitune tiene ref 1 + multi 0, idéntico a BMB; el "+1 multi" que
    //  pidió recepción no aparece en Fitune, queda pendiente de confirmar si es cortesía manual.)
    try {
        const done = await queryOne<{ x: number }>(`SELECT 1 AS x FROM system_settings WHERE key='migration_092_frida'`);
        if (!done) {
            const r = await query(
                `UPDATE memberships m SET reformer_remaining=0, multi_remaining=0, classes_remaining=0, updated_at=NOW()
                 FROM users u
                 WHERE m.user_id=u.id AND lower(u.email)='frystef_26@hotmail.com'
                   AND m.is_migration=true AND m.status='active'
                 RETURNING m.id`
            );
            await query(`INSERT INTO system_settings (key, value) VALUES ('migration_092_frida', '"done"'::jsonb) ON CONFLICT (key) DO NOTHING`);
            console.log(`Migration 092: Frida Ramirez créditos a 0 — ${r.length} membresía(s).`);
        }
    } catch (e) { console.error('Migration 092 error:', e); }

    // Migration 093: correcciones de crédito marcadas por el dueño, verificadas 1×1 en Fitune.
    // [email, reformer, multi]. SOLO is_migration=true + active. Run-once.
    try {
        const done = await queryOne<{ x: number }>(`SELECT 1 AS x FROM system_settings WHERE key='migration_093_credit'`);
        if (!done) {
            const fixes: Array<[string, number, number]> = [
                ['mynameisale.03@gmail.com', 0, 6],   // Alejandra Carrillo Vargas — Multiclases 3: 6 de 12 (BMB tenía multi 7)
                ['arellanoelena145@gmail.com', 2, 2], // Maria Elena Arellano — Mixto reformer 1: 2 + Mixto 1: 2 (BMB tenía ref 3/multi 4)
            ];
            let n = 0;
            for (const [email, ref, multi] of fixes) {
                const r = await query(
                    `UPDATE memberships m SET reformer_remaining=$2, multi_remaining=$3,
                        classes_remaining=(COALESCE($2,0)+COALESCE($3,0)), updated_at=NOW()
                     FROM users u
                     WHERE m.user_id=u.id AND lower(u.email)=lower($1)
                       AND m.is_migration=true AND m.status='active'
                     RETURNING m.id`,
                    [email, ref, multi]
                );
                n += r.length;
            }
            await query(`INSERT INTO system_settings (key, value) VALUES ('migration_093_credit', '"done"'::jsonb) ON CONFLICT (key) DO NOTHING`);
            console.log(`Migration 093: créditos — ${n} de ${fixes.length}.`);
        }
    } catch (e) { console.error('Migration 093 error:', e); }

    // Migration 094: crear la reserva de Yessica Ariadna (ariadnaguerrero48607) que faltaba en BMB.
    // En Fitune tiene Hot Sculpt domingo 21-jun 9am San Miguel (su Oferta Inicial/clase muestra).
    // Reserva estilo migración (is_migration=true, sin descuento de crédito, como Fase 2) + sube el
    // cupo. Guarda NOT EXISTS para no duplicar. Run-once. (clase b57d8937 = Hot Sculpt 21-jun SM.)
    try {
        const done = await queryOne<{ x: number }>(`SELECT 1 AS x FROM system_settings WHERE key='migration_094_yessica_booking'`);
        if (!done) {
            const ins = await query(
                `INSERT INTO bookings (class_id, user_id, status, is_migration)
                 SELECT 'b57d8937-496f-4e07-88d9-1d89d2f0244d', '63b28b2d-ed7c-49b1-ba18-937e328af8fe', 'confirmed', true
                 WHERE NOT EXISTS (
                   SELECT 1 FROM bookings WHERE class_id='b57d8937-496f-4e07-88d9-1d89d2f0244d' AND user_id='63b28b2d-ed7c-49b1-ba18-937e328af8fe'
                 )
                 RETURNING id`
            );
            if (ins.length > 0) {
                await query(`UPDATE classes SET current_bookings = current_bookings + 1, updated_at=NOW() WHERE id='b57d8937-496f-4e07-88d9-1d89d2f0244d'`);
            }
            await query(`INSERT INTO system_settings (key, value) VALUES ('migration_094_yessica_booking', '"done"'::jsonb) ON CONFLICT (key) DO NOTHING`);
            console.log(`Migration 094: reserva de Yessica creada (${ins.length}).`);
        }
    } catch (e) { console.error('Migration 094 error:', e); }

    // Migration 095: Fernanda Almaraz (mfab2809) — su membresía quedó como plan 'Multi full'
    // (ilimitado) pero ella compró Multiclases de 30; en Fitune le queda 1 crédito. Se reasigna el
    // plan a 'Multi 30' (finito) y se fija multi=1. Guarda: solo si sigue en 'Multi full'. Run-once.
    try {
        const done = await queryOne<{ x: number }>(`SELECT 1 AS x FROM system_settings WHERE key='migration_095_fernanda_multi30'`);
        if (!done) {
            const r = await query(
                `UPDATE memberships m SET plan_id='bfd56e8c-dcad-45d5-9e98-0cf42ab78c93',
                     reformer_remaining=0, multi_remaining=1, classes_remaining=1, updated_at=NOW()
                 FROM users u, plans p
                 WHERE m.user_id=u.id AND m.plan_id=p.id AND lower(u.email)='mfab2809@gmail.com'
                   AND m.is_migration=true AND m.status='active' AND p.name='Multi full'
                 RETURNING m.id`
            );
            await query(`INSERT INTO system_settings (key, value) VALUES ('migration_095_fernanda_multi30', '"done"'::jsonb) ON CONFLICT (key) DO NOTHING`);
            console.log(`Migration 095: Fernanda Almaraz → Multi 30 / multi 1 (${r.length}).`);
        }
    } catch (e) { console.error('Migration 095 error:', e); }

    // Migration 096: método de pago 'gratis' (cortesía $0) para membresías. ADD VALUE no puede ir
    // dentro de una transacción, así que va como query suelto e idempotente (IF NOT EXISTS).
    try {
        await query(`ALTER TYPE payment_method ADD VALUE IF NOT EXISTS 'gratis'`);
        console.log('Migration 096: payment_method enum extendido con \'gratis\'.');
    } catch (e: any) { console.error('Migration 096 error:', e.message); }

    // Migración: planes INTERNOS de plataformas (Totalpass / Wellhub / Fitpass) para llevar control
    // de los alumnos que vienen de esas plataformas. Sin precio, NO visibles para clientes
    // (is_internal=true → solo admin y recepción los ven/asignan), créditos ilimitados para que
    // puedan reservar cualquier clase, e identificados por COLOR en las reservas.
    try {
        await query(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS is_internal BOOLEAN DEFAULT false`);
        await query(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS color VARCHAR(7)`);
        const seeded = await queryOne<{ x: number }>(`SELECT 1 AS x FROM system_settings WHERE key='migration_internal_platform_plans_v1'`);
        if (!seeded) {
            const internalPlans: Array<[string, string]> = [
                ['Totalpass', '#16A34A'], // verde
                ['Wellhub', '#DB2777'],   // rosa
                ['Fitpass', '#2563EB'],   // azul
            ];
            for (const [name, color] of internalPlans) {
                await query(
                    `INSERT INTO plans (name, description, price, currency, duration_days,
                        class_limit, reformer_credits, multi_credits, is_active, is_internal, color, sort_order)
                     SELECT $1, $2, 0, 'MXN', 365, 24, 12, 12, true, true, $3, 900
                      WHERE NOT EXISTS (SELECT 1 FROM plans WHERE name = $1)`,
                    [name, `Plan interno de plataforma (${name}). Control de alumnos; sin precio y no visible para clientes.`, color]
                );
            }
            await query(`INSERT INTO system_settings (key, value) VALUES ('migration_internal_platform_plans_v1', '"done"'::jsonb) ON CONFLICT (key) DO NOTHING`);
            console.log('Migration: planes internos Totalpass/Wellhub/Fitpass listos.');
        }
    } catch (e: any) { console.error('Migration internal_platform_plans error:', e.message); }

    // Migración: los planes internos de plataforma tienen TOPE de 12 visitas por tipo
    // (12 Reformer + 12 Multi) — antes se sembraron como ilimitado (NULL). Corrige los planes
    // y las membresías ya asignadas que quedaron en ilimitado. Idempotente (flag).
    try {
        const done = await queryOne<{ x: number }>(`SELECT 1 AS x FROM system_settings WHERE key='migration_internal_plans_12_credits_v1'`);
        if (!done) {
            await query(
                `UPDATE plans SET reformer_credits = 12, multi_credits = 12, class_limit = 24
                  WHERE is_internal = true AND name IN ('Totalpass','Wellhub','Fitpass')`
            );
            // Membresías activas asignadas mientras el plan era ilimitado (remaining NULL) → 12/12.
            await query(
                `UPDATE memberships m
                    SET reformer_remaining = 12, multi_remaining = 12
                   FROM plans p
                  WHERE m.plan_id = p.id AND p.is_internal = true
                    AND p.name IN ('Totalpass','Wellhub','Fitpass')
                    AND m.status = 'active'
                    AND (m.reformer_remaining IS NULL OR m.multi_remaining IS NULL)`
            );
            await query(`INSERT INTO system_settings (key, value) VALUES ('migration_internal_plans_12_credits_v1', '"done"'::jsonb) ON CONFLICT (key) DO NOTHING`);
            console.log('Migration: planes internos con 12 créditos por tipo (Reformer/Multi).');
        }
    } catch (e: any) { console.error('Migration internal_plans_12_credits error:', e.message); }

    // Migration 097: bookings.cancelled_by — quién canceló la reserva (NULL = la clienta misma)
    try {
        await query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES users(id)`);
        console.log('Migration 097: bookings.cancelled_by ready.');
    } catch (e: any) { console.error('Migration 097 error:', e.message); }

    // Migration 098: bookings.folio — folio secuencial automático y buscable por reserva.
    // Columna + secuencia + backfill determinista (orden de creación) sobre los NULL,
    // luego setval para que la secuencia continúe tras el MAX actual, DEFAULT y UNIQUE index.
    // Los INSERT a bookings NO listan folio → el DEFAULT lo asigna solo. Idempotente.
    try {
        await query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS folio BIGINT`);
        await query(`CREATE SEQUENCE IF NOT EXISTS bookings_folio_seq`);
        // Backfill determinista de los NULL en orden de creación. Arranca después del MAX
        // existente (si ya hubiera folios > 0) para no colisionar con el UNIQUE index.
        await query(`
            WITH ordered AS (
                SELECT id, row_number() OVER (ORDER BY created_at, id) AS rn
                  FROM bookings
                 WHERE folio IS NULL
            )
            UPDATE bookings b
               SET folio = COALESCE((SELECT MAX(folio) FROM bookings), 0) + o.rn
              FROM ordered o
             WHERE b.id = o.id`);
        // setval con valor >= 1 siempre (0 es inválido); is_called=false cuando no hay
        // reservas para que el primer nextval devuelva 1 (BD vacía no truena).
        await query(`SELECT setval('bookings_folio_seq', GREATEST(COALESCE((SELECT MAX(folio) FROM bookings), 0), 1), COALESCE((SELECT MAX(folio) FROM bookings), 0) <> 0)`);
        await query(`ALTER TABLE bookings ALTER COLUMN folio SET DEFAULT nextval('bookings_folio_seq')`);
        await query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_folio ON bookings(folio)`);
        console.log('Migration 098: bookings.folio (secuencia + backfill + default + unique) ready.');
    } catch (e: any) { console.error('Migration 098 error:', e.message); }

    // Migration 099: Vero no veía sus clases en el portal de coach. Causa: registro 'Vero'
    // DUPLICADO — sus clases (Pole) quedaron sembradas en un 'Vero' sin login mientras su
    // cuenta quedó ligada a OTRO 'Vero'. Reasignamos clases/horarios del 'Vero' SIN user_id
    // al 'Vero' CON user_id (su login), y desactivamos el sobrante (que ya no posee nada).
    // Idempotente y seguro: solo actúa si existen ambos (con y sin login); no-op en otro caso.
    try {
        const canonical = await queryOne<{ id: string }>(
            `SELECT id FROM instructors WHERE display_name = 'Vero' AND user_id IS NOT NULL
             ORDER BY created_at NULLS FIRST LIMIT 1`
        );
        if (canonical) {
            const res = await query<{ classes: number; sched: number; deact: number }>(
                `WITH dups AS (
                     SELECT id FROM instructors
                      WHERE display_name = 'Vero' AND user_id IS NULL AND id <> $1
                 ),
                 moved_classes AS (
                     UPDATE classes SET instructor_id = $1, updated_at = NOW()
                      WHERE instructor_id IN (SELECT id FROM dups) RETURNING 1
                 ),
                 moved_sched AS (
                     UPDATE schedules SET instructor_id = $1, updated_at = NOW()
                      WHERE instructor_id IN (SELECT id FROM dups) RETURNING 1
                 ),
                 deact AS (
                     UPDATE instructors SET is_active = false, visible_public = false, updated_at = NOW()
                      WHERE id IN (SELECT id FROM dups) RETURNING 1
                 )
                 SELECT (SELECT count(*) FROM moved_classes)::int AS classes,
                        (SELECT count(*) FROM moved_sched)::int   AS sched,
                        (SELECT count(*) FROM deact)::int         AS deact`,
                [canonical.id]
            );
            const row = res[0];
            console.log(`Migration 099: 'Vero' consolidada en su registro con login (clases: ${row?.classes ?? 0}, horarios: ${row?.sched ?? 0}, duplicados desactivados: ${row?.deact ?? 0}).`);
        } else {
            console.log("Migration 099: no hay 'Vero' con login para consolidar (no-op).");
        }
    } catch (e: any) { console.error('Migration 099 error:', e.message); }

    // Migration 101: DESHACER el backfill que marcó como 'completed' clases pasadas SIN
    // reservas (un intento previo de "contar todas las clases impartidas"). Eso ensuciaba
    // el historial del coach y los reportes con slots fantasma que el estudio no corrió, y
    // de todos modos la nómina exige reservas, así que no se pagaban. Volvemos a 'scheduled'
    // exactamente las que no tienen ninguna reserva no cancelada (deja intactas las reales).
    // Idempotente; no-op si el backfill nunca corrió. Ver #188 / coach-payroll.
    try {
        const r = await query(`
            UPDATE classes
            SET status = 'scheduled', updated_at = NOW()
            WHERE status = 'completed'
              AND (date + end_time) < (NOW() AT TIME ZONE 'America/Mexico_City')
              AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.class_id = classes.id AND b.status <> 'cancelled')
            RETURNING id`);
        console.log(`Migration 101: ${r.length} clase(s) vacía(s) revertida(s) de completed→scheduled (deshace backfill).`);
    } catch (e: any) { console.error('Migration 101 error:', e.message); }

    // Migration 077: quitar la foto equivocada de Vero. Su photo_url apuntaba a '/coaches/vero.jpg',
    // que en realidad es una foto de Nicki (mismo shoot), así que su ficha mostraba a Nicki. Se pone
    // en NULL para que muestre "Foto pronto" (igual que su tarjeta) hasta tener su foto real.
    // Run-once (marca en system_settings) para no pisar una foto real que se suba después.
    try {
        const done = await queryOne<{ x: number }>(`SELECT 1 AS x FROM system_settings WHERE key='migration_077_vero_photo_fix'`);
        if (!done) {
            await query(`UPDATE instructors SET photo_url = NULL, updated_at = NOW() WHERE display_name = 'Vero' AND photo_url = '/coaches/vero.jpg'`);
            await query(`INSERT INTO system_settings (key, value) VALUES ('migration_077_vero_photo_fix', '"done"'::jsonb) ON CONFLICT (key) DO NOTHING`);
            console.log('Migration 077: foto equivocada de Vero quitada (mostraba a Nicki).');
        }
    } catch (e) { console.error('Migration 077 error:', e); }

    // Migration 079: alta de recepción MASTER con contraseña TEMPORAL (dcasaola@gmail.com e
    // ilsemarianacortespaul62@gmail.com). temp_password=true → al primer ingreso completan sus datos
    // (nombre + teléfono) y fijan su contraseña nueva (POST /auth/complete-onboarding). Permisos =
    // PRESET_MASTER. Run-once. Los hashes son de contraseñas temporales de un solo uso (el plaintext
    // NO va en el repo; se comparte aparte). Si el correo ya existe y NO es admin/super_admin, se
    // promueve a recepción master; las cuentas admin/super_admin no se tocan (ni rol, ni contraseña,
    // ni permisos).
    try {
        const done = await queryOne<{ x: number }>(`SELECT 1 AS x FROM system_settings WHERE key='migration_079_reception_masters'`);
        if (!done) {
            await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS temp_password BOOLEAN DEFAULT false`);
            const masters: Array<[string, string]> = [
                ['dcasaola@gmail.com', '$2a$12$Q8C7OtXw7goNXdADZffmoe2.OuPTZIECe1TQjZ.lyHYD1iYQDpwV6'],
                ['ilsemarianacortespaul62@gmail.com', '$2a$12$Kjx6IHPxv72kim167UqPEOZ6aA3u/HlRxkrh.KlD3NkgNmX.aHBMW'],
            ];
            for (const [email, hash] of masters) {
                await query(
                    `INSERT INTO users (email, phone, display_name, password_hash, role, is_reception_master, permissions, temp_password, is_active)
                     VALUES ($3, '0000000000', 'Recepción', $1, 'reception', true, $2::jsonb, true, true)
                     ON CONFLICT (email) DO UPDATE SET
                         role = CASE WHEN users.role IN ('admin', 'super_admin') THEN users.role ELSE 'reception' END,
                         is_reception_master = CASE WHEN users.role IN ('admin', 'super_admin') THEN users.is_reception_master ELSE true END,
                         permissions = CASE WHEN users.role IN ('admin', 'super_admin') THEN users.permissions ELSE $2::jsonb END,
                         temp_password = CASE WHEN users.role IN ('admin', 'super_admin') THEN users.temp_password ELSE true END,
                         password_hash = CASE WHEN users.role IN ('admin', 'super_admin') THEN users.password_hash ELSE $1 END,
                         is_active = true,
                         updated_at = NOW()`,
                    [hash, JSON.stringify(PRESET_MASTER), email]
                );
            }
            await query(`INSERT INTO system_settings (key, value) VALUES ('migration_079_reception_masters', '"done"'::jsonb) ON CONFLICT (key) DO NOTHING`);
            console.log('Migration 079: recepción master(s) listas (contraseña temporal): dcasaola, ilsemarianacortespaul62.');
        }
    } catch (e) { console.error('Migration 079 error:', e); }

    // Migration 023f: extend loyalty_points_type enum for new bonus categories
    try {
        await query(`ALTER TYPE loyalty_points_type ADD VALUE IF NOT EXISTS 'welcome'`);
        await query(`ALTER TYPE loyalty_points_type ADD VALUE IF NOT EXISTS 'package_purchase'`);
        await query(`ALTER TYPE loyalty_points_type ADD VALUE IF NOT EXISTS 'birthday'`);
        await query(`ALTER TYPE loyalty_points_type ADD VALUE IF NOT EXISTS 'anniversary'`);
        await query(`ALTER TYPE loyalty_points_type ADD VALUE IF NOT EXISTS 'streak'`);
        console.log('Migration 023f: loyalty_points_type enum extended.');
    } catch (e: any) { console.error('Migration 023f error:', e.message); }

    // Migration 023e: track referral lineage on users
    try {
        await query(`ALTER TABLE users
            ADD COLUMN IF NOT EXISTS referred_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL`);
        console.log('Migration 023e: users.referred_by_user_id ready.');
    } catch (e) { console.error('Migration 023e error:', e); }

    // Migration 023d: loyalty_points needs related_order_id for referral / package events
    try {
        await query(`ALTER TABLE loyalty_points
            ADD COLUMN IF NOT EXISTS related_order_id UUID REFERENCES orders(id) ON DELETE SET NULL`);
        // Allow new event types
        console.log('Migration 023d: loyalty_points related_order_id ready.');
    } catch (e) { console.error('Migration 023d error:', e); }

    // Migration 023b: align loyalty_rewards columns with route handler expectations
    try {
        await query(`ALTER TABLE loyalty_rewards
            ADD COLUMN IF NOT EXISTS points_cost INT,
            ADD COLUMN IF NOT EXISTS stock INT`);
        // Backfill points_cost from points_required so old data keeps working
        await query(`UPDATE loyalty_rewards SET points_cost = points_required WHERE points_cost IS NULL`);
        console.log('Migration 023b: loyalty_rewards columns aligned.');
    } catch (e) { console.error('Migration 023b error:', e); }

    // Migration 022a: Fix payment_proofs column names
    try {
        await query(`ALTER TABLE payment_proofs
            ADD COLUMN IF NOT EXISTS mime_type VARCHAR(100),
            ADD COLUMN IF NOT EXISTS file_name VARCHAR(255),
            ADD COLUMN IF NOT EXISTS bank_reference VARCHAR(100),
            ADD COLUMN IF NOT EXISTS notes TEXT,
            ADD COLUMN IF NOT EXISTS reviewed_by UUID,
            ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS rejection_reason TEXT`);
        console.log('Migration 022a: payment_proofs columns patched.');
    } catch (e) { console.error('Migration 022a error:', e); }

    // Migration 022: MercadoPago columns on orders + payment_webhook_events table
    try {
        await query(`ALTER TABLE orders
            ADD COLUMN IF NOT EXISTS payment_provider VARCHAR(50),
            ADD COLUMN IF NOT EXISTS payment_intent_id VARCHAR(255),
            ADD COLUMN IF NOT EXISTS mp_checkout_url TEXT,
            ADD COLUMN IF NOT EXISTS mp_payment_id VARCHAR(255),
            ADD COLUMN IF NOT EXISTS mp_payment_status VARCHAR(50),
            ADD COLUMN IF NOT EXISTS mp_status_detail VARCHAR(100),
            ADD COLUMN IF NOT EXISTS provider_metadata JSONB,
            ADD COLUMN IF NOT EXISTS provider_synced_at TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
            ADD COLUMN IF NOT EXISTS admin_notes TEXT,
            ADD COLUMN IF NOT EXISTS reviewed_by UUID,
            ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS membership_id UUID`);
        await query(`CREATE TABLE IF NOT EXISTS payment_webhook_events (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            provider VARCHAR(50) NOT NULL,
            event_key VARCHAR(255) NOT NULL,
            event_type VARCHAR(50),
            payload JSONB DEFAULT '{}',
            processed_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(provider, event_key)
        )`);
        console.log('Migration 022: MercadoPago columns and payment_webhook_events table ready.');
    } catch (e) { console.error('Migration 022 error:', e); }

    // Migration 089: reviews — columnas que el INSERT de POST /reviews referencia pero
    // que faltaban en prod (punctuality_rating, would_recommend, would_repeat). Sin ellas,
    // TODA reseña enviada desde la app reventaba con "column does not exist" → 500 →
    // el cliente veía "Error al enviar" al calificar la clase/coach.
    try {
        await query(`ALTER TABLE reviews
            ADD COLUMN IF NOT EXISTS punctuality_rating SMALLINT,
            ADD COLUMN IF NOT EXISTS would_recommend BOOLEAN,
            ADD COLUMN IF NOT EXISTS would_repeat BOOLEAN`);
        console.log('Migration 089: reviews punctuality_rating/would_recommend/would_repeat columns ready.');
    } catch (e) { console.error('Migration 089 error:', e); }

    // Migration 090: CHECK(1-5) en reviews.punctuality_rating para igualar a los otros
    // ratings (overall/instructor/difficulty/ambiance ya lo tienen). Permite NULL (un
    // CHECK pasa con NULL). Guard en pg_constraint para que sea idempotente.
    try {
        await query(`DO $$ BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint
                WHERE conrelid = 'reviews'::regclass
                  AND conname = 'reviews_punctuality_rating_check'
            ) THEN
                ALTER TABLE reviews
                    ADD CONSTRAINT reviews_punctuality_rating_check
                    CHECK ((punctuality_rating >= 1) AND (punctuality_rating <= 5));
            END IF;
        END $$;`);
        console.log('Migration 090: reviews.punctuality_rating CHECK(1-5) ready.');
    } catch (e) { console.error('Migration 090 error:', e); }

    // Migration 091: classes.booking_closed — "cerrar" una clase sin cancelarla. Pone un
    // candado para que no entren nuevas reservas a ese horario (cuando no hay reservas).
    // false = abierta (default). Distinto de status='cancelled' (eso sí cancela + reembolsa).
    try {
        await query(`ALTER TABLE classes ADD COLUMN IF NOT EXISTS booking_closed BOOLEAN NOT NULL DEFAULT false`);
        console.log('Migration 091: classes.booking_closed ready.');
    } catch (e) { console.error('Migration 091 error:', e); }

    // Migration 092: bookings.booked_by — control de quién hizo la reserva. NULL = histórico
    // desconocido. Si booked_by = user_id → la alumna se reservó sola; si difiere → la hizo
    // ese staff (recepción/admin), y se muestra su nombre.
    try {
        await query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS booked_by UUID`);
        console.log('Migration 092: bookings.booked_by ready.');
    } catch (e) { console.error('Migration 092 error:', e); }

    // tagline editable del coach (frase corta de la tarjeta del landing)
    try {
        await query(`ALTER TABLE instructors ADD COLUMN IF NOT EXISTS tagline VARCHAR(200)`);
        console.log('Migration 093: instructors.tagline ready.');
    } catch (e) { console.error('Migration 093 error:', e); }

    // Migration 094: egresos.source_payout_id — vincula el egreso de nómina con el
    // coach_payout que lo generó. ON DELETE CASCADE: al des-marcar (borrar) el pago,
    // el egreso asociado se elimina solo y el reporte siempre cuadra con lo pagado.
    try {
        await query(`ALTER TABLE egresos ADD COLUMN IF NOT EXISTS source_payout_id UUID
            REFERENCES coach_payouts(id) ON DELETE CASCADE`);
        await query(`CREATE INDEX IF NOT EXISTS egresos_source_payout_idx
            ON egresos(source_payout_id) WHERE source_payout_id IS NOT NULL`);
        console.log('Migration 094: egresos.source_payout_id ready.');
    } catch (e) { console.error('Migration 094 error:', e); }

    // Migration 095: los códigos de referido ya NO dan descuento (la recompensa son los
    // puntos de lealtad de quien refiere). Pone en 0 el % de los códigos de referido
    // existentes; los nuevos ya se crean en 0 (ver routes/auth.ts). Idempotente.
    try {
        await query(`UPDATE discount_codes SET discount_value = 0
            WHERE is_referral = true AND discount_value <> 0`);
        console.log('Migration 095: referral codes discount zeroed.');
    } catch (e) { console.error('Migration 095 error:', e); }

    // Settings reales del estudio (idempotente). Corrige los placeholders stale de
    // la base clonada SIN pisar valores ya personalizados por el admin.
    //   - studio_info: rellena por-clave SOLO cuando está vacía o sigue siendo un
    //     placeholder conocido ('Catarsis Studio' / 'Balance Studio'); merge sobre el JSON.
    //   - bank_info: corrige al banco real SOLO si sigue siendo el placeholder
    //     stale (Balance Studio / BBVA / CLABE '012...'); si ya tiene Mercado Pago
    //     u otro valor real, NO lo toca.
    try {
        // 1) Si la fila no existe, sembrar los valores reales directamente.
        await query(
            `INSERT INTO system_settings (key, value, description)
             VALUES ('studio_info', $1::jsonb, 'Información del estudio')
             ON CONFLICT (key) DO NOTHING`,
            [JSON.stringify({
                name: 'BMB Studio',
                address: 'Calle Primero de Mayo 1, Diamante, 54763 Cuautitlán Izcalli, Méx.',
                phone: '5543860391',
                email: 'hola@bmbstudio.mx',
                website: '',
                description: '',
                social_media: { instagram: '@bmbstudio', facebook: '', whatsapp: '5543860391' },
            })]
        );
        // 2) Si la fila existe, merge por-clave SOLO sobre vacíos/null/placeholders stale.
        //    jsonb_set/COALESCE evita pisar lo que el admin ya personalizó.
        await query(
            `UPDATE system_settings SET value = value
                || jsonb_build_object(
                     'name', CASE WHEN COALESCE(value->>'name','') IN ('', 'Catarsis Studio', 'Balance Studio')
                                  THEN 'BMB Studio' ELSE value->>'name' END,
                     'address', CASE WHEN COALESCE(value->>'address','') = ''
                                  THEN 'Calle Primero de Mayo 1, Diamante, 54763 Cuautitlán Izcalli, Méx.' ELSE value->>'address' END,
                     'phone', CASE WHEN COALESCE(value->>'phone','') = ''
                                  THEN '5543860391' ELSE value->>'phone' END,
                     'email', CASE WHEN COALESCE(value->>'email','') = ''
                                  THEN 'hola@bmbstudio.mx' ELSE value->>'email' END,
                     'social_media', (COALESCE(value->'social_media','{}'::jsonb)
                        || jsonb_build_object(
                             'instagram', CASE WHEN COALESCE(value->'social_media'->>'instagram','') = ''
                                              THEN '@bmbstudio' ELSE value->'social_media'->>'instagram' END,
                             'whatsapp', CASE WHEN COALESCE(value->'social_media'->>'whatsapp','') = ''
                                              THEN '5543860391' ELSE value->'social_media'->>'whatsapp' END,
                             'facebook', COALESCE(value->'social_media'->>'facebook','')
                           ))
                   ),
                updated_at = NOW()
             WHERE key = 'studio_info'`
        );

        // bank_info: sembrar si falta.
        await query(
            `INSERT INTO system_settings (key, value, description)
             VALUES ('bank_info', $1::jsonb, 'Datos bancarios para transferencias')
             ON CONFLICT (key) DO NOTHING`,
            [JSON.stringify({
                bank_name: 'Mercado Pago',
                account_holder: 'Karla Ivonne Pérez García',
                account_number: '',
                clabe: '722969020755786887',
                reference_instructions: 'Usa tu nombre completo como referencia',
            })]
        );
        // Corregir SOLO si sigue siendo el placeholder stale de la base clonada.
        await query(
            `UPDATE system_settings SET value = $1::jsonb, updated_at = NOW()
             WHERE key = 'bank_info'
               AND (
                    value->>'bank_name' IN ('', 'Balance Studio', 'BBVA')
                 OR value->>'clabe' LIKE '012%'
                 OR value->>'account_holder' = 'Balance Studio S.A. de C.V.'
               )`,
            [JSON.stringify({
                bank_name: 'Mercado Pago',
                account_holder: 'Karla Ivonne Pérez García',
                account_number: '',
                clabe: '722969020755786887',
                reference_instructions: 'Usa tu nombre completo como referencia',
            })]
        );

        // El cache de settings es in-memory y está vacío en el arranque (corre antes
        // de aceptar tráfico), así que no hay nada que invalidar aquí.
        console.log('Settings: studio_info/bank_info reales asegurados (idempotente).');
    } catch (e) {
        console.error('Error asegurando settings reales (studio_info/bank_info):', e);
    }

    // Ensure admin@balanceroom.mx is the admin account
    try {
        const adminHash = '$2b$10$ELPrfYdYroo/URqPraoj9eWP7KfYNGZfEbFpYq8uYLN.tnfdQY15S';
        await query(
            `INSERT INTO users (email, password_hash, display_name, phone, role, is_active)
             VALUES ('admin@balanceroom.mx', $1, 'Admin', '0000000000', 'admin', true)
             ON CONFLICT (email) DO UPDATE
               SET password_hash = $1, role = 'admin', is_active = true`,
            [adminHash]
        );
        // Demote saidromero19@gmail.com to client if it was accidentally made admin
        await query(
            `UPDATE users SET role = 'client' WHERE email = 'saidromero19@gmail.com' AND role = 'admin'`
        );
        console.log('Admin account admin@balanceroom.mx ensured.');
    } catch (e) {
        console.error('Error ensuring admin account:', e);
    }

    // Migration 100: coach_payouts por PERIODO (mensual o quincenal). Agrega period_start/
    // period_end y reemplaza el índice único (que era por period_month) por uno sobre el
    // periodo real, para permitir dos quincenas dentro del mismo mes. Backfill: las filas
    // mensuales existentes toman start = period_month y end = fin de ese mes. Idempotente.
    try {
        await query(`ALTER TABLE coach_payouts ADD COLUMN IF NOT EXISTS period_start DATE`);
        await query(`ALTER TABLE coach_payouts ADD COLUMN IF NOT EXISTS period_end DATE`);
        await query(`UPDATE coach_payouts
                        SET period_start = period_month,
                            period_end   = (period_month + INTERVAL '1 month - 1 day')::date
                      WHERE period_start IS NULL OR period_end IS NULL`);
        await query(`DROP INDEX IF EXISTS coach_payouts_uniq`);
        await query(`CREATE UNIQUE INDEX IF NOT EXISTS coach_payouts_period_uniq
                        ON coach_payouts (instructor_id, period_start, period_end,
                                          COALESCE(facility_id, '00000000-0000-0000-0000-000000000000'::uuid))`);
        console.log('Migration 100: coach_payouts period_start/period_end ready.');
    } catch (e) { console.error('Migration 100 error:', e); }

    // Migration 102: inventario POR SUCURSAL. products.facility_id (antes el stock era
    // global y lo subido "de Tepa" aparecía en San Miguel). Backfill: los productos
    // existentes se asignan a Tepa (el admin subió inventario de Tepa). Idempotente.
    try {
        await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS facility_id UUID REFERENCES facilities(id)`);
        await query(`UPDATE products
                        SET facility_id = (SELECT id FROM facilities WHERE name = 'BMB Studio Tepa' LIMIT 1)
                      WHERE facility_id IS NULL`);
        await query(`CREATE INDEX IF NOT EXISTS products_facility_idx ON products(facility_id)`);
        console.log('Migration 102: products.facility_id (inventario por sucursal) ready.');
    } catch (e) { console.error('Migration 102 error:', e); }

    // Migration 103: renombrar el class_type 'Jumpboard' → 'Reformer Jumpboard'
    // (decisión de la dueña). Las clases referencian class_type_id, así que las clases
    // ya hechas y las futuras toman el nuevo nombre automáticamente. Corre después de la
    // Mig 071 (Cardio Reformer → Jumpboard), así que también cubre una BD nueva.
    // Idempotente por WHERE name.
    try {
        const r = await query(`UPDATE class_types SET name = 'Reformer Jumpboard', updated_at = NOW() WHERE name = 'Jumpboard' RETURNING 1`);
        if (r.length) console.log(`Migration 103: class_type Jumpboard → Reformer Jumpboard (${r.length}).`);
    } catch (e) { console.error('Migration 103 error:', e); }

    // === Onboarding Perfilador (Fase 2) ===
    try {
      await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ`);
      await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_required BOOLEAN NOT NULL DEFAULT true`);
      await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_invite_dismissed_at TIMESTAMPTZ`);

      await query(`CREATE TABLE IF NOT EXISTS onboarding_responses (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        answers JSONB NOT NULL,
        recommended_disciplines JSONB NOT NULL,
        recommended_experience JSONB,
        recommended_plan_id UUID,
        recommended_plan_name TEXT,
        health_flags JSONB,
        requires_clearance BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);

      // Backfill UNA sola vez: clientas existentes quedan invitadas, no bloqueadas.
      const backfilled = await queryOne<{ x: number }>(
        `SELECT 1 AS x FROM system_settings WHERE key='onboarding_backfill_v1'`
      );
      if (!backfilled) {
        await query(`UPDATE users SET onboarding_required = false WHERE created_at < NOW()`);
        await query(
          `INSERT INTO system_settings (key, value, description)
           VALUES ('onboarding_backfill_v1', 'true'::jsonb, 'Marca: backfill de onboarding_required ejecutado')
           ON CONFLICT (key) DO NOTHING`
        );
      }

      // Seed de reglas (no sobreescribe ediciones del admin).
      await query(
        `INSERT INTO system_settings (key, value, description)
         VALUES ('onboarding_recommendation_rules', $1::jsonb, 'Reglas del motor del onboarding perfilador (editables)')
         ON CONFLICT (key) DO NOTHING`,
        [JSON.stringify(ONBOARDING_DEFAULT_RULES)]
      );
      console.log('Onboarding Perfilador: columnas, tabla y reglas aseguradas.');
    } catch (e) { console.error('Onboarding Perfilador migration error:', e); }

    // ===========================================================================
    // Casa Shé v1 — catálogo, reglas y branding del estudio (CONSOLIDADO).
    // Corre AL FINAL, así gana sobre los seeds heredados de BMB/Balance Room.
    // Idempotente: el upsert solo toca filas Casa Shé; la limpieza del catálogo
    // viejo es de UNA sola vez (migration_flags) para no clobberear lo que la
    // admin cree después.
    // ===========================================================================
    try {
        const CS_PLANS = ['Clase de prueba', 'Drop-in', 'Paquete 5', 'Paquete 8', 'Paquete 12', 'Membresía 360', 'Membresía Black'];
        const CS_TYPES = ['Pilates Mat', 'Yoga', 'Aeroyoga', 'Telas', 'Taller'];

        // Reglamento obligatorio: marca de aceptación por usuaria (NULL = no aceptado aún).
        await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS reglamento_accepted_at TIMESTAMPTZ`);

        // (a) Disciplinas Casa Shé (categoría 'multi'; cupo 6-7). Valores iniciales SOLO al crear;
        //     después la admin puede editarlas desde el panel y NO se sobreescriben.
        await query(`INSERT INTO class_types (name, category, level, duration_minutes, max_capacity, is_active)
            SELECT v.name, 'multi'::class_category, 'all'::class_level, v.dur, v.cap, true
            FROM (VALUES ('Pilates Mat',50,7),('Yoga',60,7),('Aeroyoga',60,6),('Telas',60,6),('Taller',90,7))
              AS v(name, dur, cap)
            WHERE NOT EXISTS (SELECT 1 FROM class_types ct WHERE ct.name = v.name)`);

        // (b) Planes/paquetes Casa Shé (multi_credits; reformer=0). Valores iniciales SOLO al crear,
        //     así los precios/créditos que ajuste la admin persisten entre reinicios.
        await query(`INSERT INTO plans (name, reformer_credits, multi_credits, price, duration_days, is_active, sort_order)
            SELECT v.name, 0, v.credits, v.price, v.days, true, v.sort
            FROM (VALUES
              ('Clase de prueba',1,150,7,1),('Drop-in',1,280,30,2),('Paquete 5',5,1300,30,3),
              ('Paquete 8',8,2000,30,4),('Paquete 12',12,2880,30,5),
              ('Membresía 360',16,3600,30,6),('Membresía Black',24,4200,30,7)
            ) AS v(name, credits, price, days, sort)
            WHERE NOT EXISTS (SELECT 1 FROM plans p WHERE p.name = v.name)`);

        // (c) Sede única Casa Shé — Condesa.
        await query(`INSERT INTO facilities (name, description, capacity, is_active, sort_order)
            SELECT 'Casa Shé — Condesa', 'Alfonso Reyes 131, Condesa, CDMX', 7, true, 0
            WHERE NOT EXISTS (SELECT 1 FROM facilities f WHERE f.name = 'Casa Shé — Condesa')`);

        // (d) En CADA arranque define QUÉ está activo por NOMBRE: Casa Shé sí, el resto (incluido el
        //     catálogo heredado de BMB) no. Solo togglea is_active — NO toca precios/cupo, por eso
        //     gana sobre los seeds BMB sin pisar lo que la admin edite del catálogo Casa Shé.
        await query(`UPDATE plans SET is_active = (name = ANY($1::text[]))`, [CS_PLANS]);
        await query(`UPDATE class_types SET is_active = (name = ANY($1::text[]))`, [CS_TYPES]);
        await query(`UPDATE facilities SET is_active = (name = 'Casa Shé — Condesa')`);

        // (e) Cuenta admin de Casa Shé (reusa el hash del admin del seed: contraseña por defecto).
        await query(`INSERT INTO users (email, password_hash, display_name, phone, role, is_active)
            VALUES ('admin@casashe.mx', '$2b$10$ELPrfYdYroo/URqPraoj9eWP7KfYNGZfEbFpYq8uYLN.tnfdQY15S', 'Casa Shé Admin', '0000000000', 'admin', true)
            ON CONFLICT (email) DO UPDATE SET role='admin', is_active=true`);

        // (f) Reglas + branding del estudio: UNA sola vez (luego editable desde la UI de admin).
        const cleaned = await query(`SELECT 1 FROM migration_flags WHERE name = 'casashe_v1_catalog'`);
        if (!cleaned.length) {
            await query(`UPDATE system_settings SET value = jsonb_set(jsonb_set(value,'{min_hours}','5'::jsonb),'{cancellations_per_membership}','999'::jsonb)
                WHERE key='cancellation_policy'`);
            await query(`UPDATE system_settings SET value = $1::jsonb, updated_at = NOW() WHERE key='studio_info'`,
                [JSON.stringify({ name: 'Casa Shé', address: 'Alfonso Reyes 131, Condesa, CDMX', phone: '', email: 'casashecondesa@gmail.com', website: 'https://casashe.mx', description: 'Wellness para mujeres en la Condesa, CDMX.', social_media: { instagram: '@casashe.mx', facebook: '', whatsapp: '' } })]);
            await query(`UPDATE system_settings SET value = $1::jsonb, updated_at = NOW() WHERE key='bank_info'`,
                [JSON.stringify({ bank_name: '(pendiente)', account_holder: 'Casa Shé', account_number: '', clabe: '(pendiente)', reference_instructions: 'Usa tu nombre completo como referencia' })]);
            await query(`INSERT INTO migration_flags (name) VALUES ('casashe_v1_catalog') ON CONFLICT DO NOTHING`);
            console.log('Casa Shé v1: reglas (cancelación 5h) + branding del estudio fijados (una vez).');
        }
        // (g) Mono-sede: deja EXACTAMENTE una facility. Limpia referencias y borra cualquier
        //     otra sede (Sala Principal del schema base, cruft, etc.). Best-effort: si alguna FK
        //     impide el DELETE, la sede queda inactiva igual (por el toggle de arriba). Va al final
        //     para no interrumpir el resto del seed.
        try {
            await query(`UPDATE class_types SET facility_id = NULL WHERE facility_id IN (SELECT id FROM facilities WHERE name <> 'Casa Shé — Condesa')`);
            await query(`UPDATE users SET default_facility_id = NULL WHERE default_facility_id IN (SELECT id FROM facilities WHERE name <> 'Casa Shé — Condesa')`);
            await query(`DELETE FROM facilities WHERE name <> 'Casa Shé — Condesa'`);
        } catch (e) { console.warn('Casa Shé: no se pudieron borrar sedes extra (quedan inactivas):', (e as Error).message); }

        console.log('Casa Shé v1: catálogo, sede única y estado activo asegurados en cada arranque.');
    } catch (e) { console.error('Casa Shé v1 seed error:', e); }

  } finally {
    try { await lockClient.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]); } catch { /* noop */ }
    lockClient.release();
  }
}

// API Routes
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/plans', planRoutes);
app.use('/api/instructors', instructorRoutes);
app.use('/api/class-types', classTypeRoutes);
app.use('/api/schedules', scheduleRoutes);
app.use('/api/classes', classRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/clients', clientsRouter);
app.use('/api/memberships', membershipRoutes);
app.use('/api/admin/audit', auditRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/checkin', checkinRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/loyalty', loyaltyRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/reformers', reformersRoutes);
app.use('/api/facilities', facilitiesRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/reviews', reviewsRoutes);
app.use('/api/cron', cronRoutes);
app.use('/api/workout-templates', workoutTemplatesRoutes);
app.use('/api/videos', videoRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/discount-codes', discountCodeRoutes);
app.use('/api/evolution', evolutionRoutes);
app.use('/api/evolution/webhook', webhookEvolutionRoutes);
app.use('/api/migrations', migrationRoutes);
app.use('/api/products', productRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/cash-shifts', cashShiftRoutes);
app.use('/api/egresos', egresosRoutes);
app.use('/api/closed-days', closedDaysRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/commissions', commissionsRoutes);
app.use('/api/coach-payroll', coachPayrollRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/reception', receptionDashboardRoutes);

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Ruta no encontrada' });
});

// Error handler
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('Unhandled error:', err);
    res.status(500).json({
        error: 'Error interno del servidor',
        ...(process.env.NODE_ENV === 'development' && { message: err.message }),
    });
});

// Start server — espera a que terminen las migraciones de arranque antes de
// aceptar tráfico (evita 500s en el primer request tras un deploy). Si las
// migraciones fallan, igual se levanta (cada migración ya maneja su propio error).
runStartupMigrations()
    .catch((e) => console.error('[startup] migraciones de arranque fallaron:', e))
    .finally(() => {
        app.listen(PORT, () => {
            console.log(`
🚀 Casa Shé API Server
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📡 Server running on http://localhost:${PORT}
🔒 Auth routes: /api/auth
👤 User routes: /api/users
📦 Products: /api/products
💰 Egresos: /api/egresos
❤️  Health check: /api/health
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  `);

            // Initialize cron jobs
            if (process.env.ENABLE_CRON_JOBS !== 'false') {
                initializeCronJobs();
            }
        });
    });

export default app;
// deploy trigger Tue Mar 31 00:35:47 CST 2026
