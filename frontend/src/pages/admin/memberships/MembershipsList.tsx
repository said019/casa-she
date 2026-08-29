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
import { AlertTriangle, Loader2, Search, CheckCircle2, XCircle, Plus } from 'lucide-react';
import { MembershipActivationDialog, ActivationForm } from '@/components/memberships/MembershipActivationDialog';
import { EditValidityDialog } from '@/components/memberships/EditValidityDialog';
import { useIsElevated } from '@/hooks/useIsElevated';
import {
    getMembershipPaymentMethods,
} from '@/lib/membershipPaymentMethods';
import { addDaysForInput } from '@/lib/date';
import { creditLabel } from '@/lib/credits';
import { getPaymentMethodLabel } from '@/lib/paymentLabels';
import { ManualPriceAdjustmentFields } from '@/components/payments/ManualPriceAdjustmentFields';
import { calculateManualDiscount, MANUAL_ADJUSTMENT_COMMENT_MIN_LENGTH, type ManualDiscountType } from '@/lib/manualDiscount';
import { MembershipStartPicker } from '@/components/memberships/MembershipStartPicker';
import { isMembershipScheduled } from '@/lib/membershipStatus';

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
    discountType: z.enum(['percentage', 'fixed']).optional(),
    discountValue: z.coerce.number().min(0).optional(),
    startDate: z.string().min(1, 'Elige cuándo inicia la membresía'),
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
    const [cancelRefund, setCancelRefund] = useState(false);
    const [externalRefundConfirmed, setExternalRefundConfirmed] = useState(false);
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const isElevated = useIsElevated();
    const paymentMethods = getMembershipPaymentMethods(isElevated);

    const { register, handleSubmit, setValue, watch, reset, formState: { isSubmitting, errors } } = useForm<AssignForm>({
        resolver: zodResolver(assignSchema),
        defaultValues: {
            status: 'active',
            startDate: '',
        }
    });

    const watchedPlanId = watch('planId');
    const watchedPaymentMethod = watch('paymentMethod');
    const watchedReason = watch('reason');
    const watchedDiscountType = watch('discountType') ?? 'percentage';
    const watchedDiscountValue = watch('discountValue') ?? 0;
    const watchedStartDate = watch('startDate');
    const watchedEndDate = watch('endDate');
    const isGratisAssign = watchedPaymentMethod === 'gratis';
    const [assignDiscountEnabled, setAssignDiscountEnabled] = useState(false);
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
                ? `Registrados como reembolsados ${refundInfo.payments_refunded.length} pago(s) y revertidos ${refundInfo.points_reversed} puntos.`
                : 'La membresía ha sido cancelada.';
            toast({ title: 'Membresía cancelada', description });
            setCancellationMembership(null);
            setCancelReason('');
            setCancelRefund(false);
            setExternalRefundConfirmed(false);
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
            reset({ status: 'active', startDate: '' });
            setAssignDiscountEnabled(false);
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
    const assignAdjustment = calculateManualDiscount(
        assignPlan?.price ?? 0,
        assignDiscountEnabled && !isGratisAssign,
        watchedDiscountType as ManualDiscountType,
        watchedDiscountValue,
    );
    const assignNeedsComment = isGratisAssign || assignDiscountEnabled;
    const assignAdjustmentValid = (!assignDiscountEnabled || assignAdjustment.valid) &&
        (!assignNeedsComment || (watchedReason ?? '').trim().length >= MANUAL_ADJUSTMENT_COMMENT_MIN_LENGTH);
    useEffect(() => {
        if (endDateTouched) return;
        if (assignPlan?.duration_days && watchedStartDate) {
            setValue('endDate', addDaysForInput(watchedStartDate, assignPlan.duration_days));
        }
    }, [assignPlan?.duration_days, watchedStartDate, endDateTouched, setValue]);

    const onSubmitAssign = (data: AssignForm) => {
        const payload: AssignForm = { ...data };
        if (!assignDiscountEnabled || isGratisAssign) {
            delete payload.discountType;
            delete payload.discountValue;
        }
        if (!assignNeedsComment) delete payload.reason;
        assignMutation.mutate(payload);
    };

    const handleActivate = (membershipId: string, data: ActivationForm) => {
        activateMutation.mutate({ id: membershipId, payload: data });
    };

    return (
        <AuthGuard requiredRoles={['admin', 'super_admin', 'reception']}>
            <AdminLayout>
                <div className="space-y-6">
                    <div className="flex justify-between items-center">
                        <div>
                            <h1 className="text-3xl font-heading font-bold">{title}</h1>
                            <p className="text-muted-foreground">{description}</p>
                        </div>
                        <Button onClick={() => {
                            reset({ status: 'active', startDate: '' });
                            setAssignDiscountEnabled(false);
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
                                    filteredMemberships?.map((m) => {
                                        const scheduled = isMembershipScheduled(m);
                                        return (
                                            <TableRow key={m.id}>
                                            <TableCell>
                                                <div className="font-medium">{m.user_name}</div>
                                                <div className="text-xs text-muted-foreground">{m.user_email}</div>
                                            </TableCell>
                                            <TableCell>{m.plan_name}</TableCell>
                                            <TableCell>
                                                <Badge variant={
                                                    m.status === 'active' && !scheduled ? 'default' :
                                                        m.status.includes('pending') ? 'outline' : 'secondary'
                                                } className={
                                                    scheduled ? 'border-sky-300 bg-sky-50 text-sky-700 hover:bg-sky-50' :
                                                    m.status === 'active' ? 'bg-success/10 text-success hover:bg-success/10 border-success/30' :
                                                        m.status === 'pending_payment' ? 'text-warning border-warning/30 bg-warning/10' :
                                                            ''
                                                }>
                                                    {scheduled ? 'Programada' :
                                                        m.status === 'active' ? 'Activa' :
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
                                                                setCancelRefund(isElevated);
                                                                setExternalRefundConfirmed(false);
                                                                setCancellationMembership(m);
                                                            }}
                                                            aria-label={`Cancelar membresía de ${m.user_name ?? 'usuario'}`}
                                                            title="Cancelar membresía"
                                                        >
                                                            <XCircle className="h-4 w-4" />
                                                        </Button>
                                                    )}
                                                </div>
                                            </TableCell>
                                            </TableRow>
                                        );
                                    })
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
                                    <Select
                                        onValueChange={(val) => setValue('status', val as AssignForm['status'])}
                                        defaultValue="active"
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Seleccionar estado" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="active">Activa (según fecha elegida)</SelectItem>
                                            <SelectItem value="pending_payment">Pendiente de Pago</SelectItem>
                                            <SelectItem value="pending_activation">Pendiente de Activación</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                <MembershipStartPicker
                                    id="assign-start"
                                    value={watchedStartDate ?? ''}
                                    onChange={(value) => setValue('startDate', value, { shouldValidate: true })}
                                    durationDays={plans?.find((p) => p.id === watchedPlanId)?.duration_days}
                                    disabled={isSubmitting}
                                />
                                {errors.startDate && <p className="text-xs text-destructive">{errors.startDate.message}</p>}
                                <div className="space-y-2">
                                    <Label htmlFor="assign-end">Vence (opcional)</Label>
                                    <Input
                                        id="assign-end"
                                        type="date"
                                        value={watchedEndDate ?? ''}
                                        onChange={(e) => { setValue('endDate', e.target.value); setEndDateTouched(true); }}
                                    />
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

                                <ManualPriceAdjustmentFields
                                    idPrefix="assign-membership"
                                    listPrice={assignPlan?.price ?? 0}
                                    isGratis={isGratisAssign}
                                    discountEnabled={assignDiscountEnabled}
                                    discountType={watchedDiscountType as ManualDiscountType}
                                    discountValue={String(watchedDiscountValue || '')}
                                    comment={watchedReason ?? ''}
                                    onDiscountEnabledChange={setAssignDiscountEnabled}
                                    onDiscountTypeChange={(value) => setValue('discountType', value)}
                                    onDiscountValueChange={(value) => setValue('discountValue', Number(value) || 0)}
                                    onCommentChange={(value) => setValue('reason', value)}
                                />

                                <DialogFooter>
                                    <Button type="button" variant="ghost" onClick={() => setIsAssignDialogOpen(false)}>
                                        Cancelar
                                    </Button>
                                    <Button
                                        type="submit"
                                        disabled={
                                            isSubmitting ||
                                            !assignAdjustmentValid
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
                            if (!nextOpen && !cancelMutation.isPending) {
                                setCancellationMembership(null);
                                setExternalRefundConfirmed(false);
                            }
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
                                {isElevated && (
                                    <div className="flex items-start gap-3 rounded-md border p-3">
                                        <Checkbox
                                            id="cancel-refund"
                                            checked={cancelRefund}
                                            onCheckedChange={(v) => {
                                                const checked = v === true;
                                                setCancelRefund(checked);
                                                if (!checked) setExternalRefundConfirmed(false);
                                            }}
                                        />
                                        <div className="space-y-1">
                                            <Label htmlFor="cancel-refund" className="cursor-pointer">
                                                Registrar reembolso en Casa Shé
                                            </Label>
                                            <p className="text-xs text-muted-foreground">
                                                Marca los pagos asociados como reembolsados y revierte los puntos otorgados en el sistema.
                                            </p>
                                        </div>
                                    </div>
                                )}
                                {isElevated && cancelRefund && (
                                    <div className="space-y-3 rounded-xl border border-warning/35 bg-warning/10 p-4">
                                        <div className="flex items-start gap-2">
                                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
                                            <div>
                                                <p className="text-sm font-semibold">Esta acción no envía dinero</p>
                                                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                                                    Devuelve primero el pago por Mercado Pago, terminal, transferencia o efectivo. Después registra aquí el resultado.
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex items-start gap-3 border-t border-warning/25 pt-3">
                                            <Checkbox
                                                id="external-refund-confirmed"
                                                checked={externalRefundConfirmed}
                                                onCheckedChange={(value) => setExternalRefundConfirmed(value === true)}
                                            />
                                            <Label htmlFor="external-refund-confirmed" className="cursor-pointer text-xs leading-relaxed">
                                                Confirmo que el dinero ya fue devuelto por el método correspondiente.
                                            </Label>
                                        </div>
                                    </div>
                                )}
                            </div>
                            <DialogFooter>
                                <Button
                                    variant="ghost"
                                    onClick={() => {
                                        setCancellationMembership(null);
                                        setExternalRefundConfirmed(false);
                                    }}
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
                                            refund: isElevated && cancelRefund,
                                        });
                                    }}
                                    disabled={cancelMutation.isPending || (isElevated && cancelRefund && !externalRefundConfirmed)}
                                >
                                    {cancelMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    {isElevated && cancelRefund ? 'Cancelar y registrar reembolso' : 'Cancelar sin reembolso'}
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </div>
            </AdminLayout>
        </AuthGuard>
    );
}
