import pg from 'pg';
import assert from 'node:assert/strict';
import {octoberClasses,octoberWindow} from '../src/data/october2026.js';

const apply=process.argv.includes('--apply');
const facility='ca67d57b-9219-4821-b6da-b86a4bbc1f03';
// Verified legacy Casa Shé rows surfaced by the public API without a facility.
// Explicit IDs avoid touching any other studio's unassigned classes.
const legacyIds=['09f38162-f2fd-4302-b63c-1b1ca34552d1','b0e297dc-b997-4e7b-9046-0e3b1f7d08f3'];
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:10000});
const db=await pool.connect();
try {
 await db.query('BEGIN');
 await db.query(`SET LOCAL lock_timeout='10s'`);
 // This one-time operation also blocks new class/booking/checkout inserts during reconciliation.
 await db.query('LOCK TABLE classes,bookings,bio_checkout_sessions,channel_inventory IN SHARE ROW EXCLUSIVE MODE');
 assert.equal((await db.query('SELECT name FROM facilities WHERE id=$1',[facility])).rows[0]?.name,'Casa Shé — Condesa');
 assert.equal((await db.query('SELECT date FROM studio_closed_days WHERE date BETWEEN $1 AND $2',[octoberWindow.start,octoberWindow.end])).rowCount,0,'Closed days require explicit review');
 const instructors=(await db.query('SELECT id,display_name FROM instructors WHERE is_active=true')).rows;
 if(!instructors.some(i=>i.display_name==='Román')) {
  assert.equal((await db.query(`SELECT id FROM instructors WHERE display_name='Román'`)).rowCount,0,'Existing inactive Roman needs review');
  const user=(await db.query(`INSERT INTO users(email,phone,display_name,role,is_active) VALUES('agenda-roman-oct2026@internal.invalid','','Román','instructor',false) RETURNING id`)).rows[0];
  const coach=(await db.query(`INSERT INTO instructors(user_id,display_name,is_active) VALUES($1,'Román',true) RETURNING id,display_name`,[user.id])).rows[0];
  instructors.push(coach);
 }
 let types=(await db.query('SELECT * FROM class_types WHERE facility_id=$1 OR facility_id IS NULL',[facility])).rows;
 for(const [name,source] of [['Sculpt Full Body','Sculpt'],['Sculpt (Abs & Butt)','Sculpt'],['Mat Power Abs','Power Abs'],['Barre Funcional','Barre']]) {
  if(types.some(t=>t.name===name)) continue;
  const base=types.find(t=>t.name===source); assert(base,`Missing base ${source}`);
  const t=(await db.query(`INSERT INTO class_types(name,description,level,category,duration_minutes,max_capacity,icon,color,is_active,spot_icon,facility_id,totalpass_default_spots)
   SELECT $1,description,level,category,duration_minutes,max_capacity,icon,color,true,spot_icon,facility_id,totalpass_default_spots FROM class_types WHERE id=$2 RETURNING *`,[name,base.id])).rows[0];
  types.push(t);
 }
 const desired=octoberClasses().map(d=>{
  const matches=types.filter(t=>t.name===d.type);assert.equal(matches.length,1,`Ambiguous type ${d.type}`);
  const coaches=instructors.filter(i=>i.display_name===d.coach);assert.equal(coaches.length,1,`Ambiguous coach ${d.coach}`);
  return {...d,typeId:matches[0].id,coachId:coaches[0].id,duration:matches[0].duration_minutes,capacity:matches[0].max_capacity};
 });
 assert.equal(desired.length,257);
 const typeIds=[...new Set(desired.map(d=>d.typeId))];
 await db.query('UPDATE class_types SET is_active=true WHERE id=ANY($1::uuid[]) AND NOT is_active',[typeIds]);
 const rows=(await db.query(`SELECT c.*,c.date::text AS "day",to_char(c.start_time,'HH24:MI') AS "time",
  (SELECT count(*) FROM bookings b WHERE b.class_id=c.id AND b.status<>'cancelled')::int reservations,
  (SELECT count(*) FROM bio_checkout_sessions s WHERE s.class_id=c.id AND s.status IN ('pending_payment','paid','ready') AND s.expires_at>now())::int holds,
  COALESCE((SELECT sum(booked_spots) FROM channel_inventory ci WHERE ci.class_id=c.id),0)::int partner_booked
  FROM classes c WHERE (c.facility_id=$1 OR (c.facility_id IS NULL AND c.id=ANY($4::uuid[]))) AND c.date BETWEEN $2 AND $3 AND c.status='scheduled' ORDER BY current_bookings DESC,c.id`,[facility,octoberWindow.start,octoberWindow.end,legacyIds])).rows;
 const used=new Set<string>();const assignments=new Map<object,any>();
 // Reserve all exact matches first, including the existing booked Flow Yoga.
 for(const d of desired) {
  const r=rows.find(r=>!used.has(r.id)&&r.day===d.date&&r.time===d.time&&r.class_type_id===d.typeId&&r.instructor_id===d.coachId);
  if(r){used.add(r.id);assignments.set(d,r);}
 }
 const safe=(r:any)=>!r.current_bookings&&!r.reservations&&!r.holds&&!r.partner_booked;
 for(const d of desired) if(!assignments.has(d)) {
  const r=rows.find(r=>!used.has(r.id)&&safe(r)&&r.day===d.date&&r.time===d.time&&r.instructor_id===d.coachId);
  if(r){used.add(r.id);assignments.set(d,r);}
 }
 const obsolete=rows.filter(r=>!used.has(r.id));
 for(const r of obsolete) assert(safe(r),`Cannot retire occupied class ${r.id} ${r.day} ${r.time}`);
 const stats={keep:0,update:0,create:0,cancel:obsolete.length,classes:desired.length};
 const changed:string[]=[];
 const additions:typeof desired=[];
 const changes:object[]=[];
 for(const d of desired) {
  const r=assignments.get(d);
  if(r && r.class_type_id===d.typeId && r.instructor_id===d.coachId) {
   if(d.intensity!==undefined && r.intensity!==d.intensity) {await db.query('UPDATE classes SET intensity=$2,updated_at=now() WHERE id=$1',[r.id,d.intensity]);changed.push(r.id);stats.update++;}
   else stats.keep++;
  } else if(r) {
   assert(safe(r));
   changes.push({date:d.date,time:d.time,from:types.find(t=>t.id===r.class_type_id)?.name,to:d.type,coach:d.coach});
   await db.query(`UPDATE classes SET class_type_id=$2,instructor_id=$3,end_time=start_time+($4::int*interval '1 minute'),schedule_id=NULL,intensity=COALESCE($5,intensity),updated_at=now() WHERE id=$1`,[r.id,d.typeId,d.coachId,d.duration,d.intensity??null]);
   changed.push(r.id);stats.update++;
  } else {
   additions.push(d);stats.create++;
  }
 }
 await db.query(`INSERT INTO classes(class_type_id,instructor_id,facility_id,date,start_time,end_time,max_capacity,intensity)
  SELECT "typeId","coachId",$2::uuid,date,time,time+(duration*interval '1 minute'),capacity,intensity
  FROM jsonb_to_recordset($1::jsonb) AS x("typeId" uuid,"coachId" uuid,date date,time time,duration int,capacity int,intensity int)`,[JSON.stringify(additions),facility]);
 const canceled=obsolete.map(r=>r.id);
 await db.query(`UPDATE classes SET status='cancelled',cancelled_at=now(),cancellation_reason='Actualización de horario aprobada para 28 septiembre–31 octubre 2026',updated_at=now() WHERE id=ANY($1::uuid[])`,[canceled]);
 await db.query(`UPDATE partner_class_mappings SET sync_status='pending_resync',updated_at=now() WHERE class_id=ANY($1::uuid[]) AND channel='totalpass' AND sync_status IN ('published','pending_resync')`,[changed]);
 await db.query(`UPDATE partner_class_mappings SET sync_status='pending_delete',updated_at=now() WHERE class_id=ANY($1::uuid[]) AND channel='totalpass' AND sync_status IN ('published','pending_resync')`,[canceled]);
 const final=(await db.query(`SELECT date::text date,to_char(start_time,'HH24:MI') time,class_type_id "typeId",instructor_id "coachId" FROM classes WHERE facility_id=$1 AND date BETWEEN $2 AND $3 AND status='scheduled'`,[facility,octoberWindow.start,octoberWindow.end])).rows;
 const key=(d:any)=>[d.date,d.time,d.typeId,d.coachId].join('|');
 assert.deepEqual(final.map(key).sort(),desired.map(key).sort());
 console.log(JSON.stringify({mode:apply?'APPLIED':'DRY RUN — rolled back',...stats,changes,
  preservedReservations:rows.filter(r=>r.reservations>0&&used.has(r.id)).map(r=>({id:r.id,date:r.day,time:r.time,reservations:r.reservations})),
  canceledClasses:obsolete.map(r=>({id:r.id,date:r.day,time:r.time,type:types.find(t=>t.id===r.class_type_id)?.name,coach:instructors.find(i=>i.id===r.instructor_id)?.display_name}))},null,2));
 await db.query(apply?'COMMIT':'ROLLBACK');
} catch(error) {await db.query('ROLLBACK');throw error;} finally {db.release();await pool.end();}
