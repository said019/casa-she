import { useQuery } from '@tanstack/react-query';
import { QRCodeCanvas } from 'qrcode.react';
import api from '@/lib/api';

interface WalletPassResponse {
  qrPayload?: string;
  pointsBalance?: number;
  membershipId?: string | null;
}

/**
 * Muestra el QR firmado del cliente (qrPayload de GET /wallet/pass) que
 * el staff escaneará en /app/reception/scan. Cubre a todos los clientes
 * (con o sin membresía), a diferencia de los passes nativos Apple/Google.
 */
export function WalletQr() {
  const { data, isLoading, error, refetch } = useQuery<WalletPassResponse>({
    queryKey: ['wallet-pass-qr'],
    queryFn: async () => (await api.get('/wallet/pass')).data,
    staleTime: 1000 * 60 * 60, // 1h; el QR vence a 24h
  });

  if (isLoading) {
    return <div className="wallet-qr-loading">Cargando QR…</div>;
  }

  if (error || !data?.qrPayload) {
    return (
      <div className="wallet-qr-error">
        <p>No se pudo cargar el QR.</p>
        <button onClick={() => refetch()}>Reintentar</button>
      </div>
    );
  }

  return (
    <div className="wallet-qr">
      <h3>Mi QR de recepción</h3>
      <p className="wallet-qr-hint">Muéstralo en recepción para identificarte.</p>
      <QRCodeCanvas value={data.qrPayload} size={220} level="M" marginSize={4} />
    </div>
  );
}