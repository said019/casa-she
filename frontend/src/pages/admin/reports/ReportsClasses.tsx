import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import api from '@/lib/api';
import { format, subDays } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';

export default function ReportsClasses() {
    const [period, setPeriod] = useState('30days');

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

    const { data: classesStats, isLoading } = useQuery({
        queryKey: ['reports-classes', startDate, endDate],
        queryFn: async () => (await api.get(`/reports/classes?startDate=${startDate}&endDate=${endDate}`)).data
    });

    const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

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
                        <h1 className="text-3xl font-heading font-bold">Reporte de Clases</h1>
                        <p className="text-muted-foreground">Ocupación, horarios populares y distribución.</p>
                    </div>
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

                <div className="grid gap-4 md:grid-cols-2">
                    {/* Day of Week Chart */}
                    <Card className="col-span-2">
                        <CardHeader>
                            <CardTitle>Ocupación por día de la semana</CardTitle>
                            <CardDescription>Promedio de alumnos por día</CardDescription>
                        </CardHeader>
                        <CardContent className="h-[300px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={classesStats?.byDayOfWeek || []}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis
                                        dataKey="day_of_week"
                                        tickFormatter={(val) => ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'][val]}
                                    />
                                    <YAxis />
                                    <Tooltip
                                        labelFormatter={(val) => ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'][val]}
                                        formatter={(val: number) => [Number(val).toFixed(1), 'Asistentes Avg']}
                                    />
                                    <Bar dataKey="avg_attendance" name="Asistencia Promedio" fill="#8884d8" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </CardContent>
                    </Card>

                    {/* Classes by Studio */}
                    {classesStats?.classesByStudio && classesStats.classesByStudio.length > 0 && (
                        <Card className="col-span-2">
                            <CardHeader>
                                <CardTitle>Clases por estudio</CardTitle>
                                <CardDescription>Desglose del período seleccionado</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="grid gap-3 sm:grid-cols-3">
                                    {classesStats.classesByStudio.map((s: { facilityId: string; name: string; count: number }) => (
                                        <div key={s.facilityId} className="flex items-center justify-between bg-muted/50 px-4 py-3 rounded-lg">
                                            <span className="text-sm font-medium text-muted-foreground">{s.name}</span>
                                            <span className="text-2xl font-semibold tabular-nums">{s.count}</span>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {/* Popular Times */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Horarios más populares</CardTitle>
                            <CardDescription>Top 5 horarios con mayor asistencia</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                {classesStats?.byTime?.length > 0 ? (
                                    classesStats.byTime.map((item: any, i: number) => (
                                        <div key={i} className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <span className="font-mono text-lg font-medium">{item.start_time.substring(0, 5)}</span>
                                                {i < 2 && <span className="text-xs bg-warning/10 text-warning-foreground px-2 py-0.5 rounded-full">🔥 Hot</span>}
                                            </div>
                                            <div className="text-sm font-medium">{Math.round(item.avg_attendance)} asistentes avg</div>
                                        </div>
                                    ))
                                ) : (
                                    <p className="text-sm text-muted-foreground">No hay datos suficientes.</p>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Class Type Distribution */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Desglose por Tipo de Clase</CardTitle>
                        </CardHeader>
                        <CardContent className="h-[300px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={classesStats?.byType || []}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={60}
                                        outerRadius={80}
                                        paddingAngle={5}
                                        dataKey="total_bookings"
                                        nameKey="name"
                                    >
                                        {classesStats?.byType?.map((entry: any, index: number) => (
                                            <Cell key={`cell-${index}`} fill={entry.color || COLORS[index % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip />
                                    <Legend />
                                </PieChart>
                            </ResponsiveContainer>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </AdminLayout>
    );
}
