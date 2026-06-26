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
import { Loader2, AlertCircle } from 'lucide-react';
import api, { getErrorMessage } from '@/lib/api';
import { subDays, format } from 'date-fns';

const mxn = (val: number | null | undefined) =>
    new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(val ?? 0);

function getDefaults() {
    const today = new Date();
    const from = subDays(today, 30);
    return {
        from: format(from, 'yyyy-MM-dd'),
        to: format(today, 'yyyy-MM-dd'),
    };
}

export default function SalesByStaff() {
    const defaults = getDefaults();
    const [from, setFrom] = useState(defaults.from);
    const [to, setTo] = useState(defaults.to);

    const { data: rows = [], isLoading, error } = useQuery<any[]>({
        queryKey: ['sales-by-staff', from, to],
        queryFn: async () => {
            const { data } = await api.get(`/reports/sales-by-staff?from=${from}&to=${to}`);
            return Array.isArray(data) ? data : [];
        },
    });

    return (
        <AdminLayout>
            <div className="space-y-6">
                <div>
                    <h1 className="text-3xl font-heading font-bold">Ventas por Staff</h1>
                    <p className="text-muted-foreground">Desglose de ventas de membresías y productos por colaborador.</p>
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
                                <TableHead>Colaborador</TableHead>
                                <TableHead className="text-right"># Membresías</TableHead>
                                <TableHead className="text-right">Monto Membresías</TableHead>
                                <TableHead className="text-right">Membresías que cuentan</TableHead>
                                <TableHead className="text-right"># Productos</TableHead>
                                <TableHead className="text-right">Monto Productos</TableHead>
                                <TableHead className="text-right font-semibold">Total</TableHead>
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
                                        No hay ventas registradas en este período.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                rows.map((row: any) => {
                                    const total = (row.memberships_amount ?? 0) + (row.products_amount ?? 0);
                                    return (
                                        <TableRow key={row.id}>
                                            <TableCell className="font-medium">{row.display_name ?? '—'}</TableCell>
                                            <TableCell className="text-right">{row.memberships_count ?? 0}</TableCell>
                                            <TableCell className="text-right">{mxn(row.memberships_amount)}</TableCell>
                                            <TableCell className="text-right">
                                                {row.public_memberships_count ?? 0} · {mxn(row.public_memberships_amount)}
                                            </TableCell>
                                            <TableCell className="text-right">{row.products_count ?? 0}</TableCell>
                                            <TableCell className="text-right">{mxn(row.products_amount)}</TableCell>
                                            <TableCell className="text-right font-bold">{mxn(total)}</TableCell>
                                        </TableRow>
                                    );
                                })
                            )}
                        </TableBody>
                    </Table>
                </div>
            </div>
        </AdminLayout>
    );
}
