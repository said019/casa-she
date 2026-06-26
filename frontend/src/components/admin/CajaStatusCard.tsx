import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Wallet, CheckCircle2, CircleAlert, Loader2 } from 'lucide-react';
import api, { getErrorMessage } from '@/lib/api';
import { useIsElevated } from '@/hooks/useIsElevated';
import { useOpenCaja } from '@/hooks/useOpenCaja';
import { useAuthStore } from '@/stores/authStore';

/**
 * Estado de cajas del equipo de recepción: ¿quién ABRIÓ su caja y quién no?
 * Visible solo para admin y recepción MASTER (auto-gateado, igual que BookingToggleCard),
 * así que puede colocarse en cualquier dashboard sin riesgo.
 *
 * Muestra a TODO el equipo de recepción (no respeta el filtro de sucursal del header:
 * es una vista de supervisión, queremos ver ambas sucursales de un vistazo). Cada quien
 * se agrupa por la sucursal DONDE tiene la caja abierta; si no tiene caja, por su sucursal
 * asignada. Así una master que abre en Condesa aparece bajo Condesa aunque no tenga
 * sucursal asignada.
 */
interface CajaStaffStatus {
    user_id: string;
    display_name: string | null;
    is_reception_master: boolean;
    assigned_facility_id: string | null;
    assigned_facility_name: string | null;
    caja_open: boolean;
    shift_id: string | null;
    opened_at: string | null;
    opening_float: string | null;
    shift_facility_id: string | null;
    shift_facility_name: string | null;
}

const mxn = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

function initials(name: string | null): string {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function openedLabel(iso: string | null): string {
    if (!iso) return '';
    const d = new Date(iso);
    const today = new Date();
    const sameDay = d.getFullYear() === today.getFullYear()
        && d.getMonth() === today.getMonth()
        && d.getDate() === today.getDate();
    const time = d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
    if (sameDay) return `Abrió ${time}`;
    const date = d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
    return `Abrió ${date}, ${time}`;
}

export function CajaStatusCard() {
    const elevated = useIsElevated();
    const role = useAuthStore((s) => s.user?.role);
    const isAdminRole = role === 'admin' || role === 'super_admin';
    const qc = useQueryClient();

    // Cierre administrativo: admin cierra una caja olvidada de cualquiera (al efectivo esperado).
    const closeMut = useMutation({
        mutationFn: async (shiftId: string) => api.post(`/cash-shifts/${shiftId}/close`, { force: true }),
        onSuccess: () => {
            toast.success('Caja cerrada');
            qc.invalidateQueries({ queryKey: ['caja-staff-status'] });
            qc.invalidateQueries({ queryKey: ['cash-current'] });
        },
        onError: (e) => toast.error(getErrorMessage(e)),
    });

    const { data, isLoading } = useQuery<CajaStaffStatus[]>({
        queryKey: ['caja-staff-status'],
        queryFn: async () => (await api.get('/cash-shifts/staff-status')).data,
        enabled: elevated,
        refetchInterval: 60_000,
        staleTime: 30_000,
    });

    // Agrupar por la sucursal DONDE está abierta la caja (si no hay caja, por la asignada)
    // para leer "está operando bien" de un vistazo, por sucursal.
    const groups = useMemo(() => {
        const list = data ?? [];
        const map = new Map<string, { name: string; rows: CajaStaffStatus[] }>();
        for (const r of list) {
            const key = r.shift_facility_id ?? r.assigned_facility_id ?? '__none__';
            const name = r.shift_facility_name ?? r.assigned_facility_name ?? 'Sin sucursal asignada';
            if (!map.has(key)) map.set(key, { name, rows: [] });
            map.get(key)!.rows.push(r);
        }
        // Sucursales reales primero; "Sin sucursal asignada" al final.
        return Array.from(map.entries())
            .sort((a, b) => (a[0] === '__none__' ? 1 : 0) - (b[0] === '__none__' ? 1 : 0))
            .map(([, v]) => v);
    }, [data]);

    if (!elevated) return null;

    const total = data?.length ?? 0;
    const openCount = data?.filter((r) => r.caja_open).length ?? 0;
    const allOpen = total > 0 && openCount === total;

    return (
        <Card>
            <CardContent className="p-4 sm:p-5">
                <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                            <Wallet className="h-5 w-5" />
                        </span>
                        <div className="min-w-0">
                            <p className="text-sm font-semibold leading-tight">Estado de cajas</p>
                            <p className="text-xs text-muted-foreground">¿Quién abrió su caja hoy?</p>
                        </div>
                    </div>
                    {!isLoading && total > 0 && (
                        <span
                            className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums ${
                                allOpen
                                    ? 'bg-emerald-100 text-emerald-700'
                                    : 'bg-amber-100 text-amber-800'
                            }`}
                        >
                            {openCount}/{total} abiertas
                        </span>
                    )}
                </div>

                <AdminOpenCaja />

                {isLoading ? (
                    <div className="mt-4 space-y-2">
                        <Skeleton className="h-12 w-full" />
                        <Skeleton className="h-12 w-full" />
                    </div>
                ) : total === 0 ? (
                    <p className="mt-4 text-sm text-muted-foreground">
                        No hay personal de recepción para mostrar.
                    </p>
                ) : (
                    <div className="mt-4 space-y-4">
                        {groups.map((g) => {
                            const gOpen = g.rows.filter((r) => r.caja_open).length;
                            return (
                                <div key={g.name}>
                                    <div className="mb-2 flex items-center justify-between">
                                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                            {g.name}
                                        </p>
                                        <span className="text-xs text-muted-foreground tabular-nums">
                                            {gOpen}/{g.rows.length}
                                        </span>
                                    </div>
                                    <ul className="space-y-2">
                                        {g.rows.map((r) => (
                                            <li
                                                key={r.user_id}
                                                className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 ${
                                                    r.caja_open
                                                        ? 'border-emerald-200 bg-emerald-50/50'
                                                        : 'border-amber-200 bg-amber-50/40'
                                                }`}
                                            >
                                                <div className="flex items-center gap-3 min-w-0">
                                                    <span
                                                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                                                            r.caja_open
                                                                ? 'bg-emerald-100 text-emerald-700'
                                                                : 'bg-amber-100 text-amber-700'
                                                        }`}
                                                    >
                                                        {initials(r.display_name)}
                                                    </span>
                                                    <div className="min-w-0">
                                                        <p className="truncate text-sm font-medium">
                                                            {r.display_name ?? 'Sin nombre'}
                                                            {r.is_reception_master && (
                                                                <span className="ml-1.5 align-middle text-[10px] font-semibold uppercase tracking-wide text-amber-600">
                                                                    master
                                                                </span>
                                                            )}
                                                        </p>
                                                        <p className="truncate text-xs text-muted-foreground">
                                                            {r.caja_open
                                                                ? `${openedLabel(r.opened_at)} · fondo ${mxn.format(Number(r.opening_float ?? 0))}`
                                                                : 'Aún no abre su caja'}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="flex shrink-0 items-center gap-2">
                                                    {isAdminRole && r.caja_open && r.shift_id && (
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            className="h-7 px-2 text-xs text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                                                            disabled={closeMut.isPending}
                                                            onClick={() => {
                                                                if (window.confirm(`¿Cerrar la caja de ${r.display_name ?? 'esta persona'}? Se cierra al efectivo esperado (corte administrativo).`)) {
                                                                    closeMut.mutate(r.shift_id!);
                                                                }
                                                            }}
                                                        >
                                                            {closeMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Cerrar'}
                                                        </Button>
                                                    )}
                                                    <span
                                                        className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
                                                            r.caja_open
                                                                ? 'bg-emerald-100 text-emerald-700'
                                                                : 'bg-amber-100 text-amber-800'
                                                        }`}
                                                    >
                                                        {r.caja_open ? (
                                                            <>
                                                                <CheckCircle2 className="h-3.5 w-3.5" />
                                                                Abierta
                                                            </>
                                                        ) : (
                                                            <>
                                                                <CircleAlert className="h-3.5 w-3.5" />
                                                                Sin abrir
                                                            </>
                                                        )}
                                                    </span>
                                                </div>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            );
                        })}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

