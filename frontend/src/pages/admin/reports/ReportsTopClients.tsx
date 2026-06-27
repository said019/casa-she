import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import api from '@/lib/api';
import { format, subDays } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';

interface TopClient {
    id: string;
    display_name: string;
    email: string | null;
    phone: string | null;
    membership_spend: number;
    product_spend: number;
    total_spend: number;
    memberships_count: number;
    attended: number;
}

const COLORS = ['#B5512F', '#D9B66A', '#E6CB8C', '#B8902F', '#A87F28', '#E0C078', '#CDA855', '#D4AF61', '#BF9A40', '#B5512F'];

export default function ReportsTopClients() {
    const [period, setPeriod] = useState('30days');

    const getDateRange = () => {
        const end = new Date();
        let start = new Date();
        if (period === '7days') start = subDays(end, 7);
        if (period === '30days') start = subDays(end, 30);
        if (period === '90days') start = subDays(end, 90);
        return {
            startDate: format(start, 'yyyy-MM-dd'),
            endDate: format(end, 'yyyy-MM-dd'),
        };
    };

    const { startDate, endDate } = getDateRange();

    const { data, isLoading } = useQuery({
        queryKey: ['reports-top-clients', startDate, endDate],
        queryFn: async () =>
            (await api.get(`/reports/top-clients?startDate=${startDate}&endDate=${endDate}`)).data,
    });

    const formatCurrency = (val: number) =>
        new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(val || 0);

    const clients: TopClient[] = data?.clients || [];
    const chartData = clients.slice(0, 10).map((c) => ({
        name: c.display_name,
        total: Number(c.total_spend) || 0,
    }));

    if (isLoading) {
        return (
            <AdminLayout>
                <div className="space-y-4">
                    <Skeleton className="h-12 w-48" />
                    <Skeleton className="h-96 w-full" />
                </div>
            </AdminLayout>
        );
    }

    return (
        <AdminLayout>
            <div className="space-y-6">
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-heading font-bold">Top usuarios por valor</h1>
                        <p className="text-muted-foreground">
                            Valor total = membresías (plan) + productos. Top 100 ordenado por gasto.
                        </p>
                    </div>
                    <div className="space-y-1">
                        <Label className="text-xs">Periodo</Label>
                        <Select value={period} onValueChange={setPeriod}>
                            <SelectTrigger className="h-9 w-[180px]">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="7days">Últimos 7 días</SelectItem>
                                <SelectItem value="30days">Últimos 30 días</SelectItem>
                                <SelectItem value="90days">Últimos 3 meses</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                {chartData.length > 0 && (
                    <Card>
                        <CardHeader>
                            <CardTitle>Top 10 por valor total</CardTitle>
                            <CardDescription>Gasto acumulado en el periodo</CardDescription>
                        </CardHeader>
                        <CardContent className="h-[340px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={chartData} layout="vertical" margin={{ left: 20, right: 30 }}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis type="number" tickFormatter={(v) => formatCurrency(v)} hide />
                                    <YAxis dataKey="name" type="category" width={140} tick={{ fontSize: 12 }} />
                                    <Tooltip formatter={(val: number) => [formatCurrency(val), 'Valor total']} />
                                    <Bar dataKey="total" radius={[0, 4, 4, 0]}>
                                        {chartData.map((_, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </CardContent>
                    </Card>
                )}

                <Card>
                    <CardHeader>
                        <CardTitle>Usuarios</CardTitle>
                        <CardDescription>{clients.length} usuarios con actividad en el periodo</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b text-left">
                                        <th className="py-2 w-10">#</th>
                                        <th className="py-2">Usuario</th>
                                        <th className="py-2">Contacto</th>
                                        <th className="py-2 text-right">Valor total</th>
                                        <th className="py-2 text-center">Membresías</th>
                                        <th className="py-2 text-center">Asistencias</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {clients.map((c, i) => (
                                        <tr key={c.id} className="border-b last:border-0 hover:bg-muted/50">
                                            <td className="py-3 font-bold text-muted-foreground">{i + 1}</td>
                                            <td className="py-3 font-medium">{c.display_name}</td>
                                            <td className="py-3">
                                                <p className="text-xs">{c.email || '—'}</p>
                                                <p className="text-xs text-muted-foreground">{c.phone || ''}</p>
                                            </td>
                                            <td className="py-3 text-right font-bold">{formatCurrency(Number(c.total_spend))}</td>
                                            <td className="py-3 text-center">{c.memberships_count}</td>
                                            <td className="py-3 text-center">{c.attended}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        {clients.length === 0 && (
                            <div className="text-center py-12 text-muted-foreground">
                                No hay usuarios con actividad en este periodo.
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </AdminLayout>
    );
}
