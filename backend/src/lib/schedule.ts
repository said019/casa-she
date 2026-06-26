export const MAX_REFORMER_CAPACITY = 8;

/** Suma minutos a una hora 'HH:MM' (envuelve a 24h). */
export function addMinutesToTime(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(':').map(Number);
  const total = (((h * 60 + m + minutes) % 1440) + 1440) % 1440;
  const hh = String(Math.floor(total / 60)).padStart(2, '0');
  const mm = String(total % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

/** Valida cupo según programa. Devuelve mensaje de error o null. */
export function capacityError(category: string, maxCapacity: number): string | null {
  if (!Number.isInteger(maxCapacity) || maxCapacity <= 0) return 'El cupo debe ser un entero positivo.';
  if (category === 'reformer' && maxCapacity > MAX_REFORMER_CAPACITY) {
    return `El cupo de Reformer no puede exceder ${MAX_REFORMER_CAPACITY} (número de máquinas).`;
  }
  return null;
}

export interface GridSlot { day: number; start: string; classType: string; instructor: string; active?: boolean }
export interface FichaDef {
  facility: string;
  category: 'reformer' | 'multi';
  capacity: number;
  durationMin: number;
  slots: GridSlot[];
}
export interface ScheduleRow {
  facility: string;
  class_type: string;
  category: 'reformer' | 'multi';
  instructor: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  max_capacity: number;
  is_active: boolean;
}

/** Expande una ficha declarativa a filas normalizadas (sin resolver IDs). Puro. */
export function buildScheduleRows(ficha: FichaDef): ScheduleRow[] {
  return ficha.slots.map((s) => ({
    facility: ficha.facility,
    class_type: s.classType,
    category: ficha.category,
    instructor: s.instructor,
    day_of_week: s.day,
    start_time: s.start,
    end_time: addMinutesToTime(s.start, ficha.durationMin),
    max_capacity: ficha.capacity,
    is_active: s.active ?? true,
  }));
}
