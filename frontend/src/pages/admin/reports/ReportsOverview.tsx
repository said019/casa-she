import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Users, Calendar, TrendingUp, DollarSign, ArrowUpRight, ArrowDownRight, Download, Filter, CreditCard } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import api from '@/lib/api';
import { Skeleton } from '@/components/ui/skeleton';

function getDefaultDates() {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return {
        startDate: start.toISOString().split('T')[0],
        endDate: end.toISOString().split('T')[0],
    };
}

function exportToExcel(overview: any, startDate: string, endDate: string) {
    const rows = [
        ['Reporte General - Casa Shé'],
        [`Período: ${startDate} al ${endDate}`],
        [''],
        ['RESUMEN FINANCIERO'],
        ['Concepto', 'Monto'],
        ['Ingresos', overview.monthlyRevenue],
        ['Egresos', overview.monthlyExpenses],
        ['Utilidad Neta', overview.netProfit],
        ['Ticket promedio (por clase comprada)', overview.avgTicketPerClass || 0],
        ['Clases compradas en el período', overview.classesPurchased || 0],
        [''],
        ['ESTADÍSTICAS OPERATIVAS'],
        ['Métrica', 'Valor'],
        ['Miembros Activos', overview.activeMembers],
        ['Nuevos Miembros', overview.newMembers],
        ['Reservas', overview.monthlyBookings],
        ['Asistencia (%)', overview.attendanceRate],
        ['Clases Semanales', overview.weeklyClasses],
    ];

    if (overview.financialTrend?.length > 0) {
        rows.push([''], ['TENDENCIA MENSUAL']);
        rows.push(['Mes', 'Ingresos', 'Egresos', 'Utilidad']);
        overview.financialTrend.forEach((m: any) => {
            rows.push([m.label, m.revenue, m.expenses, m.profit]);
        });
    }

    const csvContent = rows.map(row =>
        row.map(cell => {
            const val = String(cell ?? '');
            return val.includes(',') ? `"${val}"` : val;
        }).join(',')
    ).join('\n');

    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `reporte-overview-${startDate}-a-${endDate}.csv`;
    link.click();
    URL.revokeObjectURL(url);
}

