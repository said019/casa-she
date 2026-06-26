import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api, { getErrorMessage } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { Loader2 } from 'lucide-react';
import { useIsElevated } from '@/hooks/useIsElevated';
import { getMembershipPaymentMethods, GRATIS_REASON_MIN_LENGTH } from '@/lib/membershipPaymentMethods';
import { formatDateForInput, addDaysForInput } from '@/lib/date';
import { planClassLabel } from '@/lib/credits';

interface Plan {
    id: string;
    name: string;
    price: number;
    currency: string;
    duration_days: number;
    class_limit: number | null;
}

interface SellPlanDialogProps {
    userId: string;
    userName?: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSold?: () => void;
}

export default function SellPlanDialog({ userId, userName, open, onOpenChange, onSold }: SellPlanDialogProps) {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const isElevated = useIsElevated();
    const paymentMethods = getMembershipPaymentMethods(isElevated);

    const [selectedPlanId, setSelectedPlanId] = useState('');
    const [paymentMethod, setPaymentMethod] = useState<string>('cash');
    const [assignReason, setAssignReason] = useState('');
    const [assignStartDate, setAssignStartDate] = useState(formatDateForInput());
    const [assignEndDate, setAssignEndDate] = useState('');
    const isGratis = paymentMethod === 'gratis';

    const { data: plans } = useQuery<Plan[]>({
        queryKey: ['plans'],
        queryFn: async () => (await api.get('/plans')).data,
    });

    // Reset al abrir
    useEffect(() => {
        if (open) {
            setSelectedPlanId('');
            setPaymentMethod('cash');
            setAssignReason('');
            setAssignStartDate(formatDateForInput());
            setAssignEndDate('');
        }
    }, [open]);

    // Vencimiento = inicio + duración del plan, SIEMPRE automático (no editable a mano).
    // Si quieren otra vigencia, que cambien el plan. Se recalcula al cambiar inicio o plan.
    const selectedPlan = plans?.find((p) => p.id === selectedPlanId);
    useEffect(() => {
        if (selectedPlan?.duration_days && assignStartDate) {
            setAssignEndDate(addDaysForInput(assignStartDate, selectedPlan.duration_days));
        } else {
            setAssignEndDate('');
        }
    }, [selectedPlan?.duration_days, assignStartDate]);

    const assignMutation = useMutation({
        mutationFn: async () => api.post('/memberships/assign', {
            userId,
            planId: selectedPlanId,
            status: 'active',
            paymentMethod,
            startDate: assignStartDate || undefined,
            endDate: assignEndDate || undefined,
            reason: isGratis ? assignReason.trim() : undefined,
        }),
        onSuccess: () => {
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
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Vender / asignar plan</DialogTitle>
                    <DialogDescription>
                        Asigna un plan de membresía{userName ? ` a ${userName}` : ''}.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="sell-plan">Plan</Label>
                        <Select value={selectedPlanId} onValueChange={setSelectedPlanId}>
                            <SelectTrigger id="sell-plan">
                                <SelectValue placeholder="Selecciona un plan" />
                            </SelectTrigger>
                            <SelectContent>
                                {plans?.map((plan) => (
                                    <SelectItem key={plan.id} value={plan.id}>
                                        {plan.name} - ${plan.price} {plan.currency} ({plan.duration_days} días)
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                            <Label htmlFor="sell-start">Inicio</Label>
                            <Input id="sell-start" type="date" value={assignStartDate}
                                onChange={(e) => setAssignStartDate(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="sell-end">Vence (automático)</Label>
                            <Input id="sell-end" type="date" value={assignEndDate} disabled
                                title="Se calcula del plan (inicio + duración). Para cambiarlo, cambia el plan." />
                        </div>
                    </div>

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

                    {isGratis && (
                        <div className="space-y-2">
                            <Label htmlFor="sell-gratis-reason">
                                Motivo (obligatorio) <span className="text-destructive">*</span>
                            </Label>
                            <Textarea id="sell-gratis-reason" value={assignReason} rows={2}
                                onChange={(e) => setAssignReason(e.target.value)}
                                placeholder="Ej. Cortesía por promoción / compensación" />
                            <p className="text-xs text-muted-foreground">
                                Se registra en $0 y queda en bitácora (mínimo {GRATIS_REASON_MIN_LENGTH} caracteres).
                            </p>
                        </div>
                    )}

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
                            assignMutation.isPending ||
                            (isGratis && assignReason.trim().length < GRATIS_REASON_MIN_LENGTH)
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
