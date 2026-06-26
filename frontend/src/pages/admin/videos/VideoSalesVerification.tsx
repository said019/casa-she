import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
import {
    AlertCircle,
    CheckCircle2,
    Clock,
    Eye,
    FileImage,
    FileText,
    XCircle,
} from 'lucide-react';

type VideoPurchaseStatus =
    | 'pending_payment'
    | 'pending_verification'
    | 'approved'
    | 'rejected'
    | 'cancelled'
    | 'expired';

interface VideoPurchase {
    id: string;
    user_id: string;
    user_name?: string;
    user_email?: string;
    video_id: string;
    video_title?: string;
    video_thumbnail_url?: string;
    amount: number;
    currency: string;
    payment_method: string;
    status: VideoPurchaseStatus;
    payment_reference?: string | null;
    transfer_date?: string | null;
    has_proof: boolean;
    proof_file_url?: string | null;
    proof_file_name?: string | null;
    proof_file_type?: string | null;
    customer_notes?: string | null;
    admin_notes?: string | null;
    created_at: string;
    updated_at: string;
    expires_at?: string | null;
}

const statusConfig: Record<VideoPurchaseStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
    pending_payment: { label: 'Esperando pago', variant: 'secondary' },
    pending_verification: { label: 'Por verificar', variant: 'outline' },
    approved: { label: 'Aprobado', variant: 'default' },
    rejected: { label: 'Rechazado', variant: 'destructive' },
    cancelled: { label: 'Cancelado', variant: 'secondary' },
    expired: { label: 'Expirado', variant: 'secondary' },
};

