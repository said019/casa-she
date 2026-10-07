import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';
import api, { getErrorMessage } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';

interface DialogoGratisProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

/** "Gratis": marca como gratis las clases de un rango (solo admin). Movido sin cambios de ClassesCalendar. */
export function DialogoGratis({ open, onOpenChange }: DialogoGratisProps) {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [bulkFreeForm, setBulkFreeForm] = useState({
        from_date: '', to_date: '', from_time: '00:00', to_time: '23:59',
        free_label: 'Opening Day - Gratis',
        preview: null as null | number,
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

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
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
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
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
                                onOpenChange(false);
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
    );
}
