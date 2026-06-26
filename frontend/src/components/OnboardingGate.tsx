import { useState } from 'react';
import api, { getErrorMessage } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { Loader2 } from 'lucide-react';

/**
 * Primer ingreso con contraseña temporal: el usuario completa sus datos (nombre + teléfono)
 * y elige una contraseña nueva. Al guardar, temp_password queda en false y desaparece el gate.
 * Se muestra desde AuthGuard cuando user.temp_password === true.
 */
export function OnboardingGate() {
    const { user, checkAuth, logout } = useAuthStore();
    const { toast } = useToast();
    const [displayName, setDisplayName] = useState(
        user?.display_name && user.display_name !== 'Recepción' ? user.display_name : '',
    );
    const [phone, setPhone] = useState(
        user?.phone && user.phone !== '0000000000' ? user.phone : '',
    );
    const [pw, setPw] = useState('');
    const [pw2, setPw2] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!displayName.trim()) { toast({ variant: 'destructive', title: 'Falta tu nombre' }); return; }
        if (phone.replace(/\D/g, '').length < 10) { toast({ variant: 'destructive', title: 'Teléfono inválido', description: 'Debe tener 10 dígitos.' }); return; }
        if (pw.length < 6) { toast({ variant: 'destructive', title: 'Contraseña muy corta', description: 'Mínimo 6 caracteres.' }); return; }
        if (pw !== pw2) { toast({ variant: 'destructive', title: 'Las contraseñas no coinciden' }); return; }
        setSubmitting(true);
        try {
            await api.post('/auth/complete-onboarding', {
                newPassword: pw,
                displayName: displayName.trim(),
                phone: phone.trim(),
            });
            await checkAuth(); // refresca: temp_password=false → AuthGuard desmonta este gate
            toast({ title: '¡Listo!', description: 'Tu acceso quedó configurado.' });
        } catch (err) {
            toast({ variant: 'destructive', title: 'No se pudo completar', description: getErrorMessage(err) });
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="flex min-h-screen items-center justify-center bg-bmb-cream px-4 py-10">
            <div className="w-full max-w-md rounded-2xl border border-bmb-ink/10 bg-white p-7 shadow-xl">
                <h1 className="font-heading text-2xl text-bmb-ink">Completa tu acceso</h1>
                <p className="mt-1 text-sm text-bmb-ink/60">
                    Entraste con una contraseña temporal. Completa tus datos y elige una contraseña nueva.
                </p>
                <form onSubmit={submit} className="mt-6 space-y-4">
                    <div className="space-y-1.5">
                        <Label>Tu nombre</Label>
                        <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Nombre y apellido" autoFocus />
                    </div>
                    <div className="space-y-1.5">
                        <Label>Teléfono (WhatsApp)</Label>
                        <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="10 dígitos" inputMode="tel" />
                    </div>
                    <div className="space-y-1.5">
                        <Label>Nueva contraseña</Label>
                        <Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Mínimo 6 caracteres" autoComplete="new-password" />
                    </div>
                    <div className="space-y-1.5">
                        <Label>Confirmar contraseña</Label>
                        <Input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder="Repite la contraseña" autoComplete="new-password" />
                    </div>
                    <Button type="submit" className="w-full" disabled={submitting}>
                        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Guardar y continuar'}
                    </Button>
                    <button type="button" onClick={logout} className="w-full text-center text-xs text-bmb-ink/50 hover:underline">
                        Cerrar sesión
                    </button>
                </form>
            </div>
        </div>
    );
}
