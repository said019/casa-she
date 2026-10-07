import { useState, type Dispatch, type SetStateAction } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import {
    Loader2, Calendar as CalendarIcon, Plus, Minus, Users, Trash2, Check, Edit, Phone, MessageCircle, Clock, MapPin, Sparkles, X, RotateCcw, Lock, Unlock,
} from 'lucide-react';
import api, { getErrorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { Class } from '@/types/class';
import { useAuthStore } from '@/stores/authStore';
import { CompanionPanel } from '@/components/bookings/CompanionPanel';
import { CancelBookingDialog } from '@/components/bookings/CancelBookingDialog';
import { ClassIntensity } from '@/components/classes/ClassIntensity';
import SellPlanDialog from '@/components/memberships/SellPlanDialog';
import { ChannelLogo } from '@/components/brands/ChannelLogo';
import { PlanLabel } from '@/components/brands/PlanLabel';
import { CANALES, canalDePlan, esCanal } from '@/lib/canales';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useToast } from '@/components/ui/use-toast';
import type { Attendee } from './tipos';
import { attendeeBookedBy, getInitials, whatsAppDeAsistente } from './formato';

interface PanelClaseProps {
    clase: Class | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onEditar: () => void;
    onCancelar: () => void;
    /** Ajusta la clase seleccionada del padre (gratis, cupo cerrado, cupo TotalPass) sin esperar a recargar. */
    onClaseCambiada: Dispatch<SetStateAction<Class | null>>;
}

