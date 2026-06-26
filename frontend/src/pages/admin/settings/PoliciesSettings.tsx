import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Save } from 'lucide-react';
import { AdminLayout } from '@/components/layout/AdminLayout';
import api from '@/lib/api';

interface BookingPolicies {
    max_advance_days: number;
    min_hours_before_booking: number;
    max_bookings_per_day: number;
    allow_waitlist: boolean;
    auto_promote_waitlist: boolean;
    waitlist_cutoff_hours: number;
    waitlist_max_size: number;
}

export default function PoliciesSettings() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [policies, setPolicies] = useState<BookingPolicies>({
        max_advance_days: 30,
        min_hours_before_booking: 0,
        max_bookings_per_day: 0,
        allow_waitlist: true,
        auto_promote_waitlist: true,
        waitlist_cutoff_hours: 2,
        waitlist_max_size: 5,
    });
    const { toast } = useToast();

    useEffect(() => {
        loadPolicies();
    }, []);

    const loadPolicies = async () => {
        try {
            const response = await api.get('/settings/booking_policies');
            if (response.data?.value) {
                setPolicies(prev => ({ ...prev, ...response.data.value }));
            }
        } catch (error) {
            console.error('Error loading policies:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await api.put('/settings/booking_policies', { value: policies });
            toast({
                title: 'Políticas guardadas',
                description: 'Las políticas de reservación se han actualizado correctamente.',
            });
        } catch (error) {
            toast({
                title: 'Error',
                description: 'No se pudieron guardar las políticas.',
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
                    <h1 className="text-3xl font-heading font-bold">Políticas de Reservación</h1>
                    <p className="text-muted-foreground">
                        Configura las reglas para las reservaciones de clases.
                    </p>
                </div>

                <p className="rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
                    Las reglas de cancelación (horas mínimas, reembolso de crédito, mensaje) se
                    configuran en{' '}
                    <Link
                        to="/admin/settings/cancellations"
                        className="font-medium text-primary underline underline-offset-2"
                    >
                        Política de cancelación
                    </Link>
                    .
                </p>

                <p className="text-sm text-muted-foreground">
                    Estas reglas aplican cuando la propia usuaria reserva desde la app.
                </p>

                <Card>
                    <CardHeader>
                        <CardTitle>Restricciones de Reserva</CardTitle>
                        <CardDescription>
                            Límites y reglas para hacer reservaciones
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                                <Label htmlFor="max_advance_days">
                                    Días máximos de anticipación
                                </Label>
                                <Input
                                    id="max_advance_days"
                                    type="number"
                                    min={1}
                                    max={60}
                                    value={policies.max_advance_days}
                                    onChange={(e) => setPolicies({
                                        ...policies,
                                        max_advance_days: parseInt(e.target.value) || 14
                                    })}
                                />
                                <p className="text-xs text-muted-foreground">
                                    Más allá de esto no se puede reservar.
                                </p>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="min_hours_before">
                                    Horas mínimas antes de la clase
                                </Label>
                                <Input
                                    id="min_hours_before"
                                    type="number"
                                    min={0}
                                    max={24}
                                    value={policies.min_hours_before_booking}
                                    onChange={(e) => setPolicies({
                                        ...policies,
                                        min_hours_before_booking: parseInt(e.target.value) || 1
                                    })}
                                />
                                <p className="text-xs text-muted-foreground">
                                    Tiempo mínimo antes de la clase para poder reservar. 0 = sin restricción.
                                </p>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="max_bookings">
                                Máximo de reservas por día por usuario
                            </Label>
                            <Input
                                id="max_bookings"
                                type="number"
                                min={0}
                                max={10}
                                value={policies.max_bookings_per_day}
                                onChange={(e) => setPolicies({
                                    ...policies,
                                    max_bookings_per_day: parseInt(e.target.value) || 0
                                })}
                                className="max-w-xs"
                            />
                            <p className="text-xs text-muted-foreground">0 = sin límite.</p>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Lista de Espera</CardTitle>
                        <CardDescription>
                            Configuración de la lista de espera
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                                <Label>Permitir lista de espera</Label>
                                <p className="text-sm text-muted-foreground">
                                    Los usuarios pueden anotarse si la clase está llena
                                </p>
                            </div>
                            <Switch
                                checked={policies.allow_waitlist}
                                onCheckedChange={(checked) => setPolicies({
                                    ...policies,
                                    allow_waitlist: checked
                                })}
                            />
                        </div>

                        <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                                <Label>Promoción automática</Label>
                                <p className="text-sm text-muted-foreground">
                                    Promover automáticamente cuando se libere un lugar
                                </p>
                            </div>
                            <Switch
                                checked={policies.auto_promote_waitlist}
                                onCheckedChange={(checked) => setPolicies({
                                    ...policies,
                                    auto_promote_waitlist: checked
                                })}
                                disabled={!policies.allow_waitlist}
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Corte de promoción (horas)</Label>
                                <Input
                                    type="number" min={0} step={0.5}
                                    value={policies.waitlist_cutoff_hours}
                                    onChange={(e) => setPolicies({ ...policies, waitlist_cutoff_hours: Number(e.target.value) })}
                                    disabled={!policies.allow_waitlist}
                                />
                                <p className="text-xs text-muted-foreground">No se promueve a nadie si falta menos que esto para la clase.</p>
                            </div>
                            <div className="space-y-2">
                                <Label>Tamaño máximo de fila</Label>
                                <Input
                                    type="number" min={1} step={1}
                                    value={policies.waitlist_max_size}
                                    onChange={(e) => setPolicies({ ...policies, waitlist_max_size: Number(e.target.value) })}
                                    disabled={!policies.allow_waitlist}
                                />
                                <p className="text-xs text-muted-foreground">Usuarios máximos en espera por clase.</p>
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
            </div>
        </AdminLayout>
    );
}
