import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { BookingToggleCard } from '@/components/admin/BookingToggleCard';
import { CajaStatusCard } from '@/components/admin/CajaStatusCard';
import { PlatformBadge } from '@/components/PlatformBadge';
import {
    CreditCard, Users, TrendingUp, AlertCircle, Loader2,
    Calendar, UserCheck, ChevronRight, Banknote, Wallet,
} from 'lucide-react';
import { toast } from 'sonner';
import api, { getErrorMessage } from '@/lib/api';
import { useFacilityScope } from '@/hooks/useFacilityScope';
import { useOpenCaja } from '@/hooks/useOpenCaja';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { effectivePermissions } from '@/lib/permissions';
import { useAuthStore } from '@/stores/authStore';

const mxn = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

interface UpcomingClass {
    id: string;
    start_time: string;
    end_time: string;
    class_type_name: string;
    instructor_name: string;
    current_bookings: number;
    max_capacity: number;
    status: string;
}

interface Dashboard {
    today: string;
    facility_id: string | null;
    cash_shift: {
        is_open: boolean;
        shift: { id: string; opening_float: string | number; opened_at: string } | null;
        totals: { cashSales: number; cashIn: number; cashOut: number } | null;
    };
    classes: {
        total: number;
        completed: number;
        upcoming: UpcomingClass[];
    };
    bookings: { total: number; checked_in: number; pending: number };
    revenue: {
        total: number;
        sales: number;
        memberships: number;
        by_method: Record<string, { sales: number; memberships: number; total: number }>;
    };
}

interface AgendaAttendee {
    booking_id: string;
    user_id: string;
    display_name: string;
    photo_url: string | null;
    status: string;
    checked_in_at: string | null;
    is_first_class: boolean | null;
    plan_name?: string | null;
    plan_color?: string | null;
    plan_is_internal?: boolean | null;
}
interface AgendaClass {
    id: string;
    start_time: string;
    end_time: string;
    class_type_name: string;
    class_type_color: string | null;
    instructor_name: string;
    current_bookings: number;
    max_capacity: number;
    status: string;
    attendees: AgendaAttendee[];
}
interface AgendaResponse {
    today: string;
    facility_id: string | null;
    classes: AgendaClass[];
}

const initials = (name: string) =>
    name?.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2) || '??';

const METHOD_LABELS: Record<string, string> = {
    cash: 'Efectivo',
    card: 'Tarjeta',
    transfer: 'Transferencia',
    online: 'En línea',
    bank_transfer: 'Transferencia',
};

// ─── Quick action: Open cash shift inline ─────────────────────────────────────
function OpenShiftInline({ onOpened }: { onOpened: () => void }) {
    const [opening, setOpening] = useState('0');
    // Mono-sede: useOpenCaja fija automáticamente la única sede (sin selector visible).
    const { openMutation, needsFacility } = useOpenCaja(onOpened);

    return (
        <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
                <Label className="text-xs">Fondo inicial</Label>
                <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={opening}
                    onChange={(e) => setOpening(e.target.value)}
                    className="h-9 w-32"
                />
            </div>
            <Button onClick={() => openMutation.mutate(Number(opening) || 0)} disabled={openMutation.isPending || needsFacility}>
                {openMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CreditCard className="h-4 w-4 mr-2" />}
                Abrir caja
            </Button>
        </div>
    );
}

