import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import api, { getErrorMessage } from '@/lib/api';
import type { Plan } from '@/types/auth';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, Plus, MoreHorizontal, Pencil, Trash2, Eye, EyeOff } from 'lucide-react';

const planSchema = z.object({
    name: z.string().min(2, 'El nombre es requerido'),
    description: z.string().optional(),
    // nonnegative: un plan interno va en $0. Abajo se exige >0 solo si NO es interno (refine).
    price: z.coerce.number().nonnegative('El precio no puede ser negativo'),
    durationDays: z.coerce.number().int().positive('La duración debe ser positiva'),
    classLimit: z
        .preprocess((v) => (v === '' || v === null || v === undefined ? null : Number(v)),
            z.number().int().positive().nullable())
        .optional(),
    // Buckets por categoría que SÍ usa el motor de reservas. vacío = ilimitado, 0 = no incluye.
    reformerCredits: z
        .preprocess((v) => (v === '' || v === null || v === undefined ? null : Number(v)),
            z.number().int().nonnegative().nullable())
        .optional(),
    multiCredits: z
        .preprocess((v) => (v === '' || v === null || v === undefined ? null : Number(v)),
            z.number().int().nonnegative().nullable())
        .optional(),
    features: z.string().optional(),
    isActive: z.boolean(),
    // Plan interno: no visible para clientes (solo admin/recepción lo asignan). color = pastilla en reservas.
    isInternal: z.boolean().default(false),
    color: z.string().optional(),
    sortOrder: z.coerce.number().int().default(0),
}).refine((d) => d.isInternal || d.price > 0, {
    message: 'El precio debe ser mayor a 0 (o marca "Plan interno" para dejarlo en $0)',
    path: ['price'],
});

type PlanForm = z.infer<typeof planSchema>;

const defaultForm: PlanForm = {
    name: '',
    description: '',
    price: 0,
    durationDays: 30,
    classLimit: null,
    reformerCredits: null,
    multiCredits: null,
    features: '',
    isActive: true,
    isInternal: false,
    color: '#16A34A',
    sortOrder: 0,
};

