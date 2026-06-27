import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Loader2, AlertCircle } from 'lucide-react';
import api, { getErrorMessage } from '@/lib/api';
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

export default function CashShiftsList() {
    const navigate = useNavigate();

    const today = new Date().toISOString().split('T')[0];
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const [facilityId, setFacilityId] = useState<string>('all');
    const [status, setStatus] = useState<string>('all');
    const [from, setFrom] = useState(thirtyDaysAgo);
    const [to, setTo] = useState(today);

    // Fetch facilities for filter
    const { data: facilities = [] } = useQuery<{ id: string; name: string }[]>({
        queryKey: ['facilities'],
        queryFn: async () => {
            const { data } = await api.get('/facilities');
            return Array.isArray(data) ? data : [];
        },
    });

    // Build query params
    const filters = { facilityId, status, from, to };

    const { data: shifts = [], isLoading, error } = useQuery<any[]>({
        queryKey: ['admin-cash-shifts', filters],
        queryFn: async () => {
            const params = new URLSearchParams();
            if (facilityId !== 'all') params.set('facility_id', facilityId);
            if (status !== 'all') params.set('status', status);
            if (from) params.set('from', from);
            if (to) params.set('to', to);
            const { data } = await api.get(`/cash-shifts?${params.toString()}`);
            return Array.isArray(data) ? data : [];
        },
    });

    const facilityMap = new Map(facilities.map((f) => [f.id, f.name]));

    return (
        <AdminLayout>
            <div className="space-y-6">
                <div>
                    <h1 className="font-heading text-3xl font-bold text-[#2E1B22]">Cortes de Caja</h1>
                    <p className="text-[#6B554D]">Historial de aperturas y cierres de caja.</p>
                </div>

                {/* Filters */}
                <div className="rounded-[1.5rem] border border-[#D6D5C2]/70 bg-white p-5 shadow-[0_20px_58px_-52px_rgba(51,42,34,0.5)]">
                    <div className="flex flex-wrap items-end gap-4">
                        {/* Status */}
                        <div className="space-y-1 min-w-[150px]">
                            <Label className="text-xs text-[#6B554D]">Estado</Label>
                            <Select value={status} onValueChange={setStatus}>
                                <SelectTrigger className="h-8 text-xs">
                                    <SelectValue placeholder="Todos" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Todos</SelectItem>
                                    <SelectItem value="abierto">Abierto</SelectItem>
                                    <SelectItem value="cerrado">Cerrado</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Date range */}
                        <div className="space-y-1">
                            <Label className="text-xs text-[#6B554D]">Desde</Label>
                            <Input
                                type="date"
                                value={from}
                                onChange={(e) => setFrom(e.target.value)}
                                className="h-8 text-xs w-36"
                            />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs text-[#6B554D]">Hasta</Label>
                            <Input
                                type="date"
                                value={to}
                                onChange={(e) => setTo(e.target.value)}
                                className="h-8 text-xs w-36"
                            />
                        </div>
                    </div>
                </div>

                {/* Shifts list — cards (mobile-first) */}
                {isLoading ? (
                    <div className="flex justify-center py-12">
                        <Loader2 className="h-6 w-6 animate-spin text-[#AE4836]" />
                    </div>
                ) : error ? (
                    <div className="rounded-[1.5rem] border border-[#D6D5C2]/70 bg-white p-8 text-center text-destructive shadow-[0_20px_58px_-52px_rgba(51,42,34,0.5)]">
                        <div className="flex items-center justify-center gap-2">
                            <AlertCircle className="h-4 w-4" />
                            {getErrorMessage(error)}
                        </div>
                    </div>
                ) : shifts.length === 0 ? (
                    <div className="rounded-[1.5rem] border border-[#D6D5C2]/70 bg-white p-8 text-center text-[#6B554D] shadow-[0_20px_58px_-52px_rgba(51,42,34,0.5)]">
                        No hay cortes de caja en este período.
                    </div>
                ) : (
                    <div className="space-y-3">
                        {shifts.map((shift: any) => (
                            <button
                                key={shift.id}
                                type="button"
                                onClick={() => navigate(`/admin/cash-shifts/${shift.id}`)}
                                className="block w-full rounded-[1.5rem] border border-[#D6D5C2]/70 bg-white p-5 text-left shadow-[0_20px_58px_-52px_rgba(51,42,34,0.5)] transition hover:border-[#AE4836]/40 hover:shadow-[0_24px_60px_-46px_rgba(51,42,34,0.55)]"
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-semibold text-[#2E1B22]">
                                            {facilityMap.get(shift.facility_id) ?? shift.facility_id ?? '—'}
                                        </p>
                                        <p className="mt-0.5 text-xs text-[#6B554D]">
                                            {formatDate(shift.opened_at)}
                                            {' → '}
                                            {formatDate(shift.closed_at)}
                                        </p>
                                    </div>
                                    <StatusBadge status={shift.status} />
                                </div>

                                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                                    <div className="rounded-xl bg-[#F6F0E4]/70 px-3 py-2">
                                        <p className="text-[11px] uppercase tracking-wide text-[#6B554D]">Fondo inicial</p>
                                        <p className="font-semibold tabular-nums text-[#2E1B22]">{mxn(shift.opening_float)}</p>
                                    </div>
                                    <div className="rounded-xl bg-[#F6F0E4]/70 px-3 py-2">
                                        <p className="text-[11px] uppercase tracking-wide text-[#6B554D]">Esperado</p>
                                        <p className="font-semibold tabular-nums text-[#2E1B22]">{mxn(shift.expected_cash)}</p>
                                    </div>
                                    <div className="rounded-xl bg-[#F6F0E4]/70 px-3 py-2">
                                        <p className="text-[11px] uppercase tracking-wide text-[#6B554D]">Contado</p>
                                        <p className="font-semibold tabular-nums text-[#2E1B22]">{mxn(shift.counted_cash)}</p>
                                    </div>
                                    <div className="rounded-xl bg-[#F6F0E4]/70 px-3 py-2">
                                        <p className="text-[11px] uppercase tracking-wide text-[#6B554D]">Diferencia</p>
                                        <p className={`font-semibold tabular-nums ${diffColor(shift.difference)}`}>
                                            {mxn(shift.difference)}
                                        </p>
                                    </div>
                                </div>
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </AdminLayout>
    );
}
