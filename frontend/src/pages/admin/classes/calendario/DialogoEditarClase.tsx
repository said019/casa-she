import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { Calendar as CalendarIcon, Loader2 } from 'lucide-react';
import api, { getErrorMessage } from '@/lib/api';
import type { Class, ClassType, Instructor } from '@/types/class';
import { ClassIntensitySelector } from '@/components/classes/ClassIntensity';
import { ChannelLogo } from '@/components/brands/ChannelLogo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import type { Facility } from './tipos';
import { cambiosDeClase, datosEditablesDeClase, type DatosClaseEditables } from './cambiosClase';

const editClassSchema = z.object({
    intensity: z.number().int().min(1).max(3).nullable(),
    classTypeId: z.string().uuid(),
    instructorId: z.string().uuid(),
    facilityId: z.string().uuid().optional(),
    date: z.date(),
    startTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
    endTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
    maxCapacity: z.coerce.number().int().positive(),
    totalpassSpots: z.coerce.number().int().min(0).optional(),
});

type EditClassForm = z.infer<typeof editClassSchema>;

interface DialogoEditarClaseProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** La clase a editar. El padre vuelve a montar el diálogo (key) en cada apertura. */
    clase: Class | null;
    classTypes?: ClassType[];
    instructors?: Instructor[];
    facilities?: Facility[];
    /** El enlace "Cambiar coach…" abre ese diálogo encima de este. */
    onCambiarCoach: () => void;
    /** Se guardó: el padre cierra el panel de la clase. */
    onGuardada: () => void;
}

