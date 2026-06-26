import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { ClientLayout } from '@/components/layout/ClientLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import api from '@/lib/api';
import type { Order, OrderStatus } from '@/types/order';
import {
  ShoppingBag,
  ChevronRight,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Plus,
  Receipt,
  Trash2,
} from 'lucide-react';

const statusConfig: Record<OrderStatus, { label: string; icon: typeof Clock; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  pending_payment: { label: 'Esperando pago', icon: Clock, variant: 'secondary' },
  pending_verification: { label: 'En revisión', icon: AlertCircle, variant: 'outline' },
  approved: { label: 'Aprobado', icon: CheckCircle2, variant: 'default' },
  rejected: { label: 'Rechazado', icon: XCircle, variant: 'destructive' },
  cancelled: { label: 'Cancelado', icon: XCircle, variant: 'secondary' },
};

export default function Orders() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const { data: orders, isLoading } = useQuery<Order[]>({
    queryKey: ['my-orders'],
    queryFn: async () => (await api.get('/orders/my-orders')).data,
  });
  
  const cancelOrder = useMutation({
    mutationFn: async (orderId: string) => {
      const res = await api.post(`/orders/${orderId}/cancel`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-orders'] });
      toast({
        title: 'Orden cancelada',
        description: 'La orden ha sido cancelada exitosamente.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.response?.data?.error || 'No se pudo cancelar la orden',
        variant: 'destructive',
      });
    },
  });
  
  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
    }).format(price);
  };
  
  const pendingOrders = orders?.filter(
    o => o.status === 'pending_payment' || o.status === 'pending_verification'
  ) || [];
  
  const completedOrders = orders?.filter(
    o => o.status === 'approved' || o.status === 'rejected' || o.status === 'cancelled'
  ) || [];
  
  return (
    <AuthGuard requiredRoles={['client']}>
      <ClientLayout>
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-heading font-bold">Mis órdenes</h1>
              <p className="text-muted-foreground">Historial de compras y pagos</p>
            </div>
            <Button asChild className="w-full sm:w-auto">
              <Link to="/app/checkout">
                <Plus className="h-4 w-4 mr-2" />
                Nueva compra
              </Link>
            </Button>
          </div>
          
          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : orders && orders.length > 0 ? (
            <>
              {/* Pending Orders */}
              {pendingOrders.length > 0 && (
                <div className="space-y-3">
                  <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                    Pendientes ({pendingOrders.length})
                  </h2>
                  {pendingOrders.map((order) => {
                    const status = statusConfig[order.status];
                    return (
                      <Card key={order.id} className="hover:bg-muted/30 transition-colors">
                        <CardContent className="py-4">
                          <div className="flex items-center gap-4">
                            <Link to={`/app/orders/${order.id}`} className="flex-shrink-0">
                              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                                <Receipt className="h-6 w-6 text-primary" />
                              </div>
                            </Link>
                            <Link to={`/app/orders/${order.id}`} className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="font-medium truncate">{order.plan_name}</p>
                                <Badge variant={status.variant} className="flex items-center gap-1 text-xs">
                                  <status.icon className="h-3 w-3" />
                                  {status.label}
                                </Badge>
                              </div>
                              <p className="text-sm text-muted-foreground">
                                {order.order_number} · {format(parseISO(order.created_at), "d MMM yyyy", { locale: es })}
                              </p>
                            </Link>
                            <div className="text-right flex-shrink-0">
                              <p className="font-bold">{formatPrice(order.total)}</p>
                            </div>
                            {order.status === 'pending_payment' && (
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="flex-shrink-0 text-muted-foreground hover:text-destructive"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>¿Cancelar esta orden?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Esta acción no se puede deshacer. La orden {order.order_number} será cancelada.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>No, mantener</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => cancelOrder.mutate(order.id)}
                                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    >
                                      Sí, cancelar
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            )}
                            {order.status === 'pending_verification' && (
                              <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
              
              {/* Completed Orders */}
              {completedOrders.length > 0 && (
                <div className="space-y-3">
                  <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                    Historial ({completedOrders.length})
                  </h2>
                  {completedOrders.map((order) => {
                    const status = statusConfig[order.status];
                    return (
                      <Link key={order.id} to={`/app/orders/${order.id}`}>
                        <Card className="hover:bg-muted/30 transition-colors cursor-pointer">
                          <CardContent className="py-4">
                            <div className="flex items-center gap-4">
                              <div className="flex-shrink-0">
                                <div className={`h-12 w-12 rounded-full flex items-center justify-center ${
                                  order.status === 'approved' 
                                    ? 'bg-success/10' 
                                    : order.status === 'rejected'
                                    ? 'bg-red-100'
                                    : 'bg-muted'
                                }`}>
                                  {order.status === 'approved' ? (
                                    <CheckCircle2 className="h-6 w-6 text-success" />
                                  ) : order.status === 'rejected' ? (
                                    <XCircle className="h-6 w-6 text-red-600" />
                                  ) : (
                                    <Receipt className="h-6 w-6 text-muted-foreground" />
                                  )}
                                </div>
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <p className="font-medium truncate">{order.plan_name}</p>
                                  <Badge variant={status.variant} className="text-xs">
                                    {status.label}
                                  </Badge>
                                </div>
                                <p className="text-sm text-muted-foreground">
                                  {order.order_number} · {format(parseISO(order.created_at), "d MMM yyyy", { locale: es })}
                                </p>
                              </div>
                              <div className="text-right flex-shrink-0">
                                <p className="font-medium text-muted-foreground">{formatPrice(order.total)}</p>
                                <ChevronRight className="h-5 w-5 text-muted-foreground inline-block" />
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </Link>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <ShoppingBag className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">No tienes órdenes aún</h3>
                <p className="text-muted-foreground mb-4">
                  Compra una membresía para empezar a reservar clases.
                </p>
                <Button asChild>
                  <Link to="/app/checkout">
                    <Plus className="h-4 w-4 mr-2" />
                    Comprar membresía
                  </Link>
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </ClientLayout>
    </AuthGuard>
  );
}
