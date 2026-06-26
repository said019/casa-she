import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import api, { getErrorMessage } from '@/lib/api';
import type { ClassType, ClassLevel } from '@/types/class';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
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
import { Loader2, Plus, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';

// Schema
const classTypeSchema = z.object({
    name: z.string().min(2, 'El nombre es requerido'),
    description: z.string().optional(),
    level: z.enum(['beginner', 'intermediate', 'advanced', 'all']),
    durationMinutes: z.coerce.number().int().positive('Debe ser positivo'),
    maxCapacity: z.coerce.number().int().positive('Debe ser positivo'),
    color: z.string().regex(/^#[0-9A-F]{6}$/i, 'Color hexadecimal requerido (ej. #FF0000)'), // Simple hex regex
    isActive: z.boolean().default(true),
});

type ClassTypeForm = z.infer<typeof classTypeSchema>;

export default function ClassTypesList() {
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingType, setEditingType] = useState<ClassType | null>(null);
    const { toast } = useToast();
    const queryClient = useQueryClient();

    const { register, handleSubmit, reset, setValue, watch, control, formState: { errors, isSubmitting } } = useForm<ClassTypeForm>({
        resolver: zodResolver(classTypeSchema),
        defaultValues: {
            level: 'all',
            durationMinutes: 60,
            maxCapacity: 6,
            color: '#7E8579',
            isActive: true,
        },
    });
    const selectedColor = watch('color');

    const { data: classTypes, isLoading } = useQuery<ClassType[]>({
        queryKey: ['class-types'],
        queryFn: async () => {
            const { data } = await api.get('/class-types?all=true');
            return data;
        },
    });

    const createMutation = useMutation({
        mutationFn: async (data: any) => {
            return await api.post('/class-types', data);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['class-types'] });
            toast({ title: 'Tipo de clase creado', description: 'Configuración guardada.' });
            setIsDialogOpen(false);
            reset();
        },
        onError: (error) => {
            toast({ variant: 'destructive', title: 'Error', description: getErrorMessage(error) });
        },
    });

    const updateMutation = useMutation({
        mutationFn: async ({ id, data }: { id: string; data: any }) => {
            return await api.put(`/class-types/${id}`, data);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['class-types'] });
            toast({ title: 'Tipo de clase actualizado', description: 'Cambios guardados exitosamente.' });
            setIsDialogOpen(false);
            setEditingType(null);
            reset();
        },
        onError: (error) => {
            toast({ variant: 'destructive', title: 'Error', description: getErrorMessage(error) });
        },
    });

    const deleteMutation = useMutation({
        mutationFn: async (id: string) => {
            return await api.delete(`/class-types/${id}`);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['class-types'] });
            toast({ title: 'Desactivado', description: 'El tipo de clase ha sido desactivado.' });
        },
        onError: (error) => {
            toast({ variant: 'destructive', title: 'Error', description: getErrorMessage(error) });
        },
    });

    const onSubmit = (data: ClassTypeForm) => {
        if (editingType) {
            updateMutation.mutate({ id: editingType.id, data });
        } else {
            createMutation.mutate(data);
        }
    };

    const handleEdit = (item: ClassType) => {
        setEditingType(item);
        setValue('name', item.name);
        setValue('description', item.description || '');
        setValue('level', item.level);
        setValue('durationMinutes', item.duration_minutes);
        setValue('maxCapacity', item.max_capacity);
        setValue('color', item.color || '#7E8579');
        setValue('isActive', item.is_active);
        setIsDialogOpen(true);
    };

    const handleCreate = () => {
        setEditingType(null);
        reset();
        setIsDialogOpen(true);
    };

    return (
        <AuthGuard requiredRoles={['admin']}>
            <AdminLayout>
                <div className="space-y-6">
                    <div className="flex flex-col gap-4 rounded-[1.6rem] border border-balance-olive/25 bg-balance-olive/10 p-5 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-balance-olive">Visible para usuarios</p>
                            <h1 className="text-3xl font-heading font-bold mt-1">Disciplinas y clases</h1>
                            <p className="max-w-2xl text-sm text-balance-dark/65">
                                Edita las clases que se ofrecen en el studio. Las disciplinas activas se usan para agenda, reservas en `/app` y se pueden reflejar en el landing.
                            </p>
                        </div>
                        <Button onClick={handleCreate} className="bg-balance-olive text-balance-cream hover:bg-balance-olive/90">
                            <Plus className="mr-2 h-4 w-4" /> Nueva disciplina
                        </Button>
                    </div>

                    <div className="rounded-md border bg-card">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Nombre</TableHead>
                                    <TableHead>Nivel</TableHead>
                                    <TableHead>Duración</TableHead>
                                    <TableHead>Capacidad</TableHead>
                                    <TableHead>Color</TableHead>
                                    <TableHead>Estado</TableHead>
                                    <TableHead className="text-right">Acciones</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoading ? (
                                    <TableRow>
                                        <TableCell colSpan={7} className="text-center py-8">
                                            <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
                                        </TableCell>
                                    </TableRow>
                                ) : classTypes?.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                                            No hay tipos de clase configurados.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    classTypes?.map((item) => (
                                        <TableRow key={item.id}>
                                            <TableCell className="font-medium">
                                                {item.name}
                                            </TableCell>
                                            <TableCell className="capitalize">{item.level}</TableCell>
                                            <TableCell>{item.duration_minutes} min</TableCell>
                                            <TableCell>{item.max_capacity} pers.</TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    <div
                                                        className="w-4 h-4 rounded-full border border-border"
                                                        style={{ backgroundColor: item.color || '#ccc' }}
                                                    />
                                                    <span className="text-xs font-mono">{item.color}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant={item.is_active ? 'default' : 'secondary'}>
                                                    {item.is_active ? 'Activo' : 'Inactivo'}
                                                </Badge>
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
                                                        <DropdownMenuItem onClick={() => handleEdit(item)}>
                                                            <Pencil className="mr-2 h-4 w-4" /> Editar
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem
                                                            className="text-destructive"
                                                            onClick={() => {
                                                                if (confirm('¿Desactivar este tipo de clase?')) deleteMutation.mutate(item.id);
                                                            }}
                                                        >
                                                            <Trash2 className="mr-2 h-4 w-4" /> Desactivar
                                                        </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>

                    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>{editingType ? 'Editar disciplina' : 'Nueva disciplina'}</DialogTitle>
                                <DialogDescription>
                                    Nombre, color, duración y cupo. Usa 6 lugares para respetar el formato de grupos reducidos de BMB Studio.
                                </DialogDescription>
                            </DialogHeader>

                            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="name">Nombre</Label>
                                    <Input id="name" {...register('name')} placeholder="Ej. Hot Pilates" />
                                    {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="description">Descripción</Label>
                                    <Textarea id="description" {...register('description')} rows={2} />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="duration">Duración (min)</Label>
                                        <Input type="number" id="duration" {...register('durationMinutes')} />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="capacity">Cupo por clase</Label>
                                        <Input type="number" id="capacity" {...register('maxCapacity')} />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label>Nivel</Label>
                                        <Controller
                                            control={control}
                                            name="level"
                                            render={({ field }) => (
                                                <Select value={field.value} onValueChange={field.onChange}>
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="Seleccionar nivel" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="beginner">Principiante</SelectItem>
                                                        <SelectItem value="intermediate">Intermedio</SelectItem>
                                                        <SelectItem value="advanced">Avanzado</SelectItem>
                                                        <SelectItem value="all">Todos los niveles</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            )}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="color">Color en agenda</Label>
                                        <div className="flex gap-2">
                                            <Input id="color" {...register('color')} placeholder="#7E8579" />
                                            <div
                                                className="w-10 h-10 rounded-md border shrink-0"
                                                style={{ backgroundColor: selectedColor || '#7E8579' }}
                                            />
                                        </div>
                                        {errors.color && <p className="text-xs text-destructive">{errors.color.message}</p>}
                                    </div>
                                </div>

                                <div className="flex items-center justify-between space-x-2 rounded-md border p-3">
                                    <Label htmlFor="isActive">Visible y disponible</Label>
                                    <Controller
                                        control={control}
                                        name="isActive"
                                        render={({ field }) => (
                                            <Switch id="isActive" checked={!!field.value} onCheckedChange={field.onChange} />
                                        )}
                                    />
                                </div>

                                <DialogFooter>
                                    <Button type="button" variant="ghost" onClick={() => setIsDialogOpen(false)}>
                                        Cancelar
                                    </Button>
                                    <Button type="submit" disabled={isSubmitting}>
                                        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                        Guardar disciplina
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
