import type { PoolClient } from 'pg';
import { membershipDateOnly, membershipValidityForClassDate } from './membershipValidity.js';

export class CompanionError extends Error {}
export const fail = (message: string): never => { throw new CompanionError(message); };

/** Monthly anniversary cycle, clamped for memberships starting on days 29–31. */
export function companionCycle(start: string, target: string): string {
  const day = Number(start.slice(8,10));
  let year = Number(target.slice(0,4)), month = Number(target.slice(5,7));
  const boundary = () => `${year}-${String(month).padStart(2,'0')}-${String(Math.min(day,new Date(Date.UTC(year,month,0)).getUTCDate())).padStart(2,'0')}`;
  if (boundary() > target) { month--; if (!month) {month=12;year--;} }
  return boundary();
}

// All callers open a transaction. Class → host booking → membership serializes
// capacity and monthly quotas across checkout callbacks and ordinary reservations.
export async function lockCompanionHost(db: PoolClient, id: string) {
  const initial = (await db.query(`SELECT class_id FROM bookings WHERE id=$1`,[id])).rows[0];
  if (!initial) fail('Reserva no encontrada.');
  const cls = (await db.query(`SELECT c.*,ct.category,
    ((c.date+c.start_time) AT TIME ZONE 'America/Mexico_City')>now() AS future
    FROM classes c JOIN class_types ct ON ct.id=c.class_type_id WHERE c.id=$1 FOR UPDATE OF c`,[initial.class_id])).rows[0];
  const host = (await db.query(`SELECT * FROM bookings WHERE id=$1 FOR UPDATE`,[id])).rows[0];
  const membership = host.membership_id ? (await db.query(`SELECT m.*,COALESCE(m.facility_id,o.facility_id) AS bound_facility_id
    FROM memberships m LEFT JOIN orders o ON o.id=m.order_id WHERE m.id=$1 FOR UPDATE OF m`,[host.membership_id])).rows[0] : null;
  return {cls,host,membership};
}
export async function companionPolicy(db: PoolClient, ctx: Awaited<ReturnType<typeof lockCompanionHost>>, excludeId?: string) {
  const {cls,host,membership:m} = ctx;
  const category = cls.category === 'reformer' ? 'reformer' : 'multi';
  const remaining = m?.[`${category}_remaining`];
  const cycle = m?.start_date ? companionCycle(membershipDateOnly(m.start_date),membershipDateOnly(cls.date)) : membershipDateOnly(cls.date);
  const used = (await db.query(`SELECT count(*)::int n FROM booking_companions WHERE membership_id=$1 AND cycle_start=$2
    AND mode='monthly_free' AND NOT free_released`,[m?.id ?? null,cycle])).rows[0].n;
  const active = (await db.query(`SELECT count(*)::int n FROM booking_companions WHERE host_booking_id=$1
    AND status IN ('confirmed','pending_payment') AND ($2::uuid IS NULL OR id<>$2)`,[host.id,excludeId ?? null])).rows[0].n;
  const nested = (await db.query(`SELECT id FROM booking_companions WHERE guest_booking_id=$1`,[host.id])).rows.length > 0;
  const holds = (await db.query(`SELECT count(*)::int n FROM bio_checkout_sessions WHERE class_id=$1
    AND status IN ('pending_payment','paid','ready') AND expires_at>now()`,[cls.id])).rows[0].n;
  const mode = remaining === null ? (used ? 'paid' : 'monthly_free') : 'credit';
  let reason: string | undefined;
  if (!cls.future || cls.status !== 'scheduled' || cls.booking_closed) reason='Esta clase ya no admite reservas.';
  else if (host.status !== 'confirmed' || nested) reason='Necesitas una reserva confirmada como titular.';
  else if (!m || !m.start_date || m.user_id !== host.user_id) reason='La reserva debe estar vinculada a una membresía de la titular.';
  else if (!membershipValidityForClassDate(m,cls.date).ok) reason='La membresía no está vigente para esta clase.';
  else if (m.bound_facility_id && m.bound_facility_id !== cls.facility_id) reason='La membresía pertenece a otro estudio.';
  else if (remaining !== null && !(remaining > 0)) reason='No quedan créditos para una invitada.';
  else if (active >= 2) reason='Puedes reservar hasta 2 invitadas en esta clase.';
  else if (Number(cls.current_bookings)+holds >= Number(cls.max_capacity)) reason='La clase ya no tiene lugares disponibles.';
  return {eligible:!reason,reason,mode,amount:mode==='paid'?280:0,remaining_slots:Math.max(0,2-active),category,cycle};
}

