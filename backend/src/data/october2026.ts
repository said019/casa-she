export const octoberWindow = {start:'2026-09-28',end:'2026-10-31'};
export function isOctoberManagedDate(facilityId:string|null|undefined,date:string) {
 return facilityId==='ca67d57b-9219-4821-b6da-b86a4bbc1f03' && date>=octoberWindow.start && date<=octoberWindow.end;
}
// Day 1 = Monday. Transcribed from the approved Casa Shé agenda.
export const octoberWeek: [number,string,string,string,number?][] = [
 [1,'07:00','Yoga Dharma','Regina'],[1,'08:00','Pilates Mat','Regina'],[1,'09:00','Pilates Mat','Regina'],
 [1,'17:00','Sculpt Full Body','Raúl'],[1,'18:00','Barre','Raúl'],[1,'19:00','Sculpt (Abs & Butt)','Raúl'],[1,'20:00','Barre','Raúl'],[1,'20:00','Yoga Vinyasa','Sol'],
 [2,'07:00','Flow Yoga','Roby'],[2,'07:00','Pilates Mat','Isaí'],[2,'08:00','Rocket Yoga','Roby'],[2,'08:00','Barre','Isaí'],[2,'09:00','Flex','Roby'],[2,'09:00','Barre','Isaí'],
 [2,'10:30','Sculpt Full Body','Yesz'],[2,'11:30','Sculpt (Abs & Butt)','Yesz'],[2,'17:00','Pilates Mat','Shelle'],[2,'18:00','Mat Power Abs','Shelle'],[2,'19:00','Barre','Román'],[2,'20:00','Barre','Román'],[2,'19:00','Navakarana','Pau',2],
 [3,'07:00','Flex','Regina'],[3,'08:00','Yoga Dharma','Regina'],[3,'09:00','Pilates Mat','Román'],[3,'10:00','Barre','Román'],[3,'11:00','Barre Funcional','Román'],
 [3,'17:00','Sculpt Full Body','Yesz'],[3,'18:00','Sculpt Full Body','Yesz'],[3,'19:00','Sculpt (Abs & Butt)','Yesz'],[3,'19:00','Power Vinyasa','Ale'],
 [4,'07:00','Power Abs','Raúl'],[4,'08:00','Inicios de Ashtanga','Ale'],[4,'08:00','Pilates Mat','Raúl'],[4,'09:00','Power Vinyasa','Ale'],[4,'17:00','Pilates Mat','Shelle'],[4,'18:00','Power Abs','Shelle'],[4,'19:00','Barre','Román'],[4,'20:00','Barre Funcional','Román'],
 [5,'07:00','Morning Flow','Roby'],[5,'08:00','Rocket Yoga','Roby'],[5,'09:00','Flex & Flow','Roby'],[5,'19:30','Salsa','Ricardo'],[5,'20:30','Salsa','Ricardo'],
 [6,'09:00','Sculpt','Raúl'],[6,'09:00','Pilates Mat','Isaí'],[6,'10:00','Barre','Isaí'],[6,'10:00','Pilates Mat','Raúl'],[6,'11:00','Barre','Isaí'],[6,'11:00','Navakarana','Pau'],
 [0,'09:00','Pilates Mat','Isaí'],[0,'10:00','Barre','Isaí'],[0,'11:00','Barre','Isaí'],
];
export function octoberClasses() {
 const result:{date:string;time:string;type:string;coach:string;intensity?:number}[]=[];
 for(let d=new Date(octoberWindow.start+'T12:00:00Z');d.toISOString().slice(0,10)<=octoberWindow.end;d.setUTCDate(d.getUTCDate()+1)) {
  for(const [day,time,type,coach,intensity] of octoberWeek) if(day===d.getUTCDay()) result.push({date:d.toISOString().slice(0,10),time,type,coach,intensity});
 }
 return result;
}
