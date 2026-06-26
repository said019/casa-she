import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Save, Gift, Star } from 'lucide-react';
import { AdminLayout } from '@/components/layout/AdminLayout';
import api from '@/lib/api';

interface LoyaltyConfig {
    points_per_class: number;
    points_per_peso: number;
    points_per_peso_cash: number;
    pesos_per_point: number;
    enabled: boolean;
    welcome_bonus: number;
    birthday_bonus: number;
    anniversary_bonus: number;
    referral_bonus: number;
    streak_bonus: number;
}

export default function LoyaltyConfig() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [plans, setPlans] = useState<{ id: string; name: string; price: number }[]>([]);
    const [config, setConfig] = useState<LoyaltyConfig>({
        points_per_class: 2,
        points_per_peso: 1,
        points_per_peso_cash: 2,
        pesos_per_point: 10,
        enabled: true,
        welcome_bonus: 10,
        birthday_bonus: 100,
        anniversary_bonus: 40,
        referral_bonus: 40,
        streak_bonus: 10,
    });
    const { toast } = useToast();

    useEffect(() => {
        loadConfig();
        api.get('/plans?active=true').then(r => setPlans(r.data || [])).catch(() => {});
    }, []);

    const loadConfig = async () => {
        try {
            const response = await api.get('/loyalty/config');
            if (response.data) {
                setConfig(prev => ({ ...prev, ...response.data }));
            }
        } catch (error) {
            console.error('Error loading config:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await api.put('/loyalty/config', config);
            toast({
                title: 'Configuración guardada',
                description: 'La configuración de lealtad se ha guardado correctamente.',
            });
        } catch (error) {
            toast({
                title: 'Error',
                description: 'No se pudo guardar la configuración.',
                variant: 'destructive',
            });
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
                    <h1 className="text-3xl font-heading font-bold">Configuración de Lealtad</h1>
                    <p className="text-muted-foreground">
                        Configura cómo los usuarios ganan puntos.
                    </p>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Star className="h-5 w-5" />
                            Estado del Programa
                        </CardTitle>
                        <CardDescription>
                            Activa o desactiva el programa de lealtad
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                                <Label>Programa de Lealtad Activo</Label>
                                <p className="text-sm text-muted-foreground">
                                    Los usuarios pueden ganar y canjear puntos
                                </p>
                            </div>
                            <Switch
                                checked={config.enabled}
                                onCheckedChange={(checked) => setConfig({
                                    ...config,
                                    enabled: checked
                                })}
                            />
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Puntos por Actividad</CardTitle>
                        <CardDescription>
                            Define cuántos puntos ganan los usuarios por sus acciones
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="points_per_class">Puntos por asistir a clase</Label>
                                <Input
                                    id="points_per_class"
                                    type="number"
                                    min={0}
                                    value={config.points_per_class}
                                    onChange={(e) => setConfig({
                                        ...config,
                                        points_per_class: parseInt(e.target.value) || 0
                                    })}
                                />
                                <p className="text-xs text-muted-foreground">
                                    Por cada check-in confirmado
                                </p>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="pesos_per_point">1 punto por cada $ gastado</Label>
                                <Input
                                    id="pesos_per_point"
                                    type="number"
                                    min={1}
                                    value={config.pesos_per_point}
                                    onChange={(e) => setConfig({
                                        ...config,
                                        pesos_per_point: parseInt(e.target.value) || 1
                                    })}
                                />
                                <p className="text-xs text-muted-foreground">
                                    Ej. <strong>10</strong> = la clienta gana 1 punto por cada $10 gastados (tarjeta, transferencia o efectivo).
                                </p>
                            </div>
                        </div>

                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Gift className="h-5 w-5 text-balance-olive" />
                            Puntos por paquete (calculado)
                        </CardTitle>
                        <CardDescription>
                            Puntos que da cada plan: su precio ÷ los pesos por punto de arriba. Se actualiza al cambiar la tasa.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {plans.length === 0 ? (
                            <p className="text-sm text-muted-foreground">No hay planes activos.</p>
                        ) : (
                            <div className="space-y-1.5">
                                <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-muted-foreground pb-1">
                                    <span>Plan</span>
                                    <span className="w-24 text-right">Puntos</span>
                                </div>
                                {plans.map((p) => (
                                    <div key={p.id} className="flex items-center justify-between text-sm border-t border-balance-sand/40 pt-1.5">
                                        <span className="font-medium">
                                            {p.name}{' '}
                                            <span className="text-xs text-muted-foreground">(${Number(p.price).toLocaleString('es-MX')})</span>
                                        </span>
                                        <span className="w-24 text-right font-semibold text-balance-olive">
                                            {Math.floor(Number(p.price) / (config.pesos_per_point || 10)).toLocaleString('es-MX')} pts
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Gift className="h-5 w-5" />
                            Bonos Especiales
                        </CardTitle>
                        <CardDescription>
                            Puntos adicionales por eventos especiales
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="welcome_bonus">Bono de Bienvenida</Label>
                                <Input
                                    id="welcome_bonus"
                                    type="number"
                                    min={0}
                                    value={config.welcome_bonus}
                                    onChange={(e) => setConfig({
                                        ...config,
                                        welcome_bonus: parseInt(e.target.value) || 0
                                    })}
                                />
                                <p className="text-xs text-muted-foreground">
                                    Al registrarse como usuario
                                </p>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="birthday_bonus">Bono de Cumpleaños</Label>
                                <Input
                                    id="birthday_bonus"
                                    type="number"
                                    min={0}
                                    value={config.birthday_bonus}
                                    onChange={(e) => setConfig({
                                        ...config,
                                        birthday_bonus: parseInt(e.target.value) || 0
                                    })}
                                />
                                <p className="text-xs text-muted-foreground">
                                    Cron diario · requiere membresía activa
                                </p>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="anniversary_bonus">Bono de Aniversario</Label>
                                <Input
                                    id="anniversary_bonus"
                                    type="number"
                                    min={0}
                                    value={config.anniversary_bonus}
                                    onChange={(e) => setConfig({
                                        ...config,
                                        anniversary_bonus: parseInt(e.target.value) || 0
                                    })}
                                />
                                <p className="text-xs text-muted-foreground">
                                    1 año desde el registro
                                </p>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="referral_bonus">Bono por Referido</Label>
                                <Input
                                    id="referral_bonus"
                                    type="number"
                                    min={0}
                                    value={config.referral_bonus}
                                    onChange={(e) => setConfig({
                                        ...config,
                                        referral_bonus: parseInt(e.target.value) || 0
                                    })}
                                />
                                <p className="text-xs text-muted-foreground">
                                    Cuando su referido completa una compra
                                </p>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="streak_bonus">Bono por Racha</Label>
                                <Input
                                    id="streak_bonus"
                                    type="number"
                                    min={0}
                                    value={config.streak_bonus}
                                    onChange={(e) => setConfig({
                                        ...config,
                                        streak_bonus: parseInt(e.target.value) || 0
                                    })}
                                />
                                <p className="text-xs text-muted-foreground">
                                    Cada 2 semanas consecutivas asistiendo
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <div className="flex justify-end">
                    <Button onClick={handleSave} disabled={saving}>
                        {saving ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                            <Save className="mr-2 h-4 w-4" />
                        )}
                        Guardar Configuración
                    </Button>
                </div>
            </div>
        </AdminLayout>
    );
}
