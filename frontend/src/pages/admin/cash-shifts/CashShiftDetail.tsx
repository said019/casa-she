import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { Button } from '@/components/ui/button';
import { Loader2, AlertCircle, ArrowLeft } from 'lucide-react';
import api, { getErrorMessage } from '@/lib/api';
import { getPaymentMethodLabel } from '@/lib/paymentLabels';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

const mxn = (val: number | null | undefined) =>
    new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(val ?? 0);

function diffColor(diff: number | null | undefined) {
    const v = diff ?? 0;
    if (v === 0) return 'text-emerald-600';
    if (v > 0) return 'text-amber-600';
    return 'text-red-600';
}

function formatDate(dateStr: string | null | undefined) {
    if (!dateStr) return '—';
    try {
        return format(new Date(dateStr), "dd/MM/yyyy HH:mm", { locale: es });
    } catch {
        return dateStr;
    }
}

function StatusBadge({ status }: { status: string }) {
    if (status === 'abierto') {
        return (
            <span className="rounded-full px-2.5 py-1 text-xs font-semibold bg-emerald-100 text-emerald-700">
                Abierto
            </span>
        );
    }
    return (
        <span className="rounded-full px-2.5 py-1 text-xs font-semibold bg-amber-100 text-amber-800">
            Cerrado
        </span>
    );
}

