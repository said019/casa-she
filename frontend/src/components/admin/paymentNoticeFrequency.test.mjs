import test from 'node:test';
import assert from 'node:assert/strict';
import {noticeWindow,eligibleNotice,claimNotice} from './paymentNoticeFrequency.js';
const storage=()=>{const m=new Map();return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v)};};
test('Mexico slots midnight, noon, 19:00 independent of host timezone',()=>{
 for(const [utc,expected] of [['2026-10-14T06:00:00Z','2026-10-14:morning'],['2026-10-14T17:59:59Z','2026-10-14:morning'],['2026-10-14T18:00:00Z','2026-10-14:afternoon'],['2026-10-15T00:59:59Z','2026-10-14:afternoon'],['2026-10-15T01:00:00Z','2026-10-14:night'],['2026-10-15T06:00:00Z','2026-10-15:morning']])assert.equal(noticeWindow(new Date(utc)),expected);
});
test('reload, dismissal, changed text/date cannot reclaim slot; next slot/day allowed',async()=>{
 const s=storage();for(const slot of ['2026-10-14:morning','2026-10-14:afternoon','2026-10-14:night','2026-10-15:morning']){assert.equal(await claimNotice(slot,s),true);assert.equal(await claimNotice(slot,s),false);}
});
test('blocked storage and cancelled claim fail closed',async()=>{
 assert.equal(await claimNotice('x',{getItem(){throw Error('blocked')}}),false);
 assert.equal(await claimNotice('x',storage(),undefined,()=>false),false);
});
test('locks serialize concurrent tabs and recheck durable state',async()=>{
 let chain=Promise.resolve();const locks={request:(_name,fn)=>{const next=chain.then(fn);chain=next;return next;}};const s=storage();
 assert.deepEqual(await Promise.all([claimNotice('a',s,locks),claimNotice('a',s,locks)]),[true,false]);
});
test('only valid due today or tomorrow consumes eligibility',()=>{
 const now=new Date('2026-10-14T18:00:00Z');
 for(const date of ['2026-10-14','2026-10-15'])assert.equal(eligibleNotice({fecha:date,texto:'Pago'},now),true);
 for(const date of ['2026-10-13','2026-10-16','2026-02-30','invalid'])assert.equal(eligibleNotice({fecha:date,texto:'Pago'},now),false);
 assert.equal(eligibleNotice(null,now),false);
});
