import { addMinutesToTime } from '../lib/schedule.js';

export const CASA_SHE_OFFICIAL_SCHEDULE_VERSION = '2026-08-04-v2';
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
  { name: 'Pilates Mat',          category: 'multi',    durationMinutes: 50, maxCapacity: 7 , color: '#2E5B45', spotIcon: 'mat' },
  { name: 'Power Mat',            category: 'multi',    durationMinutes: 50, maxCapacity: 7 , color: '#2E5B45', spotIcon: 'mat' },
  { name: 'Pilates Booty',        category: 'multi',    durationMinutes: 50, maxCapacity: 7 , color: '#2E5B45', spotIcon: 'mat' },
  { name: 'Pilates Mat o Barre',  category: 'multi',    durationMinutes: 50, maxCapacity: 7 , color: '#708566', spotIcon: 'mat' },
  { name: 'Barre',                category: 'multi',    durationMinutes: 50, maxCapacity: 7 , color: '#B9A442', spotIcon: 'barre' },
  { name: 'Sculpt',               category: 'multi',    durationMinutes: 50, maxCapacity: 7 , color: '#B85B49', spotIcon: 'generic' },
  { name: 'Sculpt Booty',         category: 'multi',    durationMinutes: 50, maxCapacity: 7 , color: '#B85B49', spotIcon: 'generic' },
  { name: 'Flex',                 category: 'multi',    durationMinutes: 50, maxCapacity: 7 , color: '#6C9999', spotIcon: 'mat' },
  { name: 'Flex & Flow',          category: 'multi',    durationMinutes: 50, maxCapacity: 7 , color: '#6C9999', spotIcon: 'mat' },
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
  { name: 'Yoga',                 category: 'multi',    durationMinutes: 50, maxCapacity: 7,  color: '#6B8445', spotIcon: 'mat' },
  { name: 'Flow Yoga',            category: 'multi',    durationMinutes: 50, maxCapacity: 7,  color: '#6B8445', spotIcon: 'mat' },
  { name: 'Yoga Dharma',          category: 'multi',    durationMinutes: 50, maxCapacity: 7,  color: '#6B8445', spotIcon: 'mat' },
  { name: 'Principios de Ashtanga', category: 'multi',  durationMinutes: 50, maxCapacity: 7,  color: '#6B8445', spotIcon: 'mat' },
  { name: 'Vinyasa + Yin Yoga',   category: 'multi',    durationMinutes: 50, maxCapacity: 7,  color: '#6B8445', spotIcon: 'mat' },
  { name: 'Mornig Fit Flow',      category: 'multi',    durationMinutes: 50, maxCapacity: 7,  color: '#6B8445', spotIcon: 'mat' },
  { name: 'Nith Fit Strech',      category: 'multi',    durationMinutes: 50, maxCapacity: 7,  color: '#6B8445', spotIcon: 'mat' },
];

export const CASA_SHE_OFFICIAL_INSTRUCTORS = [
  'Ale', 'Isaí', 'Pau', 'Raúl', 'Regina', 'Roby', 'Valeria', 'Yesz',
  'Ricardo', 'Shelle', 'Sol',
] as const;

