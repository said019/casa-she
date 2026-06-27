import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell } from 'recharts';
import { Loader2, DollarSign, TrendingUp, CreditCard, Wallet, ChevronDown, ChevronRight } from 'lucide-react';
import api from '@/lib/api';
import { RECEPTION_ENABLED } from '@/config/features';
import { format, subDays } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';

interface FacilityOpt { id: string; name: string }

interface StaffRangeRow {
    user_id: string;
    display_name: string;
    public_memberships_count: number;
    public_memberships_amount: number;
    products_count: number;
    products_amount: number;
    commission_estimate: number;
}
interface SalesDetail {
    memberships: Array<{ payment_id: string; created_at: string; member_name: string; plan_name: string; amount: number; payment_method: string }>;
    products: Array<{ sale_id: string; created_at: string; total: number; items: Array<{ product_name: string; quantity: number; unit_price: number }> }>;
}

function StaffSalesRowItem({ row, startDate, endDate }: { row: StaffRangeRow; startDate: string; endDate: string }) {
    const [open, setOpen] = useState(false);
    const fmt = (val: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(val ?? 0);
    const { data: detail, isLoading } = useQuery<SalesDetail>({
        queryKey: ['staff-sales-detail', row.user_id, startDate, endDate],
        queryFn: async () => (await api.get(`/reports/staff-sales-detail?staffId=${row.user_id}&from=${startDate}&to=${endDate}`)).data,
        enabled: open,
    });
    return (
        <>
            <tr className="border-b cursor-pointer hover:bg-muted/40" onClick={() => setOpen((o) => !o)}>
                <td className="py-2 px-2">
                    <span className="inline-flex items-center gap-1 font-medium">
                        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        {row.display_name}
                    </span>
                </td>
                <td className="py-2 px-2 text-right">{row.public_memberships_count}</td>
                <td className="py-2 px-2 text-right">{fmt(row.public_memberships_amount)}</td>
                <td className="py-2 px-2 text-right text-muted-foreground">{row.products_count}</td>
                <td className="py-2 px-2 text-right text-muted-foreground">{fmt(row.products_amount)}</td>
                <td className="py-2 px-2 text-right font-semibold">{fmt(row.commission_estimate)}</td>
            </tr>
            {open && (
                <tr className="bg-muted/20">
                    <td colSpan={6} className="px-4 py-3">
                        {isLoading ? (
                            <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin" /></div>
                        ) : (
                            <div className="grid gap-4 md:grid-cols-2 text-sm">
                                <div>
                                    <p className="font-semibold mb-1">Membresías públicas</p>
                                    {detail?.memberships?.length ? detail.memberships.map((m) => (
                                        <div key={m.payment_id} className="flex justify-between gap-2 py-0.5">
                                            <span className="truncate">{m.created_at} · {m.member_name} · {m.plan_name}</span>
                                            <span className="tabular-nums">{fmt(m.amount)}</span>
                                        </div>
                                    )) : <p className="text-muted-foreground">Sin membresías en el periodo.</p>}
                                </div>
                                <div>
                                    <p className="font-semibold mb-1">Productos (no comisiona)</p>
                                    {detail?.products?.length ? detail.products.map((p) => (
                                        <div key={p.sale_id} className="flex justify-between gap-2 py-0.5">
                                            <span className="truncate">{p.created_at} · {p.items.map((i) => `${i.quantity}× ${i.product_name}`).join(', ') || 'Venta'}</span>
                                            <span className="tabular-nums">{fmt(p.total)}</span>
                                        </div>
                                    )) : <p className="text-muted-foreground">Sin productos en el periodo.</p>}
                                </div>
                            </div>
                        )}
                    </td>
                </tr>
            )}
        </>
    );
}

export default function ReportsRevenue() {
    const [period, setPeriod] = useState('30days');
    const [facility, setFacility] = useState('all');

    const getDateRange = () => {
        const end = new Date();
        let start = new Date();
        if (period === '7days') start = subDays(end, 7);
        if (period === '30days') start = subDays(end, 30);
        if (period === '90days') start = subDays(end, 90);
        return {
            startDate: format(start, 'yyyy-MM-dd'),
            endDate: format(end, 'yyyy-MM-dd')
        };
    };

    const { startDate, endDate } = getDateRange();

    const { data: facilities } = useQuery<FacilityOpt[]>({
        queryKey: ['facilities'],
        queryFn: async () => (await api.get('/facilities')).data,
    });

    const { data: revenueStats, isLoading } = useQuery({
        queryKey: ['reports-revenue', startDate, endDate, facility],
        queryFn: async () => (await api.get(`/reports/revenue?startDate=${startDate}&endDate=${endDate}&facilityId=${facility}`)).data
    });

    const { data: byType } = useQuery({
        queryKey: ['reports-revenue-by-type', startDate, endDate],
        queryFn: async () =>
            (await api.get(`/reports/revenue-by-type?startDate=${startDate}&endDate=${endDate}`)).data,
    });

    const { data: staffSales } = useQuery<{ rows: StaffRangeRow[] }>({
        queryKey: ['commissions-range', startDate, endDate],
        queryFn: async () => (await api.get(`/commissions/range?from=${startDate}&to=${endDate}`)).data,
    });

    const formatCurrency = (val: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(val);

    const methodLabels: Record<string, string> = {
        cash: 'Efectivo',
        card: 'Tarjeta',
        transfer: 'Transferencia',
        bank_transfer: 'Transferencia',
    };

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
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-heading font-bold">Reporte de Ingresos</h1>
                        <p className="text-muted-foreground">Desglose de ventas y métodos de pago.</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Select value={period} onValueChange={setPeriod}>
                            <SelectTrigger className="w-[180px]">
                                <SelectValue placeholder="Periodo" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="7days">Últimos 7 días</SelectItem>
                                <SelectItem value="30days">Últimos 30 días</SelectItem>
                                <SelectItem value="90days">Últimos 3 meses</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Ingresos Totales</CardTitle>
                            <DollarSign className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-xl sm:text-2xl font-bold tabular-nums truncate">{formatCurrency(revenueStats?.total || 0)}</div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Transacciones</CardTitle>
                            <TrendingUp className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">
                                {Array.isArray(revenueStats?.daily)
                                    ? revenueStats.daily.reduce((acc: number, curr: any) => acc + (parseInt(curr.count) || 0), 0)
                                    : 0}
                            </div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Ticket Promedio</CardTitle>
                            <CreditCard className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-xl sm:text-2xl font-bold tabular-nums truncate">
                                {formatCurrency(revenueStats?.avgTicketPerClass || 0)}
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Por clase comprada ({revenueStats?.classesPurchased || 0} clases)
                            </p>
                        </CardContent>
                    </Card>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                    <Card className="col-span-2">
                        <CardHeader>
                            <CardTitle>Tendencia de Ingresos</CardTitle>
                            <CardDescription>Ventas diarias</CardDescription>
                        </CardHeader>
                        <CardContent className="h-[300px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={revenueStats?.daily || []}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis
                                        dataKey="date"
                                        tickFormatter={(val) => format(new Date(val), 'dd MMM')}
                                    />
                                    <YAxis />
                                    <Tooltip
                                        labelFormatter={(val) => format(new Date(val), 'dd MMM yyyy')}
                                        formatter={(val: number) => [formatCurrency(val), 'Ventas']}
                                    />
                                    <Line type="monotone" dataKey="total" stroke="#8884d8" activeDot={{ r: 8 }} />
                                </LineChart>
                            </ResponsiveContainer>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Por Método de Pago</CardTitle>
                        </CardHeader>
                        <CardContent className="h-[300px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={(revenueStats?.byMethod || []).map((m: any) => ({ ...m, label: methodLabels[m.payment_method] || m.payment_method }))} layout="vertical">
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis type="number" hide />
                                    <YAxis dataKey="label" type="category" width={120} />
                                    <Tooltip formatter={(val: number) => [formatCurrency(val), 'Total']} />
                                    <Bar dataKey="total" fill="#82ca9d" radius={[0, 4, 4, 0]}>
                                        {revenueStats?.byMethod?.map((entry: any, index: number) => (
                                            <Cell key={`cell-${index}`} fill={['#0088FE', '#00C49F', '#FFBB28', '#FF8042'][index % 4]} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Por Plan</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                {revenueStats?.byPlan?.slice(0, 5).map((plan: any, i: number) => (
                                    <div key={i} className="flex items-center justify-between">
                                        <div>
                                            <p className="font-medium">{plan.name}</p>
                                            <p className="text-xs text-muted-foreground">{plan.count} {Number(plan.count) === 1 ? 'venta' : 'ventas'}</p>
                                        </div>
                                        <div className="font-bold">{formatCurrency(plan.total)}</div>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Ingresos por tipo</CardTitle>
                            <CardDescription>Membresías, productos y eventos</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-2">
                                {byType?.types?.map((t: any) => (
                                    <div key={t.type} className="flex items-center justify-between">
                                        <span className="text-sm">{t.type} <span className="text-muted-foreground">({t.count})</span></span>
                                        <span className="font-medium">{formatCurrency(Number(t.total))}</span>
                                    </div>
                                ))}
                                <div className="flex items-center justify-between border-t pt-2 font-semibold">
                                    <span>Total</span><span>{formatCurrency(Number(byType?.total || 0))}</span>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {RECEPTION_ENABLED && (
                    <Card className="col-span-2">
                        <CardHeader>
                            <CardTitle>Ventas por recepcionista</CardTitle>
                            <CardDescription>
                                Solo las membresías públicas generan comisión. La comisión mostrada es una estimación (% × membresías del periodo, sin aplicar el objetivo mensual);
                                el pago oficial, con objetivo, se gestiona en <a href="/admin/commissions" className="underline">Comisiones</a>.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b text-muted-foreground text-xs">
                                            <th className="py-2 px-2 text-left font-medium">Recepcionista</th>
                                            <th className="py-2 px-2 text-right font-medium"># Membresías</th>
                                            <th className="py-2 px-2 text-right font-medium">$ Membresías (comisiona)</th>
                                            <th className="py-2 px-2 text-right font-medium"># Productos</th>
                                            <th className="py-2 px-2 text-right font-medium">$ Productos</th>
                                            <th className="py-2 px-2 text-right font-medium">Comisión estimada</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(staffSales?.rows ?? []).filter((r) => r.public_memberships_count > 0 || r.products_count > 0).length === 0 ? (
                                            <tr><td colSpan={6} className="py-6 text-center text-muted-foreground">Sin ventas de recepción en el periodo.</td></tr>
                                        ) : (
                                            (staffSales?.rows ?? [])
                                                .filter((r) => r.public_memberships_count > 0 || r.products_count > 0)
                                                .map((r) => (
                                                    <StaffSalesRowItem key={r.user_id} row={r} startDate={startDate} endDate={endDate} />
                                                ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </CardContent>
                    </Card>
                    )}

                    {/* Mono-sede (Condesa): se elimin\u00f3 la comparativa de ingresos por sucursal. */}
                </div>
            </div>
        </AdminLayout>
    );
}
