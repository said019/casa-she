import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Loader2 } from 'lucide-react';
import api, { getErrorMessage } from '@/lib/api';
import { parseLocalDate } from '@/lib/date';
import type { Class, Instructor } from '@/types/class';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { formatClassTime } from './formato';

interface DialogoCambiarCoachProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** La clase. El padre vuelve a montar el diálogo (key) en cada apertura. */
    clase: Class | null;
    instructors?: Instructor[];
    /** Se aplicó: el padre cierra también "Editar clase" si estaba abierto. */
    onAplicado: () => void;
}

/** "Cambiar coach" con alcance: este día, toda la serie o fechas específicas. No notifica. Movido sin cambios. */
export function DialogoCambiarCoach({ open, onOpenChange, clase, instructors, onAplicado }: DialogoCambiarCoachProps) {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    // Los mismos valores que ponía handleChangeCoach al abrir.
    const [coachToAssign, setCoachToAssign] = useState<string>(clase?.instructor_id || '');
    const [coachScope, setCoachScope] = useState<'this' | 'series' | 'dates'>('this');
    const [selectedSeriesDates, setSelectedSeriesDates] = useState<Set<string>>(new Set());

    // Fechas FUTURAS de la misma recurrencia (para el selector de "fechas específicas").
    const { data: seriesDates = [], isLoading: seriesDatesLoading } = useQuery<{ id: string; date: string; instructor_id: string; instructor_name: string }[]>({
        queryKey: ['series-dates', clase?.id],
        queryFn: async () => (await api.get(`/classes/${clase?.id}/series-dates`)).data,
        enabled: !!clase?.id && open && coachScope === 'dates',
    });

    // Reasigna el coach con el alcance elegido. El backend ya NO notifica a nadie.
    const changeInstructorMutation = useMutation({
        mutationFn: async ({ id, instructor_id, scope, dates }: { id: string; instructor_id: string; scope: 'this' | 'series' | 'dates'; dates?: string[] }) =>
            api.post(`/classes/${id}/change-instructor`, { instructor_id, scope, ...(scope === 'dates' ? { dates } : {}) }),
        onSuccess: (res: any) => {
            queryClient.invalidateQueries({ queryKey: ['classes'] });
            queryClient.invalidateQueries({ queryKey: ['series-dates', clase?.id] });
            toast({ title: 'Coach actualizado', description: res?.data?.message });
            onOpenChange(false);
            onAplicado();
        },
        onError: (err) => toast({ variant: 'destructive', title: 'Error', description: getErrorMessage(err) }),
    });

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Cambiar coach</DialogTitle>
                    <DialogDescription>
                        {clase?.class_type_name || 'Clase'} · coach actual: {clase?.instructor_name || 'sin asignar'}
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
                                                        {clase?.start_time && (
                                                            <span className="ml-2 font-normal text-muted-foreground">{formatClassTime(clase.start_time)}</span>
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
                    <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
                    <Button
                        disabled={
                            changeInstructorMutation.isPending ||
                            !coachToAssign ||
                            (coachScope === 'dates' && selectedSeriesDates.size === 0)
                        }
                        onClick={() => clase && changeInstructorMutation.mutate({
                            id: clase.id,
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
    );
}
