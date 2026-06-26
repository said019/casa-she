import { query, queryOne } from '../config/database.js';

export type DbClient = {
  query: (text: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount: number }>;
};

export interface LoyaltyConfig {
  points_per_class: number;       // bonus per attended class (check-in)
  points_per_peso: number;        // legacy (ya no se usa para el cálculo de compra)
  points_per_peso_cash: number;   // legacy
  pesos_per_point: number;        // MODELO ACTIVO: 1 punto por cada $X gastado (uniforme)
  enabled: boolean;
  welcome_bonus: number;          // on registration
  birthday_bonus: number;         // requires active membership
  anniversary_bonus: number;      // 1 year since registration, requires active membership
  referral_bonus: number;         // to referrer when their code is used on a paid order
  streak_bonus: number;           // every 2 consecutive weeks attending
}

export const DEFAULT_LOYALTY_CONFIG: LoyaltyConfig = {
  points_per_class: 2,
  points_per_peso: 1,
  points_per_peso_cash: 2,
  pesos_per_point: 10,            // 1 punto por cada $10 gastado
  enabled: true,
  welcome_bonus: 10,
  birthday_bonus: 100,
  anniversary_bonus: 40,
  referral_bonus: 40,
  streak_bonus: 10,
};

/**
 * Fixed-points-per-package mapping (Balance Room policy).
 * Single drop-in classes (class_limit = 1) award 0 points.
 */
export function pointsForPlan(classLimit: number | null | undefined): number {
  if (!classLimit || classLimit <= 1) return 0;
  if (classLimit <= 4) return 30;
  if (classLimit <= 8) return 60;
  if (classLimit <= 12) return 100;
  if (classLimit <= 24) return 160;
  // Anything bigger keeps the 24-class rate as floor; could extend the table later
  return 160;
}

const LOYALTY_KEYS = ['loyalty_config', 'loyalty_settings'] as const;

let hasUsersLoyaltyPointsColumn: boolean | null = null;

const toNonNegativeInt = (value: unknown, fallback: number): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.floor(parsed));
};

const normalizeConfig = (value: unknown): LoyaltyConfig => {
  if (!value || typeof value !== 'object') {
    return { ...DEFAULT_LOYALTY_CONFIG };
  }

  const raw = value as Record<string, unknown>;

  return {
    points_per_class: toNonNegativeInt(raw.points_per_class, DEFAULT_LOYALTY_CONFIG.points_per_class),
    points_per_peso: toNonNegativeInt(raw.points_per_peso, DEFAULT_LOYALTY_CONFIG.points_per_peso),
    points_per_peso_cash: toNonNegativeInt(raw.points_per_peso_cash, DEFAULT_LOYALTY_CONFIG.points_per_peso_cash),
    // pesos_per_point: mínimo 1 (evita división entre 0).
    pesos_per_point: Math.max(1, toNonNegativeInt(raw.pesos_per_point, DEFAULT_LOYALTY_CONFIG.pesos_per_point)),
    enabled:
      raw.enabled === undefined
        ? DEFAULT_LOYALTY_CONFIG.enabled
        : typeof raw.enabled === 'string'
          ? raw.enabled.toLowerCase() === 'true'
          : Boolean(raw.enabled),
    welcome_bonus: toNonNegativeInt(raw.welcome_bonus, DEFAULT_LOYALTY_CONFIG.welcome_bonus),
    birthday_bonus: toNonNegativeInt(raw.birthday_bonus, DEFAULT_LOYALTY_CONFIG.birthday_bonus),
    anniversary_bonus: toNonNegativeInt(raw.anniversary_bonus, DEFAULT_LOYALTY_CONFIG.anniversary_bonus),
    referral_bonus: toNonNegativeInt(raw.referral_bonus, DEFAULT_LOYALTY_CONFIG.referral_bonus),
    streak_bonus: toNonNegativeInt(raw.streak_bonus, DEFAULT_LOYALTY_CONFIG.streak_bonus),
  };
};

