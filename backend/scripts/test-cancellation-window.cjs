// Executes the real PostgreSQL functions against isolated temporary tables.
// No real bookings, payments, or memberships are changed. Always rolls back.
const { Client } = require('pg');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
async function main() {
  const sourcePath = process.env.CANCELLATION_SOURCE || path.join(__dirname, '../src/index.ts');
  const source = process.env.CANCELLATION_SOURCE_TEXT || fs.readFileSync(sourcePath, 'utf8');
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    await c.query('BEGIN');
    await c.query(`
      CREATE TEMP TABLE system_settings(key text,value jsonb);
      INSERT INTO system_settings VALUES ('cancellation_policy','{"enabled":true,"min_hours":5,"refund_credit_on_cancel":true}');
      CREATE TEMP TABLE classes(id uuid,date date,start_time time);
      CREATE TEMP TABLE memberships(id uuid,cancellations_used int,cancellation_limit int,classes_remaining int,reformer_remaining int,multi_remaining int);
      CREATE TEMP TABLE bookings(id uuid,class_id uuid,user_id uuid,status text,membership_id uuid,is_free_booking boolean,is_companion_booking boolean,consumed_category text,cancelled_at timestamptz,cancelled_by uuid,cancellation_reason text,updated_at timestamptz);
      CREATE TEMP TABLE user_benefits(used_on_booking_id uuid,status text,used_at timestamptz,used_by uuid,expires_at timestamptz);
    `);
    for (const name of ['cancel_booking', 'preview_cancel_booking']) {
      const start = source.indexOf('CREATE OR REPLACE FUNCTION ' + name + '(');
      const end = source.indexOf('$func$ LANGUAGE plpgsql;', start);
      assert(start >= 0 && end > start, 'Function definition missing: ' + name);
      const sql = source.slice(start, end + '$func$ LANGUAGE plpgsql;'.length)
        .replace('FUNCTION ' + name + '(', 'FUNCTION pg_temp.' + name + '(');
      await c.query(sql);
    }
    for (const [label, seconds, expected, forceRefund, free] of [
      ['6 hours',21600,true,null,false],
      ['exactly 5 hours',18000,true,null,false],
      ['5 hours minus 1 second',17999,false,null,false],
      ['client cannot force a late refund',17999,false,true,false],
      ['free benefit timely',18000,false,null,true],
      ['free benefit late',17999,false,null,true],
    ]) {
      const user=randomUUID(), cls=randomUUID(), member=randomUUID(), booking=randomUUID();
      await c.query(`INSERT INTO classes SELECT $1,(t AT TIME ZONE 'America/Mexico_City')::date,(t AT TIME ZONE 'America/Mexico_City')::time FROM (SELECT now()+$2*interval '1 second' t) q`,[cls,seconds]);
      await c.query('INSERT INTO memberships VALUES ($1,0,999,3,0,3)',[member]);
      await c.query(`INSERT INTO bookings(id,class_id,user_id,status,membership_id,is_free_booking,is_companion_booking,consumed_category) VALUES($1,$2,$3,'confirmed',$4,$5,false,'multi')`,[booking,cls,user,member,free]);
      if(free) await c.query(`INSERT INTO user_benefits VALUES($1,'used',now(),$2,now()+interval '1 day')`,[booking,user]);
      const preview=(await c.query('SELECT * FROM pg_temp.preview_cancel_booking($1,$2,false)',[booking,user])).rows[0];
      assert.equal(preview.out_would_refund,expected,label+' preview');
      const result=(await c.query('SELECT * FROM pg_temp.cancel_booking($1,$2,false,$3,false)',[booking,user,forceRefund])).rows[0];
      assert.equal(result.out_refunded,expected,label+' refund');
      assert.equal((await c.query('SELECT multi_remaining FROM memberships WHERE id=$1',[member])).rows[0].multi_remaining,expected?4:3,label+' balance');
      assert.equal((await c.query('SELECT status FROM bookings WHERE id=$1',[booking])).rows[0].status,'cancelled');
      if(free) {
        assert.equal((await c.query('SELECT count(*)::int n FROM user_benefits WHERE used_on_booking_id=$1 AND status=\'used\'',[booking])).rows[0].n,seconds>=18000?0:1);
      }
      await c.query('SAVEPOINT repeat_cancel');
      await assert.rejects(c.query('SELECT * FROM pg_temp.cancel_booking($1,$2,false,null,false)',[booking,user]),/ALREADY_CANCELLED/);
      await c.query('ROLLBACK TO SAVEPOINT repeat_cancel');
      console.log('PASS:',label,'— no duplicate refund');
    }
  } finally { await c.query('ROLLBACK'); await c.end(); }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
