import { useEffect, useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Loader2, Check, AlertTriangle } from 'lucide-react';
import api, { getErrorMessage } from '@/lib/api';
import { toast } from 'sonner';

interface CancelPreview {
    canCancel: boolean;
    willRefund: boolean;
    hoursUntilClass: number | null;
    minHours: number | null;
    cancellationsUsed: number;
    cancellationLimit: number;
    reason?: string;
    code?: string;
}

interface Props {
    bookingId: string | null;
    open: boolean;
    onClose: () => void;
    onCancelled: () => void;
    /** "Quitar forzado" del staff: quita aunque la clase ya pasó o tenga asistencia (sin ventana). */
    force?: boolean;
}

/**
 * Diálogo de cancelar reserva (estilo Fitune): muestra la ventana de "cancelación
 * gratuita" calculada en el servidor con hora CDMX, un switch para decidir si se
 * devuelve el crédito al cliente, y avisa que se le notificará por correo.
 * Solo lo usa staff (admin/recepción), que puede cancelar fuera de ventana.
 */
export function CancelBookingDialog({ bookingId, open, onClose, onCancelled, force = false }: Props) {
    const [refund, setRefund] = useState(true);

    const { data: preview, isLoading } = useQuery<CancelPreview>({
        queryKey: ['cancel-preview', bookingId],
        queryFn: async () => (await api.get(`/bookings/${bookingId}/cancel-preview`)).data,
        // En modo forzado no hay "ventana": el preview no aplica (y daría no-cancelable).
        enabled: open && !!bookingId && !force,
    });

    const minHours = preview?.minHours ?? 12;
    const withinWindow = !!preview && preview.hoursUntilClass != null && preview.hoursUntilClass >= minHours;

    // Default del switch: dentro de la ventana gratuita → devolver; cancelación tardía → no.
    // (El staff puede cambiarlo libremente.)
    useEffect(() => {
        if (force) { setRefund(true); return; } // quitar forzado: por defecto devolver el crédito
        if (preview) setRefund(withinWindow);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [force, preview?.hoursUntilClass, preview?.minHours]);

    const cancelM = useMutation({
        mutationFn: async () => api.post(`/bookings/${bookingId}/cancel`, { refundCredit: refund, ...(force ? { force: true } : {}) }),
        onSuccess: () => {
            toast.success(refund ? 'Reserva cancelada — crédito devuelto' : 'Reserva cancelada — sin devolución');
            onCancelled();
            onClose();
        },
        onError: (e) => toast.error(getErrorMessage(e)),
    });

    return (
        <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
            <DialogContent className="sm:max-w-[440px]">
                <DialogHeader>
                    <DialogTitle>{force ? 'Quitar de la clase' : 'Cancelar reserva'}</DialogTitle>
                </DialogHeader>

                {isLoading ? (
                    <div className="flex justify-center py-8">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                ) : (
                    <div className="space-y-5 py-2">
                        {force ? (
                            <p className="text-sm text-muted-foreground">
                                Se quitará a la alumna de esta clase. Funciona aunque la clase ya haya pasado o ya tenga asistencia tomada.
                            </p>
                        ) : (
                        <div>
                            <p className="text-sm font-semibold">Cancelación gratuita</p>
                            <p className="mt-1.5 flex items-center gap-2 text-sm text-muted-foreground">
                                <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded ${withinWindow ? 'bg-emerald-100 text-emerald-600' : 'bg-muted text-muted-foreground/50'}`}>
                                    <Check className="h-3.5 w-3.5" />
                                </span>
                                {minHours} horas antes del inicio de la reserva
                            </p>
                            {preview?.hoursUntilClass != null && (
                                <p className="mt-1.5 text-xs text-muted-foreground">
                                    {withinWindow
                                        ? `Faltan ~${preview.hoursUntilClass}h para la clase: dentro de la ventana gratuita.`
                                        : `Faltan ~${preview.hoursUntilClass}h para la clase: fuera de la ventana (cancelación tardía).`}
                                </p>
                            )}
                        </div>
                        )}

                        <div className="flex items-center gap-3">
                            <Switch checked={refund} onCheckedChange={setRefund} disabled={cancelM.isPending} />
                            <span className="text-sm">Devolver el crédito al usuario</span>
                        </div>

                        <p className="flex items-start gap-2 text-sm text-amber-700">
                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                            El usuario será notificado por correo electrónico
                        </p>
                    </div>
                )}

                <DialogFooter className="gap-2 sm:gap-0">
                    <Button variant="ghost" onClick={onClose} disabled={cancelM.isPending}>
                        Regresar
                    </Button>
                    <Button
                        variant="destructive"
                        onClick={() => cancelM.mutate()}
                        disabled={cancelM.isPending || isLoading}
                    >
                        {cancelM.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : (force ? 'Quitar' : 'Cancelar reserva')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
