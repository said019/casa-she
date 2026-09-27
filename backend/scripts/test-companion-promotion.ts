import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {companionDDL} from '../src/lib/companionSchema.js';
import {lockCompanionHost,companionPolicy} from '../src/lib/companions.js';
import {bookPromotionalCompanions} from '../src/lib/companionPromotionBooking.js';
import {promotionalGuestCount} from '../src/lib/companionPromotion.js';

const url=new URL(process.env.TEST_DATABASE_URL||'');
assert.ok(['localhost','127.0.0.1'].includes(url.hostname),'Only localhost test databases');
const pool=new pg.Pool({connectionString:url.toString()});
const db=await pool.connect(),other=await pool.connect();
const schema=`promo_${randomUUID().replaceAll('-','')}`;
let phoneCounter=0;
const guest=()=>({name:`Invitada ${++phoneCounter}`,phone:`551${String(phoneCounter).padStart(7,'0')}`});
try {
 await db.query(`CREATE SCHEMA ${schema}; SET search_path TO ${schema}`);await other.query(`SET search_path TO ${schema}`);
 await db.query(`
 CREATE TABLE users(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),email text,phone text,display_name text,password_hash text,role text);
 CREATE TABLE plans(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),duration_days int DEFAULT 30,multi_credits int,is_internal boolean DEFAULT false);
 CREATE TABLE orders(id uuid PRIMARY KEY,facility_id uuid);
 CREATE TABLE memberships(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,plan_id uuid,order_id uuid,facility_id uuid,status text DEFAULT 'active',start_date date DEFAULT '2026-09-20',end_date date DEFAULT '2026-10-31',multi_remaining int,reformer_remaining int DEFAULT 0);
 CREATE TABLE class_types(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),category text DEFAULT 'multi');
 CREATE TABLE classes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),class_type_id uuid,facility_id uuid,date date DEFAULT '2026-10-10',start_time time DEFAULT '10:00',status text DEFAULT 'scheduled',booking_closed boolean DEFAULT false,current_bookings int DEFAULT 0,max_capacity int DEFAULT 8);
 CREATE TABLE bookings(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),class_id uuid,user_id uuid,membership_id uuid,status text DEFAULT 'confirmed',consumed_category text,booked_by uuid,is_free_booking boolean DEFAULT false,cancelled_at timestamptz);
 CREATE UNIQUE INDEX active_booking ON bookings(class_id,user_id) WHERE status<>'cancelled';
 CREATE TABLE payments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,amount numeric,currency varchar(3),payment_method text,status text,provider text,reference_id text);
 CREATE TABLE bio_checkout_sessions(class_id uuid,status text,expires_at timestamptz);
 CREATE TABLE system_settings(key text PRIMARY KEY,value jsonb);
 INSERT INTO system_settings VALUES('cancellation_policy','{"min_hours":5}');
 CREATE FUNCTION booking_count() RETURNS trigger AS $$ BEGIN
 IF TG_OP='INSERT' AND NEW.status='confirmed' THEN UPDATE classes SET current_bookings=current_bookings+1 WHERE id=NEW.class_id;
 ELSIF TG_OP='UPDATE' AND NEW.status='cancelled' AND OLD.status='confirmed' THEN UPDATE classes SET current_bookings=current_bookings-1 WHERE id=NEW.class_id; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql;
 CREATE TRIGGER count_booking AFTER INSERT OR UPDATE ON bookings FOR EACH ROW EXECUTE FUNCTION booking_count();`);
 await db.query(companionDDL);await db.query(companionDDL);
 const type=(await db.query('INSERT INTO class_types DEFAULT VALUES RETURNING id')).rows[0].id;
 async function fixture(credits:number|null,remaining=credits) {
   const u=(await db.query('INSERT INTO users DEFAULT VALUES RETURNING id')).rows[0].id;
   const p=(await db.query('INSERT INTO plans(multi_credits) VALUES($1) RETURNING id',[credits])).rows[0].id;
   const m=(await db.query('INSERT INTO memberships(user_id,plan_id,multi_remaining) VALUES($1,$2,$3) RETURNING id',[u,p,remaining])).rows[0].id;
   const c=(await db.query('INSERT INTO classes(class_type_id) VALUES($1) RETURNING id',[type])).rows[0].id;
   const b=(await db.query('INSERT INTO bookings(class_id,user_id,membership_id) VALUES($1,$2,$3) RETURNING id',[c,u,m])).rows[0].id;
   return {u,p,m,c,b};
 }
 const ctx=async(client:pg.PoolClient,b:string)=>{
   const context=await lockCompanionHost(client,b);
   context.cls.studio_today='2026-09-27';context.cls.future=true;return context;
 };
 async function attempt(b:string,guests= [guest()],requestId=randomUUID()) {
   await db.query('SAVEPOINT attempt');
   try {return await bookPromotionalCompanions(db,await ctx(db,b),{requestId,guests},(await ctx(db,b)).host.user_id);}
   catch(e){await db.query('ROLLBACK TO SAVEPOINT attempt');throw e;}
 }
 // Position the real SQL cancellation cutoff around now, independent of the
 // machine's date. This isolated setting is never used against production.
 async function cancelGuests(classId:string,ids:string[],timely=true) {
  await db.query(`UPDATE system_settings SET value=jsonb_build_object('min_hours',
   (SELECT extract(epoch FROM (((date+start_time) AT TIME ZONE 'America/Mexico_City')-now()))/3600 + $2::int FROM classes WHERE id=$1)) WHERE key='cancellation_policy'`,[classId,timely?-1:1]);
  await db.query("UPDATE bookings SET status='cancelled' WHERE id=ANY($1::uuid[])",[ids]);
  await db.query(`UPDATE system_settings SET value='{"min_hours":5}' WHERE key='cancellation_policy'`);
 }
 assert.equal(promotionalGuestCount({duration_days:30,multi_credits:8}),1);
 assert.equal(promotionalGuestCount({duration_days:30,multi_credits:null}),2);
 assert.equal(promotionalGuestCount({duration_days:30,multi_credits:5}),0);
 assert.equal(promotionalGuestCount({duration_days:7,multi_credits:null}),0);
 await db.query('BEGIN');
 const pack=await fixture(8,0),monthly=await fixture(null);
 assert.equal((await companionPolicy(db,await ctx(db,pack.b))).eligible,true,'courtesy works with zero remaining host credits');
 const one=await attempt(pack.b);assert.equal(one.length,1);
 assert.equal((await db.query('SELECT multi_remaining FROM memberships WHERE id=$1',[pack.m])).rows[0].multi_remaining,0);
 await assert.rejects(attempt(pack.b),/créditos|cortesías/);
 await assert.rejects(attempt(monthly.b),/dos invitadas juntas/);
 const repeated=guest();await assert.rejects(attempt(monthly.b,[repeated,repeated]),/teléfono diferente/);
 await db.query('UPDATE classes SET max_capacity=2 WHERE id=$1',[monthly.c]);
 await assert.rejects(attempt(monthly.b,[guest(),guest()]),/dos lugares/);
 assert.equal((await db.query('SELECT count(*)::int n FROM booking_companions WHERE membership_id=$1',[monthly.m])).rows[0].n,0);
 await db.query('UPDATE classes SET max_capacity=8 WHERE id=$1',[monthly.c]);
 const duplicate=guest();const user=(await db.query('INSERT INTO users(phone) VALUES($1) RETURNING id',[duplicate.phone])).rows[0];
 const existing=(await db.query('INSERT INTO bookings(class_id,user_id) VALUES($1,$2) RETURNING id',[monthly.c,user.id])).rows[0];
 await assert.rejects(attempt(monthly.b,[guest(),duplicate]),/ya tiene una reserva/);
 assert.equal((await db.query('SELECT count(*)::int n FROM booking_companions WHERE membership_id=$1',[monthly.m])).rows[0].n,0,'second guest failure rolls back first');
 await db.query("UPDATE bookings SET status='cancelled' WHERE id=$1",[existing.id]);
 const batchId=randomUUID(),pair=[guest(),guest()];const two=await attempt(monthly.b,pair,batchId);
 assert.equal(two.length,2);assert.equal(two[0].mode,'promo_free');
 assert.deepEqual((await attempt(monthly.b,pair,batchId)).map(r=>r.id),two.map(r=>r.id),'retry returns same bookings');
 await assert.rejects(attempt(monthly.b,[guest(),guest()]),/2 invitadas|cortesías/);
 await cancelGuests(monthly.c,[two[0].guest_booking_id]);
 const partial=await companionPolicy(db,await ctx(db,monthly.b));assert.equal(partial.promotion?.requiredGuests,1);
 const nextClass=(await db.query('INSERT INTO classes(class_type_id) VALUES($1) RETURNING id',[type])).rows[0].id;
 const nextHost=(await db.query('INSERT INTO bookings(class_id,user_id,membership_id) VALUES($1,$2,$3) RETURNING id',[nextClass,monthly.u,monthly.m])).rows[0].id;
 await assert.rejects(attempt(nextHost),/misma clase/);
 const replacement=await attempt(monthly.b);assert.equal(replacement.length,1);
 await cancelGuests(monthly.c,[two[1].guest_booking_id,replacement[0].guest_booking_id]);
 assert.equal((await companionPolicy(db,await ctx(db,nextHost))).promotion?.requiredGuests,2,'all timely cancellations allow new occasion');
 const dateCtx=await ctx(db,monthly.b);
 for(const date of ['2026-09-28','2026-10-31']) {dateCtx.cls.date=date;assert.equal((await companionPolicy(db,dateCtx)).promotion?.total,2);}
 for(const date of ['2026-09-27','2026-11-01']) {dateCtx.cls.date=date;assert.equal((await companionPolicy(db,dateCtx)).promotion,null);}
 dateCtx.cls.date='2026-10-10';dateCtx.cls.studio_today='2026-11-01';assert.equal((await companionPolicy(db,dateCtx)).promotion,null);
 await db.query("UPDATE memberships SET status='expired' WHERE id=$1",[monthly.m]);
 await assert.rejects(attempt(nextHost,[guest(),guest()]),/vigente/);
 const late=await fixture(null);const latePair=await attempt(late.b,[guest(),guest()]);
 await cancelGuests(late.c,latePair.map(g=>g.guest_booking_id),false);
 const exhausted=await companionPolicy(db,await ctx(db,late.b));
 assert.equal(exhausted.promotion?.remaining,0,'late cancellation does not restore courtesy');
 assert.equal(exhausted.mode,'paid');assert.equal(exhausted.amount,280);
 const paymentPolicy=await companionPolicy(db,await ctx(db,pack.b),undefined,{payment:true});
 assert.equal(paymentPolicy.promotion,null,'pending payment policy never switches into promotion');
 await db.query('COMMIT');

 // Two distinct classes race for the same membership coupon; the membership lock
 // makes the loser re-read the committed campaign ledger rather than double-spend.
 const race=await fixture(8),raceClass=(await db.query('INSERT INTO classes(class_type_id) VALUES($1) RETURNING id',[type])).rows[0].id;
 const raceHost=(await db.query('INSERT INTO bookings(class_id,user_id,membership_id) VALUES($1,$2,$3) RETURNING id',[raceClass,race.u,race.m])).rows[0].id;
 await db.query('BEGIN');await other.query('BEGIN');
 const a=await ctx(db,race.b);
 const losing=(async()=>{
   try {const b=await ctx(other,raceHost);await bookPromotionalCompanions(other,b,{requestId:randomUUID(),guests:[guest()]},race.u);return false;}
   catch {return true;}
 })();
 await bookPromotionalCompanions(db,a,{requestId:randomUUID(),guests:[guest()]},race.u);
 await db.query('COMMIT');assert.equal(await losing,true,'concurrent second claim rejected');await other.query('ROLLBACK');
 assert.equal((await db.query('SELECT count(*)::int n FROM booking_companions WHERE membership_id=$1',[race.m])).rows[0].n,1);
 console.log('Promotion: dates, zero credits, atomic pair, phone uniqueness, idempotency, capacity, cancellation, same occasion and concurrent quota PASS');
} finally {await db.query('ROLLBACK');await other.query('ROLLBACK');await db.query(`DROP SCHEMA ${schema} CASCADE`);db.release();other.release();await pool.end();}
