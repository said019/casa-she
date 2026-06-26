export function formatDbDate(value: string | Date | null | undefined): string {
  if (!value) return 'Sin fecha';
  const iso = value instanceof Date ? value.toISOString() : String(value);
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return new Date(iso).toLocaleDateString();
  const [, y, m, d] = match;
  return new Date(Number(y), Number(m) - 1, Number(d)).toLocaleDateString();
}

/**
 * Parsea una fecha de la BD ('YYYY-MM-DD' o timestamp) como fecha LOCAL.
 * Evita el off-by-one: si la BD manda medianoche UTC (p.ej. '2026-06-23T00:00:00Z'),
 * `parseISO` + zona México la corría un día antes. Aquí tomamos solo año-mes-día.
 */
export function parseLocalDate(value: string | Date): Date {
  const iso = value instanceof Date ? value.toISOString() : String(value);
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return new Date(iso);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** Devuelve 'YYYY-MM-DD' (hora local) para <input type="date">. */
export function formatDateForInput(value: Date = new Date()): string {
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, '0');
  const d = String(value.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Suma `days` a una fecha base (hora local) y la devuelve como 'YYYY-MM-DD'.
 * Sirve para precalcular el vencimiento = inicio + duración del plan.
 */
export function addDaysForInput(base: string | Date, days: number): string {
  const d = typeof base === 'string'
    ? new Date(`${base}T00:00:00`)
    : new Date(base.getTime());
  d.setDate(d.getDate() + days);
  return formatDateForInput(d);
}
