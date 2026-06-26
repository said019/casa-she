import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import api from '@/lib/api';
import { format, subDays } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';

interface Facility { id: string; name: string }

export default function ReportsInstructors() {
    const [period, setPeriod] = useState('30days');
    const [facilityId, setFacilityId] = useState<string>('all');

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

    const { data: facilities = [] } = useQuery<Facility[]>({
        queryKey: ['facilities'],
        queryFn: async () => {
            const { data } = await api.get('/facilities');
            return Array.isArray(data) ? data : [];
        },
    });

    const facilityParam = facilityId === 'all' ? '' : `&facility_id=${facilityId}`;

    const { data: instructorStats, isLoading } = useQuery({
        queryKey: ['reports-instructors', startDate, endDate, facilityId],
        queryFn: async () =>
            (await api.get(`/reports/instructors?startDate=${startDate}&endDate=${endDate}${facilityParam}`)).data,
    });

    const { data: ranking } = useQuery({
        queryKey: ['reports-coach-ranking', startDate, endDate, facilityId],
        queryFn: async () =>
            (await api.get(`/reports/coach-ranking?startDate=${startDate}&endDate=${endDate}&facilityId=${facilityId}`)).data,
    });

    const formatCurrency = (v: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(v);

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
                        <h1 className="text-3xl font-heading font-bold">Rendimiento de Instructores</h1>
                        <p className="text-muted-foreground">
                            Comparativa de asistencia y ocupación. Las reseñas son del coach (no se filtran por sucursal).
                        </p>
                    </div>
                    <div className="flex flex-wrap items-end gap-3">
                        <div className="space-y-1">
                            <Label className="text-xs">Periodo</Label>
                            <Select value={period} onValueChange={setPeriod}>
                                <SelectTrigger className="h-9 w-[160px]">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="7days">Últimos 7 días</SelectItem>
                                    <SelectItem value="30days">Últimos 30 días</SelectItem>
                                    <SelectItem value="90days">Últimos 3 meses</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs">Sucursal</Label>
                            <Select value={facilityId} onValueChange={setFacilityId}>
                                <SelectTrigger className="h-9 w-[200px]">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Todas las sucursales</SelectItem>
                                    {facilities.map((f) => (
                                        <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </div>

                <Tabs defaultValue="desempeno" className="space-y-4">
                    <TabsList>
                        <TabsTrigger value="desempeno">Desempeño</TabsTrigger>
                        <TabsTrigger value="ranking">Ranking</TabsTrigger>
                    </TabsList>
                    <TabsContent value="desempeno">
                <div className="grid gap-6">
                    {instructorStats?.map((inst: any) => (
                        <Card
                            key={inst.id}
                            className="overflow-hidden hover:shadow-md transition-shadow cursor-pointer"
                            onClick={() => window.location.href = `/admin/reports/instructors/${inst.id}`}
                        >
                            <div className="flex flex-col md:flex-row">
                                <div className="bg-muted w-full md:w-48 p-6 flex flex-col items-center justify-center text-center">
                                    <div className="h-24 w-24 rounded-full bg-background flex items-center justify-center overflow-hidden mb-3 border-4 border-background shadow-sm">
                                        {inst.photo_url ? (
                                            <img src={inst.photo_url} alt={inst.display_name} className="h-full w-full object-cover" />
                                        ) : (
                                            <span className="text-3xl font-bold text-muted-foreground">{inst.display_name[0]}</span>
                                        )}
                                    </div>
                                    <h3 className="font-bold text-lg">{inst.display_name}</h3>
                                    <div className="flex items-center gap-1 mt-1">
                                        {inst.avg_rating == null ? (
                                            <span className="text-xs text-muted-foreground">Sin reseñas</span>
                                        ) : (
                                            <>
                                                <span className="text-warning">★</span>
                                                <span className="font-bold">{Number(inst.avg_rating).toFixed(1)}</span>
                                                <span className="text-xs text-muted-foreground">({inst.total_reviews})</span>
                                            </>
                                        )}
                                    </div>
                                </div>

                                <div className="flex-1 p-6">
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
                                        <div className="space-y-1">
                                            <span className="text-sm font-medium text-muted-foreground">Clases</span>
                                            <div className="text-2xl font-bold">{inst.total_classes}</div>
                                        </div>
                                        <div className="space-y-1">
                                            <span className="text-sm font-medium text-muted-foreground">Alumnos</span>
                                            <div className="text-2xl font-bold">{inst.total_students}</div>
                                        </div>
                                        <div className="space-y-1">
                                            <span className="text-sm font-medium text-muted-foreground">Ocupación</span>
                                            <div className={`text-2xl font-bold ${inst.avg_occupancy >= 80 ? 'text-success' : inst.avg_occupancy < 50 ? 'text-warning' : ''}`}>
                                                {Math.round(inst.avg_occupancy)}%
                                            </div>
                                        </div>
                                        <div className="space-y-1">
                                            <span className="text-sm font-medium text-muted-foreground">Recomendación</span>
                                            <div className="text-2xl font-bold">
                                                {inst.recommendation_rate ? `${Math.round(inst.recommendation_rate)}%` : '-'}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="mt-6">
                                        <div className="flex justify-between text-xs mb-1">
                                            <span>Eficiencia de sala</span>
                                            <span>{Math.round(inst.avg_occupancy)}%</span>
                                        </div>
                                        <div className="h-3 w-full bg-muted rounded-full overflow-hidden">
                                            <div
                                                className={`h-full rounded-full ${inst.avg_occupancy >= 80 ? 'bg-success' : inst.avg_occupancy < 50 ? 'bg-warning' : 'bg-primary'}`}
                                                style={{ width: `${inst.avg_occupancy}%` }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </Card>
                    ))}

                    {instructorStats?.length === 0 && (
                        <div className="text-center py-12 text-muted-foreground">
                            No hay datos de instructores para este periodo
                            {facilityId !== 'all' ? ' en esta sucursal' : ''}.
                        </div>
                    )}
                </div>
                    </TabsContent>
                    <TabsContent value="ranking">
                        <Card>
                            <CardHeader>
                                <CardTitle>Ranking de coaches</CardTitle>
                            </CardHeader>
                            <CardContent className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b text-left">
                                            <th className="py-2">Coach</th>
                                            <th className="py-2 text-center">Clases</th>
                                            <th className="py-2 text-center">Check-ins</th>
                                            <th className="py-2 text-center">Ocupación</th>
                                            <th className="py-2 text-right">Costo est.</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {ranking?.coaches?.map((c: any) => (
                                            <tr key={c.id} className="border-b last:border-0">
                                                <td className="py-2">{c.display_name}</td>
                                                <td className="py-2 text-center">{c.classes_taught}</td>
                                                <td className="py-2 text-center">{c.checkins}</td>
                                                <td className="py-2 text-center">{Math.round(c.avg_occupancy)}%</td>
                                                <td className="py-2 text-right">{c.est_cost == null ? 'Tarifa sin configurar' : formatCurrency(Number(c.est_cost))}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                {!ranking?.coaches?.length && (
                                    <div className="text-center py-12 text-muted-foreground">
                                        No hay datos de ranking para este periodo
                                        {facilityId !== 'all' ? ' en esta sucursal' : ''}.
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>
            </div>
        </AdminLayout>
    );
}
