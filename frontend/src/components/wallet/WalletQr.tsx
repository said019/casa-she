import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { QRCodeCanvas } from 'qrcode.react';
import { CasaSheMark } from '@/components/CasaSheLogo';
import { Skeleton } from '@/components/ui/skeleton';
import api, { getErrorMessage } from '@/lib/api';

export interface WalletPassResponse {
  memberName: string;
  memberSince: string | null;
  isFounder: boolean;
  planName: string | null;
  membershipStatus: string | null;
  membershipId: string | null;
  expirationDate: string | null;
  classesRemaining: number | null;
  pointsBalance: number;
  qrPayload: string;
  canDownloadPass: boolean;
  applePassAvailable: boolean;
  walletPasses: Array<{ platform: string; serial_number: string }>;
}

const STATUS_LABELS: Record<string, string> = {
  active: 'Activa',
  pending_activation: 'Por activar',
  pending_payment: 'Pago pendiente',
  paused: 'Pausada',
  expired: 'Vencida',
};

function formatPassDate(value: string | null): string {
  if (!value) return 'Sin vigencia';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Sin vigencia';
  return new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
    .format(parsed)
    .replace('.', '');
}

function AppleLogo() {
  return (
    <svg width="18" height="22" viewBox="0 0 20 24" fill="currentColor" aria-hidden="true">
      <path d="M16.65 12.57c-.02-2.55 2.08-3.78 2.18-3.84-1.19-1.74-3.03-1.98-3.69-2.01-1.57-.16-3.07.93-3.87.93-.8 0-2.04-.91-3.35-.88-1.72.03-3.32 1.01-4.2 2.55-1.8 3.12-.46 7.74 1.29 10.27.86 1.24 1.88 2.63 3.22 2.58 1.3-.05 1.79-.84 3.36-.84 1.57 0 2.01.84 3.38.81 1.39-.02 2.27-1.26 3.12-2.51.99-1.44 1.39-2.84 1.41-2.91-.03-.01-2.69-1.03-2.85-4.15zM14.07 4.49c.71-.87 1.19-2.07 1.06-3.27-1.02.04-2.27.68-3 1.53-.66.76-1.24 1.99-1.08 3.16 1.13.09 2.29-.57 3.02-1.42z" />
    </svg>
  );
}

function GoogleWalletLogo() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

