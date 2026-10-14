// One impression per Mexico City day/slot, shared by tabs on this origin.
export function noticeWindow(now = new Date()) {
 const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {timeZone:'America/Mexico_City',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(now).map(p=>[p.type,p.value]));
 return parts.year+'-'+parts.month+'-'+parts.day+':'+(Number(parts.hour)<12?'morning':Number(parts.hour)<19?'afternoon':'night');
}
export function eligibleNotice(notice, now = new Date()) {
 if (!notice || typeof notice.texto !== 'string' || !notice.texto.trim() || notice.texto.length>300 || !/^\d{4}-\d{2}-\d{2}$/.test(notice.fecha)) return false;
 const due = new Date(notice.fecha+'T00:00:00Z');
 if (!Number.isFinite(due.getTime()) || due.toISOString().slice(0,10)!==notice.fecha) return false;
 const today=noticeWindow(now).slice(0,10);
 due.setUTCDate(due.getUTCDate()-1);
 return today===notice.fecha || today===due.toISOString().slice(0,10);
}
export async function claimNotice(windowKey, storage, locks, stillValid = ()=>true) {
 const key='wallet-club:payment-notice:v2:'+windowKey;
 const claim=()=>{
  try {
   if (!stillValid() || storage.getItem(key)!==null) return false;
   storage.setItem(key,'shown');
   return storage.getItem(key)==='shown';
  } catch { return false; }
 };
 try { return locks?.request ? await locks.request('wallet-club-payment-notice',claim) : claim(); }
 catch { return false; }
}