function parseFeatures(raw: Plan['features']): string[] {
    if (Array.isArray(raw)) return raw as string[];
    if (typeof raw === 'string') {
        try {
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    }
    return [];
}

function toNumber(v: unknown): number {
    if (typeof v === 'number') return v;
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
}

export default function PlansList() {
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
    const { toast } = useToast();
    const queryClient = useQueryClient();

    const {
        register,
        handleSubmit,
        reset,
        control,
        watch,
        formState: { errors, isSubmitting },
    } = useForm<PlanForm>({
        resolver: zodResolver(planSchema) as any,
        defaultValues: defaultForm,
    });

    const { data: plans, isLoading } = useQuery<Plan[]>({
        queryKey: ['plans', 'admin'],
        queryFn: async () => (await api.get('/plans?all=true')).data,
    });

    const invalidatePlans = () => {
        queryClient.invalidateQueries({ queryKey: ['plans'] });
        queryClient.invalidateQueries({ queryKey: ['plans', 'admin'] });
        queryClient.invalidateQueries({ queryKey: ['public-plans'] });
    };

    const savePlanMutation = useMutation({
        mutationFn: async ({ id, data }: { id?: string; data: any }) => {
            if (id) return (await api.put(`/plans/${id}`, data)).data;
            return (await api.post('/plans', data)).data;
        },
        onSuccess: (_data, variables) => {
            invalidatePlans();
            toast({
                title: variables.id ? 'Plan actualizado' : 'Plan creado',
                description: variables.id
                    ? 'Los cambios se aplicaron y las vigencias de membresías activas se recalcularon.'
                    : 'El plan se ha creado exitosamente.',
            });
            setIsDialogOpen(false);
            setEditingPlan(null);
            reset(defaultForm);
        },
        onError: (error) => {
            toast({ variant: 'destructive', title: 'Error', description: getErrorMessage(error) });
        },
    });

    const deactivatePlanMutation = useMutation({
        mutationFn: async (id: string) => (await api.delete(`/plans/${id}`)).data,
        onSuccess: () => {
            invalidatePlans();
            toast({ title: 'Paquete desactivado', description: 'Dejó de mostrarse en la landing.' });
        },
        onError: (error) => {
            toast({ variant: 'destructive', title: 'Error', description: getErrorMessage(error) });
        },
    });

    const reactivatePlanMutation = useMutation({
        mutationFn: async (id: string) => (await api.put(`/plans/${id}`, { isActive: true })).data,
        onSuccess: () => {
            invalidatePlans();
            toast({ title: 'Paquete reactivado', description: 'Vuelve a estar visible en la landing.' });
        },
        onError: (error) => {
            toast({ variant: 'destructive', title: 'Error', description: getErrorMessage(error) });
        },
    });

    const hardDeletePlanMutation = useMutation({
        mutationFn: async (id: string) => (await api.delete(`/plans/${id}?hard=true`)).data,
        onSuccess: () => {
            invalidatePlans();
            toast({ title: 'Paquete eliminado', description: 'Se eliminó permanentemente.' });
        },
        onError: (error) => {
            toast({ variant: 'destructive', title: 'No se puede eliminar', description: getErrorMessage(error) });
        },
    });

    const onSubmit = (data: PlanForm) => {
        const featuresArray = data.features
            ? data.features.split('\n').map((f) => f.trim()).filter((f) => f !== '')
            : [];

        const payload = {
            name: data.name.trim(),
            description: data.description?.trim() || undefined,
            price: data.price,
            currency: 'MXN',
            durationDays: data.durationDays,
            classLimit: data.classLimit ?? null,
            reformerCredits: data.reformerCredits ?? null,
            multiCredits: data.multiCredits ?? null,
            features: featuresArray,
            isActive: data.isActive,
            isInternal: data.isInternal,
            // El color solo aplica a planes internos (pastilla en reservas); si no, null.
            color: data.isInternal ? (data.color || null) : null,
            sortOrder: data.sortOrder ?? 0,
        };

        savePlanMutation.mutate({ id: editingPlan?.id, data: payload });
    };

    const handleEdit = (plan: Plan) => {
        setEditingPlan(plan);
        setIsDialogOpen(true);
    };

    const handleCreate = () => {
        setEditingPlan(null);
        reset(defaultForm);
        setIsDialogOpen(true);
    };

    // Reset form whenever dialog opens with a specific plan
    useEffect(() => {
        if (!isDialogOpen) return;
        if (editingPlan) {
            reset({
                name: editingPlan.name ?? '',
                description: editingPlan.description ?? '',
                price: toNumber(editingPlan.price),
                durationDays: toNumber(editingPlan.duration_days) || 30,
                classLimit: editingPlan.class_limit ?? null,
                reformerCredits: (editingPlan as any).reformer_credits ?? null,
                multiCredits: (editingPlan as any).multi_credits ?? null,
                features: parseFeatures(editingPlan.features).join('\n'),
                isActive: !!editingPlan.is_active,
                isInternal: !!(editingPlan as any).is_internal,
                color: (editingPlan as any).color ?? '#16A34A',
                sortOrder: toNumber(editingPlan.sort_order),
            });
        } else {
            reset(defaultForm);
        }
    }, [isDialogOpen, editingPlan, reset]);

    const handleDialogChange = (open: boolean) => {
        setIsDialogOpen(open);
        if (!open) setEditingPlan(null);
    };

    return (
        <AuthGuard requiredRoles={['admin']}>
            <AdminLayout>
                <div className="space-y-6">
                    <div className="flex flex-col gap-4 rounded-[1.6rem] border border-balance-olive/25 bg-balance-olive/10 p-5 shadow-[0_18px_58px_-50px_rgba(51,42,34,0.45)] sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-balance-olive">Visible en venta</p>
                            <h1 className="text-3xl font-heading font-bold mt-1">Precios y paquetes</h1>
                            <p className="max-w-2xl text-sm text-balance-dark/65">
                                Edita clase suelta, paquetes, vigencia y créditos. Estos precios se reflejan en la landing, checkout y /app.
                            </p>
                        </div>
                        <Button onClick={handleCreate} className="bg-balance-olive text-balance-cream hover:bg-balance-olive/90">
                            <Plus className="mr-2 h-4 w-4" /> Nuevo paquete
                        </Button>
                    </div>

                    <div className="overflow-hidden rounded-[1.35rem] border border-balance-sand/65 bg-[hsl(var(--admin-panel))] shadow-[0_18px_58px_-50px_rgba(51,42,34,0.45)]">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Nombre</TableHead>
                                    <TableHead>Precio</TableHead>
                                    <TableHead>Vigencia</TableHead>
                                    <TableHead>Clases</TableHead>
                                    <TableHead>Estado</TableHead>
                                    <TableHead className="text-right">Acciones</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoading ? (
                                    <TableRow>
                                        <TableCell colSpan={6} className="text-center py-8">
                                            <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
                                        </TableCell>
                                    </TableRow>
                                ) : !plans || plans.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                                            No hay paquetes configurados
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    plans.map((plan) => {
                                        const price = toNumber(plan.price);
                                        return (
                                            <TableRow key={plan.id}>
                                                <TableCell className="font-medium">
                                                    <div>{plan.name}</div>
                                                    <div className="text-xs text-muted-foreground truncate max-w-[240px]">
                                                        {plan.description}
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    ${price.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {plan.currency || 'MXN'}
                                                </TableCell>
                                                <TableCell>{plan.duration_days} días</TableCell>
                                                <TableCell>
                                                    {plan.class_limit === null || plan.class_limit === undefined
                                                        ? 'Ilimitadas'
                                                        : plan.class_limit}
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex flex-wrap items-center gap-1.5">
                                                        <Badge
                                                            variant={plan.is_active ? 'default' : 'secondary'}
                                                            className={plan.is_active ? 'bg-balance-olive text-balance-cream hover:bg-balance-olive' : ''}
                                                        >
                                                            {plan.is_active ? 'Activo' : 'Inactivo'}
                                                        </Badge>
                                                        {(plan as any).is_internal && (
                                                            <span
                                                                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                                                                style={(plan as any).color ? {
                                                                    backgroundColor: `${(plan as any).color}1A`,
                                                                    color: (plan as any).color,
                                                                    border: `1px solid ${(plan as any).color}55`,
                                                                } : undefined}
                                                                title="No visible para clientes"
                                                            >
                                                                Interno
                                                            </span>
                                                        )}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button variant="ghost" className="h-8 w-8 p-0">
                                                                <span className="sr-only">Abrir menú</span>
                                                                <MoreHorizontal className="h-4 w-4" />
                                                            </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end">
                                                            <DropdownMenuLabel>Acciones</DropdownMenuLabel>
                                                            <DropdownMenuItem onSelect={() => handleEdit(plan)}>
                                                                <Pencil className="mr-2 h-4 w-4" /> Editar
                                                            </DropdownMenuItem>
                                                            {plan.is_active ? (
                                                                <DropdownMenuItem
                                                                    onSelect={() => {
                                                                        if (confirm(`¿Desactivar "${plan.name}"? Dejará de mostrarse en landing, checkout y /app. Las membresías existentes no se afectan.`)) {
                                                                            deactivatePlanMutation.mutate(plan.id);
                                                                        }
                                                                    }}
                                                                >
                                                                    <EyeOff className="mr-2 h-4 w-4" /> Desactivar
                                                                </DropdownMenuItem>
                                                            ) : (
                                                                <DropdownMenuItem onSelect={() => reactivatePlanMutation.mutate(plan.id)}>
                                                                    <Eye className="mr-2 h-4 w-4" /> Reactivar
                                                                </DropdownMenuItem>
                                                            )}
                                                            <DropdownMenuItem
                                                                className="text-destructive focus:text-destructive"
                                                                onSelect={() => {
                                                                    if (confirm(`¿Eliminar "${plan.name}" permanentemente?\n\nSolo funciona si no tiene membresías asociadas. Si tiene, usa "Desactivar".`)) {
                                                                        hardDeletePlanMutation.mutate(plan.id);
                                                                    }
                                                                }}
                                                            >
                                                                <Trash2 className="mr-2 h-4 w-4" /> Eliminar
                                                            </DropdownMenuItem>
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })
                                )}
                            </TableBody>
                        </Table>
                    </div>

                    <Dialog open={isDialogOpen} onOpenChange={handleDialogChange}>
                        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                            <DialogHeader>
                                <DialogTitle>{editingPlan ? 'Editar precio o paquete' : 'Crear precio o paquete'}</DialogTitle>
                                <DialogDescription>
                                    Los cambios se reflejan en la landing, checkout y /app. La vigencia actualiza el fin de membresías activas.
                                </DialogDescription>
                            </DialogHeader>

                            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="name">Nombre</Label>
                                        <Input id="name" {...register('name')} placeholder="Ej. Paquete 8 clases" />
                                        {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="price">Precio (MXN)</Label>
                                        <Input id="price" type="number" step="0.01" {...register('price')} placeholder="0.00" />
                                        {errors.price && <p className="text-xs text-destructive">{errors.price.message}</p>}
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="description">Descripción</Label>
                                    <Input id="description" {...register('description')} placeholder="Breve descripción para el usuario" />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="durationDays">Vigencia (días)</Label>
                                        <Input id="durationDays" type="number" {...register('durationDays')} placeholder="30" />
                                        {errors.durationDays && <p className="text-xs text-destructive">{errors.durationDays.message}</p>}
                                        {editingPlan && (
                                            <p className="text-xs text-muted-foreground">
                                                Se recalculará el fin de las membresías activas del paquete.
                                            </p>
                                        )}
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="classLimit">Créditos totales (vacío = ilimitado)</Label>
                                        <Input id="classLimit" type="number" {...register('classLimit')} placeholder="Ilimitado" />
                                        {errors.classLimit && <p className="text-xs text-destructive">{errors.classLimit.message as string}</p>}
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="reformerCredits">Créditos Reformer</Label>
                                        <Input id="reformerCredits" type="number" min="0" {...register('reformerCredits')} placeholder="Ilimitado" />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="multiCredits">Créditos Multi</Label>
                                        <Input id="multiCredits" type="number" min="0" {...register('multiCredits')} placeholder="Ilimitado" />
                                    </div>
                                </div>
                                <p className="-mt-2 text-xs text-muted-foreground">
                                    El motor de reservas usa <strong>estos dos buckets</strong>. <strong>Vacío = ilimitado</strong>, <strong>0 = no incluye</strong> esa categoría.
                                    Ej: Reformer → Reformer 8, Multi 0 · Mixto → Reformer 4, Multi 4 · Full → ambos vacíos.
                                </p>

                                <div className="space-y-2">
                                    <Label htmlFor="features">Características (una por línea)</Label>
                                    <Textarea
                                        id="features"
                                        {...register('features')}
                                        placeholder={'Acceso a todas las sedes\nToalla incluida\n...'}
                                        rows={4}
                                    />
                                </div>

                                <div className="flex items-center justify-between space-x-2 border p-3 rounded-md">
                                    <Label htmlFor="isActive" className="flex flex-col space-y-1">
                                        <span>Visible y disponible</span>
                                        <span className="font-normal text-xs text-muted-foreground">
                                            Visible en landing, checkout y /app
                                        </span>
                                    </Label>
                                    <Controller
                                        control={control}
                                        name="isActive"
                                        render={({ field }) => (
                                            <Switch id="isActive" checked={!!field.value} onCheckedChange={field.onChange} />
                                        )}
                                    />
                                </div>

                                <div className="flex items-center justify-between space-x-2 border p-3 rounded-md">
                                    <Label htmlFor="isInternal" className="flex flex-col space-y-1">
                                        <span>Plan interno (no visible para clientes)</span>
                                        <span className="font-normal text-xs text-muted-foreground">
                                            No aparece en la landing, checkout ni /app. Solo admin y recepción lo ven y lo asignan (ideal para planes de plataforma sin precio).
                                        </span>
                                    </Label>
                                    <Controller
                                        control={control}
                                        name="isInternal"
                                        render={({ field }) => (
                                            <Switch id="isInternal" checked={!!field.value} onCheckedChange={field.onChange} />
                                        )}
                                    />
                                </div>

                                {watch('isInternal') && (
                                    <div className="space-y-2 border p-3 rounded-md">
                                        <Label htmlFor="color">Color en reservas</Label>
                                        <p className="text-xs text-muted-foreground">
                                            Pastilla con la que se identifica al alumno de este plan en el roster de cada clase.
                                        </p>
                                        <Controller
                                            control={control}
                                            name="color"
                                            render={({ field }) => (
                                                <div className="flex items-center gap-3">
                                                    <input
                                                        type="color"
                                                        value={field.value || '#16A34A'}
                                                        onChange={(e) => field.onChange(e.target.value)}
                                                        className="h-9 w-14 cursor-pointer rounded border bg-transparent p-0.5"
                                                    />
                                                    <span
                                                        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                                                        style={{
                                                            backgroundColor: `${field.value || '#16A34A'}1A`,
                                                            color: field.value || '#16A34A',
                                                            border: `1px solid ${field.value || '#16A34A'}55`,
                                                        }}
                                                    >
                                                        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: field.value || '#16A34A' }} />
                                                        Vista previa
                                                    </span>
                                                </div>
                                            )}
                                        />
                                    </div>
                                )}

                                <div className="space-y-2">
                                    <Label htmlFor="sortOrder">Orden de visualización</Label>
                                    <Input id="sortOrder" type="number" {...register('sortOrder')} placeholder="0" />
                                </div>

                                <DialogFooter className="sticky bottom-0 -mx-6 -mb-6 border-t bg-background px-6 py-4">
                                    <Button type="button" variant="outline" onClick={() => handleDialogChange(false)}>
                                        Cancelar
                                    </Button>
                                    <Button type="submit" disabled={isSubmitting || savePlanMutation.isPending} className="bg-balance-olive text-balance-cream hover:bg-balance-olive/90">
                                        {(isSubmitting || savePlanMutation.isPending) && (
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        )}
                                        {editingPlan ? 'Guardar cambios' : 'Crear paquete'}
                                    </Button>
                                </DialogFooter>
                            </form>
                        </DialogContent>
                    </Dialog>
                </div>
            </AdminLayout>
        </AuthGuard>
    );
}
