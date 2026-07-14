import { addMinutesToTime } from '../lib/schedule.js';

export const CASA_SHE_OFFICIAL_SCHEDULE_VERSION = '2026-07-13-v1';
export const CASA_SHE_OFFICIAL_FACILITY = 'Casa Shé — Condesa';

export interface CasaSheOfficialClassType {
  name: string;
  category: 'multi' | 'reformer';
  durationMinutes: number;
  maxCapacity: number;
  color: string;
  spotIcon: 'mat' | 'barre' | 'generic';
}

export interface CasaSheOfficialSlot {
  dayOfWeek: number;
  startTime: string;
  classType: string;
  instructor: string;
}

export interface CasaSheOfficialScheduleRow extends CasaSheOfficialSlot {
  endTime: string;
  category: 'multi' | 'reformer';
  maxCapacity: number;
}

// Paleta reducida por familia para conservar la estética de Casa Shé en /app.
// Salsa conserva category='reformer' porque ese bucket representa sus créditos dedicados.
export const CASA_SHE_OFFICIAL_CLASS_TYPES: CasaSheOfficialClassType[] = [
  { name: 'Pilates Mat',          category: 'multi',    durationMinutes: 50, maxCapacity: 12, color: '#2E5B45', spotIcon: 'mat' },
  { name: 'Power Mat',            category: 'multi',    durationMinutes: 50, maxCapacity: 12, color: '#2E5B45', spotIcon: 'mat' },
  { name: 'Pilates Booty',        category: 'multi',    durationMinutes: 50, maxCapacity: 12, color: '#2E5B45', spotIcon: 'mat' },
  { name: 'Pilates Mat o Barre',  category: 'multi',    durationMinutes: 50, maxCapacity: 12, color: '#708566', spotIcon: 'mat' },
  { name: 'Barre',                category: 'multi',    durationMinutes: 50, maxCapacity: 12, color: '#B9A442', spotIcon: 'barre' },
  { name: 'Sculpt',               category: 'multi',    durationMinutes: 50, maxCapacity: 12, color: '#B85B49', spotIcon: 'generic' },
  { name: 'Sculpt Booty',         category: 'multi',    durationMinutes: 50, maxCapacity: 12, color: '#B85B49', spotIcon: 'generic' },
  { name: 'Flex',                 category: 'multi',    durationMinutes: 50, maxCapacity: 12, color: '#6C9999', spotIcon: 'mat' },
  { name: 'Flex & Flow',          category: 'multi',    durationMinutes: 50, maxCapacity: 12, color: '#6C9999', spotIcon: 'mat' },
  { name: 'Morning Flow',         category: 'multi',    durationMinutes: 60, maxCapacity: 7,  color: '#6B8445', spotIcon: 'mat' },
  { name: 'Rocket & Ride',        category: 'multi',    durationMinutes: 60, maxCapacity: 7,  color: '#6B8445', spotIcon: 'mat' },
  { name: 'Navakarana',           category: 'multi',    durationMinutes: 60, maxCapacity: 7,  color: '#6B8445', spotIcon: 'mat' },
  { name: 'Yoga Ashtanga',        category: 'multi',    durationMinutes: 60, maxCapacity: 7,  color: '#6B8445', spotIcon: 'mat' },
  { name: 'Yoga Vinyasa',         category: 'multi',    durationMinutes: 60, maxCapacity: 7,  color: '#6B8445', spotIcon: 'mat' },
  { name: 'Power Vinyasa',        category: 'multi',    durationMinutes: 60, maxCapacity: 7,  color: '#6B8445', spotIcon: 'mat' },
  { name: 'Somatic Reset',        category: 'multi',    durationMinutes: 60, maxCapacity: 7,  color: '#6B8445', spotIcon: 'mat' },
  { name: 'Inicios de Ashtanga',  category: 'multi',    durationMinutes: 60, maxCapacity: 7,  color: '#6B8445', spotIcon: 'mat' },
  { name: 'Slow Flow Vinyasa',    category: 'multi',    durationMinutes: 60, maxCapacity: 7,  color: '#6B8445', spotIcon: 'mat' },
  { name: 'Rocket Yoga',          category: 'multi',    durationMinutes: 60, maxCapacity: 7,  color: '#6B8445', spotIcon: 'mat' },
  { name: 'Salsa',                category: 'reformer', durationMinutes: 60, maxCapacity: 6,  color: '#4B3540', spotIcon: 'generic' },
];

