import type { DbClient } from './loyalty.js';

export class MembershipDailyLimitError extends Error {
  readonly status = 409;
  constructor(
    readonly code = 'MEMBERSHIP_DAILY_LIMIT',
    message = 'Tu membresía incluye clases ilimitadas al mes, con un máximo de 1 clase al día. Ya tienes una reserva para ese día.',
  ) { super(message); }
}

/** Call inside the booking transaction, before inserting or promoting.
 * NULL in the selected category means unlimited; bounded packs are unchanged.
 * The nonblocking user lock serializes even different memberships/studios without
 * introducing a lock-order deadlock with class/membership locks held by callers.
 * A separate query after acquiring it sees the preceding transaction's commit.
 */
export async function assertMembershipDailyLimit(params: {
  db: DbClient;
  userId: string;
  classId: string;
  remaining: number | null;
  excludeBookingId?: string;
}): Promise<void> {
  const { db, userId, classId, remaining, excludeBookingId } = params;
  if (remaining !== null) return;
  const lock = await db.query(
    `SELECT pg_try_advisory_xact_lock(hashtextextended('membership-daily:' || $1::text, 0)) AS locked`,
    [userId],
  );
  if (!lock.rows[0]?.locked) {
    throw new MembershipDailyLimitError('BOOKING_IN_PROGRESS', 'Hay otra reserva en proceso. Espera un momento y vuelve a intentar.');
  }
  // Compare DATE columns directly: studio calendar days, not the server timezone.
  // Waitlist, attended and no-show occupy the day; cancelled bookings/classes don't.
  const existing = await db.query(
    `SELECT b.id FROM bookings b
       JOIN classes c ON c.id = b.class_id
      WHERE b.user_id = $1 AND c.date = (SELECT date FROM classes WHERE id = $2)
        AND b.status <> 'cancelled' AND c.status <> 'cancelled'
        AND ($3::uuid IS NULL OR b.id <> $3::uuid)
      LIMIT 1`,
    [userId, classId, excludeBookingId ?? null],
  );
  if (existing.rows.length) throw new MembershipDailyLimitError();
}
