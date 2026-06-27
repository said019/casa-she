import { useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClientLayout } from '@/components/layout/ClientLayout';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import {
    ChevronLeft,
    Lock,
    Play,
    Calendar,
    Building2,
    Upload,
    Copy,
    CheckCircle2,
    AlertCircle,
    X,
} from 'lucide-react';
import { CommentSection } from '@/components/videos/CommentSection';
import api, { getStoredToken } from '@/lib/api';

interface VideoDetail {
    id: string;
    title: string;
    description: string;
    category_name: string;
    category_color?: string;
    level: string;
    access_type: 'gratuito' | 'miembros';
    published_at: string;
    duration_seconds?: number;
    sales_enabled?: boolean;
    sales_unlocks_video?: boolean;
    sales_price_mxn?: number | null;
    sales_class_credits?: number | null;
    sales_cta_text?: string | null;
}

interface VideoPurchase {
    id: string;
    amount: number;
    currency: string;
    status: 'pending_payment' | 'pending_verification' | 'approved' | 'rejected' | 'cancelled' | 'expired';
    payment_reference?: string | null;
    transfer_date?: string | null;
    has_proof: boolean;
    proof_file_name?: string | null;
    proof_file_url?: string | null;
    admin_notes?: string | null;
    created_at?: string;
    updated_at?: string;
    expires_at?: string | null;
}

interface BankInfo {
    bank_name: string;
    account_holder: string;
    account_number: string;
    clabe: string;
    reference_instructions?: string;
}

const purchaseStatusLabel: Record<VideoPurchase['status'], string> = {
    pending_payment: 'Pendiente de pago',
    pending_verification: 'En verificación',
    approved: 'Aprobado',
    rejected: 'Rechazado',
    cancelled: 'Cancelado',
    expired: 'Expirado',
};

