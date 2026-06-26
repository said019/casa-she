import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { parseLocalDate } from '@/lib/date';
import { es } from 'date-fns/locale';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
    ChevronLeft,
    Clock,
    MapPin,
    Users,
    CheckCircle2,
    AlertTriangle,
    Loader2,
    ShieldAlert,
} from 'lucide-react';
import CoachLayout from '@/components/layout/CoachLayout';
import { AuthGuard } from '@/components/layout/AuthGuard';
import api from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';

interface Attendee {
    booking_id: string;
    status: string;
    waitlist_position: number | null;
    checked_in_at: string | null;
    user_id: string;
    display_name: string;
    email: string;
    phone: string;
    photo_url: string | null;
    health_notes: string | null;
    instructor_notes: string | null;
    alert_flag: boolean;
    alert_message: string | null;
    plan_name?: string | null;
    membership_name?: string | null;
}

interface ClassDetail {
    id: string;
    date: string;
    start_time: string;
    end_time: string;
    max_capacity: number;
    current_bookings: number;
    status: string;
    notes: string | null;
    level: string | null;
    class_type_name: string;
    class_type_color: string;
    class_type_description: string;
    facility_name: string | null;
}

export default function CoachClassDetail() {
    const { classId } = useParams();
    const navigate = useNavigate();
    const { user } = useAuthStore();

    const isAdmin = user?.role === 'admin';

    // Get instructor ID (for non-admin coaches)
    const { data: instructorData } = useQuery({
        queryKey: ['instructor-by-user', user?.id],
        queryFn: async () => {
            return (await api.get('/instructors/me')).data;
        },
        enabled: !!user?.id && !isAdmin,
    });

    // Fetch class details first (needed to get instructor_id for admin)
    const { data: classDetail, isLoading: loadingClass } = useQuery<ClassDetail & { instructor_id?: string }>({
        queryKey: ['class-detail', classId],
        queryFn: async () => {
            const response = await api.get(`/classes/${classId}`);
            return response.data;
        },
        enabled: !!classId,
    });

    // For admin: use the class's own instructor_id; for coaches: use their own
    const instructorId = isAdmin
        ? (classDetail as any)?.instructor_id || instructorData?.id
        : instructorData?.id;

    // Fetch attendees (read-only roster)
    const { data: attendeesData, isLoading: loadingAttendees } = useQuery<{ confirmed: Attendee[]; waitlist: Attendee[] }>({
        queryKey: ['class-attendees', classId, instructorId],
        queryFn: async () => {
            const response = await api.get(`/instructors/${instructorId}/classes/${classId}/attendees`);
            return response.data;
        },
        enabled: !!classId && !!instructorId,
    });

    const getInitials = (name: string) =>
        name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);

    const formatTime = (time: string) => time?.substring(0, 5) || '';

    const confirmed = attendeesData?.confirmed || [];
    const waitlist = attendeesData?.waitlist || [];

    if (loadingClass) {
        return (
            <AuthGuard requiredRoles={['instructor', 'admin']}>
                <CoachLayout>
                    <div className="flex items-center justify-center min-h-[60vh]">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                </CoachLayout>
            </AuthGuard>
        );
    }

    return (
        <AuthGuard requiredRoles={['instructor', 'admin']}>
            <CoachLayout>
                <div className="space-y-6">
                    {/* Back Button */}
                    <Button variant="ghost" onClick={() => navigate(-1)} className="mb-2">
                        <ChevronLeft className="h-4 w-4 mr-1" />
                        Volver
                    </Button>

                    {/* Class Header */}
                    <Card>
                        <CardContent className="p-6">
                            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                                <div className="flex items-start gap-4">
                                    <div
                                        className="w-2 h-16 rounded-full"
                                        style={{ backgroundColor: classDetail?.class_type_color || '#6B7280' }}
                                    />
                                    <div>
                                        <h1 className="font-heading text-2xl font-bold">
                                            {classDetail?.class_type_name}
                                        </h1>
                                        <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-muted-foreground">
                                            <span className="flex items-center gap-1">
                                                <Clock className="h-4 w-4" />
                                                {classDetail && format(parseLocalDate(classDetail.date), "EEEE d 'de' MMMM", { locale: es })}
                                            </span>
                                            <span>
                                                {formatTime(classDetail?.start_time || '')} - {formatTime(classDetail?.end_time || '')}
                                            </span>
                                            <span className="flex items-center gap-1">
                                                <MapPin className="h-4 w-4" />
                                                {classDetail?.facility_name || 'Sala Principal'}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center gap-4">
                                    <div className="text-center">
                                        <p className="text-3xl font-bold text-primary">
                                            {classDetail?.current_bookings}/{classDetail?.max_capacity}
                                        </p>
                                        <p className="text-xs text-muted-foreground">Reservados</p>
                                    </div>
                                    {classDetail && classDetail.current_bookings >= classDetail.max_capacity && (
                                        <Badge className="bg-success">
                                            <CheckCircle2 className="h-3 w-3 mr-1" />
                                            Lleno
                                        </Badge>
                                    )}
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Attendees roster (read-only) */}
                    <Card>
                        <CardHeader>
                            <div>
                                <CardTitle className="flex items-center gap-2">
                                    <Users className="h-5 w-5" />
                                    Asistentes ({confirmed.length})
                                </CardTitle>
                                <CardDescription>
                                    Quiénes vendrán a tu clase
                                </CardDescription>
                            </div>
                            <p className="text-xs text-muted-foreground mt-2">
                                La asistencia (check-in) se toma en recepción.
                            </p>
                        </CardHeader>
                        <CardContent>
                            {loadingAttendees ? (
                                <div className="flex justify-center py-8">
                                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                                </div>
                            ) : confirmed.length === 0 ? (
                                <div className="text-center py-8 text-muted-foreground">
                                    <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
                                    <p>No hay asistentes registrados</p>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {confirmed.map((attendee) => {
                                        const planLabel = attendee.plan_name || attendee.membership_name;
                                        return (
                                            <div
                                                key={attendee.booking_id}
                                                className="flex items-start gap-4 p-3 rounded-lg border hover:bg-muted/50"
                                            >
                                                <Avatar className="h-10 w-10 shrink-0">
                                                    <AvatarImage src={attendee.photo_url || undefined} />
                                                    <AvatarFallback>{getInitials(attendee.display_name)}</AvatarFallback>
                                                </Avatar>

                                                <div className="flex-1 min-w-0">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <p className="font-medium truncate">{attendee.display_name}</p>
                                                        {planLabel && (
                                                            <Badge variant="secondary" className="shrink-0 text-xs">
                                                                {planLabel}
                                                            </Badge>
                                                        )}
                                                        {attendee.alert_flag && (
                                                            <Badge variant="destructive" className="shrink-0">
                                                                <AlertTriangle className="h-3 w-3 mr-1" />
                                                                {attendee.alert_message || 'Alerta'}
                                                            </Badge>
                                                        )}
                                                    </div>

                                                    {/* Prominent health notes (medical info) */}
                                                    {attendee.health_notes && attendee.health_notes.trim() !== '' && (
                                                        <div className="mt-2 flex items-start gap-1.5 bg-amber-50 border border-amber-200 text-amber-900 rounded-lg px-2 py-1 text-xs">
                                                            <ShieldAlert className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                                                            <span>
                                                                <span className="font-semibold">Salud:</span> {attendee.health_notes}
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Waitlist */}
                    {waitlist.length > 0 && (
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-base">
                                    Lista de Espera ({waitlist.length})
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-2">
                                    {waitlist.map((attendee, index) => (
                                        <div
                                            key={attendee.booking_id}
                                            className="flex items-start gap-4 p-3 rounded-lg border bg-warning/10"
                                        >
                                            <span className="text-sm font-medium text-muted-foreground w-6 shrink-0">
                                                #{index + 1}
                                            </span>
                                            <Avatar className="h-8 w-8 shrink-0">
                                                <AvatarImage src={attendee.photo_url || undefined} />
                                                <AvatarFallback className="text-xs">
                                                    {getInitials(attendee.display_name)}
                                                </AvatarFallback>
                                            </Avatar>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium truncate">{attendee.display_name}</p>
                                                {attendee.health_notes && attendee.health_notes.trim() !== '' && (
                                                    <div className="mt-1.5 flex items-start gap-1.5 bg-amber-50 border border-amber-200 text-amber-900 rounded-lg px-2 py-1 text-xs">
                                                        <ShieldAlert className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                                                        <span>
                                                            <span className="font-semibold">Salud:</span> {attendee.health_notes}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
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
