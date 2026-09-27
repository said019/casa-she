import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isOctoberManagedDate,octoberClasses,octoberWeek} from '../src/data/october2026.js';
const facility='ca67d57b-9219-4821-b6da-b86a4bbc1f03';
for(const date of ['2026-09-28','2026-10-01','2026-10-31']) assert(isOctoberManagedDate(facility,date));
for(const date of ['2026-09-27','2026-11-01']) assert(!isOctoberManagedDate(facility,date));
assert(!isOctoberManagedDate(null,'2026-10-01'));assert(!isOctoberManagedDate('other-studio','2026-10-01'));
const classes=octoberClasses();assert.equal(classes.length,257);assert.equal(octoberWeek.length,52);
assert.equal(new Set(classes.map(c=>[c.date,c.time,c.type,c.coach].join('|'))).size,257);
const nav=classes.filter(c=>c.type==='Navakarana'&&c.time==='19:00');assert.equal(nav.length,5);assert(nav.every(c=>c.intensity===2&&c.coach==='Pau'));
// Guard both entry points, before they can query/insert the old recurring slot.
for(const [path,variable] of [['../src/services/cron-jobs.ts','schedule'],['../src/routes/classes.ts','sched']]) {
 const source=readFileSync(new URL(path,import.meta.url),'utf8');
 assert(source.includes(`if (isOctoberManagedDate(${variable}.facility_id,dateStr)) { classesSkipped++; continue; }`));
}
console.log('October schedule: 257 unique classes, Tuesday intensity, bounded cron/manual generation guards PASS');
