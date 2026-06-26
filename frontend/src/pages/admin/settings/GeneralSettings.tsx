import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Save } from 'lucide-react';
import { AdminLayout } from '@/components/layout/AdminLayout';
import api from '@/lib/api';

interface GeneralSettingsType {
    timezone: string;
    currency: string;
    date_format: string;
    language: string;
    maintenance_mode: boolean;
}

export default function GeneralSettings() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [settings, setSettings] = useState<GeneralSettingsType>({
        timezone: 'America/Mexico_City',
        currency: 'MXN',
        date_format: 'DD/MM/YYYY',
        language: 'es',
        maintenance_mode: false,
    });
    const { toast } = useToast();

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        try {
            const response = await api.get('/settings/general_settings');
            if (response.data?.value) {
                setSettings(prev => ({ ...prev, ...response.data.value }));
            }
        } catch (error) {
            console.error('Error loading settings:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await api.put('/settings/general_settings', { value: settings });
            toast({
                title: 'Configuración guardada',
                description: 'Los ajustes generales se han guardado correctamente.',
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
                    <h1 className="text-3xl font-heading font-bold">Configuración General</h1>
                    <p className="text-muted-foreground">
                        Ajustes generales del sistema.
                    </p>
                </div>

                <Card>
                <CardHeader>
                    <CardTitle>Localización</CardTitle>
                    <CardDescription>
                        Configura el idioma, zona horaria y formato de fechas
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="timezone">Zona Horaria</Label>
                            <Select
                                value={settings.timezone}
                                onValueChange={(value) => setSettings({ ...settings, timezone: value })}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Seleccionar zona horaria" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="America/Mexico_City">Ciudad de México (GMT-6)</SelectItem>
                                    <SelectItem value="America/Monterrey">Monterrey (GMT-6)</SelectItem>
                                    <SelectItem value="America/Tijuana">Tijuana (GMT-8)</SelectItem>
                                    <SelectItem value="America/Cancun">Cancún (GMT-5)</SelectItem>
                                    <SelectItem value="America/Hermosillo">Hermosillo (GMT-7)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="language">Idioma</Label>
                            <Select
                                value={settings.language}
                                onValueChange={(value) => setSettings({ ...settings, language: value })}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Seleccionar idioma" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="es">Español</SelectItem>
                                    <SelectItem value="en">English</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="currency">Moneda</Label>
                            <Select
                                value={settings.currency}
                                onValueChange={(value) => setSettings({ ...settings, currency: value })}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Seleccionar moneda" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="MXN">Peso Mexicano (MXN)</SelectItem>
                                    <SelectItem value="USD">Dólar Americano (USD)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="date_format">Formato de Fecha</Label>
                            <Select
                                value={settings.date_format}
                                onValueChange={(value) => setSettings({ ...settings, date_format: value })}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Seleccionar formato" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="DD/MM/YYYY">DD/MM/YYYY (31/12/2024)</SelectItem>
                                    <SelectItem value="MM/DD/YYYY">MM/DD/YYYY (12/31/2024)</SelectItem>
                                    <SelectItem value="YYYY-MM-DD">YYYY-MM-DD (2024-12-31)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Estado del Sistema</CardTitle>
                    <CardDescription>
                        Opciones de mantenimiento y estado
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                            <Label>Modo Mantenimiento</Label>
                            <p className="text-sm text-muted-foreground">
                                Cuando está activo, solo administradores pueden acceder al sistema
                            </p>
                        </div>
                        <Switch
                            checked={settings.maintenance_mode}
                            onCheckedChange={(checked) => setSettings({
                                ...settings,
                                maintenance_mode: checked
                            })}
                        />
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
                    Guardar Cambios
                </Button>
            </div>
        </div>
        </AdminLayout>
    );
}
