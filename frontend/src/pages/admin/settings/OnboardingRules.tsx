import { useEffect, useState } from 'react';
import api, { getErrorMessage } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { AdminLayout } from '@/components/layout/AdminLayout';

/**
 * Editor básico (JSON) de las reglas del onboarding perfilador.
 * Lee/escribe system_settings['onboarding_recommendation_rules'] vía el endpoint genérico de settings.
 */
export default function OnboardingRules() {
    const { toast } = useToast();
    const [text, setText] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        (async () => {
            try {
                const res = await api.get('/settings/onboarding_recommendation_rules');
                setText(JSON.stringify(res.data?.value, null, 2));
            } catch (err) {
                toast({
                    variant: 'destructive',
                    title: 'No se pudieron cargar las reglas',
                    description: getErrorMessage(err),
                });
            } finally {
                setLoading(false);
            }
        })();
    }, [toast]);

    const save = async () => {
        let parsed: unknown;
        try {
            parsed = JSON.parse(text);
        } catch {
            toast({ variant: 'destructive', title: 'JSON inválido', description: 'Revisa la sintaxis.' });
            return;
        }
        setSaving(true);
        try {
            await api.put('/settings/onboarding_recommendation_rules', { value: parsed });
            toast({ title: 'Reglas guardadas' });
        } catch (err) {
            toast({ variant: 'destructive', title: 'No se pudo guardar', description: getErrorMessage(err) });
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <AdminLayout>
                <div className="flex items-center justify-center h-64">
                    <Loader2 className="h-8 w-8 animate-spin" />
                </div>
            </AdminLayout>
        );
    }

    return (
        <AdminLayout>
            <div className="space-y-6">
                <div>
                    <h1 className="text-3xl font-heading font-bold">Reglas del onboarding perfilador</h1>
                    <p className="text-muted-foreground">
                        Pesos por disciplina, mapeo de paquetes y frases. Edita con cuidado (JSON).
                    </p>
                </div>

                <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    rows={24}
                    className="w-full rounded-xl border border-input bg-background p-4 font-mono text-xs"
                    spellCheck={false}
                />

                <div className="flex justify-end">
                    <Button onClick={save} disabled={saving}>
                        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Guardar reglas
                    </Button>
                </div>
            </div>
        </AdminLayout>
    );
}
