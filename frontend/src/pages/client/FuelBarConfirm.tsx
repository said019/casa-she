import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { ClientLayout } from '@/components/layout/ClientLayout';
import { useToast } from '@/hooks/use-toast';
import api from '@/lib/api';
import type { BarCartLine } from '@/lib/api/bar';
import { useBarConfig, usePickupSuggestions } from '@/lib/api/bar';

// ── helpers ───────────────────────────────────────────────────────────────────

function formatPrice(n: number) {
  return `$${Math.round(n).toLocaleString('es-MX')}`;
}

function fmtTime(iso: string) {
  try {
    return format(parseISO(iso), 'HH:mm', { locale: es });
  } catch {
    return '';
  }
}

// Convert datetime-local input value to ISO bounds for min/max
function isoToLocalInput(iso: string) {
  try {
    const d = parseISO(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return '';
  }
}

// Small product thumbnail for order review
function OrderThumb({ src, name }: { src: string | null; name: string }) {
  if (src) {
    return (
      <div className="flex h-[52px] w-[52px] flex-shrink-0 items-end justify-center overflow-hidden rounded-[15px] shadow-[inset_0_1px_2px_rgba(255,255,255,.7),0_10px_16px_-11px_rgba(22,38,26,.4)]">
        <img
          src={src}
          alt={name}
          className="h-[66px] w-auto object-contain mb-[-4px] drop-shadow-[0_5px_6px_rgba(22,38,26,.2)]"
        />
      </div>
    );
  }
  return (
    <div
      className="flex h-[52px] w-[52px] flex-shrink-0 items-end justify-center overflow-hidden rounded-[15px] shadow-[inset_0_1px_2px_rgba(255,255,255,.7),0_10px_16px_-11px_rgba(22,38,26,.4)]"
      style={{ background: 'radial-gradient(circle at 50% 32%, #FCF7EE, #EADDC6)' }}
    />
  );
}

type PayMethod = 'card' | 'reception' | 'points';
type PickupMode = 'asap' | 'after_class' | 'other';

// ── component ─────────────────────────────────────────────────────────────────

// ── Error code → Spanish message map ─────────────────────────────────────────
const ERROR_MESSAGES: Record<string, string> = {
  CARD_DISABLED: 'El pago con tarjeta no está disponible. Elige otra opción.',
  POINTS_DISABLED: 'El pago con puntos no está disponible.',
  INSUFFICIENT_POINTS: 'No tienes suficientes puntos para cubrir este pedido.',
  INVALID_PICKUP_TIME: 'Elige una hora de recogida válida.',
  BAR_DISABLED: 'La barra está cerrada por ahora.',
  CARD_PAYMENT_FAILED: 'No se pudo iniciar el pago con tarjeta. Intenta de nuevo.',
  POINTS_CHARGE_FAILED: 'No se pudo procesar el pago con puntos. Intenta de nuevo.',
  PRODUCT_NOT_FOUND: 'Un producto ya no está disponible.',
};

export default function FuelBarConfirm() {
  const nav = useNavigate();
  const { state } = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const cart: Record<string, BarCartLine> = state?.cart ?? {};
  const lines = Object.entries(cart).filter(([, l]) => l.quantity > 0);

  const subtotal = lines.reduce((a, [, l]) => {
    const extrasSum = (l.extras ?? []).reduce((s, e) => s + e.price, 0);
    return a + (l.product.price + extrasSum) * l.quantity;
  }, 0);

  // Config & suggestions
  const { data: config } = useBarConfig();
  const { data: suggestions } = usePickupSuggestions();

  // Points balance — real source: GET /wallet/pass → { pointsBalance }
  const { data: walletData } = useQuery<{ pointsBalance: number }>({
    queryKey: ['wallet-pass'],
    queryFn: async () => (await api.get('/wallet/pass')).data,
  });
  const pointsBalance = walletData?.pointsBalance ?? 0;

  // ¿Para cuándo?
  const [pickupMode, setPickupMode] = useState<PickupMode>('asap');
  const [customTime, setCustomTime] = useState('');

  // Pago
  const [payMethod, setPayMethod] = useState<PayMethod>('card');

  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  // ── Surcharge & totals ─────────────────────────────────────────────────────
  const surchargePercent = config?.card_surcharge_percent ?? 0;
  const surcharge =
    payMethod === 'card' && surchargePercent > 0
      ? Math.round(subtotal * (surchargePercent / 100) * 100) / 100
      : 0;
  const displayTotal = Math.round((subtotal + surcharge) * 100) / 100;

  // ── Points ─────────────────────────────────────────────────────────────────
  const rate = config?.points_redemption_rate ?? 0;
  const pointsNeeded = rate > 0 ? Math.ceil(subtotal / rate) : Infinity;
  const canPayWithPoints =
    (config?.points_enabled ?? false) && rate > 0 && pointsBalance >= pointsNeeded;

  // ── Auto-switch payMethod when config loads and current selection is unavailable ──
  useEffect(() => {
    if (!config) return;
    const cardAvailable = config.card_enabled === true;
    const pointsAvailable = canPayWithPoints;
    const currentIsAvailable =
      (payMethod === 'card' && cardAvailable) ||
      (payMethod === 'points' && pointsAvailable) ||
      payMethod === 'reception';
    if (!currentIsAvailable) {
      if (pointsAvailable) {
        setPayMethod('points');
      } else {
        setPayMethod('reception');
      }
    }
  }, [config, canPayWithPoints]);

  // ── Prep time (configurable) ───────────────────────────────────────────────
  const prep = config?.prep_time_minutes ?? 15;

  // ── Pickup time ────────────────────────────────────────────────────────────
  const afterClassIso = suggestions?.after_class?.pickup_iso ?? null;

  const pickupTime: string | null = (() => {
    if (pickupMode === 'asap') {
      return new Date(Date.now() + prep * 60 * 1000).toISOString();
    }
    if (pickupMode === 'after_class' && afterClassIso) {
      return afterClassIso;
    }
    if (pickupMode === 'other' && customTime) {
      return new Date(customTime).toISOString();
    }
    return null;
  })();

  const submit = async () => {
    if (lines.length === 0) {
      toast({ title: 'Carrito vacío', description: 'Agrega al menos un producto.', variant: 'destructive' });
      return;
    }
    if (pickupMode === 'other' && !customTime) {
      toast({ title: 'Selecciona una hora', description: 'Elige a qué hora recoges tu pedido.', variant: 'destructive' });
      return;
    }
    if (pickupMode === 'after_class' && !afterClassIso) {
      toast({ title: 'Elige una hora de recogida', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      const body = {
        items: lines.map(([, l]) => ({
          productId: l.product.id,
          quantity: l.quantity,
          extras: (l.extras ?? []).map((e) => e.id),
        })),
        pickupTime,
        paymentMethod: payMethod,
        notes: notes || undefined,
      };
      const { data } = await api.post('/bar/orders', body);
      if (data.checkout_url) {
        window.location.href = data.checkout_url;
        return;
      }
      nav(`/app/fuel-bar/order/${data.id}`);
    } catch (err: any) {
      const code = err?.response?.data?.error;
      if (code === 'INSUFFICIENT_POINTS') {
        toast({
          title: 'Puntos insuficientes',
          description: ERROR_MESSAGES.INSUFFICIENT_POINTS,
          variant: 'destructive',
        });
        setPayMethod(config?.card_enabled === true ? 'card' : 'reception');
        qc.invalidateQueries({ queryKey: ['wallet-pass'] });
      } else {
        toast({
          title: 'Error al crear pedido',
          description: ERROR_MESSAGES[code] ?? 'Intenta de nuevo.',
          variant: 'destructive',
        });
      }
    } finally {
      setLoading(false);
    }
  };

  if (lines.length === 0) {
    return (
      <AuthGuard>
        <ClientLayout>
          <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center">
            <p className="font-heading text-2xl text-[#2A4E36]">Tu carrito está vacío</p>
            <button
              onClick={() => nav('/app/fuel-bar')}
              className="mt-2 rounded-full bg-[#2A4E36] px-6 py-3 text-sm text-[#F6EFE1]"
            >
              Ver menú
            </button>
          </div>
        </ClientLayout>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <ClientLayout>
        <div className="relative mx-auto max-w-md px-4 pb-28 pt-2">

          {/* ── Tu orden ─────────────────────────────────────────────────────── */}
          <h2 className="font-heading mt-2 mb-3 text-[19px] text-[#2A4E36] opacity-90">
            Tu orden
          </h2>

          <div>
            {lines.map(([lineKey, line], i) => (
              <div
                key={lineKey}
                className={[
                  'flex items-center gap-[14px] py-3',
                  i < lines.length - 1 ? 'border-b border-[rgba(22,38,26,.06)]' : '',
                ].join(' ')}
              >
                <OrderThumb src={line.product.image_url} name={line.product.name} />
                <div className="min-w-0 flex-1">
                  <div className="text-[15.5px] text-[#2A4E36]">{line.product.name}</div>
                  <div className="mt-0.5 text-[12px] italic text-[#2A4E36] opacity-50">
                    {line.product.category_name} · {line.quantity}
                  </div>
                  {(line.extras ?? []).length > 0 && (
                    <div className="mt-[5px] space-y-[2px]">
                      {(line.extras ?? []).map((e) => (
                        <div key={e.id} className="flex items-center justify-between text-[11px] text-[#2A4E36] opacity-60">
                          <span>{e.name}</span>
                          {e.price > 0 && <span>+{formatPrice(e.price)}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="font-heading ml-auto flex-shrink-0 text-[19px] text-[#2A4E36]">
                  {formatPrice(
                    ((line.product.price + (line.extras ?? []).reduce((s, e) => s + e.price, 0)) *
                      line.quantity),
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* ── ¿Para cuándo? ────────────────────────────────────────────────── */}
          <h2 className="font-heading mt-[22px] mb-3 text-[19px] text-[#2A4E36] opacity-90">
            ¿Para cuándo?
          </h2>

          <div className="flex flex-col gap-[10px]">
            {/* Después de tu clase — only if after_class is available */}
            {afterClassIso && suggestions?.after_class && (
              <PickupChip
                selected={pickupMode === 'after_class'}
                onSelect={() => setPickupMode('after_class')}
                title="Después de tu clase"
                sub={`Lista ${fmtTime(afterClassIso)} (después de ${suggestions.after_class.class_name})`}
              />
            )}

            {/* Lo antes posible + Otra hora side by side */}
            <div className="flex gap-[11px]">
              <PickupChip
                selected={pickupMode === 'asap'}
                onSelect={() => setPickupMode('asap')}
                title="Lo antes posible"
                sub={`Listo ~${prep} min`}
                flex
              />
              <PickupChip
                selected={pickupMode === 'other'}
                onSelect={() => setPickupMode('other')}
                title="Otra hora"
                sub="Elige la hora"
                flex
              />
            </div>
          </div>

          {/* Time picker when "Otra hora" selected */}
          {pickupMode === 'other' && (
            <div className="mt-2">
              <input
                type="datetime-local"
                value={customTime}
                min={suggestions?.manual_window.earliest_iso ? isoToLocalInput(suggestions.manual_window.earliest_iso) : undefined}
                max={suggestions?.manual_window.latest_iso ? isoToLocalInput(suggestions.manual_window.latest_iso) : undefined}
                onChange={(e) => setCustomTime(e.target.value)}
                className="w-full rounded-[14px] border border-[rgba(22,38,26,.12)] bg-[rgba(255,255,255,.42)] px-4 py-3 text-sm text-[#2A4E36] outline-none focus:border-[#2A4E36]"
              />
            </div>
          )}

          {/* ── Pago ─────────────────────────────────────────────────────────── */}
          <h2 className="font-heading mt-[22px] mb-3 text-[19px] text-[#2A4E36] opacity-90">
            Pago
          </h2>

          {/* Tarjeta — solo si card_enabled */}
          {(config?.card_enabled === true) && (
            <PayOption
              selected={payMethod === 'card'}
              onSelect={() => setPayMethod('card')}
              icon={
                <svg viewBox="0 0 24 24" className="h-[19px] w-[19px]" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="6" width="18" height="12" rx="2.5" />
                  <path d="M3 10h18" />
                </svg>
              }
              title="Tarjeta"
              sub="Con Mercado Pago"
            />
          )}

          {/* Puntos — solo si points_enabled && balance suficiente */}
          {canPayWithPoints && (
            <PayOption
              selected={payMethod === 'points'}
              onSelect={() => setPayMethod('points')}
              icon={
                <svg viewBox="0 0 24 24" className="h-[19px] w-[19px]" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7v5l3 3" />
                </svg>
              }
              title="Puntos"
              sub={`Pagas con ${pointsNeeded} puntos (tienes ${pointsBalance})`}
            />
          )}

          {/* Pago en la barra */}
          <PayOption
            selected={payMethod === 'reception'}
            onSelect={() => setPayMethod('reception')}
            icon={
              <svg viewBox="0 0 24 24" className="h-[19px] w-[19px]" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 8h11v4a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5V8z" />
                <path d="M16 9h2a2 2 0 0 1 0 4h-2" />
              </svg>
            }
            title="Pago en la barra"
            sub="Pagas al recoger"
          />

          {/* ── Total ────────────────────────────────────────────────────────── */}
          <div className="mt-4 border-t border-[rgba(22,38,26,.10)] pt-[14px]">
            {/* Subtotal line — only show when there's a surcharge to break out */}
            {payMethod === 'card' && surcharge > 0 && (
              <div className="flex items-baseline justify-between mb-[6px]">
                <span className="text-[11px] uppercase tracking-[.22em] text-[#2A4E36] opacity-55">
                  Subtotal
                </span>
                <span className="text-[15px] text-[#2A4E36] opacity-70">{formatPrice(subtotal)}</span>
              </div>
            )}
            {/* Surcharge line */}
            {payMethod === 'card' && surcharge > 0 && (
              <div className="flex items-baseline justify-between mb-[6px]">
                <span className="text-[11px] uppercase tracking-[.22em] text-[#2A4E36] opacity-55">
                  Uso de app ({surchargePercent}%)
                </span>
                <span className="text-[15px] text-[#2A4E36] opacity-70">{formatPrice(surcharge)}</span>
              </div>
            )}
            {/* Points line */}
            {payMethod === 'points' && (
              <div className="flex items-baseline justify-between mb-[6px]">
                <span className="text-[11px] uppercase tracking-[.22em] text-[#2A4E36] opacity-55">
                  Puntos a usar
                </span>
                <span className="text-[15px] text-[#2A4E36] opacity-70">{pointsNeeded} pts</span>
              </div>
            )}
            {/* Total */}
            <div className="flex items-baseline justify-between">
              <span className="text-[11px] uppercase tracking-[.22em] text-[#2A4E36] opacity-55">
                Total
              </span>
              <span className="font-heading text-[34px] text-[#2A4E36]">
                {payMethod === 'points' ? formatPrice(subtotal) : formatPrice(displayTotal)}
              </span>
            </div>
          </div>
        </div>

        {/* ── Sticky CTA ──────────────────────────────────────────────────────── */}
        <div
          className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-4 pb-6 pt-8"
          style={{ background: 'linear-gradient(to top, #F6F0E4 58%, rgba(246,240,228,0))' }}
        >
          <button
            className="pointer-events-auto flex w-full max-w-md items-center justify-between rounded-full bg-[#2A4E36] px-3 pl-[26px] text-[#F6EFE1] shadow-[0_22px_40px_-22px_rgba(42,78,54,.9),inset_0_1px_0_rgba(255,255,255,.12)] transition-transform active:scale-[.98] disabled:opacity-60"
            style={{ height: '58px' }}
            onClick={submit}
            disabled={loading}
          >
            <span className="text-[13px] uppercase tracking-[.16em]">
              {loading ? 'Procesando...' : 'Confirmar pedido'}
            </span>
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[rgba(246,239,225,.14)]">
              <svg
                viewBox="0 0 24 24"
                className="h-[18px] w-[18px] text-[#F6EFE1]"
                stroke="currentColor"
                strokeWidth="1.5"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </span>
          </button>
        </div>
      </ClientLayout>
    </AuthGuard>
  );
}

// ── PayOption sub-component ───────────────────────────────────────────────────

function PayOption({
  selected,
  onSelect,
  icon,
  title,
  sub,
}: {
  selected: boolean;
  onSelect: () => void;
  icon: React.ReactNode;
  title: string;
  sub: string;
}) {
  return (
    <button
      onClick={onSelect}
      className={[
        'mb-[10px] flex w-full items-center gap-[13px] rounded-[17px] border px-[15px] py-[14px] text-left transition-all',
        selected
          ? 'border-[rgba(42,78,54,.24)] bg-[#FBF5EA] shadow-[0_16px_30px_-24px_rgba(42,78,54,.5),inset_0_1px_0_rgba(255,255,255,.5)]'
          : 'border-[rgba(22,38,26,.10)] bg-[rgba(255,255,255,.4)]',
      ].join(' ')}
    >
      {/* icon bubble */}
      <div className="flex h-[38px] w-[38px] flex-shrink-0 items-center justify-center rounded-[12px] bg-[rgba(42,78,54,.07)] text-[#2A4E36]">
        {icon}
      </div>
      {/* text */}
      <div className="flex-1 min-w-0">
        <div className="text-[14.5px] text-[#2A4E36]">{title}</div>
        <div className="mt-[1px] text-[11.5px] italic text-[#2A4E36] opacity-52">{sub}</div>
      </div>
      {/* radio */}
      <div
        className={[
          'flex-shrink-0 h-[19px] w-[19px] rounded-full border-[1.5px] transition-all',
          selected
            ? 'border-[#2A4E36]'
            : 'border-[rgba(22,38,26,.15)]',
        ].join(' ')}
        style={
          selected
            ? { background: 'radial-gradient(circle, #2A4E36 40%, transparent 44%)' }
            : undefined
        }
      />
    </button>
  );
}

// ── PickupChip sub-component ──────────────────────────────────────────────────

function PickupChip({
  selected,
  onSelect,
  title,
  sub,
  flex = false,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  sub: string;
  flex?: boolean;
}) {
  return (
    <button
      onClick={onSelect}
      className={[
        'rounded-[20px] border p-1 transition-all text-left',
        flex ? 'flex-1' : 'w-full',
        selected
          ? 'border-[rgba(22,38,26,.14)] bg-[rgba(42,78,54,.06)]'
          : 'border-transparent',
      ].join(' ')}
    >
      <div
        className={[
          'h-full rounded-[16px] border px-[14px] py-[13px] text-left transition-all',
          selected
            ? 'border-[rgba(42,78,54,.24)] bg-[#FBF5EA] shadow-[inset_0_1px_0_rgba(255,255,255,.5)]'
            : 'border-[rgba(22,38,26,.10)] bg-[rgba(255,255,255,.42)]',
        ].join(' ')}
      >
        <span className="font-heading block text-[17px] text-[#2A4E36]">{title}</span>
        <span className="mt-[3px] block text-[11px] italic text-[#2A4E36] opacity-55">
          {sub}
        </span>
      </div>
    </button>
  );
}
