import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api, { getErrorMessage } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import SellPlanDialog from '@/components/memberships/SellPlanDialog';
import { AdjustCreditsDialog } from '@/components/clients/AdjustCreditsDialog';

export interface ClienteAgenda { id: string; display_name: string }
interface Membresia {
    id: string; user_id: string; plan_name: string; status: string;
    payment_date: string | null; start_date: string | null; end_date: string | null;
    reformer_remaining: number | null; multi_remaining: number | null;
}
export function ClienteMembresiasDialog({ cliente, open, onOpenChange, associatedMembershipId, classId, onBooked, notice }: {
    cliente: ClienteAgenda; open: boolean; onOpenChange: (v: boolean) => void;
    associatedMembershipId?: string; classId?: string; onBooked?: (userId: string) => void;
    notice?: string;
}) {
    const qc = useQueryClient();
    const [selectedId, setSelectedId] = useState('');
    const [selling, setSelling] = useState(false);
    const [start, setStart] = useState('');
    const [end, setEnd] = useState('');
    const [reason, setReason] = useState('');
    const [booked, setBooked] = useState(false);
    const { data = [], isLoading, isError, refetch } = useQuery<Membresia[]>({
        queryKey: ['memberships', cliente.id],
        queryFn: async () => (await api.get('/memberships', { params: { userId: cliente.id } })).data,
        enabled: open,
    });
    const selected = data.find(m => m.id === selectedId && m.user_id === cliente.id);
    useEffect(() => { setSelectedId(associatedMembershipId ?? ''); setBooked(false); }, [cliente.id, associatedMembershipId, open]);
    useEffect(() => { setStart(selected?.start_date?.slice(0, 10) ?? ''); setEnd(selected?.end_date?.slice(0, 10) ?? ''); setReason(''); }, [selected?.id, selected?.start_date, selected?.end_date]);
    const refresh = async () => {
        await Promise.all(['memberships', 'attendees', 'candidatas', 'classes', 'users', 'reception-clients', 'clients'].map(key => qc.invalidateQueries({ queryKey: [key] })));
    };
    const dates = useMutation({
        mutationFn: () => api.patch(`/memberships/${selected!.id}/dates`, { startDate: start, endDate: end, reason: reason.trim() }),
        onSuccess: refresh,
    });
    const booking = useMutation({
        mutationFn: () => api.post('/bookings/admin-book', { userId: cliente.id, classId, free: false }),
        onSuccess: async () => { setBooked(true); await refresh(); onBooked?.(cliente.id); },
    });
    return <>
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
                <DialogHeader><DialogTitle>Membresías de {cliente.display_name}</DialogTitle><DialogDescription>Consulta sus planes, fechas y créditos sin salir de la clase.</DialogDescription></DialogHeader>
                {notice && <p role="status">{notice}</p>}
                <Button onClick={() => setSelling(true)}>Asignar nuevo plan</Button>
                {isLoading && <p role="status">Cargando membresías…</p>}
                {isError && <div role="alert">No se pudieron cargar las membresías. <Button variant="outline" onClick={() => refetch()}>Reintentar</Button></div>}
                {!isLoading && !isError && data.length === 0 && <p>Sin membresías registradas.</p>}
                {data.length > 0 && <label className="space-y-2">Membresía a gestionar
                    <select aria-label="Membresía a gestionar" className="w-full rounded-md border bg-background p-2" value={selectedId} onChange={e => setSelectedId(e.target.value)}>
                        <option value="">Selecciona una membresía</option>
                        {data.map(m => <option key={m.id} value={m.id}>{m.plan_name} · {m.status} · {m.end_date?.slice(0, 10) ?? 'Sin vencimiento'}{m.id === associatedMembershipId ? ' · Asociada a esta reserva' : ''}</option>)}
                    </select>
                </label>}
                {selected && !selling && <div className="space-y-4 rounded-lg border p-3">
                    <p className="font-semibold">{selected.plan_name} · {selected.status}</p>
                    {selected.id === associatedMembershipId && <p className="text-sm">Asociada a esta reserva</p>}
                    <p className="text-sm">Fecha de pago: {selected.payment_date?.slice(0, 10) ?? 'Sin pago registrado'}</p>
                    <p className="text-sm">Salsa: {selected.reformer_remaining ?? 'Ilimitadas'} · Clases: {selected.multi_remaining ?? 'Ilimitadas'}</p>
                    <AdjustCreditsDialog key={selected.id} membership={selected} onDone={refresh} />
                    <div className="grid gap-3 sm:grid-cols-2">
                        <label>Inicio de vigencia<Input aria-label="Inicio de vigencia" type="date" value={start} onChange={e => setStart(e.target.value)} /></label>
                        <label>Fin de vigencia<Input aria-label="Fin de vigencia" type="date" min={start} value={end} onChange={e => setEnd(e.target.value)} /></label>
                    </div>
                    <label className="block">Motivo del cambio de fechas<Input aria-label="Motivo del cambio de fechas" value={reason} onChange={e => setReason(e.target.value)} /></label>
                    {dates.isError && <p role="alert">{getErrorMessage(dates.error)}</p>}
                    {dates.isSuccess && <p role="status">Fechas actualizadas.</p>}
                    <Button variant="outline" disabled={!start || !end || end < start || reason.trim().length < 5 || dates.isPending} onClick={() => dates.mutate()}>Guardar fechas</Button>
                </div>}
                {classId && <div className="space-y-2 border-t pt-3">
                    <p role="status">{booked ? 'Reserva confirmada' : 'Reserva pendiente'}</p>
                    {booking.isError && <p role="alert">El cliente sigue registrado. {getErrorMessage(booking.error)}</p>}
                    <Button disabled={booking.isPending || booked} onClick={() => booking.mutate()}>Reservar en esta clase</Button>
                </div>}
            </DialogContent>
        </Dialog>
        <SellPlanDialog calendarMode userId={cliente.id} userName={cliente.display_name} open={selling} onOpenChange={setSelling} onSold={refresh} />
    </>;
}
