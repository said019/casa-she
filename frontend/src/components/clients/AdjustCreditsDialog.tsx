import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import api, { getErrorMessage } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { useHasPermission } from '@/hooks/useHasPermission';
import { Loader2, Coins, AlertCircle } from 'lucide-react';

type Bucket = 'reformer_remaining' | 'multi_remaining' | 'classes_remaining';

interface AdjustCreditsMembership {
    id: string;
    reformer_remaining?: number | null;
    multi_remaining?: number | null;
    classes_remaining?: number | null;
}

/**
 * Diálogo compartido para ajustar créditos por categoría (bucket). Espeja el de
 * recepción (ClientsScreen → AdjustCreditsDialog): select de bucket, cambio (±1±2±3
 * o input libre con permiso `creditos_sin_limite`), motivo (mín. 5) y preview.
 * PATCH /memberships/:id/credits con { reason, [bucket]: nuevoValor }.
 */
export function AdjustCreditsDialog({
    membership,
    onDone,
    trigger,
    open: controlledOpen,
    onOpenChange,
}: {
    membership: AdjustCreditsMembership;
    onDone: () => void;
    trigger?: React.ReactNode;
    /** Modo controlado opcional (p. ej. abrir desde un menú). Si se omite, el diálogo
     *  gestiona su propio estado y muestra su trigger. */
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
}) {
    const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
    const isControlled = controlledOpen !== undefined;
    const open = isControlled ? controlledOpen : uncontrolledOpen;
    const setOpen = (v: boolean) => {
        if (!isControlled) setUncontrolledOpen(v);
        onOpenChange?.(v);
    };
    // Solo se ofrecen los buckets que el plan realmente tiene. Ningún plan activo
    // usa el genérico (classes_remaining); solo aparece en membresías legacy que NO
    // tienen reformer/multi. "Full/ilimitado" cae al fallback para poder otorgar.
    const availableBuckets: Bucket[] = (() => {
        const out: Bucket[] = [];
        if (typeof membership.reformer_remaining === 'number') out.push('reformer_remaining');
        if (typeof membership.multi_remaining === 'number') out.push('multi_remaining');
        if (out.length === 0 && typeof membership.classes_remaining === 'number') out.push('classes_remaining');
        if (out.length === 0) out.push('reformer_remaining', 'multi_remaining');
        return out;
    })();
    const defaultBucket = availableBuckets[0];

    const [bucket, setBucket] = useState<Bucket>(defaultBucket);
    const [delta, setDelta] = useState<number>(0);
    const [reason, setReason] = useState('');
    const sinLimite = useHasPermission('creditos_sin_limite'); // master/admin: sin tope de ±3

    const current = membership[bucket] ?? 0;
    const next = Math.max(0, current + delta);

    // Cada vez que se abre (incluido cambio de membresía en modo controlado), arranca limpio.
    useEffect(() => {
        if (open) {
            setBucket(defaultBucket);
            setDelta(0);
            setReason('');
        }
    }, [open, membership.id, defaultBucket]);

    const adjust = useMutation({
        mutationFn: async () => {
            const payload: Record<string, unknown> = { reason };
            payload[bucket] = next;
            return api.patch(`/memberships/${membership.id}/credits`, payload);
        },
        onSuccess: () => {
            toast.success('Créditos ajustados');
            setOpen(false);
            setDelta(0);
            setReason('');
            onDone();
        },
        onError: (e) => toast.error(getErrorMessage(e)),
    });

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            {!isControlled && (
                <DialogTrigger asChild>
                    {trigger ?? (
                        <Button variant="outline" size="sm">
                            <Coins className="h-3.5 w-3.5 mr-2" /> Ajustar créditos
                        </Button>
                    )}
                </DialogTrigger>
            )}
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Ajustar créditos</DialogTitle>
                </DialogHeader>
                <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900 flex gap-2">
                    <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                    <span>
                        {sinLimite
                            ? <>Puedes ajustar <strong>cualquier cantidad</strong> (positiva o negativa). El motivo es obligatorio y queda en bitácora.</>
                            : <>Solo puedes ajustar <strong>±3 créditos</strong> por movimiento. El motivo es obligatorio y queda en bitácora.</>}
                    </span>
                </div>
                <div className="space-y-3 mt-3">
                    <div className="space-y-1">
                        <Label>Bucket</Label>
                        <Select value={bucket} onValueChange={(v) => setBucket(v as Bucket)}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {availableBuckets.map((b) => (
                                    <SelectItem key={b} value={b}>
                                        {b === 'reformer_remaining' ? 'Reformer' : b === 'multi_remaining' ? 'Multi' : 'Clases (sin categoría)'}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">Saldo actual: {current} → nuevo: {next}</p>
                    </div>
                    <div className="space-y-1">
                        <Label>Cambio</Label>
                        {sinLimite ? (
                            <Input
                                type="number"
                                value={delta}
                                onChange={(e) => setDelta(Math.trunc(Number(e.target.value)) || 0)}
                                placeholder="Ej. 10 para agregar, -10 para quitar"
                            />
                        ) : (
                            <div className="flex items-center gap-2">
                                {[-3, -2, -1, 1, 2, 3].map((d) => (
                                    <Button
                                        key={d}
                                        type="button"
                                        variant={delta === d ? 'default' : 'outline'}
                                        size="sm"
                                        onClick={() => setDelta(d)}
                                    >
                                        {d > 0 ? `+${d}` : d}
                                    </Button>
                                ))}
                            </div>
                        )}
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="ac-reason">Motivo (mínimo 5 caracteres)</Label>
                        <Input
                            id="ac-reason"
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder="Ej. Compensación por clase suspendida"
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                    <Button
                        onClick={() => adjust.mutate()}
                        disabled={adjust.isPending || delta === 0 || reason.trim().length < 5}
                    >
                        {adjust.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                        Aplicar
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export default AdjustCreditsDialog;
