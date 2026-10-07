import { useState, useEffect, useMemo, useRef } from 'react';
import { CompanionPanel, CompanionReview } from '@/components/bookings/CompanionPanel';
import { ClassIntensity, ClassIntensitySelector, isClassIntensity } from '@/components/classes/ClassIntensity';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format, startOfWeek, addDays, isSameDay, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import api, { getErrorMessage } from '@/lib/api';
import { CancelBookingDialog } from '@/components/bookings/CancelBookingDialog';
import type { Class, ClassType, Instructor } from '@/types/class';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { useAuthStore } from '@/stores/authStore';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { Button } from '@/components/ui/button';
import SellPlanDialog from '@/components/memberships/SellPlanDialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { parseLocalDate } from '@/lib/date';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useToast } from '@/components/ui/use-toast';
import {
    Loader2, ChevronLeft, ChevronRight, Calendar as CalendarIcon,
    Plus, Minus, Repeat, Users, Trash2, Check, Edit, Phone, MessageCircle, Clock, MapPin, Sparkles, X, RotateCcw, Lock, Unlock,
    RefreshCw, Copy as CopyIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { enlaceWhatsApp } from '@/lib/whatsapp';
import { ChannelLogo } from '@/components/brands/ChannelLogo';
import { PlanLabel } from '@/components/brands/PlanLabel';
import { CANALES, canalDePlan, esCanal } from '@/lib/canales';
import type { Attendee, CopiaSemanaResumen } from './calendario/tipos';
import { DAYS, attendeeBookedBy, formatClassTime, getInitials, whatsAppDeAsistente } from './calendario/formato';
import { useSemanaClases } from './calendario/useSemanaClases';
import { DialogoGenerar } from './calendario/DialogoGenerar';
import { DialogoNuevaClase } from './calendario/DialogoNuevaClase';
import { DialogoEditarClase } from './calendario/DialogoEditarClase';
import { DialogoCopiarSemana } from './calendario/DialogoCopiarSemana';
import { DialogoGratis } from './calendario/DialogoGratis';
import { DialogoCancelarClase } from './calendario/DialogoCancelarClase';
import { DialogoCambiarCoach } from './calendario/DialogoCambiarCoach';

interface ClassesCalendarProps {
    initialGenerateOpen?: boolean;
    /** Embebido en otro shell (recepción): no envuelve AuthGuard/AdminLayout. */
    embedded?: boolean;
}

export default function ClassesCalendar({ initialGenerateOpen = false, embedded = false }: ClassesCalendarProps) {
    const [companionHost, setCompanionHost] = useState<Attendee | null>(null);
    const [companionReviewOpen, setCompanionReviewOpen] = useState(false);
    const [isGenerateOpen, setIsGenerateOpen] = useState(initialGenerateOpen);
    const [isBulkFreeOpen, setIsBulkFreeOpen] = useState(false);
    // Copiar semana: nunca se escribe sin haber mostrado antes la vista previa.
    const [isCopyWeekOpen, setIsCopyWeekOpen] = useState(false);
    // Cada apertura vuelve a montar el diálogo (key): arranca sin vista previa ni opción elegida.
    const [claveCopia, setClaveCopia] = useState(0);
    const [isClassOpen, setIsClassOpen] = useState(false);
    const [nuevaClase, setNuevaClase] = useState<{ dia: Date; clave: number }>({ dia: new Date(), clave: 0 });
    const [cancelChoiceOpen, setCancelChoiceOpen] = useState(false);
    const [isEditOpen, setIsEditOpen] = useState(false);
    // "Cambiar coach": diálogo enfocado para reasignar el instructor con alcance (este día / serie / fechas).
    const [isChangeCoachOpen, setIsChangeCoachOpen] = useState(false);
    const [claveCoach, setClaveCoach] = useState(0);
    const [claveEdicion, setClaveEdicion] = useState(0);
    const [isAttendeesOpen, setIsAttendeesOpen] = useState(false);
    const [selectedClass, setSelectedClass] = useState<Class | null>(null);
    const [attendeesTab, setAttendeesTab] = useState<'reservado' | 'espera' | 'cancelado'>('reservado');
    const [userSearch, setUserSearch] = useState('');
    const [searchActive, setSearchActive] = useState(false);
    // Invitada (gratis): reserva de cortesía sin plan ni consumo de crédito.
    const [guestFree, setGuestFree] = useState(false);
    // Cliente al que se le ofrece venderle un plan (cuando reservar falló por falta de plan).
    const [sellFor, setSellFor] = useState<{ id: string; name: string } | null>(null);
    const [sellOpen, setSellOpen] = useState(false);
    const { toast } = useToast();
    const queryClient = useQueryClient();
    // Acciones masivas/destructivas (limpiar semana, gratis) solo admin estricto;
    // la recepción master (elevated) ve el resto del CRUD pero NO estas.
    const user = useAuthStore((s) => s.user);
    const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';

    const {
        currentDate, setCurrentDate, weekStart, mobileSelectedDay, setMobileSelectedDay,
        classTypeFilter, setClassTypeFilter, programFilter, setProgramFilter, instructorFilter, setInstructorFilter,
        classTypes, instructors, facilities,
        classesLoading, classesError, refetchClasses,
        startStr, endStr, closedDaySet, getClosedReason, getClassesForDay, weekDays, activeClasses,
        totalBookings, openSpots, weekRange, occupancy, mobileDayClasses, mobileDayClosed, mobileClosedReason,
        handlePrevWeek, handleNextWeek, handleToday,
    } = useSemanaClases();

    const { data: attendees, isLoading: attendeesLoading, refetch: refetchAttendees } = useQuery<Attendee[]>({
        queryKey: ['attendees', selectedClass?.id],
        queryFn: async () => (await api.get(`/bookings/class/${selectedClass?.id}?include_cancelled=true`)).data,
        enabled: !!selectedClass?.id && isAttendeesOpen,
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
            queryClient.invalidateQueries({ queryKey: ['attendees', selectedClass?.id] });
            setSelectedClass((prev) => prev ? { ...prev, is_free: vars.is_free, free_label: vars.free_label || null } : prev);
            toast({ title: vars.is_free ? 'Clase marcada como gratis' : 'Clase ya no es gratis' });
        },
        onError: (err: any) => {
            const code = err?.response?.data?.code;
            if (code === 'HAS_FREE_BOOKINGS') {
                if (confirm('Esta clase ya tiene reservas como gratis. ¿Forzar el cambio? Las reservas se mantienen pero la clase deja de aceptar nuevas como gratis.')) {
                    toggleFreeMutation.mutate({ id: selectedClass!.id, is_free: false, force: true });
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
            setSelectedClass((prev) => prev ? { ...prev, booking_closed: vars.closed } : prev);
            toast({ title: vars.closed ? 'Clase cerrada para nuevas reservas' : 'Clase reabierta' });
        },
        onError: (err: any) => {
            toast({ variant: 'destructive', title: 'Error', description: getErrorMessage(err) });
        },
    });

    // Cupo de TotalPass de la clase (lugares reservados al canal TotalPass).
    const setTotalpassSpotsMutation = useMutation({
        mutationFn: async (n: number) => (await api.put(`/classes/${selectedClass!.id}/channels`, { totalpass: n })).data,
        onSuccess: (_, n) => {
            queryClient.invalidateQueries({ queryKey: ['classes'] });
            setSelectedClass((prev) => prev ? { ...prev, totalpass_spots: n } : prev);
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

    const handleDayClick = (day: Date) => {
        // Clave nueva = el diálogo se vuelve a montar con la fecha de ese día.
        setNuevaClase((prev) => ({ dia: day, clave: prev.clave + 1 }));
        setIsClassOpen(true);
    };

    const handleClassClick = (c: Class) => {
        setSelectedClass(c);
        setIsAttendeesOpen(true);
    };

    const handleEditClass = () => {
        if (!selectedClass) return;
        setClaveEdicion((k) => k + 1);
        setIsEditOpen(true);
    };

    const handleChangeCoach = () => {
        if (!selectedClass) return;
        setClaveCoach((k) => k + 1);
        setIsChangeCoachOpen(true);
    };

    // Asistentes divididos por estado para las pestañas estilo Fitune.
    const reservados = attendees?.filter(a => !['waitlist', 'cancelled'].includes(a.status)) ?? [];
    const enEspera = attendees?.filter(a => a.status === 'waitlist') ?? [];
    const cancelados = attendees?.filter(a => a.status === 'cancelled') ?? [];
    const classDurationMin = selectedClass?.start_time && selectedClass?.end_time
        ? Math.max(0,
            (parseInt(selectedClass.end_time.slice(0, 2)) * 60 + parseInt(selectedClass.end_time.slice(3, 5))) -
            (parseInt(selectedClass.start_time.slice(0, 2)) * 60 + parseInt(selectedClass.start_time.slice(3, 5))))
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
                    const wa = whatsAppDeAsistente(attendee, selectedClass);
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

    const bulkDeleteMutation = useMutation({
        mutationFn: async () => {
            return await api.post('/classes/bulk-delete', {
                startDate: startStr,
                endDate: endStr
            });
        },
        onSuccess: (res) => {
            queryClient.invalidateQueries({ queryKey: ['classes'] });
            toast({
                title: 'Calendario limpiado',
                description: res.data.message
            });
        },
        onError: (err) => toast({ variant: 'destructive', title: 'Error', description: getErrorMessage(err) }),
    });

    const content = (
                <div className="space-y-5">
                    {['admin', 'super_admin', 'reception'].includes(user?.role || '') && <Button variant="outline" onClick={() => setCompanionReviewOpen(true)}>Invitadas: revisión de recepción</Button>}
                    <Dialog open={!!companionHost} onOpenChange={open => { if (!open) setCompanionHost(null); }}>
                        <DialogContent className="max-h-[90vh] overflow-y-auto">
                            <DialogHeader><DialogTitle>Invitadas de {companionHost?.display_name}</DialogTitle><DialogDescription>Gestiona las invitadas de esta reserva.</DialogDescription></DialogHeader>
                            {companionHost && <CompanionPanel key={companionHost.booking_id} bookingId={companionHost.booking_id} staff />}
                        </DialogContent>
                    </Dialog>
                    <Dialog open={companionReviewOpen} onOpenChange={setCompanionReviewOpen}>
                        <DialogContent className="max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Invitadas por revisar</DialogTitle><DialogDescription>Seguimiento de pagos y cancelaciones.</DialogDescription></DialogHeader><CompanionReview /></DialogContent>
                    </Dialog>
                    <section className="overflow-hidden rounded-[1.6rem] bg-balance-dark text-balance-cream shadow-[0_28px_80px_-58px_rgba(22,38,26,.95)]">
                        <div className="grid lg:grid-cols-[minmax(0,1.08fr)_minmax(22rem,.92fr)]">
                            <div className="flex min-w-0 flex-col justify-between p-5 sm:p-7 lg:p-9">
                                <div>
                                    <div className="mb-5 inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-balance-cream/58">
                                        <Sparkles className="h-3.5 w-3.5 text-[#B4A248]" />
                                        Operación semanal
                                    </div>
                                    <h1 className="text-4xl font-medium capitalize tracking-[-0.045em] sm:text-5xl">
                                        {format(currentDate, 'MMMM yyyy', { locale: es })}
                                    </h1>
                                    <p className="mt-3 text-sm text-balance-cream/62">{weekRange}</p>
                                </div>
                                <div className="mt-8 grid grid-cols-3 border-y border-balance-cream/16 py-4">
                                    <CalendarStat label="Clases" value={classesLoading ? '…' : classesError ? '—' : activeClasses.length} />
                                    <CalendarStat label="Reservas" value={classesLoading ? '…' : classesError ? '—' : totalBookings} />
                                    <CalendarStat label="Libres" value={classesLoading ? '…' : classesError ? '—' : openSpots} />
                                </div>
                            </div>
                            <figure className="relative min-h-[14rem] overflow-hidden border-t border-balance-cream/12 lg:min-h-[19rem] lg:border-l lg:border-t-0">
                                <img
                                    src="/casashe/espacio-detalles.jpg"
                                    alt="Detalle del estudio Casa Shé"
                                    className="absolute inset-0 h-full w-full object-cover"
                                />
                                <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(22,38,26,.08)_20%,rgba(22,38,26,.72)_100%)] lg:bg-[linear-gradient(90deg,rgba(22,38,26,.36)_0%,rgba(22,38,26,.04)_42%,rgba(22,38,26,.45)_100%)]" />
                                <figcaption className="absolute bottom-4 left-5 text-[9px] font-semibold uppercase tracking-[0.24em] text-balance-cream/72">
                                    Casa Shé · Condesa
                                </figcaption>
                            </figure>
                        </div>
                    </section>

                    <section className="space-y-4 border-y border-balance-sand/70 bg-balance-cream/35 px-1 py-4 sm:px-3">
                        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                            <div className="flex flex-wrap items-center gap-2">
                                <div className="flex items-center overflow-hidden rounded-full border border-balance-sand/70 bg-balance-cream/82">
                                    <Button variant="ghost" size="icon" className="rounded-full" onClick={handlePrevWeek} aria-label="Semana anterior">
                                        <ChevronLeft className="h-4 w-4" />
                                    </Button>
                                    <Button variant="ghost" className="rounded-full px-4 font-semibold" onClick={handleToday}>
                                        Hoy
                                    </Button>
                                    <Button variant="ghost" size="icon" className="rounded-full" onClick={handleNextWeek} aria-label="Semana siguiente">
                                        <ChevronRight className="h-4 w-4" />
                                    </Button>
                                </div>
                                <Badge variant="outline" className="rounded-full border-balance-olive/25 bg-balance-olive/8 px-3 py-1 text-balance-olive">
                                    {occupancy}% ocupación
                                </Badge>
                                <Select value={programFilter} onValueChange={setProgramFilter}>
                                    <SelectTrigger aria-label="Filtrar por programa" className="w-[145px] rounded-full bg-balance-cream/82"><SelectValue placeholder="Programa" /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">Todos los programas</SelectItem>
                                        <SelectItem value="reformer">Salsa</SelectItem>
                                        <SelectItem value="multi">Clases</SelectItem>
                                    </SelectContent>
                                </Select>
                                {classTypes && classTypes.length > 0 && (
                                    <Select value={classTypeFilter} onValueChange={setClassTypeFilter}>
                                        <SelectTrigger aria-label="Filtrar por clase" className="w-[165px] rounded-full bg-balance-cream/82"><SelectValue placeholder="Clase" /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">Todas las clases</SelectItem>
                                            {classTypes.map(ct => (
                                                <SelectItem key={ct.id} value={ct.id}>
                                                    <span className="flex items-center gap-2">
                                                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: ct.color || '#7E8579' }} />
                                                        {ct.name}
                                                    </span>
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                )}
                                {instructors && instructors.length > 0 && (
                                    <Select value={instructorFilter} onValueChange={setInstructorFilter}>
                                        <SelectTrigger aria-label="Filtrar por coach" className="w-[165px] rounded-full bg-balance-cream/82"><SelectValue placeholder="Coach" /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">Todos los coaches</SelectItem>
                                            {instructors.map(inst => (
                                                <SelectItem key={inst.id} value={inst.id}>{inst.display_name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                )}
                            </div>

                            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap xl:justify-end">
                                <Button className="col-span-2 rounded-full bg-balance-olive text-balance-cream hover:bg-balance-dark sm:order-first sm:col-span-1" onClick={() => handleDayClick(mobileSelectedDay)}>
                                    <Plus className="mr-2 h-4 w-4" /> Nueva clase
                                </Button>
                                <Button variant="outline" className="rounded-full border-balance-sand/70 bg-balance-cream/76" onClick={() => setIsGenerateOpen(true)}>
                                    <Repeat className="mr-2 h-4 w-4" /> Generar
                                </Button>
                                <Button
                                    variant="outline"
                                    className="rounded-full border-balance-sand/70 bg-balance-cream/76"
                                    onClick={() => {
                                        // La vista previa se pide aquí y no en onOpenChange: Radix
                                        // no dispara onOpenChange cuando el diálogo se abre por
                                        // estado del padre, así que ahí nunca llegaba a pedirse.
                                        setClaveCopia((k) => k + 1);
                                        setIsCopyWeekOpen(true);
                                    }}
                                    title="Copiar esta semana a la siguiente"
                                >
                                    <CopyIcon className="mr-2 h-4 w-4" /> Copiar semana
                                </Button>
                                {isAdmin && (
                                    <Button variant="outline" className="rounded-full border-balance-olive/25 bg-balance-olive/8 text-balance-olive hover:bg-balance-olive/12" onClick={() => setIsBulkFreeOpen(true)}>
                                        <Sparkles className="mr-2 h-4 w-4" /> Gratis
                                    </Button>
                                )}
                                {isAdmin && (
                                    <Button
                                        variant="ghost"
                                        className="col-span-2 rounded-full text-destructive hover:bg-destructive/8 hover:text-destructive sm:col-span-1"
                                        onClick={() => {
                                            if (confirm('¿Borrar todas las clases vacías de esta semana visible?')) {
                                                bulkDeleteMutation.mutate();
                                            }
                                        }}
                                        disabled={bulkDeleteMutation.isPending}
                                    >
                                        <Trash2 className="mr-2 h-4 w-4" />
                                        {bulkDeleteMutation.isPending ? 'Borrando...' : 'Limpiar semana'}
                                    </Button>
                                )}
                            </div>
                        </div>
                    </section>

                    {classesLoading ? (
                        <div className="flex min-h-64 flex-col items-center justify-center rounded-[1.75rem] border border-balance-sand/65 bg-[hsl(var(--admin-panel))]" aria-live="polite">
                            <Loader2 className="h-6 w-6 animate-spin text-balance-olive" aria-hidden="true" />
                            <p className="mt-3 text-sm font-medium text-balance-dark/65">Cargando calendario…</p>
                        </div>
                    ) : classesError ? (
                        <div className="flex min-h-64 flex-col items-center justify-center rounded-[1.75rem] border border-destructive/25 bg-destructive/5 px-6 text-center" role="alert">
                            <p className="font-semibold text-balance-dark">No pudimos cargar las clases</p>
                            <p className="mt-1 max-w-md text-sm text-balance-dark/60">El calendario sigue guardado. Revisa la conexión con el servidor y vuelve a intentarlo.</p>
                            <Button variant="outline" className="mt-5" onClick={() => refetchClasses()}>
                                <RefreshCw className="mr-2 h-4 w-4" />
                                Volver a intentar
                            </Button>
                        </div>
                    ) : (
                    <>
                    <div className="space-y-4 lg:hidden">
                        <div className="grid grid-cols-7 border-y border-balance-sand/70 py-2" aria-label="Días de la semana">
                            {weekDays.map((day, i) => {
                                const selected = isSameDay(day, mobileSelectedDay);
                                const today = isSameDay(day, new Date());
                                const isClosed = closedDaySet.has(format(day, 'yyyy-MM-dd'));
                                const dayClasses = getClassesForDay(day);
                                return (
                                    <button
                                        key={format(day, 'yyyy-MM-dd')}
                                        type="button"
                                        onClick={() => setMobileSelectedDay(day)}
                                        aria-pressed={selected}
                                        className={cn(
                                            'relative min-w-0 px-0.5 py-2 text-center transition-[color,transform] active:scale-[0.96]',
                                            selected
                                                ? 'text-balance-dark after:absolute after:inset-x-1 after:bottom-0 after:h-[2px] after:bg-balance-olive'
                                                : today
                                                    ? 'text-balance-dark'
                                                    : 'text-balance-dark/55',
                                            isClosed && !selected && 'text-destructive'
                                        )}
                                    >
                                        <span className="block text-[9px] font-semibold uppercase tracking-[0.08em] opacity-65">{DAYS[i].slice(0, 2)}</span>
                                        <span className={cn(
                                            'mx-auto mt-1 flex h-8 w-8 items-center justify-center rounded-full text-lg font-semibold tabular-nums',
                                            selected && 'bg-balance-olive text-balance-cream',
                                            today && !selected && 'border border-balance-olive/55'
                                        )}>{format(day, 'd')}</span>
                                        <span className="mt-1 block text-[8px] font-semibold opacity-55">{dayClasses.length}</span>
                                    </button>
                                );
                            })}
                        </div>

                        <section className="overflow-hidden rounded-[1.35rem] border border-balance-sand/65 bg-[hsl(var(--admin-panel))] shadow-[0_22px_70px_-58px_rgba(51,42,34,.72)]">
                            <header className="flex items-end justify-between gap-4 border-b border-balance-sand/60 bg-balance-cream/48 px-4 py-4">
                                <div>
                                    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-balance-dark/70">
                                        {format(mobileSelectedDay, 'EEEE', { locale: es })}
                                    </p>
                                    <h2 className="mt-1 text-2xl font-semibold capitalize tracking-[-0.035em] text-balance-dark">
                                        {format(mobileSelectedDay, 'd MMMM', { locale: es })}
                                    </h2>
                                </div>
                                <Badge variant="outline" className="rounded-full border-balance-sand/70 bg-balance-cream/75 text-balance-dark/75">
                                    {mobileDayClasses.length} {mobileDayClasses.length === 1 ? 'clase' : 'clases'}
                                </Badge>
                            </header>

                            {mobileDayClosed && (
                                <div className="m-4 rounded-[1rem] border border-destructive/20 bg-destructive/8 px-4 py-3 text-sm font-medium text-destructive">
                                    {mobileClosedReason || 'Studio cerrado'}
                                </div>
                            )}

                            {mobileDayClasses.length > 0 ? (
                                <div className="space-y-3 p-3">
                                    {mobileDayClasses.map((item) => (
                                        <ClassEventCard key={item.id} item={item} onClick={() => handleClassClick(item)} mobile />
                                    ))}
                                    {!mobileDayClosed && (
                                        <Button
                                            variant="ghost"
                                            className="h-11 w-full rounded-full border border-dashed border-balance-sand/70 text-balance-dark/75"
                                            onClick={() => handleDayClick(mobileSelectedDay)}
                                        >
                                            <Plus className="mr-2 h-4 w-4" /> Agregar otra clase
                                        </Button>
                                    )}
                                </div>
                            ) : !mobileDayClosed ? (
                                <button
                                    type="button"
                                    onClick={() => handleDayClick(mobileSelectedDay)}
                                    className="flex min-h-[13rem] w-full flex-col items-center justify-center px-6 text-center text-balance-dark/48 transition-colors hover:bg-balance-olive/6 hover:text-balance-olive"
                                >
                                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-balance-olive/8 text-balance-olive">
                                        <Plus className="h-5 w-5" />
                                    </span>
                                    <span className="mt-4 text-sm font-semibold">Agregar la primera clase</span>
                                    <span className="mt-1 text-xs">No hay sesiones programadas para este día.</span>
                                </button>
                            ) : null}
                        </section>
                    </div>

                    <div className="hidden overflow-hidden rounded-[1.35rem] border border-balance-sand/65 bg-[hsl(var(--admin-panel))] shadow-[0_22px_72px_-58px_rgba(51,42,34,0.75)] lg:block">
                        <div className="overflow-x-auto">
                            <div className="min-w-[980px]">
                                <div className="grid grid-cols-7 border-b border-balance-sand/60 bg-balance-cream/55">
                                    {weekDays.map((day, i) => {
                                        const isToday = isSameDay(day, new Date());
                                        const isClosed = closedDaySet.has(format(day, 'yyyy-MM-dd'));
                                        const dayClasses = getClassesForDay(day);
                                        return (
                                            <button
                                                key={format(day, 'yyyy-MM-dd')}
                                                type="button"
                                                onClick={() => handleDayClick(day)}
                                                className={cn(
                                                    'min-h-[6.75rem] border-r border-balance-sand/55 p-4 text-left transition-colors last:border-r-0 hover:bg-balance-olive/8',
                                                    isToday && 'bg-balance-olive/12',
                                                    isClosed && 'bg-destructive/5'
                                                )}
                                            >
                                                <div className="flex items-start justify-between gap-2">
                                                    <div>
                                                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-balance-dark/70">{DAYS[i]}</p>
                                                        <div className="mt-2 flex items-center gap-2">
                                                            <span className={cn(
                                                                'flex h-10 w-10 items-center justify-center rounded-full text-xl font-semibold tabular-nums text-balance-dark',
                                                                isToday && 'bg-balance-olive text-balance-cream'
                                                            )}>
                                                                {format(day, 'd')}
                                                            </span>
                                                            {isClosed && (
                                                                <Badge variant="destructive" className="rounded-full text-[10px]">Cerrado</Badge>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <span className="rounded-full bg-balance-cream px-2.5 py-1 text-[11px] font-semibold text-balance-dark/58">
                                                        {dayClasses.length} clase{dayClasses.length === 1 ? '' : 's'}
                                                    </span>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>

                                <div className="grid grid-cols-7">
                                    {weekDays.map((day) => {
                                        const dayClasses = getClassesForDay(day);
                                        const isClosed = closedDaySet.has(format(day, 'yyyy-MM-dd'));
                                        const closedReason = getClosedReason(day);
                                        return (
                                            <div
                                                key={format(day, 'yyyy-MM-dd')}
                                                className={cn(
                                                    'min-h-[34rem] border-r border-balance-sand/55 bg-balance-cream/18 p-3 last:border-r-0',
                                                    isClosed && 'bg-destructive/5'
                                                )}
                                            >
                                                {isClosed && (
                                                    <div className="mb-3 rounded-[1rem] border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
                                                        {closedReason || 'Studio cerrado'}
                                                    </div>
                                                )}

                                                <div className="space-y-2.5">
                                                    {dayClasses.map(c => (
                                                        <ClassEventCard key={c.id} item={c} onClick={() => handleClassClick(c)} />
                                                    ))}
                                                </div>

                                                {dayClasses.length === 0 && !isClosed && (
                                                    <button
                                                        type="button"
                                                        className="mt-2 flex min-h-[10rem] w-full flex-col items-center justify-center rounded-[1.1rem] border border-dashed border-balance-sand/70 bg-balance-cream/35 text-center text-balance-dark/48 transition-colors hover:border-balance-olive/40 hover:bg-balance-olive/8 hover:text-balance-olive"
                                                        onClick={() => handleDayClick(day)}
                                                    >
                                                        <Plus className="mb-2 h-4 w-4" />
                                                        <span className="text-xs font-semibold">Agregar clase</span>
                                                    </button>
                                                )}

                                                {dayClasses.length > 0 && (
                                                    <Button
                                                        variant="ghost"
                                                        className="mt-3 h-9 w-full rounded-full border border-dashed border-balance-sand/65 text-xs text-balance-dark/75 hover:border-balance-olive/40 hover:bg-balance-olive/8 hover:text-balance-olive"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleDayClick(day);
                                                        }}
                                                    >
                                                        <Plus className="mr-1.5 h-3.5 w-3.5" />
                                                        Agregar
                                                    </Button>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </div>
                    </>
                    )}

                    {/* Attendees Sheet */}
                    <Sheet open={isAttendeesOpen && !!selectedClass} onOpenChange={(open) => { setIsAttendeesOpen(open); if (!open) setSelectedClass(null); }}>
                        <SheetContent className="w-full overflow-y-auto p-0 sm:max-w-lg">
                            {/* ── Encabezado estilo Fitune: info de la clase ── */}
                            <div className="border-b border-balance-sand/50 bg-balance-cream/40 p-5">
                                <SheetHeader className="space-y-0 text-left">
                                    <SheetTitle className="flex flex-wrap items-center gap-2 text-xl">
                                        {selectedClass?.class_type_name}
                                        <ClassIntensity intensity={selectedClass?.intensity} />
                                        {selectedClass?.status === 'cancelled' && (
                                            <Badge variant="destructive">Cancelada</Badge>
                                        )}
                                        {selectedClass?.is_free && (
                                            <Badge className="bg-emerald-600 text-white">{selectedClass.free_label || 'Gratis'}</Badge>
                                        )}
                                    </SheetTitle>
                                    <SheetDescription className="sr-only">Detalle de la clase y asistentes</SheetDescription>
                                </SheetHeader>
                                <div className="mt-4 space-y-2.5 text-sm text-balance-dark">
                                    <div className="flex items-center gap-3">
                                        <CalendarIcon className="h-4 w-4 shrink-0 text-balance-olive" />
                                        <span className="capitalize">
                                            {selectedClass && format(parseISO((selectedClass.date || '').split('T')[0] + 'T00:00:00'), "EEEE d 'de' MMMM", { locale: es })}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <Clock className="h-4 w-4 shrink-0 text-balance-olive" />
                                        <span>{selectedClass?.start_time?.slice(0, 5)} – {selectedClass?.end_time?.slice(0, 5)}</span>
                                        {classDurationMin > 0 && <span className="text-muted-foreground">· {classDurationMin} min</span>}
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <Users className="h-4 w-4 shrink-0 text-balance-olive" />
                                        <span>{selectedClass?.instructor_name || 'Coach por confirmar'}</span>
                                    </div>
                                    {selectedClass?.facility_name && (
                                        <div className="flex items-center gap-3">
                                            <MapPin className="h-4 w-4 shrink-0 text-balance-olive" />
                                            <span>{selectedClass.facility_name}</span>
                                        </div>
                                    )}
                                    <div className="flex items-center gap-3">
                                        <Sparkles className="h-4 w-4 shrink-0 text-balance-olive" />
                                        <span>{selectedClass?.current_bookings ?? 0} / {selectedClass?.max_capacity ?? 0} lugares</span>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-5 p-5">

                                {/* Actions */}
                                {selectedClass?.status !== 'cancelled' && (
                                    <div className="flex gap-2">
                                        <Button variant="outline" className="flex-1" onClick={handleEditClass}>
                                            <Edit className="mr-2 h-4 w-4" /> Editar
                                        </Button>
                                        <Button
                                            variant="destructive"
                                            className="flex-1"
                                            onClick={() => setCancelChoiceOpen(true)}
                                        >
                                            <Trash2 className="mr-2 h-4 w-4" /> Cancelar Clase
                                        </Button>
                                    </div>
                                )}

                                {/* Cupo de TotalPass */}
                                {selectedClass?.status !== 'cancelled' && (
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
                                                    (selectedClass?.totalpass_spots ?? 0) <= 0
                                                }
                                                onClick={() => {
                                                    if (!selectedClass) return;
                                                    const next = Math.max(0, (selectedClass.totalpass_spots ?? 0) - 1);
                                                    setTotalpassSpotsMutation.mutate(next);
                                                }}
                                            >
                                                <Minus className="h-4 w-4" />
                                            </Button>
                                            <span className="w-10 text-center text-2xl font-bold tabular-nums text-balance-dark">
                                                {selectedClass?.totalpass_spots ?? 0}
                                            </span>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="icon"
                                                className="h-9 w-9 shrink-0 rounded-full"
                                                disabled={
                                                    setTotalpassSpotsMutation.isPending ||
                                                    (selectedClass?.totalpass_spots ?? 0) >= (selectedClass?.max_capacity ?? 0)
                                                }
                                                onClick={() => {
                                                    if (!selectedClass) return;
                                                    const next = Math.min(
                                                        selectedClass.max_capacity ?? 0,
                                                        (selectedClass.totalpass_spots ?? 0) + 1
                                                    );
                                                    setTotalpassSpotsMutation.mutate(next);
                                                }}
                                            >
                                                <Plus className="h-4 w-4" />
                                            </Button>
                                        </div>
                                        <p className="mt-1.5 text-center text-[11px] text-muted-foreground">
                                            de {selectedClass?.max_capacity ?? 0} · 0 = no se ofrece en TotalPass
                                        </p>
                                    </div>
                                )}

                                {/* Cerrar / reabrir el horario (candado de reservas, sin cancelar) */}
                                {selectedClass && selectedClass.status !== 'cancelled' && (
                                    selectedClass.booking_closed ? (
                                        <div className="flex items-center justify-between gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3">
                                            <div className="flex items-center gap-2 text-sm text-amber-800">
                                                <Lock className="h-4 w-4 shrink-0" />
                                                <span>Cerrada — no entran nuevas reservas.</span>
                                            </div>
                                            <Button variant="outline" size="sm" className="shrink-0" disabled={closeBookingsMutation.isPending}
                                                onClick={() => closeBookingsMutation.mutate({ id: selectedClass.id, closed: false })}>
                                                <Unlock className="mr-1 h-3 w-3" /> Reabrir
                                            </Button>
                                        </div>
                                    ) : (
                                        <Button variant="outline" className="w-full text-muted-foreground" disabled={closeBookingsMutation.isPending}
                                            onClick={() => closeBookingsMutation.mutate({ id: selectedClass.id, closed: true })}>
                                            <Lock className="mr-2 h-4 w-4" /> Cerrar cupo (no entran nuevas reservas)
                                        </Button>
                                    )
                                )}

                                {/* Free class toggle (admin/super_admin) */}
                                {isAdmin && selectedClass?.status !== 'cancelled' && (
                                    <div className={`rounded-xl border p-3 ${selectedClass?.is_free ? 'border-emerald-300 bg-emerald-50' : 'border-balance-sand/55 bg-balance-cream/45'}`}>
                                        <div className="flex items-center justify-between mb-2">
                                            <div>
                                                <p className="text-sm font-semibold">Clase gratis</p>
                                                <p className="text-[11px] text-muted-foreground">
                                                    Sin cobro, sin descontar crédito. Usuarios sin paquete pueden reservar.
                                                </p>
                                            </div>
                                            <Switch
                                                checked={!!selectedClass?.is_free}
                                                onCheckedChange={(v) => {
                                                    if (!selectedClass) return;
                                                    toggleFreeMutation.mutate({
                                                        id: selectedClass.id,
                                                        is_free: v,
                                                        free_label: v ? (selectedClass.free_label || 'Clase gratis') : undefined,
                                                    });
                                                }}
                                                disabled={toggleFreeMutation.isPending}
                                            />
                                        </div>
                                        {selectedClass?.is_free && (
                                            <div className="flex items-center gap-2 mt-2">
                                                <Input
                                                    placeholder="Etiqueta visible (ej. Opening Day)"
                                                    defaultValue={selectedClass.free_label || ''}
                                                    onBlur={(e) => {
                                                        const v = e.target.value.trim() || 'Clase gratis';
                                                        if (v !== selectedClass.free_label) {
                                                            toggleFreeMutation.mutate({
                                                                id: selectedClass.id,
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
                                {selectedClass?.status !== 'cancelled' && (
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
                                                if (sellFor && selectedClass) {
                                                    adminBookMutation.mutate({ classId: selectedClass.id, userId: sellFor.id, userName: sellFor.name });
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
                                                            if (!selectedClass) return;
                                                            adminBookMutation.mutate({ classId: selectedClass.id, userId: u.id, userName: u.display_name, free: guestFree });
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

                    <DialogoGenerar open={isGenerateOpen} onOpenChange={setIsGenerateOpen} onGenerado={setCurrentDate} />
                    <DialogoNuevaClase
                        key={`nueva-${nuevaClase.clave}`}
                        open={isClassOpen}
                        onOpenChange={setIsClassOpen}
                        dia={nuevaClase.dia}
                        classTypes={classTypes}
                        instructors={instructors}
                        facilities={facilities}
                    />
                    <DialogoEditarClase
                        key={`editar-${claveEdicion}`}
                        open={isEditOpen}
                        onOpenChange={setIsEditOpen}
                        clase={selectedClass}
                        classTypes={classTypes}
                        instructors={instructors}
                        facilities={facilities}
                        onCambiarCoach={handleChangeCoach}
                        onGuardada={() => { setIsAttendeesOpen(false); setSelectedClass(null); }}
                    />
                    <DialogoCopiarSemana key={`copia-${claveCopia}`} open={isCopyWeekOpen} onOpenChange={setIsCopyWeekOpen} weekStart={weekStart} />
                    <DialogoGratis open={isBulkFreeOpen} onOpenChange={setIsBulkFreeOpen} />
                    <DialogoCancelarClase
                        open={cancelChoiceOpen}
                        onOpenChange={setCancelChoiceOpen}
                        clase={selectedClass}
                        onCancelada={() => { setIsAttendeesOpen(false); setSelectedClass(null); }}
                    />
                    <DialogoCambiarCoach
                        key={`coach-${claveCoach}`}
                        open={isChangeCoachOpen}
                        onOpenChange={setIsChangeCoachOpen}
                        clase={selectedClass}
                        instructors={instructors}
                        onAplicado={() => setIsEditOpen(false)}
                    />
                    <CancelBookingDialog
                        bookingId={cancelBookingId}
                        open={!!cancelBookingId}
                        onClose={() => setCancelBookingId(null)}
                        onCancelled={() => { refetchAttendees(); queryClient.invalidateQueries({ queryKey: ['classes'] }); }}
                    />

                </div>
    );

    if (embedded) return content;

    return (
        <AuthGuard requiredRoles={['admin', 'super_admin', 'instructor']} allowElevated>
            <AdminLayout>{content}</AdminLayout>
        </AuthGuard>
    );
}

function CalendarStat({ label, value }: { label: string; value: number | string }) {
    return (
        <div className="border-l border-balance-cream/16 px-3 first:border-l-0 first:pl-0 sm:px-5">
            <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-balance-cream/70 sm:text-[10px]">{label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums tracking-[-0.04em] text-balance-cream sm:text-3xl">{value}</p>
        </div>
    );
}

function ClassEventCard({ item, onClick, mobile = false }: { item: Class; onClick: () => void; mobile?: boolean }) {
    const baseColor = item.class_type_color || '#7E8579';
    const isFree = !!item.is_free;
    const color = isFree ? '#059669' : baseColor;
    const bookings = Number(item.current_bookings || 0);
    const capacity = Number(item.max_capacity || 0);
    const isCancelled = item.status === 'cancelled';
    const nearly = capacity > 0 && bookings / capacity >= 0.75;
    const full = capacity > 0 && bookings >= capacity;
    const progress = capacity > 0 ? Math.min((bookings / capacity) * 100, 100) : 0;

    return (
        <button
            type="button"
            onClick={onClick}
            aria-label={`${item.class_type_name}${isClassIntensity(item.intensity) ? `, Intensidad ${item.intensity} de 3` : ''}, ${formatClassTime(item.start_time)}, ${bookings} de ${capacity} lugares`}
            className={cn(
                'group w-full overflow-hidden rounded-[1rem] border text-left transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_32px_-18px_rgba(51,42,34,0.28)] active:scale-[0.99]',
                isCancelled && 'opacity-50 saturate-0'
            )}
            style={{
                borderColor: `${color}32`,
                background: isFree
                    ? 'linear-gradient(160deg, #d1fae5 0%, rgba(243,238,226,0.6) 100%)'
                    : `linear-gradient(160deg, ${color}14 0%, rgba(243,238,226,0.52) 100%)`,
            }}
        >
            <div className="h-[3px] w-full" style={{ backgroundColor: color }} aria-hidden="true" />

            <div className={mobile ? 'p-4' : 'p-3'}>
                <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                        <p className={cn('flex items-center gap-1 font-semibold leading-tight text-balance-dark', mobile ? 'text-base' : 'text-[13px]')}>
                            <span className="truncate">{item.class_type_name}</span>
                            <ClassIntensity intensity={item.intensity} />
                        </p>
                        <p className={cn('mt-1 font-semibold tabular-nums text-balance-dark/75', mobile ? 'text-sm' : 'text-[11px]')}>
                            {formatClassTime(item.start_time)}–{formatClassTime(item.end_time)}
                        </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap justify-end gap-1">
                        {isFree && (
                            <span className="rounded-full bg-emerald-700 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-white">
                                Gratis
                            </span>
                        )}
                        {item.booking_closed && !isCancelled && (
                            <span className="rounded-full border border-amber-500/30 bg-amber-50 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-amber-700">
                                Cerrada
                            </span>
                        )}
                        {isCancelled && (
                            <Badge variant="destructive" className="shrink-0 rounded-full text-[9px]">Cancelada</Badge>
                        )}
                    </div>
                </div>

                <p className={cn('truncate text-balance-dark/70', mobile ? 'mt-3 text-sm' : 'mt-1.5 text-[11px]')}>
                    {item.instructor_name || 'Coach por asignar'}
                </p>

                {capacity > 0 && (
                    <div className={mobile ? 'mt-4' : 'mt-2.5'}>
                        <div className="flex items-center justify-between gap-2 text-[10px] font-semibold text-balance-dark/70">
                            {/* Con la marca de TotalPass presente, la palabra "Ocupación" no
                                cabe y se cortaba a "Oc…"; como no aporta nada, se omite. */}
                            <span className="truncate">
                                {full ? 'Cupo lleno' : nearly ? 'Últimos lugares' : (item.totalpass_booked ?? 0) > 0 ? '' : 'Ocupación'}
                            </span>
                            <span className="flex shrink-0 items-center gap-1">
                                {/* Que se vea desde la rejilla que llegó gente por TotalPass:
                                    antes la única señal era el contador de ocupación. Va aquí y
                                    no junto al título porque la columna es angosta y lo aplastaba. */}
                                {(item.totalpass_booked ?? 0) > 0 && !isCancelled && (
                                    <span
                                        className="inline-flex items-center gap-0.5 rounded-full border border-[#2A4E36]/35 bg-[#2A4E36]/10 px-1.5 text-[9px] font-semibold text-[#2A4E36]"
                                        title={`${item.totalpass_booked} ${item.totalpass_booked === 1 ? 'reserva' : 'reservas'} de TotalPass`}
                                    >
                                        TP {item.totalpass_booked}
                                    </span>
                                )}
                                <span className="tabular-nums text-balance-dark/68">{bookings}/{capacity}</span>
                            </span>
                        </div>
                        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-balance-dark/8" aria-hidden="true">
                            <div
                                className="h-full rounded-full transition-transform"
                                style={{
                                    width: `${progress}%`,
                                    backgroundColor: full ? '#dc2626' : nearly ? '#b45309' : color,
                                }}
                            />
                        </div>
                    </div>
                )}
            </div>
        </button>
    );
}
