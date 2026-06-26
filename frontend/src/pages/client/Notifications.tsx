import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { ClientLayout } from '@/components/layout/ClientLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
    Bell, AlertCircle, Calendar, Star, CreditCard, Gift,
    UserCheck, UserPlus, UserMinus, Loader2,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import api, { getErrorMessage } from '@/lib/api';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

type NotificationType =
    | 'booking_reminder' | 'class_cancelled' | 'class_updated'
    | 'membership_expiring' | 'points_earned' | 'promotion'
    | 'coach_assigned' | 'coach_removed' | 'coach_substituted'
    | 'review_received' | 'substitution_requested';

interface NotificationRow {
    id: string;
    title: string;
    body: string;
    type: NotificationType;
    data: Record<string, unknown> | null;
    is_read: boolean;
    created_at: string;
}

const ICON_BY_TYPE: Record<NotificationType, React.ComponentType<{ className?: string }>> = {
    booking_reminder: Calendar,
    class_cancelled: AlertCircle,
    class_updated: Calendar,
    membership_expiring: CreditCard,
    points_earned: Gift,
    promotion: Gift,
    coach_assigned: UserPlus,
    coach_removed: UserMinus,
    coach_substituted: UserCheck,
    review_received: Star,
    substitution_requested: UserCheck,
};

function relativeTime(iso: string): string {
    try {
        return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: es });
    } catch {
        return '';
    }
}

export default function Notifications() {
    const qc = useQueryClient();

    const { data: notifications, isLoading, error } = useQuery<NotificationRow[]>({
        queryKey: ['notifications'],
        queryFn: async () => (await api.get('/notifications?limit=100')).data,
    });

    const markAll = useMutation({
        mutationFn: async () => api.post('/notifications/mark-all-read'),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['notifications'] });
            qc.invalidateQueries({ queryKey: ['notifications-unread-count'] });
        },
    });

    const markOne = useMutation({
        mutationFn: async (id: string) => api.put(`/notifications/${id}/read`),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['notifications'] });
            qc.invalidateQueries({ queryKey: ['notifications-unread-count'] });
        },
    });

    const items = notifications ?? [];
    const unreadCount = items.filter((n) => !n.is_read).length;

    return (
        <AuthGuard requiredRoles={['client', 'instructor', 'admin', 'super_admin', 'reception']}>
            <ClientLayout>
                <div className="space-y-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-2xl font-heading font-bold">Notificaciones</h1>
                            <p className="text-muted-foreground">Mantente al tanto de tu actividad.</p>
                        </div>
                        <Button variant="ghost" asChild>
                            <Link to="/app">Volver</Link>
                        </Button>
                    </div>

                    <Card>
                        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <CardTitle className="flex items-center gap-2">
                                <Bell className="h-5 w-5 text-muted-foreground" />
                                Recientes
                                {unreadCount > 0 && <Badge className="ml-1">{unreadCount}</Badge>}
                            </CardTitle>
                            <Button
                                variant="outline"
                                size="sm"
                                className="w-full sm:w-auto"
                                onClick={() => markAll.mutate()}
                                disabled={markAll.isPending || unreadCount === 0}
                            >
                                {markAll.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                                Marcar todo leído
                            </Button>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {isLoading ? (
                                Array.from({ length: 4 }).map((_, i) => (
                                    <Skeleton key={i} className="h-16 w-full" />
                                ))
                            ) : error ? (
                                <div className="flex items-center justify-center gap-2 text-destructive text-sm py-6">
                                    <AlertCircle className="h-4 w-4" />
                                    {getErrorMessage(error)}
                                </div>
                            ) : items.length === 0 ? (
                                <p className="text-sm text-muted-foreground text-center py-8">
                                    Aún no tienes notificaciones.
                                </p>
                            ) : (
                                items.map((n) => {
                                    const Icon = ICON_BY_TYPE[n.type] ?? Bell;
                                    return (
                                        <button
                                            key={n.id}
                                            onClick={() => { if (!n.is_read) markOne.mutate(n.id); }}
                                            className={`w-full text-left flex items-start gap-3 p-3 rounded-md border transition-colors ${
                                                n.is_read
                                                    ? 'bg-card hover:bg-muted/50'
                                                    : 'bg-primary/5 border-primary/30 hover:bg-primary/10'
                                            }`}
                                        >
                                            <div className={`mt-0.5 p-2 rounded-md ${n.is_read ? 'bg-muted' : 'bg-primary/10'}`}>
                                                <Icon className="h-4 w-4 text-primary" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center justify-between gap-2">
                                                    <p className={`text-sm ${n.is_read ? 'font-medium' : 'font-semibold'}`}>{n.title}</p>
                                                    {!n.is_read && <Badge className="text-[10px] h-5">Nuevo</Badge>}
                                                </div>
                                                <p className="text-sm text-muted-foreground">{n.body}</p>
                                                <p className="text-xs text-muted-foreground mt-1">{relativeTime(n.created_at)}</p>
                                            </div>
                                        </button>
                                    );
                                })
                            )}
                        </CardContent>
                    </Card>
                </div>
            </ClientLayout>
        </AuthGuard>
    );
}
