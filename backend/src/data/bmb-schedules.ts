import type { FichaDef } from '../lib/schedule.js';

// Instructoras reales (Multiclases) + placeholder Reformer
export const SEED_INSTRUCTORS: string[] = [
  'Indie', 'Vero', 'Vane', 'Frida', 'Aranza', 'Jess', 'Fer', 'Pao',
  'Estrella', 'Jaqui', 'Karla',
  // Coaches reales de Reformer
  'Jessi Tavira', 'Aaron Domínguez', 'Sofi Maes',
];

// class_types que faltan (todas category 'multi'); el resto se reusa por nombre
export const SEED_CLASS_TYPES: { name: string; category: 'reformer' | 'multi' }[] = [
  { name: 'Lower Body Funcional', category: 'multi' },
  { name: 'Upper Body Funcional', category: 'multi' },
  { name: 'Full Body Funcional', category: 'multi' },
];

// 'Pilates Reformer' es el tipo BASE que la Mig 052 renombra a 'Reformer Classic' y reparte por día
// en formatos (Sculpt/Classic/Reformer Jumpboard/Flow/Restore). En prod ya NO debe quedar activo: la Mig 072
// lo desactiva y limpia sus clases duplicadas. NO reactivar este tipo (regresarían los duplicados).
const REF = 'Pilates Reformer';
// Coaches reales de Reformer (de la programación del studio): regla por sucursal + AM/PM.
const TEPA_AM = 'Jessi Tavira', TEPA_PM = 'Sofi Maes';
const SM_AM = 'Aaron Domínguez', SM_PM = 'Jessi Tavira';