export async function confirmCompanion(db: PoolClient, companion: any, ctx: Awaited<ReturnType<typeof lockCompanionHost>>, actor: string) {
  const {host,cls,membership} = ctx;
  const category = cls.category === 'reformer' ? 'reformer' : 'multi';
  if (companion.guest_user_id === host.user_id) fail('La invitada debe ser otra persona.');
  if ((await db.query(`SELECT id FROM bookings WHERE class_id=$1 AND user_id=$2 AND status<>'cancelled'`,[cls.id,companion.guest_user_id])).rows.length) fail('La invitada ya tiene una reserva para esta clase.');
  if (companion.mode==='credit') {
    const result = await db.query(`UPDATE memberships SET ${category}_remaining=${category}_remaining-1
      WHERE id=$1 AND ${category}_remaining>0 RETURNING id`,[membership.id]);
    if (!result.rows.length) fail('No quedan créditos para la invitada.');
  }
  const booking = (await db.query(`INSERT INTO bookings (class_id,user_id,membership_id,status,consumed_category,booked_by,is_companion_booking)
    VALUES ($1,$2,$3,'confirmed',$4,$5,true) RETURNING id`,[cls.id,companion.guest_user_id,membership.id,
    companion.mode==='credit'?category:null,actor])).rows[0];
  await db.query(`UPDATE booking_companions SET status='confirmed',guest_booking_id=$2,reason=NULL WHERE id=$1`,[companion.id,booking.id]);
}

export async function receiveCompanionPayment(db: PoolClient, id: string, payment: {
  reference: string; amount: number; currency: string; method: 'card'|'cash'|'transfer'; actor?: string;
}) {
  const initial = (await db.query(`SELECT host_booking_id FROM booking_companions WHERE id=$1`,[id])).rows[0];
  if (!initial) fail('Invitada no encontrada.');
  const ctx = await lockCompanionHost(db,initial.host_booking_id);
  const c = (await db.query(`SELECT * FROM booking_companions WHERE id=$1 FOR UPDATE`,[id])).rows[0];
  if (c.mode!=='paid') fail('Esta invitada no requiere pago.');
  const inserted = await db.query(`INSERT INTO companion_payments(reference,companion_id,amount,currency,status,received_by)
    VALUES($1,$2,$3,$4,'received',$5) ON CONFLICT(reference) DO NOTHING RETURNING reference`,
    [payment.reference,id,payment.amount,payment.currency,payment.actor ?? null]);
  if (!inserted.rows.length) return; // Same payment never grants another seat.
  const previous = (await db.query(`SELECT reference FROM companion_payments WHERE companion_id=$1 AND reference<>$2`,[id,payment.reference])).rows.length;
  if(payment.currency==='MXN' && Number.isFinite(payment.amount) && payment.amount>0) {
   const ledger = (await db.query(`INSERT INTO payments(user_id,amount,currency,payment_method,status,provider,reference_id)
    VALUES($1,$2,$3,$4,'completed',$5,$6) RETURNING id`,[ctx.host.user_id,payment.amount,payment.currency,
    payment.method,payment.method==='card'?'mercadopago':'manual',payment.reference])).rows[0];
  await db.query(`UPDATE companion_payments SET payment_id=$2 WHERE reference=$1`,[payment.reference,ledger.id]);
  }
  const policy=await companionPolicy(db,ctx,id);
  const reason = previous ? 'Se recibió un pago adicional: revisar devolución.'
    : payment.amount!==280 || payment.currency!=='MXN' ? 'El importe o moneda del pago no coincide con $280 MXN.'
    : c.status!=='pending_payment' ? 'Pago recibido para una solicitud que ya no está pendiente.'
    : !policy.eligible ? policy.reason : null;
  if (reason) {
    await db.query(`UPDATE booking_companions SET status=CASE WHEN guest_booking_id IS NULL THEN 'payment_review' ELSE status END,reason=$2 WHERE id=$1`,[id,reason]);
    return;
  }
  await db.query('SAVEPOINT companion_confirm');
  try {
    await confirmCompanion(db,c,ctx,payment.actor ?? ctx.host.user_id);
    await db.query(`UPDATE companion_payments SET fulfilled=true WHERE reference=$1`,[payment.reference]);
  }
  catch (error) {
    await db.query('ROLLBACK TO SAVEPOINT companion_confirm');
    if (!(error instanceof CompanionError) && (error as any).code!=='23505') throw error;
    await db.query(`UPDATE booking_companions SET status='payment_review',reason=$2 WHERE id=$1`,[id,'No fue posible confirmar el lugar; revisar pago en recepción.']);
  }
}
