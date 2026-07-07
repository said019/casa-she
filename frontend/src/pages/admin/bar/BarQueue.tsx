import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import api from '@/lib/api';
import { Coffee, Clock } from 'lucide-react';

interface OrderItem {
    name: string;
    qty: number;
}

interface BarOrder {
    id: string;
    user_name: string;
    pickup_time: string | null;
    payment_method: string;
    payment_status: string;
    status: 'pending' | 'preparing' | 'ready' | 'delivered' | 'cancelled';
    items: OrderItem[];
}

const NEXT: Record<string, string> = {
    pending: 'preparing',
    preparing: 'ready',
    ready: 'delivered',
};

const LABEL: Record<string, string> = {
    pending: 'Empezar',
    preparing: 'Lista',
    ready: 'Entregada',
};

const STATUS_COLOR: Record<string, string> = {
    pending: 'bg-amber-100 text-amber-800',
    preparing: 'bg-blue-100 text-blue-800',
    ready: 'bg-green-100 text-green-800',
};

const STATUS_LABEL: Record<string, string> = {
    pending: 'Pendiente',
    preparing: 'Preparando',
    ready: 'Lista',
};

function formatPickupTime(pickup: string | null): string {
    if (!pickup) return 'Lo antes posible';
    const d = new Date(pickup);
    const now = new Date();
    const diffMs = d.getTime() - now.getTime();
    if (diffMs <= 0) return 'Ahora';
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'Menos de 1 min';
    if (diffMin < 60) return `En ${diffMin} min`;
    return d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}

