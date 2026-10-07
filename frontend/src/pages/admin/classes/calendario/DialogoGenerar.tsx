import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { format, startOfWeek, addDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { Calendar as CalendarIcon, Loader2 } from 'lucide-react';
import api, { getErrorMessage } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';

const generateSchema = z.object({
    startDate: z.date(),
    endDate: z.date(),
});

type GenerateForm = z.infer<typeof generateSchema>;

interface DialogoGenerarProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Terminó de generar: el calendario se mueve a la fecha de inicio. */
    onGenerado: (desde: Date) => void;
}

/** "Generar": crea las clases de un rango con la plantilla semanal. Movido sin cambios de ClassesCalendar. */
export function DialogoGenerar({ open, onOpenChange, onGenerado }: DialogoGenerarProps) {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    // La operación de Casa Shé trabaja semanas completas de lunes a domingo.
    const nextMonday = startOfWeek(addDays(new Date(), 7), { weekStartsOn: 1 });
    const nextSunday = addDays(nextMonday, 6);

    const generateForm = useForm<GenerateForm>({
        resolver: zodResolver(generateSchema),
        defaultValues: {
            startDate: nextMonday,
            endDate: nextSunday
        }
    });

    const generateMutation = useMutation({
        mutationFn: async (data: GenerateForm) => {
            return await api.post('/classes/generate', {
                startDate: format(data.startDate, 'yyyy-MM-dd'),
                endDate: format(data.endDate, 'yyyy-MM-dd'),
            });
        },
        onSuccess: (data, variables) => {
            queryClient.invalidateQueries({ queryKey: ['classes'] });
            const { count, skipped, warnings } = data.data;
            const parts: string[] = [`${count} clases creadas.`];
            if (skipped > 0) parts.push(`${skipped} ya existían.`);
            if (warnings?.length) parts.push(warnings.join(' · '));
            toast({
                title: 'Generación completada',
                description: parts.join(' '),
                variant: warnings?.length ? 'destructive' : 'default',
            });
            onOpenChange(false);
            onGenerado(variables.startDate);
        },
        onError: (err) => toast({ variant: 'destructive', title: 'Error', description: getErrorMessage(err) }),
    });

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
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
                        <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
                        <Button type="submit" disabled={generateMutation.isPending}>
                            {generateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Generar
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
