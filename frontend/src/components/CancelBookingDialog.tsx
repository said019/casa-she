import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  Loader2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  ShieldAlert,
} from 'lucide-react';

interface CancelPreview {
  willRefund: boolean;
  hoursUntilClass: number;
  cancellationsUsed: number;
  cancellationLimit: number;
  isWithinWindow: boolean;
  reason: string;
}

interface CancelBookingDialogProps {
  bookingId: string;
  onConfirm: () => void;
  isPending: boolean;
  /** Render prop for trigger button */
  trigger?: React.ReactNode;
}

export function CancelBookingDialog({
  bookingId,
  onConfirm,
  isPending,
  trigger,
}: CancelBookingDialogProps) {
  const [open, setOpen] = useState(false);

  const { data: preview, isLoading: previewLoading } = useQuery<CancelPreview>({
    queryKey: ['cancel-preview', bookingId],
    queryFn: async () => (await api.get(`/bookings/${bookingId}/cancel-preview`)).data,
    enabled: open,
    staleTime: 0,
  });

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        {trigger || (
          <Button
            variant="outline"
            size="sm"
            className="text-destructive hover:text-destructive"
          >
            Cancelar
          </Button>
        )}
      </AlertDialogTrigger>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-lg">
            <ShieldAlert className="h-5 w-5 text-amber-500" />
            ¿Cancelar esta reserva?
          </AlertDialogTitle>
        </AlertDialogHeader>

        {previewLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : preview ? (
          <div className="space-y-4">
            {/* Time until class */}
            <div className="flex items-start gap-3 rounded-lg bg-muted/50 p-3">
              <Clock className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
              <div className="text-sm">
                <span className="font-medium">Tiempo para la clase:</span>{' '}
                {preview.hoursUntilClass > 0 ? (
                  <span className="font-semibold">
                    {preview.hoursUntilClass >= 1
                      ? `${Math.floor(preview.hoursUntilClass)}h ${Math.round((preview.hoursUntilClass % 1) * 60)}min`
                      : `${Math.round(preview.hoursUntilClass * 60)} minutos`}
                  </span>
                ) : (
                  <span className="font-semibold text-destructive">
                    La clase ya inició
                  </span>
                )}
              </div>
            </div>

            {/* Cancellations used */}
            {preview.cancellationLimit > 0 && (
              <div className="flex items-start gap-3 rounded-lg bg-muted/50 p-3">
                <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
                <div className="text-sm">
                  <span className="font-medium">Cancelaciones usadas:</span>{' '}
                  <span className="font-semibold">
                    {preview.cancellationsUsed} de {preview.cancellationLimit}
                  </span>
                  {preview.cancellationsUsed >= preview.cancellationLimit && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Ya usaste todas tus cancelaciones con reembolso de este plan.
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Refund verdict */}
            <div
              className={`flex items-start gap-3 rounded-lg p-3 border ${
                preview.willRefund
                  ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-800'
                  : 'bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-800'
              }`}
            >
              {preview.willRefund ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-600 mt-0.5 shrink-0" />
              ) : (
                <XCircle className="h-5 w-5 text-red-500 mt-0.5 shrink-0" />
              )}
              <div className="text-sm">
                <p className="font-semibold">
                  {preview.willRefund
                    ? '✓ Se te devolverá tu crédito'
                    : '✗ No se devolverá tu crédito'}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {preview.reason}
                </p>
              </div>
            </div>

            {/* Policy summary */}
            <div className="rounded-lg bg-muted/30 p-3 text-[11px] text-muted-foreground leading-relaxed">
              <p className="font-medium text-xs mb-1">Política de cancelación:</p>
              <ul className="list-disc list-inside space-y-0.5">
                <li>Cancelar con <strong>+12 horas</strong> de anticipación = reembolso de crédito</li>
                <li>Cancelar con <strong>menos de 12 horas</strong> = sin reembolso</li>
                <li>No asistir a clase descuenta el crédito reservado</li>
              </ul>
            </div>
          </div>
        ) : null}

        <AlertDialogFooter className="mt-2">
          <AlertDialogCancel>Volver</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-destructive hover:bg-destructive/90"
            disabled={isPending || previewLoading}
          >
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Sí, cancelar reserva
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
