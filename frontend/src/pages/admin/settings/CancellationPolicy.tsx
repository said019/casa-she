import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';
import api, { getErrorMessage } from '@/lib/api';
import { Save, Info, Clock } from 'lucide-react';

const PolicySchema = z.object({
    enabled: z.boolean(),
    min_hours: z.coerce.number().int().min(0).max(168),
    refund_credit_on_cancel: z.boolean(),
    cancellations_per_membership: z.coerce.number().int().min(0).max(999),
    late_cancel_message: z.string().max(280).nullable().optional(),
});
type PolicyForm = z.infer<typeof PolicySchema>;

export default function CancellationPolicy() {
    const { toast } = useToast();
    const queryClient = useQueryClient();

    const { data, isLoading } = useQuery<PolicyForm>({
        queryKey: ['cancellation-policy'],
        queryFn: async () => (await api.get('/settings/cancellation-policy')).data,
    });

    const form = useForm<PolicyForm>({
        resolver: zodResolver(PolicySchema),
        defaultValues: {
            enabled: true,
            min_hours: 4,
            refund_credit_on_cancel: true,
            cancellations_per_membership: 2,
            late_cancel_message: '',
        },
    });

    useEffect(() => {
        if (data) {
            form.reset({
                enabled: !!data.enabled,
                min_hours: Number(data.min_hours ?? 4),
                refund_credit_on_cancel: !!data.refund_credit_on_cancel,
                cancellations_per_membership: Number(data.cancellations_per_membership ?? 2),
                late_cancel_message: data.late_cancel_message ?? '',
            });
        }
    }, [data, form]);

    const mutation = useMutation({
        mutationFn: async (payload: PolicyForm) => {
            const res = await api.put('/settings/cancellation-policy', payload);
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['cancellation-policy'] });
            toast({ title: 'Política guardada', description: 'Los cambios ya están vigentes para todas las clases.' });
        },
        onError: (err) => {
            toast({
                variant: 'destructive',
                title: 'Error al guardar',
                description: getErrorMessage(err),
            });
        },
    });

    const values = form.watch();
    const previewText = useMemo(() => {
        if (!values.enabled) return 'Las cancelaciones están desactivadas. Ningún usuario puede cancelar.';
        const refund = values.refund_credit_on_cancel
            ? 'el crédito se devuelve a la cuenta del usuario'
            : 'el crédito NO se devuelve';
        return `Las clases pueden cancelarse hasta ${values.min_hours} hora${values.min_hours === 1 ? '' : 's'} antes. Si se cancela dentro de la ventana, ${refund}. Después de eso, ${values.late_cancel_message?.trim() ? 'se muestra el mensaje configurado abajo.' : 'no se permite cancelar.'}`;
    }, [values]);

    if (isLoading) {
        return (
            <AuthGuard requiredRoles={['admin', 'super_admin']}>
                <AdminLayout>
                    <div className="space-y-4">
                        <Skeleton className="h-32 w-full" />
                        <Skeleton className="h-64 w-full" />
                    </div>
                </AdminLayout>
            </AuthGuard>
        );
    }

    const onSubmit = form.handleSubmit((v) => mutation.mutate(v));

    return (
        <AuthGuard requiredRoles={['admin', 'super_admin']}>
            <AdminLayout>
                <div className="mx-auto max-w-3xl space-y-6">
                    <div>
                        <h1 className="text-3xl font-heading font-bold">Política de cancelación</h1>
                        <p className="mt-1 text-sm text-balance-dark/62">
                            Define cuándo y cómo pueden cancelar tus usuarios. Estos cambios afectan a todas las clases inmediatamente.
                        </p>
                    </div>

                    <Card className="rounded-[1.75rem] border-balance-sand/65 bg-[hsl(var(--card))]/88">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-lg">
                                <Info className="h-5 w-5 text-balance-olive" />
                                Vista previa
                            </CardTitle>
                            <CardDescription>{previewText}</CardDescription>
                        </CardHeader>
                    </Card>

                    <form onSubmit={onSubmit} className="space-y-5">
                        <Card className="rounded-[1.75rem] border-balance-sand/65 bg-[hsl(var(--card))]/88">
                            <CardHeader>
                                <CardTitle className="text-lg">Configuración</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                <div className="flex items-center justify-between rounded-xl border border-balance-sand/55 px-4 py-3">
                                    <div>
                                        <Label className="text-sm font-semibold">Permitir cancelaciones</Label>
                                        <p className="text-xs text-balance-dark/55">Si lo apagas, ningún usuario puede cancelar.</p>
                                    </div>
                                    <Switch
                                        checked={values.enabled}
                                        onCheckedChange={(v) => form.setValue('enabled', v, { shouldDirty: true })}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label className="flex items-center gap-2 text-sm font-semibold">
                                        <Clock className="h-4 w-4 text-balance-olive" />
                                        Horas mínimas antes de la clase
                                    </Label>
                                    <Input
                                        type="number"
                                        min={0}
                                        max={168}
                                        step={1}
                                        {...form.register('min_hours', { valueAsNumber: true })}
                                        className="w-32 text-base"
                                        disabled={!values.enabled}
                                    />
                                    <p className="text-xs text-balance-dark/55">
                                        Por debajo de este margen, la cancelación se rechaza. Rango 0–168 (1 semana).
                                    </p>
                                    {form.formState.errors.min_hours && (
                                        <p className="text-xs text-destructive">{form.formState.errors.min_hours.message}</p>
                                    )}
                                </div>

                                <div className="flex items-center justify-between rounded-xl border border-balance-sand/55 px-4 py-3">
                                    <div>
                                        <Label className="text-sm font-semibold">Devolver crédito al cancelar</Label>
                                        <p className="text-xs text-balance-dark/55">
                                            Si está apagado, la reserva se cancela pero el crédito no regresa.
                                        </p>
                                    </div>
                                    <Switch
                                        checked={values.refund_credit_on_cancel}
                                        onCheckedChange={(v) => form.setValue('refund_credit_on_cancel', v, { shouldDirty: true })}
                                        disabled={!values.enabled}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label className="text-sm font-semibold">
                                        Cancelaciones permitidas por paquete
                                    </Label>
                                    <Input
                                        type="number"
                                        min={0}
                                        max={999}
                                        step={1}
                                        {...form.register('cancellations_per_membership', { valueAsNumber: true })}
                                        className="w-32 text-base"
                                        disabled={!values.enabled}
                                    />
                                    <p className="text-xs text-balance-dark/55">
                                        Cuántas veces puede cancelar un usuario dentro del mismo paquete antes de que se rechacen sus cancelaciones. Aplica solo a paquetes nuevos. Los administradores siempre pueden cancelar.
                                    </p>
                                    {form.formState.errors.cancellations_per_membership && (
                                        <p className="text-xs text-destructive">{form.formState.errors.cancellations_per_membership.message}</p>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <Label className="text-sm font-semibold">
                                        Mensaje cuando ya no se puede cancelar
                                    </Label>
                                    <Textarea
                                        rows={3}
                                        maxLength={280}
                                        placeholder="Ej: Tu clase está muy próxima. Llega con tiempo o avisanos por WhatsApp."
                                        {...form.register('late_cancel_message')}
                                    />
                                    <p className="text-xs text-balance-dark/55">
                                        Aparecerá en la app cuando el usuario intente cancelar fuera de tiempo. Máx 280 caracteres.
                                    </p>
                                </div>
                            </CardContent>
                        </Card>

                        <div className="flex justify-end">
                            <Button
                                type="submit"
                                disabled={mutation.isPending || !form.formState.isDirty}
                                className="rounded-full bg-balance-olive text-balance-cream hover:bg-balance-olive/90"
                            >
                                {mutation.isPending ? 'Guardando…' : (
                                    <>
                                        <Save className="h-4 w-4 mr-2" />
                                        Guardar cambios
                                    </>
                                )}
                            </Button>
                        </div>
                    </form>
                </div>
            </AdminLayout>
        </AuthGuard>
    );
}
