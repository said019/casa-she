import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, addDays, subDays, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { ChevronLeft, ChevronRight, Plus, X, Calendar as CalendarIcon } from 'lucide-react';
import api, { getErrorMessage } from '@/lib/api';
import { studioTodayForInput } from '@/lib/date';
import { ChannelLogo } from '@/components/brands/ChannelLogo';
import type { Class } from '@/types/class';
import { RegisterFitpassAttendeeDialog } from './components/RegisterFitpassAttendeeDialog';

interface Attendee {
    booking_id: string;
    user_id: string;
    display_name: string;
    fitpass_member_ref: string | null;
    class_id: string;
    class_date: string;
    class_start_time: string;
    class_name: string;
    checkin_status: string | null;
}

/** Recepción: socias de Fitpass que llegan a clase con su identificación. */
export default function FitpassAttendees() {
    const [date, setDate] = useState(studioTodayForInput());
    const [openDialog, setOpenDialog] = useState<{ classId: string; className: string } | null>(null);
    const qc = useQueryClient();
    const { toast } = useToast();

    const { data: attendees, isLoading } = useQuery<Attendee[]>({
        queryKey: ['fitpass-attendees', date],
        queryFn: async () => (await api.get(`/partners/fitpass/attendees?date=${date}`)).data,
    });

    // Clases del día con lugares de Fitpass (channels[] trae max y reservados del canal).
    const { data: clases } = useQuery<Array<Class & { fp_max: number; fp_booked: number }>>({
        queryKey: ['classes-fitpass-dia', date],
        queryFn: async () => {
            const { data } = await api.get<Class[]>('/classes', { params: { start: date, end: date } });
            return data
                .map((c) => {
                    const fila = c.channels?.find((x) => x.channel === 'fitpass');
                    return { ...c, fp_max: Number(fila?.max ?? 0), fp_booked: Number(fila?.booked ?? 0) };
                })
                .filter((c) => c.fp_max > 0);
        },
    });

    const cancel = useMutation({
        mutationFn: async (bookingId: string) => {
            await api.delete(`/partners/fitpass/attendees/${bookingId}`, { data: { reason: 'Cancelado por recepción' } });
        },
        onSuccess: () => {
            toast({ title: 'Asistente cancelada' });
            qc.invalidateQueries({ queryKey: ['fitpass-attendees'] });
            qc.invalidateQueries({ queryKey: ['classes-fitpass-dia'] });
        },
        onError: (err) => toast({ variant: 'destructive', title: 'No se pudo cancelar', description: getErrorMessage(err) }),
    });

    return (
        <AuthGuard requiredRoles={['admin', 'super_admin', 'reception']}>
            <AdminLayout>
                <div className="container mx-auto space-y-6 py-6">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <h1 className="flex items-center gap-2 font-heading text-2xl font-bold text-casa-ciruela">
                                Asistentes <ChannelLogo canal="fitpass" alto={18} />
                            </h1>
                            <p className="text-sm text-muted-foreground">
                                Registra a las socias de Fitpass que llegan a clase con su identificación.{' '}
                                <Link to="/admin/bookings/fitpass-import" className="underline">Importar reservas a mano</Link>
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            <Button size="icon" variant="outline" onClick={() => setDate(format(subDays(parseISO(date), 1), 'yyyy-MM-dd'))} aria-label="Día anterior">
                                <ChevronLeft className="h-4 w-4" />
                            </Button>
                            <div className="flex items-center gap-2">
                                <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                                <Input type="date" aria-label="Fecha" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className="w-44" />
                            </div>
                            <Button size="icon" variant="outline" onClick={() => setDate(format(addDays(parseISO(date), 1), 'yyyy-MM-dd'))} aria-label="Día siguiente">
                                <ChevronRight className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>

                    <Card>
                        <CardHeader>
                            <CardTitle className="font-heading">Clases del día con lugares de Fitpass</CardTitle>
                            <CardDescription>{format(parseISO(date), "EEEE d 'de' MMMM", { locale: es })}</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            {(!clases || clases.length === 0) && (
                                <p className="text-sm text-muted-foreground">No hay clases con lugares de Fitpass para este día.</p>
                            )}
                            {(clases || []).map((c) => {
                                const full = c.fp_booked >= c.fp_max;
                                const nombre = `${c.class_type_name ?? 'Clase'} · ${c.start_time.slice(0, 5)}`;
                                return (
                                    <div key={c.id} className="flex items-center justify-between rounded-xl border border-casa-arena p-3">
                                        <div>
                                            <p className="font-medium">{c.class_type_name}</p>
                                            <p className="text-xs text-muted-foreground">
                                                {c.start_time.slice(0, 5)} · Fitpass {c.fp_booked}/{c.fp_max}
                                            </p>
                                        </div>
                                        <Button
                                            size="sm"
                                            disabled={full || c.status === 'cancelled'}
                                            aria-label={`Registrar asistente en ${nombre}`}
                                            onClick={() => setOpenDialog({ classId: c.id, className: nombre })}
                                        >
                                            <Plus className="mr-1 h-4 w-4" />
                                            {full ? 'Lleno' : 'Registrar asistente'}
                                        </Button>
                                    </div>
                                );
                            })}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="font-heading">Registradas</CardTitle>
                            <CardDescription>Asistentes de Fitpass del día con check-in confirmado.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}
                            {!isLoading && (!attendees || attendees.length === 0) && (
                                <p className="text-sm text-muted-foreground">Aún no hay asistentes de Fitpass registradas para este día.</p>
                            )}
                            <div className="space-y-2">
                                {(attendees || []).map((a) => (
                                    <div key={a.booking_id} className="flex items-center justify-between rounded-xl border border-casa-arena p-3">
                                        <div>
                                            <p className="font-medium">{a.display_name}</p>
                                            <p className="text-xs text-muted-foreground">
                                                {a.class_name} · {a.class_start_time.slice(0, 5)}
                                                {a.fitpass_member_ref && ` · ${a.fitpass_member_ref}`}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <ChannelLogo canal="fitpass" alto={10} />
                                            <Button size="sm" variant="ghost" onClick={() => cancel.mutate(a.booking_id)} aria-label={`Cancelar a ${a.display_name}`}>
                                                <X className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>

                    {openDialog && (
                        <RegisterFitpassAttendeeDialog
                            isOpen
                            onClose={() => setOpenDialog(null)}
                            classId={openDialog.classId}
                            className={openDialog.className}
                            onSuccess={() => setOpenDialog(null)}
                        />
                    )}
                </div>
            </AdminLayout>
        </AuthGuard>
    );
}
