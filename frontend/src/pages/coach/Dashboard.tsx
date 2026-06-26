import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { format, isToday, isTomorrow, parseISO, differenceInMinutes } from 'date-fns';
import { parseLocalDate } from '@/lib/date';
import { es } from 'date-fns/locale';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
    Calendar,
    Users,
    TrendingUp,
    Clock,
    ChevronRight,
    CheckCircle2,
    AlertCircle,
    Sparkles,
    Flame,
} from 'lucide-react';
import CoachLayout from '@/components/layout/CoachLayout';
import { AuthGuard } from '@/components/layout/AuthGuard';
import api from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';

interface ClassItem {
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
    waitlist_count: number;
}

interface CoachStats {
    instructor_id: string;
    display_name: string;
    total_classes_taught: number;
    total_bookings: number;
    total_checkins: number;
    attendance_rate: number;
    classes_today: number;
    classes_this_week: number;
    bookings_this_week: number;
    avg_occupancy: number;
}

export default function CoachDashboard() {
    const { user, isLoading: authLoading } = useAuthStore();

    const isAdmin = user?.role === 'admin';

    // Get instructor ID from user (only needed for non-admin coaches)
    const { data: instructorData, isLoading: loadingInstructor } = useQuery({
        queryKey: ['instructor-by-user', user?.id],
        queryFn: async () => {
            return (await api.get('/instructors/me')).data;
        },
        enabled: !!user?.id && !isAdmin,
    });

    const instructorId = instructorData?.id;

    // Fetch today's classes
    const { data: todayClasses, isLoading: loadingClasses } = useQuery<ClassItem[]>({
        queryKey: ['coach-today-classes', isAdmin ? 'all' : instructorId],
        queryFn: async () => {
            const today = format(new Date(), 'yyyy-MM-dd');
            if (isAdmin) {
                const response = await api.get(`/classes?start=${today}&end=${today}`);
                return response.data;
            } else {
                const response = await api.get(`/instructors/${instructorId}/classes?date=${today}`);
                return response.data;
            }
        },
        enabled: isAdmin || !!instructorId,
    });

    // Fetch stats (admin uses a general approach)
    const { data: stats, isLoading: loadingStats } = useQuery<CoachStats>({
        queryKey: ['coach-stats', isAdmin ? 'all' : instructorId],
        queryFn: async () => {
            if (isAdmin) {
                // Build admin-level stats from classes data
                const today = format(new Date(), 'yyyy-MM-dd');
                const weekEnd = format(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd');
                const weekClasses = await api.get(`/classes?start=${today}&end=${weekEnd}`);
                const allClasses = weekClasses.data || [];
                const todayCount = allClasses.filter((c: any) => c.date === today).length;
                const totalBookings = allClasses.reduce((sum: number, c: any) => sum + (c.current_bookings || 0), 0);
                const totalCapacity = allClasses.reduce((sum: number, c: any) => sum + (c.max_capacity || 0), 0);
                return {
                    instructor_id: 'admin',
                    display_name: user?.display_name || 'Admin',
                    total_classes_taught: 0,
                    total_bookings: totalBookings,
                    total_checkins: 0,
                    attendance_rate: 0,
                    classes_today: todayCount,
                    classes_this_week: allClasses.length,
                    bookings_this_week: totalBookings,
                    avg_occupancy: totalCapacity > 0 ? Math.round((totalBookings / totalCapacity) * 100) : 0,
                } as CoachStats;
            } else {
                const response = await api.get(`/instructors/${instructorId}/stats`);
                return response.data;
            }
        },
        enabled: isAdmin || !!instructorId,
    });

    // Fetch upcoming classes (next 7 days)
    const { data: upcomingClasses } = useQuery<ClassItem[]>({
        queryKey: ['coach-upcoming-classes', isAdmin ? 'all' : instructorId],
        queryFn: async () => {
            const from = format(new Date(), 'yyyy-MM-dd');
            const to = format(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd');
            if (isAdmin) {
                const response = await api.get(`/classes?start=${from}&end=${to}`);
                return response.data;
            } else {
                const response = await api.get(`/instructors/${instructorId}/classes?from=${from}&to=${to}`);
                return response.data;
            }
        },
        enabled: isAdmin || !!instructorId,
    });

    const formatTime = (time: string) => time.substring(0, 5);

    const getOccupancyColor = (current: number, max: number) => {
        const percentage = (current / max) * 100;
        if (percentage >= 90) return 'text-success';
        if (percentage >= 50) return 'text-yellow-600';
        return 'text-muted-foreground';
    };

    const getDateLabel = (dateStr: string) => {
        const date = parseLocalDate(dateStr);
        if (isToday(date)) return 'Hoy';
        if (isTomorrow(date)) return 'Mañana';
        return format(date, "EEEE d 'de' MMMM", { locale: es });
    };

    if (authLoading || (loadingInstructor && !instructorId)) {
        return (
            <AuthGuard requiredRoles={['instructor', 'admin']}>
                <CoachLayout>
                    <div className="flex items-center justify-center min-h-[60vh]">
                        <Skeleton className="h-10 w-10 rounded-full" />
                    </div>
                </CoachLayout>
            </AuthGuard>
        );
    }

    if (!instructorId && !loadingClasses && !loadingInstructor) {
        return (
            <AuthGuard requiredRoles={['instructor', 'admin']}>
                <CoachLayout>
                    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
                        <AlertCircle className="h-16 w-16 text-muted-foreground mb-4" />
                        <h2 className="text-2xl font-heading font-semibold mb-2">
                            Perfil de instructor no encontrado
                        </h2>
                        <p className="text-muted-foreground max-w-md">
                            Tu cuenta no está vinculada a un perfil de instructor.
                            Contacta al administrador para configurar tu acceso.
                        </p>
                    </div>
                </CoachLayout>
            </AuthGuard>
        );
    }

    return (
        <AuthGuard requiredRoles={['instructor', 'admin']}>
            <CoachLayout>
                <div className="space-y-6">
                    {/* Header with gradient */}
                    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-balance-dark via-[#3D3229] to-balance-dark p-6 sm:p-8">
                        <div className="absolute top-0 right-0 w-56 h-56 rounded-full bg-balance-gold/[0.08] blur-3xl" />
                        <div className="absolute bottom-0 left-0 w-40 h-40 rounded-full bg-balance-olive/[0.1] blur-3xl" />
                        <div className="relative z-10">
                            <div className="flex items-center gap-2 mb-1">
                                <Flame className="h-4 w-4 text-balance-gold/70" />
                                <p className="text-[10px] uppercase tracking-[3px] text-balance-gold/60 font-semibold font-body">
                                    Coach Panel
                                </p>
                            </div>
                            <h1 className="font-heading text-2xl sm:text-3xl font-bold text-white">
                                Hola, {user?.display_name?.split(' ')[0]} 👋
                            </h1>
                            <p className="text-balance-sand/60 font-body text-sm mt-1">
                                {format(new Date(), "EEEE, d 'de' MMMM 'de' yyyy", { locale: es })}
                            </p>
                        </div>
                    </div>

                    {/* Stats Cards */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {[
                            { label: 'Clases hoy', value: stats?.classes_today || 0, icon: Calendar, color: 'bg-balance-gold/10 text-balance-gold', border: 'border-balance-gold/20' },
                            { label: 'Esta semana', value: stats?.classes_this_week || 0, icon: Clock, color: 'bg-blue-500/10 text-blue-600', border: 'border-blue-500/20' },
                            { label: 'Reservaciones', value: stats?.bookings_this_week || 0, icon: Users, color: 'bg-emerald-500/10 text-emerald-600', border: 'border-emerald-500/20' },
                            { label: 'Ocupación', value: `${stats?.avg_occupancy || 0}%`, icon: TrendingUp, color: 'bg-violet-500/10 text-violet-600', border: 'border-violet-500/20' },
                        ].map((stat) => (
                            <Card key={stat.label} className={`border ${stat.border} hover:shadow-md transition-all duration-300 hover:-translate-y-0.5`}>
                                <CardContent className="p-4">
                                    <div className="flex items-center gap-3">
                                        <div className={`p-2.5 rounded-xl ${stat.color}`}>
                                            <stat.icon className="h-5 w-5" />
                                        </div>
                                        <div>
                                            <p className="text-2xl font-bold font-heading">
                                                {loadingStats ? <Skeleton className="h-8 w-8" /> : stat.value}
                                            </p>
                                            <p className="text-xs text-muted-foreground font-body">{stat.label}</p>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>

                    {/* Today's Classes */}
                    <Card className="border-border/60 hover:shadow-md transition-shadow duration-300">
                        <CardHeader className="pb-3">
                            <div className="flex items-center justify-between">
                                <div>
                                    <CardTitle className="flex items-center gap-2 text-lg font-heading">
                                        <div className="h-8 w-8 rounded-xl bg-balance-gold/10 flex items-center justify-center">
                                            <Calendar className="h-4 w-4 text-balance-gold" />
                                        </div>
                                        Tu día
                                    </CardTitle>
                                    <CardDescription className="font-body mt-1">
                                        Clases programadas para hoy
                                    </CardDescription>
                                </div>
                                <Button variant="outline" size="sm" className="rounded-xl font-body" asChild>
                                    <Link to="/coach/schedule">
                                        Ver horario
                                        <ChevronRight className="ml-1 h-4 w-4" />
                                    </Link>
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent>
                            {loadingClasses ? (
                                <div className="space-y-3">
                                    {[1, 2, 3].map((i) => (
                                        <Skeleton key={i} className="h-20 w-full rounded-xl" />
                                    ))}
                                </div>
                            ) : !todayClasses || todayClasses.length === 0 ? (
                                <div className="text-center py-10">
                                    <div className="h-14 w-14 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto mb-3">
                                        <Calendar className="h-7 w-7 text-muted-foreground/40" />
                                    </div>
                                    <p className="text-sm text-muted-foreground font-body">No tienes clases programadas para hoy</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {todayClasses.map((classItem) => {
                                        const now = new Date();
                                        const todayStr = format(now, 'yyyy-MM-dd');
                                        const classStart = parseISO(`${todayStr}T${classItem.start_time}`);
                                        const classEnd = parseISO(`${todayStr}T${classItem.end_time}`);
                                        const isPast = now > classEnd;
                                        const isNow = now >= classStart && now <= classEnd;
                                        const minsUntil = differenceInMinutes(classStart, now);
                                        const isSoon = !isPast && !isNow && minsUntil <= 60;

                                        let timeBadge = null;
                                        if (isPast) {
                                            timeBadge = <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-body">Finalizada</span>;
                                        } else if (isNow) {
                                            timeBadge = <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-balance-gold/15 text-balance-gold animate-pulse font-body">● En curso</span>;
                                        } else if (isSoon) {
                                            timeBadge = <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 font-body">En {minsUntil}m</span>;
                                        }

                                        return (
                                            <Link
                                                key={classItem.id}
                                                to={`/coach/class/${classItem.id}`}
                                                className="block"
                                            >
                                                <div className={`flex items-center justify-between p-4 rounded-xl border hover:bg-muted/50 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm ${isPast ? 'opacity-50' : ''} ${isNow ? 'ring-2 ring-balance-gold/30 border-balance-gold/20' : ''}`}>
                                                    <div className="flex items-center gap-4">
                                                        <div className="text-center min-w-[60px]">
                                                            <p className="text-lg font-bold font-heading">
                                                                {formatTime(classItem.start_time)}
                                                            </p>
                                                            <p className="text-xs text-muted-foreground font-body">
                                                                {formatTime(classItem.end_time)}
                                                            </p>
                                                        </div>
                                                        <div
                                                            className="w-1 h-12 rounded-full"
                                                            style={{ backgroundColor: isPast ? '#999' : classItem.class_type_color || '#6B7280' }}
                                                        />
                                                        <div>
                                                            <div className="flex items-center gap-2">
                                                                <p className="font-semibold font-body">{classItem.class_type_name}</p>
                                                                {timeBadge}
                                                            </div>
                                                            <p className="text-sm text-muted-foreground font-body">
                                                                {classItem.facility_name || 'Sala Principal'}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-3">
                                                        <div className="text-right">
                                                            <p className={`font-semibold font-body ${getOccupancyColor(classItem.current_bookings, classItem.max_capacity)}`}>
                                                                {classItem.current_bookings}/{classItem.max_capacity}
                                                            </p>
                                                            <p className="text-xs text-muted-foreground font-body">reservados</p>
                                                        </div>
                                                        {classItem.current_bookings >= classItem.max_capacity ? (
                                                            <Badge variant="default" className="bg-emerald-600 rounded-lg">
                                                                <CheckCircle2 className="h-3 w-3 mr-1" />
                                                                Lleno
                                                            </Badge>
                                                        ) : classItem.waitlist_count > 0 ? (
                                                            <Badge variant="secondary" className="rounded-lg">
                                                                +{classItem.waitlist_count} espera
                                                            </Badge>
                                                        ) : null}
                                                        <ChevronRight className="h-5 w-5 text-muted-foreground" />
                                                    </div>
                                                </div>
                                            </Link>
                                        );
                                    })}
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Upcoming Classes */}
                    {upcomingClasses && upcomingClasses.length > 0 && (
                        <Card className="border-border/60 hover:shadow-md transition-shadow duration-300">
                            <CardHeader className="pb-3">
                                <CardTitle className="flex items-center gap-2 text-lg font-heading">
                                    <div className="h-8 w-8 rounded-xl bg-blue-500/10 flex items-center justify-center">
                                        <Clock className="h-4 w-4 text-blue-600" />
                                    </div>
                                    Próximas clases
                                </CardTitle>
                                <CardDescription className="font-body mt-1">
                                    Esta semana
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-2">
                                    {upcomingClasses
                                        .filter((c) => !isToday(parseLocalDate(c.date)))
                                        .slice(0, 5)
                                        .map((classItem) => (
                                            <Link
                                                key={classItem.id}
                                                to={`/coach/class/${classItem.id}`}
                                                className="block"
                                            >
                                                <div className="flex items-center justify-between p-3 rounded-xl hover:bg-muted/50 transition-all duration-200 hover:-translate-y-0.5">
                                                    <div className="flex items-center gap-3">
                                                        <div
                                                            className="w-1 h-8 rounded-full"
                                                            style={{ backgroundColor: classItem.class_type_color || '#6B7280' }}
                                                        />
                                                        <div>
                                                            <p className="font-semibold text-sm font-body">
                                                                {classItem.class_type_name}
                                                            </p>
                                                            <p className="text-xs text-muted-foreground font-body">
                                                                {getDateLabel(classItem.date)} • {formatTime(classItem.start_time)}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-sm text-muted-foreground font-body">
                                                            {classItem.current_bookings}/{classItem.max_capacity}
                                                        </span>
                                                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                                    </div>
                                                </div>
                                            </Link>
                                        ))}
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </div>
            </CoachLayout>
        </AuthGuard>
    );
}
