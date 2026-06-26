import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import api, { getErrorMessage } from '@/lib/api';
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
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, Plus, MoreHorizontal, Pencil, Trash2, Building2, Users, MapPin } from 'lucide-react';
import { Link } from 'react-router-dom';

// Type for Facility
interface Facility {
    id: string;
    name: string;
    description: string | null;
    capacity: number;
    equipment: string[];
    is_active: boolean;
    sort_order: number;
    created_at: string;
    updated_at: string;
}

// Schema for form
const facilitySchema = z.object({
    name: z.string().min(2, 'El nombre es requerido'),
    description: z.string().optional(),
    capacity: z.coerce.number().min(1, 'La capacidad debe ser al menos 1'),
    equipment: z.string().optional(), // Comma-separated
    isActive: z.boolean().default(true),
    sortOrder: z.coerce.number().default(0),
});

type FacilityForm = z.infer<typeof facilitySchema>;

export default function FacilitiesList() {
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingFacility, setEditingFacility] = useState<Facility | null>(null);
    const [deletingFacility, setDeletingFacility] = useState<Facility | null>(null);
    const { toast } = useToast();
    const queryClient = useQueryClient();

    // Form setup
    const { register, handleSubmit, reset, setValue, watch, formState: { errors, isSubmitting } } = useForm<FacilityForm>({
        resolver: zodResolver(facilitySchema),
        defaultValues: {
            isActive: true,
            capacity: 8,
            sortOrder: 0,
        },
    });

    // Fetch Facilities
    const { data: facilities, isLoading } = useQuery<Facility[]>({
        queryKey: ['facilities'],
        queryFn: async () => {
            const { data } = await api.get('/facilities');
            return data;
        },
    });

    // Create Mutation
    const createMutation = useMutation({
        mutationFn: async (data: any) => {
            return await api.post('/facilities', data);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['facilities'] });
            toast({ title: 'Sala creada exitosamente' });
            handleCloseDialog();
        },
        onError: (error: any) => {
            toast({
                title: 'Error al crear sala',
                description: getErrorMessage(error),
                variant: 'destructive',
            });
        },
    });

    // Update Mutation
    const updateMutation = useMutation({
        mutationFn: async ({ id, data }: { id: string; data: any }) => {
            return await api.put(`/facilities/${id}`, data);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['facilities'] });
            toast({ title: 'Sala actualizada exitosamente' });
            handleCloseDialog();
        },
        onError: (error: any) => {
            toast({
                title: 'Error al actualizar sala',
                description: getErrorMessage(error),
                variant: 'destructive',
            });
        },
    });

    // Delete Mutation
    const deleteMutation = useMutation({
        mutationFn: async (id: string) => {
            return await api.delete(`/facilities/${id}`);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['facilities'] });
            toast({ title: 'Sala eliminada exitosamente' });
            setDeletingFacility(null);
        },
        onError: (error: any) => {
            toast({
                title: 'Error al eliminar sala',
                description: getErrorMessage(error),
                variant: 'destructive',
            });
        },
    });

    const handleCloseDialog = () => {
        setIsDialogOpen(false);
        setEditingFacility(null);
        reset({
            name: '',
            description: '',
            capacity: 8,
            equipment: '',
            isActive: true,
            sortOrder: 0,
        });
    };

    const handleEdit = (facility: Facility) => {
        setEditingFacility(facility);
        setValue('name', facility.name);
        setValue('description', facility.description || '');
        setValue('capacity', facility.capacity);
        setValue('equipment', Array.isArray(facility.equipment) ? facility.equipment.join(', ') : '');
        setValue('isActive', facility.is_active);
        setValue('sortOrder', facility.sort_order);
        setIsDialogOpen(true);
    };

    const handleCreate = () => {
        reset({
            name: '',
            description: '',
            capacity: 8,
            equipment: '',
            isActive: true,
            sortOrder: 0,
        });
        setIsDialogOpen(true);
    };

    const onSubmit = async (data: FacilityForm) => {
        const payload = {
            name: data.name,
            description: data.description || null,
            capacity: data.capacity,
            equipment: data.equipment 
                ? data.equipment.split(',').map(e => e.trim()).filter(Boolean) 
                : [],
            is_active: data.isActive,
            sort_order: data.sortOrder,
        };

        if (editingFacility) {
            await updateMutation.mutateAsync({ id: editingFacility.id, data: payload });
        } else {
            await createMutation.mutateAsync(payload);
        }
    };

    return (
        <AuthGuard requiredRoles={['admin', 'super_admin']}>
            <AdminLayout>
                <div className="space-y-6">
                    {/* Header */}
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-3xl font-heading font-bold">Salas / Estudios</h1>
                            <p className="text-muted-foreground">
                                Administra las salas y estudios del centro
                            </p>
                        </div>
                        <Button onClick={handleCreate}>
                            <Plus className="h-4 w-4 mr-2" />
                            Nueva Sala
                        </Button>
                    </div>

                    {/* Table */}
                    {isLoading ? (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        </div>
                    ) : !facilities?.length ? (
                        <div className="text-center py-12 border rounded-lg">
                            <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                            <h3 className="text-lg font-medium">No hay salas registradas</h3>
                            <p className="text-muted-foreground mb-4">
                                Crea una sala para comenzar a asignar clases
                            </p>
                            <Button onClick={handleCreate}>
                                <Plus className="h-4 w-4 mr-2" />
                                Nueva Sala
                            </Button>
                        </div>
                    ) : (
                        <div className="border rounded-lg overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Nombre</TableHead>
                                        <TableHead>Descripción</TableHead>
                                        <TableHead className="text-center">Capacidad</TableHead>
                                        <TableHead>Equipamiento</TableHead>
                                        <TableHead className="text-center">Estado</TableHead>
                                        <TableHead className="text-right">Acciones</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {facilities.map((facility) => (
                                        <TableRow key={facility.id}>
                                            <TableCell className="font-medium">
                                                <div className="flex items-center gap-2">
                                                    <Building2 className="h-4 w-4 text-muted-foreground" />
                                                    {facility.name}
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-muted-foreground max-w-[200px] truncate">
                                                {facility.description || '-'}
                                            </TableCell>
                                            <TableCell className="text-center">
                                                <div className="flex items-center justify-center gap-1">
                                                    <Users className="h-4 w-4 text-muted-foreground" />
                                                    {facility.capacity}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-wrap gap-1">
                                                    {Array.isArray(facility.equipment) && facility.equipment.length > 0 ? (
                                                        facility.equipment.slice(0, 3).map((eq, idx) => (
                                                            <Badge key={idx} variant="secondary" className="text-xs">
                                                                {eq}
                                                            </Badge>
                                                        ))
                                                    ) : (
                                                        <span className="text-muted-foreground text-sm">-</span>
                                                    )}
                                                    {Array.isArray(facility.equipment) && facility.equipment.length > 3 && (
                                                        <Badge variant="outline" className="text-xs">
                                                            +{facility.equipment.length - 3}
                                                        </Badge>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-center">
                                                <Badge variant={facility.is_active ? 'default' : 'secondary'}>
                                                    {facility.is_active ? 'Activa' : 'Inactiva'}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" size="icon">
                                                            <MoreHorizontal className="h-4 w-4" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end">
                                                        <DropdownMenuLabel>Acciones</DropdownMenuLabel>
                                                        <DropdownMenuItem asChild>
                                                            <Link to={`/admin/facilities/${facility.id}/layout`}>
                                                                <MapPin className="h-4 w-4 mr-2" />
                                                                Ver / editar mapa
                                                            </Link>
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem onClick={() => handleEdit(facility)}>
                                                            <Pencil className="h-4 w-4 mr-2" />
                                                            Editar datos
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem 
                                                            className="text-destructive"
                                                            onClick={() => setDeletingFacility(facility)}
                                                        >
                                                            <Trash2 className="h-4 w-4 mr-2" />
                                                            Eliminar
                                                        </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}

                    {/* Create/Edit Dialog */}
                    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                        <DialogContent className="max-w-md">
                            <DialogHeader>
                                <DialogTitle>
                                    {editingFacility ? 'Editar Sala' : 'Nueva Sala'}
                                </DialogTitle>
                                <DialogDescription>
                                    {editingFacility
                                        ? 'Modifica los datos de la sala'
                                        : 'Agrega una nueva sala o estudio al centro'}
                                </DialogDescription>
                            </DialogHeader>

                            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                                {/* Name */}
                                <div className="space-y-2">
                                    <Label htmlFor="name">Nombre *</Label>
                                    <Input
                                        id="name"
                                        {...register('name')}
                                        placeholder="Sala Principal"
                                    />
                                    {errors.name && (
                                        <p className="text-sm text-destructive">{errors.name.message}</p>
                                    )}
                                </div>

                                {/* Description */}
                                <div className="space-y-2">
                                    <Label htmlFor="description">Descripción</Label>
                                    <Textarea
                                        id="description"
                                        {...register('description')}
                                        placeholder="Sala principal con equipos reformer..."
                                        rows={2}
                                    />
                                </div>

                                {/* Capacity */}
                                <div className="space-y-2">
                                    <Label htmlFor="capacity">Capacidad *</Label>
                                    <Input
                                        id="capacity"
                                        type="number"
                                        min={1}
                                        {...register('capacity')}
                                        placeholder="8"
                                    />
                                    {errors.capacity && (
                                        <p className="text-sm text-destructive">{errors.capacity.message}</p>
                                    )}
                                </div>

                                {/* Equipment */}
                                <div className="space-y-2">
                                    <Label htmlFor="equipment">Equipamiento</Label>
                                    <Input
                                        id="equipment"
                                        {...register('equipment')}
                                        placeholder="Reformer, Mat, Props, Barril..."
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        Separa los elementos con comas
                                    </p>
                                </div>

                                {/* Sort Order */}
                                <div className="space-y-2">
                                    <Label htmlFor="sortOrder">Orden</Label>
                                    <Input
                                        id="sortOrder"
                                        type="number"
                                        {...register('sortOrder')}
                                        placeholder="0"
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        Orden de aparición (menor = primero)
                                    </p>
                                </div>

                                {/* Is Active */}
                                <div className="flex items-center justify-between">
                                    <div className="space-y-0.5">
                                        <Label>Estado</Label>
                                        <p className="text-xs text-muted-foreground">
                                            Las salas inactivas no se mostrarán
                                        </p>
                                    </div>
                                    <Switch
                                        checked={watch('isActive')}
                                        onCheckedChange={(checked) => setValue('isActive', checked)}
                                    />
                                </div>

                                <DialogFooter>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={handleCloseDialog}
                                    >
                                        Cancelar
                                    </Button>
                                    <Button
                                        type="submit"
                                        disabled={isSubmitting || createMutation.isPending || updateMutation.isPending}
                                    >
                                        {(isSubmitting || createMutation.isPending || updateMutation.isPending) && (
                                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                        )}
                                        {editingFacility ? 'Guardar' : 'Crear'}
                                    </Button>
                                </DialogFooter>
                            </form>
                        </DialogContent>
                    </Dialog>

                    {/* Delete Confirmation */}
                    <AlertDialog open={!!deletingFacility} onOpenChange={() => setDeletingFacility(null)}>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>¿Eliminar sala?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    Esta acción eliminará la sala "{deletingFacility?.name}". 
                                    Las clases asociadas a esta sala perderán su asignación.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction
                                    onClick={() => deletingFacility && deleteMutation.mutate(deletingFacility.id)}
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                    {deleteMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                                    Eliminar
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </div>
            </AdminLayout>
        </AuthGuard>
    );
}
