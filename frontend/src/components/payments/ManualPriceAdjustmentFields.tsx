import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  calculateManualDiscount,
  MANUAL_ADJUSTMENT_COMMENT_MIN_LENGTH,
  type ManualDiscountType,
} from '@/lib/manualDiscount';

interface ManualPriceAdjustmentFieldsProps {
  listPrice: number;
  isGratis: boolean;
  discountEnabled: boolean;
  discountType: ManualDiscountType;
  discountValue: string;
  comment: string;
  onDiscountEnabledChange: (enabled: boolean) => void;
  onDiscountTypeChange: (type: ManualDiscountType) => void;
  onDiscountValueChange: (value: string) => void;
  onCommentChange: (value: string) => void;
  idPrefix: string;
}

const mxn = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

export function ManualPriceAdjustmentFields({
  listPrice,
  isGratis,
  discountEnabled,
  discountType,
  discountValue,
  comment,
  onDiscountEnabledChange,
  onDiscountTypeChange,
  onDiscountValueChange,
  onCommentChange,
  idPrefix,
}: ManualPriceAdjustmentFieldsProps) {
  const adjustment = calculateManualDiscount(listPrice, discountEnabled, discountType, discountValue);
  const hasAdjustment = isGratis || discountEnabled;
  const commentTooShort = hasAdjustment && comment.trim().length < MANUAL_ADJUSTMENT_COMMENT_MIN_LENGTH;

  return (
    <div className="min-w-0 space-y-4 border-t border-border/70 pt-4">
      {!isGratis && (
        <div className="flex items-center justify-between gap-4 rounded-lg bg-muted/30 px-3 py-3">
          <div className="min-w-0 space-y-1">
            <Label htmlFor={`${idPrefix}-discount-toggle`}>Aplicar descuento</Label>
            <p className="text-xs leading-5 text-muted-foreground">
              Se aplica al total sin importar el método de pago.
            </p>
          </div>
          <Switch
            id={`${idPrefix}-discount-toggle`}
            className="shrink-0"
            checked={discountEnabled}
            onCheckedChange={onDiscountEnabledChange}
          />
        </div>
      )}

      {!isGratis && discountEnabled && (
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-discount-type`}>Tipo de descuento</Label>
            <Select value={discountType} onValueChange={(value) => onDiscountTypeChange(value as ManualDiscountType)}>
              <SelectTrigger id={`${idPrefix}-discount-type`} className="h-11 w-full text-base sm:text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="percentage">Porcentaje</SelectItem>
                <SelectItem value="fixed">Monto fijo</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-discount-value`}>
              {discountType === 'percentage' ? 'Porcentaje (%)' : 'Monto (MXN)'}
            </Label>
            <Input
              id={`${idPrefix}-discount-value`}
              type="number"
              inputMode="decimal"
              min="0"
              max={discountType === 'percentage' ? '99.99' : undefined}
              step="0.01"
              value={discountValue}
              onChange={(event) => onDiscountValueChange(event.target.value)}
              placeholder={discountType === 'percentage' ? 'Ej. 10' : 'Ej. 250'}
              className="h-11 text-base sm:text-sm"
            />
            {!adjustment.valid && (
              <p className="text-xs text-destructive">
                {Number(discountValue) > 0
                  ? 'Para dejar el total en cero, usa Gratis.'
                  : 'Ingresa un descuento mayor a cero.'}
              </p>
            )}
          </div>
        </div>
      )}

      {hasAdjustment && (
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-adjustment-comment`}>
            Comentario (obligatorio) <span className="text-destructive">*</span>
          </Label>
          <Textarea
            id={`${idPrefix}-adjustment-comment`}
            value={comment}
            onChange={(event) => onCommentChange(event.target.value)}
            rows={2}
            className="min-h-[88px] text-base sm:text-sm"
            placeholder={isGratis ? 'Ej. Cortesía autorizada por promoción' : 'Ej. Descuento autorizado por gerencia'}
          />
          <p className={commentTooShort ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}>
            Quedará guardado en el pago y la bitácora; mínimo {MANUAL_ADJUSTMENT_COMMENT_MIN_LENGTH} caracteres.
          </p>
        </div>
      )}

      {hasAdjustment && listPrice > 0 && (
        <div className="space-y-2 rounded-lg border border-border/70 bg-muted/30 p-3 text-sm">
          <div className="flex items-baseline justify-between gap-4 text-muted-foreground">
            <span>Precio de lista</span>
            <span className="shrink-0 tabular-nums">{mxn.format(listPrice)}</span>
          </div>
          <div className="flex items-baseline justify-between gap-4 text-muted-foreground">
            <span>{isGratis ? 'Cortesía' : 'Descuento'}</span>
            <span className="shrink-0 tabular-nums">-{mxn.format(isGratis ? listPrice : adjustment.discountAmount)}</span>
          </div>
          <div className="flex items-baseline justify-between gap-4 border-t border-border/70 pt-2 font-semibold">
            <span>Total a registrar</span>
            <span className="shrink-0 tabular-nums">{mxn.format(isGratis ? 0 : adjustment.total)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