export const CASA_SHE_OFFICIAL_INSTRUCTORS = [
  'Ale', 'Isaí', 'Pau', 'Raúl', 'Regina', 'Roby', 'Valeria', 'Yesz',
] as const;

// Transcripción del PDF “HORARIOS CASA SHE 1.8”, creado el 13 de julio de 2026.
// Normalizaciones documentadas:
// - ROB usa el registro existente “Roby”; RAUL/ISAI conservan sus acentos.
// - Mar 08:00 Pilates Mat no trae coach en el PDF: se asigna a Isaí por continuidad.
// - Vie “8:00 AM Salsa” aparece después de 19:00: se interpreta como 20:00.
// - Sáb 12:00 Navakarana no trae coach: se asigna a Pau, quien da Navakarana el lunes.
// - “SCULP BOOTY” se corrige a “Sculpt Booty”.
export const CASA_SHE_OFFICIAL_SLOTS: CasaSheOfficialSlot[] = [
  // Domingo
  { dayOfWeek: 0, startTime: '09:00', classType: 'Power Mat',           instructor: 'Isaí' },
  { dayOfWeek: 0, startTime: '09:00', classType: 'Yoga Ashtanga',       instructor: 'Ale' },
  { dayOfWeek: 0, startTime: '10:00', classType: 'Pilates Booty',       instructor: 'Isaí' },
  { dayOfWeek: 0, startTime: '10:00', classType: 'Slow Flow Vinyasa',   instructor: 'Ale' },
  { dayOfWeek: 0, startTime: '11:00', classType: 'Pilates Mat',         instructor: 'Isaí' },
  { dayOfWeek: 0, startTime: '12:00', classType: 'Sculpt',              instructor: 'Isaí' },

  // Lunes
  { dayOfWeek: 1, startTime: '07:00', classType: 'Sculpt',              instructor: 'Raúl' },
  { dayOfWeek: 1, startTime: '07:00', classType: 'Flex',                instructor: 'Regina' },
  { dayOfWeek: 1, startTime: '08:00', classType: 'Sculpt',              instructor: 'Raúl' },
  { dayOfWeek: 1, startTime: '08:00', classType: 'Flex',                instructor: 'Regina' },
  { dayOfWeek: 1, startTime: '09:00', classType: 'Pilates Mat',         instructor: 'Regina' },
  { dayOfWeek: 1, startTime: '17:00', classType: 'Barre',               instructor: 'Valeria' },
  { dayOfWeek: 1, startTime: '18:00', classType: 'Barre',               instructor: 'Raúl' },
  { dayOfWeek: 1, startTime: '19:00', classType: 'Barre',               instructor: 'Raúl' },
  { dayOfWeek: 1, startTime: '19:00', classType: 'Navakarana',          instructor: 'Pau' },
  { dayOfWeek: 1, startTime: '20:00', classType: 'Barre',               instructor: 'Raúl' },
  { dayOfWeek: 1, startTime: '20:00', classType: 'Navakarana',          instructor: 'Pau' },

  // Martes
  { dayOfWeek: 2, startTime: '07:00', classType: 'Morning Flow',        instructor: 'Roby' },
  { dayOfWeek: 2, startTime: '07:00', classType: 'Pilates Mat',         instructor: 'Isaí' },
  { dayOfWeek: 2, startTime: '08:00', classType: 'Rocket & Ride',       instructor: 'Roby' },
  { dayOfWeek: 2, startTime: '08:00', classType: 'Pilates Mat',         instructor: 'Isaí' },
  { dayOfWeek: 2, startTime: '09:00', classType: 'Flex & Flow',         instructor: 'Roby' },
  { dayOfWeek: 2, startTime: '09:00', classType: 'Pilates Booty',       instructor: 'Isaí' },
  { dayOfWeek: 2, startTime: '10:30', classType: 'Sculpt',              instructor: 'Yesz' },
  { dayOfWeek: 2, startTime: '11:30', classType: 'Sculpt',              instructor: 'Yesz' },
  { dayOfWeek: 2, startTime: '19:00', classType: 'Navakarana',          instructor: 'Pau' },
  { dayOfWeek: 2, startTime: '20:00', classType: 'Navakarana',          instructor: 'Pau' },

  // Miércoles
  { dayOfWeek: 3, startTime: '07:00', classType: 'Pilates Mat',         instructor: 'Regina' },
  { dayOfWeek: 3, startTime: '08:00', classType: 'Pilates Mat',         instructor: 'Regina' },
  { dayOfWeek: 3, startTime: '09:00', classType: 'Flex',                instructor: 'Regina' },
  { dayOfWeek: 3, startTime: '17:00', classType: 'Sculpt',              instructor: 'Yesz' },
  { dayOfWeek: 3, startTime: '18:00', classType: 'Sculpt',              instructor: 'Yesz' },
  { dayOfWeek: 3, startTime: '19:00', classType: 'Sculpt Booty',        instructor: 'Yesz' },
  { dayOfWeek: 3, startTime: '19:00', classType: 'Power Vinyasa',       instructor: 'Ale' },
  { dayOfWeek: 3, startTime: '20:00', classType: 'Somatic Reset',       instructor: 'Ale' },

  // Jueves
  { dayOfWeek: 4, startTime: '07:00', classType: 'Pilates Mat',         instructor: 'Raúl' },
  { dayOfWeek: 4, startTime: '08:00', classType: 'Pilates Mat',         instructor: 'Raúl' },
  { dayOfWeek: 4, startTime: '08:00', classType: 'Inicios de Ashtanga', instructor: 'Ale' },
  { dayOfWeek: 4, startTime: '09:00', classType: 'Slow Flow Vinyasa',   instructor: 'Ale' },
  { dayOfWeek: 4, startTime: '17:00', classType: 'Flex',                instructor: 'Roby' },
  { dayOfWeek: 4, startTime: '18:00', classType: 'Rocket Yoga',         instructor: 'Roby' },

  // Viernes
  { dayOfWeek: 5, startTime: '07:00', classType: 'Flex & Flow',         instructor: 'Roby' },
  { dayOfWeek: 5, startTime: '08:00', classType: 'Rocket Yoga',         instructor: 'Roby' },
  { dayOfWeek: 5, startTime: '17:00', classType: 'Flex',                instructor: 'Roby' },
  { dayOfWeek: 5, startTime: '18:00', classType: 'Rocket Yoga',         instructor: 'Roby' },
  { dayOfWeek: 5, startTime: '19:00', classType: 'Salsa',               instructor: 'Raúl' },
  { dayOfWeek: 5, startTime: '20:00', classType: 'Salsa',               instructor: 'Raúl' },

  // Sábado
  { dayOfWeek: 6, startTime: '09:00', classType: 'Barre',               instructor: 'Isaí' },
  { dayOfWeek: 6, startTime: '09:00', classType: 'Sculpt',              instructor: 'Raúl' },
  { dayOfWeek: 6, startTime: '10:00', classType: 'Pilates Mat',         instructor: 'Isaí' },
  { dayOfWeek: 6, startTime: '10:00', classType: 'Sculpt',              instructor: 'Raúl' },
  { dayOfWeek: 6, startTime: '11:00', classType: 'Pilates Mat o Barre', instructor: 'Isaí' },
  { dayOfWeek: 6, startTime: '11:00', classType: 'Sculpt',              instructor: 'Raúl' },
  { dayOfWeek: 6, startTime: '12:00', classType: 'Navakarana',          instructor: 'Pau' },
];

const typeByName = new Map(CASA_SHE_OFFICIAL_CLASS_TYPES.map((type) => [type.name, type]));

export function buildCasaSheOfficialScheduleRows(): CasaSheOfficialScheduleRow[] {
  return CASA_SHE_OFFICIAL_SLOTS.map((slot) => {
    const classType = typeByName.get(slot.classType);
    if (!classType) throw new Error(`Tipo de clase oficial no definido: ${slot.classType}`);
    return {
      ...slot,
      endTime: addMinutesToTime(slot.startTime, classType.durationMinutes),
      category: classType.category,
      maxCapacity: classType.maxCapacity,
    };
  });
}