// Transcripción de la hoja «AGENDA CASA SHE» (agosto 2026): 64 plantillas semanales.
// Normalizaciones documentadas:
// - "SHELLE" en la hoja es la COACH, no el tipo de clase (confirmado con la dueña).
// - ROB usa el registro existente "Roby"; RAUL/ISAI conservan sus acentos.
// - "ISA" del domingo se toma como Isaí, que es como ya estaba cargado.
// - "PILTES MAT" y "MORNING FLOW YOGA" se corrigen a "Pilates Mat" y "Morning Flow".
// - Los Sculpt del martes van a las 10:30 y 11:30, como indica la hoja.
export const CASA_SHE_OFFICIAL_SLOTS: CasaSheOfficialSlot[] = [
  // Lunes
  { dayOfWeek: 1, startTime: '07:00', classType: 'Mornig Fit Flow',       instructor: 'Shelle' },
  { dayOfWeek: 1, startTime: '07:00', classType: 'Yoga',                  instructor: 'Regina' },
  { dayOfWeek: 1, startTime: '08:00', classType: 'Barre',                 instructor: 'Shelle' },
  { dayOfWeek: 1, startTime: '08:00', classType: 'Flex',                  instructor: 'Regina' },
  { dayOfWeek: 1, startTime: '09:00', classType: 'Barre',                 instructor: 'Shelle' },
  { dayOfWeek: 1, startTime: '09:00', classType: 'Pilates Mat',           instructor: 'Regina' },
  { dayOfWeek: 1, startTime: '17:00', classType: 'Sculpt',                instructor: 'Raúl' },
  { dayOfWeek: 1, startTime: '18:00', classType: 'Barre',                 instructor: 'Raúl' },
  { dayOfWeek: 1, startTime: '19:00', classType: 'Pilates Mat',           instructor: 'Raúl' },
  { dayOfWeek: 1, startTime: '20:00', classType: 'Barre',                 instructor: 'Raúl' },
  { dayOfWeek: 1, startTime: '20:00', classType: 'Vinyasa + Yin Yoga',    instructor: 'Sol' },

  // Martes
  { dayOfWeek: 2, startTime: '07:00', classType: 'Flow Yoga',             instructor: 'Roby' },
  { dayOfWeek: 2, startTime: '07:00', classType: 'Pilates Mat',           instructor: 'Isaí' },
  { dayOfWeek: 2, startTime: '08:00', classType: 'Rocket Yoga',           instructor: 'Roby' },
  { dayOfWeek: 2, startTime: '08:00', classType: 'Pilates Mat',           instructor: 'Isaí' },
  { dayOfWeek: 2, startTime: '09:00', classType: 'Flex',                  instructor: 'Roby' },
  { dayOfWeek: 2, startTime: '09:00', classType: 'Pilates Mat',           instructor: 'Isaí' },
  { dayOfWeek: 2, startTime: '10:30', classType: 'Sculpt',                instructor: 'Yesz' },
  { dayOfWeek: 2, startTime: '11:30', classType: 'Sculpt',                instructor: 'Yesz' },
  { dayOfWeek: 2, startTime: '18:00', classType: 'Barre',                 instructor: 'Shelle' },
  { dayOfWeek: 2, startTime: '19:00', classType: 'Barre',                 instructor: 'Shelle' },
  { dayOfWeek: 2, startTime: '19:00', classType: 'Navakarana',            instructor: 'Pau' },
  { dayOfWeek: 2, startTime: '20:00', classType: 'Nith Fit Strech',       instructor: 'Shelle' },

  // Miércoles
  { dayOfWeek: 3, startTime: '07:00', classType: 'Flex',                  instructor: 'Regina' },
  { dayOfWeek: 3, startTime: '07:00', classType: 'Barre',                 instructor: 'Raúl' },
  { dayOfWeek: 3, startTime: '08:00', classType: 'Yoga Dharma',           instructor: 'Regina' },
  { dayOfWeek: 3, startTime: '08:00', classType: 'Barre',                 instructor: 'Raúl' },
  { dayOfWeek: 3, startTime: '09:00', classType: 'Pilates Mat',           instructor: 'Regina' },
  { dayOfWeek: 3, startTime: '17:00', classType: 'Sculpt',                instructor: 'Yesz' },
  { dayOfWeek: 3, startTime: '18:00', classType: 'Sculpt',                instructor: 'Yesz' },
  { dayOfWeek: 3, startTime: '19:00', classType: 'Sculpt',                instructor: 'Yesz' },
  { dayOfWeek: 3, startTime: '19:00', classType: 'Power Vinyasa',         instructor: 'Ale' },
  { dayOfWeek: 3, startTime: '20:00', classType: 'Somatic Reset',         instructor: 'Ale' },

  // Jueves
  { dayOfWeek: 4, startTime: '07:00', classType: 'Pilates Mat',           instructor: 'Raúl' },
  { dayOfWeek: 4, startTime: '08:00', classType: 'Inicios de Ashtanga',   instructor: 'Ale' },
  { dayOfWeek: 4, startTime: '08:00', classType: 'Barre',                 instructor: 'Raúl' },
  { dayOfWeek: 4, startTime: '09:00', classType: 'Power Vinyasa',         instructor: 'Ale' },
  { dayOfWeek: 4, startTime: '18:00', classType: 'Barre',                 instructor: 'Shelle' },
  { dayOfWeek: 4, startTime: '18:00', classType: 'Flex',                  instructor: 'Roby' },
  { dayOfWeek: 4, startTime: '19:00', classType: 'Barre',                 instructor: 'Shelle' },
  { dayOfWeek: 4, startTime: '19:00', classType: 'Rocket Yoga',           instructor: 'Roby' },
  { dayOfWeek: 4, startTime: '20:00', classType: 'Nith Fit Strech',       instructor: 'Shelle' },

  // Viernes
  { dayOfWeek: 5, startTime: '07:00', classType: 'Morning Flow',          instructor: 'Roby' },
  { dayOfWeek: 5, startTime: '08:00', classType: 'Rocket Yoga',           instructor: 'Roby' },
  { dayOfWeek: 5, startTime: '09:00', classType: 'Flex & Flow',           instructor: 'Roby' },
  { dayOfWeek: 5, startTime: '17:00', classType: 'Rocket Yoga',           instructor: 'Roby' },
  { dayOfWeek: 5, startTime: '18:00', classType: 'Flex & Flow',           instructor: 'Roby' },
  { dayOfWeek: 5, startTime: '19:00', classType: 'Salsa',                 instructor: 'Ricardo' },
  { dayOfWeek: 5, startTime: '20:00', classType: 'Salsa',                 instructor: 'Ricardo' },

  // Sábado
  { dayOfWeek: 6, startTime: '08:00', classType: 'Pilates Mat',           instructor: 'Isaí' },
  { dayOfWeek: 6, startTime: '08:00', classType: 'Barre',                 instructor: 'Raúl' },
  { dayOfWeek: 6, startTime: '09:00', classType: 'Pilates Mat',           instructor: 'Isaí' },
  { dayOfWeek: 6, startTime: '09:00', classType: 'Barre',                 instructor: 'Raúl' },
  { dayOfWeek: 6, startTime: '10:00', classType: 'Pilates Mat',           instructor: 'Isaí' },
  { dayOfWeek: 6, startTime: '10:00', classType: 'Barre',                 instructor: 'Raúl' },
  { dayOfWeek: 6, startTime: '11:00', classType: 'Pilates Mat',           instructor: 'Isaí' },
  { dayOfWeek: 6, startTime: '11:00', classType: 'Barre',                 instructor: 'Raúl' },
  { dayOfWeek: 6, startTime: '12:00', classType: 'Navakarana',            instructor: 'Pau' },

  // Domingo
  { dayOfWeek: 0, startTime: '08:00', classType: 'Barre',                 instructor: 'Isaí' },
  { dayOfWeek: 0, startTime: '09:00', classType: 'Pilates Mat',           instructor: 'Isaí' },
  { dayOfWeek: 0, startTime: '10:00', classType: 'Pilates Mat',           instructor: 'Isaí' },
  { dayOfWeek: 0, startTime: '10:00', classType: 'Principios de Ashtanga', instructor: 'Ale' },
  { dayOfWeek: 0, startTime: '11:00', classType: 'Pilates Mat',           instructor: 'Isaí' },
  { dayOfWeek: 0, startTime: '11:00', classType: 'Somatic Reset',         instructor: 'Ale' },
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
