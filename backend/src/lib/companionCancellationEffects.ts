import {query} from '../config/database.js';
import {promoteNextFromWaitlist} from './waitlist.js';

/** Only after COMMIT: a failed notification/side effect must not undo cancellation. */
export async function companionCancellationEffects(bookingId:string,classId:string) {
  await query(`UPDATE bar_orders SET status='cancelled',cancelled_by='system_class_cancelled',cancelled_at=now(),updated_at=now()
    WHERE booking_id=$1 AND status='pending'`,[bookingId])
    .catch(error=>console.error('Companion drink cancellation failed',error));
  await promoteNextFromWaitlist({classId})
    .catch(error=>console.error('Companion waitlist promotion failed',error));
}