const parseSettingValue = (value: unknown): unknown => {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const runQuery = async <T = any>(db: DbClient | null, text: string, params?: unknown[]): Promise<T[]> => {
  if (db) {
    const result = await db.query(text, params);
    return result.rows as T[];
  }
  return query<T>(text, params as any[]);
};

const queryFirst = async <T = any>(db: DbClient | null, text: string, params?: unknown[]): Promise<T | null> => {
  if (db) {
    const result = await db.query(text, params);
    return (result.rows[0] as T) || null;
  }
  return queryOne<T>(text, params as any[]);
};

export async function getLoyaltyConfig(db: DbClient | null = null): Promise<LoyaltyConfig> {
  const setting = await queryFirst<{ key: string; value: unknown }>(
    db,
    `SELECT key, value
     FROM system_settings
     WHERE key = ANY($1::text[])
     ORDER BY CASE WHEN key = 'loyalty_config' THEN 0 ELSE 1 END
     LIMIT 1`,
    [LOYALTY_KEYS]
  );

  const parsed = parseSettingValue(setting?.value);
  return normalizeConfig(parsed);
}

export async function saveLoyaltyConfig(
  incoming: unknown,
  updatedBy: string | undefined,
  db: DbClient | null = null
): Promise<LoyaltyConfig> {
  const config = normalizeConfig(incoming);
  const payload = JSON.stringify(config);

  for (const key of LOYALTY_KEYS) {
    if (db) {
      await db.query(
        `INSERT INTO system_settings (key, value, updated_by, description)
         VALUES ($1, $2, $3, 'Configuración del programa de lealtad')
         ON CONFLICT (key) DO UPDATE
         SET value = $2, updated_at = CURRENT_TIMESTAMP, updated_by = $3`,
        [key, payload, updatedBy || null]
      );
    } else {
      await runQuery(
        null,
        `INSERT INTO system_settings (key, value, updated_by, description)
         VALUES ($1, $2, $3, 'Configuración del programa de lealtad')
         ON CONFLICT (key) DO UPDATE
         SET value = $2, updated_at = CURRENT_TIMESTAMP, updated_by = $3`,
        [key, payload, updatedBy || null]
      );
    }
  }

  return config;
}

export async function getUserPointsBalance(userId: string, db: DbClient | null = null): Promise<number> {
  const result = await queryFirst<{ total_points: number | string }>(
    db,
    `SELECT COALESCE(SUM(points), 0)::int as total_points
     FROM loyalty_points
     WHERE user_id = $1`,
    [userId]
  );

  return Number(result?.total_points || 0);
}

export async function syncUserLoyaltyPointsSnapshot(
  userId: string,
  db: DbClient | null = null
): Promise<void> {
  try {
    if (hasUsersLoyaltyPointsColumn === null) {
      const exists = await queryFirst<{ exists: boolean }>(
        db,
        `SELECT EXISTS (
           SELECT 1
           FROM information_schema.columns
           WHERE table_schema = 'public'
             AND table_name = 'users'
             AND column_name = 'loyalty_points'
         ) as exists`
      );
      hasUsersLoyaltyPointsColumn = Boolean(exists?.exists);
    }

    if (!hasUsersLoyaltyPointsColumn) return;

    if (db) {
      await db.query(
        `UPDATE users
         SET loyalty_points = (
           SELECT COALESCE(SUM(points), 0)::int
           FROM loyalty_points
           WHERE user_id = $1
         )
         WHERE id = $1`,
        [userId]
      );
    } else {
      await runQuery(
        null,
        `UPDATE users
         SET loyalty_points = (
           SELECT COALESCE(SUM(points), 0)::int
           FROM loyalty_points
           WHERE user_id = $1
         )
         WHERE id = $1`,
        [userId]
      );
    }
  } catch (error: any) {
    if (error?.code === '42703') {
      hasUsersLoyaltyPointsColumn = false;
      return;
    }
    throw error;
  }
}

export async function ensureUserExists(userId: string, db: DbClient | null = null): Promise<boolean> {
  const user = await queryFirst<{ id: string }>(
    db,
    `SELECT id FROM users WHERE id = $1`,
    [userId]
  );
  return Boolean(user?.id);
}

// Puntos por $1 gastado (la etiqueta del panel dice "Puntos por $1"). Ej: $900 a 1 pt/$1 = 900 pts.
export function computePaymentPoints(amount: number, pointsPerDollar: number): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  if (!Number.isFinite(pointsPerDollar) || pointsPerDollar <= 0) return 0;
  return Math.floor(amount * pointsPerDollar);
}

const buildPaymentPointsDescription = (paymentId: string): string => `Puntos por pago #${paymentId}`;
const buildPaymentReversalDescription = (paymentId: string): string => `Reversa por reembolso pago #${paymentId}`;

