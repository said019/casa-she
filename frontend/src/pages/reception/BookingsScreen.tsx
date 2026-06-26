import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    format, addDays, startOfWeek, startOfMonth, endOfMonth,
    addMonths, subMonths, addWeeks, subWeeks, isSameDay, isSameMonth, parseISO,
} from 'date-fns';
import { es } from 'date-fns/locale';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from '@/components/ui/dialog';
import {
    Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
    CalendarDays, Plus, X, Loader2, Clock, User, AlertCircle, Search,
    ChevronLeft, ChevronRight, Users as UsersIcon, Check, CreditCard, Phone,
    Lock, Unlock,
} from 'lucide-react';
import { toast } from 'sonner';
import api, { getErrorMessage } from '@/lib/api';
import { CancelBookingDialog } from '@/components/bookings/CancelBookingDialog';
import { GuestBookingDialog } from '@/components/bookings/GuestBookingDialog';
import { useFacilityScope } from '@/hooks/useFacilityScope';
import { useFacilityScopeStore } from '@/stores/facilityScopeStore';
import { useIsElevated } from '@/hooks/useIsElevated';
import { useAuthStore } from '@/stores/authStore';
import SellPlanDialog from '@/components/memberships/SellPlanDialog';
import { formatFolio } from '@/lib/folio';

const WEEK_DAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

function trimTime(t: string): string {
    return t && t.length >= 5 ? t.slice(0, 5) : (t ?? '');
}

interface ClassRow {
    id: string;
    date: string;
    start_time: string;
    end_time: string;
    class_type_name: string;
    class_type_color?: string | null;
    category?: 'reformer' | 'multi' | string;
    instructor_id?: string;
    instructor_name: string;
    current_bookings: number;
    max_capacity: number;
    status: string;
    booking_closed?: boolean;
    facility_name?: string | null;
}

// Sucursal en formato corto para la etiqueta (quita el prefijo "Casa Shé")
const shortFacility = (name?: string | null) =>
    (name || '').replace(/^Casa Shé\s*/i, '').trim();

type CategoryFilter = 'all' | 'reformer' | 'multi';

// Filtra clases por categoría + instructor + tipo de clase (por nombre).
// Si un filtro es 'all'/'' pasa todas.
function applyFilters(
    classes: ClassRow[],
    cat: CategoryFilter,
    instructorId: string,
    classTypeName: string,
): ClassRow[] {
    return classes.filter((c) => {
        if (cat !== 'all' && c.category !== cat) return false;
        if (instructorId && c.instructor_id !== instructorId) return false;
        if (classTypeName && c.class_type_name !== classTypeName) return false;
        return true;
    });
}

// Paleta curada — 12 tonos diferenciables, manteniendo paleta BMB (earth + algunos acentos).
// Hash determinístico sobre el nombre del tipo para que cada class_type SIEMPRE caiga
// en el mismo color sin que admin tenga que configurarlo.
// Espaciados en el círculo de tono para que dos clases consecutivas no salgan muy parecidas.
const PALETTE = [
    '#B89968', // gold cálido (BMB)
    '#6B8E7B', // sage verdoso
    '#A8524C', // terracotta
    '#5C7286', // slate-blue
    '#D4A857', // mustard
    '#8B6B96', // mauve violeta
    '#9C7651', // bronze
    '#7E8579', // olive
    '#C66B5C', // coral
    '#4A7C82', // teal apagado
    '#B17A47', // caramel
    '#7B5E3B', // dark caramel
];

function hashPick<T>(key: string, arr: T[]): T {
    let h = 0;
    for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
    return arr[Math.abs(h) % arr.length];
}

// Color por clase: admin-set > paleta determinística por nombre. Nunca devuelve vacío.
function classAccent(c: ClassRow): string {
    if (c.class_type_color && /^#[0-9a-f]{3,8}$/i.test(c.class_type_color)) {
        return c.class_type_color;
    }
    return hashPick(c.class_type_name || c.category || 'x', PALETTE);
}

interface BookingRow {
    booking_id: string;
    folio?: number;
    booking_status: string;
    user_id: string;
    user_name: string;
    user_email: string;
    class_id: string;
    class_date: string;
    class_start_time: string;
    class_end_time: string;
    class_name: string;
    instructor_name: string;
    plan_name?: string;
    is_free_booking?: boolean;
    user_phone?: string;
    booked_by?: string | null;
    booked_by_name?: string | null;
    booked_by_role?: string | null;
    // Trazabilidad — sucursal y quién agendó/check-in/canceló
    facility_name?: string | null;
    checked_in_by_name?: string | null;
    cancelled_by_name?: string | null;
    cancelled_at?: string | null;
    cancellation_reason?: string | null;
}

// "Reservó": si booked_by es la propia alumna (o null) se reservó sola; si difiere, lo hizo ese staff.
function bookedByLabel(b: BookingRow): string {
    if (!b.booked_by || b.booked_by === b.user_id) return 'la alumna';
    const r = b.booked_by_role;
    const roleEs = r === 'reception' ? 'recepción' : (r === 'admin' || r === 'super_admin') ? 'admin' : r === 'instructor' ? 'coach' : (r || 'staff');
    return `${b.booked_by_name || 'staff'} · ${roleEs}`;
}

interface ClientLite { id: string; display_name: string; email: string; phone: string }