export default function ReportsOverview() {
    const defaults = getDefaultDates();
    const [startDate, setStartDate] = useState(defaults.startDate);
    const [endDate, setEndDate] = useState(defaults.endDate);

    const { data: overview, isLoading } = useQuery({
        queryKey: ['reports-overview', startDate, endDate],
        queryFn: async () => (await api.get('/reports/overview', { params: { startDate, endDate } })).data
    });

    const { data: profitByFacility } = useQuery<{ rows: { facility_id: string; facility_name: string; revenue: number; expenses: number; profit: number }[]; generalExpenses: number }>({
        queryKey: ['profit-by-facility', startDate, endDate],
        queryFn: async () => (await api.get('/reports/profit-by-facility', { params: { startDate, endDate } })).data
    });

    const formatCurrency = (val: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(val || 0);

    const setPreset = (days: number | 'month' | 'year') => {
        const now = new Date();
        if (days === 'month') {
            setStartDate(new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]);
            setEndDate(new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0]);
        } else if (days === 'year') {
            setStartDate(new Date(now.getFullYear(), 0, 1).toISOString().split('T')[0]);
            setEndDate(now.toISOString().split('T')[0]);
        } else {
            const start = new Date(now);
            start.setDate(start.getDate() - days);
            setStartDate(start.toISOString().split('T')[0]);
            setEndDate(now.toISOString().split('T')[0]);
        }
    };

    if (isLoading) {
        return (
            <AdminLayout>
                <div className="space-y-6">
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                        <Skeleton className="h-32" />
                        <Skeleton className="h-32" />
                        <Skeleton className="h-32" />
                    </div>
                    <Skeleton className="h-80" />
                </div>
            </AdminLayout>
        );
    }

    const netProfit = overview?.netProfit || 0;
    const isPositive = netProfit >= 0;

    return (
        <AdminLayout>
            <div className="space-y-6">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                        <h1 className="text-3xl font-heading font-bold">Dashboard General</h1>
                        <p className="text-muted-foreground">Visión general del rendimiento del estudio.</p>
                    </div>
                    {overview && (
                        <Button variant="outline" size="sm" className="gap-2" onClick={() => exportToExcel(overview, startDate, endDate)}>
                            <Download className="h-4 w-4" /> Descargar Excel
                        </Button>
                    )}
                </div>

                {/* Date Filters */}
                <Card>
                    <CardContent className="pt-4 pb-3">
                        <div className="flex flex-col sm:flex-row items-start sm:items-end gap-3">
                            <div className="flex items-center gap-2">
                                <Filter className="h-4 w-4 text-muted-foreground" />
                                <span className="text-sm font-medium">Período:</span>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                                <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => setPreset(7)}>7 días</Button>
                                <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => setPreset(15)}>15 días</Button>
                                <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => setPreset(30)}>30 días</Button>
                                <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => setPreset('month')}>Este mes</Button>
                                <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => setPreset(90)}>3 meses</Button>
                                <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => setPreset('year')}>Este año</Button>
                            </div>
                            <div className="flex items-center gap-2 ml-auto">
                                <div className="space-y-1">
                                    <Label className="text-xs">Desde</Label>
                                    <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-8 text-xs w-36" />
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-xs">Hasta</Label>
                                    <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-8 text-xs w-36" />
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Financial Summary */}
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Ingresos del Mes</CardTitle>
                            <ArrowUpRight className="h-4 w-4 text-emerald-600" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-xl sm:text-2xl font-bold tabular-nums truncate text-emerald-600">{formatCurrency(overview?.monthlyRevenue)}</div>
                            <p className="text-xs text-muted-foreground">
                                {overview?.monthlyBookings} reservas este mes
                            </p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Ticket Promedio</CardTitle>
                            <CreditCard className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-xl sm:text-2xl font-bold tabular-nums truncate">{formatCurrency(overview?.avgTicketPerClass || 0)}</div>
                            <p className="text-xs text-muted-foreground">
                                Por clase comprada ({overview?.classesPurchased || 0} clases)
                            </p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Egresos del Mes</CardTitle>
                            <ArrowDownRight className="h-4 w-4 text-red-500" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-xl sm:text-2xl font-bold tabular-nums truncate text-red-500">{formatCurrency(overview?.monthlyExpenses)}</div>
                            <p className="text-xs text-muted-foreground">
                                Gastos pagados este mes
                            </p>
                        </CardContent>
                    </Card>
                    <Card className={isPositive ? 'border-emerald-200 bg-emerald-50/50' : 'border-red-200 bg-red-50/50'}>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Utilidad Neta</CardTitle>
                            <DollarSign className={`h-4 w-4 ${isPositive ? 'text-emerald-600' : 'text-red-500'}`} />
                        </CardHeader>
                        <CardContent>
                            <div className={`text-xl sm:text-2xl font-bold tabular-nums truncate ${isPositive ? 'text-emerald-600' : 'text-red-500'}`}>
                                {formatCurrency(netProfit)}
                            </div>
                            <p className="text-xs text-muted-foreground">
                                {isPositive ? 'Ganancia' : 'Pérdida'} del mes actual
                            </p>
                        </CardContent>
                    </Card>
                </div>

                {/* Operational Stats */}
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Miembros Activos</CardTitle>
                            <Users className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{overview?.activeMembers}</div>
                            <p className="text-xs text-muted-foreground">Total de membresías activas</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Nuevos Miembros</CardTitle>
                            <TrendingUp className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{overview?.newMembers}</div>
                            <p className="text-xs text-muted-foreground">Registrados este mes</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Asistencia</CardTitle>
                            <TrendingUp className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{overview?.attendanceRate}%</div>
                            <p className="text-xs text-muted-foreground">Tasa de check-in vs reservas</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Clases Semanales</CardTitle>
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{overview?.weeklyClasses}</div>
                            <p className="text-xs text-muted-foreground">Programadas esta semana</p>
                        </CardContent>
                    </Card>
                </div>

                {/* Financial Trend Chart */}
                {overview?.financialTrend && overview.financialTrend.length > 0 && (
                    <Card>
                        <CardHeader>
                            <CardTitle>Ingresos vs Egresos</CardTitle>
                            <CardDescription>Comparativa de los últimos 6 meses</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <ResponsiveContainer width="100%" height={350}>
                                <BarChart data={overview.financialTrend} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                                    <XAxis dataKey="label" tick={{ fontSize: 13 }} />
                                    <YAxis tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 12 }} />
                                    <Tooltip
                                        formatter={(value: number, name: string) => [
                                            formatCurrency(value),
                                            name === 'revenue' ? 'Ingresos' : name === 'expenses' ? 'Egresos' : 'Utilidad',
                                        ]}
                                        contentStyle={{ borderRadius: 12, border: '1px solid #e5e5e5' }}
                                    />
                                    <Legend
                                        formatter={(value: string) =>
                                            value === 'revenue' ? 'Ingresos' : value === 'expenses' ? 'Egresos' : 'Utilidad'
                                        }
                                    />
                                    <Bar dataKey="revenue" fill="#10b981" radius={[4, 4, 0, 0]} name="revenue" />
                                    <Bar dataKey="expenses" fill="#ef4444" radius={[4, 4, 0, 0]} name="expenses" />
                                    <Bar dataKey="profit" fill="#8C8475" radius={[4, 4, 0, 0]} name="profit" />
                                </BarChart>
                            </ResponsiveContainer>
                        </CardContent>
                    </Card>
                )}

                {/* Utilidad por sucursal */}
                {profitByFacility?.rows && profitByFacility.rows.length > 0 && (
                    <Card>
                        <CardHeader>
                            <CardTitle>Utilidad por sucursal</CardTitle>
                            <CardDescription>Ingresos − egresos asignados, por local, en el período</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="grid gap-4 sm:grid-cols-2">
                                {profitByFacility.rows.map((s) => {
                                    const positive = s.profit >= 0;
                                    return (
                                        <div key={s.facility_id} className={`rounded-xl border p-4 ${positive ? 'border-emerald-200 bg-emerald-50/40' : 'border-red-200 bg-red-50/40'}`}>
                                            <p className="text-sm font-semibold">{s.facility_name.replace(/^Casa Shé\s*/i, '')}</p>
                                            <p className={`mt-1 text-xl sm:text-2xl font-bold tabular-nums truncate ${positive ? 'text-emerald-600' : 'text-red-500'}`}>{formatCurrency(s.profit)}</p>
                                            <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                                                <span>Ingresos: <span className="font-medium text-emerald-600">{formatCurrency(s.revenue)}</span></span>
                                                <span>Egresos: <span className="font-medium text-red-500">{formatCurrency(s.expenses)}</span></span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                            {profitByFacility.generalExpenses > 0 && (
                                <p className="mt-3 text-xs text-muted-foreground">
                                    * No incluye {formatCurrency(profitByFacility.generalExpenses)} de gastos generales sin asignar a una sucursal.
                                </p>
                            )}
                        </CardContent>
                    </Card>
                )}
            </div>
        </AdminLayout>
    );
}
