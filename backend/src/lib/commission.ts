const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export interface CommissionInput {
  commissionableSales: number; // monto de MEMBRESÍAS PÚBLICAS vendidas (planes is_active=true)
  monthlyTarget: number;       // objetivo en $
  commissionRate: number;      // porcentaje, ej. 5 = 5%
}
export interface CommissionResult {
  reached: boolean;
  commission: number;          // 0 si no alcanza el objetivo
}

/** Comisión = % sobre las membresías públicas vendidas SI alcanza el objetivo; si no, 0. Puro. */
export function computeCommission(i: CommissionInput): CommissionResult {
  const reached = i.commissionableSales >= i.monthlyTarget;
  const commission = reached ? round2(i.commissionableSales * i.commissionRate / 100) : 0;
  return { reached, commission };
}

export interface CommissionSetting {
  monthly_target: number;
  commission_rate: number;
}

/** Si existe override, se usa completo; si no, el default. */
export function resolveCommissionSetting(
  def: CommissionSetting,
  override?: CommissionSetting | null,
): CommissionSetting {
  return override ?? def;
}
