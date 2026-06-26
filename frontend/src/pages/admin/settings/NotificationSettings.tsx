import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Save, Eye, Edit2 } from 'lucide-react';
import { AdminLayout } from '@/components/layout/AdminLayout';
import api from '@/lib/api';

interface NotificationSettingsType {
    reminder_hours: number;
    expiring_days: number[];
    send_booking_confirmation: boolean;
    send_cancellation_notice: boolean;
    send_class_reminder: boolean;
    send_membership_expiring: boolean;
    send_points_earned: boolean;
}

interface TemplateConfig {
    [key: string]: string;
}

const defaultTemplates: TemplateConfig = {
    send_class_reminder: '⏰ *Recordatorio*\n\nHola {nombre}!\n\nTe recordamos que tienes clase pronto.\n\n🏋️ {clase}\n⏰ {hora}\n👨‍🏫 {instructor}\n\n¡No olvides traer tu toalla!',
    send_booking_confirmation: '✅ *Reserva Confirmada*\n\nHola {nombre}!\n\nTu reserva para *{clase}* ha sido confirmada.\n\n📅 {fecha}\n⏰ {hora}\n👨‍🏫 {instructor}\n\n¡Te esperamos en BMB Studio!',
    send_cancellation_notice: '❌ *Reserva Cancelada*\n\nHola {nombre},\n\nTu reserva para *{clase}* del {fecha} a las {hora} ha sido cancelada.\n\nSi tienes créditos disponibles, puedes reservar otra clase.',
    send_membership_expiring: '⚠️ *Tu Membresía está por Vencer*\n\nHola {nombre}!\n\nTu membresía *{plan}* vence el *{fecha}*.\n\nTe quedan {creditos} créditos.\n\n¿Deseas renovar? Contáctanos o renueva desde la app.',
    send_points_earned: '🎉 *¡Ganaste Puntos!*\n\nHola {nombre}!\n\nHas ganado *{puntos} puntos* de lealtad.\n\nTu saldo actual: {saldo} puntos.\n\n¡Sigue acumulando!',
};

const templateVariables: { [key: string]: string[] } = {
    send_class_reminder: ['nombre', 'clase', 'hora', 'instructor'],
    send_booking_confirmation: ['nombre', 'clase', 'fecha', 'hora', 'instructor'],
    send_cancellation_notice: ['nombre', 'clase', 'fecha', 'hora'],
    send_membership_expiring: ['nombre', 'plan', 'fecha', 'creditos'],
    send_points_earned: ['nombre', 'puntos', 'saldo'],
};

