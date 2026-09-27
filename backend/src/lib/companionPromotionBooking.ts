import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {companionPolicy,confirmCompanion,fail,lockCompanionHost} from './companions.js';
import {findOrCreateGuest,normalizeMxPhone} from './guestUser.js';

/** Caller owns authorization + transaction and has locked class/host/membership. */
export async function bookPromotionalCompanions(db:PoolClient,ctx:Awaited<ReturnType<typeof lockCompanionHost>>,input:{requestId:string;guests:{name:string;phone:string}[]},actor:string) {
  const previous=(await db.query(`SELECT * FROM booking_companions WHERE promotion_request_id=$1 ORDER BY promotion_slot`,[input.requestId])).rows;
  if(previous.length) {
    if(previous.some(c=>c.host_booking_id!==ctx.host.id)) fail('La solicitud ya fue utilizada.');
    return previous;
  }
  if((await db.query('SELECT id FROM booking_companions WHERE request_id=$1',[input.requestId])).rows.length) fail('La solicitud ya fue utilizada.');
  const policy=await companionPolicy(db,ctx),promo=policy.promotion;
  if(!policy.eligible) fail(policy.reason || 'Esta reserva no permite cortesías.');
  if(policy.mode!=='promo_free' || !promo?.eligible) return fail('No quedan cortesías de promoción en esta membresía.');
  if(input.guests.length!==promo.requiredGuests) fail(promo.requiredGuests===2?'Registra las dos invitadas juntas para usar esta promoción.':'Registra una invitada para usar esta cortesía.');
  const phones=input.guests.map(g=>normalizeMxPhone(g.phone));
  if(phones.some(p=>p.length!==10)) fail('Escribe un teléfono válido de 10 dígitos.');
  if(new Set(phones).size!==phones.length) fail('Cada invitada debe tener un teléfono diferente.');
  const results=[];
  for(let i=0;i<input.guests.length;i++) {
    const guestInput=input.guests[i],phone=phones[i];
    if(!(await db.query(`SELECT pg_try_advisory_xact_lock(hashtextextended($1,0)) locked`,[`companion-phone:${phone}`])).rows[0].locked) fail('Hay otra solicitud en proceso para esta invitada. Intenta nuevamente.');
    const guest=await findOrCreateGuest(db,{name:guestInput.name,phone});
    if(guest.userId===ctx.host.user_id) fail('La invitada debe ser otra persona.');
    const c=(await db.query(`INSERT INTO booking_companions
      (request_id,host_booking_id,membership_id,guest_user_id,guest_name,mode,status,cycle_start,amount,campaign_id,promotion_slot,promotion_request_id)
      VALUES($1,$2,$3,$4,$5,'promo_free','confirmed',$6,0,$7,$8,$9) RETURNING *`,
      [i===0?input.requestId:randomUUID(),ctx.host.id,ctx.membership.id,guest.userId,guestInput.name,policy.cycle,promo.campaignId,promo.availableSlots[i],input.requestId])).rows[0];
    await confirmCompanion(db,c,ctx,actor);
    results.push((await db.query('SELECT * FROM booking_companions WHERE id=$1',[c.id])).rows[0]);
  }
  return results;
}
