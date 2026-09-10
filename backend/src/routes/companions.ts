import { Router, type Request } from 'express';
import { z } from 'zod';
import { pool } from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import { resolveRequestFacility } from '../lib/requestFacility.js';
import { findOrCreateGuest, normalizeMxPhone } from '../lib/guestUser.js';
import { createPreference, mpConfigured } from '../lib/mercadopago.js';
import { CompanionError, fail, lockCompanionHost, companionPolicy, confirmCompanion, receiveCompanionPayment } from '../lib/companions.js';
import type { PoolClient } from 'pg';
import {companionCancellationEffects} from '../lib/companionCancellationEffects.js';

const router = Router();
router.use(authenticate);
const uuid=z.string().uuid();
const staff=(req: Request)=>['admin','super_admin','reception'].includes(req.user!.role);
async function authorize(req: Request, ctx: Awaited<ReturnType<typeof lockCompanionHost>>) {
  if (staff(req)) {
    const scope=await resolveRequestFacility(req.user,(req.query.facility_id as string)||null);
    if (scope.kind==='error' || (scope.kind==='facility' && scope.facilityId!==ctx.cls.facility_id)) fail('No tienes acceso a este estudio.');
  } else if (ctx.host.user_id!==req.user!.userId) fail('No tienes acceso a esta reserva.');
}
const publicColumns='id,guest_name,mode,status,amount,checkout_url,guest_booking_id,reason';
const list=(db: PoolClient,hostId:string)=>db.query(`SELECT ${publicColumns} FROM booking_companions WHERE host_booking_id=$1 ORDER BY created_at`,[hostId]);
// Every endpoint is transactional, including GET policy, to use the same quota snapshot.
function endpoint(fn:(req:Request,db:PoolClient,afterCommit:Array<()=>Promise<void>>)=>Promise<any>) {
  return async(req:Request,res:any)=>{
    const db=await pool.connect();
    try {
      const effects:Array<()=>Promise<void>>=[];
      await db.query('BEGIN'); const result=await fn(req,db,effects); await db.query('COMMIT');
      for(const effect of effects) await effect().catch(error=>console.error('Companion post-commit effect failed',error));
      res.json(result);
    }
    catch(error) {
      await db.query('ROLLBACK');
      if(error instanceof CompanionError) return res.status(409).json({error:error.message,code:'COMPANION_RULE'});
      if(error instanceof z.ZodError) return res.status(400).json({error:'Revisa el nombre y teléfono de la invitada.',code:'COMPANION_INPUT'});
      console.error('Companion operation failed:',error);
      res.status(500).json({error:'No se pudo completar la operación de invitada. Intenta nuevamente.'});
    } finally { db.release(); }
  };
}