export async function awardPaymentLoyaltyPoints(params: {
  db: DbClient;
  userId: string;
  paymentId: string;
  amount: number;
  paymentMethod?: string;
  classLimit?: number | null;  // when present → use fixed-per-package table
}): Promise<number> {
  const { db, userId, paymentId, amount, paymentMethod, classLimit } = params;
  const config = await getLoyaltyConfig(db);

  if (!config.enabled) return 0;

  // Puntos por compra: 1 punto por cada $X gastado (config.pesos_per_point), uniforme
  // (sin bonus por efectivo). class_limit ya no se usa.
  const pesosPerPoint = config.pesos_per_point > 0 ? config.pesos_per_point : 10;
  let pointsToAward: number = (Number.isFinite(amount) && amount > 0)
    ? Math.floor(amount / pesosPerPoint)
    : 0;
  const pointType: 'package_purchase' | 'bonus' = 'package_purchase';

  if (pointsToAward <= 0) return 0;

  // Founder double-points: first compra → x2, then mark used
  let founderApplied = false;
  const founderRow = await db.query(
    `SELECT is_founder, founder_double_points_used FROM users WHERE id = $1 FOR UPDATE`,
    [userId]
  );
  const fr = founderRow.rows[0];
  if (fr?.is_founder && !fr.founder_double_points_used) {
    pointsToAward = pointsToAward * 2;
    founderApplied = true;
  }

  const description = buildPaymentPointsDescription(paymentId);
  const exists = await db.query(
    `SELECT id FROM loyalty_points WHERE user_id = $1 AND description = $2 LIMIT 1`,
    [userId, description]
  );
  if (exists.rowCount > 0) return 0;

  await db.query(
    `INSERT INTO loyalty_points (user_id, points, type, description)
     VALUES ($1, $2, $3, $4)`,
    [userId, pointsToAward, pointType, description]
  );

  if (founderApplied) {
    await db.query(
      `UPDATE users SET founder_double_points_used = true, founder_double_points_used_at = NOW() WHERE id = $1`,
      [userId]
    );
    await db.query(
      `INSERT INTO founder_audit (user_id, action, metadata)
       VALUES ($1, 'points_used', $2::jsonb)`,
      [userId, JSON.stringify({ payment_id: paymentId, points_awarded: pointsToAward, base_points: pointsToAward / 2 })]
    );
  }

  await syncUserLoyaltyPointsSnapshot(userId, db);
  return pointsToAward;
}

/**
 * Award attendance points for a class check-in. Idempotent on (user, booking)
 * — if the entry already exists no-ops. Reads points_per_class from
 * loyalty_config (default 2 per policy). Fires a WhatsApp "+N pts" notice when
 * the user has a phone and notification_settings.send_points_earned isn't
 * disabled. Safe to call from any check-in flow (QR, self, manual, instructor
 * portal, admin booking, auto cron) — failures are logged and swallowed so
 * the underlying check-in is never rolled back.
 */
export async function awardCheckinPoints(userId: string, bookingId: string): Promise<number> {
  try {
    const existing = await queryOne<{ id: string }>(
      `SELECT id FROM loyalty_points WHERE user_id = $1 AND related_booking_id = $2 AND type = 'class_attended'`,
      [userId, bookingId]
    );
    if (existing) return 0;

    // Open / free classes don't generate loyalty points.
    const cls = await queryOne<{ is_free: boolean | null }>(
      `SELECT c.is_free FROM bookings b JOIN classes c ON c.id = b.class_id WHERE b.id = $1`,
      [bookingId]
    );
    if (cls?.is_free) return 0;

    const config = await getLoyaltyConfig();
    if (!config.enabled) return 0;
    const pointsToAward = config.points_per_class > 0 ? config.points_per_class : 2;

    await query(
      `INSERT INTO loyalty_points (user_id, points, type, description, related_booking_id)
       VALUES ($1, $2, 'class_attended', 'Puntos por asistencia a clase', $3)`,
      [userId, pointsToAward, bookingId]
    );
    await syncUserLoyaltyPointsSnapshot(userId);
    return pointsToAward;
  } catch (err) {
    console.error('Error awarding loyalty points:', err);
    return 0;
  }
}

/**
 * Founder first-package 10% discount. Single-use per user — once consumed the
 * flag stays true. Returns the final amount to charge plus a discountAmount
 * line item for receipts/audit. Must be called inside an existing transaction
 * (locks the user row with FOR UPDATE).
 */
