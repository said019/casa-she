import { useIsElevated } from '@/hooks/useIsElevated';
import { PendingMembershipsPanel } from '@/components/memberships/PendingMembershipsPanel';
import { Card, CardContent } from '@/components/ui/card';
import { ShieldAlert } from 'lucide-react';

/**
 * Recepción master: aprobar/rechazar las membresías que los clientes pagan por
 * transferencia, revisando el comprobante. Solo recepción master (o admin); la
 * recepción normal no tiene acceso (el backend exige acceso elevado).
 */
export default function ReceptionApprovalsScreen() {
  const elevated = useIsElevated();

  if (!elevated) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center text-muted-foreground">
          <ShieldAlert className="h-8 w-8 text-warning" />
          <p>Solo la recepción master puede revisar y aprobar pagos.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <PendingMembershipsPanel
      title="Aprobaciones de pago"
      subtitle="Transferencias por revisar: abre el comprobante y aprueba o rechaza."
    />
  );
}