export default function CashShiftDetail() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();

    const { data, isLoading, error } = useQuery<any>({
        queryKey: ['admin-cash-shift', id],
        queryFn: async () => {
            const { data } = await api.get(`/cash-shifts/${id}`);
            return data;
        },
        enabled: !!id,
    });

    if (isLoading) {
        return (
            <AdminLayout>
                <div className="flex items-center justify-center py-24">
                    <Loader2 className="h-8 w-8 animate-spin" />
                </div>
            </AdminLayout>
        );
    }

    if (error) {
        return (
            <AdminLayout>
                <div className="flex flex-col items-center justify-center gap-4 py-24 text-destructive">
                    <AlertCircle className="h-8 w-8" />
                    <p>{getErrorMessage(error)}</p>
                    <Button variant="outline" onClick={() => navigate('/admin/cash-shifts')}>
                        <ArrowLeft className="mr-2 h-4 w-4" /> Volver
                    </Button>
                </div>
            </AdminLayout>
        );
    }

    const shift = data?.shift ?? {};
    const totals = data?.totals ?? {};
    const movements: any[] = Array.isArray(data?.movements) ? data.movements : [];
    const byMethod: any[] = Array.isArray(totals.byMethod) ? totals.byMethod : [];
    const bySeller: any[] = Array.isArray(data?.bySeller) ? data.bySeller : [];
    // Agrupar el cobrado por recepcionista (cada una con sus métodos y su total) —
    // clave cuando 2 recepcionistas comparten la misma caja en la sucursal.
    const sellerGroups = Object.values(
        bySeller.reduce((acc: Record<string, any>, r: any) => {
            const key = r.seller ?? '—';
            (acc[key] ||= { seller: key, rows: [] as any[], total: 0 });
            acc[key].rows.push(r);
            acc[key].total += Number(r.total ?? 0);
            return acc;
        }, {})
    ) as any[];

    return (
        <AdminLayout>
            <div className="space-y-6">
                {/* Header */}
                <div className="flex items-center gap-4">
                    <Button variant="outline" size="icon" onClick={() => navigate('/admin/cash-shifts')}>
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <div>
                        <h1 className="font-heading text-3xl font-bold text-[#2E1B22]">Detalle de Corte</h1>
                        <p className="text-[#6B554D]">Información completa del turno de caja.</p>
                    </div>
                </div>

                {/* Summary — hero panel */}
                <div className="relative overflow-hidden rounded-[1.75rem] border border-[#D6D5C2]/70 bg-gradient-to-br from-[#F6F0E4] via-[#F7ECE0] to-[#F1E2D2] p-5 sm:p-6 shadow-[0_24px_60px_-46px_rgba(51,42,34,0.55)]">
                    <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-[#2E1B22]">Resumen del Turno</p>
                        <StatusBadge status={shift.status} />
                    </div>
                    <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                        <div className="space-y-1">
                            <p className="text-xs uppercase tracking-wide text-[#6B554D]">Apertura</p>
                            <p className="font-medium text-[#2E1B22]">{formatDate(shift.opened_at)}</p>
                            <p className="text-xs text-[#6B554D]">Por: {shift.opened_by_name ?? '—'}</p>
                        </div>
                        <div className="space-y-1">
                            <p className="text-xs uppercase tracking-wide text-[#6B554D]">Cierre</p>
                            <p className="font-medium text-[#2E1B22]">{formatDate(shift.closed_at)}</p>
                            <p className="text-xs text-[#6B554D]">Por: {shift.closed_by_name ?? '—'}</p>
                        </div>
                        <div className="space-y-1">
                            <p className="text-xs uppercase tracking-wide text-[#6B554D]">Fondo inicial</p>
                            <p className="text-xl sm:text-2xl font-bold tabular-nums truncate text-[#2E1B22]">{mxn(shift.opening_float)}</p>
                        </div>
                        <div className="space-y-1">
                            <p className="text-xs uppercase tracking-wide text-[#6B554D]">Efectivo esperado</p>
                            <p className="text-xl sm:text-2xl font-bold tabular-nums truncate text-[#2E1B22]">{mxn(shift.expected_cash)}</p>
                        </div>
                        <div className="space-y-1">
                            <p className="text-xs uppercase tracking-wide text-[#6B554D]">Efectivo contado</p>
                            <p className="text-xl sm:text-2xl font-bold tabular-nums truncate text-[#2E1B22]">{mxn(shift.counted_cash)}</p>
                        </div>
                        <div className="space-y-1">
                            <p className="text-xs uppercase tracking-wide text-[#6B554D]">Diferencia</p>
                            <p className={`text-xl sm:text-2xl font-bold tabular-nums truncate ${diffColor(shift.difference)}`}>
                                {mxn(shift.difference)}
                            </p>
                        </div>
                    </div>
                </div>

                {/* By payment method */}
                {byMethod.length > 0 && (
                    <div className="rounded-[1.5rem] border border-[#D6D5C2]/70 bg-white p-5 shadow-[0_20px_58px_-52px_rgba(51,42,34,0.5)]">
                        <p className="text-sm font-semibold text-[#2E1B22]">Ventas por Método de Pago</p>
                        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            {byMethod.map((item: any, idx: number) => (
                                <div key={idx} className="flex items-center justify-between rounded-xl bg-[#F6F0E4]/70 px-3 py-2">
                                    <span className="text-sm font-medium text-[#6B554D]">{getPaymentMethodLabel(item.method)}</span>
                                    <span className="font-semibold tabular-nums text-[#2E1B22]">{mxn(item.total)}</span>
                                </div>
                            ))}
                        </div>
                        {(totals.cashSales != null || totals.cashIn != null || totals.cashOut != null) && (
                            <div className="mt-4 grid gap-3 sm:grid-cols-3 border-t border-[#D6D5C2]/60 pt-4">
                                <div className="space-y-1 text-center">
                                    <p className="text-xs text-[#6B554D]">Ventas en Efectivo</p>
                                    <p className="font-bold tabular-nums text-emerald-600">{mxn(totals.cashSales)}</p>
                                </div>
                                <div className="space-y-1 text-center">
                                    <p className="text-xs text-[#6B554D]">Entradas de Efectivo</p>
                                    <p className="font-bold tabular-nums text-emerald-600">{mxn(totals.cashIn)}</p>
                                </div>
                                <div className="space-y-1 text-center">
                                    <p className="text-xs text-[#6B554D]">Salidas de Efectivo</p>
                                    <p className="font-bold tabular-nums text-red-600">{mxn(totals.cashOut)}</p>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Cobrado por recepcionista — esencial cuando 2+ comparten la caja */}
                {sellerGroups.length > 0 && (
                    <div className="rounded-[1.5rem] border border-[#D6D5C2]/70 bg-white p-5 shadow-[0_20px_58px_-52px_rgba(51,42,34,0.5)]">
                        <p className="text-sm font-semibold text-[#2E1B22]">Cobrado por recepcionista</p>
                        <p className="mt-1 text-sm text-[#6B554D]">
                            Quién cobró qué en este turno (la caja física es compartida; el conteo del corte es uno solo).
                        </p>
                        <div className="mt-4 space-y-3">
                            {sellerGroups.map((g: any, gi: number) => (
                                <div key={gi} className="rounded-xl border border-[#D6D5C2]/50 p-3">
                                    <div className="mb-2 flex items-center justify-between">
                                        <span className="font-semibold text-[#2E1B22]">{g.seller}</span>
                                        <span className="font-bold tabular-nums text-[#2E1B22]">{mxn(g.total)}</span>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {g.rows.map((r: any, ri: number) => (
                                            <span key={ri} className="rounded-md bg-[#F6F0E4] px-2 py-1 text-xs text-[#6B554D]">
                                                <span>{getPaymentMethodLabel(r.method)}</span>: <span className="tabular-nums text-[#2E1B22]">{mxn(r.total)}</span> ({r.n})
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Movimientos — tarjetas (mobile-first) */}
                <div className="rounded-[1.5rem] border border-[#D6D5C2]/70 bg-white p-5 shadow-[0_20px_58px_-52px_rgba(51,42,34,0.5)]">
                    <p className="text-sm font-semibold text-[#2E1B22]">Movimientos</p>
                    {movements.length === 0 ? (
                        <p className="mt-3 text-sm text-[#6B554D]">Sin movimientos registrados.</p>
                    ) : (
                        <div className="mt-3 space-y-2">
                            {movements.map((mov: any, idx: number) => (
                                <div key={idx} className="rounded-xl border border-[#D6D5C2]/50 bg-[#F6F0E4]/40 p-3">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2">
                                                {mov.type === 'entrada' || mov.type === 'cash_in' ? (
                                                    <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold bg-emerald-100 text-emerald-700">
                                                        Entrada
                                                    </span>
                                                ) : (
                                                    <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold bg-rose-100 text-rose-700">
                                                        Salida
                                                    </span>
                                                )}
                                                <span className="truncate text-sm text-[#2E1B22]">{mov.reason ?? '—'}</span>
                                            </div>
                                            <p className="mt-0.5 truncate text-xs text-[#6B554D]">
                                                {mov.created_by_name ?? '—'}
                                                {' · '}
                                                {formatDate(mov.created_at)}
                                            </p>
                                        </div>
                                        <span className="shrink-0 font-semibold tabular-nums text-[#2E1B22]">{mxn(mov.amount)}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </AdminLayout>
    );
}
