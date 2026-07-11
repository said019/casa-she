import { useEffect, useState } from 'react';
import { FileText } from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';

type ButtonVariant = 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
type ButtonSize = 'default' | 'sm' | 'lg' | 'icon';

async function getProofObjectUrl(orderId: string, proofId: string): Promise<string> {
  const response = await api.get(`/orders/${orderId}/proofs/${proofId}/content`, {
    responseType: 'blob',
  });
  return URL.createObjectURL(response.data as Blob);
}

/**
 * Fetches proof bytes through the authenticated first-party endpoint. The
 * browser only receives a short-lived blob URL, never the underlying Drive
 * link or a third-party file URL.
 */
export function PaymentProofImage({
  orderId,
  proofId,
  alt,
  className,
  onPreview,
}: {
  orderId: string;
  proofId: string;
  alt: string;
  className?: string;
  onPreview?: (objectUrl: string) => void;
}) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let url: string | null = null;

    void getProofObjectUrl(orderId, proofId)
      .then((nextUrl) => {
        if (cancelled) {
          URL.revokeObjectURL(nextUrl);
          return;
        }
        url = nextUrl;
        setObjectUrl(nextUrl);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [orderId, proofId]);

  if (failed) {
    return <p className="mt-3 text-xs text-destructive">No se pudo cargar el comprobante.</p>;
  }
  if (!objectUrl) {
    return <p className="mt-3 text-xs text-muted-foreground">Cargando comprobante…</p>;
  }

  return (
    <img
      src={objectUrl}
      alt={alt}
      className={className}
      onClick={() => onPreview?.(objectUrl)}
    />
  );
}

export function PaymentProofOpenButton({
  orderId,
  proofId,
  label = 'Ver comprobante',
  variant = 'outline',
  size = 'default',
  className,
}: {
  orderId: string;
  proofId: string;
  label?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}) {
  const [opening, setOpening] = useState(false);

  const openProof = async () => {
    // Open synchronously to keep browsers from blocking the PDF tab. It is
    // populated exclusively with a same-origin blob URL once authenticated
    // bytes return from the API.
    const popup = window.open('', '_blank');
    if (popup) popup.opener = null;
    setOpening(true);
    try {
      const objectUrl = await getProofObjectUrl(orderId, proofId);
      if (popup) {
        popup.location.replace(objectUrl);
      } else {
        const link = document.createElement('a');
        link.href = objectUrl;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        document.body.appendChild(link);
        link.click();
        link.remove();
      }

      const release = () => URL.revokeObjectURL(objectUrl);
      window.setTimeout(release, 5 * 60 * 1000);
      popup?.addEventListener('beforeunload', release, { once: true });
    } catch {
      popup?.close();
    } finally {
      setOpening(false);
    }
  };

  return (
    <Button type="button" variant={variant} size={size} onClick={openProof} disabled={opening} className={className}>
      <FileText className="h-4 w-4 mr-2" />
      {opening ? 'Abriendo…' : label}
    </Button>
  );
}
