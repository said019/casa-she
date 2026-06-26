import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, subMonths } from 'date-fns';
import { parseLocalDate } from '@/lib/date';
import { es } from 'date-fns/locale';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { 
    Calendar,
    Clock,
    Users,
    CheckCircle2,
    XCircle,
    ChevronLeft,
    ChevronRight,
    TrendingUp,
    BarChart3,
    Eye
} from 'lucide-react';
import CoachLayout from '@/components/layout/CoachLayout';
import { AuthGuard } from '@/components/layout/AuthGuard';
import api from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';

interface ClassHistoryItem {
    id: string;
    date: string;
    start_time: string;
    end_time: string;
    max_capacity: number;
    current_bookings: number;
    status: string;
    class_type_name: string;
    class_type_color: string;
    facility_name: string | null;
    checked_in_count: number;
    no_show_count: number;
}

interface ClassTypeStats {
    id: string;
    name: string;
    color: string;
    total_classes: number;
    total_bookings: number;
    total_checkins: number;
    avg_occupancy: number;
}

interface Attendee {
    booking_id: string;
    status: string;
    checked_in_at: string | null;
    user_id: string;
    display_name: string;
    email: string;
    phone: string;
    photo_url: string | null;
}

interface ClassType {
    id: string;
    name: string;
    color: string;
}

