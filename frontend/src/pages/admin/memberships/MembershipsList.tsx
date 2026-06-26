import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import api, { getErrorMessage } from '@/lib/api';
import type { Membership, Plan, User } from '@/types/auth'; // Ensure these types exist
import { AdminLayout } from '@/components/layout/AdminLayout';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, Search, CheckCircle2, XCircle, Plus } from 'lucide-react';
import { MembershipActivationDialog, ActivationForm } from '@/components/memberships/MembershipActivationDialog';
import { EditValidityDialog } from '@/components/memberships/EditValidityDialog';
import { useIsElevated } from '@/hooks/useIsElevated';
import {
    getMembershipPaymentMethods,
    GRATIS_REASON_MIN_LENGTH,
} from '@/lib/membershipPaymentMethods';
import { formatDateForInput, addDaysForInput } from '@/lib/date';
import { creditLabel } from '@/lib/credits';
import { getPaymentMethodLabel } from '@/lib/paymentLabels';

// Trazabilidad de adquisición: convierte el campo `acquisition` (calculado en backend)
// en un título + subtítulo legibles para la columna "Adquisición".
function acquisitionInfo(m: Membership): { title: string; subtitle: string | null } {
    const a = m.acquisition;
    const method = a?.method ? getPaymentMethodLabel(a.method) : null;
    const seller = a?.seller_name || null;
    switch (a?.channel) {
        case 'online_card':
            return { title: 'App · en línea', subtitle: method ?? 'Tarjeta' };
        case 'online_transfer':
            return { title: 'App · transferencia', subtitle: seller ? `Aprobó ${seller}` : 'Comprobante' };
        case 'staff':
            return { title: 'Mostrador', subtitle: [method, seller].filter(Boolean).join(' · ') || null };
        case 'migration':
            return { title: 'Migración', subtitle: 'Fitune' };
        case 'request':
            return { title: 'Solicitud en app', subtitle: method ? `${method} · pendiente` : 'Pendiente' };
        default:
            return { title: method ?? '—', subtitle: seller };
    }
}

function AcquisitionCell({ m }: { m: Membership }) {
    const info = acquisitionInfo(m);
    return (
        <>
            <div className="font-medium">{info.title}</div>
            {info.subtitle && <div className="text-xs text-muted-foreground">{info.subtitle}</div>}
        </>
    );
}

// Schema for assigning membership
const assignSchema = z.object({
    userId: z.string().uuid('Selecciona un usuario'),
    planId: z.string().uuid('Selecciona un plan'),
    status: z.enum(['active', 'pending_payment', 'pending_activation']),
    paymentMethod: z.enum(['cash', 'transfer', 'card', 'gratis']).optional(),
    // Motivo obligatorio cuando paymentMethod === 'gratis' (lo valida el botón / backend).
    reason: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
});

type AssignForm = z.infer<typeof assignSchema>;

interface MembershipsListProps {
    initialFilter?: 'all' | 'active' | 'pending_payment' | 'pending_activation';
    title?: string;
    description?: string;
    hideTabs?: boolean;
}

