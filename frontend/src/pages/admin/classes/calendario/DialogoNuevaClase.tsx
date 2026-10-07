import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Calendar as CalendarIcon, Loader2, Repeat } from 'lucide-react';
import api, { getErrorMessage } from '@/lib/api';
import type { ClassType, Instructor } from '@/types/class';
import { ClassIntensitySelector } from '@/components/classes/ClassIntensity';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import type { Facility } from './tipos';
import { DAYS } from './formato';

const classSchema = z.object({
    intensity: z.number().int().min(1).max(3).nullable(),
    date: z.date(),
    classTypeId: z.string().uuid(),
    instructorId: z.string().uuid(),
    facilityId: z.string().uuid().optional(),
    startTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
    endTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
    maxCapacity: z.coerce.number().int().positive(),
    recurring: z.boolean().optional(),
    endDate: z.date().optional(),
    weekdays: z.array(z.number().int().min(0).max(6)).optional(),
})
    .refine((d) => !d.recurring || (!!d.weekdays && d.weekdays.length > 0), {
        message: 'Elige al menos un día de la semana.',
        path: ['weekdays'],
    })
    .refine((d) => !d.recurring || !!d.endDate, {
        message: 'Selecciona la fecha "hasta".',
        path: ['endDate'],
    })
    .refine((d) => !d.recurring || !d.endDate || d.endDate >= d.date, {
        message: 'La fecha "hasta" debe ser igual o posterior a "desde".',
        path: ['endDate'],
    });

type ClassForm = z.infer<typeof classSchema>;

interface DialogoNuevaClaseProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Día con el que arranca el formulario. El padre vuelve a montar el diálogo (key) en cada apertura. */
    dia: Date;
    classTypes?: ClassType[];
    instructors?: Instructor[];
    facilities?: Facility[];
}

