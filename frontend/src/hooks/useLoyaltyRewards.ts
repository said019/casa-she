import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';

export interface LoyaltyReward {
  id: string;
  name: string;
  description: string | null;
  points_cost: number;
  reward_type: string;
  reward_value: unknown | null;
  is_active: boolean;
  stock: number | null;
}

export const loyaltyRewardsQueryKey = ['loyalty-rewards'] as const;

/**
 * Catálogo que configura el equipo en Admin > Lealtad > Recompensas.
 * El cliente nunca usa datos de muestra: siempre pide el catálogo vigente al API.
 */
export function useLoyaltyRewards() {
  return useQuery<LoyaltyReward[]>({
    queryKey: loyaltyRewardsQueryKey,
    queryFn: async () => (await api.get('/loyalty/rewards')).data,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: 'always',
    refetchInterval: 60_000,
  });
}

export function isRewardInStock(reward: LoyaltyReward) {
  return reward.stock === null || reward.stock > 0;
}

export function isRewardAvailable(reward: LoyaltyReward) {
  return reward.is_active && isRewardInStock(reward);
}

export const rewardTypeLabels: Record<string, string> = {
  discount: 'Descuento',
  free_class: 'Clase gratis',
  product: 'Producto',
  membership_extension: 'Membresía',
  bar_discount: 'Descuento en barra',
  product_discount: 'Descuento en ropa',
  free_drink: 'Bebida gratis',
  discount_package: 'Descuento en paquete',
};

function asRewardValue(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'string') {
    try {
      return asRewardValue(JSON.parse(value));
    } catch {
      return null;
    }
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return null;
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/** Texto legible del valor real definido para la recompensa en Admin. */
export function formatRewardValue(reward: LoyaltyReward): string | null {
  const value = asRewardValue(reward.reward_value);
  if (!value) return null;

  switch (reward.reward_type) {
    case 'free_class':
      return typeof value.class_type === 'string' && value.class_type.trim()
        ? `Válida para ${value.class_type}`
        : null;
    case 'bar_discount':
    case 'product_discount':
    case 'discount_package':
    case 'discount': {
      if (!isPositiveNumber(value.amount)) return null;
      return value.discount_type === 'fixed'
        ? `$${value.amount} de descuento`
        : `${value.amount}% de descuento`;
    }
    case 'free_drink':
      return isPositiveNumber(value.quantity)
        ? `${value.quantity} ${value.quantity === 1 ? 'bebida gratis' : 'bebidas gratis'}`
        : null;
    default:
      return null;
  }
}
