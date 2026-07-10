import { z } from 'zod';

export const BENEFIT_TYPE = {
  free_class: 'free_class',
  bar_discount: 'bar_discount',
  product_discount: 'product_discount',
  free_drink: 'free_drink',
  discount_package: 'discount_package',
} as const;

export type BenefitType = (typeof BENEFIT_TYPE)[keyof typeof BENEFIT_TYPE];

export const BENEFIT_STATUS = {
  active: 'active',
  used: 'used',
  expired: 'expired',
  cancelled: 'cancelled',
} as const;

export type BenefitStatus = (typeof BENEFIT_STATUS)[keyof typeof BENEFIT_STATUS];

const BENEFIT_TYPE_VALUES = Object.values(BENEFIT_TYPE) as ReadonlyArray<string>;

export function isBenefitType(value: unknown): value is BenefitType {
  return typeof value === 'string' && (BENEFIT_TYPE_VALUES as readonly string[]).includes(value);
}

export function toBenefitType(value: unknown): BenefitType {
  if (isBenefitType(value)) return value;
  throw new Error(`Invalid benefit_type: ${String(value)}. Must be one of: ${BENEFIT_TYPE_VALUES.join(', ')}`);
}

export interface FreeClassValue {
  class_type: string;
}

export interface DiscountValue {
  discount_type: 'percentage' | 'fixed';
  amount: number;
}

export interface FreeDrinkValue {
  quantity: number;
}

export type BenefitValue = FreeClassValue | DiscountValue | FreeDrinkValue;

export interface UserBenefit {
  id: string;
  user_id: string;
  benefit_type: BenefitType;
  benefit_value: BenefitValue;
  status: BenefitStatus;
  redemption_id: string;
  class_type_id: string | null;
  expires_at: string;
  used_at: string | null;
  used_on_booking_id: string | null;
  used_on_bar_order_id: string | null;
  used_on_sale_id: string | null;
  used_by: string | null;
  created_at: string;
}

export const FreeClassValueSchema = z.object({
  class_type: z.string().min(1, 'class_type es requerido para free_class'),
});

export const DiscountValueSchema = z.object({
  discount_type: z.enum(['percentage', 'fixed'], { message: 'discount_type debe ser percentage o fixed' }),
  amount: z.number().positive('amount debe ser positivo'),
});

export const FreeDrinkValueSchema = z.object({
  quantity: z.number().int().positive('quantity debe ser positivo').default(1),
});

const schemasByType: Record<string, z.ZodType<any>> = {
  free_class: FreeClassValueSchema,
  bar_discount: DiscountValueSchema,
  product_discount: DiscountValueSchema,
  discount_package: DiscountValueSchema,
  free_drink: FreeDrinkValueSchema,
};

function parseIfString(raw: unknown): unknown {
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); }
    catch { return raw; }
  }
  return raw;
}

export function validateRewardValue(benefitType: string, rawValue: unknown): BenefitValue {
  const schema = schemasByType[benefitType];
  if (!schema) {
    throw new Error(`Tipo de recompensa desconocido: ${benefitType}`);
  }
  return schema.parse(parseIfString(rawValue)) as BenefitValue;
}

export function isFreeClassValue(v: BenefitValue): v is FreeClassValue {
  return 'class_type' in v;
}

export function isDiscountValue(v: BenefitValue): v is DiscountValue {
  return 'discount_type' in v;
}

export function isFreeDrinkValue(v: BenefitValue): v is FreeDrinkValue {
  return 'quantity' in v && !('discount_type' in v) && !('class_type' in v);
}
