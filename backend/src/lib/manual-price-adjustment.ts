export const MANUAL_ADJUSTMENT_REASON_MIN_LENGTH = 5;

export type ManualDiscountType = 'percentage' | 'fixed';

export type ManualPriceAdjustmentResult =
  | {
      ok: true;
      applied: false;
      amount: number;
      discountAmount: 0;
      discountType: null;
      discountValue: 0;
      reason: null;
    }
  | {
      ok: true;
      applied: true;
      amount: number;
      discountAmount: number;
      discountType: ManualDiscountType;
      discountValue: number;
      reason: string;
    }
  | { ok: false; error: string };

const money = (value: number) => Math.round(value * 100) / 100;

/**
 * Calcula un descuento manual sin permitir convertirlo en una cortesía encubierta.
 * Un total de $0 debe registrarse mediante payment_method='gratis', que tiene sus
 * propios permisos y auditoría. Todo descuento manual exige un comentario.
 */
export function resolveManualPriceAdjustment(input: {
  listPrice: number;
  discountType?: ManualDiscountType | null;
  discountValue?: number | null;
  reason?: string | null;
}): ManualPriceAdjustmentResult {
  const listPrice = money(Number(input.listPrice));
  if (!Number.isFinite(listPrice) || listPrice < 0) {
    return { ok: false, error: 'El precio de lista es inválido.' };
  }

  const discountValue = Number(input.discountValue ?? 0);
  if (!Number.isFinite(discountValue) || discountValue < 0) {
    return { ok: false, error: 'El descuento debe ser un número mayor o igual a cero.' };
  }

  if (input.discountType != null && !['percentage', 'fixed'].includes(input.discountType)) {
    return { ok: false, error: 'El tipo de descuento es inválido.' };
  }

  if (discountValue === 0) {
    return {
      ok: true,
      applied: false,
      amount: listPrice,
      discountAmount: 0,
      discountType: null,
      discountValue: 0,
      reason: null,
    };
  }

  if (!input.discountType) {
    return { ok: false, error: 'Selecciona si el descuento es porcentaje o monto fijo.' };
  }

  const reason = String(input.reason ?? '').trim();
  if (reason.length < MANUAL_ADJUSTMENT_REASON_MIN_LENGTH) {
    return {
      ok: false,
      error: `El comentario del descuento es obligatorio (mínimo ${MANUAL_ADJUSTMENT_REASON_MIN_LENGTH} caracteres).`,
    };
  }

  let discountAmount: number;
  if (input.discountType === 'percentage') {
    if (discountValue >= 100) {
      return { ok: false, error: 'Para regalar el 100%, usa Gratis (cortesía).' };
    }
    discountAmount = money(listPrice * (discountValue / 100));
  } else {
    if (discountValue >= listPrice) {
      return { ok: false, error: 'Para dejar el total en $0, usa Gratis (cortesía).' };
    }
    discountAmount = money(discountValue);
  }

  return {
    ok: true,
    applied: true,
    amount: money(listPrice - discountAmount),
    discountAmount,
    discountType: input.discountType,
    discountValue: money(discountValue),
    reason,
  };
}

export function manualDiscountNote(adjustment: Extract<ManualPriceAdjustmentResult, { ok: true; applied: true }>): string {
  const value = adjustment.discountType === 'percentage'
    ? `${adjustment.discountValue}%`
    : `$${adjustment.discountValue.toFixed(2)}`;
  return `Descuento manual ${value} (-$${adjustment.discountAmount.toFixed(2)}). Comentario: ${adjustment.reason}`;
}