// ─── Drawer: una clase + sus reservados + reservar/cancelar ──────────────────
function ClassDetailDrawer({
    classRow, onClose, onChanged,
}: {
    classRow: ClassRow | null;
    onClose: () => void;
    onChanged: () => void;
}) {
    const qc = useQueryClient();
    const open = !!classRow;
    const { facilityIdParam } = useFacilityScope();

    const { data: bookings = [], isLoading } = useQuery<BookingRow[]>({
        queryKey: ['class-bookings', classRow?.id, classRow?.date, facilityIdParam],
        queryFn: async () => {
            const facParam = facilityIdParam ? `&facility_id=${facilityIdParam}` : '';
            const res = await api.get(`/bookings?startDate=${classRow?.date}&endDate=${classRow?.date}${facParam}`);
            return (res.data as BookingRow[]).filter((b) => b.class_id === classRow?.id);
        },
        enabled: open,
    });

    const refetch = () => {
        qc.invalidateQueries({ queryKey: ['class-bookings', classRow?.id, classRow?.date] });
        onChanged();
    };

    // Salida de lista de espera: cancelación directa (no se gastó crédito, sin reembolso).
    const cancel = useMutation({
        mutationFn: async (bookingId: string) => api.post(`/bookings/${bookingId}/cancel`),
        onSuccess: () => { toast.success('Reserva cancelada'); refetch(); },
        onError: (e) => toast.error(getErrorMessage(e)),
    });

    // Cancelar una reserva confirmada abre el diálogo con switch de devolución de crédito.
    const [cancelId, setCancelId] = useState<string | null>(null);
    // Quitar FORZADO (clase ya pasada / con asistencia) vs. cancelar normal (reserva futura).
    const [cancelForce, setCancelForce] = useState(false);

    // Filtro de estado en la lista de reservadas
    const [bookingFilter, setBookingFilter] = useState<'active' | 'cancelled'>('active');

    // Check-in (asistencia) — recepción usa /checkin/manual (permiso 'checkin').
    // También sirve para CORREGIR a "sí asistió" una reserva marcada no_show por error.
    const checkIn = useMutation({
        mutationFn: async (bookingId: string) => api.post('/checkin/manual', { bookingId }),
        onSuccess: () => { toast.success('Check-in registrado'); refetch(); },
        onError: (e) => toast.error(getErrorMessage(e)),
    });

    // Corrección de asistencia: marcar "no asistió" tras un check-in/auto-check-in por error.
    const noShow = useMutation({
        mutationFn: async (bookingId: string) => api.post('/checkin/no-show', { bookingId }),
        onSuccess: () => { toast.success('Marcada como no asistió'); refetch(); },
        onError: (e) => toast.error(getErrorMessage(e)),
    });

    const planLabel = (b: BookingRow) => b.is_free_booking ? 'Invitada' : (b.plan_name || 'Sin plan');

    // Mini "Reservar a cliente" inline para esta clase específica
    const [clientSearch, setClientSearch] = useState('');
    const [pendingClientId, setPendingClientId] = useState('');
    const [sellOpen, setSellOpen] = useState(false);
    // Invitada (gratis): reserva de cortesía sin plan ni consumo de crédito.
    const [guestFree, setGuestFree] = useState(false);
    // Forzar sobrecupo es SOLO admin (no recepción, ni master). Espeja el backend.
    const drawerRole = useAuthStore((s) => s.user?.role);
    const isAdmin = drawerRole === 'admin' || drawerRole === 'super_admin';
    const { data: clientsResp } = useQuery<{ users: ClientLite[] }>({
        queryKey: ['drawer-clients', clientSearch],
        queryFn: async () => (await api.get(
            `/users?role=client&limit=10${clientSearch ? `&search=${encodeURIComponent(clientSearch)}` : ''}`
        )).data,
        enabled: open && clientSearch.length >= 2,
    });
    const clientResults = clientsResp?.users ?? [];

    const book = useMutation({
        mutationFn: async (force: boolean = false) => api.post('/bookings/admin-book', {
            userId: pendingClientId,
            classId: classRow?.id,
            free: guestFree,
            force,
        }),
        onSuccess: () => {
            toast.success('Usuario agregado');
            setClientSearch(''); setPendingClientId(''); setGuestFree(false);
            refetch();
        },
        onError: (e) => toast.error(getErrorMessage(e)),
    });

    // Cerrar / reabrir el horario (candado de reservas) — sin cancelar la clase.
    const closeBookings = useMutation({
        mutationFn: async (closed: boolean) => api.patch(`/classes/${classRow?.id}/close-bookings`, { closed }),
        onSuccess: (_d, closed) => {
            toast.success(closed ? 'Clase cerrada — no entran nuevas reservas' : 'Clase reabierta');
            onChanged();
            onClose();
        },
        onError: (e) => toast.error(getErrorMessage(e)),
    });

    const dateLabel = classRow ? new Date(classRow.date + 'T00:00:00').toLocaleDateString('es-MX', {
        weekday: 'long', day: 'numeric', month: 'long',
    }) : '';

    return (
        <>
        <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
            <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
                {classRow && (
                    <>
                        <SheetHeader>
                            <SheetTitle className="flex items-start justify-between gap-3 pr-8">
                                <div className="flex items-start gap-3 min-w-0">
                                    <span
                                        aria-hidden
                                        className="w-1 self-stretch rounded-full mt-1"
                                        style={{ backgroundColor: classAccent(classRow), minHeight: '40px' }}
                                    />
                                    <div>
                                        <div className="text-base font-semibold">{classRow.class_type_name}</div>
                                        <div className="text-xs text-muted-foreground font-normal capitalize mt-1">
                                            {dateLabel} · {trimTime(classRow.start_time)}–{trimTime(classRow.end_time)} · {classRow.instructor_name}
                                        </div>
                                    </div>
                                </div>
                                <div className="text-right shrink-0">
                                    <div className="text-2xl font-bold">{classRow.current_bookings}/{classRow.max_capacity}</div>
                                    <div className="text-[10px] text-muted-foreground">ocupación</div>
                                </div>
                            </SheetTitle>
                        </SheetHeader>

                        <div className="space-y-4 mt-6">
                            {/* Cerrar / reabrir el horario (candado de reservas, sin cancelar) */}
                            {classRow.booking_closed ? (
                                <div className="flex items-center justify-between gap-2 rounded-md border border-amber-300 bg-amber-50 p-3">
                                    <div className="flex items-center gap-2 text-sm text-amber-800">
                                        <Lock className="h-4 w-4 shrink-0" />
                                        <span>Clase cerrada — no entran nuevas reservas.</span>
                                    </div>
                                    <Button variant="outline" size="sm" className="shrink-0" onClick={() => closeBookings.mutate(false)} disabled={closeBookings.isPending}>
                                        {closeBookings.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Unlock className="h-3 w-3" />}
                                        <span className="ml-1">Reabrir</span>
                                    </Button>
                                </div>
                            ) : (
                                <Button variant="outline" size="sm" className="w-full text-muted-foreground" onClick={() => closeBookings.mutate(true)} disabled={closeBookings.isPending}>
                                    {closeBookings.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Lock className="h-3 w-3 mr-1" />}
                                    Cerrar cupo (no entran nuevas reservas)
                                </Button>
                            )}

                            {/* Reservar a cliente in-place */}
                            <Card>
                                <CardContent className="pt-4">
                                    <div className="flex items-center justify-between gap-2 mb-2">
                                        <p className="text-sm font-medium">Reservar a usuario</p>
                                        {/* Persona nueva (p. ej. de plataforma): crea + asigna plan + reserva en un paso. Siempre visible. */}
                                        <GuestBookingDialog classId={classRow.id} onDone={refetch} />
                                    </div>
                                    <div className="relative">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                        <Input
                                            value={clientSearch}
                                            onChange={(e) => { setClientSearch(e.target.value); setPendingClientId(''); }}
                                            placeholder="Buscar usuario por nombre, email o teléfono"
                                            className="pl-10"
                                        />
                                    </div>
                                    {clientSearch.length >= 2 && clientResults.length > 0 && !pendingClientId && (
                                        <div className="max-h-40 overflow-y-auto border rounded-md mt-2 divide-y">
                                            {clientResults.map((c) => (
                                                <button
                                                    key={c.id}
                                                    onClick={() => { setPendingClientId(c.id); setClientSearch(c.display_name); }}
                                                    className="w-full text-left p-2 hover:bg-muted/40 text-sm"
                                                >
                                                    <div className="font-medium">{c.display_name}</div>
                                                    <div className="text-xs text-muted-foreground">{c.email} · {c.phone}</div>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                    {pendingClientId && (
                                        <>
                                            <label className="flex items-start gap-2 mt-3 cursor-pointer select-none">
                                                <input
                                                    type="checkbox"
                                                    checked={guestFree}
                                                    onChange={(e) => setGuestFree(e.target.checked)}
                                                    className="mt-0.5 h-4 w-4 rounded border-input accent-bmb-gold"
                                                />
                                                <span className="text-xs leading-tight">
                                                    <span className="font-medium text-bmb-dark">Invitada (gratis, sin descontar crédito)</span>
                                                    <span className="block text-muted-foreground">No requiere plan.</span>
                                                </span>
                                            </label>
                                            <div className="flex items-center justify-end gap-2 mt-3">
                                                <Button variant="outline" onClick={() => setSellOpen(true)}>
                                                    <CreditCard className="h-4 w-4 mr-2" /> Vender plan
                                                </Button>
                                                {classRow.current_bookings >= classRow.max_capacity && isAdmin ? (
                                                    <Button
                                                        variant="destructive"
                                                        onClick={() => {
                                                            if (window.confirm('La clase está llena. ¿Forzar la reserva en sobrecupo? Se descontará 1 crédito como una reserva normal.')) {
                                                                book.mutate(true);
                                                            }
                                                        }}
                                                        disabled={book.isPending}
                                                    >
                                                        {book.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
                                                        Forzar (sobrecupo)
                                                    </Button>
                                                ) : (
                                                    <Button onClick={() => book.mutate(false)} disabled={book.isPending || classRow.current_bookings >= classRow.max_capacity}>
                                                        {book.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
                                                        {classRow.current_bookings >= classRow.max_capacity ? 'Clase llena' : 'Reservar'}
                                                    </Button>
                                                )}
                                            </div>
                                        </>
                                    )}

                                    <SellPlanDialog
                                        userId={pendingClientId}
                                        userName={clientSearch}
                                        open={sellOpen}
                                        onOpenChange={setSellOpen}
                                        onSold={() => {
                                            if (classRow.current_bookings < classRow.max_capacity) {
                                                book.mutate(false);
                                            } else {
                                                toast.info('Plan vendido. La clase está llena — no se reservó.');
                                            }
                                        }}
                                    />
                                </CardContent>
                            </Card>

                            {/* Lista de reservadas con filtro de estado */}
                            <Card>
                                <CardContent className="pt-4">
                                    {(() => {
                                        const active = bookings.filter(b => b.booking_status === 'confirmed' || b.booking_status === 'checked_in' || b.booking_status === 'no_show');
                                        const waitlist = bookings.filter(b => b.booking_status === 'waitlist');
                                        const cancelled = bookings.filter(b => b.booking_status === 'cancelled');
                                        const attended = active.filter(b => b.booking_status === 'checked_in').length;
                                        const noShows = active.filter(b => b.booking_status === 'no_show').length;
                                        return (
                                            <>
                                                {/* Tabs activas / canceladas */}
                                                <div className="flex items-center gap-2 mb-3">
                                                    <button
                                                        onClick={() => setBookingFilter('active')}
                                                        className={`text-sm font-medium px-3 py-1 rounded-full transition-colors ${bookingFilter === 'active' ? 'bg-bmb-gold text-white' : 'text-muted-foreground hover:text-foreground'}`}
                                                    >
                                                        Activas ({active.length})
                                                    </button>
                                                    <button
                                                        onClick={() => setBookingFilter('cancelled')}
                                                        className={`text-sm font-medium px-3 py-1 rounded-full transition-colors ${bookingFilter === 'cancelled' ? 'bg-rose-600 text-white' : 'text-muted-foreground hover:text-foreground'}`}
                                                    >
                                                        Canceladas ({cancelled.length})
                                                    </button>
                                                    {bookingFilter === 'active' && (attended > 0 || noShows > 0) && (
                                                        <span className="ml-auto text-xs text-muted-foreground">
                                                            {attended > 0 && <span className="text-emerald-600">{attended} asistió </span>}
                                                            {noShows > 0 && <span className="text-rose-600">{noShows} no asistió</span>}
                                                        </span>
                                                    )}
                                                </div>

                                                {isLoading ? (
                                                    <Skeleton className="h-12 w-full" />
                                                ) : bookingFilter === 'active' ? (
                                                    <>
                                                        {active.length === 0 && waitlist.length === 0 ? (
                                                            <p className="text-sm text-muted-foreground">Nadie reservada todavía.</p>
                                                        ) : (
                                                            <div className="space-y-2">
                                                                {active.map((b) => (
                                                                    <div key={b.booking_id} className="flex items-center justify-between gap-2 p-2 rounded-md border bg-card">
                                                                        <div className="min-w-0 flex-1">
                                                                            <p className="text-sm font-medium truncate">
                                                                                {b.user_name}
                                                                                {b.folio != null && (
                                                                                    <span className="ml-1.5 text-[10px] font-normal text-muted-foreground tabular-nums">{formatFolio(b.folio)}</span>
                                                                                )}
                                                                            </p>
                                                                            {(b.facility_name || (b.booked_by_name && b.booked_by_role !== 'client')) && (
                                                                                <div className="flex flex-wrap items-center gap-1 mt-0.5">
                                                                                    {b.facility_name && (
                                                                                        <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                                                                                            {shortFacility(b.facility_name)}
                                                                                        </span>
                                                                                    )}
                                                                                    {b.booked_by_name && b.booked_by_role !== 'client' && (
                                                                                        <span className="text-[10px] text-muted-foreground">agendó: {b.booked_by_name}</span>
                                                                                    )}
                                                                                </div>
                                                                            )}
                                                                            <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                                                                                <CreditCard className="h-3 w-3 shrink-0" />
                                                                                {b.is_free_booking ? (
                                                                                    <Badge variant="outline" className="h-4 px-1.5 text-[10px] border-balance-gold/50 text-balance-gold">Invitada</Badge>
                                                                                ) : (
                                                                                    <span className={b.plan_name ? '' : 'text-amber-600'}>{planLabel(b)}</span>
                                                                                )}
                                                                                {b.user_phone && (
                                                                                    <><Phone className="h-3 w-3 shrink-0 ml-1" /><span>{b.user_phone}</span></>
                                                                                )}
                                                                            </p>
                                                                            <p className="text-[11px] text-muted-foreground/75 truncate">Reservó: {bookedByLabel(b)}</p>
                                                                        </div>
                                                                        {b.booking_status === 'checked_in' ? (
                                                                            <div className="flex items-center gap-1 shrink-0">
                                                                                <Badge variant="outline" className="text-emerald-600 border-emerald-600">
                                                                                    <Check className="h-3 w-3 mr-1" />Asistió
                                                                                </Badge>
                                                                                <Button variant="ghost" size="sm" className="text-muted-foreground" title="Corregir: no asistió" onClick={() => noShow.mutate(b.booking_id)} disabled={noShow.isPending}>
                                                                                    {noShow.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
                                                                                    <span className="ml-1 text-xs">No asistió</span>
                                                                                </Button>
                                                                                <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" title="Quitar de la clase" onClick={() => { setCancelForce(true); setCancelId(b.booking_id); }}>
                                                                                    <X className="h-3 w-3" />
                                                                                    <span className="ml-1 text-xs">Quitar</span>
                                                                                </Button>
                                                                            </div>
                                                                        ) : b.booking_status === 'no_show' ? (
                                                                            <div className="flex items-center gap-1 shrink-0">
                                                                                <Badge variant="outline" className="text-rose-600 border-rose-600">No asistió</Badge>
                                                                                <Button variant="ghost" size="sm" className="text-emerald-700" title="Corregir: sí asistió" onClick={() => checkIn.mutate(b.booking_id)} disabled={checkIn.isPending}>
                                                                                    {checkIn.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                                                                                    <span className="ml-1 text-xs">Sí asistió</span>
                                                                                </Button>
                                                                                <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" title="Quitar de la clase" onClick={() => { setCancelForce(true); setCancelId(b.booking_id); }}>
                                                                                    <X className="h-3 w-3" />
                                                                                    <span className="ml-1 text-xs">Quitar</span>
                                                                                </Button>
                                                                            </div>
                                                                        ) : (
                                                                            <div className="flex items-center gap-1 shrink-0">
                                                                                <Button variant="outline" size="sm" onClick={() => checkIn.mutate(b.booking_id)} disabled={checkIn.isPending}>
                                                                                    {checkIn.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                                                                                    <span className="ml-1 text-xs">Check-in</span>
                                                                                </Button>
                                                                                <Button variant="ghost" size="sm" onClick={() => { setCancelForce(false); setCancelId(b.booking_id); }} title="Cancelar reserva">
                                                                                    <X className="h-3 w-3" />
                                                                                </Button>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}

                                                        {waitlist.length > 0 && (
                                                            <div className="mt-4">
                                                                <p className="text-sm font-medium mb-2 text-amber-700">Lista de espera ({waitlist.length})</p>
                                                                <div className="space-y-2">
                                                                    {waitlist.map((b, i) => (
                                                                        <div key={b.booking_id} className="flex items-center justify-between gap-2 p-2 rounded-md border bg-card">
                                                                            <div className="min-w-0 flex-1">
                                                                                <p className="text-sm font-medium truncate">
                                                                                    {i + 1}. {b.user_name}
                                                                                    {b.folio != null && (
                                                                                        <span className="ml-1.5 text-[10px] font-normal text-muted-foreground tabular-nums">{formatFolio(b.folio)}</span>
                                                                                    )}
                                                                                </p>
                                                                                <p className="text-xs text-muted-foreground truncate">{planLabel(b)}{b.user_phone ? ` · ${b.user_phone}` : ''}</p>
                                                                            </div>
                                                                            <div className="flex items-center gap-1 shrink-0">
                                                                                <Badge variant="outline" className="text-amber-600 border-amber-600">espera</Badge>
                                                                                <Button variant="ghost" size="sm" onClick={() => cancel.mutate(b.booking_id)} disabled={cancel.isPending}>
                                                                                    <X className="h-3 w-3" />
                                                                                </Button>
                                                                            </div>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </>
                                                ) : (
                                                    /* Vista de canceladas */
                                                    cancelled.length === 0 ? (
                                                        <p className="text-sm text-muted-foreground">Sin cancelaciones en esta clase.</p>
                                                    ) : (
                                                        <div className="space-y-2">
                                                            {cancelled.map((b) => (
                                                                <div key={b.booking_id} className="p-2 rounded-md border bg-card opacity-80">
                                                                    <div className="flex items-start justify-between gap-2">
                                                                        <p className="text-sm font-medium truncate">
                                                                            {b.user_name}
                                                                            {b.folio != null && (
                                                                                <span className="ml-1.5 text-[10px] font-normal text-muted-foreground tabular-nums">{formatFolio(b.folio)}</span>
                                                                            )}
                                                                        </p>
                                                                        <Badge variant="outline" className="text-rose-600 border-rose-600 shrink-0 text-[10px]">Cancelada</Badge>
                                                                    </div>
                                                                    <p className="text-xs text-muted-foreground mt-0.5">
                                                                        {planLabel(b)}{b.user_phone ? ` · ${b.user_phone}` : ''}
                                                                    </p>
                                                                    <p className="text-[11px] text-muted-foreground/75 mt-0.5">
                                                                        Canceló: {b.cancelled_by_name ?? 'ella misma'}
                                                                        {b.cancelled_at && (
                                                                            <span> · {new Date(b.cancelled_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                                                                        )}
                                                                    </p>
                                                                    {b.cancellation_reason && (
                                                                        <p className="text-[11px] text-muted-foreground/75">Motivo: "{b.cancellation_reason}"</p>
                                                                    )}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )
                                                )}
                                            </>
                                        );
                                    })()}
                                </CardContent>
                            </Card>
                        </div>
                    </>
                )}
            </SheetContent>
        </Sheet>
        <CancelBookingDialog
            bookingId={cancelId}
            open={!!cancelId}
            force={cancelForce}
            onClose={() => { setCancelId(null); setCancelForce(false); }}
            onCancelled={refetch}
        />
        </>
    );
}

// ─── Dialog global: Reservar a cliente (para el header) ───────────────────────
function AdminBookDialog({ defaultDate, onDone }: { defaultDate: string; onDone: () => void }) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [clientId, setClientId] = useState('');
    const [classId, setClassId] = useState('');
    const [date, setDate] = useState(defaultDate);
    const [facility, setFacility] = useState(''); // '' = todas las sucursales
    const [sellOpen, setSellOpen] = useState(false);
    // Invitada (gratis): reserva de cortesía sin plan ni consumo de crédito.
    const [guestFree, setGuestFree] = useState(false);
    const elevated = useIsElevated();

    const { data: facilities = [] } = useQuery<{ id: string; name: string }[]>({
        queryKey: ['facilities'],
        queryFn: async () => (await api.get('/facilities')).data,
        enabled: open && elevated,
    });

    const { data: clientsResp } = useQuery<{ users: ClientLite[] }>({
        queryKey: ['adminbook-clients', search],
        queryFn: async () => (await api.get(
            `/users?role=client&limit=20${search ? `&search=${encodeURIComponent(search)}` : ''}`
        )).data,
        enabled: open && search.length >= 2,
    });
    const clients = clientsResp?.users ?? [];

    // Un master puede elegir sucursal; sin elegir ('') el backend devuelve todas
    // (y a una recepción normal la fuerza a la suya).
    const { data: classes = [] } = useQuery<ClassRow[]>({
        queryKey: ['adminbook-classes', date, facility],
        queryFn: async () => {
            const facParam = facility ? `&facility_id=${facility}` : '';
            return (await api.get(`/classes?start=${date}&end=${date}${facParam}`)).data;
        },
        enabled: open,
    });

    const book = useMutation({
        mutationFn: async () => api.post('/bookings/admin-book', { userId: clientId, classId, free: guestFree }),
        onSuccess: () => {
            toast.success('Reserva creada');
            setOpen(false);
            setClientId(''); setClassId(''); setSearch(''); setGuestFree(false);
            onDone();
        },
        onError: (e) => toast.error(getErrorMessage(e)),
    });

    return (
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setGuestFree(false); }}>
            <DialogTrigger asChild>
                <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Reservar a usuario
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader><DialogTitle>Reservar a un usuario</DialogTitle></DialogHeader>
                <div className="space-y-3">
                    <div className="space-y-1">
                        <Label>Usuario (escribe para buscar)</Label>
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input className="pl-10" value={search}
                                onChange={(e) => { setSearch(e.target.value); setClientId(''); }}
                                placeholder="Nombre, email o teléfono" />
                        </div>
                        {search.length >= 2 && clients.length > 0 && !clientId && (
                            <div className="max-h-40 overflow-y-auto border rounded-md mt-1 divide-y">
                                {clients.map((c) => (
                                    <button key={c.id} onClick={() => { setClientId(c.id); setSearch(c.display_name); }}
                                        className="w-full text-left p-2 hover:bg-muted/40 text-sm">
                                        <div className="font-medium">{c.display_name}</div>
                                        <div className="text-xs text-muted-foreground">{c.email} · {c.phone}</div>
                                    </button>
                                ))}
                            </div>
                        )}
                        {clientId && <p className="text-xs text-emerald-700 mt-1">✓ Usuario seleccionado</p>}
                    </div>
                    <div className="space-y-1">
                        <Label>Día</Label>
                        <Input type="date" value={date} onChange={(e) => { setDate(e.target.value); setClassId(''); }} />
                    </div>
                    {elevated && facilities.length > 1 && (
                        <div className="space-y-1">
                            <Label>Sucursal</Label>
                            <Select value={facility || 'all'} onValueChange={(v) => { setFacility(v === 'all' ? '' : v); setClassId(''); }}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Todas las sucursales</SelectItem>
                                    {facilities.map((f) => (
                                        <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}
                    <div className="space-y-1">
                        <Label>Clase</Label>
                        <Select value={classId} onValueChange={setClassId}>
                            <SelectTrigger>
                                <SelectValue placeholder={classes.length === 0 ? 'No hay clases ese día' : 'Elige una clase'} />
                            </SelectTrigger>
                            <SelectContent>
                                {classes.filter((c) => c.status !== 'cancelled').map((c) => (
                                    <SelectItem key={c.id} value={c.id}>
                                        {trimTime(c.start_time)} — {c.class_type_name} · {c.instructor_name}
                                        {' '}({c.current_bookings}/{c.max_capacity})
                                        {!facility && c.facility_name ? ` · ${shortFacility(c.facility_name)}` : ''}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <label className="flex items-start gap-2 cursor-pointer select-none">
                        <input
                            type="checkbox"
                            checked={guestFree}
                            onChange={(e) => setGuestFree(e.target.checked)}
                            className="mt-0.5 h-4 w-4 rounded border-input accent-bmb-gold"
                        />
                        <span className="text-xs leading-tight">
                            <span className="font-medium text-bmb-dark">Invitada (gratis, sin descontar crédito)</span>
                            <span className="block text-muted-foreground">No requiere plan.</span>
                        </span>
                    </label>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                    {clientId && (
                        <Button variant="outline" onClick={() => setSellOpen(true)}>
                            <CreditCard className="h-4 w-4 mr-2" /> Vender plan
                        </Button>
                    )}
                    <Button onClick={() => book.mutate()} disabled={book.isPending || !clientId || !classId}>
                        {book.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                        Reservar
                    </Button>
                </DialogFooter>
                <SellPlanDialog
                    userId={clientId}
                    userName={search}
                    open={sellOpen}
                    onOpenChange={setSellOpen}
                    onSold={() => {
                        if (clientId && classId) book.mutate();
                        else toast.success('Plan vendido. Elige una clase y reserva.');
                    }}
                />
            </DialogContent>
        </Dialog>
    );
}

// ─── Vista DÍA: lista compacta de clases ──────────────────────────────────────
function DayView({
    date, onPickClass, onPickDate, categoryFilter, instructorFilter,
    classTypeFilter, setClassTypeFilter,
}: {
    date: string;
    onPickClass: (c: ClassRow) => void;
    onPickDate: (d: string) => void;
    categoryFilter: CategoryFilter;
    instructorFilter: string;
    classTypeFilter: string;
    setClassTypeFilter: (n: string) => void;
}) {
    const { facilityIdParam } = useFacilityScope();
    const { data: classesRaw = [], isLoading } = useQuery<ClassRow[]>({
        queryKey: ['reservas-day-classes', date, facilityIdParam],
        queryFn: async () => {
            const facParam = facilityIdParam ? `&facility_id=${facilityIdParam}` : '';
            return (await api.get(`/classes?start=${date}&end=${date}${facParam}`)).data;
        },
    });

    // Para la leyenda mostramos los tipos del día completo (ignora classTypeFilter),
    // así no desaparece el resto al filtrar por uno.
    const dayClassesUnfiltered = classesRaw.filter((c) => c.status !== 'cancelled');
    const dayClassesByCatInstr = applyFilters(dayClassesUnfiltered, categoryFilter, instructorFilter, '');

    // La lista final sí respeta classTypeFilter.
    const active = applyFilters(dayClassesUnfiltered, categoryFilter, instructorFilter, classTypeFilter);

    // Tipos de clase únicos del día (ignorando classTypeFilter) con su color para la leyenda.
    const legendTypes = useMemo(() => {
        const seen = new Map<string, string>();
        for (const c of dayClassesByCatInstr) {
            if (!seen.has(c.class_type_name)) seen.set(c.class_type_name, classAccent(c));
        }
        return Array.from(seen.entries()).map(([name, color]) => ({ name, color }));
    }, [dayClassesByCatInstr]);

    return (
        <div className="space-y-4">
            <Card>
                <CardContent className="pt-4 flex flex-wrap items-end gap-4">
                    <div className="space-y-1">
                        <Label className="text-xs">Día</Label>
                        <Input type="date" value={date} onChange={(e) => onPickDate(e.target.value)} className="h-8 text-xs w-40" />
                    </div>
                    <div className="ml-auto text-right">
                        <div className="text-xs text-muted-foreground">Clases mostradas</div>
                        <div className="text-xl sm:text-2xl font-semibold tabular-nums truncate">{active.length}</div>
                    </div>
                </CardContent>
            </Card>

            {legendTypes.length > 1 && (
                <div className="flex flex-wrap gap-2 px-1 items-center">
                    {legendTypes.map((t) => {
                        const isActive = classTypeFilter === t.name;
                        const isDim = !!classTypeFilter && !isActive;
                        return (
                            <button
                                key={t.name}
                                type="button"
                                onClick={() => setClassTypeFilter(isActive ? '' : t.name)}
                                className={`inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-sm border transition-all ${
                                    isDim ? 'opacity-40 hover:opacity-70' : 'hover:shadow-sm'
                                }`}
                                style={{
                                    borderColor: isActive ? t.color : `${t.color}55`,
                                    backgroundColor: isActive ? `${t.color}33` : `${t.color}10`,
                                    fontWeight: isActive ? 600 : 400,
                                }}
                                title={isActive ? 'Quitar filtro' : `Filtrar solo ${t.name}`}
                            >
                                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: t.color }} />
                                <span className="text-bmb-dark">{t.name}</span>
                                {isActive && <X className="h-3 w-3 ml-0.5" />}
                            </button>
                        );
                    })}
                    {classTypeFilter && (
                        <button
                            type="button"
                            onClick={() => setClassTypeFilter('')}
                            className="text-[11px] text-muted-foreground hover:text-bmb-dark underline ml-1"
                        >
                            ver todos
                        </button>
                    )}
                </div>
            )}

            {isLoading ? (
                <Skeleton className="h-64 w-full" />
            ) : active.length === 0 ? (
                <Card>
                    <CardContent className="py-12 text-center text-muted-foreground text-sm">
                        <CalendarDays className="h-8 w-8 mx-auto mb-2 opacity-40" />
                        {classesRaw.length === 0
                            ? 'No hay clases programadas para este día en tu sucursal.'
                            : 'No hay clases que coincidan con los filtros activos.'}
                    </CardContent>
                </Card>
            ) : (
                <div className="border rounded-md divide-y bg-card overflow-hidden">
                    {active.sort((a, b) => a.start_time.localeCompare(b.start_time)).map((c) => {
                        const occ = c.max_capacity > 0 ? Math.round((c.current_bookings / c.max_capacity) * 100) : 0;
                        const occTone =
                            occ >= 80 ? 'text-emerald-700' :
                            occ === 0 ? 'text-muted-foreground' :
                            occ < 30 ? 'text-amber-700' :
                            'text-bmb-dark';
                        const color = classAccent(c);
                        return (
                            <button
                                key={c.id}
                                onClick={() => onPickClass(c)}
                                className="w-full text-left pl-0 pr-3 py-3 hover:bg-muted/30 transition-colors flex items-center gap-3"
                            >
                                {/* Barra lateral fuerte (8px) de color identifica el tipo de clase */}
                                <span
                                    aria-hidden
                                    className="self-stretch w-2 rounded-r-sm shrink-0"
                                    style={{ backgroundColor: color }}
                                />
                                {/* Hora — más grande y monoespaciada */}
                                <div className="shrink-0 min-w-[88px] text-left">
                                    <div className="text-lg font-mono tabular-nums font-semibold leading-tight">
                                        {trimTime(c.start_time)}
                                    </div>
                                    <div className="text-[11px] text-muted-foreground font-mono tabular-nums">
                                        a {trimTime(c.end_time)}
                                    </div>
                                </div>
                                {/* Dot de color + clase + instructor */}
                                <div className="flex-1 min-w-0 flex items-center gap-2">
                                    <span
                                        aria-hidden
                                        className="h-3 w-3 rounded-full shrink-0"
                                        style={{ backgroundColor: color }}
                                    />
                                    <div className="min-w-0">
                                        <p className="text-base font-medium truncate">{c.class_type_name}</p>
                                        <p className="text-xs text-muted-foreground truncate">{c.instructor_name}</p>
                                    </div>
                                </div>
                                {/* Etiqueta de sucursal */}
                                {c.facility_name && (
                                    <span className="text-[10px] uppercase tracking-wider font-medium hidden sm:inline shrink-0 rounded-sm border border-border bg-muted/60 px-2 py-0.5 text-muted-foreground">
                                        {shortFacility(c.facility_name)}
                                    </span>
                                )}
                                {/* Etiqueta del tipo de clase (no la categoría) — más informativa */}
                                <span
                                    className="text-[10px] uppercase tracking-wider font-semibold hidden md:inline shrink-0 px-2 py-0.5 rounded-sm"
                                    style={{ backgroundColor: `${color}26`, color }}
                                >
                                    {c.category ?? 'clase'}
                                </span>
                                <div className="text-right shrink-0 min-w-[64px]">
                                    <p className={`text-base font-semibold ${occTone}`}>{c.current_bookings}/{c.max_capacity}</p>
                                    <p className={`text-[11px] ${occTone}`}>{occ}%</p>
                                </div>
                                <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

// ─── Vista SEMANA: 7 columnas con clases compactas ────────────────────────────
function WeekView({
    weekStart, setWeekStart, onPickClass, onPickDate, categoryFilter, instructorFilter, classTypeFilter,
}: {
    weekStart: Date;
    setWeekStart: (d: Date) => void;
    onPickClass: (c: ClassRow) => void;
    onPickDate: (d: string) => void;
    categoryFilter: CategoryFilter;
    instructorFilter: string;
    classTypeFilter: string;
}) {
    const startStr = format(weekStart, 'yyyy-MM-dd');
    const endStr = format(addDays(weekStart, 6), 'yyyy-MM-dd');
    const { facilityIdParam } = useFacilityScope();

    const { data: classesRaw = [], isLoading } = useQuery<ClassRow[]>({
        queryKey: ['reservas-week-classes', startStr, endStr, facilityIdParam],
        queryFn: async () => {
            const facParam = facilityIdParam ? `&facility_id=${facilityIdParam}` : '';
            return (await api.get(`/classes?start=${startStr}&end=${endStr}${facParam}`)).data;
        },
    });

    const classes = applyFilters(classesRaw, categoryFilter, instructorFilter, classTypeFilter);

    const byDay = useMemo(() => {
        const map: Record<string, ClassRow[]> = {};
        for (const c of classes) {
            if (c.status === 'cancelled') continue;
            const key = c.date.slice(0, 10);
            if (!map[key]) map[key] = [];
            map[key].push(c);
        }
        for (const k of Object.keys(map)) map[k].sort((a, b) => a.start_time.localeCompare(b.start_time));
        return map;
    }, [classes]);

    const days = Array.from({ length: 7 }).map((_, i) => addDays(weekStart, i));

    return (
        <div className="space-y-3">
            <Card>
                <CardContent className="pt-4 flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => setWeekStart(subWeeks(weekStart, 1))}>
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 0 }))}>
                            Hoy
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setWeekStart(addWeeks(weekStart, 1))}>
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>
                    <p className="text-sm text-muted-foreground capitalize">
                        Semana del {format(weekStart, "d 'de' MMMM", { locale: es })} al {format(addDays(weekStart, 6), "d 'de' MMMM yyyy", { locale: es })}
                    </p>
                </CardContent>
            </Card>

            {isLoading ? (
                <Skeleton className="h-96 w-full" />
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
                    {days.map((d) => {
                        const key = format(d, 'yyyy-MM-dd');
                        const dayClasses = byDay[key] || [];
                        const isToday = isSameDay(d, new Date());
                        return (
                            <div key={key} className={`rounded-md border bg-card ${isToday ? 'border-bmb-gold' : ''}`}>
                                <button
                                    onClick={() => onPickDate(key)}
                                    className="w-full p-2 text-left border-b hover:bg-muted/40 transition-colors"
                                >
                                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                                        {WEEK_DAY_LABELS[d.getDay()]}
                                    </div>
                                    <div className={`text-lg font-semibold ${isToday ? 'text-bmb-deepgold' : ''}`}>
                                        {format(d, 'd')}
                                    </div>
                                </button>
                                <div className="p-1.5 space-y-1 min-h-[80px]">
                                    {dayClasses.length === 0 && (
                                        <p className="text-[10px] text-muted-foreground text-center pt-3">—</p>
                                    )}
                                    {dayClasses.map((c) => {
                                        const color = classAccent(c);
                                        return (
                                            <button
                                                key={c.id}
                                                onClick={() => onPickClass(c)}
                                                className="w-full text-left px-2 py-1.5 rounded-sm text-[11px] bg-muted/20 hover:bg-muted/50 transition-colors border-l-[3px]"
                                                style={{ borderLeftColor: color }}
                                            >
                                                <div className="flex items-center justify-between gap-1">
                                                    <span className="font-mono tabular-nums font-semibold text-[12px]">{trimTime(c.start_time)}</span>
                                                    <span className="text-[10px] text-muted-foreground">{c.current_bookings}/{c.max_capacity}</span>
                                                </div>
                                                <div className="truncate font-medium">{c.class_type_name}</div>
                                                <div className="text-[10px] text-muted-foreground truncate">
                                                    {c.instructor_name}
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

// ─── Vista MES: grid 7×6 con conteo de clases por día ─────────────────────────
function MonthView({
    monthAnchor, setMonthAnchor, onPickDate, categoryFilter, instructorFilter, classTypeFilter,
}: {
    monthAnchor: Date;
    setMonthAnchor: (d: Date) => void;
    onPickDate: (d: string) => void;
    categoryFilter: CategoryFilter;
    instructorFilter: string;
    classTypeFilter: string;
}) {
    const start = startOfMonth(monthAnchor);
    const end = endOfMonth(monthAnchor);
    const gridStart = startOfWeek(start, { weekStartsOn: 0 });
    const startStr = format(gridStart, 'yyyy-MM-dd');
    const endStr = format(addDays(gridStart, 41), 'yyyy-MM-dd'); // 6 semanas
    const { facilityIdParam } = useFacilityScope();

    const { data: classesRaw = [], isLoading } = useQuery<ClassRow[]>({
        queryKey: ['reservas-month-classes', startStr, endStr, facilityIdParam],
        queryFn: async () => {
            const facParam = facilityIdParam ? `&facility_id=${facilityIdParam}` : '';
            return (await api.get(`/classes?start=${startStr}&end=${endStr}${facParam}`)).data;
        },
    });

    const classes = applyFilters(classesRaw, categoryFilter, instructorFilter, classTypeFilter);

    const countByDay = useMemo(() => {
        const map: Record<string, { total: number; reserved: number; capacity: number; colors: Set<string> }> = {};
        for (const c of classes) {
            if (c.status === 'cancelled') continue;
            const key = c.date.slice(0, 10);
            if (!map[key]) map[key] = { total: 0, reserved: 0, capacity: 0, colors: new Set() };
            map[key].total += 1;
            map[key].reserved += Number(c.current_bookings);
            map[key].capacity += Number(c.max_capacity);
            map[key].colors.add(classAccent(c));
        }
        return map;
    }, [classes]);

    const cells = Array.from({ length: 42 }).map((_, i) => addDays(gridStart, i));
    const today = new Date();

    return (
        <div className="space-y-3">
            <Card>
                <CardContent className="pt-4 flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => setMonthAnchor(subMonths(monthAnchor, 1))}>
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setMonthAnchor(new Date())}>Hoy</Button>
                        <Button variant="outline" size="sm" onClick={() => setMonthAnchor(addMonths(monthAnchor, 1))}>
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>
                    <p className="text-sm text-muted-foreground capitalize">
                        {format(monthAnchor, "MMMM yyyy", { locale: es })}
                    </p>
                </CardContent>
            </Card>

            {isLoading ? (
                <Skeleton className="h-96 w-full" />
            ) : (
                <Card>
                    <CardContent className="p-3">
                        <div className="grid grid-cols-7 gap-0.5 sm:gap-1 mb-1">
                            {WEEK_DAY_LABELS.map((l) => (
                                <div key={l} className="text-center text-[10px] uppercase tracking-wider text-muted-foreground py-1">
                                    {l}
                                </div>
                            ))}
                        </div>
                        <div className="grid grid-cols-7 gap-0.5 sm:gap-1">
                            {cells.map((d) => {
                                const key = format(d, 'yyyy-MM-dd');
                                const info = countByDay[key];
                                const inMonth = isSameMonth(d, monthAnchor);
                                const isToday = isSameDay(d, today);
                                const occ = info && info.capacity > 0 ? Math.round((info.reserved / info.capacity) * 100) : 0;
                                return (
                                    <button
                                        key={key}
                                        onClick={() => onPickDate(key)}
                                        className={`min-h-[72px] p-1.5 rounded border text-left transition-colors ${
                                            !inMonth ? 'opacity-40' : ''
                                        } ${
                                            isToday ? 'border-bmb-gold bg-bmb-gold/5' :
                                            info && info.total > 0 ? 'bg-card hover:bg-muted/40' :
                                            'bg-muted/10 hover:bg-muted/30'
                                        }`}
                                    >
                                        <div className={`text-xs font-semibold ${isToday ? 'text-bmb-deepgold' : ''}`}>
                                            {format(d, 'd')}
                                        </div>
                                        {info && info.total > 0 && (
                                            <div className="mt-1">
                                                <div className="text-[10px] text-muted-foreground">{info.total} clase{info.total === 1 ? '' : 's'}</div>
                                                <div className={`text-[10px] font-medium ${
                                                    occ >= 80 ? 'text-emerald-600' :
                                                    occ < 30 ? 'text-amber-600' :
                                                    'text-muted-foreground'
                                                }`}>{occ}% ocup.</div>
                                                {/* Dots por tipo de clase ese día — máx 5 visibles */}
                                                <div className="flex gap-0.5 mt-1 flex-wrap">
                                                    {Array.from(info.colors).slice(0, 5).map((col) => (
                                                        <span key={col} className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: col }} />
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}

// ─── Filtros (categoría pills + instructor dropdown) ──────────────────────────
interface InstructorLite { id: string; display_name: string; is_active: boolean }

function FilterBar({
    category, setCategory, instructorId, setInstructorId,
    classTypeFilter, setClassTypeFilter,
}: {
    category: CategoryFilter; setCategory: (c: CategoryFilter) => void;
    instructorId: string; setInstructorId: (id: string) => void;
    classTypeFilter: string; setClassTypeFilter: (n: string) => void;
}) {
    const { data: instructors = [] } = useQuery<InstructorLite[]>({
        queryKey: ['reception-instructors-lite'],
        queryFn: async () => (await api.get('/instructors')).data,
    });
    const activeInstructors = instructors.filter((i) => i.is_active);

    // Filtro de sucursal (admin / recepción master). Usa el store global que ya
    // alimenta todas las consultas de clases vía useFacilityScope.
    const elevated = useIsElevated();
    const selectedFacilityId = useFacilityScopeStore((s) => s.selectedFacilityId);
    const setSelectedFacility = useFacilityScopeStore((s) => s.setSelected);
    const { data: facilities = [] } = useQuery<{ id: string; name: string }[]>({
        queryKey: ['facilities'],
        queryFn: async () => (await api.get('/facilities')).data,
        enabled: elevated,
    });

    const pill = (val: CategoryFilter, label: string) => (
        <button
            key={val}
            onClick={() => setCategory(val)}
            className={`px-3 py-1 rounded-sm text-xs font-medium transition-colors border ${
                category === val
                    ? 'bg-bmb-gold/15 border-bmb-gold/40 text-bmb-dark'
                    : 'bg-card border-muted hover:bg-muted/40 text-muted-foreground'
            }`}
        >
            {label}
        </button>
    );

    const hasFilter = category !== 'all' || !!instructorId || !!classTypeFilter;

    return (
        <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5">
                {pill('all', 'Todos')}
                {pill('reformer', 'Reformer')}
                {pill('multi', 'Multi')}
            </div>
            {elevated && facilities.length > 1 && (
                <Select
                    value={selectedFacilityId ?? 'all'}
                    onValueChange={(v) => setSelectedFacility(v === 'all' ? null : v)}
                >
                    <SelectTrigger className="h-8 text-xs w-44">
                        <SelectValue placeholder="Todas las sucursales" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Todas las sucursales</SelectItem>
                        {facilities.map((f) => (
                            <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            )}
            <Select value={instructorId || 'all'} onValueChange={(v) => setInstructorId(v === 'all' ? '' : v)}>
                <SelectTrigger className="h-8 text-xs w-48">
                    <SelectValue placeholder="Todos los instructores" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">Todos los instructores</SelectItem>
                    {activeInstructors.sort((a, b) => a.display_name.localeCompare(b.display_name)).map((i) => (
                        <SelectItem key={i.id} value={i.id}>{i.display_name}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
            {classTypeFilter && (
                <button
                    type="button"
                    onClick={() => setClassTypeFilter('')}
                    className="inline-flex items-center gap-1 text-xs bg-bmb-gold/15 border border-bmb-gold/40 rounded-sm px-2 py-1 hover:bg-bmb-gold/25 transition-colors"
                    title="Quitar filtro de clase"
                >
                    <span className="text-bmb-dark font-medium">{classTypeFilter}</span>
                    <X className="h-3 w-3 text-bmb-dark" />
                </button>
            )}
            {hasFilter && (
                <Button variant="ghost" size="sm" className="h-8 text-xs"
                    onClick={() => { setCategory('all'); setInstructorId(''); setClassTypeFilter(''); }}>
                    <X className="h-3 w-3 mr-1" />
                    Quitar filtros
                </Button>
            )}
        </div>
    );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function BookingsScreen({
    subtitle = 'Calendario de clases. Click en una clase para gestionar reservadas. Solo tu sucursal.',
}: { subtitle?: string } = {}) {
    const qc = useQueryClient();
    const [view, setView] = useState<'day' | 'week' | 'month'>('day');
    const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [weekStart, setWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 0 }));
    const [monthAnchor, setMonthAnchor] = useState(new Date());
    const [pickedClass, setPickedClass] = useState<ClassRow | null>(null);

    // Filtros globales (se aplican a las 3 vistas).
    const [category, setCategory] = useState<CategoryFilter>('all');
    const [instructorId, setInstructorId] = useState('');
    const [classTypeFilter, setClassTypeFilter] = useState('');

    const refetchAll = () => {
        qc.invalidateQueries({ queryKey: ['reservas-day-classes'] });
        qc.invalidateQueries({ queryKey: ['reservas-week-classes'] });
        qc.invalidateQueries({ queryKey: ['reservas-month-classes'] });
        qc.invalidateQueries({ queryKey: ['class-bookings'] });
    };

    const goToDay = (d: string) => {
        setDate(d);
        setView('day');
    };

    return (
        <div className="space-y-5">
            <div className="flex items-start justify-between flex-wrap gap-3">
                <div>
                    <h1 className="text-3xl font-heading font-bold">Reservas</h1>
                    <p className="text-muted-foreground text-sm">{subtitle}</p>
                </div>
                <AdminBookDialog defaultDate={date} onDone={refetchAll} />
            </div>

            <div className="flex items-center justify-between gap-3 flex-wrap">
                <Tabs value={view} onValueChange={(v) => setView(v as 'day' | 'week' | 'month')}>
                    <TabsList>
                        <TabsTrigger value="day"><Clock className="h-3 w-3 mr-1" />Día</TabsTrigger>
                        <TabsTrigger value="week"><CalendarDays className="h-3 w-3 mr-1" />Semana</TabsTrigger>
                        <TabsTrigger value="month"><UsersIcon className="h-3 w-3 mr-1" />Mes</TabsTrigger>
                    </TabsList>
                </Tabs>
                <FilterBar
                    category={category} setCategory={setCategory}
                    instructorId={instructorId} setInstructorId={setInstructorId}
                    classTypeFilter={classTypeFilter} setClassTypeFilter={setClassTypeFilter}
                />
            </div>

            {view === 'day' && (
                <DayView
                    date={date}
                    onPickDate={setDate}
                    onPickClass={setPickedClass}
                    categoryFilter={category}
                    instructorFilter={instructorId}
                    classTypeFilter={classTypeFilter}
                    setClassTypeFilter={setClassTypeFilter}
                />
            )}
            {view === 'week' && (
                <WeekView
                    weekStart={weekStart}
                    setWeekStart={setWeekStart}
                    onPickClass={setPickedClass}
                    onPickDate={goToDay}
                    categoryFilter={category}
                    instructorFilter={instructorId}
                    classTypeFilter={classTypeFilter}
                />
            )}
            {view === 'month' && (
                <MonthView
                    monthAnchor={monthAnchor}
                    setMonthAnchor={setMonthAnchor}
                    onPickDate={goToDay}
                    categoryFilter={category}
                    instructorFilter={instructorId}
                    classTypeFilter={classTypeFilter}
                />
            )}

            <ClassDetailDrawer
                classRow={pickedClass}
                onClose={() => setPickedClass(null)}
                onChanged={refetchAll}
            />
        </div>
    );
}