router.get('/review',endpoint(async(req,db)=>{
  if(!staff(req)) fail('Solo recepción puede revisar los pagos.');
  const scope=await resolveRequestFacility(req.user,(req.query.facility_id as string)||null);
  if(scope.kind==='error') fail(scope.message);
  const companions=(await db.query(`SELECT bc.*,u.display_name AS host_name,ct.name AS class_name,c.date,c.start_time
    FROM booking_companions bc JOIN bookings b ON b.id=bc.host_booking_id JOIN users u ON u.id=b.user_id
    JOIN classes c ON c.id=b.class_id JOIN class_types ct ON ct.id=c.class_type_id
    WHERE (bc.status IN ('payment_review','refund_review','pending_payment') OR bc.reason IS NOT NULL)
    AND ($1::uuid IS NULL OR c.facility_id=$1) ORDER BY bc.created_at DESC LIMIT 200`,
    [scope.kind==='facility'?scope.facilityId:null])).rows;
  return {companions};
}));
router.get('/booking/:bookingId',endpoint(async(req,db)=>{
  const id=uuid.parse(req.params.bookingId),ctx=await lockCompanionHost(db,id);
  await authorize(req,ctx);
  return {companions:(await list(db,id)).rows,policy:await companionPolicy(db,ctx)};
}));
router.post('/booking/:bookingId',endpoint(async(req,db)=>{
  const hostId=uuid.parse(req.params.bookingId);
  const input=z.object({name:z.string().trim().min(2).max(120),phone:z.string().min(10).max(25),requestId:uuid}).parse(req.body);
  const phone=normalizeMxPhone(input.phone);
  if(phone.length!==10) fail('Escribe un teléfono válido de 10 dígitos.');
  const ctx=await lockCompanionHost(db,hostId);
  await authorize(req,ctx);
  const prior=(await db.query(`SELECT ${publicColumns},host_booking_id FROM booking_companions WHERE request_id=$1`,[input.requestId])).rows[0];
  if(prior) {
    if(prior.host_booking_id!==hostId) fail('La solicitud ya fue utilizada.');
    return {companion:prior};
  }
  const policy=await companionPolicy(db,ctx);
  if(!policy.eligible) fail(policy.reason!);
  // A nonblocking identity lock avoids duplicate walk-in users across simultaneous bookings.
  if(!(await db.query(`SELECT pg_try_advisory_xact_lock(hashtextextended($1,0)) locked`,[`companion-phone:${phone}`])).rows[0].locked) fail('Hay otra solicitud en proceso para esta invitada. Intenta nuevamente.');
  const guest=await findOrCreateGuest(db,{name:input.name,phone});
  if(guest.userId===ctx.host.user_id) fail('La invitada debe ser otra persona.');
  if((await db.query(`SELECT id FROM bookings WHERE class_id=$1 AND user_id=$2 AND status<>'cancelled'`,[ctx.cls.id,guest.userId])).rows.length) fail('La invitada ya tiene una reserva para esta clase.');
  if((await db.query(`SELECT id FROM booking_companions WHERE host_booking_id=$1 AND guest_user_id=$2 AND status IN ('pending_payment','confirmed')`,[hostId,guest.userId])).rows.length) fail('Esta invitada ya está registrada.');
  const c=(await db.query(`INSERT INTO booking_companions(request_id,host_booking_id,membership_id,guest_user_id,guest_name,mode,status,cycle_start,amount)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,[input.requestId,hostId,ctx.membership.id,guest.userId,input.name,
    policy.mode,policy.mode==='paid'?'pending_payment':'confirmed',policy.cycle,policy.amount])).rows[0];
  if(policy.mode!=='paid') await confirmCompanion(db,c,ctx,req.user!.userId);
  else if(mpConfigured()) {
    // No unpaid seat is inserted. A webhook must revalidate capacity before confirming.
    const checkout=await createPreference({orderId:`companion:${c.id}`,items:[{title:'Visita de invitada Casa Shé',quantity:1,unit_price:280}],
      backUrl:`${(process.env.FRONTEND_URL||'https://www.casashe.mx').replace(/\/$/,'')}/app/classes/${hostId}`,
      notificationUrl:process.env.BACKEND_URL?`${process.env.BACKEND_URL.replace(/\/$/,'')}/webhooks/mercadopago`:undefined});
    await db.query(`UPDATE booking_companions SET checkout_url=$2 WHERE id=$1`,[c.id,checkout.checkoutUrl]);
  }
  return {companion:(await db.query(`SELECT ${publicColumns} FROM booking_companions WHERE id=$1`,[c.id])).rows[0]};
}));
router.post('/:id/receive-payment',endpoint(async(req,db)=>{
  if(!staff(req)) fail('Solo recepción puede registrar un pago recibido.');
  const id=uuid.parse(req.params.id),input=z.object({method:z.enum(['cash','transfer'])}).parse(req.body);
  const c=(await db.query(`SELECT * FROM booking_companions WHERE id=$1`,[id])).rows[0];
  if(!c) fail('Invitada no encontrada.');
  const ctx=await lockCompanionHost(db,c.host_booking_id);await authorize(req,ctx);
  // Manual receipt must not charge an ineligible request. Repeat clicks are idempotent.
  const fresh=(await db.query(`SELECT * FROM booking_companions WHERE id=$1 FOR UPDATE`,[id])).rows[0];
  if(fresh.status==='confirmed') return {success:true};
  if(fresh.status!=='pending_payment') fail('Este pago requiere revisión en recepción.');
  const policy=await companionPolicy(db,ctx,id);if(!policy.eligible) fail(policy.reason!);
  await receiveCompanionPayment(db,id,{reference:`manual-companion:${id}`,amount:280,currency:'MXN',method:input.method,actor:req.user!.userId});
  return {success:true};
}));
router.post('/:id/cancel',endpoint(async(req,db,afterCommit)=>{
  const id=uuid.parse(req.params.id),initial=(await db.query(`SELECT host_booking_id FROM booking_companions WHERE id=$1`,[id])).rows[0];
  if(!initial) fail('Invitada no encontrada.');
  const ctx=await lockCompanionHost(db,initial.host_booking_id);await authorize(req,ctx);
  const c=(await db.query(`SELECT * FROM booking_companions WHERE id=$1 FOR UPDATE`,[id])).rows[0];
  if(c.status==='cancelled') return {success:true};
  if(c.status==='pending_payment') {await db.query(`UPDATE booking_companions SET status='cancelled' WHERE id=$1`,[id]);return {success:true};}
  if(c.status!=='confirmed' || !c.guest_booking_id) fail('Esta invitada requiere revisión en recepción.');
  try {
    await db.query(`SELECT * FROM cancel_booking($1::uuid,$2::uuid,$3::boolean,NULL::boolean,false)`,[c.guest_booking_id,c.guest_user_id,staff(req)]);
    await db.query(`UPDATE bookings SET cancelled_by=$2 WHERE id=$1`,[c.guest_booking_id,req.user!.userId]);
    afterCommit.push(()=>companionCancellationEffects(c.guest_booking_id,ctx.cls.id));
  } catch(error) {
    const message=String((error as Error).message);
    if(message.includes('CANCELLATION_WINDOW_EXCEEDED')) fail('Ya pasó el plazo permitido para cancelar. Contacta a recepción.');
    if(message.includes('CLASS_ALREADY_STARTED')) fail('La clase ya empezó; contacta a recepción.');
    if(message.includes('CANCELLATIONS_DISABLED')) fail('Las cancelaciones están desactivadas. Contacta a recepción.');
    throw error;
  }
  return {success:true};
}));
export default router;
