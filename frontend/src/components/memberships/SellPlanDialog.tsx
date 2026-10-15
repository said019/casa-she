import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api, { getErrorMessage } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { Loader2 } from 'lucide-react';
import { useIsElevated } from '@/hooks/useIsElevated';
import { getMembershipPaymentMethods } from '@/lib/membershipPaymentMethods';
import { addDaysForInput, studioTodayForInput } from '@/lib/date';
import { Input } from '@/components/ui/input';
import { planClassLabel } from '@/lib/credits';
import { ManualPriceAdjustmentFields } from '@/components/payments/ManualPriceAdjustmentFields';
import { calculateManualDiscount, MANUAL_ADJUSTMENT_COMMENT_MIN_LENGTH, type ManualDiscountType } from '@/lib/manualDiscount';
import { MembershipStartPicker } from '@/components/memberships/MembershipStartPicker';

interface Plan {
    id: string;
    name: string;
    price: number;
    currency: string;
    duration_days: number;
    class_limit: number | null;
    is_active?: boolean;
    is_internal?: boolean;
}

interface SellPlanDialogProps {
    userId: string;
    userName?: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSold?: () => void;
    calendarMode?: boolean;
}

export default function SellPlanDialog({ userId, userName, open, onOpenChange, onSold, calendarMode = false }: SellPlanDialogProps) {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const isElevated = useIsElevated();
    const paymentMethods = getMembershipPaymentMethods(isElevated);

    const [selectedPlanId, setSelectedPlanId] = useState('');
    const [paymentMethod, setPaymentMethod] = useState<string>('cash');
    const [assignReason, setAssignReason] = useState('');
    const [discountEnabled, setDiscountEnabled] = useState(false);
    const [discountType, setDiscountType] = useState<ManualDiscountType>('percentage');
    const [discountValue, setDiscountValue] = useState('');
    const [assignStartDate, setAssignStartDate] = useState('');
    const [assignEndDate, setAssignEndDate] = useState('');
    const [endEdited, setEndEdited] = useState(false);
    const [paymentDate, setPaymentDate] = useState(studioTodayForInput());
    const [paymentConfirmed, setPaymentConfirmed] = useState(false);
    const attempt = useRef<{ payload: string; key: string } | null>(null);
    const isGratis = paymentMethod === 'gratis';

    const { data: plans, isLoading, isError, refetch } = useQuery<Plan[]>({
        queryKey: ['plans'],
        queryFn: async () => (await api.get('/plans')).data,
    });

    // Reset al abrir
    useEffect(() => {
        if (open) {
            setSelectedPlanId('');
            setPaymentMethod('cash');
            setAssignReason('');
            setDiscountEnabled(false);
            setDiscountType('percentage');
            setDiscountValue('');
            setAssignStartDate('');
            setAssignEndDate('');
            setEndEdited(false);
            setPaymentDate(studioTodayForInput());
            setPaymentConfirmed(false);
            attempt.current = null;
        }
    }, [open]);

    // La agenda permite conservar un vencimiento acordado; los demás consumidores
    // mantienen el cálculo automático existente.
    const selectedPlan = plans?.find((p) => p.id === selectedPlanId);
    const adjustment = calculateManualDiscount(selectedPlan?.price ?? 0, discountEnabled && !isGratis, discountType, discountValue);
    const adjustmentNeedsComment = isGratis || discountEnabled;
    const adjustmentValid = (!discountEnabled || adjustment.valid) &&
        (!adjustmentNeedsComment || assignReason.trim().length >= MANUAL_ADJUSTMENT_COMMENT_MIN_LENGTH);
    useEffect(() => {
        if (calendarMode && endEdited) return;
        if (selectedPlan?.duration_days && assignStartDate) {
            setAssignEndDate(addDaysForInput(assignStartDate, selectedPlan.duration_days));
        } else {
            setAssignEndDate('');
        }
    }, [selectedPlan?.duration_days, assignStartDate, calendarMode, endEdited]);

    const assignMutation = useMutation({
        mutationFn: async () => {
            const payload = {
                userId,
                planId: selectedPlanId,
                status: 'active',
                paymentMethod,
                startDate: assignStartDate,
                endDate: assignEndDate || undefined,
                ...(calendarMode ? { paymentDate, respectExplicitDates: true } : {}),
                reason: adjustmentNeedsComment ? assignReason.trim() : undefined,
                ...(!isGratis && discountEnabled ? {
                    discountType,
                    discountValue: Number(discountValue),
                } : {}),
            };
            if (!calendarMode) return api.post('/memberships/assign', payload);
            const serialized = JSON.stringify(payload);
            if (attempt.current?.payload !== serialized) attempt.current = { payload: serialized, key: crypto.randomUUID() };
            return api.post('/memberships/assign', { ...payload, idempotencyKey: attempt.current.key });
        },
        onSuccess: () => {
            attempt.current = null;
            queryClient.invalidateQueries({ queryKey: ['users'] });
            toast({ title: 'Plan asignado', description: 'El plan se asignó correctamente.' });
            onOpenChange(false);
            onSold?.();
        },
        onError: (error) => {
            toast({ variant: 'destructive', title: 'Error', description: getErrorMessage(error) });
        },
    });

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Vender / asignar plan</DialogTitle>
                    <DialogDescription>
                        Asigna un plan de membresía{userName ? ` a ${userName}` : ''}.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    {isLoading && <p role="status">Cargando planes…</p>}
                    {isError && <p role="alert">No se pudieron cargar los planes. <Button variant="outline" onClick={() => refetch()}>Reintentar</Button></p>}
                    <div className="space-y-2">
                        <Label htmlFor="sell-plan">Plan</Label>
                        <Select value={selectedPlanId} onValueChange={setSelectedPlanId}>
                            <SelectTrigger id="sell-plan">
                                <SelectValue placeholder="Selecciona un plan" />
                            </SelectTrigger>
                            <SelectContent>
                                {plans?.filter(p => !calendarMode || (!p.is_internal && p.is_active !== false)).map((plan) => (
                                    <SelectItem key={plan.id} value={plan.id}>
                                        {plan.name} - ${plan.price} {plan.currency} ({plan.duration_days} días)
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {calendarMode ? <div className="grid gap-3 sm:grid-cols-2">
                        <label className="space-y-1">Inicio de vigencia<Input aria-label="Inicio de vigencia" type="date" value={assignStartDate} onChange={e => setAssignStartDate(e.target.value)} /></label>
                        <label className="space-y-1">Fin de vigencia<Input aria-label="Fin de vigencia" type="date" min={assignStartDate} value={assignEndDate} onChange={e => { setEndEdited(true); setAssignEndDate(e.target.value); }} /></label>
                        <label className="space-y-1">Fecha de pago<Input aria-label="Fecha de pago" type="date" max={studioTodayForInput()} value={paymentDate} onChange={e => setPaymentDate(e.target.value)} /></label>
                    </div> : <MembershipStartPicker
                        id="sell-start"
                        value={assignStartDate}
                        onChange={setAssignStartDate}
                        durationDays={selectedPlan?.duration_days}
                        disabled={assignMutation.isPending}
                    />}

                    <div className="space-y-2">
                        <Label htmlFor="sell-method">Método de pago</Label>
                        <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                            <SelectTrigger id="sell-method">
                                <SelectValue placeholder="Selecciona método de pago" />
                            </SelectTrigger>
                            <SelectContent>
                                {paymentMethods.map((m) => (
                                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <ManualPriceAdjustmentFields
                        idPrefix="sell-plan"
                        listPrice={selectedPlan?.price ?? 0}
                        isGratis={isGratis}
                        discountEnabled={discountEnabled}
                        discountType={discountType}
                        discountValue={discountValue}
                        comment={assignReason}
                        onDiscountEnabledChange={setDiscountEnabled}
                        onDiscountTypeChange={setDiscountType}
                        onDiscountValueChange={setDiscountValue}
                        onCommentChange={setAssignReason}
                    />
                    {calendarMode && !isGratis && <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={paymentConfirmed} onChange={e => setPaymentConfirmed(e.target.checked)} />Confirmo que el pago ya fue recibido</label>}

                    {selectedPlan && (
                        <div className="p-3 bg-muted rounded-md text-sm">
                            <p className="font-medium">Resumen:</p>
                            <ul className="mt-1 space-y-1 text-muted-foreground">
                                <li>Plan: {selectedPlan.name}</li>
                                <li>Precio: ${selectedPlan.price} {selectedPlan.currency}</li>
                                <li>Duración: {selectedPlan.duration_days} días</li>
                                <li>Créditos: {planClassLabel(selectedPlan)}</li>
                            </ul>
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
                    <Button
                        onClick={() => { if (selectedPlanId) assignMutation.mutate(); }}
                        disabled={
                            !selectedPlanId ||
                            !assignStartDate ||
                            (calendarMode && (!assignEndDate || assignEndDate < assignStartDate || !paymentDate || paymentDate > studioTodayForInput() || (!isGratis && !paymentConfirmed))) ||
                            assignMutation.isPending ||
                            !adjustmentValid
                        }
                    >
                        {assignMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Asignar Plan
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