export default function NotificationSettings() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [settings, setSettings] = useState<NotificationSettingsType>({
        reminder_hours: 24,
        expiring_days: [7, 3, 1],
        send_booking_confirmation: true,
        send_cancellation_notice: true,
        send_class_reminder: true,
        send_membership_expiring: true,
        send_points_earned: true,
    });
    const [templates, setTemplates] = useState<TemplateConfig>(defaultTemplates);
    const [editingKey, setEditingKey] = useState<string | null>(null);
    const [editingText, setEditingText] = useState('');
    const { toast } = useToast();

    useEffect(() => {
        loadSettings();
        const saved = localStorage.getItem('whatsapp_templates_v2');
        if (saved) {
            try { setTemplates(prev => ({ ...prev, ...JSON.parse(saved) })); } catch {}
        }
    }, []);

    const loadSettings = async () => {
        try {
            const response = await api.get('/settings/notification_settings');
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
            await api.put('/settings/notification_settings', { value: settings });
            localStorage.setItem('whatsapp_templates_v2', JSON.stringify(templates));
            toast({
                title: 'Configuración guardada',
                description: 'Las notificaciones se han configurado correctamente.',
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

    const openEditTemplate = (key: string) => {
        setEditingKey(key);
        setEditingText(templates[key] || defaultTemplates[key] || '');
    };

    const saveTemplate = () => {
        if (!editingKey) return;
        const newTemplates = { ...templates, [editingKey]: editingText };
        setTemplates(newTemplates);
        localStorage.setItem('whatsapp_templates_v2', JSON.stringify(newTemplates));
        setEditingKey(null);
        toast({ title: 'Plantilla actualizada', description: 'Los cambios se aplicarán a las siguientes notificaciones.' });
    };

    const TemplateButtons = ({ settingKey }: { settingKey: string }) => (
        <div className="flex items-center gap-1">
            <Dialog>
                <DialogTrigger asChild>
                    <Button variant="ghost" size="icon" title="Ver plantilla">
                        <Eye className="w-4 h-4" />
                    </Button>
                </DialogTrigger>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Vista previa de plantilla</DialogTitle>
                        <DialogDescription>Así se verá el mensaje en WhatsApp</DialogDescription>
                    </DialogHeader>
                    <div className="p-4 bg-success/10 rounded-lg whitespace-pre-wrap font-mono text-sm">
                        {templates[settingKey] || defaultTemplates[settingKey] || 'Sin plantilla'}
                    </div>
                    <div className="text-xs text-muted-foreground">
                        <strong>Variables:</strong> {(templateVariables[settingKey] || []).map(v => `{${v}}`).join(', ')}
                    </div>
                </DialogContent>
            </Dialog>
            <Button variant="ghost" size="icon" title="Editar plantilla" onClick={() => openEditTemplate(settingKey)}>
                <Edit2 className="w-4 h-4" />
            </Button>
        </div>
    );

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
                    <h1 className="text-3xl font-heading font-bold">Configuración de Notificaciones</h1>
                    <p className="text-muted-foreground">
                        Configura qué notificaciones enviar a los usuarios.
                    </p>
                </div>

                <Card>
                <CardHeader>
                    <CardTitle>Recordatorios de Clase</CardTitle>
                    <CardDescription>
                        Configuración de recordatorios automáticos
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="reminder_hours">
                            Horas antes de enviar recordatorio
                        </Label>
                        <Input
                            id="reminder_hours"
                            type="number"
                            min={1}
                            max={72}
                            value={settings.reminder_hours}
                            onChange={(e) => setSettings({
                                ...settings,
                                reminder_hours: parseInt(e.target.value) || 24
                            })}
                            className="max-w-xs"
                        />
                        <p className="text-xs text-muted-foreground">
                            Se enviará un recordatorio este tiempo antes de cada clase reservada
                        </p>
                    </div>

                    <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                            <Label>Enviar recordatorio de clase</Label>
                            <p className="text-sm text-muted-foreground">
                                Recordar al usuario sobre su próxima clase
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            <TemplateButtons settingKey="send_class_reminder" />
                            <Switch
                                checked={settings.send_class_reminder}
                                onCheckedChange={(checked) => setSettings({
                                    ...settings,
                                    send_class_reminder: checked
                                })}
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Notificaciones de Reservación</CardTitle>
                    <CardDescription>
                        Mensajes relacionados con reservaciones
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                            <Label>Confirmación de reservación</Label>
                            <p className="text-sm text-muted-foreground">
                                Enviar confirmación cuando se hace una reservación
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            <TemplateButtons settingKey="send_booking_confirmation" />
                            <Switch
                                checked={settings.send_booking_confirmation}
                                onCheckedChange={(checked) => setSettings({
                                    ...settings,
                                    send_booking_confirmation: checked
                                })}
                            />
                        </div>
                    </div>

                    <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                            <Label>Aviso de cancelación</Label>
                            <p className="text-sm text-muted-foreground">
                                Notificar cuando se cancela una clase
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            <TemplateButtons settingKey="send_cancellation_notice" />
                            <Switch
                                checked={settings.send_cancellation_notice}
                                onCheckedChange={(checked) => setSettings({
                                    ...settings,
                                    send_cancellation_notice: checked
                                })}
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Notificaciones de Membresía</CardTitle>
                    <CardDescription>
                        Avisos sobre membresías y puntos
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                            <Label>Membresía por vencer</Label>
                            <p className="text-sm text-muted-foreground">
                                Avisar cuando la membresía está por vencer
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            <TemplateButtons settingKey="send_membership_expiring" />
                            <Switch
                                checked={settings.send_membership_expiring}
                                onCheckedChange={(checked) => setSettings({
                                    ...settings,
                                    send_membership_expiring: checked
                                })}
                            />
                        </div>
                    </div>

                    <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                            <Label>Puntos ganados</Label>
                            <p className="text-sm text-muted-foreground">
                                Notificar cuando el usuario gana puntos de lealtad
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            <TemplateButtons settingKey="send_points_earned" />
                            <Switch
                                checked={settings.send_points_earned}
                                onCheckedChange={(checked) => setSettings({
                                    ...settings,
                                    send_points_earned: checked
                                })}
                            />
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
                    Guardar Cambios
                </Button>
            </div>

            {/* Dialog para editar plantilla */}
            <Dialog open={editingKey !== null} onOpenChange={(open) => !open && setEditingKey(null)}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Editar Plantilla de WhatsApp</DialogTitle>
                        <DialogDescription>
                            Personaliza el mensaje. Usa variables entre llaves.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <Textarea
                            value={editingText}
                            onChange={(e) => setEditingText(e.target.value)}
                            rows={8}
                            className="font-mono text-sm"
                        />
                        <div className="text-xs text-muted-foreground bg-muted p-2 rounded">
                            <strong>Variables:</strong> {editingKey && (templateVariables[editingKey] || []).map(v => `{${v}}`).join(', ')}
                            <br />
                            <strong>Formato:</strong> *texto* = negrita, _texto_ = cursiva
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setEditingKey(null)}>Cancelar</Button>
                        <Button onClick={saveTemplate}>Guardar Cambios</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

                <WalletPushTest />
        </div>
        </AdminLayout>
    );
}

function WalletPushTest() {
    const { toast } = useToast();
    const [membershipId, setMembershipId] = useState('');
    const [loading, setLoading] = useState(false);
    const [diagnostics, setDiagnostics] = useState<any>(null);

    useEffect(() => {
        api.get('/wallet/apple/diagnostics').then(r => setDiagnostics(r.data)).catch(() => {});
    }, []);

    const sendTestPush = async () => {
        if (!membershipId.trim()) {
            toast({ title: 'Ingresa un ID de membresía', variant: 'destructive' });
            return;
        }
        setLoading(true);
        try {
            const { data } = await api.post('/wallet/test-push', { membershipId: membershipId.trim() });
            toast({ title: data.message || 'Push enviada' });
        } catch (e: any) {
            toast({ title: 'Error', description: e.response?.data?.error || 'No se pudo enviar', variant: 'destructive' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>Apple Wallet Push</CardTitle>
                <CardDescription>Envía una notificación de actualización al pase de un miembro</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {diagnostics && (
                    <div className="flex flex-wrap gap-2 text-xs">
                        <span className={`px-2 py-1 rounded-full ${diagnostics.configured ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                            {diagnostics.configured ? '✓ Configurado' : '✗ No configurado'}
                        </span>
                        <span className={`px-2 py-1 rounded-full ${diagnostics.canSendPush ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                            {diagnostics.canSendPush ? '✓ Push habilitado' : '✗ Push no disponible'}
                        </span>
                    </div>
                )}
                <div className="flex gap-2">
                    <Input
                        placeholder="ID de membresía (UUID)"
                        value={membershipId}
                        onChange={(e) => setMembershipId(e.target.value)}
                        className="flex-1"
                    />
                    <Button onClick={sendTestPush} disabled={loading || !diagnostics?.canSendPush}>
                        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Enviar Push'}
                    </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                    El dispositivo recibirá una señal para descargar la versión actualizada del pase.
                </p>
            </CardContent>
        </Card>
    );
}