export default function BarQueue() {
    const qc = useQueryClient();
    const { toast } = useToast();

    const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
    const [cancelTargetId, setCancelTargetId] = useState<string | null>(null);
    const [cancelReason, setCancelReason] = useState('');

    const { data: queue = [], isLoading } = useQuery<BarOrder[]>({
        queryKey: ['bar-queue'],
        queryFn: async () => (await api.get('/bar/orders/queue')).data,
        refetchInterval: 15000,
    });

    const move = useMutation({
        mutationFn: async ({ id, status, reason }: { id: string; status: string; reason?: string }) =>
            api.patch(`/bar/orders/${id}/status`, { status, cancellationReason: reason }),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['bar-queue'] }),
        onError: () => toast({ title: 'Error al actualizar estado', variant: 'destructive' }),
    });

    const charge = useMutation({
        mutationFn: async (id: string) => api.post(`/bar/orders/${id}/charge`),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['bar-queue'] });
            toast({ title: 'Cobro registrado' });
        },
        onError: () => toast({ title: 'Error al cobrar', variant: 'destructive' }),
    });

    function openCancelDialog(id: string) {
        setCancelTargetId(id);
        setCancelReason('');
        setCancelDialogOpen(true);
    }

    function confirmCancel() {
        if (!cancelTargetId || !cancelReason.trim()) return;
        move.mutate({ id: cancelTargetId, status: 'cancelled', reason: cancelReason.trim() });
        setCancelDialogOpen(false);
        setCancelTargetId(null);
        setCancelReason('');
    }

    return (
        <AuthGuard requiredRoles={['admin', 'super_admin', 'reception']}>
            <AdminLayout>
                <div className="space-y-6">
                    <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 items-center justify-center rounded-[1rem] bg-[#2A4E36]/10 text-[#2A4E36]">
                            <Coffee className="h-5 w-5" />
                        </span>
                        <div>
                            <h2 className="font-heading text-xl font-semibold tracking-tight text-balance-dark">
                                Cola de la Barra
                            </h2>
                            <p className="text-sm text-muted-foreground">
                                Pedidos activos — actualización automática cada 15 s
                            </p>
                        </div>
                    </div>

                    {isLoading && (
                        <div className="flex items-center justify-center py-16 text-muted-foreground">
                            Cargando pedidos…
                        </div>
                    )}

                    {!isLoading && queue.length === 0 && (
                        <Card className="border-balance-sand/60">
                            <CardContent className="flex flex-col items-center justify-center py-16 text-balance-dark/55">
                                <Coffee className="mb-3 h-10 w-10 opacity-30" />
                                <p className="text-sm font-medium">Sin pedidos activos</p>
                            </CardContent>
                        </Card>
                    )}

                    {queue.length > 0 && (
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                            {queue.map((order) => {
                                const needsCharge =
                                    order.payment_method === 'reception' &&
                                    order.payment_status !== 'paid';

                                return (
                                    <Card
                                        key={order.id}
                                        className="flex flex-col border-balance-sand/60 shadow-sm"
                                    >
                                        <CardHeader className="pb-3">
                                            <div className="flex items-start justify-between gap-2">
                                                <CardTitle className="text-sm font-semibold leading-snug text-balance-dark">
                                                    {order.user_name}
                                                </CardTitle>
                                                <Badge
                                                    className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_COLOR[order.status] ?? ''}`}
                                                >
                                                    {STATUS_LABEL[order.status] ?? order.status}
                                                </Badge>
                                            </div>
                                            <div className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                                                <Clock className="h-3.5 w-3.5" />
                                                {formatPickupTime(order.pickup_time)}
                                            </div>
                                        </CardHeader>

                                        <CardContent className="flex flex-1 flex-col gap-3">
                                            <ul className="space-y-1 text-sm text-balance-dark/80">
                                                {order.items.map((item, i) => (
                                                    <li key={i} className="flex justify-between">
                                                        <span>{item.name}</span>
                                                        <span className="font-medium">×{item.qty}</span>
                                                    </li>
                                                ))}
                                            </ul>

                                            <div className="flex flex-wrap items-center gap-1.5 pt-1">
                                                <Badge
                                                    variant="outline"
                                                    className="rounded-full px-2.5 py-0.5 text-[11px]"
                                                >
                                                    {order.payment_method === 'reception'
                                                        ? 'Pago en barra'
                                                        : 'Tarjeta'}
                                                </Badge>
                                                {order.payment_status === 'paid' && (
                                                    <Badge className="rounded-full bg-green-100 px-2.5 py-0.5 text-[11px] font-semibold text-green-800">
                                                        Pagado
                                                    </Badge>
                                                )}
                                            </div>

                                            <div className="mt-auto flex flex-wrap gap-2 pt-2">
                                                {NEXT[order.status] && (
                                                    <Button
                                                        size="sm"
                                                        className="flex-1 bg-[#2A4E36] text-white hover:bg-[#2A4E36]/90"
                                                        disabled={move.isPending}
                                                        onClick={() =>
                                                            move.mutate({
                                                                id: order.id,
                                                                status: NEXT[order.status],
                                                            })
                                                        }
                                                    >
                                                        {LABEL[order.status]}
                                                    </Button>
                                                )}

                                                {needsCharge && (
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        className="flex-1 border-[#2A4E36] text-[#2A4E36] hover:bg-[#2A4E36]/8"
                                                        disabled={charge.isPending}
                                                        onClick={() => charge.mutate(order.id)}
                                                    >
                                                        Cobrar
                                                    </Button>
                                                )}

                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    className="border-destructive/50 text-destructive hover:bg-destructive/5"
                                                    disabled={move.isPending}
                                                    onClick={() => openCancelDialog(order.id)}
                                                >
                                                    Cancelar
                                                </Button>
                                            </div>
                                        </CardContent>
                                    </Card>
                                );
                            })}
                        </div>
                    )}
                </div>

                <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
                    <DialogContent className="rounded-[1.25rem]">
                        <DialogHeader>
                            <DialogTitle>Cancelar pedido</DialogTitle>
                        </DialogHeader>
                        <div className="py-2">
                            <p className="mb-3 text-sm text-muted-foreground">
                                Indica el motivo de cancelación (requerido).
                            </p>
                            <Textarea
                                placeholder="Ej. Producto agotado, error del cliente…"
                                value={cancelReason}
                                onChange={(e) => setCancelReason(e.target.value)}
                                rows={3}
                            />
                        </div>
                        <DialogFooter className="gap-2">
                            <Button
                                variant="outline"
                                onClick={() => setCancelDialogOpen(false)}
                            >
                                Volver
                            </Button>
                            <Button
                                variant="destructive"
                                disabled={!cancelReason.trim() || move.isPending}
                                onClick={confirmCancel}
                            >
                                Confirmar cancelación
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </AdminLayout>
        </AuthGuard>
    );
}
