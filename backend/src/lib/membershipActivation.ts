import { addDaysToDate, cdmxToday } from './schedule.js';

type Queryable = {
  query: (text: string, params?: unknown[]) => Promise<{ rows: any[] }>;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function civilDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const date = value.trim().slice(0, 10);
  return ISO_DATE.test(date) ? date : null;
}

/**
 * Resuelve la vigencia de una compra pagada sin convertir fechas DATE a UTC.
 * La compra automática se activa hoy y conserva todo el tiempo ya pagado.
 * Como end_date es inclusiva, el nuevo tramo empieza en end_date + 1.
 */
export async function resolvePaidMembershipDates(
  db: Queryable,
  input: { userId: string; durationDays: number; explicitStartDate?: string | null; today?: string },
): Promise<{ startDate: string; endDate: string; previousMembershipId: string | null }> {
  const today = input.today ?? cdmxToday();
  const explicit = civilDate(input.explicitStartDate);
  await db.query(`SELECT pg_advisory_xact_lock(hashtext('membership-paid:' || $1::text))`, [input.userId]);

  if (explicit) {
    return {
      startDate: explicit,
      endDate: addDaysToDate(explicit, input.durationDays),
      previousMembershipId: null,
    };
  }

  const current = await db.query(
    `SELECT id, end_date::text AS end_date
       FROM memberships
      WHERE user_id = $1
        AND status = 'active'
        AND start_date <= $2::date
        AND end_date IS NOT NULL
        AND end_date >= $2::date
      ORDER BY end_date DESC, created_at DESC
      LIMIT 1
      FOR UPDATE`,
    [input.userId, today],
  );
  const previous = current.rows[0] as { id: string; end_date: string } | undefined;
  const base = previous?.end_date && previous.end_date >= today
    ? addDaysToDate(previous.end_date, 1)
    : today;
  return {
    startDate: today,
    endDate: addDaysToDate(base, input.durationDays),
    previousMembershipId: previous?.id ?? null,
  };
}
