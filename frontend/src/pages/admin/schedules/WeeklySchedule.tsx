import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import api, { getErrorMessage } from '@/lib/api';
import type { Schedule, ClassType, Instructor } from '@/types/class';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TimePicker } from '@/components/ui/time-picker';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, Plus, Users, X, AlertTriangle } from 'lucide-react';

const scheduleSchema = z.object({
    dayOfWeek: z.coerce.number().int().min(0).max(6),
    classTypeId: z.string().uuid('Selecciona un tipo de clase'),
    instructorId: z.string().uuid('Selecciona un instructor'),
    startTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Formato HH:MM (24h)'),
    endTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Formato HH:MM (24h)'),
    maxCapacity: z.coerce.number().int().positive(),
    isActive: z.boolean().default(true),
    facilityId: z.string().uuid('Selecciona una sucursal'),
});

type ScheduleForm = z.infer<typeof scheduleSchema>;

const DAYS_OF_WEEK = [
    'Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'
];

interface Facility {
    id: string;
    name: string;
}

export default function WeeklySchedule({ embedded = false }: { embedded?: boolean } = {}) {
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [selectedDay, setSelectedDay] = useState<number | null>(null);
    const [facilityFilter, setFacilityFilter] = useState('all');
    const { toast } = useToast();
    const queryClient = useQueryClient();

    // Fetch Schedules
    const { data: schedules, isLoading } = useQuery<Schedule[]>({
        queryKey: ['schedules'],
        queryFn: async () => {
            const { data } = await api.get('/schedules?all=true');
            return data;
        },
    });

    // Fetch Class Types
    const { data: classTypes } = useQuery<ClassType[]>({
        queryKey: ['class-types'],
        queryFn: async () => {
            const { data } = await api.get('/class-types');
            return data;
        },
    });

    // Fetch Facilities
    const { data: facilities } = useQuery<Facility[]>({
        queryKey: ['facilities'],
        queryFn: async () => {
            const { data } = await api.get('/facilities');
            return data;
        },
    });

    // Fetch Instructors
    const { data: instructors } = useQuery<Instructor[]>({
        queryKey: ['instructors'],
        queryFn: async () => {
            const { data } = await api.get('/instructors');
            return data;
        },
    });

    const { register, handleSubmit, reset, setValue, watch, formState: { errors, isSubmitting } } = useForm<ScheduleForm>({
        resolver: zodResolver(scheduleSchema),
        defaultValues: {
            maxCapacity: 6,
            isActive: true
        }
    });


    const createMutation = useMutation({
        mutationFn: async (data: ScheduleForm) => {
            return await api.post('/schedules', { ...data, isRecurring: true });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['schedules'] });
            toast({ title: 'Horario creado', description: 'La clase ha sido añadida a la plantilla semanal.' });
            setIsDialogOpen(false);
            reset();
        },
        onError: (error) => {
            toast({ variant: 'destructive', title: 'Error', description: getErrorMessage(error) });
        },
    });

    const deleteMutation = useMutation({
        mutationFn: async (id: string) => {
            return await api.delete(`/schedules/${id}`);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['schedules'] });
            toast({ title: 'Horario eliminado', description: 'Se ha eliminado de la plantilla.' });
        },
        onError: (error) => {
            toast({ variant: 'destructive', title: 'Error', description: getErrorMessage(error) });
        },
    });

    const onSubmit = (data: ScheduleForm) => {
        createMutation.mutate(data);
    };

    const handleAddClass = (day: number) => {
        setSelectedDay(day);
        setValue('dayOfWeek', day);
        // Pre-seleccionar la sucursal de la pestaña activa (si no es "Todas").
        const activeFacility = (facilities || []).find((fac) => fac.name === facilityFilter);
        setValue('facilityId', activeFacility ? activeFacility.id : ('' as unknown as string));
        setIsDialogOpen(true);
    };

    // Group schedules by day (with optional facility filter)
    const schedulesByDay = Array.from({ length: 7 }, (_, i) => {
        return (schedules?.filter(s => s.day_of_week === i) || [])
            .filter(s => facilityFilter === 'all' || s.facility_name === facilityFilter);
    });

    const content = (
                <div className="space-y-6">
                    <div className="flex justify-between items-center">
                        <div>
                            <h1 className="text-3xl font-heading font-bold">Plantilla Semanal</h1>
                            <p className="text-muted-foreground">Define los horarios recurrentes de las clases.</p>
                        </div>
                        {/* <Button variant="outline">
                 Generar ClasesPróximas
            </Button> */}
                    </div>

                    <div className="flex gap-2 flex-wrap">
                        {[
                            { id: 'all', label: 'Todas' },
                            ...(facilities || [])
                                .filter((fac) => /^casa sh/i.test(fac.name))
                                .map((fac) => ({ id: fac.name, label: fac.name.replace(/^Casa Shé\s*/i, '') })),
                        ].map((f) => (
                            <button
                                key={f.id}
                                onClick={() => setFacilityFilter(f.id)}
                                className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-all border ${
                                    facilityFilter === f.id
                                        ? 'bg-primary text-primary-foreground border-primary'
                                        : 'bg-muted text-muted-foreground border-border hover:text-foreground'
                                }`}
                            >
                                {f.label}
                            </button>
                        ))}
                    </div>

                    {!isLoading && schedulesByDay && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-4">
                            {DAYS_OF_WEEK.map((dayName, index) => (
                                <div key={index} className="flex flex-col gap-3 sm:min-w-[140px]">
                                    <div className="font-bold text-center p-2 rounded-t-md bg-muted/50 border-b-2 border-primary/20 sticky top-0">
                                        {dayName}
                                    </div>
                                    <div className="space-y-2 flex-1 min-h-[200px] border rounded-md p-2 bg-muted/10">
                                        {schedulesByDay[index].map((s) => (
                                            <div
                                                key={s.id}
                                                className="relative group p-2 rounded-md border text-sm shadow-sm bg-card hover:shadow-md transition-shadow"
                                                style={{ borderLeftColor: s.class_type_color || '#ccc', borderLeftWidth: '4px' }}
                                            >
                                                <div className="font-semibold flex justify-between">
                                                    <span>{s.start_time?.slice(0,5)} - {s.end_time?.slice(0,5)}</span>
                                                    <button
                                                        onClick={() => {
                                                            if (confirm('¿Eliminar este horario?')) deleteMutation.mutate(s.id);
                                                        }}
                                                        className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
                                                    >
                                                        <X className="h-3 w-3" />
                                                    </button>
                                                </div>
                                                <div className="font-medium truncate" title={s.class_type_name}>{s.class_type_name}</div>
                                                <div className="text-xs text-muted-foreground truncate">{s.instructor_name}</div>
                                                <div className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                                                    <Users className="h-3 w-3" /> {s.max_capacity}
                                                </div>
                                            </div>
                                        ))}
                                        <Button
                                            variant="ghost"
                                            className="w-full text-xs border-dashed border h-8 hover:bg-primary/5 hover:text-primary"
                                            onClick={() => handleAddClass(index)}
                                        >
                                            <Plus className="h-3 w-3 mr-1" /> Agregar
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="bg-warning/10 p-4 rounded-md border border-warning/30 text-sm text-warning-foreground flex gap-2 items-start max-w-2xl">
                        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                        <div>
                            <strong>Nota Importante:</strong> Esta es solo la plantilla. Los cambios aquí afectarán a la generación futura de clases, pero NO modifican las clases que ya han sido generadas y agendadas con fechas específicas en el calendario.
                        </div>
                    </div>

                    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Agregar Horario - {selectedDay !== null && DAYS_OF_WEEK[selectedDay]}</DialogTitle>
                                <DialogDescription>Define una clase recurrente para este día.</DialogDescription>
                            </DialogHeader>

                            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                                <input type="hidden" {...register('dayOfWeek')} />

                                <div className="space-y-2">
                                    <Label>Sucursal *</Label>
                                    <Select value={watch('facilityId') || ''} onValueChange={(val) => setValue('facilityId', val)}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Seleccionar sucursal..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {facilities?.map(f => (
                                                <SelectItem key={f.id} value={f.id}>
                                                    {f.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    {errors.facilityId && <p className="text-xs text-destructive">{errors.facilityId.message}</p>}
                                </div>

                                <div className="space-y-2">
                                    <Label>Tipo de Clase</Label>
                                    <Select onValueChange={(val) => setValue('classTypeId', val)}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Seleccionar tipo..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {classTypes?.map(ct => (
                                                <SelectItem key={ct.id} value={ct.id}>
                                                    {ct.name} ({ct.duration_minutes} min)
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    {errors.classTypeId && <p className="text-xs text-destructive">{errors.classTypeId.message}</p>}
                                </div>

                                <div className="space-y-2">
                                    <Label>Instructor</Label>
                                    <Select onValueChange={(val) => setValue('instructorId', val)}>
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
                                    {errors.instructorId && <p className="text-xs text-destructive">{errors.instructorId.message}</p>}
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label>Inicio</Label>
                                        <TimePicker 
                                            value={watch('startTime')} 
                                            onChange={(val) => setValue('startTime', val)}
                                            placeholder="Hora inicio"
                                            minuteStep={5}
                                        />
                                        {errors.startTime && <p className="text-xs text-destructive">{errors.startTime.message}</p>}
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Fin</Label>
                                        <TimePicker 
                                            value={watch('endTime')} 
                                            onChange={(val) => setValue('endTime', val)}
                                            placeholder="Hora fin"
                                            minuteStep={5}
                                        />
                                        {errors.endTime && <p className="text-xs text-destructive">{errors.endTime.message}</p>}
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label>Capacidad</Label>
                                    <Input type="number" {...register('maxCapacity')} />
                                </div>

                                <DialogFooter>
                                    <Button type="button" variant="ghost" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
                                    <Button type="submit" disabled={isSubmitting}>
                                        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                        Guardar Horario
                                    </Button>
                                </DialogFooter>
                            </form>
                        </DialogContent>
                    </Dialog>

                </div>
    );

    if (embedded) return content;

    return (
        <AuthGuard requiredRoles={['admin', 'super_admin', 'instructor']} allowElevated>
            <AdminLayout>{content}</AdminLayout>
        </AuthGuard>
    );
}
