export type ManualDiscountType = 'percentage' | 'fixed';

export const MANUAL_ADJUSTMENT_COMMENT_MIN_LENGTH = 5;

const roundMoney = (value: number) => Math.round(value * 100) / 100;

export function calculateManualDiscount(
  listPrice: number,
  enabled: boolean,
  type: ManualDiscountType,
  rawValue: string | number,
) {
  const price = Math.max(0, Number(listPrice) || 0);
  const value = Math.max(0, Number(rawValue) || 0);
  if (!enabled || value === 0) return { discountAmount: 0, total: roundMoney(price), valid: !enabled };

  if (type === 'percentage') {
    if (value >= 100) return { discountAmount: price, total: 0, valid: false };
    const discountAmount = roundMoney(price * (value / 100));
    return { discountAmount, total: roundMoney(price - discountAmount), valid: true };
  }

  if (value >= price) return { discountAmount: price, total: 0, valid: false };
  const discountAmount = roundMoney(value);
  return { discountAmount, total: roundMoney(price - discountAmount), valid: true };
}