/**
 * Abrir mi caja (solo admin/super_admin). La recepción master ya tiene su flujo de apertura
 * en su propio dashboard, así que esto se muestra únicamente para admins. Reusa useOpenCaja.
 */
function AdminOpenCaja() {
    const user = useAuthStore((s) => s.user);
    const isAdminRole = user?.role === 'admin' || user?.role === 'super_admin';
    const [float, setFloat] = useState('0');
    const { facilities, facilityId, setFacilityId, openMutation, needsFacility } = useOpenCaja();
    const { data: current } = useQuery<{ shift: { id: string; opening_float: string } | null }>({
        queryKey: ['cash-current'],
        queryFn: async () => (await api.get('/cash-shifts/current')).data,
        enabled: isAdminRole,
    });

    if (!isAdminRole) return null;
    const openShift = current?.shift ?? null;

    return (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/40 p-3">
            {openShift ? (
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="flex items-center gap-2 font-medium text-emerald-700">
                        <CheckCircle2 className="h-4 w-4" /> Tu caja está abierta · fondo {mxn.format(Number(openShift.opening_float ?? 0))}
                    </span>
                    <Button asChild variant="outline" size="sm">
                        <Link to="/reception/caja">Operar / cerrar</Link>
                    </Button>
                </div>
            ) : (
                <div className="space-y-2">
                    <p className="text-sm font-medium">Abrir mi caja</p>
                    <div className="flex flex-wrap items-end gap-2">
                        <div className="space-y-1">
                            <span className="block text-xs text-muted-foreground">Sucursal</span>
                            <Select value={facilityId} onValueChange={setFacilityId}>
                                <SelectTrigger className="h-9 w-44"><SelectValue placeholder="Elige sucursal" /></SelectTrigger>
                                <SelectContent>
                                    {facilities.map((f) => (<SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1">
                            <span className="block text-xs text-muted-foreground">Fondo inicial</span>
                            <Input type="number" value={float} onChange={(e) => setFloat(e.target.value)} className="h-9 w-28" />
                        </div>
                        <Button className="h-9" disabled={needsFacility || openMutation.isPending} onClick={() => openMutation.mutate(Number(float) || 0)}>
                            {openMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Wallet className="h-4 w-4 mr-2" />} Abrir mi caja
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}
