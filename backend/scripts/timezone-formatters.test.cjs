const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadModule, result } = require('./timezone-fixture-loader.cjs');
const zones = ['America/Mexico_City', 'America/Tijuana', 'America/Hermosillo', 'UTC', 'Europe/Berlin'];
const dates = [
 '2022-04-03T07:59:59Z','2022-04-03T08:00:00Z',
 '2022-10-30T06:59:59Z','2022-10-30T07:00:00Z',
 '2026-03-08T09:59:59Z','2026-03-08T10:00:00Z',
 '2026-11-01T08:59:59Z','2026-11-01T09:00:00Z',
 '2026-10-01T05:59:59.987Z','2026-10-01T06:00:00.123Z',
 '2028-02-29T15:30:00Z','2027-01-01T05:30:00Z',
];
test('identical date strings and offsets across historic Mexican and current DST boundaries', () => {
 const before=loadModule('before').functions, after=loadModule('after').functions;
 for(const zone of zones) for(const iso of dates) {
   assert.deepEqual(result(after.localDateStr,new Date(iso),zone),result(before.localDateStr,new Date(iso),zone));
   if(before.tzOffsetMs) assert.deepEqual(result(after.tzOffsetMs,new Date(iso),zone),result(before.tzOffsetMs,new Date(iso),zone));
 }
});
test('identical wall-clock conversion including ambiguous/nonexistent local times', () => {
 const before=loadModule('before').functions, after=loadModule('after').functions;
 for(const zone of zones) for(const day of ['2022-04-03','2022-10-30','2026-03-08','2026-11-01','2028-02-29','2026-12-31']) for(const time of ['00:00','01:30','02:30','23:59']) {
   assert.deepEqual(result(after.localDateTimeUtc,day,time,zone),result(before.localDateTimeUtc,day,time,zone));
   if(before.localMidnightUtc) assert.deepEqual(result(after.localMidnightUtc,day,zone),result(before.localMidnightUtc,day,zone));
 }
});
test('default zone/env and omitted current-date branches preserve legacy behavior', () => {
 for(const timezone of [undefined,'America/Hermosillo','America/Tijuana']) {
   const before=loadModule('before',{timezone}).functions, after=loadModule('after',{timezone}).functions;
   assert.equal(after.GYM_TIMEZONE,before.GYM_TIMEZONE);
   assert.deepEqual(result(after.localDateStr,new Date(dates[0])),result(before.localDateStr,new Date(dates[0])));
   assert.deepEqual(result(after.localDateStr),result(before.localDateStr));
   assert.deepEqual(result(after.localDateTimeUtc,'2026-06-15','09:00'),result(before.localDateTimeUtc,'2026-06-15','09:00'));
 }
});
test('invalid dates, times and zones retain results/error type/message', () => {
 const before=loadModule('before').functions, after=loadModule('after').functions;
 for(const zone of ['UTC','invalid/timezone','',undefined]) {
   assert.deepEqual(result(after.localDateStr,new Date(NaN),zone),result(before.localDateStr,new Date(NaN),zone));
   assert.deepEqual(result(after.localDateStr,new Date(dates[0]),zone),result(before.localDateStr,new Date(dates[0]),zone));
   for(const [day,time] of [['bad-date','invalid'],['2026-06-15','bad'],['2026-99-99','25:99']]) {
     assert.deepEqual(result(after.localDateTimeUtc,day,time,zone),result(before.localDateTimeUtc,day,time,zone));
   }
 }
});
test('repeated dates reuse configuration but never retain offsets/date results', () => {
 const after=loadModule('after'), before=loadModule('before');
 for(let i=0;i<100;i++) {
   const zone=zones[i%zones.length], iso=dates[i%dates.length];
   assert.deepEqual(result(after.functions.localDateStr,new Date(iso),zone),result(before.functions.localDateStr,new Date(iso),zone));
   assert.deepEqual(result(after.functions.localDateTimeUtc,iso.slice(0,10),'09:00',zone),result(before.functions.localDateTimeUtc,iso.slice(0,10),'09:00',zone));
 }
 assert.ok(after.count() <= zones.length*2);
 assert.ok(before.count() >= 200);
 const count=after.count();
 for(let i=0;i<100;i++) after.functions.localDateTimeUtc('2026-06-15','09:00','UTC');
 assert.equal(after.count(),count);
});
test('formatter cache bounds each fixed format to 16 LRU entries, failed zones do not evict', () => {
 const subject=loadModule('after'), lookup=subject.factory.createTimezoneFormatter('en-US',{year:'numeric'});
 const supported=Intl.supportedValuesOf('timeZone').slice(0,17);
 const first=lookup(supported[0]);
 for(const zone of supported.slice(1,16)) lookup(zone);
 assert.equal(subject.count(),16);assert.equal(lookup(supported[0]),first);
 assert.throws(()=>lookup('invalid/timezone'),RangeError);
 assert.equal(lookup(supported[0]),first);
 lookup(supported[16]);
 assert.equal(lookup(supported[0]),first); // recently used entry retained
 const before=subject.count();lookup(supported[1]);assert.equal(subject.count(),before+1); // oldest evicted
});
test('fixed options are snapshotted; callers cannot mutate cache configuration', () => {
 const subject=loadModule('after'), options={year:'numeric'};
 const lookup=subject.factory.createTimezoneFormatter('en-US',options);
 options.month='long';
 assert.equal(lookup('UTC').format(new Date('2026-06-15T12:00:00Z')),'2026');
});
