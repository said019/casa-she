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
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';
import api, { getErrorMessage } from '@/lib/api';
import { Save, Info, CalendarClock } from 'lucide-react';

const PolicySchema = z.object({
    grace_days: z.coerce.number().int().min(0).max(30),
});
type PolicyForm = z.infer<typeof PolicySchema>;

export default function MembershipExpiryPolicy() {
    const { toast } = useToast();
    const queryClient = useQueryClient();

    const { data, isLoading } = useQuery<PolicyForm>({
        queryKey: ['membership-expiry-policy'],
        queryFn: async () => (await api.get('/settings/membership-expiry-policy')).data,
    });

    const form = useForm<PolicyForm>({
        resolver: zodResolver(PolicySchema),
        defaultValues: { grace_days: 0 },
    });

    useEffect(() => {
        if (data) {
            form.reset({ grace_days: Number(data.grace_days ?? 0) });
        }
    }, [data, form]);

    const mutation = useMutation({
        mutationFn: async (payload: PolicyForm) => {
            const res = await api.put('/settings/membership-expiry-policy', payload);
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['membership-expiry-policy'] });
            toast({ title: 'Política guardada', description: 'El cambio aplica desde el próximo corte automático (00:05 AM).' });
        },
        onError: (err) => {
            toast({
                variant: 'destructive',
                title: 'Error al guardar',
                description: getErrorMessage(err),
            });
        },
    });

    const graceDays = form.watch('grace_days');
    const previewText = useMemo(() => {
        if (!graceDays || graceDays === 0) {
            return 'Una membresía vencida se marca como expirada el mismo día de su vencimiento, sin días de cortesía.';
        }
        return `Una membresía vencida sigue activa (y sus créditos usables) ${graceDays} día${graceDays === 1 ? '' : 's'} más después de su vencimiento, antes de marcarse expirada.`;
    }, [graceDays]);

    if (isLoading) {
        return (
            <AuthGuard requiredRoles={['admin', 'super_admin']}>
                <AdminLayout>
                    <div className="space-y-4">
                        <Skeleton className="h-32 w-full" />
                        <Skeleton className="h-48 w-full" />
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
                        <h1 className="text-3xl font-heading font-bold">Vencimiento de membresías</h1>
                        <p className="mt-1 text-sm text-balance-dark/62">
                            Define cuántos días de gracia tiene una clienta tras el vencimiento de su membresía antes de perder sus créditos restantes.
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
                                <div className="space-y-2">
                                    <Label className="flex items-center gap-2 text-sm font-semibold">
                                        <CalendarClock className="h-4 w-4 text-balance-olive" />
                                        Días de gracia tras el vencimiento
                                    </Label>
                                    <Input
                                        type="number"
                                        min={0}
                                        max={30}
                                        step={1}
                                        {...form.register('grace_days', { valueAsNumber: true })}
                                        className="w-32 text-base"
                                    />
                                    <p className="text-xs text-balance-dark/55">
                                        Rango 0–30 días. El corte automático corre todas las noches a las 00:05 (hora CDMX); una membresía con créditos restantes sigue usándose durante estos días extra tras su fecha de vencimiento.
                                    </p>
                                    {form.formState.errors.grace_days && (
                                        <p className="text-xs text-destructive">{form.formState.errors.grace_days.message}</p>
                                    )}
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
