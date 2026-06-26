import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api, { getErrorMessage } from '@/lib/api';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, ArrowLeftRight } from 'lucide-react';

interface PendingSubstitution {
    id: string;
    class_id: string;
    class_name: string;
    class_date: string;
    start_time: string;
    end_time: string;
    facility_name: string | null;
    reason: string | null;
    original_instructor_id: string;
    original_coach_name: string;
    substitute_instructor_id: string | null;
    substitute_coach_name: string | null;
}

function formatDate(dateStr: string): string {
    try {
        // dateStr is YYYY-MM-DD; parse as local date to avoid UTC offset shift
        const [year, month, day] = dateStr.split('-').map(Number);
        const d = new Date(year, month - 1, day);
        return d.toLocaleDateString('es-MX', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
        });
    } catch {
        return dateStr;
    }
}

function trimTime(t: string): string {
    return t?.substring(0, 5) ?? t;
}

export default function SubstitutionsAdmin() {
    const { toast } = useToast();
    const queryClient = useQueryClient();

    const { data: substitutions, isLoading } = useQuery<PendingSubstitution[]>({
        queryKey: ['admin-substitutions'],
        queryFn: async () => {
            const { data } = await api.get('/instructors/substitutions/pending');
            return data;
        },
    });

    const approveMutation = useMutation({
        mutationFn: async (subId: string) => {
            const { data } = await api.post(`/instructors/substitutions/${subId}/approve`);
            return data;
        },
        onSuccess: () => {
            toast({ title: 'Sustitución aprobada', description: 'El cambio de instructor ha sido aplicado.' });
            queryClient.invalidateQueries({ queryKey: ['admin-substitutions'] });
        },
        onError: (error) => {
            toast({ variant: 'destructive', title: 'Error', description: getErrorMessage(error) });
        },
    });

    const rejectMutation = useMutation({
        mutationFn: async (subId: string) => {
            const { data } = await api.post(`/instructors/substitutions/${subId}/reject`);
            return data;
        },
        onSuccess: () => {
            toast({ title: 'Sustitución rechazada' });
            queryClient.invalidateQueries({ queryKey: ['admin-substitutions'] });
        },
        onError: (error) => {
            toast({ variant: 'destructive', title: 'Error', description: getErrorMessage(error) });
        },
    });

    const handleReject = (sub: PendingSubstitution) => {
        if (!confirm(`¿Rechazar la solicitud de sustitución de ${sub.original_coach_name}?`)) return;
        rejectMutation.mutate(sub.id);
    };

    return (
        <AuthGuard requiredRoles={['admin', 'super_admin']} allowElevated>
            <AdminLayout>
                <div className="space-y-6">
                    <div>
                        <h1 className="text-3xl font-heading font-bold">Sustituciones</h1>
                        <p className="text-muted-foreground">Aprueba o rechaza las sustituciones de los coaches.</p>
                    </div>

                    {isLoading ? (
                        <div className="flex justify-center py-12">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        </div>
                    ) : !substitutions?.length ? (
                        <div className="rounded-xl border bg-card p-10 text-center">
                            <ArrowLeftRight className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
                            <p className="text-muted-foreground text-sm">No hay sustituciones pendientes.</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {substitutions.map((sub) => {
                                const hasSubstitute = !!sub.substitute_instructor_id;
                                const isApproving = approveMutation.isPending && approveMutation.variables === sub.id;
                                const isRejecting = rejectMutation.isPending && rejectMutation.variables === sub.id;

                                return (
                                    <div key={sub.id} className="rounded-xl border bg-card p-4 space-y-3">
                                        {/* Class info */}
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0 flex-1">
                                                <p className="font-semibold text-base leading-tight">{sub.class_name}</p>
                                                <p className="text-sm text-muted-foreground mt-0.5 capitalize">
                                                    {formatDate(sub.class_date)}
                                                </p>
                                                <p className="text-sm text-muted-foreground">
                                                    {trimTime(sub.start_time)}–{trimTime(sub.end_time)}
                                                    {sub.facility_name ? ` · ${sub.facility_name}` : ''}
                                                </p>
                                            </div>
                                        </div>

                                        {/* People */}
                                        <div className="text-sm space-y-1">
                                            <p>
                                                <span className="text-muted-foreground">Coach original: </span>
                                                <span className="font-medium">{sub.original_coach_name}</span>
                                            </p>
                                            {sub.reason && (
                                                <p>
                                                    <span className="text-muted-foreground">Motivo: </span>
                                                    <span>{sub.reason}</span>
                                                </p>
                                            )}
                                            {hasSubstitute ? (
                                                <p className="text-primary font-medium">
                                                    Se ofreció: {sub.substitute_coach_name}
                                                </p>
                                            ) : (
                                                <p className="text-muted-foreground italic text-xs">Aún nadie se ofrece</p>
                                            )}
                                        </div>

                                        {/* Actions */}
                                        <div className="flex gap-2 pt-1">
                                            <Button
                                                size="sm"
                                                disabled={!hasSubstitute || isApproving || isRejecting}
                                                onClick={() => approveMutation.mutate(sub.id)}
                                            >
                                                {isApproving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                                                Aprobar
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                className="text-destructive hover:text-destructive"
                                                disabled={isApproving || isRejecting}
                                                onClick={() => handleReject(sub)}
                                            >
                                                {isRejecting && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                                                Rechazar
                                            </Button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </AdminLayout>
        </AuthGuard>
    );
}
