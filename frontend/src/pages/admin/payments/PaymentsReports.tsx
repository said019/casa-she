import { useQuery } from '@tanstack/react-query';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import api from '@/lib/api';
import { getPaymentMethodLabel } from '@/lib/paymentLabels';
import type { PaymentReportSummary } from '@/types/payment';

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 2,
  }).format(amount);

export default function PaymentsReports() {
  const { data, isLoading } = useQuery<PaymentReportSummary>({
    queryKey: ['payments-reports'],
    queryFn: async () => {
      const { data } = await api.get('/payments/reports');
      return data;
    },
  });

  return (
    <AuthGuard requiredRoles={['admin']}>
      <AdminLayout>
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-heading font-bold">Reportes de pagos</h1>
            <p className="text-muted-foreground">Resumen financiero de ingresos y pendientes.</p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Ingresos Totales</CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-8 w-24" />
                ) : (
                  <div className="text-xl sm:text-2xl font-bold tabular-nums truncate">{formatCurrency(data?.total_amount || 0)}</div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Pagos Completados</CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-8 w-24" />
                ) : (
                  <div className="text-xl sm:text-2xl font-bold tabular-nums truncate">{formatCurrency(data?.completed_amount || 0)}</div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Pagos Pendientes</CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-8 w-24" />
                ) : (
                  <div className="text-xl sm:text-2xl font-bold tabular-nums truncate">{formatCurrency(data?.pending_amount || 0)}</div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Totales por método</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {isLoading ? (
                <Skeleton className="h-6 w-full" />
              ) : data?.by_method?.length ? (
                data.by_method.map((method) => (
                  <div key={method.payment_method} className="flex items-center justify-between text-sm">
                    <span>{getPaymentMethodLabel(method.payment_method)}</span>
                    <span className="font-medium">{formatCurrency(method.total)}</span>
                  </div>
                ))
              ) : (
                <div className="text-sm text-muted-foreground">Sin datos disponibles.</div>
              )}
            </CardContent>
          </Card>
        </div>
      </AdminLayout>
    </AuthGuard>
  );
}
