import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Save, Building2 } from 'lucide-react';
import { AdminLayout } from '@/components/layout/AdminLayout';
import api from '@/lib/api';

interface BankInfoType {
    bank_name: string;
    account_holder: string;
    account_number: string;
    clabe: string;
    reference_instructions: string;
}

interface StudioSettingsType {
    name: string;
    address: string;
    phone: string;
    email: string;
    website: string;
    description: string;
    social_media: {
        instagram: string;
        facebook: string;
        whatsapp: string;
    };
}

export default function StudioSettings() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [savingBank, setSavingBank] = useState(false);
    const [settings, setSettings] = useState<StudioSettingsType>({
        name: 'BMB Studio',
        address: '',
        phone: '',
        email: '',
        website: '',
        description: '',
        social_media: {
            instagram: '',
            facebook: '',
            whatsapp: '',
        },
    });
    const [bankInfo, setBankInfo] = useState<BankInfoType>({
        bank_name: '',
        account_holder: '',
        account_number: '',
        clabe: '',
        reference_instructions: '',
    });
    const { toast } = useToast();

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        try {
            const [studioRes, bankRes] = await Promise.all([
                api.get('/settings/studio_info').catch(() => null),
                api.get('/settings/bank-info').catch(() => null),
            ]);
            if (studioRes?.data?.value) {
                setSettings(prev => ({ ...prev, ...studioRes.data.value }));
            }
            if (bankRes?.data) {
                setBankInfo(prev => ({ ...prev, ...bankRes.data }));
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
            await api.put('/settings/studio_info', { value: settings });
            toast({
                title: 'Configuración guardada',
                description: 'Los datos del estudio se han actualizado correctamente.',
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

    const handleSaveBankInfo = async () => {
        setSavingBank(true);
        try {
            await api.put('/settings/bank-info', bankInfo);
            toast({
                title: 'Datos bancarios guardados',
                description: 'La información de depósito se ha actualizado correctamente.',
            });
        } catch (error) {
            toast({
                title: 'Error',
                description: 'No se pudo guardar la información bancaria.',
                variant: 'destructive',
            });
        } finally {
            setSavingBank(false);
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
                    <h1 className="text-3xl font-heading font-bold">Configuración del Estudio</h1>
                    <p className="text-muted-foreground">
                        Configura la información de tu estudio que se mostrará a los usuarios.
                    </p>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle>Información General</CardTitle>
                    <CardDescription>
                        Datos básicos de tu estudio
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                            <Label htmlFor="name">Nombre del Estudio</Label>
                            <Input
                                id="name"
                                value={settings.name}
                                onChange={(e) => setSettings({ ...settings, name: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="email">Email</Label>
                            <Input
                                id="email"
                                type="email"
                                value={settings.email}
                                onChange={(e) => setSettings({ ...settings, email: e.target.value })}
                            />
                        </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                            <Label htmlFor="phone">Teléfono</Label>
                            <Input
                                id="phone"
                                value={settings.phone}
                                onChange={(e) => setSettings({ ...settings, phone: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="website">Sitio Web</Label>
                            <Input
                                id="website"
                                value={settings.website}
                                onChange={(e) => setSettings({ ...settings, website: e.target.value })}
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="address">Dirección</Label>
                        <Input
                            id="address"
                            value={settings.address}
                            onChange={(e) => setSettings({ ...settings, address: e.target.value })}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="description">Descripción</Label>
                        <textarea
                            id="description"
                            className="w-full min-h-[100px] px-3 py-2 border rounded-md"
                            value={settings.description}
                            onChange={(e) => setSettings({ ...settings, description: e.target.value })}
                        />
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Redes Sociales</CardTitle>
                    <CardDescription>
                        Enlaces a tus redes sociales
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-3">
                        <div className="space-y-2">
                            <Label htmlFor="instagram">Instagram</Label>
                            <Input
                                id="instagram"
                                placeholder="@tucuenta"
                                value={settings.social_media.instagram}
                                onChange={(e) => setSettings({
                                    ...settings,
                                    social_media: { ...settings.social_media, instagram: e.target.value }
                                })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="facebook">Facebook</Label>
                            <Input
                                id="facebook"
                                placeholder="facebook.com/tupagina"
                                value={settings.social_media.facebook}
                                onChange={(e) => setSettings({
                                    ...settings,
                                    social_media: { ...settings.social_media, facebook: e.target.value }
                                })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="whatsapp">WhatsApp</Label>
                            <Input
                                id="whatsapp"
                                placeholder="+52 55 1234 5678"
                                value={settings.social_media.whatsapp}
                                onChange={(e) => setSettings({
                                    ...settings,
                                    social_media: { ...settings.social_media, whatsapp: e.target.value }
                                })}
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Separator />

            {/* Bank Info Card */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Building2 className="h-5 w-5" />
                        Datos para Depósito / Transferencia
                    </CardTitle>
                    <CardDescription>
                        Esta información se muestra a los usuarios cuando eligen pagar por transferencia bancaria
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                            <Label htmlFor="bank_name">Banco</Label>
                            <Input
                                id="bank_name"
                                placeholder="Ej: BBVA"
                                value={bankInfo.bank_name}
                                onChange={(e) => setBankInfo({ ...bankInfo, bank_name: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="account_holder">Titular de la cuenta</Label>
                            <Input
                                id="account_holder"
                                placeholder="Ej: BMB Studio SA de CV"
                                value={bankInfo.account_holder}
                                onChange={(e) => setBankInfo({ ...bankInfo, account_holder: e.target.value })}
                            />
                        </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                            <Label htmlFor="account_number">Número de cuenta</Label>
                            <Input
                                id="account_number"
                                placeholder="Ej: 1234567890"
                                value={bankInfo.account_number}
                                onChange={(e) => setBankInfo({ ...bankInfo, account_number: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="clabe">CLABE interbancaria</Label>
                            <Input
                                id="clabe"
                                placeholder="Ej: 012180001234567890"
                                value={bankInfo.clabe}
                                onChange={(e) => setBankInfo({ ...bankInfo, clabe: e.target.value })}
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="reference_instructions">Instrucciones de referencia</Label>
                        <Textarea
                            id="reference_instructions"
                            placeholder="Ej: Usa tu nombre completo como referencia de pago"
                            value={bankInfo.reference_instructions}
                            onChange={(e) => setBankInfo({ ...bankInfo, reference_instructions: e.target.value })}
                            rows={2}
                        />
                    </div>

                    <div className="flex justify-end">
                        <Button onClick={handleSaveBankInfo} disabled={savingBank}>
                            {savingBank ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                                <Save className="mr-2 h-4 w-4" />
                            )}
                            Guardar Datos Bancarios
                        </Button>
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
                    Guardar Cambios del Estudio
                </Button>
            </div>
        </div>
        </AdminLayout>
    );
}
