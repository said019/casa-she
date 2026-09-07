// Exercise the actual registration function with synthetic callbacks, never the app.
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { createHash } = require('node:crypto');
const vm = require('node:vm');
const ts = require('typescript');
const source = readFileSync(resolve(__dirname, '../src/services/cron-jobs.ts'), 'utf8');
const ast = ts.createSourceFile('cron.ts', source, ts.ScriptTarget.Latest, true);
const fn = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'initializeCronJobs');
assert.ok(fn);
const expected = [
 ['TOTALPASS_TOKEN', '15 0 * * *', 'totalpassTokenJob'],
 ['TOTALPASS_PUBLISH', '20 0 * * *', 'totalpassPublishJob'],
 ['TOTALPASS_IMPORT', '*/5 * * * *', 'totalpassImportJob'],
 ['TOTALPASS_RETIRE', '0,10,20,30,40,50 * * * *', 'totalpassRetireJob'],
 ['TOTALPASS_RESYNC', '3,13,23,33,43,53 * * * *', 'totalpassResyncJob'],
];
const names = [...new Set([...fn.getText(ast).matchAll(/job\('[^']+',\s*'[^']+',\s*([a-zA-Z]\w*)/g)].map(m=>m[1]))].filter(x=>x!=='async');
for(const [, , name] of expected) names.push(name);
names.push('birthdayBonus','anniversaryBonus','streakBonus','totalpassPoolJob');
function registrations(whitelist) {
 const called=[], calls=[];
 const callbacks=Object.fromEntries(names.map(name=>[name,()=>{called.push(name);return Promise.resolve();}]));
 const scope={...callbacks,process:{env:{CRON_JOBS:whitelist}},console:{log(){}},query:()=>Promise.resolve([]),cron:{schedule:(pattern,cb,options)=>calls.push({pattern,cb,options})}};
 vm.runInNewContext(ts.transpileModule(fn.getText(ast).replace(/^export /,''),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText+'\ninitializeCronJobs();',scope);
 return {calls,called};
}
const current = expected.map(([name])=>name).join(',');
const {calls,called}=registrations(current);
assert.equal(calls.length,5);
for(const [i,[,pattern,name]] of expected.entries()) {
 assert.equal(calls[i].pattern,pattern);
 assert.deepEqual(JSON.parse(JSON.stringify(calls[i].options)),{timezone:'America/Mexico_City'});
 calls[i].cb(); assert.equal(called.at(-1),name);
}
assert.equal(registrations(' unknown_job ').calls.length,0);
assert.equal(registrations(' totalpass_import, TOTALPASS_TOKEN ').calls.length,2);
assert.equal(registrations('').calls.length,17);

const RealDate=Date; let now=RealDate.parse('2026-09-07T02:59:17Z');
global.Date=class extends RealDate {constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}};
const RealFormatter=Intl.DateTimeFormat;let formatterConstructions=0;
Intl.DateTimeFormat=new Proxy(RealFormatter,{construct(t,args){formatterConstructions++;return new t(...args);},apply(t,ctx,args){formatterConstructions++;return Reflect.apply(t,ctx,args);}});
const cronPath=resolve(process.argv[2]||'node_modules/node-cron'),cron=require(cronPath),tasks=[];
const hash=createHash('sha256');let peak=process.memoryUsage().rss;const cpuStart=process.cpuUsage();let calendarCases=0;
try {
 for(const {pattern,options} of calls)tasks.push(cron.schedule(pattern,()=>{throw Error('Business task must not execute');},options));
 const formatter=new RealFormatter('en-GB',{timeZone:'America/Mexico_City',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
 const matches=(field,value)=>field==='*'||field.split(',').some(s=>s.startsWith('*/')?value%Number(s.slice(2))===0:Number(s)===value);
 function referenceNext(pattern,at){const [minute,hour]=pattern.split(' ');for(let t=Math.floor(at/60000)*60000+60000;t<=at+86400000;t+=60000){const p=Object.fromEntries(formatter.formatToParts(new RealDate(t)).map(x=>[x.type,x.value]));if(matches(minute,Number(p.minute))&&matches(hour,Number(p.hour)))return new RealDate(t).toISOString();}throw Error('No reference next run');}
 for(const date of ['2026-09-07T05:59:17Z','2026-12-31T23:59:59Z','2027-01-01T06:00:00Z','2028-02-29T05:59:59Z']){
  now=RealDate.parse(date);for(const [i,task] of tasks.entries()){assert.equal(task.getNextRun().toISOString(),referenceNext(calls[i].pattern,now));calendarCases++;}
 }
 for(let round=0;round<120;round++){
  now=RealDate.parse('2026-09-07T02:59:17Z')+round*3600000;
  for(const task of tasks)hash.update(task.getNextRun().toISOString()+'\n');
  peak=Math.max(peak,process.memoryUsage().rss);if(peak>768*1048576)throw Error('Synthetic memory safety limit');
 }
 const cpu=process.cpuUsage(cpuStart);
 console.log(JSON.stringify({node:process.version,version:require(resolve(cronPath,'package.json')).version,tasks:5,calendarCases,queries:600,scheduleHash:hash.digest('hex'),formatterConstructions,peakRssMiB:peak/1048576,cpuMs:(cpu.user+cpu.system)/1000}));
}finally{for(const t of tasks)t.destroy();global.Date=RealDate;Intl.DateTimeFormat=RealFormatter;}
