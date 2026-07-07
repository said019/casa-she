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

export function useBarConfig() {
  return useQuery({
    queryKey: ['bar-config-client'],
    queryFn: async () => (await api.get('/bar/config')).data as { enabled: boolean },
    staleTime: 5 * 60 * 1000,
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
