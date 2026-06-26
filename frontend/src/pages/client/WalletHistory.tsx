import { useQuery } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { ClientLayout } from '@/components/layout/ClientLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import api from '@/lib/api';
import { Link } from 'react-router-dom';

interface LoyaltyHistoryItem {
  id: string;
  points: number;
  type: string;
  description: string;
  created_at: string;
  class_name: string | null;
}

const formatActivityDate = (dateStr: string) => {
  try {
    const date = parseISO(dateStr);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'Hoy';
    if (diffDays === 1) return 'Ayer';
    return format(date, 'd MMM yyyy', { locale: es });
  } catch {
    return '';
  }
};

const getActivityLabel = (item: LoyaltyHistoryItem) => {
  if (item.class_name) return `Clase ${item.class_name}`;
  if (item.type === 'bonus') return item.description || 'Bono';
  if (item.type === 'redemption') return item.description || 'Canje';
  return item.description || 'Puntos';
};

export default function WalletHistory() {
  const { data, isLoading } = useQuery<{ history: LoyaltyHistoryItem[]; totalPoints: number }>({
    queryKey: ['loyalty-history'],
    queryFn: async () => (await api.get('/loyalty/my-history')).data,
  });

  return (
    <AuthGuard requiredRoles={['client']}>
      <ClientLayout>
        <div className="space-y-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-heading font-bold">Historial de puntos</h1>
              <p className="text-muted-foreground">Consulta tus movimientos recientes.</p>
            </div>
            <Button variant="ghost" asChild>
              <Link to="/app/wallet">Volver</Link>
            </Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Puntos actuales</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-primary">{data?.totalPoints ?? 0} pts</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Actividad</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {isLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : (data?.history || []).length > 0 ? (
                (data?.history || []).map((item) => (
                  <div key={item.id} className="flex items-center justify-between text-sm">
                    <div>
                      <p className="font-medium">{getActivityLabel(item)}</p>
                      <p className="text-xs text-muted-foreground">{formatActivityDate(item.created_at)}</p>
                    </div>
                    <span className={item.points > 0 ? 'text-success' : 'text-rose-600'}>
                      {item.points > 0 ? `+${item.points}` : item.points} pts
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground text-center py-6">
                  Aún no tienes movimientos. Asiste a clases para ganar puntos.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </ClientLayout>
    </AuthGuard>
  );
}