export default function VideoSalesVerification() {
    const { toast } = useToast();
    const queryClient = useQueryClient();

    const [selectedPurchase, setSelectedPurchase] = useState<VideoPurchase | null>(null);
    const [adminNotes, setAdminNotes] = useState('');

    const { data: purchases, isLoading } = useQuery<VideoPurchase[]>({
        queryKey: ['video-purchases-pending'],
        queryFn: async () => (await api.get('/videos/purchases/pending')).data,
    });

    const approveMutation = useMutation({
        mutationFn: async (purchaseId: string) => {
            const res = await api.post(`/videos/purchases/${purchaseId}/approve`, {
                admin_notes: adminNotes || undefined,
            });
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['video-purchases-pending'] });
            toast({
                title: 'Compra aprobada',
                description: 'El video quedó desbloqueado para el usuario.',
            });
            setSelectedPurchase(null);
            setAdminNotes('');
        },
        onError: (error: any) => {
            toast({
                title: 'Error',
                description: error.response?.data?.error || 'No se pudo aprobar la compra',
                variant: 'destructive',
            });
        },
    });

    const rejectMutation = useMutation({
        mutationFn: async (purchaseId: string) => {
            const res = await api.post(`/videos/purchases/${purchaseId}/reject`, {
                admin_notes: adminNotes || undefined,
            });
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['video-purchases-pending'] });
            toast({
                title: 'Compra rechazada',
                description: 'El usuario deberá reenviar su comprobante.',
            });
            setSelectedPurchase(null);
            setAdminNotes('');
        },
        onError: (error: any) => {
            toast({
                title: 'Error',
                description: error.response?.data?.error || 'No se pudo rechazar la compra',
                variant: 'destructive',
            });
        },
    });

    const pendingVerification = purchases?.filter((p) => p.status === 'pending_verification') || [];
    const pendingPayment = purchases?.filter((p) => p.status === 'pending_payment') || [];

    const formatPrice = (amount: number, currency: string) =>
        new Intl.NumberFormat('es-MX', { style: 'currency', currency: currency || 'MXN' }).format(amount || 0);

    const isPdfProof = (purchase: VideoPurchase) =>
        Boolean(
            purchase.proof_file_type?.includes('pdf')
            || purchase.proof_file_url?.startsWith('data:application/pdf')
            || purchase.proof_file_name?.toLowerCase().endsWith('.pdf')
        );

    return (
        <AuthGuard requiredRoles={['admin', 'super_admin', 'reception']}>
            <AdminLayout>
                <div className="space-y-6">
                    <div>
                        <h1 className="text-3xl font-heading font-bold">Ventas de Videos</h1>
                        <p className="text-muted-foreground">Valida transferencias para desbloquear videos individuales.</p>
                    </div>

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

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg">Compras pendientes</CardTitle>
                            <CardDescription>Incluye pagos por transferencia listos para validar.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {isLoading ? (
                                <div className="space-y-3">
                                    <Skeleton className="h-12 w-full" />
                                    <Skeleton className="h-12 w-full" />
                                    <Skeleton className="h-12 w-full" />
                                </div>
                            ) : purchases && purchases.length > 0 ? (
                                <div className="overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Usuario</TableHead>
                                            <TableHead>Video</TableHead>
                                            <TableHead>Monto</TableHead>
                                            <TableHead>Estado</TableHead>
                                            <TableHead>Fecha</TableHead>
                                            <TableHead className="text-right">Acciones</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {purchases.map((purchase) => (
                                            <TableRow key={purchase.id}>
                                                <TableCell>
                                                    <div>
                                                        <p className="font-medium">{purchase.user_name || 'Usuario'}</p>
                                                        <p className="text-xs text-muted-foreground">{purchase.user_email || '—'}</p>
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="max-w-[280px] truncate font-medium">
                                                        {purchase.video_title || purchase.video_id}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="font-medium">
                                                    {formatPrice(purchase.amount, purchase.currency)}
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant={statusConfig[purchase.status]?.variant || 'secondary'}>
                                                        {statusConfig[purchase.status]?.label || purchase.status}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell>
                                                    {format(parseISO(purchase.created_at), 'd MMM HH:mm', { locale: es })}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <Button variant="outline" size="sm" onClick={() => setSelectedPurchase(purchase)}>
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
                                    <p className="text-muted-foreground">No hay compras de video pendientes</p>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>

                <Dialog
                    open={!!selectedPurchase}
                    onOpenChange={(open) => {
                        if (!open) {
                            setSelectedPurchase(null);
                            setAdminNotes('');
                        }
                    }}
                >
                    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                        {selectedPurchase && (
                            <>
                                <DialogHeader>
                                    <DialogTitle>Revisión de compra de video</DialogTitle>
                                    <DialogDescription>
                                        Verifica el comprobante y confirma si se desbloquea el video.
                                    </DialogDescription>
                                </DialogHeader>

                                <div className="space-y-4">
                                    <div className="rounded-lg border p-4 space-y-2">
                                        <p><span className="text-muted-foreground">Usuario:</span> {selectedPurchase.user_name || '—'}</p>
                                        <p><span className="text-muted-foreground">Video:</span> {selectedPurchase.video_title || selectedPurchase.video_id}</p>
                                        <p><span className="text-muted-foreground">Monto:</span> {formatPrice(selectedPurchase.amount, selectedPurchase.currency)}</p>
                                        <p><span className="text-muted-foreground">Referencia:</span> {selectedPurchase.payment_reference || '—'}</p>
                                        <p><span className="text-muted-foreground">Fecha transferencia:</span> {selectedPurchase.transfer_date || '—'}</p>
                                        <p><span className="text-muted-foreground">Notas usuario:</span> {selectedPurchase.customer_notes || '—'}</p>
                                    </div>

                                    <div className="space-y-2">
                                        <Label>Comprobante</Label>
                                        {selectedPurchase.proof_file_url ? (
                                            isPdfProof(selectedPurchase) ? (
                                                <a
                                                    href={selectedPurchase.proof_file_url}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="flex items-center gap-2 rounded-lg border p-3 text-sm hover:bg-muted transition-colors"
                                                >
                                                    <FileText className="h-4 w-4" />
                                                    Abrir PDF: {selectedPurchase.proof_file_name || 'comprobante.pdf'}
                                                </a>
                                            ) : (
                                                <div className="rounded-lg border overflow-hidden">
                                                    <img
                                                        src={selectedPurchase.proof_file_url}
                                                        alt="Comprobante de pago"
                                                        className="w-full max-h-[420px] object-contain bg-muted/30"
                                                    />
                                                </div>
                                            )
                                        ) : (
                                            <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
                                                <FileImage className="h-5 w-5 mx-auto mb-2" />
                                                Sin comprobante adjunto
                                            </div>
                                        )}
                                    </div>

                                    <div className="space-y-2">
                                        <Label htmlFor="video-admin-notes">Notas internas (opcional)</Label>
                                        <Textarea
                                            id="video-admin-notes"
                                            value={adminNotes}
                                            onChange={(e) => setAdminNotes(e.target.value)}
                                            placeholder="Motivo de aprobación/rechazo para seguimiento interno"
                                            rows={3}
                                        />
                                    </div>
                                </div>

                                <DialogFooter className="gap-2 sm:justify-end">
                                    <Button
                                        variant="destructive"
                                        onClick={() => rejectMutation.mutate(selectedPurchase.id)}
                                        disabled={approveMutation.isPending || rejectMutation.isPending}
                                    >
                                        <XCircle className="h-4 w-4 mr-2" />
                                        Rechazar
                                    </Button>
                                    <Button
                                        onClick={() => approveMutation.mutate(selectedPurchase.id)}
                                        disabled={approveMutation.isPending || rejectMutation.isPending}
                                    >
                                        <CheckCircle2 className="h-4 w-4 mr-2" />
                                        Aprobar y desbloquear
                                    </Button>
                                </DialogFooter>
                            </>
                        )}
                    </DialogContent>
                </Dialog>
            </AdminLayout>
        </AuthGuard>
    );
}
