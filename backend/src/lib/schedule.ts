export const MAX_REFORMER_CAPACITY = 8;

/**
 * Convierte una fecha+hora de PARED en America/Mexico_City (CDMX) al instante UTC real,
 * respetando horario de verano (DST: UTC-5 abr-oct, UTC-6 nov-mar). Un offset fijo (-06:00)
 * queda mal la mitad del año — permitía reservar/hacer check-in hasta 1h después de que la
 * clase ya había iniciado. Usa Intl.DateTimeFormat.formatToParts para el offset real del día.
 */
export function cdmxWallClockToUtc(dateStr: string, timeStr: string): Date {
  const probe = new Date(`${dateStr}T${timeStr}:00Z`);
  const tzParts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Mexico_City',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(probe);
  const getPart = (type: string) => Number(tzParts.find((p) => p.type === type)?.value ?? 0);
  const probeAsMxUtcMs = Date.UTC(
    getPart('year'), getPart('month') - 1, getPart('day'),
    getPart('hour') % 24, getPart('minute'), getPart('second'),
  );
  return new Date(probe.getTime() + (probe.getTime() - probeAsMxUtcMs));
}

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
