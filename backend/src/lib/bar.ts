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
  // Fase 2 (100% configurable):
  cancellation_window_minutes: number; // cliente cancela solo si falta > esto para la recogida
  card_surcharge_percent: number;      // recargo % por pagar con tarjeta (0 = sin recargo)
  card_enabled: boolean;               // permitir pago con tarjeta
  points_enabled: boolean;             // permitir pago con puntos
  points_redemption_rate: number;      // MXN por punto (10 = 1 punto vale $10)
  preparing_push: boolean;             // enviar push al pasar a 'preparing'
  prep_time_minutes: number;           // tiempo estimado de preparación (para el copy del push)
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

export function computeBarTotals(
  items: { unit_price_mxn: number; quantity: number }[],
  opts: { surchargePercent?: number } = {},
): { subtotal_mxn: number; surcharge_mxn: number; total_mxn: number } {
  const subtotal = items.reduce((acc, it) => acc + Number(it.unit_price_mxn) * Number(it.quantity), 0);
  const sub = Math.round(subtotal * 100) / 100;
  const pct = Number(opts.surchargePercent ?? 0);
  const surcharge = pct > 0 ? Math.round(sub * pct) / 100 : 0;
  return { subtotal_mxn: sub, surcharge_mxn: surcharge, total_mxn: Math.round((sub + surcharge) * 100) / 100 };
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

// Puntos necesarios para cubrir un total, a la tasa dada (MXN por punto). Redondea hacia arriba.
export function pointsForTotal(totalMxn: number, redemptionRate: number): number {
  if (!(redemptionRate > 0)) return Infinity;
  return Math.ceil(Number(totalMxn) / redemptionRate);
}

// El cliente puede cancelar solo si falta MÁS que la ventana para la recogida.
export function canCustomerCancel(pickupTime: Date, now: Date, windowMinutes: number): boolean {
  return pickupTime.getTime() - now.getTime() > windowMinutes * 60_000;
}

// Devuelve la próxima apertura de la barra (hasta 7 días adelante) o null si no hay horario configurado.
export function nextBarOpening(cfg: BarConfig, from: Date): { iso: string; label: string } | null {
  // Search up to 7 days ahead (offsets 0..6)
  for (let i = 0; i <= 6; i++) {
    const dow = (from.getDay() + i) % 7;
    const hours = cfg.operating_hours?.[dow];
    if (!hours) continue;
    const openMins = hhmmToMinutes(hours.open);
    if (i === 0) {
      // today: only count it if bar hasn't opened yet (current time < open time)
      const nowMins = from.getHours() * 60 + from.getMinutes();
      if (nowMins >= openMins) continue; // already opened or currently open — skip
    }
    // Build the opening Date: start of `from`'s day + i days + openMins
    const opening = new Date(from);
    opening.setHours(0, 0, 0, 0);
    opening.setDate(opening.getDate() + i);
    opening.setHours(Math.floor(openMins / 60), openMins % 60, 0, 0);

    let label: string;
    if (i === 0) {
      label = `hoy a las ${hours.open}`;
    } else if (i === 1) {
      label = `mañana a las ${hours.open}`;
    } else {
      const dayName = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'][dow];
      label = `el ${dayName} a las ${hours.open}`;
    }
    return { iso: opening.toISOString(), label };
  }
  return null;
}