/** "Editar clase". Movido sin cambios de ClassesCalendar. */
export function DialogoEditarClase({ open, onOpenChange, clase, classTypes, instructors, facilities, onCambiarCoach, onGuardada }: DialogoEditarClaseProps) {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const editForm = useForm<EditClassForm>({
        resolver: zodResolver(editClassSchema),
        // Los mismos valores que ponía handleEditClass con editForm.reset() al abrir.
        defaultValues: clase ? {
            classTypeId: clase.class_type_id || '',
            instructorId: clase.instructor_id || '',
            facilityId: clase.facility_id || undefined,
            date: parseISO((clase.date || '').split('T')[0] + 'T00:00:00'),
            startTime: clase.start_time,
            endTime: clase.end_time,
            maxCapacity: clase.max_capacity,
            intensity: clase.intensity ?? null,
            totalpassSpots: clase.totalpass_spots ?? 0,
        } : undefined,
    });

    const editMutation = useMutation({
        mutationFn: async (data: EditClassForm & { id: string; antes: DatosClaseEditables; originalTotalpassSpots?: number; originalMaxCapacity?: number }) => {
            const { id, antes, originalTotalpassSpots, originalMaxCapacity, ...rest } = data;
            // Solo lo que cambió: el backend marca resincronización con TotalPass si recibe
            // tipo, coach, fecha u hora, aunque sean los mismos de antes.
            const cambios = cambiosDeClase(antes, {
                classTypeId: rest.classTypeId,
                instructorId: rest.instructorId,
                facilityId: rest.facilityId || null,
                date: format(rest.date, 'yyyy-MM-dd'),
                startTime: rest.startTime,
                endTime: rest.endTime,
                maxCapacity: rest.maxCapacity,
                intensity: rest.intensity,
            });
            const huboCambiosEnClase = Object.keys(cambios).length > 0;
            const res = huboCambiosEnClase ? await api.put(`/classes/${id}`, cambios) : null;

            // El PUT a /channels se dispara si el cupo TP cambió, o si la capacidad bajó
            // (con cupo TP > 0 vigente) para que el backend revalide CAP_EXCEEDS_CAPACITY.
            const newTotalpassSpots = rest.totalpassSpots ?? 0;
            const totalpassChanged = newTotalpassSpots !== (originalTotalpassSpots ?? 0);
            const capacityDecreased = originalMaxCapacity != null && rest.maxCapacity < originalMaxCapacity;
            const shouldSyncChannels = totalpassChanged || (capacityDecreased && newTotalpassSpots > 0);

            if (shouldSyncChannels) {
                try {
                    await api.put(`/classes/${id}/channels`, { totalpass: newTotalpassSpots });
                } catch (channelsError) {
                    // La clase (PUT #1) ya se guardó; solo falló la sincronización del cupo TotalPass.
                    // Etiquetamos el error para distinguirlo en onError sin perder el error original.
                    throw Object.assign(new Error('CHANNELS_UPDATE_FAILED'), { classSaved: true, channelsError });
                }
            }

            return { res, guardoAlgo: huboCambiosEnClase || shouldSyncChannels };
        },
        onSuccess: ({ res, guardoAlgo }: { res: any; guardoAlgo: boolean }) => {
            if (!guardoAlgo) {
                toast({ title: 'Sin cambios', description: 'No había nada que guardar.' });
                onOpenChange(false);
                return;
            }
            const warning = res?.data?.payrollWarning;
            if (warning) {
                toast({ variant: 'destructive', title: 'Clase actualizada — revisa la nómina', description: warning });
            } else {
                toast({ title: 'Clase actualizada', description: 'Los cambios se guardaron correctamente.' });
            }
            onOpenChange(false);
            onGuardada();
        },
        onError: (err: any) => {
            if (err?.classSaved) {
                toast({
                    variant: 'destructive',
                    title: 'Cupo de TotalPass no actualizado',
                    description: `La clase se guardó, pero no se pudo actualizar el cupo de TotalPass: ${getErrorMessage(err.channelsError)}`,
                });
                return;
            }
            toast({ variant: 'destructive', title: 'Error', description: getErrorMessage(err) });
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ['classes'] });
            queryClient.invalidateQueries({ queryKey: ['public-classes'] });
            queryClient.invalidateQueries({ queryKey: ['landing-horario'] });
            queryClient.invalidateQueries({ queryKey: ['bio-classes'] });
            queryClient.invalidateQueries({ queryKey: ['my-bookings'] });
            queryClient.invalidateQueries({ queryKey: ['booking-detail'] });
        },
    });

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Editar Clase</DialogTitle>
                    <DialogDescription>Modifica los detalles de la clase.</DialogDescription>
                </DialogHeader>
                <form onSubmit={editForm.handleSubmit(d => clase && editMutation.mutate({ ...d, id: clase.id, antes: datosEditablesDeClase(clase), originalTotalpassSpots: clase.totalpass_spots ?? 0, originalMaxCapacity: clase.max_capacity }))} className="space-y-4">
                    <div className="space-y-2">
                        <Label>Fecha</Label>
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button variant="outline" className="w-full justify-start text-left font-normal">
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {editForm.watch('date') ? format(editForm.watch('date'), 'P', { locale: es }) : 'Seleccionar'}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0">
                                <Calendar
                                    mode="single"
                                    selected={editForm.watch('date')}
                                    onSelect={(d) => d && editForm.setValue('date', d)}
                                />
                            </PopoverContent>
                        </Popover>
                    </div>

                    <div className="space-y-2">
                        <Label>Tipo de Clase</Label>
                        <Select
                            value={editForm.watch('classTypeId')}
                            onValueChange={(val) => editForm.setValue('classTypeId', val)}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="Seleccionar tipo..." />
                            </SelectTrigger>
                            <SelectContent>
                                {classTypes?.map(ct => (
                                    <SelectItem key={ct.id} value={ct.id}>
                                        {ct.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                            <Label>Instructor</Label>
                            <Button
                                type="button"
                                variant="link"
                                size="sm"
                                className="h-auto p-0 text-balance-gold"
                                onClick={onCambiarCoach}
                            >
                                Cambiar coach…
                            </Button>
                        </div>
                        <Select
                            value={editForm.watch('instructorId')}
                            onValueChange={(val) => editForm.setValue('instructorId', val)}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="Seleccionar instructor..." />
                            </SelectTrigger>
                            <SelectContent>
                                {instructors?.map(inst => (
                                    <SelectItem key={inst.id} value={inst.id}>
                                        {inst.display_name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label>Sala</Label>
                        <Select
                            value={editForm.watch('facilityId') || ''}
                            onValueChange={(val) => editForm.setValue('facilityId', val || undefined)}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="Seleccionar sala (opcional)..." />
                            </SelectTrigger>
                            <SelectContent>
                                {facilities?.map(f => (
                                    <SelectItem key={f.id} value={f.id}>
                                        {f.name} ({f.capacity} lugares)
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Inicio</Label>
                            <Input type="time" {...editForm.register('startTime')} />
                        </div>
                        <div className="space-y-2">
                            <Label>Fin</Label>
                            <Input type="time" {...editForm.register('endTime')} />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="editar-capacidad">Capacidad</Label>
                        <Input id="editar-capacidad" type="number" {...editForm.register('maxCapacity')} />
                    </div>
                    <ClassIntensitySelector value={editForm.watch('intensity')} onChange={(value) => editForm.setValue('intensity', value, { shouldDirty: true, shouldValidate: true })} />

                    <div className="space-y-2">
                        <Label htmlFor="editar-cupo-totalpass" className="flex items-center gap-1.5">Lugares para <ChannelLogo canal="totalpass" alto={10} /></Label>
                        <Input id="editar-cupo-totalpass" type="number" min={0} {...editForm.register('totalpassSpots', { valueAsNumber: true })} />
                        <p className="text-xs text-muted-foreground">0 = clase no ofrecida en TotalPass</p>
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
                        <Button type="submit" disabled={editMutation.isPending}>
                            {editMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Guardar Cambios
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
