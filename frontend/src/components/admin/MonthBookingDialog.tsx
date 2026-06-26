import { useState, useMemo, useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { addMonths, format, startOfMonth, endOfMonth, eachDayOfInterval } from 'date-fns';
import { es } from 'date-fns/locale';
import api, { getErrorMessage } from '@/lib/api';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, Calendar as CalendarIcon, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MonthBookingDialogProps {
    userId: string;
    userName: string;
}

export function MonthBookingDialog({ userId, userName }: MonthBookingDialogProps) {
    const [open, setOpen] = useState(false);
    const [selectedScheduleId, setSelectedScheduleId] = useState<string>('');
    const [selectedMonth, setSelectedMonth] = useState<string>(startOfMonth(new Date()).toISOString());
    const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());
    const { toast } = useToast();
    const queryClient = useQueryClient();

    // Fetch Schedules (Templates)
    const { data: schedules, isLoading: isLoadingSchedules } = useQuery({
        queryKey: ['schedules', 'active'],
        queryFn: async () => {
            const { data } = await api.get('/schedules');
            return data;
        },
        enabled: open,
    });

    // Helper to compute dates for a given schedule+month
    const computeDates = useCallback((schedId: string, month: string) => {
        if (!schedId || !schedules) return [];
        const schedule = schedules.find((s: any) => s.id === schedId);
        if (!schedule) return [];
        const monthStart = new Date(month);
        const monthEnd = endOfMonth(monthStart);
        const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
        const targetDay = schedule.day_of_week;
        const now = new Date();
        return days.filter(day => day.getDay() === targetDay && day >= now);
    }, [schedules]);

    // Calculate available dates for preview (stable, only for rendering)
    const previewDates = useMemo(() => {
        return computeDates(selectedScheduleId, selectedMonth);
    }, [selectedScheduleId, selectedMonth, computeDates]);

    // When schedule changes, auto-select all dates
    const handleScheduleChange = useCallback((id: string) => {
        setSelectedScheduleId(id);
        const dates = computeDates(id, selectedMonth);
        const newSet = new Set<string>();
        dates.forEach(d => newSet.add(d.toISOString()));
        setSelectedDates(newSet);
    }, [computeDates, selectedMonth]);

    // Toggle a single date
    const toggleDate = useCallback((dateISO: string) => {
        setSelectedDates(prev => {
            const next = new Set(prev);
            if (next.has(dateISO)) {
                next.delete(dateISO);
            } else {
                next.add(dateISO);
            }
            return next;
        });
    }, []);

    // Select / deselect all
    const toggleAll = useCallback(() => {
        if (selectedDates.size === previewDates.length) {
            setSelectedDates(new Set());
        } else {
            const all = new Set<string>();
            previewDates.forEach(d => all.add(d.toISOString()));
            setSelectedDates(all);
        }
    }, [selectedDates.size, previewDates]);

    const createBulkBookingMutation = useMutation({
        mutationFn: async () => {
            const date = new Date(selectedMonth);
            return await api.post('/bookings/bulk-month', {
                userId,
                scheduleId: selectedScheduleId,
                month: date.getMonth(),
                year: date.getFullYear(),
                selectedDates: Array.from(selectedDates),
            });
        },
        onSuccess: (data: any) => {
            toast({
                title: 'Reservas creadas',
                description: data.data?.message || `Se han agendado las clases exitosamente.`,
            });
            setOpen(false);
            queryClient.invalidateQueries({ queryKey: ['client', userId] });
            queryClient.invalidateQueries({ queryKey: ['admin-bookings'] });
        },
        onError: (error) => {
            toast({ variant: 'destructive', title: 'Error', description: getErrorMessage(error) });
        }
    });

    const handleBooking = () => {
        if (!selectedScheduleId || selectedDates.size === 0) return;
        createBulkBookingMutation.mutate();
    };

    // Month options (Current + next 2 months)
    const monthOptions = useMemo(() => {
        const months = [];
        const today = new Date();
        for (let i = 0; i < 3; i++) {
            months.push(startOfMonth(addMonths(today, i)));
        }
        return months;
    }, []);

    const selectedSchedule = schedules?.find((s: any) => s.id === selectedScheduleId);

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="outline">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    Programar Mes
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>Programar Clases del Mes</DialogTitle>
                    <DialogDescription>
                        Asigna clases de un horario específico para {userName} en el mes seleccionado.
                        Puedes seleccionar o deseleccionar fechas individuales.
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-4">
                    {/* Month Selector */}
                    <div className="grid gap-2">
                        <Label>Selecciona el Mes</Label>
                        <Select
                            value={selectedMonth}
                            onValueChange={(v) => { setSelectedMonth(v); setSelectedScheduleId(''); }}
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {monthOptions.map((date) => (
                                    <SelectItem key={date.toISOString()} value={date.toISOString()}>
                                        {format(date, 'MMMM yyyy', { locale: es }).replace(/^\w/, c => c.toUpperCase())}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Schedule Selector */}
                    <div className="grid gap-2">
                        <Label>Selecciona el Horario (Clase Recurrente)</Label>
                        <Select
                            value={selectedScheduleId}
                            onValueChange={handleScheduleChange}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="Selecciona una clase..." />
                            </SelectTrigger>
                            <SelectContent>
                                {isLoadingSchedules ? (
                                    <div className="p-2 text-center text-sm text-muted-foreground">Cargando...</div>
                                ) : (
                                    schedules?.map((s: any) => (
                                        <SelectItem key={s.id} value={s.id}>
                                            {s.class_type_name} - {formatDay(s.day_of_week)} {s.start_time?.substring(0, 5)} ({s.instructor_name})
                                        </SelectItem>
                                    ))
                                )}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Toggleable Date Chips */}
                    {selectedScheduleId && (
                        <div className="bg-muted/50 p-4 rounded-md space-y-3">
                            <div className="flex items-center justify-between">
                                <h4 className="text-sm font-medium flex items-center gap-2">
                                    <CalendarIcon className="h-4 w-4" />
                                    Fechas a reservar:
                                </h4>
                                {previewDates.length > 0 && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="text-xs h-7 px-2"
                                        onClick={toggleAll}
                                    >
                                        {selectedDates.size === previewDates.length ? 'Deseleccionar todo' : 'Seleccionar todo'}
                                    </Button>
                                )}
                            </div>

                            {previewDates.length > 0 ? (
                                <div className="flex flex-wrap gap-2">
                                    {previewDates.map((date) => {
                                        const iso = date.toISOString();
                                        const isSelected = selectedDates.has(iso);
                                        return (
                                            <button
                                                key={iso}
                                                type="button"
                                                onClick={() => toggleDate(iso)}
                                                className={cn(
                                                    'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-all',
                                                    'border cursor-pointer select-none',
                                                    isSelected
                                                        ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                                                        : 'bg-background text-muted-foreground border-border hover:border-primary/50'
                                                )}
                                            >
                                                {isSelected && <Check className="h-3.5 w-3.5" />}
                                                {format(date, "EEE d MMM", { locale: es })}
                                            </button>
                                        );
                                    })}
                                </div>
                            ) : (
                                <p className="text-sm text-muted-foreground">
                                    No hay fechas disponibles para este horario en el mes seleccionado.
                                </p>
                            )}

                            <div className="pt-2 border-t mt-2">
                                <p className="text-sm text-muted-foreground">
                                    Total de clases: <span className="font-semibold text-foreground">{selectedDates.size}</span>
                                </p>
                            </div>
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                    <Button
                        onClick={handleBooking}
                        disabled={createBulkBookingMutation.isPending || !selectedScheduleId || selectedDates.size === 0}
                    >
                        {createBulkBookingMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Confirmar {selectedDates.size} Reserva{selectedDates.size !== 1 ? 's' : ''}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function formatDay(dayIndex: number) {
    const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    return days[dayIndex] ?? '';
}
