export interface CashInputs {
  openingFloat: number;
  cashSales: number;   // ventas + pagos de membresía en efectivo
  cashIn: number;      // movimientos cash_in
  cashOut: number;     // movimientos cash_out
  cashEgresos: number; // egresos pagados en efectivo dentro del turno
}

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/** Efectivo esperado en caja al cierre. */
export function computeExpectedCash(i: CashInputs): number {
  return round2(i.openingFloat + i.cashSales + i.cashIn - i.cashOut - i.cashEgresos);
}

/** Diferencia = contado − esperado (positivo = sobrante, negativo = faltante). */
export function computeDifference(expected: number, counted: number): number {
  return round2(counted - expected);
}
