import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import api, { getErrorMessage } from '@/lib/api';
import type { Class } from '@/types/class';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';

interface DialogoCancelarClaseProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    clase: Class | null;
    /** Se canceló: el padre cierra el panel de la clase. */
    onCancelada: () => void;
}

/** "Cancelar clase": solo esta o toda la serie del horario. Movido sin cambios de ClassesCalendar. */
export function DialogoCancelarClase({ open, onOpenChange, clase, onCancelada }: DialogoCancelarClaseProps) {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const cancelMutation = useMutation({
        mutationFn: async ({ id, scope }: { id: string; scope: 'one' | 'series' }) =>
            api.delete(`/classes/${id}`, { data: { scope } }),
        onSuccess: (response) => {
            queryClient.invalidateQueries({ queryKey: ['classes'] });
            const data = response.data;
            const desc = data.cancelledClasses != null
                ? `${data.cancelledClasses} clases canceladas · ${data.cancelledBookings || 0} reservas · ${data.refundedCredits || 0} créditos reembolsados.`
                : `${data.cancelledBookings || 0} reservas canceladas, ${data.refundedCredits || 0} créditos reembolsados.`;
            toast({ title: 'Clase cancelada', description: desc });
            onCancelada();
            onOpenChange(false);
        },
        onError: (err) => toast({ variant: 'destructive', title: 'Error', description: getErrorMessage(err) }),
    });

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Cancelar clase</DialogTitle>
                    <DialogDescription>
                        Se cancelan las reservas y se reembolsan los créditos. Las clases canceladas dejan de verse para los usuarios.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-2">
                    <Button
                        variant="outline"
                        className="w-full justify-start"
                        disabled={cancelMutation.isPending}
                        onClick={() => clase && cancelMutation.mutate({ id: clase.id, scope: 'one' })}
                    >
                        Solo esta clase
                    </Button>
                    <Button
                        variant="destructive"
                        className="w-full justify-start"
                        disabled={cancelMutation.isPending}
                        onClick={() => clase && cancelMutation.mutate({ id: clase.id, scope: 'series' })}
                    >
                        {cancelMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Todas las de este horario (mismo día y hora, en adelante)
                    </Button>
                </div>
                <DialogFooter>
                    <Button variant="ghost" onClick={() => onOpenChange(false)}>Cerrar</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
