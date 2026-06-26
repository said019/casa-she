import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CalendarClock, Loader2 } from 'lucide-react';

import api, { getErrorMessage } from '@/lib/api';
import { formatDbDate } from '@/lib/date';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';

/**
 * Diálogo compartido para EDITAR LA VIGENCIA (inicio / vencimiento) de una
 * membresía YA asignada. Disponible para admin + TODA la recepción (el endpoint
 * PATCH /memberships/:id/dates permite admin/super_admin/reception), así que el
 * botón NO se esconde por elevación.
 *
 * Llama PATCH /memberships/:id/dates con { startDate?, endDate?, reason? }.
 * El backend reactiva una membresía vencida si el nuevo vencimiento llega a hoy
 * o después, y la vence si quedó en el pasado.
 *
 * El componente trae su propio botón disparador y maneja su estado de apertura.
 * El host pasa `onSuccess` para invalidar/refrescar las queries pertinentes.
 */

interface EditValidityMembership {
    id: string;
    start_date?: string | null;
    end_date?: string | null;
    plan_name?: string | null;
}

interface EditValidityDialogProps {
    membership: EditValidityMembership;
    /** Se invoca tras un PATCH exitoso para invalidar/refrescar las queries del host. */
    onSuccess: () => void;
    /** Texto del botón disparador (default: "Vigencia"). */
    triggerLabel?: string;
    /** Variante del botón disparador (default: "outline"). */
    triggerVariant?: 'outline' | 'ghost' | 'secondary' | 'default';
    /** Tamaño del botón disparador (default: "sm"). */
    triggerSize?: 'sm' | 'default' | 'icon';
    /** Clase extra para el botón disparador. */
    triggerClassName?: string;
}

/** Normaliza una fecha de la BD (Date | 'YYYY-MM-DD' | ISO) a 'YYYY-MM-DD' para <input type="date">. */
function toInputDate(value: string | null | undefined): string {
    if (!value) return '';
    const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return match ? `${match[1]}-${match[2]}-${match[3]}` : '';
}

export function EditValidityDialog({
    membership,
    onSuccess,
    triggerLabel = 'Vigencia',
    triggerVariant = 'outline',
    triggerSize = 'sm',
    triggerClassName,
}: EditValidityDialogProps) {
    const [open, setOpen] = useState(false);
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [reason, setReason] = useState('');

    // Precargar las fechas actuales cada vez que se abre el diálogo (o cambia la membresía).
    useEffect(() => {
        if (open) {
            setStartDate(toInputDate(membership.start_date));
            setEndDate(toInputDate(membership.end_date));
            setReason('');
        }
    }, [open, membership.start_date, membership.end_date]);

    const datesInvalid = Boolean(startDate && endDate && endDate < startDate);
    // El backend exige al menos una de las dos fechas.
    const noDates = !startDate && !endDate;

    const save = useMutation({
        mutationFn: async () => {
            const payload: Record<string, string> = {};
            if (startDate) payload.startDate = startDate;
            if (endDate) payload.endDate = endDate;
            if (reason.trim()) payload.reason = reason.trim();
            return api.patch(`/memberships/${membership.id}/dates`, payload);
        },
        onSuccess: () => {
            toast.success('Vigencia actualizada');
            setOpen(false);
            onSuccess();
        },
        onError: (e) => toast.error(getErrorMessage(e)),
    });

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant={triggerVariant} size={triggerSize} className={triggerClassName}>
                    <CalendarClock className="h-4 w-4 mr-2" />
                    {triggerLabel}
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Editar vigencia</DialogTitle>
                    <DialogDescription>
                        {membership.plan_name
                            ? `${membership.plan_name} · vigencia actual: ${formatDbDate(membership.start_date)} – ${formatDbDate(membership.end_date)}`
                            : `Vigencia actual: ${formatDbDate(membership.start_date)} – ${formatDbDate(membership.end_date)}`}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <Label htmlFor="ev-start">Inicio</Label>
                            <Input
                                id="ev-start"
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                            />
                        </div>
                        <div className="space-y-1">
                            <Label htmlFor="ev-end">Vence</Label>
                            <Input
                                id="ev-end"
                                type="date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                            />
                        </div>
                    </div>

                    {datesInvalid && (
                        <p className="text-xs text-destructive">
                            El vencimiento no puede ser anterior al inicio.
                        </p>
                    )}

                    <div className="space-y-1">
                        <Label htmlFor="ev-reason">Motivo (opcional)</Label>
                        <Textarea
                            id="ev-reason"
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder="Ej. Extensión por clases suspendidas"
                            rows={2}
                        />
                        <p className="text-xs text-muted-foreground">
                            Si el vencimiento llega a hoy o después, una membresía vencida se reactiva.
                        </p>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => setOpen(false)}>
                        Cancelar
                    </Button>
                    <Button
                        onClick={() => save.mutate()}
                        disabled={save.isPending || datesInvalid || noDates}
                    >
                        {save.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                        Guardar
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
