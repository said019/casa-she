import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Users, Search, Star, TrendingUp } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import CoachLayout from '@/components/layout/CoachLayout';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { CoachPageHero, CoachStat, CoachEmptyState } from '@/components/coach/CoachUI';
import api from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';

interface Student {
    user_id: string;
    display_name: string;
    email: string;
    phone: string | null;
    photo_url: string | null;
    total_classes: number;
    checked_in_classes: number;
    last_class_date: string | null;
    last_class_name: string | null;
    primary_channel: string | null;
}

interface StudentsResponse {
    total: number;
    students: Student[];
}

const CHANNEL_LABEL: Record<string, string> = {
    totalpass: 'TotalPass',
    fitpass: 'FitPass',
    wellhub: 'Wellhub',
};

function getInitials(name: string) {
    return name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
}

export default function CoachStudents() {
    const { user } = useAuthStore();
    const isAdmin = user?.role === 'admin';
    const [search, setSearch] = useState('');

    const { data: me } = useQuery({
        queryKey: ['instructor-me', user?.id],
        queryFn: async () => (await api.get('/instructors/me')).data,
        enabled: !!user?.id && !isAdmin,
    });
    const instructorId = me?.id;

    const { data, isLoading, error } = useQuery<StudentsResponse>({
        queryKey: ['coach-students', instructorId],
        queryFn: async () => (await api.get(`/instructors/${instructorId}/students`)).data,
        enabled: !!instructorId || isAdmin,
    });

    const students = data?.students ?? [];
    const filtered = search.trim()
        ? students.filter(
              (s) =>
                  s.display_name.toLowerCase().includes(search.toLowerCase()) ||
                  s.email.toLowerCase().includes(search.toLowerCase()) ||
                  (s.phone && s.phone.includes(search)),
          )
        : students;

    const regulares = students.filter((s) => s.checked_in_classes >= 3).length;
    const totalCheckins = students.reduce((acc, s) => acc + s.checked_in_classes, 0);

    return (
        <AuthGuard requiredRoles={['instructor', 'admin']}>
            <CoachLayout>
                <div className="max-w-5xl mx-auto space-y-6">
                    <CoachPageHero
                        eyebrow="Coach Panel"
                        title="Mis Alumnas"
                        subtitle="Clientas que han asistido a tus clases."
                        icon={Users}
                        className="-mt-6"
                    />

                    {/* Stats */}
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                        {isLoading ? (
                            [...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)
                        ) : (
                            <>
                                <CoachStat label="Total alumnas" value={data?.total ?? 0} icon={Users} tone="arcilla" />
                                <CoachStat label="Regulares (≥3)" value={regulares} icon={Star} tone="verde" />
                                <CoachStat label="Check-ins totales" value={totalCheckins} icon={TrendingUp} tone="success" className="col-span-2 sm:col-span-1" />
                            </>
                        )}
                    </div>

                    {/* Search */}
                    <Card>
                        <CardContent className="pt-4 pb-3">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Buscar por nombre, email o teléfono…"
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    className="pl-9"
                                />
                            </div>
                        </CardContent>
                    </Card>

                    {/* Student list */}
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-base">
                                {search.trim() ? `${filtered.length} resultado${filtered.length !== 1 ? 's' : ''}` : `${data?.total ?? 0} alumnas`}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            {isLoading ? (
                                <div className="divide-y">
                                    {[...Array(6)].map((_, i) => (
                                        <div key={i} className="flex items-center gap-3 p-4">
                                            <Skeleton className="h-10 w-10 rounded-full flex-shrink-0" />
                                            <div className="flex-1 min-w-0 space-y-1">
                                                <Skeleton className="h-4 w-32" />
                                                <Skeleton className="h-3 w-48" />
                                            </div>
                                            <Skeleton className="h-6 w-16 rounded-full" />
                                        </div>
                                    ))}
                                </div>
                            ) : error ? (
                                <p className="text-center text-muted-foreground py-10">
                                    Error al cargar alumnas.
                                </p>
                            ) : filtered.length === 0 ? (
                                <div className="p-4">
                                    <CoachEmptyState
                                        icon={Users}
                                        title={search.trim() ? 'Sin resultados' : 'Sin alumnas aún'}
                                        description={search.trim() ? 'Prueba otra búsqueda.' : 'Cuando imparta clases con alumnas, aparecerán aquí.'}
                                    />
                                </div>
                            ) : (
                                <div className="divide-y">
                                    {filtered.map((student) => {
                                        const isRegular = student.checked_in_classes >= 3;
                                        const channelLabel = student.primary_channel
                                            ? CHANNEL_LABEL[student.primary_channel] ?? null
                                            : null;
                                        return (
                                            <div
                                                key={student.user_id}
                                                className="flex items-center gap-3 p-4 hover:bg-muted/40 transition-colors"
                                            >
                                                <Avatar className="h-10 w-10 flex-shrink-0">
                                                    <AvatarImage src={student.photo_url ?? undefined} />
                                                    <AvatarFallback
                                                        className="text-sm font-semibold"
                                                        style={{ backgroundColor: '#AE4836', color: '#F6F0E4' }}
                                                    >
                                                        {getInitials(student.display_name)}
                                                    </AvatarFallback>
                                                </Avatar>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className="font-medium text-sm truncate">
                                                            {student.display_name}
                                                        </span>
                                                        {isRegular && (
                                                            <Badge
                                                                variant="secondary"
                                                                className="text-[10px] px-1.5 py-0 bg-balance-gold/10 text-balance-gold border-balance-gold/20"
                                                            >
                                                                Regular
                                                            </Badge>
                                                        )}
                                                        {channelLabel && (
                                                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                                                {channelLabel}
                                                            </Badge>
                                                        )}
                                                    </div>
                                                    <p className="text-xs text-muted-foreground truncate">
                                                        {student.email}
                                                        {student.phone && (
                                                            <span className="hidden sm:inline"> · {student.phone}</span>
                                                        )}
                                                    </p>
                                                    {student.last_class_date && (
                                                        <p className="text-xs text-muted-foreground">
                                                            Última clase:{' '}
                                                            {format(parseISO(student.last_class_date), "d 'de' MMMM", { locale: es })}
                                                            {student.last_class_name && ` · ${student.last_class_name}`}
                                                        </p>
                                                    )}
                                                </div>
                                                <div className="text-right flex-shrink-0">
                                                    <p className="font-heading text-lg font-bold text-balance-gold">
                                                        {student.checked_in_classes}
                                                    </p>
                                                    <p className="text-[10px] text-muted-foreground leading-tight">
                                                        check-ins
                                                    </p>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </CoachLayout>
        </AuthGuard>
    );
}
