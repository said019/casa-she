import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import api from '@/lib/api';
import type { OrderWithProofs, OrderStatus } from '@/types/order';
import {
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  Eye,
  FileImage,
  ExternalLink,
  Receipt,
  User,
  Calendar,
  CreditCard,
  Download,
} from 'lucide-react';

const statusConfig: Record<OrderStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  pending_payment: { label: 'Esperando pago', variant: 'secondary' },
  pending_verification: { label: 'Por verificar', variant: 'outline' },
  approved: { label: 'Aprobado', variant: 'default' },
  rejected: { label: 'Rechazado', variant: 'destructive' },
  cancelled: { label: 'Cancelado', variant: 'secondary' },
};

/** Embeddable content version (no AuthGuard/AdminLayout wrapper) */
export function OrdersVerificationContent() {
  return <OrdersVerificationInner />;
}

export default function OrdersVerification() {
  return (
    <AuthGuard requiredRoles={['admin', 'super_admin', 'reception']}>
      <AdminLayout>
        <OrdersVerificationInner />
      </AdminLayout>
    </AuthGuard>
  );
}

function OrdersVerificationInner() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedOrder, setSelectedOrder] = useState<OrderWithProofs | null>(null);
  const [adminNotes, setAdminNotes] = useState('');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [actionType, setActionType] = useState<'approve' | 'reject' | null>(null);
  
  // Fetch pending orders
  const { data: orders, isLoading } = useQuery<OrderWithProofs[]>({
    queryKey: ['orders-pending'],
    queryFn: async () => (await api.get('/orders/pending')).data,
  });
  
  // Approve mutation
  const approveMutation = useMutation({
    mutationFn: async (orderId: string) => {
      const res = await api.post(`/orders/${orderId}/approve`, { admin_notes: adminNotes || undefined });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders-pending'] });
      toast({
        title: 'Pago aprobado',
        description: 'La membresía ha sido activada automáticamente.',
      });
      setSelectedOrder(null);
      setAdminNotes('');
      setActionType(null);
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.response?.data?.error || 'No se pudo aprobar el pago',
        variant: 'destructive',
      });
    },
  });
  
  // Reject mutation
  const rejectMutation = useMutation({
    mutationFn: async (orderId: string) => {
      const res = await api.post(`/orders/${orderId}/reject`, { admin_notes: adminNotes || undefined });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders-pending'] });
      toast({
        title: 'Pago rechazado',
        description: 'Se ha notificado al usuario.',
      });
      setSelectedOrder(null);
      setAdminNotes('');
      setActionType(null);
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.response?.data?.error || 'No se pudo rechazar el pago',
        variant: 'destructive',
      });
    },
  });
  
  const handleAction = () => {
    if (!selectedOrder || !actionType) return;
    
    if (actionType === 'approve') {
      approveMutation.mutate(selectedOrder.id);
    } else {
      rejectMutation.mutate(selectedOrder.id);
    }
  };
  
  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
    }).format(price);
  };
  
  const pendingVerification = orders?.filter(o => o.status === 'pending_verification') || [];
  const pendingPayment = orders?.filter(o => o.status === 'pending_payment') || [];

  return (
    <>
        <div className="space-y-6">
          {/* Stats */}
          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardContent className="py-4">
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-full bg-orange-100 flex items-center justify-center">
                    <AlertCircle className="h-6 w-6 text-orange-600" />
                  </div>
                  <div>
                    <p className="text-xl sm:text-2xl font-bold tabular-nums truncate">{pendingVerification.length}</p>
                    <p className="text-sm text-muted-foreground">Por verificar</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-4">
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                    <Clock className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-xl sm:text-2xl font-bold tabular-nums truncate">{pendingPayment.length}</p>
                    <p className="text-sm text-muted-foreground">Esperando pago</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
          
          {/* Pending Verification Table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-orange-500" />
                Comprobantes por verificar
              </CardTitle>
              <CardDescription>
                Órdenes con comprobante de pago que requieren validación
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : pendingVerification.length > 0 ? (
                <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Orden</TableHead>
                      <TableHead>Usuario</TableHead>
                      <TableHead>Plan</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead>Fecha</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingVerification.map((order) => (
                      <TableRow key={order.id}>
                        <TableCell>
                          <div className="font-mono text-sm">{order.order_number}</div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{order.user_name}</p>
                            <p className="text-xs text-muted-foreground">{order.user_email}</p>
                          </div>
                        </TableCell>
                        <TableCell>{order.plan_name}</TableCell>
                        <TableCell className="font-medium">{formatPrice(order.total)}</TableCell>
                        <TableCell>
                          {format(parseISO(order.created_at), 'd MMM', { locale: es })}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSelectedOrder(order)}
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            Revisar
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                </div>
              ) : (
                <div className="text-center py-8">
                  <CheckCircle2 className="h-12 w-12 mx-auto text-success mb-3" />
                  <p className="text-muted-foreground">No hay comprobantes pendientes de verificar</p>
                </div>
              )}
            </CardContent>
          </Card>
          
          {/* Pending Payment Table */}
          {pendingPayment.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Clock className="h-5 w-5 text-muted-foreground" />
                  Esperando pago
                </CardTitle>
                <CardDescription>
                  Órdenes creadas que aún no tienen comprobante
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Orden</TableHead>
                      <TableHead>Usuario</TableHead>
                      <TableHead>Plan</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead>Método</TableHead>
                      <TableHead>Creada</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingPayment.map((order) => (
                      <TableRow key={order.id}>
                        <TableCell>
                          <div className="font-mono text-sm">{order.order_number}</div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{order.user_name}</p>
                            <p className="text-xs text-muted-foreground">{order.user_email}</p>
                          </div>
                        </TableCell>
                        <TableCell>{order.plan_name}</TableCell>
                        <TableCell className="font-medium">{formatPrice(order.total)}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">
                            {order.payment_method === 'bank_transfer' ? 'Transferencia' :
                             order.payment_method === 'cash' ? 'Efectivo' :
                             order.payment_method === 'card' ? 'Tarjeta' :
                             order.payment_method === 'online' ? 'En línea' :
                             order.payment_method || '—'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {format(parseISO(order.created_at), 'd MMM HH:mm', { locale: es })}
                        </TableCell>
                        <TableCell className="text-right">
                          {order.payment_method === 'card' ? (
                            // Las órdenes con tarjeta se liquidan automáticamente por el
                            // webhook de Stripe (checkout hospedado) — nunca se aprueban a mano.
                            <Badge variant="outline" className="text-muted-foreground">
                              Esperando pago en Stripe
                            </Badge>
                          ) : (
                            <div className="flex gap-2 justify-end">
                              <Button
                                size="sm"
                                onClick={() => {
                                  setSelectedOrder(order);
                                  setActionType('approve');
                                }}
                              >
                                <CheckCircle2 className="h-4 w-4 mr-1" />
                                Aprobar
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setSelectedOrder(order);
                                  setActionType('reject');
                                }}
                              >
                                <XCircle className="h-4 w-4 mr-1" />
                                Rechazar
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
        
        {/* Order Detail Dialog */}
        <Dialog open={!!selectedOrder} onOpenChange={(open) => !open && setSelectedOrder(null)}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            {selectedOrder && (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Receipt className="h-5 w-5" />
                    Orden {selectedOrder.order_number}
                  </DialogTitle>
                  <DialogDescription>
                    Revisa los detalles y el comprobante de pago
                  </DialogDescription>
                </DialogHeader>
                
                <div className="space-y-4">
                  {/* Customer Info */}
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                    <User className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="font-medium">{selectedOrder.user_name}</p>
                      <p className="text-sm text-muted-foreground">{selectedOrder.user_email}</p>
                      {selectedOrder.user_phone && (
                        <p className="text-sm text-muted-foreground">{selectedOrder.user_phone}</p>
                      )}
                    </div>
                  </div>
                  
                  {/* Order Details */}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="p-3 rounded-lg border">
                      <p className="text-xs text-muted-foreground">Plan</p>
                      <p className="font-medium">{selectedOrder.plan_name}</p>
                      <p className="text-sm text-muted-foreground">
                        {selectedOrder.plan_credits 
                          ? `${selectedOrder.plan_credits} clases` 
                          : 'Ilimitado'}
                        {' · '}
                        {selectedOrder.plan_duration_days} días
                      </p>
                    </div>
                    <div className="p-3 rounded-lg border">
                      <p className="text-xs text-muted-foreground">Total a pagar</p>
                      <p className="text-xl font-bold text-primary">{formatPrice(selectedOrder.total)}</p>
                    </div>
                  </div>
                  
                  {/* Order meta */}
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Calendar className="h-4 w-4" />
                      {format(parseISO(selectedOrder.created_at), "d MMM yyyy, HH:mm", { locale: es })}
                    </div>
                    <div className="flex items-center gap-1">
                      <CreditCard className="h-4 w-4" />
                      {selectedOrder.payment_method === 'bank_transfer' ? 'Transferencia' :
                       selectedOrder.payment_method === 'cash' ? 'Efectivo' :
                       selectedOrder.payment_method === 'card' ? 'Tarjeta' :
                       selectedOrder.payment_method === 'online' ? 'En línea' :
                       selectedOrder.payment_method || '—'}
                    </div>
                  </div>
                  
                  {selectedOrder.notes && (
                    <div className="p-3 rounded-lg bg-muted/30">
                      <p className="text-xs text-muted-foreground mb-1">Notas del usuario</p>
                      <p className="text-sm">{selectedOrder.notes}</p>
                    </div>
                  )}
                  
                  <Separator />
                  
                  {/* Payment Proofs */}
                  <div>
                    <h4 className="font-medium mb-3 flex items-center gap-2">
                      <FileImage className="h-4 w-4" />
                      Comprobantes de pago
                    </h4>
                    {selectedOrder.payment_proofs && selectedOrder.payment_proofs.length > 0 ? (
                      <div className="space-y-3">
                        {selectedOrder.payment_proofs.map((proof, index) => {
                          // Check if file_url is base64 image
                          const isBase64Image = proof.file_url?.startsWith('data:image/');
                          const isBase64Pdf = proof.file_url?.startsWith('data:application/pdf');
                          const isImage = isBase64Image || proof.file_type?.startsWith('image/');
                          
                          const downloadProof = () => {
                            if (!proof.file_url) return;
                            const a = document.createElement('a');
                            a.href = proof.file_url;
                            const ext = isBase64Image
                              ? (proof.file_url.match(/data:image\/(\w+)/)?.[1] || 'png')
                              : isBase64Pdf
                              ? 'pdf'
                              : '';
                            const fallback = `comprobante-${selectedOrder.order_number}-${index + 1}${ext ? `.${ext}` : ''}`;
                            a.download = proof.file_name || fallback;
                            document.body.appendChild(a);
                            a.click();
                            document.body.removeChild(a);
                          };

                          return (
                            <div key={proof.id || index} className="p-3 rounded-lg border">
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex-1">
                                  <p className="font-medium text-sm">{proof.file_name || `Comprobante ${index + 1}`}</p>
                                  <div className="text-xs text-muted-foreground space-y-0.5 mt-1">
                                    <p>Subido: {format(parseISO(proof.uploaded_at), "d MMM yyyy, HH:mm", { locale: es })}</p>
                                    {proof.transfer_reference && <p>Referencia: {proof.transfer_reference}</p>}
                                    {proof.notes && <p>Notas: {proof.notes}</p>}
                                  </div>
                                </div>
                                {proof.file_url && (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={downloadProof}
                                    className="shrink-0"
                                  >
                                    <Download className="h-3.5 w-3.5 mr-1.5" />
                                    Descargar
                                  </Button>
                                )}
                              </div>
                              
                              {/* Preview image */}
                              {isImage && proof.file_url && (
                                <div className="mt-3">
                                  <img 
                                    src={proof.file_url} 
                                    alt="Comprobante de pago"
                                    className="max-h-96 w-full rounded-lg border object-contain cursor-pointer hover:opacity-90 transition-opacity"
                                    onClick={() => setImagePreview(proof.file_url)}
                                  />
                                  <p className="text-xs text-center text-muted-foreground mt-1">
                                    Click para ampliar
                                  </p>
                                </div>
                              )}
                              
                              {/* PDF notice */}
                              {isBase64Pdf && (
                                <div className="mt-3 p-4 bg-muted rounded-lg text-center">
                                  <FileImage className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                                  <p className="text-sm text-muted-foreground">Archivo PDF adjunto</p>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-center py-6 text-muted-foreground">
                        No hay comprobantes adjuntos
                      </div>
                    )}
                  </div>
                  
                  <Separator />
                  
                  {/* Admin Notes */}
                  <div className="space-y-2">
                    <Label htmlFor="admin-notes">Notas del administrador (opcional)</Label>
                    <Textarea
                      id="admin-notes"
                      placeholder="Agregar comentarios sobre la validación..."
                      value={adminNotes}
                      onChange={(e) => setAdminNotes(e.target.value)}
                      rows={2}
                    />
                  </div>
                </div>
                
                <DialogFooter className="flex-col sm:flex-row gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setActionType('reject');
                    }}
                    className="flex-1 sm:flex-none"
                  >
                    <XCircle className="h-4 w-4 mr-2" />
                    Rechazar
                  </Button>
                  <Button
                    onClick={() => {
                      setActionType('approve');
                    }}
                    className="flex-1 sm:flex-none"
                  >
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Aprobar pago
                  </Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>
        
        {/* Confirmation Dialog */}
        <Dialog open={!!actionType} onOpenChange={(open) => !open && setActionType(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {actionType === 'approve' ? '¿Aprobar este pago?' : '¿Rechazar este pago?'}
              </DialogTitle>
              <DialogDescription>
                {actionType === 'approve'
                  ? 'Se activará automáticamente la membresía del usuario.'
                  : 'Se notificará al usuario que su pago fue rechazado.'}
              </DialogDescription>
            </DialogHeader>
            
            {actionType === 'reject' && (
              <div className="space-y-2">
                <Label htmlFor="reject-reason">Motivo del rechazo</Label>
                <Textarea
                  id="reject-reason"
                  placeholder="Ej: El comprobante no coincide con el monto..."
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  rows={2}
                />
              </div>
            )}
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setActionType(null)}>
                Cancelar
              </Button>
              <Button
                variant={actionType === 'reject' ? 'destructive' : 'default'}
                onClick={handleAction}
                disabled={approveMutation.isPending || rejectMutation.isPending}
              >
                {approveMutation.isPending || rejectMutation.isPending
                  ? 'Procesando...'
                  : actionType === 'approve'
                  ? 'Confirmar aprobación'
                  : 'Confirmar rechazo'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Image Preview Lightbox */}
        <Dialog open={!!imagePreview} onOpenChange={(open) => !open && setImagePreview(null)}>
          <DialogContent className="max-w-4xl max-h-[90vh] p-2">
            <DialogHeader className="sr-only">
              <DialogTitle>Vista previa del comprobante</DialogTitle>
            </DialogHeader>
            {imagePreview && (
              <img 
                src={imagePreview} 
                alt="Comprobante de pago" 
                className="w-full h-auto max-h-[80vh] object-contain rounded-lg"
              />
            )}
          </DialogContent>
        </Dialog>
    </>
  );
}
