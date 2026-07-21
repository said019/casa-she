import { useParams, useNavigate } from 'react-router-dom';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { ClientLayout } from '@/components/layout/ClientLayout';
import { useToast } from '@/hooks/use-toast';
import api from '@/lib/api';
import { useBarOrder } from '@/lib/api/bar';

// ── types ─────────────────────────────────────────────────────────────────────

interface OrderItem {
  id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  image_url?: string | null;
}

interface BarOrderData {
  id: string;
  status: 'pending' | 'preparing' | 'ready' | 'delivered' | 'cancelled';
  payment_method: string;
  payment_status?: string;
  mp_checkout_url?: string | null;
  items: OrderItem[];
  created_at: string;
}

// ── helpers ───────────────────────────────────────────────────────────────────

const STATUS_STEPS = ['pending', 'preparing', 'ready'];

function statusStep(status: string) {
  const i = STATUS_STEPS.indexOf(status);
  return i === -1 ? 0 : i;
}

const STATUS_LABEL: Record<string, string> = {
  pending: 'En cola',
  preparing: 'Preparando tu bebida',
  ready: '¡Lista en la barra!',
  delivered: 'Entregada',
  cancelled: 'Cancelada',
};

function shortId(id: string) {
  return id.slice(-4).toUpperCase();
}

// ── Thumb with image or fallback ──────────────────────────────────────────────

function ReadyThumb({ src, name }: { src?: string | null; name: string }) {
  if (src) {
    return (
      <div
        className="relative mb-[26px] flex h-[118px] w-[118px] items-end justify-center overflow-hidden rounded-full"
        style={{
          background: 'radial-gradient(circle at 50% 32%, #FCF7EE, #E7DAC2)',
          boxShadow:
            '0 0 0 10px rgba(42,78,54,.08), 0 0 0 24px rgba(42,78,54,.04), 0 26px 44px -24px rgba(22,38,26,.55)',
        }}
      >
        <img
          src={src}
          alt={name}
          className="h-[130px] w-auto object-contain mb-[-6px] drop-shadow-[0_8px_10px_rgba(22,38,26,.28)]"
        />
      </div>
    );
  }
  return (
    <div
      className="relative mb-[26px] flex h-[118px] w-[118px] items-center justify-center overflow-hidden rounded-full"
      style={{
        background: 'radial-gradient(circle at 50% 32%, #FCF7EE, #E7DAC2)',
        boxShadow:
          '0 0 0 10px rgba(42,78,54,.08), 0 0 0 24px rgba(42,78,54,.04), 0 26px 44px -24px rgba(22,38,26,.55)',
      }}
    />
  );
}

// ── component ─────────────────────────────────────────────────────────────────