/** Panel lateral de una clase: datos, acciones, inscribir, cupo, inscritas y lista de espera. Movido sin cambios de ClassesCalendar. */
export function PanelClase({ clase, open, onOpenChange, onEditar, onCancelar, onClaseCambiada }: PanelClaseProps) {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const user = useAuthStore((s) => s.user);
    const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
    const [companionHost, setCompanionHost] = useState<Attendee | null>(null);
    const [attendeesTab, setAttendeesTab] = useState<'reservado' | 'espera' | 'cancelado'>('reservado');
    const [userSearch, setUserSearch] = useState('');
    const [searchActive, setSearchActive] = useState(false);
    // Invitada (gratis): reserva de cortesía sin plan ni consumo de crédito.
    const [guestFree, setGuestFree] = useState(false);
    // Cliente al que se le ofrece venderle un plan (cuando reservar falló por falta de plan).
    const [sellFor, setSellFor] = useState<{ id: string; name: string } | null>(null);
    const [sellOpen, setSellOpen] = useState(false);

    const { data: attendees, isLoading: attendeesLoading, refetch: refetchAttendees } = useQuery<Attendee[]>({
        queryKey: ['attendees', clase?.id],
        queryFn: async () => (await api.get(`/bookings/class/${clase?.id}?include_cancelled=true`)).data,
        enabled: !!clase?.id && open,
    });

    const { data: userSearchResults, isFetching: userSearchLoading } = useQuery<{ users: { id: string; display_name: string; email: string; photo_url: string | null }[] }>({
        queryKey: ['user-search', userSearch],
        queryFn: async () => (await api.get(`/users?search=${encodeURIComponent(userSearch)}&limit=8`)).data,
        enabled: searchActive && userSearch.trim().length >= 2,
    });

    const adminBookMutation = useMutation({
        mutationFn: async ({ classId, userId, free }: { classId: string; userId: string; userName?: string; free?: boolean }) =>
            api.post('/bookings/admin-book', { classId, userId, free: free ?? false }),
        onSuccess: () => {
            refetchAttendees();
            queryClient.invalidateQueries({ queryKey: ['classes'] });
            toast({ title: 'Usuario agregado a la clase' });
            setUserSearch('');
            setSearchActive(false);
            setSellFor(null);
            setGuestFree(false);
        },
        onError: (err, vars) => {
            const msg = getErrorMessage(err);
            // Si falló por falta de plan/créditos, ofrecemos venderle un plan ahí mismo.
            if (/membres|cr[eé]dito/i.test(msg)) {
                setSellFor({ id: vars.userId, name: vars.userName ?? '' });
            }
            toast({ variant: 'destructive', title: 'Error', description: msg });
        },
    });

    const toggleFreeMutation = useMutation({
        mutationFn: async ({ id, is_free, free_label, force }: { id: string; is_free: boolean; free_label?: string; force?: boolean }) =>
            api.patch(`/classes/${id}/free`, { is_free, free_label, force }),
        onSuccess: (_, vars) => {
            queryClient.invalidateQueries({ queryKey: ['classes'] });
            queryClient.invalidateQueries({ queryKey: ['attendees', clase?.id] });
            onClaseCambiada((prev) => prev ? { ...prev, is_free: vars.is_free, free_label: vars.free_label || null } : prev);
            toast({ title: vars.is_free ? 'Clase marcada como gratis' : 'Clase ya no es gratis' });
        },
        onError: (err: any) => {
            const code = err?.response?.data?.code;
            if (code === 'HAS_FREE_BOOKINGS') {
                if (confirm('Esta clase ya tiene reservas como gratis. ¿Forzar el cambio? Las reservas se mantienen pero la clase deja de aceptar nuevas como gratis.')) {
                    toggleFreeMutation.mutate({ id: clase!.id, is_free: false, force: true });
                }
                return;
            }
            toast({ variant: 'destructive', title: 'Error', description: getErrorMessage(err) });
        },
    });

    // Cerrar / reabrir el horario para nuevas reservas (candado, sin cancelar la clase).
    const closeBookingsMutation = useMutation({
        mutationFn: async ({ id, closed }: { id: string; closed: boolean }) =>
            api.patch(`/classes/${id}/close-bookings`, { closed }),
        onSuccess: (_, vars) => {
            queryClient.invalidateQueries({ queryKey: ['classes'] });
            onClaseCambiada((prev) => prev ? { ...prev, booking_closed: vars.closed } : prev);
            toast({ title: vars.closed ? 'Clase cerrada para nuevas reservas' : 'Clase reabierta' });
        },
        onError: (err: any) => {
            toast({ variant: 'destructive', title: 'Error', description: getErrorMessage(err) });
        },
    });

    // Cupo de TotalPass de la clase (lugares reservados al canal TotalPass).
    const setTotalpassSpotsMutation = useMutation({
        mutationFn: async (n: number) => (await api.put(`/classes/${clase!.id}/channels`, { totalpass: n })).data,
        onSuccess: (_, n) => {
            queryClient.invalidateQueries({ queryKey: ['classes'] });
            onClaseCambiada((prev) => prev ? { ...prev, totalpass_spots: n } : prev);
            toast({ title: 'Cupo TotalPass actualizado', description: `${n} lugar${n === 1 ? '' : 'es'} para TotalPass.` });
        },
        onError: (err: any) => {
            toast({ variant: 'destructive', title: 'Error', description: err?.response?.data?.error || getErrorMessage(err) });
        },
    });

    const checkInMutation = useMutation({
        mutationFn: async (bookingId: string) => {
            return await api.post(`/bookings/${bookingId}/check-in`);
        },
        onSuccess: () => {
            refetchAttendees();
            queryClient.invalidateQueries({ queryKey: ['classes'] });
            toast({ title: 'Check-in realizado', description: 'Asistencia registrada.' });
        },
        onError: (err) => toast({ variant: 'destructive', title: 'Error', description: getErrorMessage(err) }),
    });

    const uncheckInMutation = useMutation({
        mutationFn: async (bookingId: string) => {
            return await api.post(`/bookings/${bookingId}/uncheck-in`);
        },
        onSuccess: () => {
            refetchAttendees();
            queryClient.invalidateQueries({ queryKey: ['classes'] });
            toast({ title: 'Check-in deshecho', description: 'La reserva volvió a estado confirmado.' });
        },
        onError: (err) => toast({ variant: 'destructive', title: 'Error', description: getErrorMessage(err) }),
    });

    const cancelBookingMutation = useMutation({
        mutationFn: async (bookingId: string) => {
            return await api.post(`/bookings/${bookingId}/cancel`);
        },
        onSuccess: () => {
            refetchAttendees();
            queryClient.invalidateQueries({ queryKey: ['classes'] });
            toast({ title: 'Reserva cancelada', description: 'Crédito devuelto si aplicaba.' });
        },
        onError: (err) => toast({ variant: 'destructive', title: 'Error', description: getErrorMessage(err) }),
    });

    // Cancelar reserva confirmada → diálogo con switch de devolución de crédito (estilo Fitune).
    const [cancelBookingId, setCancelBookingId] = useState<string | null>(null);

    const promoteWaitlistMutation = useMutation({
        mutationFn: async (bookingId: string) => api.post(`/bookings/${bookingId}/waitlist-promote`),
        onSuccess: () => {
            refetchAttendees();
            queryClient.invalidateQueries({ queryKey: ['classes'] });
            toast({ title: 'Movido a reservados', description: 'Se promovió desde la lista de espera.' });
        },
        onError: (err) => toast({ variant: 'destructive', title: 'Error', description: getErrorMessage(err) }),
    });

    // Asistentes divididos por estado para las pestañas estilo Fitune.
    const reservados = attendees?.filter(a => !['waitlist', 'cancelled'].includes(a.status)) ?? [];
    const enEspera = attendees?.filter(a => a.status === 'waitlist') ?? [];
    const cancelados = attendees?.filter(a => a.status === 'cancelled') ?? [];
    const classDurationMin = clase?.start_time && clase?.end_time
        ? Math.max(0,
            (parseInt(clase.end_time.slice(0, 2)) * 60 + parseInt(clase.end_time.slice(3, 5))) -
            (parseInt(clase.start_time.slice(0, 2)) * 60 + parseInt(clase.start_time.slice(3, 5))))
        : 0;

    const renderAttendee = (attendee: Attendee, mode: 'reservado' | 'espera' | 'cancelado') => (
        <div
            key={attendee.booking_id}
            className={cn(
                "flex items-center justify-between gap-2 rounded-lg border p-3",
                attendee.status === 'checked_in' && "border-success/30 bg-success/10",
                mode === 'cancelado' && "opacity-70",
            )}
        >
            <div className="flex min-w-0 items-center gap-3">
                <Link to={`/admin/members/${attendee.user_id}`}>
                    <Avatar className="cursor-pointer transition-shadow hover:ring-2 hover:ring-primary">
                        <AvatarImage src={attendee.photo_url || undefined} />
                        <AvatarFallback>{getInitials(attendee.display_name)}</AvatarFallback>
                    </Avatar>
                </Link>
                <div className="min-w-0">
                    <p className="truncate font-medium">{attendee.display_name}</p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                        {attendee.is_free_booking
                            ? <Badge variant="outline" className="text-[10px] border-balance-gold/50 text-balance-gold">Invitada</Badge>
                            : attendee.plan_name && canalDePlan(attendee.plan_name) !== attendee.channel && (
                                <Badge variant="outline" className="text-[10px]"><PlanLabel nombre={attendee.plan_name} /></Badge>
                            )}
                        {mode === 'espera' && attendee.waitlist_position != null && (
                            <span className="font-medium text-balance-olive">#{attendee.waitlist_position} en espera</span>
                        )}
                        {esCanal(attendee.channel) && <ChannelLogo canal={attendee.channel} alto={9} />}
                        {attendee.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{attendee.phone}</span>}
                    </div>
                    <p className="mt-0.5 text-[11px] text-muted-foreground/75">
                        Reservó: {esCanal(attendee.channel) ? `desde ${CANALES[attendee.channel].nombre}` : attendeeBookedBy(attendee)}
                    </p>
                </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
                {['admin', 'super_admin', 'reception'].includes(user?.role || '') && <Button size="icon" variant="outline" aria-label={`Invitadas de ${attendee.display_name}`} title="Invitadas" onClick={() => setCompanionHost(attendee)}><Users className="h-4 w-4" /></Button>}
                {/* Escribirle por WhatsApp. Importa sobre todo con las socias de
                    TotalPass: reservaron desde su app y el estudio no las conoce. */}
                {(() => {
                    const wa = whatsAppDeAsistente(attendee, clase);
                    if (!wa) return null;
                    return (
                        <Button
                            asChild
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-[#25D366] hover:bg-[#25D366]/10 hover:text-[#25D366]"
                            title={`Escribir a ${attendee.display_name} por WhatsApp`}
                        >
                            <a href={wa} target="_blank" rel="noopener noreferrer" aria-label={`Escribir a ${attendee.display_name} por WhatsApp`}>
                                <MessageCircle className="h-4 w-4" />
                            </a>
                        </Button>
                    );
                })()}
                {mode === 'reservado' && attendee.status === 'checked_in' && (
                    <>
                        <Badge className="bg-success"><Check className="mr-1 h-3 w-3" />Asistió</Badge>
                        <Button
                            size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground" title="Deshacer check-in"
                            onClick={() => { if (confirm('¿Deshacer el check-in? La reserva volverá a confirmada.')) uncheckInMutation.mutate(attendee.booking_id); }}
                            disabled={uncheckInMutation.isPending}
                        >
                            <RotateCcw className="h-4 w-4" />
                        </Button>
                    </>
                )}
                {mode === 'reservado' && attendee.status !== 'checked_in' && (
                    <>
                        <Button
                            size="icon" className="h-9 w-9 bg-success hover:bg-success/90" title="Marcar asistencia"
                            onClick={() => checkInMutation.mutate(attendee.booking_id)} disabled={checkInMutation.isPending}
                        >
                            {checkInMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                        </Button>
                        <Button
                            size="icon" variant="outline" className="h-9 w-9 text-destructive hover:bg-destructive/10" title="Cancelar reserva"
                            onClick={() => setCancelBookingId(attendee.booking_id)}
                            disabled={cancelBookingMutation.isPending}
                        >
                            <X className="h-4 w-4" />
                        </Button>
                    </>
                )}
                {mode === 'espera' && (
                    <Button
                        size="sm" variant="outline" title="Promover a reservados"
                        onClick={() => promoteWaitlistMutation.mutate(attendee.booking_id)} disabled={promoteWaitlistMutation.isPending}
                    >
                        Promover
                    </Button>
                )}
                {mode === 'cancelado' && <Badge variant="secondary">Cancelada</Badge>}
            </div>
        </div>
    );

    return (
        <>
            <Sheet open={open && !!clase} onOpenChange={onOpenChange}>
                <SheetContent className="w-full overflow-y-auto p-0 sm:max-w-lg">
                    {/* ── Encabezado estilo Fitune: info de la clase ── */}
                    <div className="border-b border-balance-sand/50 bg-balance-cream/40 p-5">
                        <SheetHeader className="space-y-0 text-left">
                            <SheetTitle className="flex flex-wrap items-center gap-2 text-xl">
                                {clase?.class_type_name}
                                <ClassIntensity intensity={clase?.intensity} />
                                {clase?.status === 'cancelled' && (
                                    <Badge variant="destructive">Cancelada</Badge>
                                )}
                                {clase?.is_free && (
                                    <Badge className="bg-emerald-600 text-white">{clase.free_label || 'Gratis'}</Badge>
                                )}
                            </SheetTitle>
                            <SheetDescription className="sr-only">Detalle de la clase y asistentes</SheetDescription>
                        </SheetHeader>
                        <div className="mt-4 space-y-2.5 text-sm text-balance-dark">
                            <div className="flex items-center gap-3">
                                <CalendarIcon className="h-4 w-4 shrink-0 text-balance-olive" />
                                <span className="capitalize">
                                    {clase && format(parseISO((clase.date || '').split('T')[0] + 'T00:00:00'), "EEEE d 'de' MMMM", { locale: es })}
                                </span>
                            </div>
                            <div className="flex items-center gap-3">
                                <Clock className="h-4 w-4 shrink-0 text-balance-olive" />
                                <span>{clase?.start_time?.slice(0, 5)} – {clase?.end_time?.slice(0, 5)}</span>
                                {classDurationMin > 0 && <span className="text-muted-foreground">· {classDurationMin} min</span>}
                            </div>
                            <div className="flex items-center gap-3">
                                <Users className="h-4 w-4 shrink-0 text-balance-olive" />
                                <span>{clase?.instructor_name || 'Coach por confirmar'}</span>
                            </div>
                            {clase?.facility_name && (
                                <div className="flex items-center gap-3">
                                    <MapPin className="h-4 w-4 shrink-0 text-balance-olive" />
                                    <span>{clase.facility_name}</span>
                                </div>
                            )}
                            <div className="flex items-center gap-3">
                                <Sparkles className="h-4 w-4 shrink-0 text-balance-olive" />
                                <span>{clase?.current_bookings ?? 0} / {clase?.max_capacity ?? 0} lugares</span>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-5 p-5">

                        {/* Actions */}
                        {clase?.status !== 'cancelled' && (
                            <div className="flex gap-2">
                                <Button variant="outline" className="flex-1" onClick={onEditar}>
                                    <Edit className="mr-2 h-4 w-4" /> Editar
                                </Button>
                                <Button
                                    variant="destructive"
                                    className="flex-1"
                                    onClick={() => onCancelar()}
                                >
                                    <Trash2 className="mr-2 h-4 w-4" /> Cancelar Clase
                                </Button>
                            </div>
                        )}

                        {/* Cupo de TotalPass */}
                        {clase?.status !== 'cancelled' && (
                            <div className="rounded-xl border border-balance-sand/55 bg-balance-cream/45 p-3">
                                <div className="mb-2 flex items-center gap-2">
                                    <p className="flex items-center gap-2 text-sm font-semibold">
                                        Lugares para <ChannelLogo canal="totalpass" alto={12} />
                                    </p>
                                </div>
                                <div className="flex items-center justify-center gap-4">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="icon"
                                        className="h-9 w-9 shrink-0 rounded-full"
                                        disabled={
                                            setTotalpassSpotsMutation.isPending ||
                                            (clase?.totalpass_spots ?? 0) <= 0
                                        }
                                        onClick={() => {
                                            if (!clase) return;
                                            const next = Math.max(0, (clase.totalpass_spots ?? 0) - 1);
                                            setTotalpassSpotsMutation.mutate(next);
                                        }}
                                    >
                                        <Minus className="h-4 w-4" />
                                    </Button>
                                    <span className="w-10 text-center text-2xl font-bold tabular-nums text-balance-dark">
                                        {clase?.totalpass_spots ?? 0}
                                    </span>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="icon"
                                        className="h-9 w-9 shrink-0 rounded-full"
                                        disabled={
                                            setTotalpassSpotsMutation.isPending ||
                                            (clase?.totalpass_spots ?? 0) >= (clase?.max_capacity ?? 0)
                                        }
                                        onClick={() => {
                                            if (!clase) return;
                                            const next = Math.min(
                                                clase.max_capacity ?? 0,
                                                (clase.totalpass_spots ?? 0) + 1
                                            );
                                            setTotalpassSpotsMutation.mutate(next);
                                        }}
                                    >
                                        <Plus className="h-4 w-4" />
                                    </Button>
                                </div>
                                <p className="mt-1.5 text-center text-[11px] text-muted-foreground">
                                    de {clase?.max_capacity ?? 0} · 0 = no se ofrece en TotalPass
                                </p>
                            </div>
                        )}

                        {/* Cerrar / reabrir el horario (candado de reservas, sin cancelar) */}
                        {clase && clase.status !== 'cancelled' && (
                            clase.booking_closed ? (
                                <div className="flex items-center justify-between gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3">
                                    <div className="flex items-center gap-2 text-sm text-amber-800">
                                        <Lock className="h-4 w-4 shrink-0" />
                                        <span>Cerrada — no entran nuevas reservas.</span>
                                    </div>
                                    <Button variant="outline" size="sm" className="shrink-0" disabled={closeBookingsMutation.isPending}
                                        onClick={() => closeBookingsMutation.mutate({ id: clase.id, closed: false })}>
                                        <Unlock className="mr-1 h-3 w-3" /> Reabrir
                                    </Button>
                                </div>
                            ) : (
                                <Button variant="outline" className="w-full text-muted-foreground" disabled={closeBookingsMutation.isPending}
                                    onClick={() => closeBookingsMutation.mutate({ id: clase.id, closed: true })}>
                                    <Lock className="mr-2 h-4 w-4" /> Cerrar cupo (no entran nuevas reservas)
                                </Button>
                            )
                        )}

                        {/* Free class toggle (admin/super_admin) */}
                        {isAdmin && clase?.status !== 'cancelled' && (
                            <div className={`rounded-xl border p-3 ${clase?.is_free ? 'border-emerald-300 bg-emerald-50' : 'border-balance-sand/55 bg-balance-cream/45'}`}>
                                <div className="flex items-center justify-between mb-2">
                                    <div>
                                        <p className="text-sm font-semibold">Clase gratis</p>
                                        <p className="text-[11px] text-muted-foreground">
                                            Sin cobro, sin descontar crédito. Usuarios sin paquete pueden reservar.
                                        </p>
                                    </div>
                                    <Switch
                                        checked={!!clase?.is_free}
                                        onCheckedChange={(v) => {
                                            if (!clase) return;
                                            toggleFreeMutation.mutate({
                                                id: clase.id,
                                                is_free: v,
                                                free_label: v ? (clase.free_label || 'Clase gratis') : undefined,
                                            });
                                        }}
                                        disabled={toggleFreeMutation.isPending}
                                    />
                                </div>
                                {clase?.is_free && (
                                    <div className="flex items-center gap-2 mt-2">
                                        <Input
                                            placeholder="Etiqueta visible (ej. Opening Day)"
                                            defaultValue={clase.free_label || ''}
                                            onBlur={(e) => {
                                                const v = e.target.value.trim() || 'Clase gratis';
                                                if (v !== clase.free_label) {
                                                    toggleFreeMutation.mutate({
                                                        id: clase.id,
                                                        is_free: true,
                                                        free_label: v,
                                                    });
                                                }
                                            }}
                                            className="h-8 text-xs"
                                        />
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Add user to class */}
                        {clase?.status !== 'cancelled' && (
                            <div className="rounded-xl border border-balance-sand/55 bg-balance-cream/45 p-3 space-y-2">
                                <p className="text-sm font-semibold">Agregar usuario a la clase</p>
                                {sellFor && (
                                    <div className="flex items-center justify-between gap-2 rounded-lg border border-balance-gold/40 bg-balance-gold/10 p-2.5">
                                        <p className="text-xs text-balance-gold">
                                            {sellFor.name || 'Esta clienta'} no tiene plan con créditos.
                                        </p>
                                        <Button size="sm" className="h-7 shrink-0" onClick={() => setSellOpen(true)}>
                                            Vender plan
                                        </Button>
                                    </div>
                                )}
                                <SellPlanDialog
                                    userId={sellFor?.id ?? ''}
                                    userName={sellFor?.name}
                                    open={sellOpen}
                                    onOpenChange={setSellOpen}
                                    onSold={() => {
                                        if (sellFor && clase) {
                                            adminBookMutation.mutate({ classId: clase.id, userId: sellFor.id, userName: sellFor.name });
                                        }
                                    }}
                                />
                                <label className="flex items-start gap-2 cursor-pointer select-none">
                                    <input
                                        type="checkbox"
                                        checked={guestFree}
                                        onChange={(e) => setGuestFree(e.target.checked)}
                                        className="mt-0.5 h-3.5 w-3.5 rounded border-input accent-balance-gold"
                                    />
                                    <span className="text-[11px] leading-tight">
                                        <span className="font-medium text-balance-dark">Invitada (gratis, sin descontar crédito)</span>
                                        <span className="block text-muted-foreground">No requiere plan.</span>
                                    </span>
                                </label>
                                <div className="relative">
                                    <Input
                                        placeholder="Buscar por nombre o email..."
                                        value={userSearch}
                                        onChange={(e) => {
                                            setUserSearch(e.target.value);
                                            setSearchActive(true);
                                        }}
                                        className="h-8 text-xs"
                                    />
                                </div>
                                {searchActive && userSearch.trim().length >= 2 && (
                                    <div className="space-y-1 max-h-48 overflow-y-auto">
                                        {userSearchLoading && (
                                            <div className="flex justify-center py-3">
                                                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                            </div>
                                        )}
                                        {!userSearchLoading && userSearchResults?.users?.length === 0 && (
                                            <p className="py-2 text-center text-xs text-muted-foreground">Sin resultados</p>
                                        )}
                                        {userSearchResults?.users?.map(u => (
                                            <button
                                                key={u.id}
                                                type="button"
                                                disabled={adminBookMutation.isPending}
                                                onClick={() => {
                                                    if (!clase) return;
                                                    adminBookMutation.mutate({ classId: clase.id, userId: u.id, userName: u.display_name, free: guestFree });
                                                }}
                                                className="flex w-full items-center gap-3 rounded-lg border border-transparent px-2 py-1.5 text-left text-xs hover:border-balance-olive/30 hover:bg-balance-olive/8 disabled:opacity-50"
                                            >
                                                <Avatar className="h-6 w-6 shrink-0">
                                                    <AvatarImage src={u.photo_url || undefined} />
                                                    <AvatarFallback className="text-[9px]">{getInitials(u.display_name)}</AvatarFallback>
                                                </Avatar>
                                                <div className="min-w-0">
                                                    <p className="font-medium truncate">{u.display_name}</p>
                                                    <p className="text-muted-foreground truncate">{u.email}</p>
                                                </div>
                                                {adminBookMutation.isPending ? (
                                                    <Loader2 className="ml-auto h-3 w-3 animate-spin shrink-0" />
                                                ) : (
                                                    <Plus className="ml-auto h-3 w-3 shrink-0 text-balance-olive opacity-0 group-hover:opacity-100" />
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ── Asistentes: pestañas Reservado / Lista de espera / Cancelado ── */}
                        <Tabs value={attendeesTab} onValueChange={(v) => setAttendeesTab(v as 'reservado' | 'espera' | 'cancelado')}>
                            <TabsList className="grid w-full grid-cols-3">
                                <TabsTrigger value="reservado">Reservado <span className="ml-1.5 text-xs opacity-70">{reservados.length}</span></TabsTrigger>
                                <TabsTrigger value="espera">Espera <span className="ml-1.5 text-xs opacity-70">{enEspera.length}</span></TabsTrigger>
                                <TabsTrigger value="cancelado">Cancelado <span className="ml-1.5 text-xs opacity-70">{cancelados.length}</span></TabsTrigger>
                            </TabsList>

                            {attendeesLoading ? (
                                <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
                            ) : (
                                <>
                                    <TabsContent value="reservado" className="mt-4 space-y-2.5">
                                        {reservados.length === 0
                                            ? <p className="py-8 text-center text-sm text-muted-foreground">Sin reservas todavía.</p>
                                            : reservados.map((a) => renderAttendee(a, 'reservado'))}
                                    </TabsContent>
                                    <TabsContent value="espera" className="mt-4 space-y-2.5">
                                        {enEspera.length === 0
                                            ? <p className="py-8 text-center text-sm text-muted-foreground">Nadie en lista de espera.</p>
                                            : enEspera.map((a) => renderAttendee(a, 'espera'))}
                                    </TabsContent>
                                    <TabsContent value="cancelado" className="mt-4 space-y-2.5">
                                        {cancelados.length === 0
                                            ? <p className="py-8 text-center text-sm text-muted-foreground">Sin cancelaciones.</p>
                                            : cancelados.map((a) => renderAttendee(a, 'cancelado'))}
                                    </TabsContent>
                                </>
                            )}
                        </Tabs>
                    </div>
                </SheetContent>
            </Sheet>

            <CancelBookingDialog
                bookingId={cancelBookingId}
                open={!!cancelBookingId}
                onClose={() => setCancelBookingId(null)}
                onCancelled={() => { refetchAttendees(); queryClient.invalidateQueries({ queryKey: ['classes'] }); }}
            />
            <Dialog open={!!companionHost} onOpenChange={open => { if (!open) setCompanionHost(null); }}>
                <DialogContent className="max-h-[90vh] overflow-y-auto">
                    <DialogHeader><DialogTitle>Invitadas de {companionHost?.display_name}</DialogTitle><DialogDescription>Gestiona las invitadas de esta reserva.</DialogDescription></DialogHeader>
                    {companionHost && <CompanionPanel key={companionHost.booking_id} bookingId={companionHost.booking_id} staff />}
                </DialogContent>
            </Dialog>
        </>
    );
}
