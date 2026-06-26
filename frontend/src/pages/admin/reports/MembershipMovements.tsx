import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2, AlertCircle } from 'lucide-react';
import api, { getErrorMessage } from '@/lib/api';
import { subDays, format, parseISO, isValid } from 'date-fns';
import { es } from 'date-fns/locale';

function getDefaults() {
    const today = new Date();
    const from = subDays(today, 30);
    return {
        from: format(from, 'yyyy-MM-dd'),
        to: format(today, 'yyyy-MM-dd'),
    };
}

function formatDate(dateStr: string | null | undefined): string {
    if (!dateStr) return '—';
    try {
        const d = parseISO(dateStr);
        if (!isValid(d)) return '—';
        return format(d, 'dd/MM/yyyy', { locale: es });
    } catch {
        return '—';
    }
}

function StatusBadge({ status }: { status: string }) {
    const variants: Record<string, { label: string; className: string }> = {
        active: { label: 'Activa', className: 'text-emerald-600 border-emerald-600' },
        cancelled: { label: 'Cancelada', className: 'text-red-600 border-red-600' },
        expired: { label: 'Expirada', className: 'text-gray-500 border-gray-400' },
        pending: { label: 'Pendiente', className: 'text-amber-600 border-amber-600' },
    };
    const cfg = variants[status] ?? { label: status, className: '' };
    return (
        <Badge variant="outline" className={cfg.className}>
            {cfg.label}
        </Badge>
    );
}

export default function MembershipMovements() {
    const defaults = getDefaults();
    const [from, setFrom] = useState(defaults.from);
    const [to, setTo] = useState(defaults.to);

    const { data: rows = [], isLoading, error } = useQuery<any[]>({
        queryKey: ['membership-movements', from, to],
        queryFn: async () => {
            const { data } = await api.get(`/reports/membership-movements?from=${from}&to=${to}`);
            return Array.isArray(data) ? data : [];
        },
    });

    return (
        <AdminLayout>
            <div className="space-y-6">
                <div>
                    <h1 className="text-3xl font-heading font-bold">Movimientos de Membresías</h1>
                    <p className="text-muted-foreground">Altas, cancelaciones y cambios de membresías en el período.</p>
                </div>

                {/* Filters */}
                <Card>
                    <CardContent className="pt-4 pb-3">
                        <div className="flex flex-wrap items-end gap-4">
                            <div className="space-y-1">
                                <Label className="text-xs">Desde</Label>
                                <Input
                                    type="date"
                                    value={from}
                                    onChange={(e) => setFrom(e.target.value)}
                                    className="h-8 text-xs w-36"
                                />
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs">Hasta</Label>
                                <Input
                                    type="date"
                                    value={to}
                                    onChange={(e) => setTo(e.target.value)}
                                    className="h-8 text-xs w-36"
                                />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Table */}
                <div className="border rounded-md overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Miembro</TableHead>
                                <TableHead>Plan</TableHead>
                                <TableHead>Estado</TableHead>
                                <TableHead>Inicio</TableHead>
                                <TableHead>Fin</TableHead>
                                <TableHead>Activada el</TableHead>
                                <TableHead>Activada por</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableRow>
                                    <TableCell colSpan={7} className="text-center py-8">
                                        <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                                    </TableCell>
                                </TableRow>
                            ) : error ? (
                                <TableRow>
                                    <TableCell colSpan={7} className="text-center py-8 text-destructive">
                                        <div className="flex items-center justify-center gap-2">
                                            <AlertCircle className="h-4 w-4" />
                                            {getErrorMessage(error)}
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ) : rows.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                                        No hay movimientos en este período.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                rows.map((row: any) => (
                                    <TableRow key={row.id}>
                                        <TableCell className="font-medium">
                                            {typeof row.member === 'object' && row.member !== null
                                                ? row.member.display_name ?? row.member.name ?? '—'
                                                : row.member ?? '—'}
                                        </TableCell>
                                        <TableCell>
                                            {typeof row.plan === 'object' && row.plan !== null
                                                ? row.plan.name ?? '—'
                                                : row.plan ?? '—'}
                                        </TableCell>
                                        <TableCell>
                                            <StatusBadge status={row.status ?? ''} />
                                        </TableCell>
                                        <TableCell>{formatDate(row.start_date)}</TableCell>
                                        <TableCell>{formatDate(row.end_date)}</TableCell>
                                        <TableCell>{formatDate(row.activated_at)}</TableCell>
                                        <TableCell>
                                            {typeof row.activated_by === 'object' && row.activated_by !== null
                                                ? row.activated_by.display_name ?? row.activated_by.name ?? '—'
                                                : row.activated_by ?? '—'}
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>
            </div>
        </AdminLayout>
    );
}
