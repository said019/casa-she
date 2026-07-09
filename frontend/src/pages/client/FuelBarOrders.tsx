import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { ClientLayout } from '@/components/layout/ClientLayout';
import api from '@/lib/api';

interface BarOrderSummary {
  id: string;
  status: string;
  payment_method: string;
  total_mxn: number;
  created_at: string;
}

function formatPrice(n: number) {
  return `$${Math.round(n).toLocaleString('es-MX')}`;
}

const STATUS_LABEL: Record<string, string> = {
  pending: 'En cola',
  preparing: 'Preparando',
  ready: 'Lista',
  delivered: 'Entregada',
  cancelled: 'Cancelada',
};

const STATUS_COLOR: Record<string, string> = {
  pending: 'bg-[#2A4E36]',
  preparing: 'bg-[#C89B25]',
  ready: 'bg-[#4D8C5E]',
  delivered: 'bg-[#6B7F7E]',
  cancelled: 'bg-[#AE4836]',
};

export default function FuelBarOrders() {
  const nav = useNavigate();

  const { data: orders, isLoading } = useQuery<BarOrderSummary[]>({
    queryKey: ['bar-orders-mine'],
    queryFn: async () => (await api.get('/bar/orders/mine')).data,
  });

  return (
    <AuthGuard>
      <ClientLayout>
        <div className="mx-auto max-w-md px-4 pb-28 pt-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-heading text-[19px] text-[#2A4E36] opacity-90">
              Mis pedidos
            </h2>
            <button
              onClick={() => nav('/app/fuel-bar')}
              className="rounded-full bg-[#2A4E36] px-4 py-2 text-xs text-[#F6EFE1]"
            >
              + Nuevo pedido
            </button>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {[1,2,3].map((i) => (
                <div key={i} className="h-20 animate-pulse rounded-[18px] bg-[#2A4E36]/8" />
              ))}
            </div>
          ) : !orders || orders.length === 0 ? (
            <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-center">
              <p className="font-heading text-xl text-[#2A4E36]">Sin pedidos</p>
              <p className="text-sm text-[#2A4E36]/55">Aún no has hecho ningún pedido en la Fuel Bar.</p>
              <button
                onClick={() => nav('/app/fuel-bar')}
                className="mt-2 rounded-full bg-[#2A4E36] px-6 py-3 text-sm text-[#F6EFE1]"
              >
                Ver menú
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {orders.map((o) => (
                <button
                  key={o.id}
                  onClick={() => nav(`/app/fuel-bar/order/${o.id}`)}
                  className="flex w-full items-center gap-4 rounded-[18px] border border-[rgba(22,38,26,.10)] bg-[rgba(255,255,255,.5)] p-4 text-left transition-all hover:bg-[rgba(42,78,54,.04)]"
                >
                  <div className={`h-3 w-3 flex-shrink-0 rounded-full ${STATUS_COLOR[o.status] || 'bg-gray-400'}`} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[14.5px] text-[#2A4E36]">
                      {STATUS_LABEL[o.status] || o.status}
                    </div>
                    <div className="mt-0.5 text-[11px] text-[#2A4E36] opacity-50">
                      {(() => {
                        try { return format(parseISO(o.created_at), "d MMM · HH:mm", { locale: es }); }
                        catch { return ''; }
                      })()}
                      {o.payment_method === 'card' ? ' · Tarjeta' : o.payment_method === 'points' ? ' · Puntos' : ' · Pago en barra'}
                    </div>
                  </div>
                  <span className="font-heading text-[15px] text-[#2A4E36]">
                    {formatPrice(o.total_mxn)}
                  </span>
                  <svg viewBox="0 0 24 24" className="h-4 w-4 flex-shrink-0 text-[#2A4E36] opacity-30" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                </button>
              ))}
            </div>
          )}
        </div>
      </ClientLayout>
    </AuthGuard>
  );
}