export default function FuelBarOrder() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const { toast } = useToast();

  const { data, isLoading, error } = useBarOrder(id ?? '');
  const order = data as BarOrderData | undefined;

  const cancel = async () => {
    if (!id) return;
    try {
      await api.delete(`/bar/orders/${id}`);
      toast({ title: 'Pedido cancelado' });
      nav('/app/fuel-bar');
    } catch (err: any) {
      toast({
        title: 'No se pudo cancelar',
        description: err?.response?.data?.message ?? 'Intenta de nuevo.',
        variant: 'destructive',
      });
    }
  };

  // ── loading ───────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <AuthGuard>
        <ClientLayout>
          <div className="flex min-h-[60vh] items-center justify-center">
            <div className="h-12 w-12 animate-pulse rounded-full bg-[#2A4E36]/15" />
          </div>
        </ClientLayout>
      </AuthGuard>
    );
  }

  if (error || !order) {
    return (
      <AuthGuard>
        <ClientLayout>
          <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center">
            <p className="font-heading text-2xl text-[#2A4E36]">Pedido no encontrado</p>
            <button
              onClick={() => nav('/app/fuel-bar')}
              className="rounded-full bg-[#2A4E36] px-6 py-3 text-sm text-[#F6EFE1]"
            >
              Volver al menú
            </button>
          </div>
        </ClientLayout>
      </AuthGuard>
    );
  }

  const isReady = order.status === 'ready';
  const isCancelled = order.status === 'cancelled';
  const isDelivered = order.status === 'delivered';
  const isPending = order.status === 'pending';
  const isDone = isDelivered || isCancelled;

  const isCardPaymentPending = order.payment_method === 'card' && order.payment_status !== 'paid';
  const isCardPaymentFailed = isCardPaymentPending && order.payment_status === 'failed';
  const step = isCardPaymentPending ? -1 : statusStep(order.status);
  const firstItem = order.items?.[0];
  const itemNames = (order.items ?? []).map((i) => i.product_name).join(' · ');

  const isReceptionUnpaid = order.payment_method === 'reception' && order.payment_status !== 'paid';
  const statusLabel = isCardPaymentPending
    ? (isCardPaymentFailed ? 'Pago no completado' : 'Pago pendiente')
    : STATUS_LABEL[order.status];

  return (
    <AuthGuard>
      <ClientLayout>
        <div className="relative mx-auto max-w-md px-4">

          {/* ── Cancelled / Delivered ─────────────────────────────────────── */}
          {isDone && (
            <div className="mt-10 flex flex-col items-center gap-4 text-center">
              <div
                className={[
                  'flex h-16 w-16 items-center justify-center rounded-full text-[#F6EFE1]',
                  isCancelled ? 'bg-[#AE4836]' : 'bg-[#2A4E36]',
                ].join(' ')}
              >
                {isCancelled ? (
                  <svg viewBox="0 0 24 24" className="h-7 w-7" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" className="h-7 w-7" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
              <h2 className="font-heading text-3xl text-[#2A4E36]">
                {isCancelled ? 'Pedido cancelado' : 'Pedido entregado'}
              </h2>
              <p className="text-sm italic text-[#2A4E36]/55">
                {isCancelled ? 'Tu pedido fue cancelado.' : '¡Disfruta tu bebida!'}
              </p>
              <button
                onClick={() => nav('/app/fuel-bar')}
                className="mt-4 rounded-full bg-[#2A4E36] px-6 py-3 text-sm text-[#F6EFE1]"
              >
                Ver menú
              </button>
            </div>
          )}

          {/* ── Active order ──────────────────────────────────────────────── */}
          {!isDone && (
            <div className="relative flex flex-col items-center pt-10 text-center">
              {/* Progress steps */}
              <div className="mb-12 flex gap-[10px]">
                {STATUS_STEPS.map((s, i) => (
                  <div
                    key={s}
                    className={[
                      'h-1 w-[30px] rounded-[2px] transition-all',
                      i <= step ? 'bg-[#2A4E36]' : 'bg-[rgba(42,78,54,.15)]',
                    ].join(' ')}
                  />
                ))}
              </div>

              {/* Product thumb + checkmark badge */}
              <div className="relative">
                <ReadyThumb
                  src={firstItem?.image_url}
                  name={firstItem?.product_name ?? 'Tu bebida'}
                />
                {isReady && (
                  <div
                    className="absolute right-0 bottom-[30px] z-10 flex h-10 w-10 items-center justify-center rounded-full bg-[#2A4E36] shadow-[0_12px_22px_-10px_rgba(42,78,54,.8)]"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      className="h-5 w-5 text-[#F6EFE1]"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                )}
              </div>

              {/* Status text */}
              <h2 className="font-heading text-[38px] leading-[1.02] text-[#2A4E36]">
                {statusLabel}
              </h2>
              <p className="mt-[10px] text-[14px] italic leading-[1.5] text-[#2A4E36]/58">
                {isReady ? (
                  <>
                    {itemNames}
                    <br />
                    Muestra este código al recogerla
                  </>
                ) : isCardPaymentPending ? (
                  isCardPaymentFailed
                    ? 'No se confirmó el pago. Puedes intentarlo de nuevo o cancelar el pedido.'
                    : 'Tu pedido llegará a la barra cuando se confirme el pago con tarjeta.'
                ) : isPending ? (
                  'Tu pedido está en la cola. Prepárate para recoger.'
                ) : (
                  'Estamos preparando tu bebida con cariño.'
                )}
              </p>

              {/* QR-like order code (when ready) */}
              {isReady && (
                <div className="mt-6 rounded-[24px] border border-[rgba(22,38,26,.10)] bg-[rgba(42,78,54,.05)] p-[9px]">
                  <div className="flex h-[120px] w-[120px] items-center justify-center rounded-[16px] bg-white shadow-[inset_0_1px_2px_rgba(0,0,0,.06)]">
                    <span className="font-heading text-4xl text-[#16261A]">
                      {shortId(order.id)}
                    </span>
                  </div>
                  <p className="mt-3 text-[10.5px] uppercase tracking-[.2em] text-[#2A4E36] opacity-42">
                    Pedido {shortId(order.id)} · Casa Shé
                  </p>
                </div>
              )}

              {/* "Pagas al recoger" notice */}
              {isReceptionUnpaid && (
                <div className="mt-6 rounded-[14px] border border-[rgba(22,38,26,.12)] bg-[rgba(42,78,54,.05)] px-5 py-4 text-sm text-[#2A4E36]">
                  <span className="font-semibold">Pagas al recoger</span>
                  <br />
                  <span className="opacity-65">Trae efectivo o tarjeta a la barra.</span>
                </div>
              )}

              {isCardPaymentPending && (
                <div className="mt-6 rounded-[14px] border border-amber-300/70 bg-amber-50 px-5 py-4 text-sm text-amber-900">
                  <span className="font-semibold">Aún no se ha cobrado tu tarjeta</span>
                  <br />
                  <span className="opacity-75">No enviamos este pedido a preparación hasta recibir la confirmación del pago.</span>
                </div>
              )}

              {/* Cancel button (pending only) */}
              <div className="mt-8 flex flex-col items-center gap-3">
                <button
                  onClick={() => nav('/app/fuel-bar')}
                  className="rounded-full bg-[#2A4E36] px-6 py-3 text-sm text-[#F6EFE1]"
                >
                  Pedir otra cosa
                </button>
                {isCardPaymentPending && order.mp_checkout_url && (
                  <button
                    onClick={() => { window.location.href = order.mp_checkout_url!; }}
                    className="rounded-full bg-[#C89B25] px-6 py-3 text-sm text-white transition-colors hover:bg-[#aa8117]"
                  >
                    Continuar pago
                  </button>
                )}
                {isPending && (
                  <button
                    onClick={cancel}
                    className="rounded-full border border-[rgba(174,72,54,.35)] px-6 py-3 text-sm text-[#AE4836] transition-colors hover:bg-[#AE4836]/10"
                  >
                    Cancelar pedido
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </ClientLayout>
    </AuthGuard>
  );
}
