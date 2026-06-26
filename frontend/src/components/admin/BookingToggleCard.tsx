import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Loader2, CalendarCheck, CalendarX } from 'lucide-react';
import api, { getErrorMessage } from '@/lib/api';
import { toast } from 'sonner';
import { useIsElevated } from '@/hooks/useIsElevated';

/**
 * Interruptor global de reservas de clientas. Lo prenden/apagan admin + recepción
 * MASTER. Es auto-gateado: si el usuario no es elevado, no renderiza nada, así que
 * puede colocarse en cualquier dashboard sin riesgo.
 */
export function BookingToggleCard() {
    const isElevated = useIsElevated();
    const qc = useQueryClient();

    const { data, isLoading } = useQuery<{ enabled: boolean }>({
        queryKey: ['booking-enabled'],
        queryFn: async () => (await api.get('/settings/booking-enabled')).data,
        enabled: isElevated,
    });
    const enabled = data?.enabled ?? true;

    const toggle = useMutation({
        mutationFn: async (next: boolean) => api.put('/settings/booking-enabled', { enabled: next }),
        onSuccess: (_d, next) => {
            qc.setQueryData(['booking-enabled'], { enabled: next });
            qc.invalidateQueries({ queryKey: ['booking-enabled'] });
            toast.success(next
                ? 'Reservas activadas — los usuarios ya pueden agendar'
                : 'Reservas pausadas — los usuarios no pueden agendar');
        },
        onError: (e) => toast.error(getErrorMessage(e)),
    });

    if (!isElevated) return null;

    return (
        <Card className={enabled ? '' : 'border-rose-300 bg-rose-50/60'}>
            <CardContent className="flex items-center justify-between gap-4 py-4">
                <div className="flex items-center gap-3 min-w-0">
                    {enabled
                        ? <CalendarCheck className="h-5 w-5 shrink-0 text-emerald-600" />
                        : <CalendarX className="h-5 w-5 shrink-0 text-rose-600" />}
                    <div className="min-w-0">
                        <p className="text-sm font-semibold">Reservas de usuarios</p>
                        <p className="text-xs text-muted-foreground">
                            {isLoading
                                ? 'Cargando…'
                                : enabled
                                    ? 'Activadas: los usuarios pueden agendar desde la app.'
                                    : 'Pausadas: los usuarios NO pueden agendar (recepción sí puede).'}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    {toggle.isPending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                    <Switch
                        checked={enabled}
                        onCheckedChange={(v) => toggle.mutate(v)}
                        disabled={isLoading || toggle.isPending}
                    />
                </div>
            </CardContent>
        </Card>
    );
}
