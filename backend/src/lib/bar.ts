// Barra de bebidas: helpers puros (sin BD, testeables). Ver scripts/test-bar.ts
export const BAR_CATEGORY_NAMES = [
  'Calientes con café', 'Fríos sin café', 'Tisanas', 'Fríos con café', 'Smoothies', 'Proteínas',
] as const;

export type BarStatus = 'pending' | 'preparing' | 'ready' | 'delivered' | 'cancelled';

export interface BarConfig {
  enabled: boolean;
  // clave = día de la semana (0=Dom .. 6=Sáb). null = cerrado ese día.
  operating_hours: Record<number, { open: string; close: string } | null>;
  lead_time_max_hours: number;   // cuánto se puede programar la recogida hacia adelante
  pickup_offset_minutes: number; // offset vs fin de clase (negativo = lista antes)
}

function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

// Usa hora LOCAL del servidor. En producción el server corre en la TZ del estudio.
export function isBarOpenAt(cfg: BarConfig, d: Date): boolean {
  if (!cfg?.enabled) return false;
  const dow = d.getDay();
  const hours = cfg.operating_hours?.[dow];
  if (!hours) return false;
  const mins = d.getHours() * 60 + d.getMinutes();
  return mins >= hhmmToMinutes(hours.open) && mins < hhmmToMinutes(hours.close);
}

export function computeBarTotals(items: { unit_price_mxn: number; quantity: number }[]): { subtotal_mxn: number; total_mxn: number } {
  const subtotal = items.reduce((acc, it) => acc + Number(it.unit_price_mxn) * Number(it.quantity), 0);
  const r = Math.round(subtotal * 100) / 100;
  return { subtotal_mxn: r, total_mxn: r };
}

const STAFF: Record<BarStatus, BarStatus[]> = {
  pending: ['preparing', 'cancelled'],
  preparing: ['ready', 'cancelled'],
  ready: ['delivered', 'cancelled'],
  delivered: [],
  cancelled: [],
};
export function canBarTransition(from: BarStatus, to: BarStatus, actor: 'staff' | 'customer' | 'system'): boolean {
  if (actor === 'customer' || actor === 'system') return from === 'pending' && to === 'cancelled';
  return (STAFF[from] ?? []).includes(to);
}
