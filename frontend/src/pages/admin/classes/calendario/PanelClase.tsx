import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import {
    Loader2, Calendar as CalendarIcon, Plus, Minus, Users, UserRound, Trash2, Check, Edit, Phone, MessageCircle, Clock, MapPin, X, RotateCcw, Lock, Unlock,
} from 'lucide-react';
import api, { getErrorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { Class } from '@/types/class';
import { useAuthStore } from '@/stores/authStore';
import { CompanionPanel } from '@/components/bookings/CompanionPanel';
import { CancelBookingDialog } from '@/components/bookings/CancelBookingDialog';
import { ClassIntensity } from '@/components/classes/ClassIntensity';
import { ChannelLogo } from '@/components/brands/ChannelLogo';
import { ChannelDot, PuntoLugar } from '@/components/brands/ChannelDot';
import { PlanLabel } from '@/components/brands/PlanLabel';
import { CANALES, canalDePlan, canalesConectados, esCanal, type Canal, type CanalClave } from '@/lib/canales';
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
import { estiloDeLugar, etiquetaCupoLarga, lugaresDeClase, type Lugar } from './lugares';
import { colorPuntoAlumna } from './colores';
import { InscribirAlumna } from './InscribirAlumna';

interface PanelClaseProps {
    /** La clase con sus datos vigentes: el padre la vuelve a leer de la lista al refrescar. */
    clase: Class | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onEditar: () => void;
    onCambiarCoach: () => void;
    onCancelar: () => void;
    /** Entrega 5: abre el alta rápida con el nombre buscado. Sin esto no aparece el botón. */
    onRegistrarNueva?: (nombreBuscado: string) => void;
    /** Alumna a resaltar en "Inscritas" (la que acaba de registrar el alta rápida). */
    resaltarId?: string | null;
}

const claveDeLugar = (l: Lugar) => (l.tipo === 'canal' ? l.canal : l.tipo);

/**
 * Panel lateral de una clase, en el orden en que recepción lo usa: qué clase es y cómo va
 * de lugares; acciones; inscribir alumna; cupo de cada plataforma conectada; inscritas
 * (check-in, invitadas, lista de espera); cerrar cupo y clase gratis.
 */
export function PanelClase({ clase, open, onOpenChange, onEditar, onCambiarCoach, onCancelar, onRegistrarNueva, resaltarId }: PanelClaseProps) {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const user = useAuthStore((s) => s.user);
    const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
    const [companionHost, setCompanionHost] = useState<Attendee | null>(null);
    const [attendeesTab, setAttendeesTab] = useState<'reservado' | 'espera' | 'cancelado'>('reservado');
    // Alumna recién inscrita: se resalta unos segundos en "Inscritas".
    const [resaltada, setResaltada] = useState<string | null>(null);
    useEffect(() => { if (resaltarId) setResaltada(resaltarId); }, [resaltarId]);
    // Cancelar reserva confirmada → diálogo con switch de devolución de crédito (estilo Fitune).
    const [cancelBookingId, setCancelBookingId] = useState<string | null>(null);

    useEffect(() => {
        if (!resaltada) return;
        const t = setTimeout(() => setResaltada(null), 6000);
        return () => clearTimeout(t);
    }, [resaltada]);

    const { data: attendees, isLoading: attendeesLoading, refetch: refetchAttendees } = useQuery<Attendee[]>({
        queryKey: ['attendees', clase?.id],
        queryFn: async () => (await api.get(`/bookings/class/${clase?.id}?include_cancelled=true`)).data,
        enabled: !!clase?.id && open,
    });

    // El panel lee la clase de la lista de clases: esperar a que se recargue hace que los
    // puntos, el candado, la etiqueta de gratis y el cupo cambien en cuanto termina la acción.
    const refrescarClases = () => queryClient.invalidateQueries({ queryKey: ['classes'] });

    const toggleFreeMutation = useMutation({
        mutationFn: async ({ id, is_free, free_label, force }: { id: string; is_free: boolean; free_label?: string; force?: boolean }) =>
            api.patch(`/classes/${id}/free`, { is_free, free_label, force }),
        onSuccess: async (_, vars) => {
            queryClient.invalidateQueries({ queryKey: ['attendees', clase?.id] });
            await refrescarClases();
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
        onSuccess: async (_, vars) => {
            await refrescarClases();
            toast({ title: vars.closed ? 'Clase cerrada para nuevas reservas' : 'Clase reabierta' });
        },
        onError: (err: any) => {
            toast({ variant: 'destructive', title: 'Error', description: getErrorMessage(err) });
        },
    });

    // Lugares que cada plataforma conectada puede vender en esta clase. El backend recibe { <canal>: lugares }.
    const cupoCanalMutation = useMutation({
        mutationFn: async ({ canal, lugares }: { canal: CanalClave; lugares: number }) =>
            (await api.put(`/classes/${clase!.id}/channels`, { [canal]: lugares })).data,
        onSuccess: async (_, { canal, lugares }) => {
            await refrescarClases();
            const nombre = CANALES[canal].nombre;
            toast({ title: `Cupo de ${nombre} actualizado`, description: `${lugares} lugar${lugares === 1 ? '' : 'es'} para ${nombre}.` });
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

    const cancelada = clase?.status === 'cancelled';
    const coach = clase?.instructor_name?.trim() || '';
    const lugares = clase ? lugaresDeClase(clase) : null;
    const colorAlumna = colorPuntoAlumna(clase?.class_type_color);

    const renderAttendee = (attendee: Attendee, mode: 'reservado' | 'espera' | 'cancelado') => (
        <div
            key={attendee.booking_id}
            data-resaltada={attendee.user_id === resaltada ? 'true' : undefined}
            className={cn(
                "flex items-center justify-between gap-2 rounded-lg border p-3 transition-colors duration-500",
                attendee.user_id === resaltada && "border-casa-verde bg-casa-verde/10 ring-2 ring-casa-verde/40",
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
                <SheetContent className="w-full overflow-y-auto p-0 font-body sm:max-w-lg">
                    {/* ── Qué clase es y cómo va de lugares ── */}
                    <div className="border-b border-casa-arena bg-casa-avena/60 p-5">
                        <SheetHeader className="space-y-0 text-left">
                            <SheetTitle className="flex flex-wrap items-center gap-2 font-heading text-2xl font-normal text-casa-profundo">
                                {clase?.class_type_name}
                                <ClassIntensity intensity={clase?.intensity} />
                                {cancelada && <Badge variant="destructive">Cancelada</Badge>}
                                {clase?.is_free && <Badge className="bg-emerald-600 text-white">{clase.free_label || 'Gratis'}</Badge>}
                                {clase?.booking_closed && !cancelada && (
                                    <Badge variant="outline" className="border-amber-400 text-amber-800"><Lock className="mr-1 h-3 w-3" />Cupo cerrado</Badge>
                                )}
                            </SheetTitle>
                            <SheetDescription className="sr-only">Detalle de la clase y asistentes</SheetDescription>
                        </SheetHeader>
                        <div className="mt-3 space-y-1.5 text-sm text-casa-ciruela">
                            <p className="flex items-center gap-2.5">
                                <CalendarIcon className="h-4 w-4 shrink-0 text-casa-verde" />
                                <span className="capitalize">
                                    {clase && format(parseISO((clase.date || '').split('T')[0] + 'T00:00:00'), "EEEE d 'de' MMMM", { locale: es })}
                                </span>
                            </p>
                            <p className="flex items-center gap-2.5">
                                <Clock className="h-4 w-4 shrink-0 text-casa-verde" />
                                <span>{clase?.start_time?.slice(0, 5)} – {clase?.end_time?.slice(0, 5)}</span>
                                {classDurationMin > 0 && <span className="text-muted-foreground">· {classDurationMin} min</span>}
                            </p>
                            <p className="flex items-center gap-2.5">
                                <UserRound className="h-4 w-4 shrink-0 text-casa-verde" />
                                {coach ? <span>Con {coach}</span> : <span className="font-semibold text-destructive">Sin coach asignada</span>}
                            </p>
                            {clase?.facility_name && (
                                <p className="flex items-center gap-2.5">
                                    <MapPin className="h-4 w-4 shrink-0 text-casa-verde" />
                                    <span>{clase.facility_name}</span>
                                </p>
                            )}
                        </div>
                        {lugares && !cancelada && (
                            <div className="mt-4 space-y-2" data-testid="lugares-panel">
                                <div className="flex flex-wrap items-center gap-1.5">
                                    {lugares.lugares.map((l, i) => {
                                        const e = estiloDeLugar(l, colorAlumna);
                                        return <PuntoLugar key={i} relleno={e.relleno} anillo={e.anillo} tamano={20} data-lugar={claveDeLugar(l)} />;
                                    })}
                                    <span className="ml-2 font-semibold text-casa-ciruela">{etiquetaCupoLarga(lugares)}</span>
                                </div>
                                <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-casa-ciruela/75">
                                    <span>{lugares.alumnas} {lugares.alumnas === 1 ? 'alumna' : 'alumnas'} de Casa Shé</span>
                                    {lugares.porCanal.map((x) => (
                                        <span key={x.canal} className="flex items-center gap-1.5">
                                            {esCanal(x.canal) ? (
                                                <>
                                                    <ChannelDot canal={x.canal} />
                                                    {x.reservados} {x.reservados === 1 ? 'socia' : 'socias'}
                                                    <ChannelLogo canal={x.canal} alto={9} />
                                                </>
                                            ) : (
                                                <>{x.reservados} de {x.canal}</>
                                            )}
                                        </span>
                                    ))}
                                </p>
                            </div>
                        )}
                    </div>

                    <div className="space-y-5 p-5">
                        {/* Acciones */}
                        {!cancelada && (
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                                <Button variant="outline" className="px-2" onClick={onEditar}>
                                    <Edit className="mr-1.5 h-4 w-4" /> Editar clase
                                </Button>
                                <Button variant="outline" className="px-2" onClick={onCambiarCoach}>
                                    <Users className="mr-1.5 h-4 w-4" /> Cambiar coach
                                </Button>
                                <Button variant="destructive" className="px-2" onClick={onCancelar}>
                                    <Trash2 className="mr-1.5 h-4 w-4" /> Cancelar clase
                                </Button>
                            </div>
                        )}

                        {/* Inscribir alumna: busca, muestra créditos de la bolsa de la clase, inscribe o vende */}
                        {!cancelada && clase && (
                            <InscribirAlumna
                                clase={clase}
                                onInscrita={(userId) => {
                                    setAttendeesTab('reservado');
                                    setResaltada(userId);
                                    refetchAttendees();
                                }}
                                onDeshecha={() => { setResaltada(null); refetchAttendees(); }}
                                onRegistrarNueva={onRegistrarNueva}
                            />
                        )}

                        {/* Cupo de cada plataforma conectada: PUT /classes/:id/channels { [canal]: n }. */}
                        {!cancelada && clase && canalesConectados().map((canal) => (
                            <ControlCupoCanal
                                key={canal.clave}
                                canal={canal}
                                clase={clase}
                                ocupado={cupoCanalMutation.isPending}
                                onCambiar={(n) => cupoCanalMutation.mutate({ canal: canal.clave, lugares: n })}
                            />
                        ))}

                        {/* ── Inscritas: pestañas Reservado / Lista de espera / Cancelado ── */}
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

                        {/* Cerrar / reabrir el horario (candado de reservas, sin cancelar) */}
                        {clase && !cancelada && (
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

                        {/* Clase gratis (admin/super_admin) */}
                        {isAdmin && clase && !cancelada && (
                            <div className={`rounded-xl border p-3 ${clase.is_free ? 'border-emerald-300 bg-emerald-50' : 'border-casa-arena bg-casa-avena/45'}`}>
                                <div className="flex items-center justify-between mb-2">
                                    <div>
                                        <p className="text-sm font-semibold">Clase gratis</p>
                                        <p className="text-[11px] text-muted-foreground">
                                            Sin cobro, sin descontar crédito. Usuarios sin paquete pueden reservar.
                                        </p>
                                    </div>
                                    <Switch
                                        checked={!!clase.is_free}
                                        onCheckedChange={(v) => {
                                            toggleFreeMutation.mutate({
                                                id: clase.id,
                                                is_free: v,
                                                free_label: v ? (clase.free_label || 'Clase gratis') : undefined,
                                            });
                                        }}
                                        disabled={toggleFreeMutation.isPending}
                                    />
                                </div>
                                {clase.is_free && (
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

/**
 * Lugares que una plataforma conectada puede vender en esta clase. No deja bajar de las
 * socias ya inscritas (el servidor lo rechazaría) ni pasar del cupo de la clase.
 */
function ControlCupoCanal({ canal, clase, ocupado, onCambiar }: {
    canal: Canal;
    clase: Class;
    ocupado: boolean;
    onCambiar: (lugares: number) => void;
}) {
    const fila = clase.channels?.find((c) => c.channel === canal.clave);
    const max = Number(fila?.max ?? (canal.clave === 'totalpass' ? clase.totalpass_spots ?? 0 : 0));
    const inscritas = Number(fila?.booked ?? 0);
    const capacidad = Number(clase.max_capacity || 0);
    return (
        <section aria-label={`Lugares para ${canal.nombre}`} className="flex items-center gap-3 rounded-xl border border-casa-arena bg-casa-avena/45 p-3">
            <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-sm font-semibold text-casa-ciruela">
                    Lugares para <ChannelLogo canal={canal.clave} alto={12} />
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {inscritas} {inscritas === 1 ? 'socia inscrita' : 'socias inscritas'} · de {capacidad} · 0 = no se ofrece en {canal.nombre}
                </p>
            </div>
            <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-9 w-9 shrink-0 rounded-full"
                aria-label="Un lugar menos"
                disabled={ocupado || max <= Math.max(0, inscritas)}
                onClick={() => onCambiar(max - 1)}
            >
                <Minus className="h-4 w-4" />
            </Button>
            <span data-testid={`cupo-${canal.clave}`} className="w-8 text-center text-2xl font-bold tabular-nums text-casa-profundo">
                {max}
            </span>
            <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-9 w-9 shrink-0 rounded-full"
                aria-label="Un lugar más"
                disabled={ocupado || max >= capacidad}
                onClick={() => onCambiar(max + 1)}
            >
                <Plus className="h-4 w-4" />
            </Button>
        </section>
    );
}