// ─── Agenda de check-in (por hora, con la gente) ───────────────────────────────
function CheckinAgenda({ facilityIdParam }: { facilityIdParam: string | null }) {
    const qc = useQueryClient();
    const user = useAuthStore((s) => s.user);
    const perms = effectivePermissions(user?.permissions, user?.is_reception_master === true);
    const canCheckin = user?.role === 'admin' || user?.role === 'super_admin' || perms.checkin === true;

    const { data, isLoading } = useQuery<AgendaResponse>({
        queryKey: ['reception-checkin-agenda', facilityIdParam],
        queryFn: async () => {
            const q = facilityIdParam ? `?facility_id=${facilityIdParam}` : '';
            return (await api.get(`/reception/checkin-agenda${q}`)).data;
        },
        refetchInterval: 60_000,
        refetchOnWindowFocus: true,
    });

    const checkinMut = useMutation({
        mutationFn: async (bookingId: string) => api.post('/checkin/manual', { bookingId }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['reception-checkin-agenda'] });
            qc.invalidateQueries({ queryKey: ['reception-dashboard'] });
            toast.success('Check-in registrado');
        },
        onError: (e) => toast.error(getErrorMessage(e)),
    });

    // Agrupar clases por hora de inicio (HH).
    const groups = useMemo(() => {
        const map = new Map<string, AgendaClass[]>();
        for (const c of data?.classes ?? []) {
            const hour = c.start_time.slice(0, 2);
            const arr = map.get(hour) ?? [];
            arr.push(c);
            map.set(hour, arr);
        }
        return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    }, [data]);

    return (
        <Card>
            <CardContent className="pt-5">
                <div className="flex items-center justify-between mb-3">
                    <h3 className="font-medium flex items-center gap-2">
                        <UserCheck className="h-4 w-4" />
                        Check-in de hoy
                    </h3>
                    <Button asChild variant="ghost" size="sm">
                        <Link to="/reception/checkin">
                            Pantalla de check-in
                            <ChevronRight className="h-3 w-3 ml-1" />
                        </Link>
                    </Button>
                </div>

                {isLoading ? (
                    <Skeleton className="h-40" />
                ) : groups.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">No hay clases hoy.</p>
                ) : (
                    <div className="space-y-5">
                        {groups.map(([hour, classes]) => (
                            <div key={hour}>
                                <div className="flex items-center gap-2 mb-2">
                                    <span className="text-xs font-semibold tabular-nums text-muted-foreground rounded bg-muted px-2 py-0.5">
                                        {hour}:00
                                    </span>
                                    <span className="h-px flex-1 bg-border" />
                                </div>
                                <div className="space-y-3">
                                    {classes.map((c) => {
                                        const ci = c.attendees.filter((a) => a.status === 'checked_in').length;
                                        return (
                                            <div key={c.id} className="overflow-hidden rounded-lg border bg-card">
                                                <div className="flex items-center gap-2 border-b bg-muted/30 px-3 py-2">
                                                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: c.class_type_color || '#7E8579' }} />
                                                    <span className="text-sm font-semibold tabular-nums">{c.start_time}</span>
                                                    <span className="truncate text-sm font-medium">{c.class_type_name}</span>
                                                    <span className="hidden truncate text-xs text-muted-foreground sm:inline">· {c.instructor_name}</span>
                                                    <span className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground">{ci}/{c.attendees.length} check-in</span>
                                                </div>
                                                {c.attendees.length === 0 ? (
                                                    <p className="px-3 py-2 text-xs text-muted-foreground">Sin reservas.</p>
                                                ) : (
                                                    <ul className="divide-y">
                                                        {c.attendees.map((a) => {
                                                            const done = a.status === 'checked_in';
                                                            const pending = checkinMut.isPending && checkinMut.variables === a.booking_id;
                                                            return (
                                                                <li key={a.booking_id} className="flex items-center gap-3 px-3 py-2">
                                                                    <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                                                                        {a.photo_url ? <img src={a.photo_url} alt="" className="h-full w-full object-cover" /> : initials(a.display_name)}
                                                                    </div>
                                                                    <div className="min-w-0 flex-1">
                                                                        <div className="flex items-center gap-1.5">
                                                                            <p className="truncate text-sm font-medium">{a.display_name}</p>
                                                                            <PlatformBadge name={a.plan_color ? a.plan_name : null} color={a.plan_color} />
                                                                        </div>
                                                                        <p className="truncate text-[11px] text-muted-foreground">
                                                                            {a.plan_name || (a.status === 'waitlist' ? 'Lista de espera' : '—')}
                                                                            {a.is_first_class ? ' · 1ª vez' : ''}
                                                                        </p>
                                                                    </div>
                                                                    {done ? (
                                                                        <Badge className="shrink-0 bg-emerald-600 hover:bg-emerald-600">
                                                                            <UserCheck className="mr-1 h-3 w-3" />Asistió
                                                                        </Badge>
                                                                    ) : a.status === 'waitlist' ? (
                                                                        <Badge variant="outline" className="shrink-0">Espera</Badge>
                                                                    ) : canCheckin ? (
                                                                        <Button
                                                                            size="sm"
                                                                            className="h-8 shrink-0"
                                                                            disabled={checkinMut.isPending}
                                                                            onClick={() => checkinMut.mutate(a.booking_id)}
                                                                        >
                                                                            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Check-in'}
                                                                        </Button>
                                                                    ) : (
                                                                        <Badge variant="outline" className="shrink-0">Confirmada</Badge>
                                                                    )}
                                                                </li>
                                                            );
                                                        })}
                                                    </ul>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function DashboardScreen() {
    const qc = useQueryClient();
    const { facilityIdParam } = useFacilityScope();

    const { data, isLoading, error } = useQuery<Dashboard>({
        queryKey: ['reception-dashboard', facilityIdParam],
        queryFn: async () => {
            const q = facilityIdParam ? `?facility_id=${facilityIdParam}` : '';
            return (await api.get(`/reception/dashboard${q}`)).data;
        },
        refetchInterval: 60_000, // refresca cada 60s
        refetchOnWindowFocus: true,
    });

    const refetch = () => qc.invalidateQueries({ queryKey: ['reception-dashboard'] });

    if (isLoading) {
        return (
            <div className="space-y-6">
                <Skeleton className="h-8 w-64" />
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
                </div>
                <Skeleton className="h-64" />
            </div>
        );
    }

    if (error) {
        return (
            <Card>
                <CardContent className="py-8 flex items-center justify-center gap-2 text-destructive">
                    <AlertCircle className="h-4 w-4" />
                    {getErrorMessage(error)}
                </CardContent>
            </Card>
        );
    }

    if (!data) return null;

    const todayLabel = new Date(data.today + 'T00:00:00').toLocaleDateString('es-MX', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
    const checkinRate = data.bookings.total > 0
        ? Math.round((data.bookings.checked_in / data.bookings.total) * 100)
        : 0;

    const cashBalance = data.cash_shift.is_open && data.cash_shift.shift && data.cash_shift.totals
        ? Number(data.cash_shift.shift.opening_float) +
          data.cash_shift.totals.cashSales +
          data.cash_shift.totals.cashIn -
          data.cash_shift.totals.cashOut
        : 0;

    return (
        <div className="space-y-6">
            <BookingToggleCard />
            <div>
                <h1 className="text-3xl font-heading font-bold">Dashboard</h1>
                <p className="text-muted-foreground text-sm capitalize">{todayLabel}</p>
            </div>

            {/* Estado de caja — hero card */}
            <Card className={data.cash_shift.is_open ? 'border-emerald-200 bg-emerald-50/40' : 'border-amber-300 bg-amber-50/60'}>
                <CardContent className="pt-5 pb-5">
                    {data.cash_shift.is_open && data.cash_shift.shift ? (
                        <div className="flex items-center justify-between flex-wrap gap-3">
                            <div className="flex items-center gap-4">
                                <div className="h-12 w-12 rounded-full bg-emerald-100 flex items-center justify-center">
                                    <CreditCard className="h-6 w-6 text-emerald-700" />
                                </div>
                                <div>
                                    <p className="text-sm font-medium flex items-center gap-2">
                                        Caja abierta
                                        <Badge variant="outline" className="text-emerald-600 border-emerald-600">activa</Badge>
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        Abierta {new Date(data.cash_shift.shift.opened_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                                        {' · '}fondo inicial {mxn.format(Number(data.cash_shift.shift.opening_float))}
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-4">
                                <div className="text-right">
                                    <p className="text-xs text-muted-foreground">Saldo en caja</p>
                                    <p className="text-3xl font-semibold text-emerald-700">{mxn.format(cashBalance)}</p>
                                </div>
                                <Button asChild variant="outline">
                                    <Link to="/reception/caja">Detalles</Link>
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <div className="flex items-center justify-between flex-wrap gap-3">
                            <div className="flex items-center gap-4">
                                <div className="h-12 w-12 rounded-full bg-amber-100 flex items-center justify-center">
                                    <AlertCircle className="h-6 w-6 text-amber-700" />
                                </div>
                                <div>
                                    <p className="text-sm font-medium text-amber-900">No hay turno abierto</p>
                                    <p className="text-xs text-amber-800/80">Abre la caja para empezar a vender hoy.</p>
                                </div>
                            </div>
                            <OpenShiftInline onOpened={refetch} />
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Estado de cajas del equipo (solo recepción master / admin) */}
            <CajaStatusCard />

            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                            <Calendar className="h-4 w-4" />
                            Clases hoy
                        </div>
                        <p className="text-2xl sm:text-3xl font-bold tabular-nums truncate">{data.classes.total}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                            {data.classes.completed} completada{data.classes.completed === 1 ? '' : 's'}
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                            <Users className="h-4 w-4" />
                            Reservas
                        </div>
                        <p className="text-2xl sm:text-3xl font-bold tabular-nums truncate">{data.bookings.total}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                            {data.bookings.pending} pendiente{data.bookings.pending === 1 ? '' : 's'}
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                            <UserCheck className="h-4 w-4" />
                            Check-ins
                        </div>
                        <p className="text-2xl sm:text-3xl font-bold tabular-nums truncate">{data.bookings.checked_in}</p>
                        <p className={`text-xs mt-1 ${checkinRate >= 70 ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                            {data.bookings.total > 0 ? `${checkinRate}% asistencia` : 'sin reservas'}
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                            <TrendingUp className="h-4 w-4" />
                            Ingresos
                        </div>
                        <p className="text-xl sm:text-3xl font-bold tabular-nums truncate">{mxn.format(data.revenue.total)}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                            {mxn.format(data.revenue.sales)} pos · {mxn.format(data.revenue.memberships)} planes
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Desglose de ingresos por método */}
            {data.revenue.total > 0 && (
                <Card>
                    <CardContent className="pt-5">
                        <h3 className="font-medium mb-3 flex items-center gap-2">
                            <Wallet className="h-4 w-4" />
                            Ingresos por método de pago
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                            {['cash', 'card', 'transfer', 'online'].map((method) => {
                                const m = data.revenue.by_method[method] || { sales: 0, memberships: 0, total: 0 };
                                if (m.total === 0) return null;
                                return (
                                    <div key={method} className="p-3 rounded-md border bg-card">
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="text-xs text-muted-foreground">{METHOD_LABELS[method] ?? method}</span>
                                            {method === 'cash' && <Banknote className="h-3 w-3 text-muted-foreground" />}
                                        </div>
                                        <p className="text-xl font-semibold">{mxn.format(m.total)}</p>
                                        {m.sales > 0 && m.memberships > 0 && (
                                            <p className="text-[10px] text-muted-foreground mt-1">
                                                {mxn.format(m.sales)} pos + {mxn.format(m.memberships)} planes
                                            </p>
                                        )}
                                    </div>
                                );
                            })}
                            {/* "otros" si aparece */}
                            {Object.keys(data.revenue.by_method)
                                .filter((m) => !['cash', 'card', 'transfer', 'online'].includes(m))
                                .map((method) => {
                                    const m = data.revenue.by_method[method];
                                    return (
                                        <div key={method} className="p-3 rounded-md border bg-card">
                                            <div className="text-xs text-muted-foreground mb-1">{method}</div>
                                            <p className="text-xl font-semibold">{mxn.format(m.total)}</p>
                                        </div>
                                    );
                                })}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Check-in de hoy por hora — quién viene + check-in rápido */}
            <CheckinAgenda facilityIdParam={facilityIdParam} />

            {/* Acciones rápidas */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <Button asChild variant="outline" className="h-auto py-4">
                    <Link to="/reception/clientes" className="flex flex-col items-center gap-1">
                        <Users className="h-5 w-5" />
                        <span className="text-sm">Usuario nuevo</span>
                    </Link>
                </Button>
                <Button asChild variant="outline" className="h-auto py-4">
                    <Link to="/reception/reservas" className="flex flex-col items-center gap-1">
                        <Calendar className="h-5 w-5" />
                        <span className="text-sm">Reservar clase</span>
                    </Link>
                </Button>
                <Button asChild variant="outline" className="h-auto py-4">
                    <Link to="/reception/vender" className="flex flex-col items-center gap-1">
                        <CreditCard className="h-5 w-5" />
                        <span className="text-sm">POS</span>
                    </Link>
                </Button>
            </div>
        </div>
    );
}
