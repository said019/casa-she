import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { format } from 'date-fns';
import type { Membership } from '@/types/auth';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useIsElevated } from '@/hooks/useIsElevated';
import { ManualPriceAdjustmentFields } from '@/components/payments/ManualPriceAdjustmentFields';
import { calculateManualDiscount, MANUAL_ADJUSTMENT_COMMENT_MIN_LENGTH } from '@/lib/manualDiscount';

const activationSchema = z.object({
  paymentMethod: z.enum(['cash', 'transfer', 'card', 'online', 'gratis'], {
    required_error: 'Selecciona un método de pago',
  }),
  // Motivo obligatorio cuando paymentMethod === 'gratis' (lo valida el botón / backend).
  reason: z.string().optional(),
  discountType: z.enum(['percentage', 'fixed']).optional(),
  discountValue: z.coerce.number().min(0).optional(),
  paymentReference: z.string().max(255).optional(),
  startDate: z.string().min(1, 'Selecciona la fecha de inicio'),
  notes: z.string().max(500).optional(),
  notifyMember: z.boolean().default(true),
  generateWalletPass: z.boolean().default(false),
});

export type ActivationForm = z.infer<typeof activationSchema>;

interface MembershipActivationDialogProps {
  open: boolean;
  membership: Membership | null;
  isSubmitting?: boolean;
  onOpenChange: (open: boolean) => void;
  onActivate: (membershipId: string, data: ActivationForm) => void;
}

const paymentLabels: Record<ActivationForm['paymentMethod'], string> = {
  cash: 'Efectivo',
  transfer: 'Transferencia',
  card: 'Tarjeta',
  online: 'Pago en línea',
  gratis: 'Gratis',
};

/** Métodos visibles al activar: base + 'online' (legado). 'gratis' solo para elevados. */
const ACTIVATION_BASE_METHODS: ActivationForm['paymentMethod'][] = ['cash', 'transfer', 'card', 'online'];

const formatCurrency = (amount?: number | null, currency = 'MXN') => {
  if (amount === null || amount === undefined) return '—';
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
};

export function MembershipActivationDialog({
  open,
  membership,
  isSubmitting,
  onOpenChange,
  onActivate,
}: MembershipActivationDialogProps) {
  const isElevated = useIsElevated();
  const [discountEnabled, setDiscountEnabled] = useState(false);
  const visibleMethods = isElevated
    ? [...ACTIVATION_BASE_METHODS, 'gratis' as const]
    : ACTIVATION_BASE_METHODS;

  const today = format(new Date(), 'yyyy-MM-dd');
  const { register, setValue, watch, handleSubmit, reset, formState: { errors } } = useForm<ActivationForm>({
    resolver: zodResolver(activationSchema),
    defaultValues: {
      paymentMethod: 'transfer',
      startDate: today,
      notifyMember: true,
      generateWalletPass: false,
    },
  });

  useEffect(() => {
    register('paymentMethod');
    register('notifyMember');
    register('generateWalletPass');
  }, [register]);

  useEffect(() => {
    if (!membership) return;
    let resolvedPaymentMethod: ActivationForm['paymentMethod'] =
      membership.payment_method && Object.prototype.hasOwnProperty.call(paymentLabels, membership.payment_method)
        ? (membership.payment_method as ActivationForm['paymentMethod'])
        : 'transfer';
    // 'gratis' solo es seleccionable por elevados; si no, no debe quedar como valor del Select.
    if (resolvedPaymentMethod === 'gratis' && !isElevated) resolvedPaymentMethod = 'transfer';
    reset({
      paymentMethod: resolvedPaymentMethod,
      reason: '',
      discountType: 'percentage',
      discountValue: 0,
      paymentReference: membership.payment_reference || '',
      startDate: today,
      notes: '',
      notifyMember: true,
      generateWalletPass: false,
    });
    setDiscountEnabled(false);
  }, [membership, reset, today, isElevated]);

  const paymentMethod = watch('paymentMethod');
  const reason = watch('reason');
  const discountType = watch('discountType') ?? 'percentage';
  const discountValue = watch('discountValue') ?? 0;
  const notifyMember = watch('notifyMember');
  const isGratis = paymentMethod === 'gratis';

  const amount = membership?.plan_price ?? membership?.price_paid ?? null;
  const currency = membership?.plan_currency || 'MXN';
  const adjustment = calculateManualDiscount(amount ?? 0, discountEnabled && !isGratis, discountType, discountValue);
  const adjustmentNeedsComment = isGratis || discountEnabled;
  const adjustmentValid = (!discountEnabled || adjustment.valid) &&
    (!adjustmentNeedsComment || (reason ?? '').trim().length >= MANUAL_ADJUSTMENT_COMMENT_MIN_LENGTH);

  const onSubmit = (data: ActivationForm) => {
    if (!membership) return;
    const payload = { ...data };
    if (!discountEnabled || isGratis) {
      delete payload.discountType;
      delete payload.discountValue;
    }
    if (!adjustmentNeedsComment) delete payload.reason;
    onActivate(membership.id, payload);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Activar Membresía</DialogTitle>
          <DialogDescription>
            Confirma el pago y define la fecha de inicio.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border bg-muted/40 p-4 space-y-1">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Cliente</p>
          <p className="text-base font-medium">{membership?.user_name || '—'}</p>
          <p className="text-sm text-muted-foreground">{membership?.plan_name || '—'}</p>
          <p className="text-sm text-muted-foreground">
            Monto: {formatCurrency(amount, currency)}
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label>Método de pago recibido *</Label>
            <Select
              value={paymentMethod}
              onValueChange={(value) => setValue('paymentMethod', value as ActivationForm['paymentMethod'])}
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar método" />
              </SelectTrigger>
              <SelectContent>
                {visibleMethods.map((value) => (
                  <SelectItem key={value} value={value}>
                    {paymentLabels[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.paymentMethod && (
              <p className="text-xs text-destructive">{errors.paymentMethod.message}</p>
            )}
          </div>

          <ManualPriceAdjustmentFields
            idPrefix="activate-membership"
            listPrice={amount ?? 0}
            isGratis={isGratis}
            discountEnabled={discountEnabled}
            discountType={discountType}
            discountValue={String(discountValue || '')}
            comment={reason ?? ''}
            onDiscountEnabledChange={setDiscountEnabled}
            onDiscountTypeChange={(value) => setValue('discountType', value)}
            onDiscountValueChange={(value) => setValue('discountValue', Number(value) || 0)}
            onCommentChange={(value) => setValue('reason', value)}
          />

          <div className="space-y-2">
            <Label>Referencia (opcional)</Label>
            <Input placeholder="Folio o referencia" {...register('paymentReference')} />
          </div>

          <div className="space-y-2">
            <Label>Fecha de inicio *</Label>
            <Input type="date" {...register('startDate')} />
            {errors.startDate && (
              <p className="text-xs text-destructive">{errors.startDate.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Notas (opcional)</Label>
            <Textarea
              placeholder="Notas internas sobre el pago"
              rows={3}
              {...register('notes')}
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <Checkbox
                checked={notifyMember}
                onCheckedChange={(checked) => setValue('notifyMember', checked === true)}
                id="notify-member"
              />
              <Label htmlFor="notify-member" className="text-sm leading-5">
                Enviar notificación al cliente
              </Label>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={
                isSubmitting ||
                !membership ||
                !adjustmentValid
              }
            >
              Activar Membresía
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
