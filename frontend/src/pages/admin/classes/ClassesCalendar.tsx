import { useState, useEffect, useMemo, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format, startOfWeek, addDays, isSameDay, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import api, { getErrorMessage } from '@/lib/api';
import { CancelBookingDialog } from '@/components/bookings/CancelBookingDialog';
import type { Class, ClassType, Instructor } from '@/types/class';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { useAuthStore } from '@/stores/authStore';

// Type for Facility
interface Facility {
    id: string;
    name: string;
    description: string | null;
    capacity: number;
    is_active: boolean;
}
import { AuthGuard } from '@/components/layout/AuthGuard';
import { Button } from '@/components/ui/button';
import SellPlanDialog from '@/components/memberships/SellPlanDialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { parseLocalDate } from '@/lib/date';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useToast } from '@/components/ui/use-toast';
import {
    Loader2, ChevronLeft, ChevronRight, Calendar as CalendarIcon,
    Plus, Repeat, Users, Trash2, Check, Edit, Phone, Clock, MapPin, Sparkles, X, RotateCcw, Lock, Unlock
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';

const DAYS = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'];

const generateSchema = z.object({
    startDate: z.date(),
    endDate: z.date(),
});

const classSchema = z.object({
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

const editClassSchema = z.object({
    classTypeId: z.string().uuid(),
    instructorId: z.string().uuid(),
    facilityId: z.string().uuid().optional(),
    date: z.date(),
    startTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
    endTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
    maxCapacity: z.coerce.number().int().positive(),
});

type GenerateForm = z.infer<typeof generateSchema>;
type ClassForm = z.infer<typeof classSchema>;
type EditClassForm = z.infer<typeof editClassSchema>;

interface Attendee {
    booking_id: string;
    status: string;
    checked_in_at: string | null;
    waitlist_position: number | null;
    user_id: string;
    display_name: string;
    email: string;
    photo_url: string | null;
    phone: string;
    plan_name: string | null;
    is_free_booking?: boolean;
    booked_by?: string | null;
    booked_by_name?: string | null;
    booked_by_role?: string | null;
}

// "Reservó": si booked_by es la propia alumna (o null) se reservó sola; si difiere, lo hizo ese staff.
function attendeeBookedBy(a: Attendee): string {
    if (!a.booked_by || a.booked_by === a.user_id) return 'la alumna';
    const r = a.booked_by_role;
    const roleEs = r === 'reception' ? 'recepción' : (r === 'admin' || r === 'super_admin') ? 'admin' : r === 'instructor' ? 'coach' : (r || 'staff');
    return `${a.booked_by_name || 'staff'} · ${roleEs}`;
}

interface ClassesCalendarProps {
    initialGenerateOpen?: boolean;
    /** Embebido en otro shell (recepción): no envuelve AuthGuard/AdminLayout. */
    embedded?: boolean;
}

export default function ClassesCalendar({ initialGenerateOpen = false, embedded = false }: ClassesCalendarProps) {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [weekStart, setWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 0 }));
    const [isGenerateOpen, setIsGenerateOpen] = useState(initialGenerateOpen);
    const [isBulkFreeOpen, setIsBulkFreeOpen] = useState(false);
    const [bulkFreeForm, setBulkFreeForm] = useState({
        from_date: '', to_date: '', from_time: '00:00', to_time: '23:59',
        free_label: 'Opening Day - Gratis',
        preview: null as null | number,
    });
    const [isClassOpen, setIsClassOpen] = useState(false);
    const [cancelChoiceOpen, setCancelChoiceOpen] = useState(false);
    const [isEditOpen, setIsEditOpen] = useState(false);
    // "Cambiar coach": diálogo enfocado para reasignar el instructor con alcance (este día / serie / fechas).
    const [isChangeCoachOpen, setIsChangeCoachOpen] = useState(false);
    const [coachToAssign, setCoachToAssign] = useState<string>('');
    const [coachScope, setCoachScope] = useState<'this' | 'series' | 'dates'>('this');
    const [selectedSeriesDates, setSelectedSeriesDates] = useState<Set<string>>(new Set());
    const [isAttendeesOpen, setIsAttendeesOpen] = useState(false);
    const [selectedClass, setSelectedClass] = useState<Class | null>(null);
    const [attendeesTab, setAttendeesTab] = useState<'reservado' | 'espera' | 'cancelado'>('reservado');
    const [classTypeFilter, setClassTypeFilter] = useState<string>('all');
    const [studioFilter, setStudioFilter] = useState<string>('all');
    const [programFilter, setProgramFilter] = useState<string>('all');
    const [instructorFilter, setInstructorFilter] = useState<string>('all');
    const [userSearch, setUserSearch] = useState('');
    const [searchActive, setSearchActive] = useState(false);
    // Invitada (gratis): reserva de cortesía sin plan ni consumo de crédito.
    const [guestFree, setGuestFree] = useState(false);
    // Cliente al que se le ofrece venderle un plan (cuando reservar falló por falta de plan).
    const [sellFor, setSellFor] = useState<{ id: string; name: string } | null>(null);
    const [sellOpen, setSellOpen] = useState(false);
    const { toast } = useToast();
    const queryClient = useQueryClient();
    // Acciones masivas/destructivas (limpiar semana, gratis) solo admin estricto;
    // la recepción master (elevated) ve el resto del CRUD pero NO estas.
    const user = useAuthStore((s) => s.user);
    const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';

    // Deep-link: ?date=YYYY-MM-DD posiciona el calendario en la semana que contiene esa fecha.
    // Se aplica UNA sola vez al entrar (no pelea con la navegación manual del usuario después).
    const [searchParams] = useSearchParams();
    const dateParamApplied = useRef(false);
    useEffect(() => {
        if (dateParamApplied.current) return;
        const param = searchParams.get('date');
        if (!param || !/^\d{4}-\d{2}-\d{2}$/.test(param)) return;
        const [y, m, d] = param.split('-').map(Number);
        const parsed = new Date(y, m - 1, d); // LOCAL, no UTC: evita correrse un día
        if (Number.isNaN(parsed.getTime())) return;
        dateParamApplied.current = true;
        setCurrentDate(parsed);
    }, [searchParams]);

    useEffect(() => {
        setWeekStart(startOfWeek(currentDate, { weekStartsOn: 0 }));
    }, [currentDate]);

    const { data: classTypes } = useQuery<ClassType[]>({
        queryKey: ['class-types'],
        queryFn: async () => (await api.get('/class-types')).data,
    });

    const { data: instructors } = useQuery<Instructor[]>({
        queryKey: ['instructors'],
        queryFn: async () => (await api.get('/instructors')).data,
    });

    const { data: facilities } = useQuery<Facility[]>({
        queryKey: ['facilities'],
        queryFn: async () => (await api.get('/facilities')).data,
    });

    const { data: attendees, isLoading: attendeesLoading, refetch: refetchAttendees } = useQuery<Attendee[]>({
        queryKey: ['attendees', selectedClass?.id],
        queryFn: async () => (await api.get(`/bookings/class/${selectedClass?.id}?include_cancelled=true`)).data,
        enabled: !!selectedClass?.id && isAttendeesOpen,
    });

    const { data: userSearchResults, isFetching: userSearchLoading } = useQuery<{ users: { id: string; display_name: string; email: string; photo_url: string | null }[] }>({
        queryKey: ['user-search', userSearch],
        queryFn: async () => (await api.get(`/users?search=${encodeURIComponent(userSearch)}&limit=8`)).data,
        enabled: searchActive && userSearch.trim().length >= 2,
    });

    const adminBookMutation = useMutation({
        mutationFn: async ({ classId, userId, free }: { classId: string; userId: string; userName?: string; free?: boolean }) =>
            api.post('/bookings/admin-book', { classId, userId, free: free ?? false }),
        onSuccess: () => {
            refetchAttendees();
            queryClient.invalidateQueries({ queryKey: ['classes'] });
            toast({ title: 'Usuario agregado a la clase' });
            setUserSearch('');
            setSearchActive(false);
            setSellFor(null);
            setGuestFree(false);
        },
        onError: (err, vars) => {
            const msg = getErrorMessage(err);
            // Si falló por falta de plan/créditos, ofrecemos venderle un plan ahí mismo.
            if (/membres|cr[eé]dito/i.test(msg)) {
                setSellFor({ id: vars.userId, name: vars.userName ?? '' });
            }
            toast({ variant: 'destructive', title: 'Error', description: msg });
        },
    });

    const startStr = format(weekStart, 'yyyy-MM-dd');
    const endStr = format(addDays(weekStart, 6), 'yyyy-MM-dd');

    const { data: classes } = useQuery<Class[]>({
        queryKey: ['classes', startStr, endStr, studioFilter, programFilter],
        queryFn: async () => {
            const params = new URLSearchParams({ start: startStr, end: endStr });
            if (studioFilter !== 'all') params.set('facility_id', studioFilter);
            if (programFilter !== 'all') params.set('category', programFilter);
            const { data } = await api.get(`/classes?${params.toString()}`);
            return data;
        },
    });

    // Closed days for visual indicator
    const { data: closedDays = [] } = useQuery<{ id: string; date: string; reason: string }[]>({
        queryKey: ['closed-days-range', startStr, endStr],
        queryFn: async () => (await api.get(`/closed-days/range?start=${startStr}&end=${endStr}`)).data,
    });
    const closedDaySet = new Set(closedDays.map(d => d.date));
    const getClosedReason = (day: Date) => closedDays.find(d => d.date === format(day, 'yyyy-MM-dd'))?.reason;

    // Mutations
    const generateMutation = useMutation({
        mutationFn: async (data: GenerateForm) => {
            return await api.post('/classes/generate', {
                startDate: format(data.startDate, 'yyyy-MM-dd'),
                endDate: format(data.endDate, 'yyyy-MM-dd'),
            });
        },
        onSuccess: (data, variables) => {
            queryClient.invalidateQueries({ queryKey: ['classes'] });
            toast({ title: 'Generacion completada', description: `${data.data.count} clases creadas.` });
            setIsGenerateOpen(false);
            setCurrentDate(variables.startDate);
        },
        onError: (err) => toast({ variant: 'destructive', title: 'Error', description: getErrorMessage(err) }),
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
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['classes'] });
            toast({ title: 'Clase creada', description: 'La clase se agrego al calendario.' });
            setIsClassOpen(false);
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
            setIsClassOpen(false);
        },
        onError: (err) => toast({ variant: 'destructive', title: 'Error', description: getErrorMessage(err) }),
    });

    const editMutation = useMutation({
        mutationFn: async (data: EditClassForm & { id: string }) => {
            const { id, ...rest } = data;
            return await api.put(`/classes/${id}`, {
                classTypeId: rest.classTypeId,
                instructorId: rest.instructorId,
                facilityId: rest.facilityId || null,
                date: format(rest.date, 'yyyy-MM-dd'),
                startTime: rest.startTime,
                endTime: rest.endTime,
                maxCapacity: rest.maxCapacity,
            });
        },
        onSuccess: (res: any) => {
            queryClient.invalidateQueries({ queryKey: ['classes'] });
            const warning = res?.data?.payrollWarning;
            if (warning) {
                toast({ variant: 'destructive', title: 'Clase actualizada — revisa la nómina', description: warning });
            } else {
                toast({ title: 'Clase actualizada', description: 'Los cambios se guardaron correctamente.' });
            }
            setIsAttendeesOpen(false);
            setIsEditOpen(false);
            setSelectedClass(null);
        },
        onError: (err) => toast({ variant: 'destructive', title: 'Error', description: getErrorMessage(err) }),
    });

    // Fechas FUTURAS de la misma recurrencia (para el selector de "fechas específicas").
    const { data: seriesDates = [], isLoading: seriesDatesLoading } = useQuery<{ id: string; date: string; instructor_id: string; instructor_name: string }[]>({
        queryKey: ['series-dates', selectedClass?.id],
        queryFn: async () => (await api.get(`/classes/${selectedClass?.id}/series-dates`)).data,
        enabled: !!selectedClass?.id && isChangeCoachOpen && coachScope === 'dates',
    });

    // Reasigna el coach con el alcance elegido. El backend ya NO notifica a nadie.
    const changeInstructorMutation = useMutation({
        mutationFn: async ({ id, instructor_id, scope, dates }: { id: string; instructor_id: string; scope: 'this' | 'series' | 'dates'; dates?: string[] }) =>
            api.post(`/classes/${id}/change-instructor`, { instructor_id, scope, ...(scope === 'dates' ? { dates } : {}) }),
        onSuccess: (res: any) => {
            queryClient.invalidateQueries({ queryKey: ['classes'] });
            queryClient.invalidateQueries({ queryKey: ['series-dates', selectedClass?.id] });
            toast({ title: 'Coach actualizado', description: res?.data?.message });
            setIsChangeCoachOpen(false);
            setIsEditOpen(false);
        },
        onError: (err) => toast({ variant: 'destructive', title: 'Error', description: getErrorMessage(err) }),
    });

    const cancelMutation = useMutation({
        mutationFn: async ({ id, scope }: { id: string; scope: 'one' | 'series' }) =>
            api.delete(`/classes/${id}`, { data: { scope } }),
        onSuccess: (response) => {
            queryClient.invalidateQueries({ queryKey: ['classes'] });
            const data = response.data;
            const desc = data.cancelledClasses != null
                ? `${data.cancelledClasses} clases canceladas · ${data.cancelledBookings || 0} reservas · ${data.refundedCredits || 0} créditos reembolsados.`
                : `${data.cancelledBookings || 0} reservas canceladas, ${data.refundedCredits || 0} créditos reembolsados.`;
            toast({ title: 'Clase cancelada', description: desc });
            setIsAttendeesOpen(false);
            setSelectedClass(null);
            setCancelChoiceOpen(false);
        },
        onError: (err) => toast({ variant: 'destructive', title: 'Error', description: getErrorMessage(err) }),
    });

    const toggleFreeMutation = useMutation({
        mutationFn: async ({ id, is_free, free_label, force }: { id: string; is_free: boolean; free_label?: string; force?: boolean }) =>
            api.patch(`/classes/${id}/free`, { is_free, free_label, force }),
        onSuccess: (_, vars) => {
            queryClient.invalidateQueries({ queryKey: ['classes'] });
            queryClient.invalidateQueries({ queryKey: ['attendees', selectedClass?.id] });
            setSelectedClass((prev) => prev ? { ...prev, is_free: vars.is_free, free_label: vars.free_label || null } : prev);
            toast({ title: vars.is_free ? 'Clase marcada como gratis' : 'Clase ya no es gratis' });
        },
        onError: (err: any) => {
            const code = err?.response?.data?.code;
            if (code === 'HAS_FREE_BOOKINGS') {
                if (confirm('Esta clase ya tiene reservas como gratis. ¿Forzar el cambio? Las reservas se mantienen pero la clase deja de aceptar nuevas como gratis.')) {
                    toggleFreeMutation.mutate({ id: selectedClass!.id, is_free: false, force: true });
                }
                return;
            }
            toast({ variant: 'destructive', title: 'Error', description: getErrorMessage(err) });
        },
    });

    // Cerrar / reabrir el horario para nuevas reservas (candado, sin cancelar la clase).
    const closeBookingsMutation = useMutation({
        mutationFn: async ({ id, closed }: { id: string; closed: boolean }) =>
            api.patch(`/classes/${id}/close-bookings`, { closed }),
        onSuccess: (_, vars) => {
            queryClient.invalidateQueries({ queryKey: ['classes'] });
            setSelectedClass((prev) => prev ? { ...prev, booking_closed: vars.closed } : prev);
            toast({ title: vars.closed ? 'Clase cerrada para nuevas reservas' : 'Clase reabierta' });
        },
        onError: (err: any) => {
            toast({ variant: 'destructive', title: 'Error', description: getErrorMessage(err) });
        },
    });

    const bulkMarkFreeMutation = useMutation({
        mutationFn: async (payload: any) => api.post('/classes/bulk-mark-free', payload),
        onSuccess: (response, variables: any) => {
            queryClient.invalidateQueries({ queryKey: ['classes'] });
            const affected = response.data.affected ?? 0;
            if (variables.dry_run) {
                toast({ title: `${response.data.would_affect} clases serán marcadas` });
            } else {
                toast({ title: `${affected} clases marcadas como gratis` });
            }
        },
        onError: (err) => toast({ variant: 'destructive', title: 'Error', description: getErrorMessage(err) }),
    });

    const checkInMutation = useMutation({
        mutationFn: async (bookingId: string) => {
            return await api.post(`/bookings/${bookingId}/check-in`);
        },
        onSuccess: () => {
            refetchAttendees();
            queryClient.invalidateQueries({ queryKey: ['classes'] });
            toast({ title: 'Check-in realizado', description: 'Asistencia registrada.' });
        },
        onError: (err) => toast({ variant: 'destructive', title: 'Error', description: getErrorMessage(err) }),
    });

    const uncheckInMutation = useMutation({
        mutationFn: async (bookingId: string) => {
            return await api.post(`/bookings/${bookingId}/uncheck-in`);
        },
        onSuccess: () => {
            refetchAttendees();
            queryClient.invalidateQueries({ queryKey: ['classes'] });
            toast({ title: 'Check-in deshecho', description: 'La reserva volvió a estado confirmado.' });
        },
        onError: (err) => toast({ variant: 'destructive', title: 'Error', description: getErrorMessage(err) }),
    });

    const cancelBookingMutation = useMutation({
        mutationFn: async (bookingId: string) => {
            return await api.post(`/bookings/${bookingId}/cancel`);
        },
        onSuccess: () => {
            refetchAttendees();
            queryClient.invalidateQueries({ queryKey: ['classes'] });
            toast({ title: 'Reserva cancelada', description: 'Crédito devuelto si aplicaba.' });
        },
        onError: (err) => toast({ variant: 'destructive', title: 'Error', description: getErrorMessage(err) }),
    });

    // Cancelar reserva confirmada → diálogo con switch de devolución de crédito (estilo Fitune).
    const [cancelBookingId, setCancelBookingId] = useState<string | null>(null);

    const promoteWaitlistMutation = useMutation({
        mutationFn: async (bookingId: string) => api.post(`/bookings/${bookingId}/waitlist-promote`),
        onSuccess: () => {
            refetchAttendees();
            queryClient.invalidateQueries({ queryKey: ['classes'] });
            toast({ title: 'Movido a reservados', description: 'Se promovió desde la lista de espera.' });
        },
        onError: (err) => toast({ variant: 'destructive', title: 'Error', description: getErrorMessage(err) }),
    });

    // Forms
    // Calculate next full week (Sunday to Saturday)
    const nextSunday = startOfWeek(addDays(new Date(), 7), { weekStartsOn: 0 });
    const nextSaturday = addDays(nextSunday, 6);

    const generateForm = useForm<GenerateForm>({
        resolver: zodResolver(generateSchema),
        defaultValues: {
            startDate: nextSunday,
            endDate: nextSaturday
        }
    });

    const classForm = useForm<ClassForm>({
        resolver: zodResolver(classSchema),
        defaultValues: { maxCapacity: 6 }
    });

    const editForm = useForm<EditClassForm>({
        resolver: zodResolver(editClassSchema),
    });

    const handlePrevWeek = () => setCurrentDate(addDays(currentDate, -7));
    const handleNextWeek = () => setCurrentDate(addDays(currentDate, 7));
    const handleToday = () => setCurrentDate(new Date());

    const handleDayClick = (day: Date) => {
        classForm.reset({
            date: day,
            maxCapacity: 6,
            startTime: '09:00',
            endTime: '10:00',
            recurring: false,
            weekdays: [day.getDay()],
            endDate: undefined,
        });
        setIsClassOpen(true);
    };

    const handleClassClick = (c: Class) => {
        setSelectedClass(c);
        setIsAttendeesOpen(true);
    };

    const handleEditClass = () => {
        if (!selectedClass) return;
        editForm.reset({
            classTypeId: selectedClass.class_type_id || '',
            instructorId: selectedClass.instructor_id || '',
            facilityId: selectedClass.facility_id || undefined,
            date: parseISO((selectedClass.date || '').split('T')[0] + 'T00:00:00'),
            startTime: selectedClass.start_time,
            endTime: selectedClass.end_time,
            maxCapacity: selectedClass.max_capacity,
        });
        setIsEditOpen(true);
    };

    const handleChangeCoach = () => {
        if (!selectedClass) return;
        setCoachToAssign(selectedClass.instructor_id || '');
        setCoachScope('this');
        setSelectedSeriesDates(new Set());
        setIsChangeCoachOpen(true);
    };

    const getClassesForDay = (day: Date) => {
        return classes?.filter(c => {
            const dateStr = (c.date || '').split('T')[0];
            const dateMatch = isSameDay(parseISO(dateStr + 'T00:00:00'), day);
            const typeMatch = classTypeFilter === 'all' || c.class_type_id === classTypeFilter;
            const studioMatch = studioFilter === 'all' || c.facility_id === studioFilter;
            const instructorMatch = instructorFilter === 'all' || c.instructor_id === instructorFilter;
            return dateMatch && typeMatch && studioMatch && instructorMatch;
        }) || [];
    };

    const getInitials = (name: string) => {
        return name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '??';
    };

    // Asistentes divididos por estado para las pestañas estilo Fitune.
    const reservados = attendees?.filter(a => !['waitlist', 'cancelled'].includes(a.status)) ?? [];
    const enEspera = attendees?.filter(a => a.status === 'waitlist') ?? [];
    const cancelados = attendees?.filter(a => a.status === 'cancelled') ?? [];
    const classDurationMin = selectedClass?.start_time && selectedClass?.end_time
        ? Math.max(0,
            (parseInt(selectedClass.end_time.slice(0, 2)) * 60 + parseInt(selectedClass.end_time.slice(3, 5))) -
            (parseInt(selectedClass.start_time.slice(0, 2)) * 60 + parseInt(selectedClass.start_time.slice(3, 5))))
        : 0;

    const renderAttendee = (attendee: Attendee, mode: 'reservado' | 'espera' | 'cancelado') => (
        <div
            key={attendee.booking_id}
            className={cn(
                "flex items-center justify-between gap-2 rounded-lg border p-3",
                attendee.status === 'checked_in' && "border-success/30 bg-success/10",
                mode === 'cancelado' && "opacity-70",
            )}
        >
            <div className="flex min-w-0 items-center gap-3">
                <Link to={`/admin/members/${attendee.user_id}`}>
                    <Avatar className="cursor-pointer transition-shadow hover:ring-2 hover:ring-primary">
                        <AvatarImage src={attendee.photo_url || undefined} />
                        <AvatarFallback>{getInitials(attendee.display_name)}</AvatarFallback>
                    </Avatar>
                </Link>
                <div className="min-w-0">
                    <p className="truncate font-medium">{attendee.display_name}</p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                        {attendee.is_free_booking
                            ? <Badge variant="outline" className="text-[10px] border-balance-gold/50 text-balance-gold">Invitada</Badge>
                            : attendee.plan_name && <Badge variant="outline" className="text-[10px]">{attendee.plan_name}</Badge>}
                        {mode === 'espera' && attendee.waitlist_position != null && (
                            <span className="font-medium text-balance-olive">#{attendee.waitlist_position} en espera</span>
                        )}
                        {attendee.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{attendee.phone}</span>}
                    </div>
                    <p className="mt-0.5 text-[11px] text-muted-foreground/75">Reservó: {attendeeBookedBy(attendee)}</p>
                </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
                {mode === 'reservado' && attendee.status === 'checked_in' && (
                    <>
                        <Badge className="bg-success"><Check className="mr-1 h-3 w-3" />Asistió</Badge>
                        <Button
                            size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground" title="Deshacer check-in"
                            onClick={() => { if (confirm('¿Deshacer el check-in? La reserva volverá a confirmada.')) uncheckInMutation.mutate(attendee.booking_id); }}
                            disabled={uncheckInMutation.isPending}
                        >
                            <RotateCcw className="h-4 w-4" />
                        </Button>
                    </>
                )}
                {mode === 'reservado' && attendee.status !== 'checked_in' && (
                    <>
                        <Button
                            size="icon" className="h-9 w-9 bg-success hover:bg-success/90" title="Marcar asistencia"
                            onClick={() => checkInMutation.mutate(attendee.booking_id)} disabled={checkInMutation.isPending}
                        >
                            {checkInMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                        </Button>
                        <Button
                            size="icon" variant="outline" className="h-9 w-9 text-destructive hover:bg-destructive/10" title="Cancelar reserva"
                            onClick={() => setCancelBookingId(attendee.booking_id)}
                            disabled={cancelBookingMutation.isPending}
                        >
                            <X className="h-4 w-4" />
                        </Button>
                    </>
                )}
                {mode === 'espera' && (
                    <Button
                        size="sm" variant="outline" title="Promover a reservados"
                        onClick={() => promoteWaitlistMutation.mutate(attendee.booking_id)} disabled={promoteWaitlistMutation.isPending}
                    >
                        Promover
                    </Button>
                )}
                {mode === 'cancelado' && <Badge variant="secondary">Cancelada</Badge>}
            </div>
        </div>
    );

    const bulkDeleteMutation = useMutation({
        mutationFn: async () => {
            return await api.post('/classes/bulk-delete', {
                startDate: startStr,
                endDate: endStr
            });
        },
        onSuccess: (res) => {
            queryClient.invalidateQueries({ queryKey: ['classes'] });
            toast({
                title: 'Calendario limpiado',
                description: res.data.message
            });
        },
        onError: (err) => toast({ variant: 'destructive', title: 'Error', description: getErrorMessage(err) }),
    });

    const weekDays = Array.from({ length: 7 }).map((_, i) => addDays(weekStart, i));
    const activeClasses = classes?.filter((c) => c.status !== 'cancelled') || [];

    // Sucursales BMB (de facilities). El calendario muestra UNA a la vez (toggle).
    const bmbStudios = useMemo(
        () => (facilities || [])
            .filter((f) => /^casa sh/i.test(f.name))
            .map((f) => ({ id: f.id, name: f.name, short: f.name.replace(/^Casa Shé\s*/i, '') })),
        [facilities]
    );

    // Default: primera sucursal en cuanto cargan (en vez de 'all', que amontona ambas).
    useEffect(() => {
        if (bmbStudios.length && !bmbStudios.some((s) => s.id === studioFilter)) {
            setStudioFilter(bmbStudios[0].id);
        }
    }, [bmbStudios, studioFilter]);

    const totalBookings = activeClasses.reduce((sum, c) => sum + Number(c.current_bookings || 0), 0);
    const totalCapacity = activeClasses.reduce((sum, c) => sum + Number(c.max_capacity || 0), 0);
    const openSpots = Math.max(totalCapacity - totalBookings, 0);
    const weekRange = `${format(weekStart, 'd MMM', { locale: es })} al ${format(addDays(weekStart, 6), 'd MMM yyyy', { locale: es })}`;
    const occupancy = totalCapacity > 0 ? Math.round((totalBookings / totalCapacity) * 100) : 0;

    const content = (
                <div className="space-y-5">
                    <section className="overflow-hidden rounded-[2rem] border border-balance-olive/25 bg-balance-olive/10 shadow-[0_22px_72px_-58px_rgba(51,42,34,0.75)]">
                        <div className="flex flex-col gap-5 p-5 lg:flex-row lg:items-end lg:justify-between">
                            <div className="min-w-0">
                                <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-balance-olive/25 bg-balance-cream/55 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-balance-olive">
                                    <Sparkles className="h-3.5 w-3.5" />
                                    Semana activa
                                </div>
                                <h1 className="text-3xl font-heading font-bold capitalize">
                                    {format(currentDate, 'MMMM yyyy', { locale: es })}
                                </h1>
                                <p className="mt-1 text-sm text-balance-dark/62">{weekRange}</p>
                            </div>

                            <div className="space-y-3 lg:min-w-[29rem]">
                                <div className="grid gap-3 sm:grid-cols-3">
                                    <CalendarStat label="Clases" value={activeClasses.length} />
                                    <CalendarStat label="Reservas" value={totalBookings} />
                                    <CalendarStat label="Cupos libres" value={openSpots} />
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-col gap-3 border-t border-balance-olive/18 bg-balance-cream/36 p-4 xl:flex-row xl:items-center xl:justify-between">
                            <div className="flex flex-wrap items-center gap-2">
                                <div className="flex items-center overflow-hidden rounded-full border border-balance-sand/65 bg-balance-cream/75">
                                    <Button variant="ghost" size="icon" className="rounded-full" onClick={handlePrevWeek}>
                                        <ChevronLeft className="h-4 w-4" />
                                    </Button>
                                    <Button variant="ghost" className="rounded-full px-4 font-semibold" onClick={handleToday}>
                                        Hoy
                                    </Button>
                                    <Button variant="ghost" size="icon" className="rounded-full" onClick={handleNextWeek}>
                                        <ChevronRight className="h-4 w-4" />
                                    </Button>
                                </div>
                                <Badge variant="outline" className="rounded-full border-balance-olive/30 bg-balance-olive/10 px-3 py-1 text-balance-olive">
                                    {occupancy}% ocupación
                                </Badge>
                                {bmbStudios.length > 0 && (
                                    <div className="inline-flex items-center rounded-full border border-balance-olive/30 bg-balance-cream/75 p-1">
                                        {bmbStudios.map((s) => (
                                            <button
                                                key={s.id}
                                                type="button"
                                                onClick={() => setStudioFilter(s.id)}
                                                aria-pressed={studioFilter === s.id}
                                                className={cn(
                                                    'rounded-full px-4 py-1.5 text-sm font-semibold transition-colors',
                                                    studioFilter === s.id
                                                        ? 'bg-balance-olive text-balance-cream'
                                                        : 'text-balance-dark/60 hover:text-balance-olive'
                                                )}
                                            >
                                                {s.short || s.name}
                                            </button>
                                        ))}
                                    </div>
                                )}
                                <Select value={programFilter} onValueChange={setProgramFilter}>
                                    <SelectTrigger className="w-[150px]"><SelectValue placeholder="Programa" /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">Todos los programas</SelectItem>
                                        <SelectItem value="reformer">Reformer</SelectItem>
                                        <SelectItem value="multi">Multiclases</SelectItem>
                                    </SelectContent>
                                </Select>
                                {classTypes && classTypes.length > 0 && (
                                    <Select value={classTypeFilter} onValueChange={setClassTypeFilter}>
                                        <SelectTrigger className="w-[170px]"><SelectValue placeholder="Clase" /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">Todas las clases</SelectItem>
                                            {classTypes.map(ct => (
                                                <SelectItem key={ct.id} value={ct.id}>
                                                    <span className="flex items-center gap-2">
                                                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: ct.color || '#7E8579' }} />
                                                        {ct.name}
                                                    </span>
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                )}
                                {instructors && instructors.length > 0 && (
                                    <Select value={instructorFilter} onValueChange={setInstructorFilter}>
                                        <SelectTrigger className="w-[170px]"><SelectValue placeholder="Instructor" /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">Todos los instructores</SelectItem>
                                            {instructors.map(inst => (
                                                <SelectItem key={inst.id} value={inst.id}>{inst.display_name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                )}
                            </div>

                            <div className="flex flex-wrap gap-2">
                                {isAdmin && (
                                    <Button
                                        variant="outline"
                                        className="border-destructive/20 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                        onClick={() => {
                                            if (confirm('¿Borrar todas las clases vacías de esta semana visible?')) {
                                                bulkDeleteMutation.mutate();
                                            }
                                        }}
                                        disabled={bulkDeleteMutation.isPending}
                                    >
                                        <Trash2 className="mr-2 h-4 w-4" />
                                        {bulkDeleteMutation.isPending ? 'Borrando...' : 'Limpiar semana'}
                                    </Button>
                                )}

                                <Button variant="outline" className="border-balance-sand/70 bg-balance-cream/70" onClick={() => setIsGenerateOpen(true)}>
                                    <Repeat className="mr-2 h-4 w-4" /> Generar semana
                                </Button>
                                {isAdmin && (
                                    <Button variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100" onClick={() => setIsBulkFreeOpen(true)}>
                                        <Sparkles className="mr-2 h-4 w-4" /> Marcar como gratis
                                    </Button>
                                )}
                                <Button className="bg-balance-olive text-balance-cream hover:bg-balance-olive/90" onClick={() => handleDayClick(new Date())}>
                                    <Plus className="mr-2 h-4 w-4" /> Nueva clase
                                </Button>
                            </div>
                        </div>
                    </section>


                    <div className="overflow-hidden rounded-[1.75rem] border border-balance-sand/65 bg-[hsl(var(--admin-panel))] shadow-[0_22px_72px_-58px_rgba(51,42,34,0.75)]">
                        <div className="overflow-x-auto">
                            <div className="min-w-[980px]">
                                <div className="grid grid-cols-7 border-b border-balance-sand/60 bg-balance-cream/55">
                                    {weekDays.map((day, i) => {
                                        const isToday = isSameDay(day, new Date());
                                        const isClosed = closedDaySet.has(format(day, 'yyyy-MM-dd'));
                                        const dayClasses = getClassesForDay(day);
                                        return (
                                            <button
                                                key={format(day, 'yyyy-MM-dd')}
                                                type="button"
                                                onClick={() => handleDayClick(day)}
                                                className={cn(
                                                    'min-h-[6.75rem] border-r border-balance-sand/55 p-4 text-left transition-colors last:border-r-0 hover:bg-balance-olive/8',
                                                    isToday && 'bg-balance-olive/12',
                                                    isClosed && 'bg-destructive/5'
                                                )}
                                            >
                                                <div className="flex items-start justify-between gap-2">
                                                    <div>
                                                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-balance-dark/50">{DAYS[i]}</p>
                                                        <div className="mt-2 flex items-center gap-2">
                                                            <span className={cn(
                                                                'flex h-10 w-10 items-center justify-center rounded-full text-xl font-semibold tabular-nums text-balance-dark',
                                                                isToday && 'bg-balance-olive text-balance-cream'
                                                            )}>
                                                                {format(day, 'd')}
                                                            </span>
                                                            {isClosed && (
                                                                <Badge variant="destructive" className="rounded-full text-[10px]">Cerrado</Badge>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <span className="rounded-full bg-balance-cream px-2.5 py-1 text-[11px] font-semibold text-balance-dark/58">
                                                        {dayClasses.length} clase{dayClasses.length === 1 ? '' : 's'}
                                                    </span>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>

                                <div className="grid grid-cols-7">
                                    {weekDays.map((day) => {
                                        const dayClasses = getClassesForDay(day);
                                        const isClosed = closedDaySet.has(format(day, 'yyyy-MM-dd'));
                                        const closedReason = getClosedReason(day);
                                        return (
                                            <div
                                                key={format(day, 'yyyy-MM-dd')}
                                                className={cn(
                                                    'min-h-[34rem] border-r border-balance-sand/55 bg-balance-cream/18 p-3 last:border-r-0',
                                                    isClosed && 'bg-destructive/5'
                                                )}
                                            >
                                                {isClosed && (
                                                    <div className="mb-3 rounded-[1rem] border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
                                                        {closedReason || 'Studio cerrado'}
                                                    </div>
                                                )}

                                                <div className="space-y-2.5">
                                                    {dayClasses.map(c => (
                                                        <ClassEventCard key={c.id} item={c} onClick={() => handleClassClick(c)} />
                                                    ))}
                                                </div>

                                                {dayClasses.length === 0 && !isClosed && (
                                                    <button
                                                        type="button"
                                                        className="mt-2 flex min-h-[10rem] w-full flex-col items-center justify-center rounded-[1.1rem] border border-dashed border-balance-sand/70 bg-balance-cream/35 text-center text-balance-dark/48 transition-colors hover:border-balance-olive/40 hover:bg-balance-olive/8 hover:text-balance-olive"
                                                        onClick={() => handleDayClick(day)}
                                                    >
                                                        <Plus className="mb-2 h-4 w-4" />
                                                        <span className="text-xs font-semibold">Agregar clase</span>
                                                    </button>
                                                )}

                                                {dayClasses.length > 0 && (
                                                    <Button
                                                        variant="ghost"
                                                        className="mt-3 h-9 w-full rounded-full border border-dashed border-balance-sand/65 text-xs text-balance-dark/55 hover:border-balance-olive/40 hover:bg-balance-olive/8 hover:text-balance-olive"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleDayClick(day);
                                                        }}
                                                    >
                                                        <Plus className="mr-1.5 h-3.5 w-3.5" />
                                                        Agregar
                                                    </Button>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Attendees Sheet */}
                    <Sheet open={isAttendeesOpen && !!selectedClass} onOpenChange={(open) => { setIsAttendeesOpen(open); if (!open) setSelectedClass(null); }}>
                        <SheetContent className="w-full overflow-y-auto p-0 sm:max-w-lg">
                            {/* ── Encabezado estilo Fitune: info de la clase ── */}
                            <div className="border-b border-balance-sand/50 bg-balance-cream/40 p-5">
                                <SheetHeader className="space-y-0 text-left">
                                    <SheetTitle className="flex flex-wrap items-center gap-2 text-xl">
                                        {selectedClass?.class_type_name}
                                        {selectedClass?.status === 'cancelled' && (
                                            <Badge variant="destructive">Cancelada</Badge>
                                        )}
                                        {selectedClass?.is_free && (
                                            <Badge className="bg-emerald-600 text-white">{selectedClass.free_label || 'Gratis'}</Badge>
                                        )}
                                    </SheetTitle>
                                    <SheetDescription className="sr-only">Detalle de la clase y asistentes</SheetDescription>
                                </SheetHeader>
                                <div className="mt-4 space-y-2.5 text-sm text-balance-dark">
                                    <div className="flex items-center gap-3">
                                        <CalendarIcon className="h-4 w-4 shrink-0 text-balance-olive" />
                                        <span className="capitalize">
                                            {selectedClass && format(parseISO((selectedClass.date || '').split('T')[0] + 'T00:00:00'), "EEEE d 'de' MMMM", { locale: es })}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <Clock className="h-4 w-4 shrink-0 text-balance-olive" />
                                        <span>{selectedClass?.start_time?.slice(0, 5)} – {selectedClass?.end_time?.slice(0, 5)}</span>
                                        {classDurationMin > 0 && <span className="text-muted-foreground">· {classDurationMin} min</span>}
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <Users className="h-4 w-4 shrink-0 text-balance-olive" />
                                        <span>{selectedClass?.instructor_name || 'Coach por confirmar'}</span>
                                    </div>
                                    {selectedClass?.facility_name && (
                                        <div className="flex items-center gap-3">
                                            <MapPin className="h-4 w-4 shrink-0 text-balance-olive" />
                                            <span>{selectedClass.facility_name}</span>
                                        </div>
                                    )}
                                    <div className="flex items-center gap-3">
                                        <Sparkles className="h-4 w-4 shrink-0 text-balance-olive" />
                                        <span>{selectedClass?.current_bookings ?? 0} / {selectedClass?.max_capacity ?? 0} lugares</span>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-5 p-5">

                                {/* Actions */}
                                {selectedClass?.status !== 'cancelled' && (
                                    <div className="flex gap-2">
                                        <Button variant="outline" className="flex-1" onClick={handleEditClass}>
                                            <Edit className="mr-2 h-4 w-4" /> Editar
                                        </Button>
                                        <Button
                                            variant="destructive"
                                            className="flex-1"
                                            onClick={() => setCancelChoiceOpen(true)}
                                        >
                                            <Trash2 className="mr-2 h-4 w-4" /> Cancelar Clase
                                        </Button>
                                    </div>
                                )}

                                {/* Cerrar / reabrir el horario (candado de reservas, sin cancelar) */}
                                {selectedClass && selectedClass.status !== 'cancelled' && (
                                    selectedClass.booking_closed ? (
                                        <div className="flex items-center justify-between gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3">
                                            <div className="flex items-center gap-2 text-sm text-amber-800">
                                                <Lock className="h-4 w-4 shrink-0" />
                                                <span>Cerrada — no entran nuevas reservas.</span>
                                            </div>
                                            <Button variant="outline" size="sm" className="shrink-0" disabled={closeBookingsMutation.isPending}
                                                onClick={() => closeBookingsMutation.mutate({ id: selectedClass.id, closed: false })}>
                                                <Unlock className="mr-1 h-3 w-3" /> Reabrir
                                            </Button>
                                        </div>
                                    ) : (
                                        <Button variant="outline" className="w-full text-muted-foreground" disabled={closeBookingsMutation.isPending}
                                            onClick={() => closeBookingsMutation.mutate({ id: selectedClass.id, closed: true })}>
                                            <Lock className="mr-2 h-4 w-4" /> Cerrar cupo (no entran nuevas reservas)
                                        </Button>
                                    )
                                )}

                                {/* Free class toggle (admin/super_admin) */}
                                {isAdmin && selectedClass?.status !== 'cancelled' && (
                                    <div className={`rounded-xl border p-3 ${selectedClass?.is_free ? 'border-emerald-300 bg-emerald-50' : 'border-balance-sand/55 bg-balance-cream/45'}`}>
                                        <div className="flex items-center justify-between mb-2">
                                            <div>
                                                <p className="text-sm font-semibold">Clase gratis</p>
                                                <p className="text-[11px] text-muted-foreground">
                                                    Sin cobro, sin descontar crédito. Usuarios sin paquete pueden reservar.
                                                </p>
                                            </div>
                                            <Switch
                                                checked={!!selectedClass?.is_free}
                                                onCheckedChange={(v) => {
                                                    if (!selectedClass) return;
                                                    toggleFreeMutation.mutate({
                                                        id: selectedClass.id,
                                                        is_free: v,
                                                        free_label: v ? (selectedClass.free_label || 'Clase gratis') : undefined,
                                                    });
                                                }}
                                                disabled={toggleFreeMutation.isPending}
                                            />
                                        </div>
                                        {selectedClass?.is_free && (
                                            <div className="flex items-center gap-2 mt-2">
                                                <Input
                                                    placeholder="Etiqueta visible (ej. Opening Day)"
                                                    defaultValue={selectedClass.free_label || ''}
                                                    onBlur={(e) => {
                                                        const v = e.target.value.trim() || 'Clase gratis';
                                                        if (v !== selectedClass.free_label) {
                                                            toggleFreeMutation.mutate({
                                                                id: selectedClass.id,
                                                                is_free: true,
                                                                free_label: v,
                                                            });
                                                        }
                                                    }}
                                                    className="h-8 text-xs"
                                                />
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Add user to class */}
                                {selectedClass?.status !== 'cancelled' && (
                                    <div className="rounded-xl border border-balance-sand/55 bg-balance-cream/45 p-3 space-y-2">
                                        <p className="text-sm font-semibold">Agregar usuario a la clase</p>
                                        {sellFor && (
                                            <div className="flex items-center justify-between gap-2 rounded-lg border border-balance-gold/40 bg-balance-gold/10 p-2.5">
                                                <p className="text-xs text-balance-gold">
                                                    {sellFor.name || 'Esta clienta'} no tiene plan con créditos.
                                                </p>
                                                <Button size="sm" className="h-7 shrink-0" onClick={() => setSellOpen(true)}>
                                                    Vender plan
                                                </Button>
                                            </div>
                                        )}
                                        <SellPlanDialog
                                            userId={sellFor?.id ?? ''}
                                            userName={sellFor?.name}
                                            open={sellOpen}
                                            onOpenChange={setSellOpen}
                                            onSold={() => {
                                                if (sellFor && selectedClass) {
                                                    adminBookMutation.mutate({ classId: selectedClass.id, userId: sellFor.id, userName: sellFor.name });
                                                }
                                            }}
                                        />
                                        <label className="flex items-start gap-2 cursor-pointer select-none">
                                            <input
                                                type="checkbox"
                                                checked={guestFree}
                                                onChange={(e) => setGuestFree(e.target.checked)}
                                                className="mt-0.5 h-3.5 w-3.5 rounded border-input accent-balance-gold"
                                            />
                                            <span className="text-[11px] leading-tight">
                                                <span className="font-medium text-balance-dark">Invitada (gratis, sin descontar crédito)</span>
                                                <span className="block text-muted-foreground">No requiere plan.</span>
                                            </span>
                                        </label>
                                        <div className="relative">
                                            <Input
                                                placeholder="Buscar por nombre o email..."
                                                value={userSearch}
                                                onChange={(e) => {
                                                    setUserSearch(e.target.value);
                                                    setSearchActive(true);
                                                }}
                                                className="h-8 text-xs"
                                            />
                                        </div>
                                        {searchActive && userSearch.trim().length >= 2 && (
                                            <div className="space-y-1 max-h-48 overflow-y-auto">
                                                {userSearchLoading && (
                                                    <div className="flex justify-center py-3">
                                                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                                    </div>
                                                )}
                                                {!userSearchLoading && userSearchResults?.users?.length === 0 && (
                                                    <p className="py-2 text-center text-xs text-muted-foreground">Sin resultados</p>
                                                )}
                                                {userSearchResults?.users?.map(u => (
                                                    <button
                                                        key={u.id}
                                                        type="button"
                                                        disabled={adminBookMutation.isPending}
                                                        onClick={() => {
                                                            if (!selectedClass) return;
                                                            adminBookMutation.mutate({ classId: selectedClass.id, userId: u.id, userName: u.display_name, free: guestFree });
                                                        }}
                                                        className="flex w-full items-center gap-3 rounded-lg border border-transparent px-2 py-1.5 text-left text-xs hover:border-balance-olive/30 hover:bg-balance-olive/8 disabled:opacity-50"
                                                    >
                                                        <Avatar className="h-6 w-6 shrink-0">
                                                            <AvatarImage src={u.photo_url || undefined} />
                                                            <AvatarFallback className="text-[9px]">{getInitials(u.display_name)}</AvatarFallback>
                                                        </Avatar>
                                                        <div className="min-w-0">
                                                            <p className="font-medium truncate">{u.display_name}</p>
                                                            <p className="text-muted-foreground truncate">{u.email}</p>
                                                        </div>
                                                        {adminBookMutation.isPending ? (
                                                            <Loader2 className="ml-auto h-3 w-3 animate-spin shrink-0" />
                                                        ) : (
                                                            <Plus className="ml-auto h-3 w-3 shrink-0 text-balance-olive opacity-0 group-hover:opacity-100" />
                                                        )}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* ── Asistentes: pestañas Reservado / Lista de espera / Cancelado ── */}
                                <Tabs value={attendeesTab} onValueChange={(v) => setAttendeesTab(v as 'reservado' | 'espera' | 'cancelado')}>
                                    <TabsList className="grid w-full grid-cols-3">
                                        <TabsTrigger value="reservado">Reservado <span className="ml-1.5 text-xs opacity-70">{reservados.length}</span></TabsTrigger>
                                        <TabsTrigger value="espera">Espera <span className="ml-1.5 text-xs opacity-70">{enEspera.length}</span></TabsTrigger>
                                        <TabsTrigger value="cancelado">Cancelado <span className="ml-1.5 text-xs opacity-70">{cancelados.length}</span></TabsTrigger>
                                    </TabsList>

                                    {attendeesLoading ? (
                                        <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
                                    ) : (
                                        <>
                                            <TabsContent value="reservado" className="mt-4 space-y-2.5">
                                                {reservados.length === 0
                                                    ? <p className="py-8 text-center text-sm text-muted-foreground">Sin reservas todavía.</p>
                                                    : reservados.map((a) => renderAttendee(a, 'reservado'))}
                                            </TabsContent>
                                            <TabsContent value="espera" className="mt-4 space-y-2.5">
                                                {enEspera.length === 0
                                                    ? <p className="py-8 text-center text-sm text-muted-foreground">Nadie en lista de espera.</p>
                                                    : enEspera.map((a) => renderAttendee(a, 'espera'))}
                                            </TabsContent>
                                            <TabsContent value="cancelado" className="mt-4 space-y-2.5">
                                                {cancelados.length === 0
                                                    ? <p className="py-8 text-center text-sm text-muted-foreground">Sin cancelaciones.</p>
                                                    : cancelados.map((a) => renderAttendee(a, 'cancelado'))}
                                            </TabsContent>
                                        </>
                                    )}
                                </Tabs>
                            </div>
                        </SheetContent>
                    </Sheet>

                    {/* Generate Dialog */}
                    <Dialog open={isGenerateOpen} onOpenChange={setIsGenerateOpen}>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Generar Clases</DialogTitle>
                                <DialogDescription>
                                    Crea clases masivamente usando la Plantilla Semanal.
                                    Las clases existentes no se duplicaran.
                                </DialogDescription>
                            </DialogHeader>
                            <form onSubmit={generateForm.handleSubmit(d => generateMutation.mutate(d))} className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label>Fecha Inicio</Label>
                                        <Popover>
                                            <PopoverTrigger asChild>
                                                <Button variant="outline" className="w-full justify-start text-left font-normal">
                                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                                    {format(generateForm.watch('startDate'), 'P', { locale: es })}
                                                </Button>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-auto p-0">
                                                <Calendar
                                                    mode="single"
                                                    selected={generateForm.watch('startDate')}
                                                    onSelect={(d) => d && generateForm.setValue('startDate', d)}
                                                />
                                            </PopoverContent>
                                        </Popover>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Fecha Fin</Label>
                                        <Popover>
                                            <PopoverTrigger asChild>
                                                <Button variant="outline" className="w-full justify-start text-left font-normal">
                                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                                    {format(generateForm.watch('endDate'), 'P', { locale: es })}
                                                </Button>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-auto p-0">
                                                <Calendar
                                                    mode="single"
                                                    selected={generateForm.watch('endDate')}
                                                    onSelect={(d) => d && generateForm.setValue('endDate', d)}
                                                />
                                            </PopoverContent>
                                        </Popover>
                                    </div>
                                </div>
                                <DialogFooter>
                                    <Button type="button" variant="ghost" onClick={() => setIsGenerateOpen(false)}>Cancelar</Button>
                                    <Button type="submit" disabled={generateMutation.isPending}>
                                        {generateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                        Generar
                                    </Button>
                                </DialogFooter>
                            </form>
                        </DialogContent>
                    </Dialog>

                    {/* Create Class Dialog */}
                    <Dialog open={isClassOpen} onOpenChange={setIsClassOpen}>
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
                                    <Button type="button" variant="ghost" onClick={() => setIsClassOpen(false)}>Cancelar</Button>
                                    <Button type="submit" disabled={createMutation.isPending || recurringMutation.isPending}>
                                        {(createMutation.isPending || recurringMutation.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                        {classForm.watch('recurring') ? 'Crear clases' : 'Crear Clase'}
                                    </Button>
                                </DialogFooter>
                            </form>
                        </DialogContent>
                    </Dialog>

                    {/* Edit Class Dialog */}
                    <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Editar Clase</DialogTitle>
                                <DialogDescription>Modifica los detalles de la clase.</DialogDescription>
                            </DialogHeader>
                            <form onSubmit={editForm.handleSubmit(d => selectedClass && editMutation.mutate({ ...d, id: selectedClass.id }))} className="space-y-4">
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
                                            onClick={handleChangeCoach}
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
                                    <Label>Capacidad</Label>
                                    <Input type="number" {...editForm.register('maxCapacity')} />
                                </div>

                                <DialogFooter>
                                    <Button type="button" variant="ghost" onClick={() => setIsEditOpen(false)}>Cancelar</Button>
                                    <Button type="submit" disabled={editMutation.isPending}>
                                        {editMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                        Guardar Cambios
                                    </Button>
                                </DialogFooter>
                            </form>
                        </DialogContent>
                    </Dialog>

                    {/* Bulk mark free dialog */}
                    <Dialog open={isBulkFreeOpen} onOpenChange={setIsBulkFreeOpen}>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle className="flex items-center gap-2">
                                    <Sparkles className="h-5 w-5 text-emerald-600" />
                                    Marcar clases como gratis
                                </DialogTitle>
                                <DialogDescription>
                                    Útil para opening day o cortesías. Las clases en el rango quedan sin cobro y permiten reservar sin paquete.
                                </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-3">
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <Label className="text-xs">Desde fecha</Label>
                                        <Input
                                            type="date"
                                            value={bulkFreeForm.from_date}
                                            onChange={(e) => setBulkFreeForm(p => ({ ...p, from_date: e.target.value, preview: null }))}
                                        />
                                    </div>
                                    <div>
                                        <Label className="text-xs">Hasta fecha</Label>
                                        <Input
                                            type="date"
                                            value={bulkFreeForm.to_date}
                                            onChange={(e) => setBulkFreeForm(p => ({ ...p, to_date: e.target.value, preview: null }))}
                                        />
                                    </div>
                                </div>
                                <div className="rounded-lg border border-balance-sand/55 bg-balance-cream/40 p-3 space-y-2">
                                    <div className="flex items-center justify-between">
                                        <Label className="text-xs font-semibold">Filtro de horario de clase</Label>
                                        <button
                                            type="button"
                                            className="text-[11px] font-semibold text-emerald-700 underline underline-offset-2"
                                            onClick={() => setBulkFreeForm(p => ({ ...p, from_time: '00:00', to_time: '23:59', preview: null }))}
                                        >
                                            Todo el día
                                        </button>
                                    </div>
                                    <p className="text-[11px] text-balance-dark/55">Solo las clases cuyo horario de inicio esté dentro de este rango quedarán gratis.</p>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <Label className="text-xs">Clase empieza desde</Label>
                                            <Input
                                                type="time"
                                                value={bulkFreeForm.from_time}
                                                onChange={(e) => setBulkFreeForm(p => ({ ...p, from_time: e.target.value, preview: null }))}
                                            />
                                        </div>
                                        <div>
                                            <Label className="text-xs">Clase empieza hasta</Label>
                                            <Input
                                                type="time"
                                                value={bulkFreeForm.to_time}
                                                onChange={(e) => setBulkFreeForm(p => ({ ...p, to_time: e.target.value, preview: null }))}
                                            />
                                        </div>
                                    </div>
                                </div>
                                <div>
                                    <Label className="text-xs">Etiqueta visible</Label>
                                    <Input
                                        value={bulkFreeForm.free_label}
                                        onChange={(e) => setBulkFreeForm(p => ({ ...p, free_label: e.target.value }))}
                                        placeholder="Ej. Opening Day"
                                    />
                                </div>
                                {bulkFreeForm.preview !== null && (
                                    <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-900">
                                        <strong>{bulkFreeForm.preview}</strong> clase{bulkFreeForm.preview === 1 ? '' : 's'} {bulkFreeForm.preview === 1 ? 'será marcada' : 'serán marcadas'} como gratis.
                                    </div>
                                )}
                            </div>
                            <DialogFooter>
                                <Button variant="outline" onClick={() => setIsBulkFreeOpen(false)}>Cancelar</Button>
                                {bulkFreeForm.preview === null ? (
                                    <Button
                                        onClick={async () => {
                                            if (!bulkFreeForm.from_date || !bulkFreeForm.to_date) {
                                                toast({ variant: 'destructive', title: 'Falta fecha' });
                                                return;
                                            }
                                            const res = await api.post('/classes/bulk-mark-free', {
                                                ...bulkFreeForm, dry_run: true,
                                            });
                                            setBulkFreeForm(p => ({ ...p, preview: res.data.would_affect ?? 0 }));
                                        }}
                                    >
                                        Ver preview
                                    </Button>
                                ) : (
                                    <Button
                                        className="bg-emerald-600 text-white hover:bg-emerald-700"
                                        onClick={() => {
                                            bulkMarkFreeMutation.mutate({ ...bulkFreeForm, dry_run: false });
                                            setIsBulkFreeOpen(false);
                                            setBulkFreeForm(p => ({ ...p, preview: null }));
                                        }}
                                        disabled={bulkMarkFreeMutation.isPending}
                                    >
                                        Confirmar y marcar {bulkFreeForm.preview} clase{bulkFreeForm.preview === 1 ? '' : 's'}
                                    </Button>
                                )}
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>

                    <CancelBookingDialog
                        bookingId={cancelBookingId}
                        open={!!cancelBookingId}
                        onClose={() => setCancelBookingId(null)}
                        onCancelled={() => { refetchAttendees(); queryClient.invalidateQueries({ queryKey: ['classes'] }); }}
                    />

                    {/* Cancelar: solo esta clase o toda la serie del horario */}
                    <Dialog open={cancelChoiceOpen} onOpenChange={setCancelChoiceOpen}>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Cancelar clase</DialogTitle>
                                <DialogDescription>
                                    Se cancelan las reservas y se reembolsan los créditos. Las clases canceladas dejan de verse para los usuarios.
                                </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-2">
                                <Button
                                    variant="outline"
                                    className="w-full justify-start"
                                    disabled={cancelMutation.isPending}
                                    onClick={() => selectedClass && cancelMutation.mutate({ id: selectedClass.id, scope: 'one' })}
                                >
                                    Solo esta clase
                                </Button>
                                <Button
                                    variant="destructive"
                                    className="w-full justify-start"
                                    disabled={cancelMutation.isPending}
                                    onClick={() => selectedClass && cancelMutation.mutate({ id: selectedClass.id, scope: 'series' })}
                                >
                                    {cancelMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    Todas las de este horario (mismo día y hora, en adelante)
                                </Button>
                            </div>
                            <DialogFooter>
                                <Button variant="ghost" onClick={() => setCancelChoiceOpen(false)}>Cerrar</Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>

                    {/* Cambiar coach: elige el alcance (solo este día / toda la serie / fechas específicas). No notifica. */}
                    <Dialog open={isChangeCoachOpen} onOpenChange={setIsChangeCoachOpen}>
                        <DialogContent className="max-h-[85vh] overflow-y-auto">
                            <DialogHeader>
                                <DialogTitle>Cambiar coach</DialogTitle>
                                <DialogDescription>
                                    {selectedClass?.class_type_name || 'Clase'} · coach actual: {selectedClass?.instructor_name || 'sin asignar'}
                                </DialogDescription>
                            </DialogHeader>

                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <Label>Coach</Label>
                                    <Select value={coachToAssign} onValueChange={setCoachToAssign}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Seleccionar coach..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {instructors?.filter(i => i.is_active).map(inst => (
                                                <SelectItem key={inst.id} value={inst.id}>
                                                    {inst.display_name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-2">
                                    <Label>¿A qué clases aplica?</Label>
                                    <RadioGroup
                                        value={coachScope}
                                        onValueChange={(v) => setCoachScope(v as 'this' | 'series' | 'dates')}
                                        className="space-y-2"
                                    >
                                        <label htmlFor="coach-scope-this" className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 has-[:checked]:border-balance-gold has-[:checked]:bg-balance-gold/5">
                                            <RadioGroupItem value="this" id="coach-scope-this" className="mt-0.5" />
                                            <div>
                                                <p className="text-sm font-medium">Solo este día</p>
                                            </div>
                                        </label>
                                        <label htmlFor="coach-scope-series" className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 has-[:checked]:border-balance-gold has-[:checked]:bg-balance-gold/5">
                                            <RadioGroupItem value="series" id="coach-scope-series" className="mt-0.5" />
                                            <div>
                                                <p className="text-sm font-medium">Todos los días de esta clase</p>
                                                <p className="text-xs text-muted-foreground">Cambia toda la serie recurrente y el horario base.</p>
                                            </div>
                                        </label>
                                        <label htmlFor="coach-scope-dates" className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 has-[:checked]:border-balance-gold has-[:checked]:bg-balance-gold/5">
                                            <RadioGroupItem value="dates" id="coach-scope-dates" className="mt-0.5" />
                                            <div>
                                                <p className="text-sm font-medium">Fechas específicas</p>
                                            </div>
                                        </label>
                                    </RadioGroup>
                                </div>

                                {coachScope === 'dates' && (
                                    <div className="space-y-2">
                                        <Label>Elige las fechas</Label>
                                        {seriesDatesLoading ? (
                                            <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
                                                <Loader2 className="h-4 w-4 animate-spin" /> Cargando fechas…
                                            </div>
                                        ) : seriesDates.length === 0 ? (
                                            <p className="py-3 text-sm text-muted-foreground">No hay más fechas futuras en esta serie.</p>
                                        ) : (
                                            <div className="max-h-56 space-y-1.5 overflow-y-auto rounded-lg border p-2">
                                                {seriesDates.map(sd => {
                                                    const checked = selectedSeriesDates.has(sd.date);
                                                    return (
                                                        <label
                                                            key={sd.id}
                                                            htmlFor={`series-date-${sd.id}`}
                                                            className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 hover:bg-balance-cream/40"
                                                        >
                                                            <Checkbox
                                                                id={`series-date-${sd.id}`}
                                                                checked={checked}
                                                                onCheckedChange={(c) => {
                                                                    setSelectedSeriesDates(prev => {
                                                                        const next = new Set(prev);
                                                                        if (c) next.add(sd.date); else next.delete(sd.date);
                                                                        return next;
                                                                    });
                                                                }}
                                                            />
                                                            <div className="min-w-0">
                                                                <p className="text-sm font-medium capitalize">
                                                                    {format(parseLocalDate(sd.date), "EEE d MMM", { locale: es })}
                                                                    {selectedClass?.start_time && (
                                                                        <span className="ml-2 font-normal text-muted-foreground">{formatClassTime(selectedClass.start_time)}</span>
                                                                    )}
                                                                </p>
                                                                <p className="text-xs text-muted-foreground">Coach actual: {sd.instructor_name || 'sin asignar'}</p>
                                                            </div>
                                                        </label>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            <DialogFooter>
                                <Button variant="ghost" onClick={() => setIsChangeCoachOpen(false)}>Cancelar</Button>
                                <Button
                                    disabled={
                                        changeInstructorMutation.isPending ||
                                        !coachToAssign ||
                                        (coachScope === 'dates' && selectedSeriesDates.size === 0)
                                    }
                                    onClick={() => selectedClass && changeInstructorMutation.mutate({
                                        id: selectedClass.id,
                                        instructor_id: coachToAssign,
                                        scope: coachScope,
                                        dates: coachScope === 'dates' ? Array.from(selectedSeriesDates) : undefined,
                                    })}
                                >
                                    {changeInstructorMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    Aplicar
                                </Button>
                            </DialogFooter>
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

function CalendarStat({ label, value }: { label: string; value: number }) {
    return (
        <div className="rounded-[1.15rem] border border-balance-olive/16 bg-balance-cream/55 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-balance-dark/48">{label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums tracking-[-0.04em] text-balance-dark">{value}</p>
        </div>
    );
}

const programColor = (cat?: string) => (cat === 'reformer' ? '#2563eb' : '#7c3aed');

function ClassEventCard({ item, onClick }: { item: Class; onClick: () => void }) {
    const baseColor = item.class_type_color || '#7E8579';
    const isFree = !!item.is_free;
    const color = isFree ? '#16a34a' : baseColor;
    const bookings = Number(item.current_bookings || 0);
    const capacity = Number(item.max_capacity || 0);
    const ratio = capacity > 0 ? Math.min((bookings / capacity) * 100, 100) : 0;
    const isCancelled = item.status === 'cancelled';

    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                'group w-full rounded-[1.1rem] border p-3 text-left shadow-[0_14px_42px_-34px_rgba(51,42,34,0.7)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_20px_52px_-36px_rgba(51,42,34,0.82)]',
                isCancelled && 'opacity-55'
            )}
            style={{
                borderColor: isFree ? '#86efac' : `${color}66`,
                background: isFree
                    ? 'linear-gradient(180deg, #dcfce7 0%, #f0fdf4cc 100%)'
                    : `linear-gradient(180deg, ${color}1F 0%, rgba(243,238,226,0.68) 100%)`,
                borderLeft: `4px solid ${programColor(item.category)}`,
            }}
        >
            <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                    <span className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                    <span className="truncate text-sm font-semibold text-balance-dark">{formatClassTime(item.start_time)}</span>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                    {isFree && (
                        <span className="rounded-full bg-green-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                            Gratis
                        </span>
                    )}
                    {isCancelled ? (
                        <Badge variant="destructive" className="rounded-full text-[10px]">Cancelada</Badge>
                    ) : (
                        <span className="rounded-full bg-balance-cream/75 px-2 py-0.5 text-[10px] font-semibold text-balance-dark/55">
                            {bookings}/{capacity}
                        </span>
                    )}
                </div>
            </div>

            <p className="mt-2 truncate text-sm font-semibold leading-5 text-balance-dark">{item.class_type_name}</p>
            <div className="mt-2 space-y-1.5 text-[11px] text-balance-dark/56">
                <p className="flex min-w-0 items-center gap-1.5">
                    <Users className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{item.instructor_name || 'Coach por asignar'}</span>
                </p>
                <p className="flex min-w-0 items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{item.facility_name || 'Studio'}</span>
                </p>
                <p className="flex min-w-0 items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 shrink-0" />
                    <span>{formatClassTime(item.start_time)} a {formatClassTime(item.end_time)}</span>
                </p>
            </div>

            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-balance-dark/10">
                <div
                    className="h-full rounded-full transition-[width] duration-300"
                    style={{ width: `${ratio}%`, backgroundColor: color }}
                />
            </div>
        </button>
    );
}

function formatClassTime(value?: string) {
    return value?.slice(0, 5) || '--:--';
}