/** Credencial visual y QR que recepción escanea en /app/reception/scan. */
export function WalletQr() {
  const [appleLoading, setAppleLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const { data, isLoading, error, refetch } = useQuery<WalletPassResponse>({
    queryKey: ['wallet-pass'],
    queryFn: async () => (await api.get('/wallet/pass')).data,
  });

  const handleAppleWallet = async () => {
    setAppleLoading(true);
    setActionError(null);
    try {
      const response = await api.post('/wallet/pass/apple');
      window.location.assign(response.data.downloadUrl);
    } catch (requestError) {
      setActionError(getErrorMessage(requestError));
    } finally {
      setAppleLoading(false);
    }
  };

  const handleGoogleWallet = async () => {
    setGoogleLoading(true);
    setActionError(null);
    try {
      const response = await api.post('/wallet/pass/google');
      window.open(response.data.saveUrl, '_blank', 'noopener,noreferrer');
    } catch (requestError) {
      setActionError(getErrorMessage(requestError));
    } finally {
      setGoogleLoading(false);
    }
  };

  if (isLoading) {
    return (
      <section aria-label="Cargando pase digital" className="overflow-hidden rounded-[2rem] border border-balance-sand/60 bg-balance-cream/55 p-4 sm:p-6">
        <Skeleton className="h-[340px] w-full rounded-[1.6rem] bg-balance-sand/35" />
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Skeleton className="h-[52px] rounded-[0.9rem] bg-balance-sand/35" />
          <Skeleton className="h-[52px] rounded-[0.9rem] bg-balance-sand/35" />
        </div>
      </section>
    );
  }

  if (error || !data?.qrPayload) {
    return (
      <section className="rounded-[2rem] border border-balance-gold/30 bg-balance-cream/70 px-6 py-10 text-center">
        <p className="text-base font-semibold text-balance-dark">No pudimos cargar tu pase digital.</p>
        <p className="mt-1 text-sm text-balance-dark/60">Tu información está segura. Intenta nuevamente.</p>
        <button
          type="button"
          onClick={() => refetch()}
          className="mt-5 rounded-full bg-balance-olive px-5 py-2.5 text-sm font-semibold text-balance-cream transition-transform active:scale-[0.98]"
        >
          Reintentar
        </button>
      </section>
    );
  }

  const credits = data.classesRemaining === null || data.classesRemaining === -1
    ? 'Ilimitadas'
    : String(data.classesRemaining);
  const status = data.membershipStatus ? STATUS_LABELS[data.membershipStatus] ?? data.membershipStatus : 'Identificación';

  return (
    <section aria-labelledby="digital-pass-title" className="overflow-hidden rounded-[2rem] border border-balance-sand/65 bg-balance-cream/70 shadow-[0_24px_70px_-52px_rgba(49,55,42,0.8)]">
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_250px]">
        <div className="relative isolate min-h-[320px] overflow-hidden bg-[#344734] px-6 py-7 text-[#F6F1E5] sm:px-8 sm:py-8">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(110%_90%_at_5%_0%,rgba(218,196,148,0.25),transparent_56%)]" />
          <div className="pointer-events-none absolute -bottom-36 -right-24 h-80 w-80 rounded-full border border-[#F6F1E5]/10" />
          <div className="pointer-events-none absolute -bottom-24 -right-12 h-56 w-56 rounded-full border border-[#F6F1E5]/10" />
          <CasaSheMark
            aria-hidden="true"
            tone="cream"
            className="pointer-events-none absolute -right-8 -top-10 h-52 w-52 opacity-[0.06]"
          />

          <div className="relative flex h-full flex-col">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[#F6F1E5]/58">Casa Shé</p>
                <h2 id="digital-pass-title" className="mt-1 text-xl font-semibold tracking-[-0.025em]">Pase de miembro</h2>
              </div>
              <span className="rounded-full border border-[#F6F1E5]/20 bg-[#F6F1E5]/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#F6F1E5]/85">
                {status}
              </span>
            </div>

            <div className="mt-12 sm:mt-14">
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#F6F1E5]/48">Miembro</p>
              <p className="mt-1 max-w-[20ch] text-3xl font-semibold leading-none tracking-[-0.045em] sm:text-[2.2rem]">
                {data.memberName}
              </p>
              <p className="mt-3 text-sm font-medium text-[#E1CCA0]">{data.planName ?? 'Pase de recepción'}</p>
            </div>

            <dl className="mt-auto grid grid-cols-3 gap-3 border-t border-[#F6F1E5]/14 pt-5">
              <div>
                <dt className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[#F6F1E5]/46">Créditos</dt>
                <dd className="mt-1 text-base font-semibold tabular-nums">{credits}</dd>
              </div>
              <div>
                <dt className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[#F6F1E5]/46">Puntos</dt>
                <dd className="mt-1 text-base font-semibold tabular-nums">{data.pointsBalance}</dd>
              </div>
              <div>
                <dt className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[#F6F1E5]/46">Vigencia</dt>
                <dd className="mt-1 text-sm font-semibold leading-tight">{formatPassDate(data.expirationDate)}</dd>
              </div>
            </dl>
          </div>
        </div>

        <div className="flex flex-col items-center justify-center bg-[#EFE7D7] p-6 lg:border-l lg:border-balance-sand/55">
          <div className="rounded-[1.35rem] border border-balance-sand/55 bg-white p-3 shadow-[0_16px_32px_-24px_rgba(49,55,42,0.55)]">
            <QRCodeCanvas
              value={data.qrPayload}
              size={176}
              level="M"
              marginSize={1}
              bgColor="#FFFFFF"
              fgColor="#273728"
              className="h-auto w-full max-w-[176px]"
            />
          </div>
          <p className="mt-4 text-center text-xs font-semibold uppercase tracking-[0.17em] text-balance-dark/68">QR de recepción</p>
          <p className="mt-1 max-w-[22ch] text-center text-xs leading-relaxed text-balance-dark/52">Muéstralo al llegar para identificarte.</p>
        </div>
      </div>

      {data.canDownloadPass && (
        <div className="border-t border-balance-sand/55 px-5 py-5 sm:px-6">
          <div className="mb-3 flex items-end justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-balance-dark">Llévalo en tu teléfono</p>
              <p className="mt-0.5 text-xs text-balance-dark/55">Tu QR y membresía siempre a la mano.</p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={handleAppleWallet}
              disabled={appleLoading || !data.applePassAvailable}
              aria-describedby={!data.applePassAvailable ? 'apple-wallet-unavailable' : undefined}
              className="flex h-[52px] items-center justify-center gap-2.5 rounded-[0.9rem] bg-[#1F211E] px-5 text-white transition-[transform,opacity] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45"
            >
              {appleLoading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/25 border-t-white" /> : <AppleLogo />}
              <span className="text-left leading-none">
                <span className="block text-[9px] tracking-wide text-white/65">Agregar a</span>
                <span className="mt-1 block text-sm font-semibold">Apple Wallet</span>
              </span>
            </button>
            <button
              type="button"
              onClick={handleGoogleWallet}
              disabled={googleLoading}
              className="flex h-[52px] items-center justify-center gap-2.5 rounded-[0.9rem] border border-balance-sand/75 bg-white px-5 text-[#3C4043] transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45"
            >
              {googleLoading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#3C4043]/20 border-t-[#3C4043]" /> : <GoogleWalletLogo />}
              <span className="text-left leading-none">
                <span className="block text-[9px] tracking-wide text-[#5F6368]">Guardar en</span>
                <span className="mt-1 block text-sm font-semibold">Google Wallet</span>
              </span>
            </button>
          </div>
          {!data.applePassAvailable && (
            <p id="apple-wallet-unavailable" className="mt-3 text-xs leading-relaxed text-balance-dark/55">
              Apple Wallet estará disponible cuando termine la configuración de firma del pase. Tu QR de recepción ya funciona.
            </p>
          )}
          {actionError && (
            <div role="alert" className="mt-3 rounded-xl border border-[#AD6C20]/25 bg-[#AD6C20]/[0.08] px-4 py-3 text-xs leading-relaxed text-[#674518]">
              {actionError}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
