import { addDaysToDate, cdmxToday } from './schedule.js';

type Queryable = {
  query: (text: string, params?: unknown[]) => Promise<{ rows: any[] }>;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export class MembershipDateInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MembershipDateInputError';
  }
}

export function civilDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(raw)) return null;
  const date = raw.slice(0, 10);
  if (!ISO_DATE.test(date)) return null;
  const [year, month, day] = date.split('-').map(Number);
  const daysInMonth = month === 2
    ? ((year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)) ? 29 : 28)
    : ([4, 6, 9, 11].includes(month) ? 30 : 31);
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth ? date : null;
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
  if (input.explicitStartDate != null && input.explicitStartDate !== '' && !explicit) {
    throw new MembershipDateInputError('Fecha de inicio inválida (formato YYYY-MM-DD).');
  }
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

/**
 * Venta de staff: hoy/ausente activa de inmediato y preserva vigencia; una
 * fecha distinta es programación explícita. Un endDate sugerido por el UI no
 * recorta el tramo preservado cuando el inicio es hoy.
 */
export async function resolveStaffMembershipDates(
  db: Queryable,
  input: {
    userId: string;
    durationDays: number;
    requestedStartDate?: string | null;
    requestedEndDate?: string | null;
    today?: string;
  },
): Promise<{
  startDate: string;
  endDate: string;
  previousMembershipId: string | null;
  mode: 'automatic' | 'scheduled';
}> {
  const today = input.today ?? cdmxToday();
  const rawStart = input.requestedStartDate;
  const requestedStart = rawStart == null || rawStart === '' ? today : civilDate(rawStart);
  if (!requestedStart) throw new MembershipDateInputError('Fecha de inicio inválida (formato YYYY-MM-DD).');

  const automatic = requestedStart === today;
  const resolved = await resolvePaidMembershipDates(db, {
    userId: input.userId,
    durationDays: input.durationDays,
    explicitStartDate: automatic ? null : requestedStart,
    today,
  });
  if (automatic || input.requestedEndDate == null || input.requestedEndDate === '') {
    return { ...resolved, mode: automatic ? 'automatic' : 'scheduled' };
  }
  const requestedEnd = civilDate(input.requestedEndDate);
  if (!requestedEnd) throw new MembershipDateInputError('Fecha de vencimiento inválida (formato YYYY-MM-DD).');
  if (requestedEnd < resolved.startDate) {
    throw new MembershipDateInputError('El vencimiento no puede ser anterior al inicio.');
  }
  return { ...resolved, endDate: requestedEnd, mode: 'scheduled' };
}
