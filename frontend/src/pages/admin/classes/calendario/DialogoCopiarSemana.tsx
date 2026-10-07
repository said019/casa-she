import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { format, addDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { Copy as CopyIcon, Loader2 } from 'lucide-react';
import api, { getErrorMessage } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import type { CopiaSemanaResumen } from './tipos';

interface DialogoCopiarSemanaProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Lunes de la semana que se copia a la siguiente. */
    weekStart: Date;
}

/** "Copiar semana" con vista previa obligatoria. El padre lo vuelve a montar (key) en cada apertura. Movido sin cambios. */
export function DialogoCopiarSemana({ open, onOpenChange, weekStart }: DialogoCopiarSemanaProps) {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [copiaPrevia, setCopiaPrevia] = useState<CopiaSemanaResumen | null>(null);
    const [conservarCanceladas, setConservarCanceladas] = useState<boolean | null>(null);
    const startStr = format(weekStart, 'yyyy-MM-dd');

    // Copiar semana. Son dos llamadas al MISMO endpoint: la primera con
    // dryRun para enseñar qué va a pasar, la segunda para hacerlo. Así el
    // conteo que se muestra y el que se ejecuta salen de la misma lógica —
    // no de dos cálculos que pueden desincronizarse.
    const semanaDestinoStr = format(addDays(weekStart, 7), 'yyyy-MM-dd');
    const copiarSemanaMutation = useMutation({
        mutationFn: async ({ dryRun, includeCancelled }: { dryRun: boolean; includeCancelled: boolean }) => (await api.post('/classes/copy-week', {
            fromWeekStart: startStr,
            toWeekStart: semanaDestinoStr,
            includeCancelled,
            dryRun,
        })).data as CopiaSemanaResumen,
        onSuccess: (data) => {
            if (data.dryRun) { setCopiaPrevia(data); return; }
            onOpenChange(false);
            setCopiaPrevia(null);
            queryClient.invalidateQueries({ queryKey: ['classes'] });
            toast({
                title: data.creadas > 0 ? 'Semana copiada' : 'No había nada que copiar',
                description: data.creadas > 0
                    ? `${data.creadas} ${data.creadas === 1 ? 'clase creada' : 'clases creadas'}${data.canceladasConservadas ? ` · ${data.canceladasConservadas} cancelada${data.canceladasConservadas === 1 ? '' : 's'} conservada${data.canceladasConservadas === 1 ? '' : 's'}` : ''}${data.yaExistian ? ` · ${data.yaExistian} ya existían` : ''}`
                    : data.canceladasOmitidas > 0
                        ? `${data.canceladasOmitidas} ${data.canceladasOmitidas === 1 ? 'clase cancelada no se copió' : 'clases canceladas no se copiaron'}.`
                        : data.mensaje || 'Todas las clases ya existían en la semana destino.',
            });
        },
        onError: (err) => toast({ variant: 'destructive', title: 'Error', description: getErrorMessage(err) }),
    });

    return (
        <Dialog
            open={open}
            onOpenChange={(abierto) => {
                onOpenChange(abierto);
                if (!abierto) {
                    setCopiaPrevia(null);
                    setConservarCanceladas(null);
                }
            }}
        >
            <DialogContent>
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <CopyIcon className="h-5 w-5 text-balance-olive" />
                        Copiar semana
                    </DialogTitle>
                    <DialogDescription>
                        Se copian las clases del <strong>{format(weekStart, "d 'de' MMMM", { locale: es })}</strong> al{' '}
                        <strong>{format(addDays(weekStart, 6), "d 'de' MMMM", { locale: es })}</strong> a la semana que empieza el{' '}
                        <strong>{format(addDays(weekStart, 7), "d 'de' MMMM", { locale: es })}</strong>.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-3 py-2">
                    <p className="text-sm font-medium text-balance-dark">¿Quieres conservar las clases canceladas?</p>
                    <RadioGroup
                        value={conservarCanceladas === null ? undefined : (conservarCanceladas ? 'si' : 'no')}
                        disabled={copiarSemanaMutation.isPending}
                        onValueChange={(value) => {
                            const conservar = value === 'si';
                            setConservarCanceladas(conservar);
                            setCopiaPrevia(null);
                            copiarSemanaMutation.mutate({ dryRun: true, includeCancelled: conservar });
                        }}
                        className="grid gap-2 sm:grid-cols-2"
                    >
                        <Label htmlFor="copy-cancelled-no" className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 hover:bg-muted/40">
                            <RadioGroupItem id="copy-cancelled-no" value="no" className="mt-0.5" />
                            <span>
                                <span className="block font-medium">No conservarlas</span>
                                <span className="mt-0.5 block text-xs font-normal text-muted-foreground">Las canceladas no se copiarán.</span>
                            </span>
                        </Label>
                        <Label htmlFor="copy-cancelled-si" className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 hover:bg-muted/40">
                            <RadioGroupItem id="copy-cancelled-si" value="si" className="mt-0.5" />
                            <span>
                                <span className="block font-medium">Sí, conservarlas</span>
                                <span className="mt-0.5 block text-xs font-normal text-muted-foreground">Se copiarán y seguirán canceladas.</span>
                            </span>
                        </Label>
                    </RadioGroup>
                </div>

                {conservarCanceladas === null ? (
                    <p className="text-sm text-muted-foreground">Elige una opción para revisar la copia.</p>
                ) : copiarSemanaMutation.isPending && !copiaPrevia ? (
                    <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" /> Revisando qué haría…
                    </div>
                ) : copiaPrevia ? (
                    <div className="space-y-3 py-2">
                        <div className="rounded-lg border bg-card p-3">
                            <p className="text-2xl font-semibold text-balance-olive">
                                {copiaPrevia.creadas}
                                <span className="ml-2 text-sm font-normal text-muted-foreground">
                                    {copiaPrevia.creadas === 1 ? 'clase se creará' : 'clases se crearán'}
                                </span>
                            </p>
                        </div>
                        {/* Lo que NO se va a hacer importa tanto como lo que sí: evita
                            que alguien apriete el botón dos veces "por si acaso". */}
                        <ul className="space-y-1 text-sm text-muted-foreground">
                            {copiaPrevia.yaExistian > 0 && (
                                <li>· <strong>{copiaPrevia.yaExistian}</strong> ya existen en esa semana y no se duplicarán.</li>
                            )}
                            {copiaPrevia.enDiaCerrado > 0 && (
                                <li>· <strong>{copiaPrevia.enDiaCerrado}</strong> caen en un día de descanso del estudio y se omiten.</li>
                            )}
                            {copiaPrevia.enElPasado > 0 && (
                                <li>· <strong>{copiaPrevia.enElPasado}</strong> quedarían en el pasado y se omiten.</li>
                            )}
                            {copiaPrevia.canceladasConservadas > 0 && (
                                <li>· <strong>{copiaPrevia.canceladasConservadas}</strong> cancelada{copiaPrevia.canceladasConservadas === 1 ? '' : 's'} se copiará{copiaPrevia.canceladasConservadas === 1 ? '' : 'n'} y seguirá{copiaPrevia.canceladasConservadas === 1 ? '' : 'n'} cancelada{copiaPrevia.canceladasConservadas === 1 ? '' : 's'}.</li>
                            )}
                            {copiaPrevia.canceladasOmitidas > 0 && (
                                <li>· <strong>{copiaPrevia.canceladasOmitidas}</strong> cancelada{copiaPrevia.canceladasOmitidas === 1 ? '' : 's'} no se copiará{copiaPrevia.canceladasOmitidas === 1 ? '' : 'n'}.</li>
                            )}
                            <li>· No se copian reservas, clases gratis ni cupos cerrados.</li>
                            <li>· El cupo de TotalPass de cada clase sí se conserva.</li>
                        </ul>
                        {copiaPrevia.mensaje && (
                            <p className="text-sm text-amber-700">{copiaPrevia.mensaje}</p>
                        )}
                    </div>
                ) : null}

                <DialogFooter>
                    <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
                    <Button
                        onClick={() => conservarCanceladas !== null && copiarSemanaMutation.mutate({ dryRun: false, includeCancelled: conservarCanceladas })}
                        disabled={copiarSemanaMutation.isPending || conservarCanceladas === null || !copiaPrevia || copiaPrevia.creadas === 0}
                    >
                        {copiarSemanaMutation.isPending && copiaPrevia ? (
                            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Copiando…</>
                        ) : (
                            <>Copiar {copiaPrevia?.creadas ?? 0} {copiaPrevia?.creadas === 1 ? 'clase' : 'clases'}</>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
