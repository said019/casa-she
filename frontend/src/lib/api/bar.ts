import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';

export interface BarProduct {
  id: string;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  stock: number;
  category_name: string;
}

export interface BarMenu {
  open: boolean;
  products: BarProduct[];
}

export interface BarClientConfig {
  enabled: boolean;
  card_enabled: boolean;
  points_enabled: boolean;
  points_redemption_rate: number;
  card_surcharge_percent: number;
  cancellation_window_minutes: number;
}

export interface PickupAfterClass {
  pickup_iso: string;
  class_name: string;
  ends_iso: string;
}

export interface PickupSuggestions {
  after_class: PickupAfterClass | null;
  manual_window: { earliest_iso: string; latest_iso: string };
}

export function useBarConfig() {
  return useQuery({
    queryKey: ['bar-config-client'],
    queryFn: async () => (await api.get('/bar/config')).data as BarClientConfig,
    staleTime: 5 * 60 * 1000,
  });
}

export function usePickupSuggestions() {
  return useQuery({
    queryKey: ['bar-pickup-suggestions'],
    queryFn: async () => (await api.get('/bar/pickup-suggestions')).data as PickupSuggestions,
    staleTime: 60 * 1000,
  });
}

export function useBarMenu(enabled: boolean) {
  return useQuery({
    queryKey: ['bar-menu'],
    enabled,
    queryFn: async () => (await api.get('/bar/menu')).data as BarMenu,
  });
}

export function useBarOrder(id: string) {
  return useQuery({
    queryKey: ['bar-order', id],
    enabled: !!id,
    queryFn: async () => (await api.get(`/bar/orders/${id}`)).data,
    refetchInterval: (q) => {
      const s = (q.state.data as any)?.status;
      return s && s !== 'delivered' && s !== 'cancelled' ? 5000 : false;
    },
  });
}

export type BarCartLine = { product: BarProduct; quantity: number };