export default function MembershipsList({
    initialFilter = 'all',
    title = 'Membresías',
    description = 'Gestión de suscripciones y activaciones.',
    hideTabs = false,
}: MembershipsListProps) {
    const [filter, setFilter] = useState(initialFilter);
    const [search, setSearch] = useState('');
    const [isAssignDialogOpen, setIsAssignDialogOpen] = useState(false);
    const [activationMembership, setActivationMembership] = useState<Membership | null>(null);
    const [cancellationMembership, setCancellationMembership] = useState<Membership | null>(null);
    const [cancelReason, setCancelReason] = useState('');
    const [cancelRefund, setCancelRefund] = useState(true);
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const isElevated = useIsElevated();
    const paymentMethods = getMembershipPaymentMethods(isElevated);

    const { register, handleSubmit, setValue, watch, reset, formState: { isSubmitting, errors } } = useForm<AssignForm>({
        resolver: zodResolver(assignSchema),
        defaultValues: {
            status: 'active',
            startDate: formatDateForInput(),
        }
    });

    const watchedPlanId = watch('planId');
    const watchedPaymentMethod = watch('paymentMethod');
    const watchedReason = watch('reason');
    const watchedStartDate = watch('startDate');
    const watchedEndDate = watch('endDate');
    const isGratisAssign = watchedPaymentMethod === 'gratis';
    const [endDateTouched, setEndDateTouched] = useState(false);

    // Fetch Memberships
    const { data: memberships, isLoading } = useQuery<Membership[]>({
        queryKey: ['memberships', filter],
        queryFn: async () => {
            // Logic to filter by params if needed, or filter client side.
            // Backend supports filtering by status.
            const params = new URLSearchParams();
            if (filter !== 'all') params.append('status', filter);
            const { data } = await api.get(`/memberships?${params.toString()}`);
            return data;
        },
    });

    // Fetch Plans (for assignment)
    const { data: plans } = useQuery<Plan[]>({
        queryKey: ['plans'],
        queryFn: async () => {
            const { data } = await api.get('/plans');
            return data;
        },
        enabled: isAssignDialogOpen,
    });

    // Fetch Users (for assignment) - simple version, fetches all clients (optimize later)
    const { data: users } = useQuery<User[]>({
        queryKey: ['users-list'],
        queryFn: async () => {
            // We can reuse the users endpoint with limit=100 or something
            const { data } = await api.get('/users?role=client&limit=100');
            return data.users;
        },
        enabled: isAssignDialogOpen,
    });


    // Mutations
    const activateMutation = useMutation({
        mutationFn: async ({ id, payload }: { id: string; payload: ActivationForm }) => {
            return await api.post(`/memberships/${id}/activate`, payload);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['memberships'] });
            toast({ title: 'Membresía activada', description: 'La membresía está ahora activa.' });
            setActivationMembership(null);
        },
        onError: (error) => {
            toast({ variant: 'destructive', title: 'Error', description: getErrorMessage(error) });
        },
    });

    const cancelMutation = useMutation({
        mutationFn: async ({ id, reason, refund }: { id: string; reason?: string; refund: boolean }) => {
            const { data } = await api.post(`/memberships/${id}/cancel`, { reason, refund });
            return data as { refund?: { applied: boolean; payments_refunded: string[]; points_reversed: number } };
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ['memberships'] });
            const refundInfo = data?.refund;
            const description = refundInfo?.applied
                ? `Reembolsados ${refundInfo.payments_refunded.length} pago(s) y revertidos ${refundInfo.points_reversed} puntos.`
                : 'La membresía ha sido cancelada.';
            toast({ title: 'Membresía cancelada', description });
            setCancellationMembership(null);
            setCancelReason('');
            setCancelRefund(true);
        },
        onError: (error) => {
            toast({ variant: 'destructive', title: 'Error', description: getErrorMessage(error) });
        },
    });

    const assignMutation = useMutation({
        mutationFn: async (data: AssignForm) => {
            return await api.post('/memberships/assign', data);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['memberships'] });
            toast({ title: 'Membresía asignada', description: 'La membresía se ha creado exitosamente.' });
            setIsAssignDialogOpen(false);
            reset({ status: 'active', startDate: formatDateForInput() });
            setEndDateTouched(false);
        },
        onError: (error) => {
            toast({ variant: 'destructive', title: 'Error', description: getErrorMessage(error) });
        },
    });

    const filteredMemberships = memberships?.filter(m =>
        m.user_name?.toLowerCase().includes(search.toLowerCase()) ||
        m.user_email?.toLowerCase().includes(search.toLowerCase())
    );

    // Vencimiento sugerido = inicio + duración del plan (mientras no se edite a mano).
    const assignPlan = plans?.find((p) => p.id === watchedPlanId);
    useEffect(() => {
        if (endDateTouched) return;
        if (assignPlan?.duration_days && watchedStartDate) {
            setValue('endDate', addDaysForInput(watchedStartDate, assignPlan.duration_days));
        }
    }, [assignPlan?.duration_days, watchedStartDate, endDateTouched, setValue]);

    const onSubmitAssign = (data: AssignForm) => {
        // No mandes reason si no es gratis (evita ruido en la bitácora).
        const payload: AssignForm = { ...data };
        if (payload.paymentMethod !== 'gratis') delete payload.reason;
        assignMutation.mutate(payload);
    };

    const handleActivate = (membershipId: string, data: ActivationForm) => {
        activateMutation.mutate({ id: membershipId, payload: data });
    };

    return (
        <AuthGuard requiredRoles={['admin']}>
            <AdminLayout>
                <div className="space-y-6">
                    <div className="flex justify-between items-center">
                        <div>
                            <h1 className="text-3xl font-heading font-bold">{title}</h1>
                            <p className="text-muted-foreground">{description}</p>
                        </div>
                        <Button onClick={() => {
                            reset({ status: 'active', startDate: formatDateForInput() });
                            setEndDateTouched(false);
                            setIsAssignDialogOpen(true);
                        }}>
                            <Plus className="mr-2 h-4 w-4" /> Asignar Membresía
                        </Button>
                    </div>

                    <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
                        {!hideTabs && (
                            <Tabs value={filter} className="w-full md:w-auto" onValueChange={(val) => setFilter(val as typeof filter)}>
                                <TabsList>
                                    <TabsTrigger value="all">Todas</TabsTrigger>
                                    <TabsTrigger value="active">Activas</TabsTrigger>
                                    <TabsTrigger value="pending_payment">Pend. Pago</TabsTrigger>
                                    <TabsTrigger value="pending_activation">Por Activar</TabsTrigger>
                                </TabsList>
                            </Tabs>
                        )}

                        <div className="relative w-full md:w-64">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Buscar usuario..."
                                className="pl-10"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="rounded-md border bg-card overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Usuario</TableHead>
                                    <TableHead>Plan</TableHead>
                                    <TableHead>Estado</TableHead>
                                    <TableHead>Vigencia</TableHead>
                                    <TableHead>Créditos</TableHead>
                                    <TableHead>Adquisición</TableHead>
                                    <TableHead className="text-right">Acciones</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoading ? (
                                    <TableRow>
                                        <TableCell colSpan={7} className="text-center py-8">
                                            <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
                                        </TableCell>
                                    </TableRow>
                                ) : filteredMemberships?.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                                            No se encontraron membresías.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filteredMemberships?.map((m) => (
                                        <TableRow key={m.id}>
                                            <TableCell>
                                                <div className="font-medium">{m.user_name}</div>
                                                <div className="text-xs text-muted-foreground">{m.user_email}</div>
                                            </TableCell>
                                            <TableCell>{m.plan_name}</TableCell>
                                            <TableCell>
                                                <Badge variant={
                                                    m.status === 'active' ? 'default' :
                                                        m.status.includes('pending') ? 'outline' : 'secondary'
                                                } className={
                                                    m.status === 'active' ? 'bg-success/10 text-success hover:bg-success/10 border-success/30' :
                                                        m.status === 'pending_payment' ? 'text-warning border-warning/30 bg-warning/10' :
                                                            ''
                                                }>
                                                    {m.status === 'active' ? 'Activa' :
                                                        m.status === 'pending_payment' ? 'Pendiente Pago' :
                                                            m.status === 'pending_activation' ? 'Por Activar' :
                                                                m.status === 'cancelled' ? 'Cancelada' :
                                                                    m.status === 'expired' ? 'Vencida' : m.status}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-sm">
                                                {m.start_date ? (
                                                    <>
                                                        <div className="text-muted-foreground">Inicio: {new Date(m.start_date).toLocaleDateString()}</div>
                                                        <div>Fin: {new Date(m.end_date!).toLocaleDateString()}</div>
                                                    </>
                                                ) : '-'}
                                            </TableCell>
                                            <TableCell className="text-sm tabular-nums">
                                                {creditLabel(m)}
                                            </TableCell>
                                            <TableCell className="text-sm">
                                                <AcquisitionCell m={m} />
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex justify-end gap-2">
                                                    {(m.status === 'pending_activation' || m.status === 'pending_payment') && (
                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            className="text-success hover:text-success hover:bg-success/10"
                                                            onClick={() => setActivationMembership(m)}
                                                        >
                                                            <CheckCircle2 className="h-4 w-4 mr-1" /> Activar
                                                        </Button>
                                                    )}
                                                    {(m.status === 'active' || m.status === 'expired') && (
                                                        <EditValidityDialog
                                                            membership={m}
                                                            onSuccess={() => queryClient.invalidateQueries({ queryKey: ['memberships'] })}
                                                            triggerVariant="ghost"
                                                        />
                                                    )}
                                                    {m.status === 'active' && (
                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                                            onClick={() => {
                                                                setCancelReason('');
                                                                setCancelRefund(true);
                                                                setCancellationMembership(m);
                                                            }}
                                                        >
                                                            <XCircle className="h-4 w-4" />
                                                        </Button>
                                                    )}
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>

                    <Dialog open={isAssignDialogOpen} onOpenChange={setIsAssignDialogOpen}>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Asignar Membresía Manual</DialogTitle>
                                <DialogDescription>
                                    Asigna un plan a un usuario existente.
                                </DialogDescription>
                            </DialogHeader>
                            <form onSubmit={handleSubmit(onSubmitAssign)} className="space-y-4">
                                <div className="space-y-2">
                                    <Label>Usuario</Label>
                                    <Select onValueChange={(val) => setValue('userId', val)}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Seleccionar usuario" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {users?.map(u => (
                                                <SelectItem key={u.id} value={u.id}>
                                                    {u.display_name} ({u.email})
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    {errors.userId && <p className="text-xs text-destructive">{errors.userId.message}</p>}
                                </div>

                                <div className="space-y-2">
                                    <Label>Plan</Label>
                                    <Select onValueChange={(val) => setValue('planId', val)}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Seleccionar plan" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {plans?.map(p => (
                                                <SelectItem key={p.id} value={p.id}>
                                                    {p.name} - ${p.price}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    {errors.planId && <p className="text-xs text-destructive">{errors.planId.message}</p>}
                                </div>

                                <div className="space-y-2">
                                    <Label>Estado Inicial</Label>
                                    <Select onValueChange={(val: any) => setValue('status', val)} defaultValue="active">
                                        <SelectTrigger>
                                            <SelectValue placeholder="Seleccionar estado" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="active">Activa (Inicia hoy)</SelectItem>
                                            <SelectItem value="pending_payment">Pendiente de Pago</SelectItem>
                                            <SelectItem value="pending_activation">Pendiente de Activación</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-2">
                                        <Label htmlFor="assign-start">Inicio</Label>
                                        <Input id="assign-start" type="date" {...register('startDate')} />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="assign-end">Vence</Label>
                                        <Input
                                            id="assign-end"
                                            type="date"
                                            value={watchedEndDate ?? ''}
                                            onChange={(e) => { setValue('endDate', e.target.value); setEndDateTouched(true); }}
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label>Método de Pago (Opcional)</Label>
                                    <Select value={watchedPaymentMethod ?? ''} onValueChange={(val) => setValue('paymentMethod', val as AssignForm['paymentMethod'])}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Seleccionar método" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {paymentMethods.map((m) => (
                                                <SelectItem key={m.value} value={m.value}>
                                                    {m.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                {isGratisAssign && (
                                    <div className="space-y-2">
                                        <Label htmlFor="assign-gratis-reason">
                                            Motivo (obligatorio) <span className="text-destructive">*</span>
                                        </Label>
                                        <Textarea
                                            id="assign-gratis-reason"
                                            placeholder="Ej. Cortesía por promoción / compensación"
                                            rows={2}
                                            {...register('reason')}
                                        />
                                        <p className="text-xs text-muted-foreground">
                                            Se registra en $0 y queda en bitácora (mínimo {GRATIS_REASON_MIN_LENGTH} caracteres).
                                        </p>
                                    </div>
                                )}

                                <DialogFooter>
                                    <Button type="button" variant="ghost" onClick={() => setIsAssignDialogOpen(false)}>
                                        Cancelar
                                    </Button>
                                    <Button
                                        type="submit"
                                        disabled={
                                            isSubmitting ||
                                            (isGratisAssign && (watchedReason ?? '').trim().length < GRATIS_REASON_MIN_LENGTH)
                                        }
                                    >
                                        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                        Asignar
                                    </Button>
                                </DialogFooter>
                            </form>
                        </DialogContent>
                    </Dialog>

                    <MembershipActivationDialog
                        open={Boolean(activationMembership)}
                        membership={activationMembership}
                        isSubmitting={activateMutation.isPending}
                        onOpenChange={(nextOpen) => {
                            if (!nextOpen) setActivationMembership(null);
                        }}
                        onActivate={handleActivate}
                    />

                    <Dialog
                        open={Boolean(cancellationMembership)}
                        onOpenChange={(nextOpen) => {
                            if (!nextOpen && !cancelMutation.isPending) setCancellationMembership(null);
                        }}
                    >
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Cancelar membresía</DialogTitle>
                                <DialogDescription>
                                    {cancellationMembership?.user_name
                                        ? `Usuario: ${cancellationMembership.user_name}.`
                                        : 'Confirma la cancelación.'}
                                </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-4 py-2">
                                <div className="space-y-2">
                                    <Label htmlFor="cancel-reason">Razón (opcional)</Label>
                                    <Textarea
                                        id="cancel-reason"
                                        placeholder="Ej. Usuario solicitó cambio de paquete"
                                        value={cancelReason}
                                        onChange={(e) => setCancelReason(e.target.value)}
                                        rows={3}
                                        maxLength={500}
                                    />
                                </div>
                                <div className="flex items-start gap-3 rounded-md border p-3">
                                    <Checkbox
                                        id="cancel-refund"
                                        checked={cancelRefund}
                                        onCheckedChange={(v) => setCancelRefund(v === true)}
                                    />
                                    <div className="space-y-1">
                                        <Label htmlFor="cancel-refund" className="cursor-pointer">
                                            Devolver el dinero al usuario
                                        </Label>
                                        <p className="text-xs text-muted-foreground">
                                            Marca los pagos asociados como reembolsados y revierte los puntos otorgados.
                                            Deja sin marcar si el dinero se queda en el estudio.
                                        </p>
                                    </div>
                                </div>
                            </div>
                            <DialogFooter>
                                <Button
                                    variant="ghost"
                                    onClick={() => setCancellationMembership(null)}
                                    disabled={cancelMutation.isPending}
                                >
                                    Volver
                                </Button>
                                <Button
                                    variant="destructive"
                                    onClick={() => {
                                        if (!cancellationMembership) return;
                                        cancelMutation.mutate({
                                            id: cancellationMembership.id,
                                            reason: cancelReason.trim() || undefined,
                                            refund: cancelRefund,
                                        });
                                    }}
                                    disabled={cancelMutation.isPending}
                                >
                                    {cancelMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    Cancelar membresía
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </div>
            </AdminLayout>
        </AuthGuard>
    );
}