export default function CoachHistory() {
    const { user } = useAuthStore();
    const [page, setPage] = useState(1);
    const [classTypeFilter, setClassTypeFilter] = useState<string>('all');
    const [selectedClass, setSelectedClass] = useState<ClassHistoryItem | null>(null);
    const [isAttendeesOpen, setIsAttendeesOpen] = useState(false);

    // Get instructor ID
    const { data: instructorData } = useQuery({
        queryKey: ['instructor-by-user', user?.id],
        queryFn: async () => {
            return (await api.get('/instructors/me')).data;
        },
        enabled: !!user?.id,
    });

    const instructorId = instructorData?.id;

    // Fetch class types for filter
    const { data: classTypes } = useQuery<ClassType[]>({
        queryKey: ['class-types'],
        queryFn: async () => {
            const response = await api.get('/class-types');
            return response.data;
        },
    });

    // Fetch history
    const { data: historyData, isLoading } = useQuery<{
        classes: ClassHistoryItem[];
        pagination: { page: number; limit: number; total: number; totalPages: number };
    }>({
        queryKey: ['coach-history', instructorId, page, classTypeFilter],
        queryFn: async () => {
            const params = new URLSearchParams({
                page: page.toString(),
                limit: '15',
                from: format(subMonths(new Date(), 6), 'yyyy-MM-dd'),
            });
            if (classTypeFilter !== 'all') {
                params.append('classTypeId', classTypeFilter);
            }
            const response = await api.get(`/instructors/${instructorId}/history?${params}`);
            return response.data;
        },
        enabled: !!instructorId,
    });

    // Fetch stats by class type
    const { data: statsData } = useQuery<ClassTypeStats[]>({
        queryKey: ['coach-stats-by-type', instructorId],
        queryFn: async () => {
            const response = await api.get(`/instructors/${instructorId}/stats/by-class-type`);
            return response.data;
        },
        enabled: !!instructorId,
    });

    // Fetch attendees for selected class
    const { data: attendees, isLoading: loadingAttendees } = useQuery<Attendee[]>({
        queryKey: ['class-history-attendees', selectedClass?.id],
        queryFn: async () => {
            const response = await api.get(`/instructors/${instructorId}/history/${selectedClass?.id}/attendees`);
            return response.data;
        },
        enabled: !!selectedClass?.id && isAttendeesOpen,
    });

    const formatTime = (time: string) => time?.substring(0, 5) || '';

    const getInitials = (name: string) =>
        name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);

    const handleViewAttendees = (cls: ClassHistoryItem) => {
        setSelectedClass(cls);
        setIsAttendeesOpen(true);
    };

    return (
        <AuthGuard requiredRoles={['instructor', 'admin']}>
            <CoachLayout>
                <div className="space-y-6">
                    {/* Header */}
                    <div>
                        <h1 className="font-heading text-3xl font-bold">Historial de Clases</h1>
                        <p className="text-muted-foreground">
                            Todas las clases que has impartido
                        </p>
                    </div>

                    {/* Stats by Class Type */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <BarChart3 className="h-5 w-5" />
                                Estadísticas por Tipo de Clase
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            {!statsData ? (
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    {[1, 2, 3, 4].map((i) => (
                                        <Skeleton key={i} className="h-24" />
                                    ))}
                                </div>
                            ) : statsData.length === 0 ? (
                                <p className="text-center text-muted-foreground py-4">
                                    No hay estadísticas disponibles aún
                                </p>
                            ) : (
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    {statsData.map((stat) => (
                                        <div
                                            key={stat.id}
                                            className="p-4 rounded-lg border"
                                            style={{ borderLeftColor: stat.color, borderLeftWidth: 4 }}
                                        >
                                            <p className="font-medium text-sm">{stat.name}</p>
                                            <p className="text-2xl font-bold mt-1">{stat.total_classes}</p>
                                            <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                                                <span className="flex items-center gap-1">
                                                    <Users className="h-3 w-3" />
                                                    {stat.total_checkins} check-ins
                                                </span>
                                                <span className="flex items-center gap-1">
                                                    <TrendingUp className="h-3 w-3" />
                                                    {stat.avg_occupancy}%
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* History List */}
                    <Card>
                        <CardHeader>
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                                <div>
                                    <CardTitle className="flex items-center gap-2">
                                        <Calendar className="h-5 w-5" />
                                        Clases Impartidas
                                    </CardTitle>
                                    <CardDescription>
                                        {historyData?.pagination.total || 0} clases en los últimos 6 meses
                                    </CardDescription>
                                </div>
                                <Select value={classTypeFilter} onValueChange={setClassTypeFilter}>
                                    <SelectTrigger className="w-48">
                                        <SelectValue placeholder="Filtrar por tipo" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">Todos los tipos</SelectItem>
                                        {classTypes?.filter(ct => ct.id).map((ct) => (
                                            <SelectItem key={ct.id} value={ct.id}>
                                                {ct.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </CardHeader>
                        <CardContent>
                            {isLoading ? (
                                <div className="space-y-3">
                                    {[1, 2, 3, 4, 5].map((i) => (
                                        <Skeleton key={i} className="h-20" />
                                    ))}
                                </div>
                            ) : !historyData?.classes.length ? (
                                <div className="text-center py-12 text-muted-foreground">
                                    <Calendar className="h-12 w-12 mx-auto mb-3 opacity-50" />
                                    <p>No hay clases en el historial</p>
                                </div>
                            ) : (
                                <>
                                    <div className="space-y-3">
                                        {historyData.classes.map((cls) => (
                                            <div
                                                key={cls.id}
                                                className="flex items-center gap-4 p-4 rounded-lg border hover:bg-muted/50 transition-colors"
                                            >
                                                <div
                                                    className="w-2 h-14 rounded-full shrink-0"
                                                    style={{ backgroundColor: cls.class_type_color }}
                                                />
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <p className="font-medium">{cls.class_type_name}</p>
                                                        <Badge variant="outline" className="text-xs">
                                                            {cls.status === 'completed' ? 'Completada'
                                                                : cls.status === 'scheduled' ? 'Programada'
                                                                : cls.status === 'cancelled' ? 'Cancelada'
                                                                : cls.status === 'in_progress' ? 'En curso'
                                                                : cls.status}
                                                        </Badge>
                                                    </div>
                                                    <div className="flex flex-wrap items-center gap-3 mt-1 text-sm text-muted-foreground">
                                                        <span className="flex items-center gap-1">
                                                            <Calendar className="h-3 w-3" />
                                                            {format(parseLocalDate(cls.date), "EEE d MMM yyyy", { locale: es })}
                                                        </span>
                                                        <span className="flex items-center gap-1">
                                                            <Clock className="h-3 w-3" />
                                                            {formatTime(cls.start_time)} - {formatTime(cls.end_time)}
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-4 text-sm">
                                                    <div className="text-center">
                                                        <div className="flex items-center gap-1 text-success">
                                                            <CheckCircle2 className="h-4 w-4" />
                                                            <span className="font-medium">{cls.checked_in_count}</span>
                                                        </div>
                                                        <p className="text-xs text-muted-foreground">Asistieron</p>
                                                    </div>
                                                    <div className="text-center">
                                                        <div className="flex items-center gap-1 text-red-500">
                                                            <XCircle className="h-4 w-4" />
                                                            <span className="font-medium">{cls.no_show_count}</span>
                                                        </div>
                                                        <p className="text-xs text-muted-foreground">No show</p>
                                                    </div>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => handleViewAttendees(cls)}
                                                    >
                                                        <Eye className="h-4 w-4 mr-1" />
                                                        Ver
                                                    </Button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Pagination */}
                                    {historyData.pagination.totalPages > 1 && (
                                        <div className="flex items-center justify-center gap-2 mt-6">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => setPage((p) => Math.max(1, p - 1))}
                                                disabled={page === 1}
                                            >
                                                <ChevronLeft className="h-4 w-4" />
                                            </Button>
                                            <span className="text-sm text-muted-foreground">
                                                Página {page} de {historyData.pagination.totalPages}
                                            </span>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => setPage((p) => Math.min(historyData.pagination.totalPages, p + 1))}
                                                disabled={page === historyData.pagination.totalPages}
                                            >
                                                <ChevronRight className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    )}
                                </>
                            )}
                        </CardContent>
                    </Card>
                </div>

                {/* Attendees Dialog */}
                <Dialog open={isAttendeesOpen} onOpenChange={setIsAttendeesOpen}>
                    <DialogContent className="sm:max-w-lg">
                        <DialogHeader>
                            <DialogTitle>Asistentes de la Clase</DialogTitle>
                            <DialogDescription>
                                {selectedClass && (
                                    <>
                                        {selectedClass.class_type_name} -{' '}
                                        {format(parseLocalDate(selectedClass.date), "d MMM yyyy", { locale: es })} a las{' '}
                                        {formatTime(selectedClass.start_time)}
                                    </>
                                )}
                            </DialogDescription>
                        </DialogHeader>

                        {loadingAttendees ? (
                            <div className="space-y-3">
                                {[1, 2, 3].map((i) => (
                                    <Skeleton key={i} className="h-14" />
                                ))}
                            </div>
                        ) : !attendees?.length ? (
                            <p className="text-center text-muted-foreground py-8">
                                No hubo asistentes en esta clase
                            </p>
                        ) : (
                            <div className="space-y-2 max-h-96 overflow-y-auto">
                                {attendees.map((attendee) => {
                                    const isCheckedIn = attendee.status === 'checked_in';
                                    const isNoShow = attendee.status === 'no_show';

                                    return (
                                        <div
                                            key={attendee.booking_id}
                                            className={`flex items-center gap-3 p-3 rounded-lg border ${
                                                isCheckedIn
                                                    ? 'bg-success/10 border-success/30'
                                                    : isNoShow
                                                    ? 'bg-red-50 border-red-200'
                                                    : ''
                                            }`}
                                        >
                                            {isCheckedIn && <CheckCircle2 className="h-5 w-5 text-success shrink-0" />}
                                            {isNoShow && <XCircle className="h-5 w-5 text-red-500 shrink-0" />}
                                            {!isCheckedIn && !isNoShow && <div className="w-5" />}

                                            <Avatar className="h-10 w-10">
                                                <AvatarImage src={attendee.photo_url || undefined} />
                                                <AvatarFallback>{getInitials(attendee.display_name)}</AvatarFallback>
                                            </Avatar>

                                            <div className="flex-1 min-w-0">
                                                <p className="font-medium truncate">{attendee.display_name}</p>
                                                <p className="text-xs text-muted-foreground">{attendee.email}</p>
                                            </div>

                                            <Badge
                                                variant={isCheckedIn ? 'default' : isNoShow ? 'destructive' : 'secondary'}
                                            >
                                                {isCheckedIn ? 'Asistió' : isNoShow ? 'No show' : 'Confirmado'}
                                            </Badge>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </DialogContent>
                </Dialog>
            </CoachLayout>
        </AuthGuard>
    );
}
