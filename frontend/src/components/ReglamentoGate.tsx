import { useState } from 'react';
import api, { getErrorMessage } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Loader2 } from 'lucide-react';

/**
 * Modal de aceptación del reglamento de Casa Shé.
 * Obligatorio antes de la primera reserva (el backend también lo exige: 403 REGLAMENTO_REQUIRED).
 * Al aceptar: POST /auth/accept-reglamento → checkAuth() → onAccepted().
 *
 * NOTA: el texto es un reglamento base; reemplazar por el reglamento oficial de Casa Shé.
 */
type Props = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onAccepted?: () => void;
};

export function ReglamentoGate({ open, onOpenChange, onAccepted }: Props) {
    const { checkAuth } = useAuthStore();
    const { toast } = useToast();
    const [checked, setChecked] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    const accept = async () => {
        if (!checked) return;
        setSubmitting(true);
        try {
            await api.post('/auth/accept-reglamento');
            await checkAuth(); // refresca user.reglamento_accepted_at
            toast({ title: 'Reglamento aceptado', description: 'Bienvenida a casa.' });
            onOpenChange(false);
            onAccepted?.();
        } catch (err) {
            toast({ variant: 'destructive', title: 'No se pudo registrar', description: getErrorMessage(err) });
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle className="font-heading text-2xl">Reglamento de Casa Shé</DialogTitle>
                    <DialogDescription>
                        Antes de tu primera reserva, léelo y acéptalo. Es lo que nos cuida a todas.
                    </DialogDescription>
                </DialogHeader>

                <div className="max-h-[50vh] overflow-y-auto pr-1 text-sm leading-relaxed text-foreground/85 space-y-3">
                    <p><strong>1. Llegada.</strong> Llega 10 minutos antes de tu clase. Por respeto al grupo, el acceso puede cerrarse una vez iniciada la sesión.</p>
                    <p><strong>2. Reservas y cupo.</strong> Cada clase tiene lugares limitados (6–7). Reserva con anticipación; si está llena, puedes anotarte en lista de espera.</p>
                    <p><strong>3. Cancelaciones.</strong> Puedes cancelar hasta <strong>5 horas antes</strong> de tu clase y tu crédito se devuelve. Después de ese tiempo, o si no asistes (no-show), <strong>pierdes el crédito</strong>.</p>
                    <p><strong>4. Vigencia de créditos.</strong> Los créditos de tus paquetes tienen una vigencia de <strong>1 mes</strong> a partir de su activación.</p>
                    <p><strong>5. Salud.</strong> Eres responsable de informar al estudio cualquier condición de salud, embarazo o lesión. Escucha a tu cuerpo; aquí no hay competencia.</p>
                    <p><strong>6. Comunidad.</strong> Casa Shé es un espacio de respeto y cuidado entre mujeres. La comunidad es la medicina.</p>
                    <p className="text-foreground/60">Al aceptar confirmas que leíste y estás de acuerdo con este reglamento.</p>
                </div>

                <label className="flex items-start gap-2.5 text-sm cursor-pointer select-none">
                    <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => setChecked(e.target.checked)}
                        className="mt-0.5 h-4 w-4 accent-primary"
                    />
                    <span>He leído y acepto el reglamento de Casa Shé.</span>
                </label>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
                        Ahora no
                    </Button>
                    <Button onClick={accept} disabled={!checked || submitting}>
                        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Acepto y continúo'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export default ReglamentoGate;