/** "Nueva clase": una clase suelta o una tanda recurrente. Movido sin cambios de ClassesCalendar. */
export function DialogoNuevaClase({ open, onOpenChange, dia, classTypes, instructors, facilities }: DialogoNuevaClaseProps) {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const classForm = useForm<ClassForm>({
        resolver: zodResolver(classSchema),
        // Los mismos valores que ponía handleDayClick con classForm.reset() al abrir.
        defaultValues: {
            date: dia,
            maxCapacity: 6,
            intensity: null,
            startTime: '09:00',
            endTime: '10:00',
            recurring: false,
            weekdays: [dia.getDay()],
            endDate: undefined,
        },
    });

    const createMutation = useMutation({
        mutationFn: async (data: ClassForm) => {
            return await api.post('/classes', {
                classTypeId: data.classTypeId,
                instructorId: data.instructorId,
                facilityId: data.facilityId || null,
                date: format(data.date, 'yyyy-MM-dd'),
                startTime: data.startTime,
                endTime: data.endTime,
                maxCapacity: data.maxCapacity,
                intensity: data.intensity,
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['classes'] });
            toast({ title: 'Clase creada', description: 'La clase se agrego al calendario.' });
            onOpenChange(false);
        },
        onError: (err) => toast({ variant: 'destructive', title: 'Error', description: getErrorMessage(err) }),
    });

    const recurringMutation = useMutation({
        mutationFn: async (data: ClassForm) => {
            return await api.post('/classes/recurring', {
                classTypeId: data.classTypeId,
                instructorId: data.instructorId,
                facilityId: data.facilityId || null,
                startTime: data.startTime,
                endTime: data.endTime,
                maxCapacity: data.maxCapacity,
                intensity: data.intensity,
                startDate: format(data.date, 'yyyy-MM-dd'),
                endDate: format(data.endDate!, 'yyyy-MM-dd'),
                weekdays: data.weekdays!,
            });
        },
        onSuccess: (res: any) => {
            queryClient.invalidateQueries({ queryKey: ['classes'] });
            const creadas: number = res?.data?.creadas ?? 0;
            const saltadas: number = res?.data?.saltadas?.length ?? 0;
            toast({
                title: 'Clases recurrentes creadas',
                description: saltadas > 0
                    ? `Se crearon ${creadas} clases. Se saltaron ${saltadas} (ocupadas o días cerrados).`
                    : `Se crearon ${creadas} clases.`,
            });
            onOpenChange(false);
        },
        onError: (err) => toast({ variant: 'destructive', title: 'Error', description: getErrorMessage(err) }),
    });

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Nueva Clase</DialogTitle>
                    <DialogDescription>{classForm.watch('recurring') ? 'Crea una tanda de clases recurrentes.' : 'Agrega una clase individual al calendario.'}</DialogDescription>
                </DialogHeader>
                <form onSubmit={classForm.handleSubmit(d => (d.recurring ? recurringMutation.mutate(d) : createMutation.mutate(d)))} className="space-y-4">
                    <div className="space-y-2">
                        <Label>{classForm.watch('recurring') ? 'Desde' : 'Fecha'}</Label>
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button variant="outline" className="w-full justify-start text-left font-normal">
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {classForm.watch('date') ? format(classForm.watch('date'), 'P', { locale: es }) : 'Seleccionar'}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0">
                                <Calendar
                                    mode="single"
                                    selected={classForm.watch('date')}
                                    onSelect={(d) => d && classForm.setValue('date', d)}
                                />
                            </PopoverContent>
                        </Popover>
                    </div>

                    <div className="space-y-2">
                        <Label>Tipo de Clase</Label>
                        <Select onValueChange={(val) => classForm.setValue('classTypeId', val)}>
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
                        <Label>Instructor</Label>
                        <Select onValueChange={(val) => classForm.setValue('instructorId', val)}>
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
                        <Select onValueChange={(val) => classForm.setValue('facilityId', val)}>
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
                            <Input type="time" {...classForm.register('startTime')} />
                        </div>
                        <div className="space-y-2">
                            <Label>Fin</Label>
                            <Input type="time" {...classForm.register('endTime')} />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label>Capacidad</Label>
                        <Input type="number" {...classForm.register('maxCapacity')} />
                    </div>
                    <ClassIntensitySelector value={classForm.watch('intensity')} onChange={(value) => classForm.setValue('intensity', value, { shouldDirty: true, shouldValidate: true })} />

                    <div className="space-y-3 rounded-lg border border-bmb-gold/30 p-3">
                        <div className="flex items-center justify-between">
                            <Label className="flex items-center gap-2">
                                <Repeat className="h-4 w-4" /> Repetir semanalmente
                            </Label>
                            <Switch
                                checked={!!classForm.watch('recurring')}
                                onCheckedChange={(v) => {
                                    classForm.setValue('recurring', v);
                                    if (v && (classForm.watch('weekdays')?.length ?? 0) === 0) {
                                        const d = classForm.watch('date');
                                        classForm.setValue('weekdays', d ? [d.getDay()] : []);
                                    }
                                }}
                            />
                        </div>

                        {classForm.watch('recurring') && (
                            <>
                                <div className="space-y-2">
                                    <Label>Días</Label>
                                    <div className="flex flex-wrap gap-1.5">
                                        {DAYS.map((label, idx) => {
                                            const selected = (classForm.watch('weekdays') ?? []).includes(idx);
                                            return (
                                                <Button
                                                    key={idx}
                                                    type="button"
                                                    size="sm"
                                                    variant={selected ? 'default' : 'outline'}
                                                    className="w-11"
                                                    onClick={() => {
                                                        const cur = classForm.watch('weekdays') ?? [];
                                                        const next = cur.includes(idx)
                                                            ? cur.filter((x) => x !== idx)
                                                            : [...cur, idx];
                                                        classForm.setValue('weekdays', next, { shouldValidate: true });
                                                    }}
                                                >
                                                    {label}
                                                </Button>
                                            );
                                        })}
                                    </div>
                                    {classForm.formState.errors.weekdays && (
                                        <p className="text-xs text-destructive">{classForm.formState.errors.weekdays.message as string}</p>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <Label>Repetir hasta</Label>
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <Button variant="outline" className="w-full justify-start text-left font-normal">
                                                <CalendarIcon className="mr-2 h-4 w-4" />
                                                {classForm.watch('endDate') ? format(classForm.watch('endDate')!, 'P', { locale: es }) : 'Seleccionar'}
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-auto p-0">
                                            <Calendar
                                                mode="single"
                                                selected={classForm.watch('endDate')}
                                                onSelect={(d) => d && classForm.setValue('endDate', d, { shouldValidate: true })}
                                            />
                                        </PopoverContent>
                                    </Popover>
                                    {classForm.formState.errors.endDate && (
                                        <p className="text-xs text-destructive">{classForm.formState.errors.endDate.message as string}</p>
                                    )}
                                </div>
                            </>
                        )}
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
                        <Button type="submit" disabled={createMutation.isPending || recurringMutation.isPending}>
                            {(createMutation.isPending || recurringMutation.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {classForm.watch('recurring') ? 'Crear clases' : 'Crear Clase'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
