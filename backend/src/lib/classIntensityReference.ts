/** Approved images, 2026-09-10. Weekday: Sunday=0. Explicit aliases only. */
export type IntensityReference = readonly [day: number, time: string, discipline: string, instructor: string, intensity: number];
export const intensityReference: readonly IntensityReference[] = [
  [1, '07:00', 'dharma', 'regina', 2],
  [1, '08:00', 'pilates mat', 'regina', 2],
  [1, '09:00', 'pilates mat', 'regina', 2],
  [1, '18:00', 'barre', 'raul', 3],
  [1, '19:00', 'abs butt', 'raul', 3],
  [1, '20:00', 'barre', 'raul', 3],
  [1, '20:00', 'vinyasa', 'sol', 2],
  [2, '07:00', 'flow yoga', 'rob', 1],
  [2, '07:00', 'pilates mat', 'isai', 2],
  [2, '08:00', 'rocket yoga', 'rob', 3],
  [2, '08:00', 'barre', 'isai', 3],
  [2, '09:00', 'flex', 'rob', 1],
  [2, '09:00', 'barre', 'isai', 3],
  [2, '10:30', 'sculpt', 'yesz', 2],
  [2, '11:30', 'abs butt', 'yesz', 3],
  [2, '18:00', 'pilates mat', 'shelle', 2],
  [2, '19:00', 'barre', 'shelle', 3],
  [2, '19:00', 'navakarana', 'pau', 2],
  [2, '20:00', 'barre', 'shelle', 2],
  [3, '07:00', 'pilates mat', 'regina', 2],
  [3, '08:00', 'dharma', 'regina', 2],
  [3, '09:00', 'pilates mat', 'regina', 3],
  [3, '17:00', 'sculpt', 'yesz', 2],
  [3, '18:00', 'sculpt', 'yesz', 3],
  [3, '19:00', 'abs butt', 'yesz', 3],
  [3, '19:00', 'power vinyasa', 'ale', 3],
  [4, '07:00', 'power abs', 'raul', 2],
  [4, '08:00', 'pilates mat', 'raul', 3],
  [4, '08:00', 'inicios de ashtanga', 'ale', 2],
  [4, '09:00', 'power vinyasa', 'ale', 3],
  [4, '18:00', 'pilates mat', 'shelle', 2],
  [4, '19:00', 'power abs', 'shelle', 3],
  [4, '20:00', 'barre', 'shelle', 3],
  [5, '07:00', 'morning flow', 'rob', 2],
  [5, '08:00', 'rocket yoga', 'rob', 3],
  [5, '09:00', 'flex and flow', 'rob', 2],
  [6, '08:00', 'pilates mat', 'raul', 2],
  [6, '09:00', 'barre', 'raul', 3],
  [6, '09:00', 'pilates mat', 'isai', 3],
  [6, '10:00', 'barre', 'isai', 3],
  [6, '10:00', 'pilates mat', 'raul', 3],
  [6, '11:00', 'barre', 'isai', 3],
  [6, '12:00', 'navakarana', 'pau', 2],
  [0, '08:00', 'pilates mat', 'isai', 3],
  [0, '09:00', 'barre', 'isai', 3],
  [0, '10:00', 'barre', 'isai', 3],
  [0, '11:00', 'barre', 'isai', 3],
];

export function normalizeIntensityName(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}
const aliases: Record<string, string> = {
  'yoga dharma': 'dharma',
  'yoga vinyasa': 'vinyasa',
  'yoga power vinyasa': 'power vinyasa',
  'yoga inicios de ashtanga': 'inicios de ashtanga',
  'inicios de ashtanga yoga': 'inicios de ashtanga',
  'yoga navakarana': 'navakarana',
  'morning flow yoga': 'morning flow',
  'sculpt full body': 'sculpt',
  'sculpt abs butt': 'abs butt',
  'flex flow': 'flex and flow',
};
function canonicalDiscipline(value: string): string {
  const normalized = normalizeIntensityName(value);
  return aliases[normalized] ?? normalized;
}
function canonicalInstructor(value: string): string {
  const normalized = normalizeIntensityName(value);
  return normalized === 'roby' ? 'rob' : normalized;
}
export function referenceIntensity(day: number, time: string, discipline: string, instructor: string): number | null {
  const name = canonicalDiscipline(discipline);
  const coach = canonicalInstructor(instructor);
  return intensityReference.find(r => r[0] === day && r[1] === time.slice(0, 5) && r[2] === name && r[3] === coach)?.[4] ?? null;
}

export interface IntensitySeedRow {
  id: string; day: number; time: string; discipline: string; instructor: string;
  intensity: number | null; date?: string; facility_id: string | null;
}
/** Different dates are expected; duplicate simultaneous matches are ambiguous. */
export function planIntensitySeed(rows: IntensitySeedRow[]) {
  const groups = new Map<string, IntensitySeedRow[]>();
  for (const row of rows) {
    const key = [row.date ?? row.day, row.time.slice(0, 5), canonicalDiscipline(row.discipline), canonicalInstructor(row.instructor)].join('|');
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const updates: Array<{ id: string; intensity: number }> = [];
  const ambiguous: string[] = [];
  for (const [key, group] of groups) {
    const row = group[0];
    const intensity = referenceIntensity(row.day, row.time, row.discipline, row.instructor);
    if (intensity === null) continue;
    if (group.length !== 1) { ambiguous.push(key); continue; }
    if (row.intensity == null) updates.push({ id: row.id, intensity });
  }
  return { updates, ambiguous };
}