export async function consumeFounderFirstPackageDiscount(params: {
  db: DbClient;
  userId: string;
  listPrice: number;
}): Promise<{ amount: number; discountAmount: number; applied: boolean }> {
  const { db, userId, listPrice } = params;
  if (!Number.isFinite(listPrice) || listPrice <= 0) {
    return { amount: listPrice, discountAmount: 0, applied: false };
  }
  const row = await db.query(
    `SELECT is_founder, founder_first_package_used FROM users WHERE id = $1 FOR UPDATE`,
    [userId]
  );
  const u = row.rows[0];
  if (!u?.is_founder || u.founder_first_package_used) {
    return { amount: listPrice, discountAmount: 0, applied: false };
  }
  const discountAmount = Math.round(listPrice * 0.1 * 100) / 100;
  const amount = Math.round((listPrice - discountAmount) * 100) / 100;
  await db.query(
    `UPDATE users SET founder_first_package_used = true, founder_first_used_at = NOW() WHERE id = $1`,
    [userId]
  );
  await db.query(
    `INSERT INTO founder_audit (user_id, action, metadata)
     VALUES ($1, 'first_package_discount_used', $2::jsonb)`,
    [userId, JSON.stringify({ list_price: listPrice, amount, discount_amount: discountAmount })]
  );
  return { amount, discountAmount, applied: true };
}

/**
 * Sample-class ("Clase Muestra", $99) credit. If the user has an APPROVED
 * order for a sample-type plan within the last 30 days and hasn't used this
 * credit before, a flat $99 is discounted from their next real package
 * (class_limit > 1). Single-use per user. Must be called inside an existing
 * transaction (locks the user row with FOR UPDATE).
 *
 * Returns the flat discount to apply (0 if not eligible). The caller is
 * responsible for not letting the order total go below 0; per business rule
 * the discount is skipped when the post-discount subtotal is under $99.
 */
export const SAMPLE_CLASS_DISCOUNT_AMOUNT = 99;

export async function consumeSampleClassDiscount(params: {
  db: DbClient;
  userId: string;
  planClassLimit: number | null;
  subtotalAfterOtherDiscounts: number;
}): Promise<{ discountAmount: number; applied: boolean }> {
  const { db, userId, planClassLimit, subtotalAfterOtherDiscounts } = params;

  // Only real packages (more than one class) qualify as the discount target.
  if (!planClassLimit || planClassLimit <= 1) {
    return { discountAmount: 0, applied: false };
  }
  // Business rule: never apply if the package costs less than the credit.
  if (!Number.isFinite(subtotalAfterOtherDiscounts) || subtotalAfterOtherDiscounts < SAMPLE_CLASS_DISCOUNT_AMOUNT) {
    return { discountAmount: 0, applied: false };
  }

  const row = await db.query(
    `SELECT sample_class_discount_used FROM users WHERE id = $1 FOR UPDATE`,
    [userId]
  );
  if (row.rows[0]?.sample_class_discount_used) {
    return { discountAmount: 0, applied: false };
  }

  // Must have an APPROVED sample-plan order within the last 30 days.
  const sampleOrder = await db.query(
    `SELECT o.id
       FROM orders o
       JOIN plans p ON p.id = o.plan_id
      WHERE o.user_id = $1
        AND o.status = 'approved'
        AND p.package_type = 'sample'
        AND o.approved_at >= NOW() - INTERVAL '30 days'
      ORDER BY o.approved_at DESC
      LIMIT 1`,
    [userId]
  );
  if ((sampleOrder.rowCount ?? 0) === 0) {
    return { discountAmount: 0, applied: false };
  }

  await db.query(
    `UPDATE users SET sample_class_discount_used = true, sample_class_discount_used_at = NOW() WHERE id = $1`,
    [userId]
  );
  await db.query(
    `INSERT INTO founder_audit (user_id, action, metadata)
     VALUES ($1, 'sample_class_discount_used', $2::jsonb)`,
    [userId, JSON.stringify({
      discount_amount: SAMPLE_CLASS_DISCOUNT_AMOUNT,
      sample_order_id: sampleOrder.rows[0].id,
      subtotal_after_other_discounts: subtotalAfterOtherDiscounts,
    })]
  );
  return { discountAmount: SAMPLE_CLASS_DISCOUNT_AMOUNT, applied: true };
}

/**
 * Reverse the loyalty points awarded for a specific payment (refund case).
 * Idempotent — looks up the original award by description and inserts a single
 * negative entry of equal magnitude. Returns the absolute number of points reversed.
 */