export default function VideoPlayer() {
    const { videoId } = useParams();
    const { toast } = useToast();
    const queryClient = useQueryClient();

    const [videoSrc, setVideoSrc] = useState<string | null>(null);
    const [embedUrl, setEmbedUrl] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const [transferReference, setTransferReference] = useState('');
    const [transferDate, setTransferDate] = useState('');
    const [proofNotes, setProofNotes] = useState('');
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [filePreview, setFilePreview] = useState<string | null>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        setVideoSrc(null);
        setEmbedUrl(null);
        setError(null);
        setTransferReference('');
        setTransferDate('');
        setProofNotes('');
        setSelectedFile(null);
        setFilePreview(null);
    }, [videoId]);

    const { data: video, isLoading: videoLoading } = useQuery<VideoDetail>({
        queryKey: ['video', videoId],
        queryFn: async () => (await api.get(`/videos/${videoId}`)).data,
        enabled: !!videoId,
    });

    const requiresPurchase = Boolean(
        video?.sales_enabled
        && video?.sales_unlocks_video
        && Number(video?.sales_price_mxn || 0) > 0
    );

    const { data: purchaseData } = useQuery<{ purchase: VideoPurchase | null }>({
        queryKey: ['video-purchase', videoId],
        queryFn: async () => (await api.get(`/videos/${videoId}/purchase`)).data,
        enabled: !!videoId,
    });

    const purchase = purchaseData?.purchase || null;

    useEffect(() => {
        if (!purchase) return;
        setTransferReference(purchase.payment_reference || '');
        setTransferDate(
            purchase.transfer_date
                ? new Date(purchase.transfer_date).toISOString().slice(0, 10)
                : ''
        );
    }, [purchase?.id, purchase?.payment_reference, purchase?.transfer_date]);

    const showProofForm = Boolean(
        requiresPurchase
        && purchase
        && (purchase.status === 'pending_payment' || purchase.status === 'rejected')
    );

    const { data: bankInfo } = useQuery<BankInfo>({
        queryKey: ['bank-info'],
        queryFn: async () => (await api.get('/settings/bank-info')).data,
        enabled: showProofForm,
    });

    const createPurchaseMutation = useMutation({
        mutationFn: async () => {
            const res = await api.post(`/videos/${videoId}/purchase`, {
                notes: proofNotes || undefined,
            });
            return res.data;
        },
        onSuccess: (data: any) => {
            queryClient.invalidateQueries({ queryKey: ['video-purchase', videoId] });
            toast({
                title: 'Compra iniciada',
                description: data?.message || 'Generamos tu solicitud. Envía tu transferencia para validación.',
            });
        },
        onError: (err: any) => {
            toast({
                title: 'Error',
                description: err.response?.data?.error || 'No se pudo iniciar la compra',
                variant: 'destructive',
            });
        },
    });

    const submitProofMutation = useMutation({
        mutationFn: async () => {
            let fileData: string | null = null;
            if (selectedFile) {
                fileData = await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result as string);
                    reader.onerror = reject;
                    reader.readAsDataURL(selectedFile);
                });
            }

            const res = await api.put(`/videos/${videoId}/purchase/proof`, {
                transfer_reference: transferReference || null,
                transfer_date: transferDate || null,
                notes: proofNotes || null,
                file_data: fileData,
                file_name: selectedFile?.name || null,
                file_type: selectedFile?.type || null,
            });
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['video-purchase', videoId] });
            toast({
                title: 'Comprobante enviado',
                description: 'Tu pago está en verificación. Te avisaremos cuando se apruebe.',
            });
            setSelectedFile(null);
            setFilePreview(null);
        },
        onError: (err: any) => {
            toast({
                title: 'Error',
                description: err.response?.data?.error || 'No se pudo enviar el comprobante',
                variant: 'destructive',
            });
        },
    });

    const {
        isLoading: streamLoading,
        refetch: refetchStream,
    } = useQuery({
        queryKey: ['video-stream', videoId],
        queryFn: async () => {
            try {
                const res = await api.get(`/videos/${videoId}/stream`);
                const proxyUrl = res.data.proxy_url || res.data.url;
                const token = getStoredToken();
                const authedUrl = token ? `${proxyUrl}${proxyUrl.includes('?') ? '&' : '?'}token=${token}` : proxyUrl;
                setVideoSrc(authedUrl);
                setEmbedUrl(res.data.embed_url);
                setError(null);
                return res.data;
            } catch (err: any) {
                const code = err.response?.data?.code;
                if (code === 'MEMBERSHIP_REQUIRED') {
                    setError('MEMBERSHIP_REQUIRED');
                } else if (code === 'VIDEO_PURCHASE_REQUIRED') {
                    setError('VIDEO_PURCHASE_REQUIRED');
                } else {
                    setError('ERROR');
                }
                throw err;
            }
        },
        enabled: !!video,
        retry: false,
    });

    useEffect(() => {
        if (purchase?.status === 'approved') {
            setError(null);
            refetchStream();
        }
    }, [purchase?.status, refetchStream]);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const validTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp', 'application/pdf'];
        if (!validTypes.includes(file.type)) {
            toast({
                title: 'Tipo de archivo no válido',
                description: 'Solo se permiten imágenes (JPG, PNG, WebP) o PDF',
                variant: 'destructive',
            });
            return;
        }

        if (file.size > 5 * 1024 * 1024) {
            toast({
                title: 'Archivo demasiado grande',
                description: 'El archivo no debe superar los 5MB',
                variant: 'destructive',
            });
            return;
        }

        setSelectedFile(file);

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
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        toast({ title: 'Copiado al portapapeles' });
    };

    return (
        <AuthGuard requiredRoles={['client']}>
            <ClientLayout>
                <div className="max-w-5xl mx-auto">
                    <div className="mb-6">
                        <Button variant="ghost" asChild className="pl-0 gap-1.5 mb-4 text-muted-foreground hover:text-foreground text-sm">
                            <Link to="/app/videos">
                                <ChevronLeft className="h-4 w-4" />
                                Volver a la biblioteca
                            </Link>
                        </Button>

                        {videoLoading ? (
                            <div className="space-y-4">
                                <Skeleton className="aspect-video w-full rounded-2xl" />
                                <Skeleton className="h-8 w-3/4" />
                                <Skeleton className="h-4 w-full" />
                            </div>
                        ) : video ? (
                            <div className="space-y-6">
                                <div className="relative group">
                                    <div
                                        className="absolute -inset-3 rounded-3xl opacity-20 blur-2xl pointer-events-none"
                                        style={{
                                            background: `linear-gradient(135deg, ${video.category_color || '#8A5A2A'}60 0%, transparent 50%, ${video.category_color || '#8A5A2A'}30 100%)`,
                                        }}
                                    />
                                    <div className="relative aspect-video bg-foreground rounded-2xl overflow-hidden shadow-2xl ring-1 ring-border/50">
                                        {error === 'MEMBERSHIP_REQUIRED' ? (
                                            <div className="absolute inset-0 flex flex-col items-center justify-center text-white bg-foreground/95 backdrop-blur-sm p-6 text-center">
                                                <div className="bg-white/5 p-5 rounded-2xl mb-5 ring-1 ring-white/10">
                                                    <Lock className="h-8 w-8 text-primary" />
                                                </div>
                                                <h3 className="text-xl font-heading font-semibold mb-2 text-white">Contenido Exclusivo</h3>
                                                <p className="text-white/50 mb-6 max-w-md text-sm font-body leading-relaxed">
                                                    Este video está disponible solo para miembros activos.
                                                    Activa tu membresía para acceder al contenido.
                                                </p>
                                                <Button asChild className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-full px-8">
                                                    <Link to="/app/checkout">Ver Planes</Link>
                                                </Button>
                                            </div>
                                        ) : error === 'VIDEO_PURCHASE_REQUIRED' ? (
                                            <div className="absolute inset-0 flex flex-col items-center justify-center text-white bg-foreground/95 backdrop-blur-sm p-6 text-center">
                                                <div className="bg-white/5 p-5 rounded-2xl mb-5 ring-1 ring-white/10">
                                                    <Lock className="h-8 w-8 text-amber-400" />
                                                </div>
                                                <h3 className="text-xl font-heading font-semibold mb-2 text-white">Video de Pago</h3>
                                                <p className="text-white/50 mb-6 max-w-md text-sm font-body leading-relaxed">
                                                    Para reproducir este video necesitas una compra aprobada por transferencia.
                                                </p>
                                                {!purchase && (
                                                    <Button
                                                        onClick={() => createPurchaseMutation.mutate()}
                                                        disabled={createPurchaseMutation.isPending}
                                                        className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-full px-8"
                                                    >
                                                        {createPurchaseMutation.isPending ? 'Creando compra...' : 'Iniciar compra'}
                                                    </Button>
                                                )}
                                            </div>
                                        ) : videoSrc ? (
                                            <video
                                                src={videoSrc}
                                                className="w-full h-full object-contain bg-black"
                                                controls
                                                autoPlay
                                                playsInline
                                                controlsList="nodownload"
                                                onError={() => {
                                                    console.warn('Video proxy failed, falling back to embed');
                                                    setVideoSrc(null);
                                                }}
                                            />
                                        ) : embedUrl ? (
                                            <iframe
                                                src={embedUrl}
                                                className="w-full h-full"
                                                allow="autoplay; encrypted-media"
                                                allowFullScreen
                                                frameBorder="0"
                                            />
                                        ) : streamLoading ? (
                                            <div className="absolute inset-0 flex items-center justify-center bg-foreground">
                                                <div className="flex flex-col items-center gap-3">
                                                    <div className="relative">
                                                        <div className="w-14 h-14 rounded-full border-2 border-white/10 border-t-primary animate-spin" />
                                                        <Play className="absolute inset-0 m-auto w-5 h-5 text-white/40" />
                                                    </div>
                                                    <span className="text-white/30 text-xs font-body">Cargando video...</span>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                                                <Play className="w-12 h-12 text-white/15" />
                                                <p className="text-white/25 font-body text-sm">Video no disponible</p>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="space-y-4 pt-2">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <Badge
                                            variant="secondary"
                                            className="font-normal text-xs rounded-full px-3"
                                            style={{
                                                backgroundColor: video.category_color ? `${video.category_color}15` : undefined,
                                                color: video.category_color || undefined,
                                                borderColor: video.category_color ? `${video.category_color}30` : undefined,
                                            }}
                                        >
                                            {video.category_name}
                                        </Badge>
                                        <span className="text-xs text-muted-foreground capitalize">{video.level}</span>
                                        {video.access_type === 'miembros' && (
                                            <Badge variant="outline" className="font-normal text-xs rounded-full gap-1 text-primary border-primary/30">
                                                <Lock className="h-3 w-3" />
                                                Miembros
                                            </Badge>
                                        )}
                                        {requiresPurchase && (
                                            <Badge variant="outline" className="font-normal text-xs rounded-full gap-1 border-amber-300 text-amber-700">
                                                <Lock className="h-3 w-3" />
                                                Compra requerida
                                            </Badge>
                                        )}
                                        {purchase?.status && (
                                            <Badge variant="outline" className="font-normal text-xs rounded-full">
                                                {purchaseStatusLabel[purchase.status]}
                                            </Badge>
                                        )}
                                        {video.published_at && (
                                            <span className="text-xs text-muted-foreground/60 ml-auto flex items-center gap-1">
                                                <Calendar className="h-3 w-3" />
                                                {new Date(video.published_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}
                                            </span>
                                        )}
                                    </div>

                                    <h1 className="text-2xl md:text-3xl font-heading font-semibold leading-tight">{video.title}</h1>

                                    {video.description && (
                                        <p className="text-muted-foreground leading-relaxed whitespace-pre-wrap font-body text-sm md:text-base">
                                            {video.description}
                                        </p>
                                    )}

                                    {video.sales_enabled && Number(video.sales_price_mxn || 0) > 0 && (
                                        <div className="rounded-[1.25rem] border bg-primary/5 p-4 space-y-3 app-soft-shadow">
                                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                                                <div>
                                                    <p className="text-sm font-medium text-primary">
                                                        {requiresPurchase
                                                            ? `Acceso por compra: $${Number(video.sales_price_mxn).toLocaleString('es-MX')} MXN`
                                                            : `Desde $${Number(video.sales_price_mxn).toLocaleString('es-MX')} MXN`}
                                                    </p>
                                                    <p className="text-xs text-muted-foreground">
                                                        {requiresPurchase
                                                            ? 'Disponible para cualquier usuario registrado con pago por transferencia'
                                                            : (video.sales_class_credits && video.sales_class_credits > 0
                                                                ? `${video.sales_class_credits} clases sugeridas`
                                                                : 'Compra paquetes de clases y agenda desde la app')}
                                                    </p>
                                                </div>
                                                {!requiresPurchase && (
                                                    <Button asChild>
                                                        <Link to="/app/checkout">{video.sales_cta_text || 'Comprar clases'}</Link>
                                                    </Button>
                                                )}
                                            </div>

                                            {requiresPurchase && !purchase && (
                                                <Button
                                                    onClick={() => createPurchaseMutation.mutate()}
                                                    disabled={createPurchaseMutation.isPending}
                                                >
                                                    {createPurchaseMutation.isPending ? 'Creando compra...' : 'Comprar video por transferencia'}
                                                </Button>
                                            )}

                                            {purchase?.status === 'approved' && (
                                                <div className="rounded-[1rem] border border-green-200 bg-green-50 p-3 text-sm text-green-700 flex items-start gap-2">
                                                    <CheckCircle2 className="h-4 w-4 mt-0.5" />
                                                    <div>
                                                        <p className="font-medium">Pago aprobado</p>
                                                        <p>Tu acceso ya está desbloqueado. Si no se reproduce, recarga esta pantalla.</p>
                                                    </div>
                                                </div>
                                            )}

                                            {purchase?.status === 'pending_verification' && (
                                                <div className="rounded-[1rem] border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700 flex items-start gap-2">
                                                    <AlertCircle className="h-4 w-4 mt-0.5" />
                                                    <div>
                                                        <p className="font-medium">Pago en verificación</p>
                                                        <p>Tu comprobante fue enviado. El equipo lo validará para liberar el video.</p>
                                                    </div>
                                                </div>
                                            )}

                                            {purchase?.status === 'rejected' && (
                                                <div className="rounded-[1rem] border border-red-200 bg-red-50 p-3 text-sm text-red-700 flex items-start gap-2">
                                                    <AlertCircle className="h-4 w-4 mt-0.5" />
                                                    <div>
                                                        <p className="font-medium">Pago rechazado</p>
                                                        <p>{purchase.admin_notes || 'Reenvía tu referencia o comprobante para continuar.'}</p>
                                                    </div>
                                                </div>
                                            )}

                                            {showProofForm && (
                                                <div className="space-y-4 pt-1">
                                                    {bankInfo && (
                                                        <div className="rounded-[1.25rem] border bg-background p-4 space-y-3 app-soft-shadow">
                                                            <p className="text-sm font-medium flex items-center gap-2">
                                                                <Building2 className="h-4 w-4" />
                                                                Datos para transferencia
                                                            </p>
                                                            <div className="grid gap-2 text-sm">
                                                                <div className="flex items-center justify-between rounded-md bg-muted/40 p-2">
                                                                    <span className="text-muted-foreground">Banco</span>
                                                                    <span className="font-medium">{bankInfo.bank_name}</span>
                                                                </div>
                                                                <div className="flex items-center justify-between rounded-md bg-muted/40 p-2 gap-4">
                                                                    <span className="text-muted-foreground">Titular</span>
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="font-medium text-right">{bankInfo.account_holder}</span>
                                                                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => copyToClipboard(bankInfo.account_holder)}>
                                                                            <Copy className="h-3.5 w-3.5" />
                                                                        </Button>
                                                                    </div>
                                                                </div>
                                                                <div className="flex items-center justify-between rounded-md bg-muted/40 p-2 gap-4">
                                                                    <span className="text-muted-foreground">Cuenta</span>
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="font-medium font-mono">{bankInfo.account_number}</span>
                                                                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => copyToClipboard(bankInfo.account_number)}>
                                                                            <Copy className="h-3.5 w-3.5" />
                                                                        </Button>
                                                                    </div>
                                                                </div>
                                                                <div className="flex items-center justify-between rounded-md bg-muted/40 p-2 gap-4">
                                                                    <span className="text-muted-foreground">CLABE</span>
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="font-medium font-mono">{bankInfo.clabe}</span>
                                                                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => copyToClipboard(bankInfo.clabe)}>
                                                                            <Copy className="h-3.5 w-3.5" />
                                                                        </Button>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            {bankInfo.reference_instructions && (
                                                                <p className="text-xs text-muted-foreground">{bankInfo.reference_instructions}</p>
                                                            )}
                                                        </div>
                                                    )}

                                                    <div className="grid sm:grid-cols-2 gap-3">
                                                        <div className="space-y-1.5">
                                                            <Label htmlFor="video-transfer-ref">Referencia de transferencia</Label>
                                                            <Input
                                                                id="video-transfer-ref"
                                                                value={transferReference}
                                                                onChange={(e) => setTransferReference(e.target.value)}
                                                                placeholder="Ej. SPEI123456"
                                                            />
                                                        </div>
                                                        <div className="space-y-1.5">
                                                            <Label htmlFor="video-transfer-date">Fecha de transferencia</Label>
                                                            <Input
                                                                id="video-transfer-date"
                                                                type="date"
                                                                value={transferDate}
                                                                onChange={(e) => setTransferDate(e.target.value)}
                                                            />
                                                        </div>
                                                    </div>

                                                    <div className="space-y-1.5">
                                                        <Label>Comprobante (imagen o PDF)</Label>
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
                                                                className="w-full border-2 border-dashed border-muted-foreground/30 rounded-[1rem] p-6 hover:border-primary/50 hover:bg-muted/50 transition-colors"
                                                            >
                                                                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                                                                    <Upload className="h-7 w-7" />
                                                                    <span className="text-sm font-medium">Subir comprobante</span>
                                                                    <span className="text-xs">JPG, PNG, WebP o PDF (máx. 5MB)</span>
                                                                </div>
                                                            </button>
                                                        ) : (
                                                            <div className="relative border rounded-[1rem] p-3">
                                                                <Button variant="ghost" size="icon" className="absolute top-1 right-1 h-7 w-7" onClick={removeFile}>
                                                                    <X className="h-4 w-4" />
                                                                </Button>
                                                                {filePreview ? (
                                                                    <img src={filePreview} alt="Comprobante" className="max-h-52 rounded" />
                                                                ) : (
                                                                    <p className="text-sm text-muted-foreground pr-8">{selectedFile.name}</p>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>

                                                    <div className="space-y-1.5">
                                                        <Label htmlFor="video-proof-notes">Notas adicionales (opcional)</Label>
                                                        <Textarea
                                                            id="video-proof-notes"
                                                            rows={2}
                                                            value={proofNotes}
                                                            onChange={(e) => setProofNotes(e.target.value)}
                                                            placeholder="Ej. Transferí desde cuenta BBVA terminación 1122"
                                                        />
                                                    </div>

                                                    <Button
                                                        onClick={() => submitProofMutation.mutate()}
                                                        disabled={submitProofMutation.isPending || (!transferReference && !selectedFile)}
                                                    >
                                                        {submitProofMutation.isPending ? 'Enviando...' : 'Enviar comprobante'}
                                                    </Button>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>

                                <div className="h-px bg-border" />

                                <CommentSection videoId={video.id} />
                            </div>
                        ) : (
                            <div className="text-center py-20">
                                <Play className="w-12 h-12 text-muted-foreground/20 mx-auto mb-3" />
                                <p className="text-muted-foreground">Video no encontrado</p>
                                <Button variant="outline" asChild className="mt-4">
                                    <Link to="/app/videos">Ir a la biblioteca</Link>
                                </Button>
                            </div>
                        )}
                    </div>
                </div>
            </ClientLayout>
        </AuthGuard>
    );
}
