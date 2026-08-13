import { Banknote } from 'lucide-react';

import { Badge } from '@/components/ui/badge';

export function StudioPaymentBadge({ paymentMethod }: { paymentMethod?: string | null }) {
  if (paymentMethod !== 'cash') return null;

  return (
    <Badge
      variant="outline"
      className="h-5 shrink-0 gap-1 border-amber-300 bg-amber-50 px-1.5 text-[10px] font-semibold text-amber-800"
      title="La membresía se pagó en efectivo en el estudio"
    >
      <Banknote className="h-3 w-3" />
      Pago en estudio
    </Badge>
  );
}
