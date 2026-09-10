import { pool } from '../config/database.js';
import type { MpPayment } from './mercadopago.js';
import { lockCompanionHost, receiveCompanionPayment } from './companions.js';
import {companionCancellationEffects} from './companionCancellationEffects.js';

export async function syncCompanionPayment(id:string,payment:MpPayment) {
  const db=await pool.connect();
  let cancelled:{bookingId:string;classId:string}|undefined;
  try {
    await db.query('BEGIN');
    if(payment.status==='approved') {
      await receiveCompanionPayment(db,id,{reference:`mp-companion:${payment.id}`,amount:Number(payment.transaction_amount),currency:payment.currency_id||'UNKNOWN',method:'card'});
    } else if(['refunded','charged_back'].includes(payment.status)) {
      const initial=(await db.query(`SELECT host_booking_id FROM booking_companions WHERE id=$1`,[id])).rows[0];
      if(initial) {
        const ctx=await lockCompanionHost(db,initial.host_booking_id);
        const c=(await db.query(`SELECT * FROM booking_companions WHERE id=$1 FOR UPDATE`,[id])).rows[0];
        await db.query(`INSERT INTO companion_payments(reference,companion_id,amount,currency,status)
          VALUES($1,$2,$3,$4,'reversed') ON CONFLICT(reference) DO NOTHING`,
          [`mp-companion:${payment.id}`,id,Number(payment.transaction_amount),payment.currency_id||'UNKNOWN']);
        const receipt=(await db.query(`SELECT * FROM companion_payments WHERE reference=$1 AND companion_id=$2 FOR UPDATE`,[`mp-companion:${payment.id}`,id])).rows[0];
        if(receipt && receipt.status!=='refunded') {
          await db.query(`UPDATE companion_payments SET status='refunded' WHERE reference=$1`,[receipt.reference]);
          await db.query(`UPDATE payments SET status='refunded' WHERE id=$1`,[receipt.payment_id]);
          if(receipt.fulfilled && c.guest_booking_id) {
            await db.query(`UPDATE bookings SET status='cancelled',cancelled_at=now() WHERE id=$1 AND status<>'cancelled'`,[c.guest_booking_id]);
            cancelled={bookingId:c.guest_booking_id,classId:ctx.cls.id};
          }
          if(receipt.fulfilled || !c.guest_booking_id) await db.query(`UPDATE booking_companions SET status='refunded',reason='Pago devuelto o contracargo confirmado por Mercado Pago.' WHERE id=$1`,[id]);
        }
      }
    }
    await db.query('COMMIT');
  }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
  if(cancelled) await companionCancellationEffects(cancelled.bookingId,cancelled.classId);
}
