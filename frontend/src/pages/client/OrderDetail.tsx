import { useState, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { ClientLayout } from '@/components/layout/ClientLayout';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import api from '@/lib/api';
import type { OrderWithProofs, OrderStatus, BankInfo } from '@/types/order';
import {
  ArrowLeft,
  Building2,
  Upload,
  FileImage,
  CheckCircle2,
  Clock,
  XCircle,
  AlertCircle,
  Copy,
  ExternalLink,
  Trash2,
  ImageIcon,
  FileText,
  X,
  CreditCard,
} from 'lucide-react';

const statusConfig: Record<OrderStatus, { label: string; icon: typeof Clock; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  pending_payment: { label: 'Esperando pago', icon: Clock, variant: 'secondary' },
  pending_verification: { label: 'En revisión', icon: AlertCircle, variant: 'outline' },
  approved: { label: 'Aprobado', icon: CheckCircle2, variant: 'default' },
  rejected: { label: 'Rechazado', icon: XCircle, variant: 'destructive' },
  cancelled: { label: 'Cancelado', icon: XCircle, variant: 'secondary' },
};

export default function OrderDetail() {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [transferReference, setTransferReference] = useState('');
  const [transferDate, setTransferDate] = useState('');
  const [proofNotes, setProofNotes] = useState('');
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  
  // Fetch order details
  const { data: order, isLoading } = useQuery<OrderWithProofs>({
    queryKey: ['order', orderId],
    queryFn: async () => (await api.get(`/orders/${orderId}`)).data,
    enabled: !!orderId,
  });
  
  // Fetch bank info
  const { data: bankInfo } = useQuery<BankInfo>({
    queryKey: ['bank-info'],
    queryFn: async () => (await api.get('/settings/bank-info')).data,
    enabled: order?.payment_method === 'bank_transfer',
  });
  
  // Upload proof mutation
  const uploadProof = useMutation({
    mutationFn: async () => {
      if (!orderId) throw new Error('No order selected');
      
      // Convert file to base64 if present
      let fileData = null;
      if (selectedFile) {
        fileData = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(selectedFile);
        });
      }
      
      const res = await api.post(`/orders/${orderId}/upload-proof`, {
        transfer_reference: transferReference || '',
        transfer_date: transferDate || null,
        notes: proofNotes || '',
        file_data: fileData,
        file_name: selectedFile?.name || null,
        file_type: selectedFile?.type || null,
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order', orderId] });
      queryClient.invalidateQueries({ queryKey: ['my-orders'] });
      toast({
        title: '¡Transferencia registrada!',
        description: 'Tu pago está en revisión. Te notificaremos cuando sea validado.',
      });
      setTransferReference('');
      setTransferDate('');
      setProofNotes('');
      setSelectedFile(null);
      setFilePreview(null);
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.response?.data?.error || 'No se pudo registrar la transferencia',
        variant: 'destructive',
      });
    },
  });
  
  // Cancel order mutation
  const cancelOrder = useMutation({
    mutationFn: async () => {
      if (!orderId) throw new Error('No order selected');
      const res = await api.post(`/orders/${orderId}/cancel`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order', orderId] });
      queryClient.invalidateQueries({ queryKey: ['my-orders'] });
      toast({
        title: 'Orden cancelada',
        description: 'La orden ha sido cancelada exitosamente.',
      });
      navigate('/app/orders');
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.response?.data?.error || 'No se pudo cancelar la orden',
        variant: 'destructive',
      });
    },
  });
  
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Validate file type
    const validTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp', 'application/pdf'];
    if (!validTypes.includes(file.type)) {
      toast({
        title: 'Tipo de archivo no válido',
        description: 'Solo se permiten imágenes (JPG, PNG, WebP) o PDF',
        variant: 'destructive',
      });
      return;
    }
    
    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: 'Archivo demasiado grande',
        description: 'El archivo no debe superar los 5MB',
        variant: 'destructive',
      });
      return;
    }
    
    setSelectedFile(file);
    
    // Create preview for images
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = () => setFilePreview(reader.result as string);
      reader.readAsDataURL(file);
    } else {
      setFilePreview(null);
    }
  };
  
  const removeFile = () => {
    setSelectedFile(null);
    setFilePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };
  
  const handleUpload = async () => {
    if (!selectedFile) {
      toast({
        title: 'Comprobante requerido',
        description: 'Por favor sube una imagen o PDF de tu comprobante de pago.',
        variant: 'destructive',
      });
      return;
    }
    setUploading(true);
    try {
      await uploadProof.mutateAsync();
    } finally {
      setUploading(false);
    }
  };
  
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: 'Copiado al portapapeles' });
  };
  
  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
    }).format(price);
  };
  
  if (isLoading) {
    return (
      <AuthGuard requiredRoles={['client']}>
        <ClientLayout>
          <div className="max-w-2xl mx-auto space-y-6">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-64 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        </ClientLayout>
      </AuthGuard>
    );
  }
  
  if (!order) {
    return (
      <AuthGuard requiredRoles={['client']}>
        <ClientLayout>
          <div className="max-w-2xl mx-auto text-center py-12">
            <p className="text-muted-foreground">Orden no encontrada</p>
            <Button asChild className="mt-4">
              <Link to="/app/orders">Ver mis órdenes</Link>
            </Button>
          </div>
        </ClientLayout>
      </AuthGuard>
    );
  }
  
  const statusInfo = statusConfig[order.status];
  const canUploadProof = order.status === 'pending_payment' && order.payment_method === 'bank_transfer';
  const hasProofs = order.payment_proofs && order.payment_proofs.length > 0;
  const canPayWithCard = order.status === 'pending_payment';
  
  return (
    <AuthGuard requiredRoles={['client']}>
      <ClientLayout>
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/app/orders')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex-1">
              <h1 className="text-2xl font-heading font-bold">Orden {order.order_number}</h1>
              <p className="text-muted-foreground">
                Creada el {format(parseISO(order.created_at), "d 'de' MMMM, yyyy 'a las' HH:mm", { locale: es })}
              </p>
            </div>
            <Badge variant={statusInfo.variant} className="flex items-center gap-1">
              <statusInfo.icon className="h-3 w-3" />
              {statusInfo.label}
            </Badge>
          </div>
          
          {/* Order Details Card */}
          <Card className="rounded-[1.25rem]">
            <CardHeader>
              <CardTitle className="text-lg">Detalles de la orden</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{order.plan_name}</p>
                  <p className="text-sm text-muted-foreground">
                    {order.plan_credits
                      ? `${order.plan_credits} clases`
                      : 'Clases ilimitadas'}
                    {' · '}
                    {order.plan_duration_days} días
                  </p>
                </div>
                <p className="font-medium">{formatPrice(order.subtotal)}</p>
              </div>
              
              <Separator />
              
              <div className="space-y-2 text-sm">
                <div className="flex justify-between font-bold text-base">
                  <span>Total a pagar</span>
                  <span className="text-primary">{formatPrice(order.total)}</span>
                </div>
              </div>
              
              {order.notes && (
                <>
                  <Separator />
                  <div>
                    <p className="text-sm text-muted-foreground">Notas</p>
                    <p className="text-sm">{order.notes}</p>
                  </div>
                </>
              )}
              
              {order.admin_notes && (
                <>
                  <Separator />
                  <div className="rounded-lg bg-muted/50 p-3">
                    <p className="text-sm text-muted-foreground">Mensaje del administrador</p>
                    <p className="text-sm">{order.admin_notes}</p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
          
          {/* Stripe card payment */}
          {canPayWithCard && (
            <Card className="rounded-[1.75rem] border-balance-sand/65 bg-[hsl(var(--card))]/88">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <CreditCard className="h-5 w-5 text-balance-olive" />
                  Pagar con tarjeta
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  Serás redirigido a Stripe para completar tu pago de forma segura.
                </p>
                <Button
                  className="w-full rounded-full bg-balance-olive text-balance-cream hover:bg-balance-olive/90"
                  onClick={async () => {
                    try {
                      if (order.checkout_url) {
                        window.location.href = order.checkout_url;
                        return;
                      }
                      const res = await api.post(`/orders/${order.id}/pay-with-card`);
                      if (res.data?.checkout_url) {
                        window.location.href = res.data.checkout_url;
                      }
                    } catch (err: any) {
                      toast({
                        title: 'Error',
                        description: err.response?.data?.error || 'No se pudo generar el checkout',
                        variant: 'destructive',
                      });
                    }
                  }}
                >
                  <CreditCard className="h-4 w-4 mr-2" />
                  Ir a pagar
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Bank Transfer Instructions */}
          {order.payment_method === 'bank_transfer' && bankInfo && canUploadProof && (
            <Card className="rounded-[1.25rem]">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  Datos para transferencia
                </CardTitle>
                <CardDescription>
                  Realiza tu transferencia a la siguiente cuenta
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div>
                      <p className="text-xs text-muted-foreground">Banco</p>
                      <p className="font-medium">{bankInfo.bank_name}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div>
                      <p className="text-xs text-muted-foreground">Titular</p>
                      <p className="font-medium">{bankInfo.account_holder}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => copyToClipboard(bankInfo.account_holder)}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  
                  {bankInfo.account_number && (
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div>
                      <p className="text-xs text-muted-foreground">Número de cuenta</p>
                      <p className="font-medium font-mono">{bankInfo.account_number}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => copyToClipboard(bankInfo.account_number)}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  )}

                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div>
                      <p className="text-xs text-muted-foreground">CLABE interbancaria</p>
                      <p className="font-medium font-mono">{bankInfo.clabe}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => copyToClipboard(bankInfo.clabe)}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  
                  <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
                    <p className="text-xs text-muted-foreground">Monto a transferir</p>
                    <p className="font-bold text-lg text-primary">{formatPrice(order.total)}</p>
                  </div>
                </div>
                
                {bankInfo.reference_instructions && (
                  <div className="text-sm text-muted-foreground">
                    <p className="font-medium">Instrucciones adicionales:</p>
                    <p>{bankInfo.reference_instructions}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
          
          {/* Upload Proof Section */}
          {canUploadProof && (
            <Card className="rounded-[1.25rem]">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Upload className="h-5 w-5" />
                  Confirmar transferencia
                </CardTitle>
                <CardDescription>
                  Una vez realizada la transferencia, sube tu comprobante y llena los datos
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* File upload */}
                <div className="space-y-2">
                  <Label>Comprobante de pago (imagen o PDF) *</Label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/jpg,image/webp,application/pdf"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  
                  {!selectedFile ? (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full border-2 border-dashed border-muted-foreground/30 rounded-[1rem] p-8 hover:border-primary/50 hover:bg-muted/50 transition-colors app-soft-shadow"
                    >
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <Upload className="h-8 w-8" />
                        <span className="font-medium">Haz clic para subir tu comprobante</span>
                        <span className="text-xs">JPG, PNG, WebP o PDF (máx. 5MB)</span>
                      </div>
                    </button>
                  ) : (
                    <div className="relative border rounded-[1rem] p-4 app-soft-shadow">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="absolute top-2 right-2 h-6 w-6"
                        onClick={removeFile}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                      
                      {filePreview ? (
                        <div className="flex flex-col items-center gap-2">
                          <img 
                            src={filePreview} 
                            alt="Preview" 
                            className="max-h-48 rounded object-contain"
                          />
                          <p className="text-sm text-muted-foreground">{selectedFile.name}</p>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3">
                          <FileText className="h-10 w-10 text-red-500" />
                          <div>
                            <p className="font-medium">{selectedFile.name}</p>
                            <p className="text-sm text-muted-foreground">
                              {(selectedFile.size / 1024).toFixed(1)} KB
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                
                {/* Transfer details */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="reference">Referencia de transferencia</Label>
                    <Input
                      id="reference"
                      placeholder="Ej: 12345678"
                      value={transferReference}
                      onChange={(e) => setTransferReference(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="date">Fecha de transferencia</Label>
                    <Input
                      id="date"
                      type="date"
                      value={transferDate}
                      onChange={(e) => setTransferDate(e.target.value)}
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="proofNotes">Notas adicionales (opcional)</Label>
                  <Textarea
                    id="proofNotes"
                    placeholder="¿Algún comentario sobre el pago?"
                    value={proofNotes}
                    onChange={(e) => setProofNotes(e.target.value)}
                    rows={2}
                  />
                </div>
              </CardContent>
              <CardFooter>
                <Button
                  onClick={handleUpload}
                  disabled={!selectedFile || uploading}
                  className="w-full"
                >
                  {uploading ? (
                    'Enviando...'
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      Enviar comprobante
                    </>
                  )}
                </Button>
              </CardFooter>
            </Card>
          )}
          
          {/* Uploaded Proofs */}
          {hasProofs && (
            <Card className="rounded-[1.25rem]">
              <CardHeader>
                <CardTitle className="text-lg">Comprobantes enviados</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {order.payment_proofs.map((proof, index) => {
                  const isBase64Image = proof.file_url?.startsWith('data:image/');
                  const isImage = isBase64Image || proof.file_type?.startsWith('image/');
                  
                  return (
                    <div
                      key={proof.id || index}
                      className="p-3 rounded-lg border"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <FileImage className="h-8 w-8 text-muted-foreground" />
                          <div>
                            <p className="font-medium text-sm">
                              {proof.file_name || `Comprobante ${index + 1}`}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {format(parseISO(proof.uploaded_at), "d MMM yyyy, HH:mm", { locale: es })}
                              {proof.transfer_reference && ` · Ref: ${proof.transfer_reference}`}
                            </p>
                          </div>
                        </div>
                      </div>
                      
                      {/* Preview image */}
                      {isImage && proof.file_url && (
                        <div className="mt-3">
                          <img 
                            src={proof.file_url} 
                            alt="Comprobante de pago"
                            className="max-h-64 w-full rounded-lg border object-contain cursor-pointer hover:opacity-90 transition-opacity"
                            onClick={() => setImagePreview(proof.file_url)}
                          />
                          <p className="text-xs text-center text-muted-foreground mt-1">
                            Click para ampliar
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}
          
          {/* Status Messages */}
          {order.status === 'pending_verification' && (
            <Card className="rounded-[1.25rem] border-yellow-500/50 bg-yellow-500/5">
              <CardContent className="py-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
                  <div>
                    <p className="font-medium text-yellow-800">En revisión</p>
                    <p className="text-sm text-yellow-700">
                      Tu comprobante está siendo revisado. Te notificaremos cuando sea validado.
                      Esto puede tomar hasta 24 horas hábiles.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
          
          {order.status === 'approved' && (
            <Card className="rounded-[1.25rem] border-success/50 bg-success/5">
              <CardContent className="py-4">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-success mt-0.5" />
                  <div>
                    <p className="font-medium text-success">¡Pago aprobado!</p>
                    <p className="text-sm text-success">
                      Tu membresía ha sido activada. Ya puedes reservar clases.
                    </p>
                    <Button asChild className="mt-3" size="sm">
                      <Link to="/app/classes">Reservar clase</Link>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
          
          {order.status === 'rejected' && (
            <Card className="rounded-[1.25rem] border-red-500/50 bg-red-500/5">
              <CardContent className="py-4">
                <div className="flex items-start gap-3">
                  <XCircle className="h-5 w-5 text-red-600 mt-0.5" />
                  <div>
                    <p className="font-medium text-red-800">Pago rechazado</p>
                    <p className="text-sm text-red-700">
                      {order.admin_notes || 'Tu comprobante no pudo ser validado. Por favor contacta al estudio.'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
          
          {/* Actions */}
          <div className="flex gap-3">
            <Button variant="outline" asChild className="flex-1">
              <Link to="/app/orders">Ver mis órdenes</Link>
            </Button>
            {order.status === 'approved' && (
              <Button asChild className="flex-1">
                <Link to="/app/classes">Reservar clase</Link>
              </Button>
            )}
            {order.status === 'pending_payment' && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" className="flex-1">
                    <Trash2 className="h-4 w-4 mr-2" />
                    Cancelar orden
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>¿Cancelar esta orden?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Esta acción no se puede deshacer. La orden {order.order_number} será cancelada permanentemente.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>No, mantener orden</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => cancelOrder.mutate()}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Sí, cancelar orden
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>

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
      </ClientLayout>
    </AuthGuard>
  );
}
