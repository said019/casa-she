import { useQuery } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { ClientLayout } from '@/components/layout/ClientLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { fetchMyMembership } from '@/lib/memberships';
import type { ClientMembership } from '@/types/membership';
import { categoryCredits } from '@/types/membership';
import { Link } from 'react-router-dom';

const statusLabel: Record<ClientMembership['status'], string> = {
  active: 'Activa',
  expired: 'Vencida',
  cancelled: 'Cancelada',
  pending_payment: 'Pago pendiente',
  pending_activation: 'Pendiente',
  paused: 'Pausada',
};

export default function ProfileMembership() {
  const { data: membership, isLoading } = useQuery<ClientMembership | null>({
    queryKey: ['my-membership'],
    queryFn: fetchMyMembership,
  });

  const classLimit = membership?.class_limit ?? null;
  const classesRemaining = membership?.classes_remaining ?? null;
  const classesProgress = classLimit && classesRemaining !== null
    ? (classesRemaining / classLimit) * 100
    : null;
  const credits = categoryCredits(membership);

  return (
    <AuthGuard requiredRoles={['client']}>
      <ClientLayout>
        <div className="space-y-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-heading font-bold">Mi membresía</h1>
              <p className="text-muted-foreground">Detalles de tu plan actual.</p>
            </div>
            <Button variant="ghost" asChild>
              <Link to="/app/profile">Volver</Link>
            </Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Estado de membresía</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {isLoading ? (
                <Skeleton className="h-24 w-full" />
              ) : membership ? (
                <>
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-lg font-semibold">{membership.plan_name || 'Plan activo'}</p>
                      <p className="truncate text-sm text-muted-foreground">
                        {membership.plan_price
                          ? `${membership.plan_price} ${membership.plan_currency || 'MXN'}`
                          : 'Precio no disponible'}
                      </p>
                    </div>
                    <Badge variant={membership.status === 'active' ? 'default' : 'secondary'}>
                      {statusLabel[membership.status]}
                    </Badge>
                  </div>

                  <div className="grid gap-3 text-sm sm:grid-cols-2">
                    <div>
                      <p className="text-muted-foreground">Inicio</p>
                      <p>{membership.start_date ? format(parseISO(membership.start_date), 'dd MMM yyyy', { locale: es }) : '—'}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Vencimiento</p>
                      <p>{membership.end_date ? format(parseISO(membership.end_date), 'dd MMM yyyy', { locale: es }) : '—'}</p>
                    </div>
                  </div>

                  {credits.length > 0 ? (
                    <div className="space-y-3">
                      <p className="text-sm font-medium">Créditos disponibles</p>
                      {credits.map((c) => (
                        <div key={c.key} className="space-y-1.5">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">{c.label}</span>
                            <span className="font-semibold tabular-nums">
                              {c.unlimited
                                ? 'Ilimitado'
                                : c.total
                                  ? `${c.remaining ?? 0} de ${c.total}`
                                  : `${c.remaining ?? 0}`}
                            </span>
                          </div>
                          {!c.unlimited && c.total ? (
                            <Progress
                              value={Math.min(100, ((c.remaining ?? 0) / c.total) * 100)}
                              className="h-2"
                            />
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : classLimit ? (
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Clases restantes</span>
                        <span className="font-medium">
                          {classesRemaining ?? 0} de {classLimit}
                        </span>
                      </div>
                      <Progress value={classesProgress ?? 0} className="h-2" />
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">Clases ilimitadas activas</div>
                  )}

                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <Button className="sm:w-auto" asChild>
                      <Link to="/app/checkout">Renovar membresía</Link>
                    </Button>
                  </div>
                </>
              ) : (
                <div className="text-center text-muted-foreground py-8">
                  No tienes una membresía activa. Contacta al estudio para activarla.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </ClientLayout>
    </AuthGuard>
  );
}