export const FICHAS: FichaDef[] = [
  // ----- Reformer Tepa (cap 6 = 6 reformers) -----
  {
    facility: 'BMB Studio Tepa', category: 'reformer', capacity: 6, durationMin: 50,
    slots: [
      ...[1, 2, 3, 4, 5].flatMap((d) => ['07:10', '08:10', '09:10', '10:10'].map((t) => ({ day: d, start: t, classType: REF, instructor: TEPA_AM }))),
      ...['07:10', '08:10', '09:10', '10:10'].map((t) => ({ day: 6, start: t, classType: REF, instructor: TEPA_AM })), // sábado empieza 07:10
      ...['07:10', '08:10'].map((t) => ({ day: 0, start: t, classType: REF, instructor: TEPA_AM })), // domingo AM
      ...[1, 2, 3, 4].flatMap((d) => ['17:10', '18:10', '19:10', '20:10'].map((t) => ({ day: d, start: t, classType: REF, instructor: TEPA_PM }))),
      ...['17:10', '18:10', '19:10'].map((t) => ({ day: 5, start: t, classType: REF, instructor: TEPA_PM })),
    ],
  },
  // ----- Reformer San Miguel (cap 6 = 6 reformers) -----
  {
    facility: 'BMB Studio San Miguel', category: 'reformer', capacity: 6, durationMin: 50,
    slots: [
      ...[1, 2, 3, 4, 5, 6].flatMap((d) => ['07:10', '08:10', '09:10', '10:10'].map((t) => ({ day: d, start: t, classType: REF, instructor: SM_AM }))),
      ...['07:10', '08:10'].map((t) => ({ day: 0, start: t, classType: REF, instructor: SM_AM })), // domingo AM
      { day: 6, start: '11:10', classType: REF, instructor: SM_AM, active: false }, // temporada alta
      ...[1, 2, 3, 4, 5].flatMap((d) => ['17:10', '18:10', '19:10'].map((t) => ({ day: d, start: t, classType: REF, instructor: SM_PM }))),
      ...[1, 2, 3, 4].flatMap((d) => ['20:10', '21:10'].map((t) => ({ day: d, start: t, classType: REF, instructor: SM_PM, active: false }))), // temporada alta
    ],
  },
  // ----- Multiclases Tepa (cap 12) -----
  {
    facility: 'BMB Studio Tepa', category: 'multi', capacity: 12, durationMin: 50,
    slots: [
      { day: 2, start: '08:10', classType: 'Lower Body Funcional', instructor: 'Indie' },
      { day: 4, start: '08:10', classType: 'Upper Body Funcional', instructor: 'Indie' },
      { day: 5, start: '08:10', classType: 'Yoga', instructor: 'Frida' },
      { day: 6, start: '08:10', classType: 'Sculpt', instructor: 'Indie' },
      { day: 1, start: '09:10', classType: 'Pole Fitness', instructor: 'Vero' },
      { day: 2, start: '09:10', classType: 'Barre', instructor: 'Indie' },
      { day: 3, start: '09:10', classType: 'Pole Fitness', instructor: 'Vero' },
      { day: 4, start: '09:10', classType: 'Barre', instructor: 'Indie' },
      { day: 5, start: '09:10', classType: 'Flex', instructor: 'Vane' },
      { day: 6, start: '09:10', classType: 'Barre', instructor: 'Indie' },
      { day: 5, start: '10:10', classType: 'Pole Fitness', instructor: 'Vane' },
      { day: 6, start: '10:10', classType: 'Flex', instructor: 'Vane' },
      { day: 6, start: '11:10', classType: 'Pole Fitness', instructor: 'Vane' },
      { day: 1, start: '18:00', classType: 'Lower Body Funcional', instructor: 'Indie' },
      { day: 2, start: '18:10', classType: 'Pole Fitness', instructor: 'Aranza' },
      { day: 3, start: '18:00', classType: 'Upper Body Funcional', instructor: 'Indie' },
      { day: 4, start: '18:10', classType: 'Pole Dance', instructor: 'Aranza' },
      { day: 1, start: '19:10', classType: 'Barre', instructor: 'Jess' },
      { day: 2, start: '19:10', classType: 'Pole Dance', instructor: 'Fer' },
      { day: 3, start: '19:10', classType: 'Barre', instructor: 'Pao' },
      { day: 4, start: '19:10', classType: 'Twerk', instructor: 'Estrella' },
      { day: 5, start: '19:10', classType: 'Pole Fitness', instructor: 'Vero' },
      { day: 1, start: '20:10', classType: 'Yoga', instructor: 'Frida' },
      { day: 2, start: '20:10', classType: 'Pole Fitness', instructor: 'Fer' },
      { day: 3, start: '20:10', classType: 'Pole Fitness', instructor: 'Fer' },
    ],
  },
  // ----- Multiclases San Miguel (cap 12) -----
  {
    facility: 'BMB Studio San Miguel', category: 'multi', capacity: 12, durationMin: 50,
    slots: [
      { day: 1, start: '07:30', classType: 'Yoga', instructor: 'Frida' },
      { day: 3, start: '07:30', classType: 'Yoga', instructor: 'Frida' },
      { day: 6, start: '07:30', classType: 'Yoga', instructor: 'Frida' },
      { day: 0, start: '08:00', classType: 'Hot Pilates', instructor: 'Sofi Maes' },
      { day: 0, start: '09:00', classType: 'Hot Sculpt', instructor: 'Karla' },
      { day: 1, start: '09:10', classType: 'Sculpt', instructor: 'Karla' },
      { day: 2, start: '09:10', classType: 'Lower Body Funcional', instructor: 'Jaqui' },
      { day: 3, start: '09:10', classType: 'Barre', instructor: 'Karla' },
      { day: 4, start: '09:10', classType: 'Full Body Funcional', instructor: 'Jaqui' },
      { day: 5, start: '09:10', classType: 'Barre', instructor: 'Pao' },
      { day: 6, start: '09:10', classType: 'Barre', instructor: 'Jess' },
      { day: 1, start: '18:10', classType: 'Lower Body Funcional', instructor: 'Karla' },
      { day: 2, start: '18:10', classType: 'Flex', instructor: 'Vane' },
      { day: 3, start: '18:10', classType: 'Full Body Funcional', instructor: 'Karla' },
      { day: 4, start: '18:10', classType: 'Hot Sculpt', instructor: 'Indie' },
      { day: 1, start: '19:10', classType: 'Hot Barre', instructor: 'Karla' },
      { day: 2, start: '19:10', classType: 'Barre', instructor: 'Pao' },
      { day: 3, start: '19:10', classType: 'Hot Barre', instructor: 'Karla' },
      { day: 4, start: '19:10', classType: 'Hot Barre', instructor: 'Indie' },
      { day: 1, start: '20:10', classType: 'Twerk', instructor: 'Estrella' },
      { day: 2, start: '20:10', classType: 'Hot Yoga', instructor: 'Frida' },
      { day: 3, start: '20:10', classType: 'Hot Sculpt', instructor: 'Karla' },
      { day: 4, start: '20:10', classType: 'Hot Yoga', instructor: 'Frida' },
    ],
  },
];