export async function reversePaymentLoyaltyPoints(params: {
  db: DbClient;
  userId: string;
  paymentId: string;
}): Promise<number> {
  const { db, userId, paymentId } = params;
  const awardDesc = buildPaymentPointsDescription(paymentId);
  const reversalDesc = buildPaymentReversalDescription(paymentId);

  const reversed = await db.query(
    `SELECT id FROM loyalty_points WHERE user_id = $1 AND description = $2 LIMIT 1`,
    [userId, reversalDesc]
  );
  if (reversed.rowCount > 0) return 0;

  const original = await db.query(
    `SELECT points FROM loyalty_points WHERE user_id = $1 AND description = $2 LIMIT 1`,
    [userId, awardDesc]
  );
  if (original.rowCount === 0) return 0;
  const awardedPoints = Number(original.rows[0].points);
  if (!Number.isFinite(awardedPoints) || awardedPoints <= 0) return 0;

  await db.query(
    `INSERT INTO loyalty_points (user_id, points, type, description)
     VALUES ($1, $2, 'redemption', $3)`,
    [userId, -awardedPoints, reversalDesc]
  );

  await syncUserLoyaltyPointsSnapshot(userId, db);
  return awardedPoints;
}

/**
 * Award the welcome bonus to a freshly registered user. Idempotent.
 * Uses the `query` helper from database.ts (no transaction needed).
 */
export async function awardWelcomeBonus(userId: string): Promise<number> {
  // Read config without a custom DbClient
  const settings = await queryOne<any>(
    `SELECT value FROM system_settings WHERE key = 'loyalty_config'`
  );
  const config = normalizeConfig(parseSettingValue(settings?.value));
  if (!config.enabled || config.welcome_bonus <= 0) return 0;

  const desc = 'Bienvenida';
  const exists = await queryOne(
    `SELECT id FROM loyalty_points WHERE user_id = $1 AND description = $2 LIMIT 1`,
    [userId, desc]
  );
  if (exists) return 0;

  await query(
    `INSERT INTO loyalty_points (user_id, points, type, description) VALUES ($1, $2, 'welcome', $3)`,
    [userId, config.welcome_bonus, desc]
  );
  await query(
    `UPDATE users SET loyalty_points = COALESCE(loyalty_points, 0) + $1 WHERE id = $2`,
    [config.welcome_bonus, userId]
  );
  return config.welcome_bonus;
}

/**
 * Award referral bonus to the OWNER of a code when an order is approved.
 * Idempotent on (referrer + order). Accepts a transaction client (PoolClient-style).
 */
export async function awardReferralBonus(
  referrerUserId: string,
  orderId: string,
  orderNumber: string,
  db: DbClient
): Promise<number> {
  const settingsRow = await db.query(
    `SELECT value FROM system_settings WHERE key = 'loyalty_config'`,
    []
  );
  const cfgRaw = settingsRow.rows[0]?.value;
  const config = normalizeConfig(parseSettingValue(cfgRaw));
  if (!config.enabled || config.referral_bonus <= 0) return 0;

  const desc = `Referido orden #${orderNumber}`;
  const exists = await db.query(
    `SELECT id FROM loyalty_points WHERE user_id = $1 AND description = $2 LIMIT 1`,
    [referrerUserId, desc]
  );
  if (exists.rowCount > 0) return 0;

  await db.query(
    `INSERT INTO loyalty_points (user_id, points, type, description, related_order_id)
     VALUES ($1, $2, 'referral', $3, $4)`,
    [referrerUserId, config.referral_bonus, desc, orderId]
  );
  await syncUserLoyaltyPointsSnapshot(referrerUserId, db);
  return config.referral_bonus;
}

/**
 * Pure decision: a user may buy the Clase Muestra only if they have NO active
 * package membership (class_limit > 1). activePackageCount is produced by the
 * DB query in canBuySamplePlan.
 * Kept intentionally thin (single condition) for unit testing; extend here if the gate grows.
 */
export function isSamplePurchaseAllowed(activePackageCount: number): boolean {
  return activePackageCount === 0;
}

/**
 * True if the user can buy the Clase Muestra ($99, package_type='sample').
 * Blocked when they already hold an ACTIVE, non-expired membership of a real
 * package (plan.class_limit > 1). Intentionally does NOT block on the sample
 * plan itself or on single drop-in plans (class_limit = 1) — only real
 * multi-class packages count. Input validation — no FOR UPDATE needed.
 */
export async function canBuySamplePlan(params: {
  db: DbClient;
  userId: string;
}): Promise<boolean> {
  const { db, userId } = params;
  const r = await db.query(
    `SELECT COUNT(*)::int AS n
       FROM memberships m
       JOIN plans p ON p.id = m.plan_id
      WHERE m.user_id = $1
        AND m.status = 'active'
        AND (m.end_date IS NULL
             OR m.end_date >= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
                               AT TIME ZONE 'America/Mexico_City')::date)
        AND p.class_limit > 1`,
    [userId],
  );
  return isSamplePurchaseAllowed(r.rows[0]?.n ?? 0);
}
