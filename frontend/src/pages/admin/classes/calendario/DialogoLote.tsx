import { useRef, useState } from 'react';
import axios from 'axios';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Loader2 } from 'lucide-react';
import api, { getErrorMessage } from '@/lib/api';
import type { Class, ClassType, Instructor } from '@/types/class';
import { ChannelLogo } from '@/components/brands/ChannelLogo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import {
    fechaDeClase,
    horaCorta,
    listaSeleccion,
    nClases,
    textoAvisadas,
    textoBoton,
    type AccionLote,
    type ParametrosLote,
    type RespuestaLote,
} from './seleccion';

/** Lo que el padre necesita para el aviso final y para "Deshacer". */
export interface LoteAplicado {
    accion: AccionLote;
    params: ParametrosLote;
    respuesta: RespuestaLote;
    /** Las clases como estaban antes del cambio. */
    antes: Class[];
    nombres: { coach?: string; tipo?: string };
}

interface DialogoLoteProps {
    /** La acción abierta; null = cerrado. El padre lo vuelve a montar (key) en cada apertura. */
    accion: AccionLote | null;
    onOpenChange: (open: boolean) => void;
    /** Las clases seleccionadas, por día y hora. */
    clases: Class[];
    classTypes?: ClassType[];
    instructors?: Instructor[];
    onQuitarBloqueadas: (r: RespuestaLote) => void;
    onAplicado: (info: LoteAplicado) => void;
}

const DESPLAZAMIENTOS: Array<[number, string]> = [[-60, '−1 h'], [-30, '−30 min'], [0, 'Misma hora'], [30, '+30 min'], [60, '+1 h']];
const TITULOS: Record<Exclude<AccionLote, 'cupo_canal' | 'cancelar'>, string> = { coach: 'Cambiar coach', mover: 'Mover o cambiar clase' };
const reservasTotalpass = (c: Class) => Number(c.channels?.find((x) => x.channel === 'totalpass')?.booked ?? 0);

/**
 * La ventana de cada acción en bloque: elige el cambio, pide la vista previa a
 * POST /api/classes/bulk y muestra qué les pasa a las alumnas y a TotalPass antes de aplicar.
 */
export function DialogoLote({ accion, onOpenChange, clases, classTypes, instructors, onQuitarBloqueadas, onAplicado }: DialogoLoteProps) {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const ids = clases.map((c) => c.id);
    const coachesActuales = new Set(clases.map((c) => c.instructor_id));
    const minimoCupo = Math.max(0, ...clases.map(reservasTotalpass));
    const maximoCupo = Math.min(...clases.map((c) => Number(c.max_capacity) || 0));
    const cupoActual = clases.length ? Number(clases[0].channels?.find((x) => x.channel === 'totalpass')?.max ?? 0) : 0;

    const [coachId, setCoachId] = useState<string | null>(null);
    const [lugares, setLugares] = useState(Math.min(Math.max(cupoActual, minimoCupo), Math.max(maximoCupo, minimoCupo)));
    const [minutos, setMinutos] = useState(0);
    const [tipoId, setTipoId] = useState('mismo');
    const [motivo, setMotivo] = useState('');

    const coachElegida = instructors?.find((i) => i.id === coachId);
    const tipoElegido = classTypes?.find((t) => t.id === tipoId);
    const nombres = { coach: coachElegida?.display_name, tipo: tipoElegido?.name };

    // Parámetros de la acción; null = todavía no hay nada que aplicar.
    const params: ParametrosLote | null =
        accion === 'coach' ? (coachId ? { instructorId: coachId } : null)
        : accion === 'cupo_canal' ? { canal: 'totalpass', lugares }
        : accion === 'mover' ? (minutos !== 0 || tipoId !== 'mismo' ? { minutos, ...(tipoId !== 'mismo' ? { classTypeId: tipoId } : {}) } : null)
        : accion === 'cancelar' ? (motivo.trim() ? { motivo: motivo.trim() } : {})
        : null;
    // El motivo no cambia el impacto: no vuelve a pedir la vista previa en cada tecla.
    const paramsPrevia = accion === 'cancelar' ? {} : params;

    const previa = useQuery<RespuestaLote>({
        queryKey: ['classes-bulk-previa', accion, ids, paramsPrevia],
        queryFn: async () => (await api.post('/classes/bulk', { classIds: ids, accion, vistaPrevia: true, ...paramsPrevia })).data,
        enabled: !!accion && ids.length > 0 && !!paramsPrevia,
        placeholderData: (anterior) => anterior,
        staleTime: 0,
        gcTime: 0,
    });

    // Un doble clic no puede aplicar dos veces (mover +1 h dos veces = +2 h).
    const enviando = useRef(false);
    const aplicar = useMutation({
        mutationFn: async () => (await api.post('/classes/bulk', { classIds: ids, accion, vistaPrevia: false, ...params })).data as RespuestaLote,
        onSettled: () => { enviando.current = false; },
        onSuccess: (respuesta) => {
            queryClient.invalidateQueries({ queryKey: ['classes'] });
            onAplicado({ accion: accion!, params: params!, respuesta, antes: clases, nombres });
        },
        onError: (err) => {
            // 409: algo cambió entre la vista previa y aplicar. La respuesta trae las bloqueadas.
            if (axios.isAxiosError(err) && err.response?.status === 409) {
                queryClient.setQueryData(['classes-bulk-previa', accion, ids, paramsPrevia], err.response.data);
                toast({ variant: 'destructive', title: 'No se aplicó nada', description: 'Algunas clases cambiaron mientras tanto. Revisa las bloqueadas.' });
                return;
            }
            toast({ variant: 'destructive', title: 'No se aplicó nada', description: getErrorMessage(err) });
        },
    });

    const r = previa.data;
    const bloqueadas = r?.clases.filter((c) => c.estado === 'bloqueada') ?? [];
    const advertencias = [...new Set(r?.clases.flatMap((c) => c.advertencias) ?? [])];
    const puedeAplicar = !!params && !!r && !previa.isFetching && r.resumen.bloqueadas === 0 && r.resumen.ok > 0 && !aplicar.isPending;
    const etiqueta = (id: string) => {
        const c = clases.find((x) => x.id === id);
        return c ? `${c.class_type_name || 'Clase'} ${fechaDeClase(c).slice(5).split('-').reverse().join('/')} ${horaCorta(c.start_time)}` : 'Clase';
    };

    return (
        <Dialog open={!!accion} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[520px]">
                <DialogHeader>
                    <DialogTitle className={cn('flex items-center gap-2 font-heading text-[28px] font-normal leading-tight', accion === 'cancelar' && 'text-destructive')}>
                        {accion === 'cupo_canal' ? (<>Lugares para <ChannelLogo canal="totalpass" alto={16} /></>)
                            : accion === 'cancelar' ? `Cancelar ${nClases(clases.length)}`
                            : accion ? TITULOS[accion] : ''}
                    </DialogTitle>
                    <DialogDescription>{listaSeleccion(clases)}</DialogDescription>
                </DialogHeader>

                {accion === 'coach' && (
                    <div role="radiogroup" aria-label="Coach nueva" className="flex max-h-64 flex-col gap-1.5 overflow-y-auto">
                        {(instructors ?? []).filter((i) => i.is_active !== false).map((i) => {
                            const actual = coachesActuales.size === 1 && coachesActuales.has(i.id);
                            const elegida = coachId === i.id;
                            return (
                                <button
                                    key={i.id}
                                    type="button"
                                    role="radio"
                                    aria-checked={elegida}
                                    disabled={actual}
                                    onClick={() => setCoachId(i.id)}
                                    className={cn(
                                        'flex items-center gap-3 rounded-xl border px-3 py-2 text-left disabled:opacity-55',
                                        elegida ? 'border-casa-verde bg-casa-verde/10' : 'border-casa-arena bg-[hsl(var(--admin-panel))]',
                                    )}
                                >
                                    <span className="grid h-8 w-8 flex-none place-items-center rounded-full bg-casa-verde/10 font-semibold text-casa-verde">{i.display_name.slice(0, 1)}</span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block font-semibold">{i.display_name}</span>
                                        {actual && <span className="block text-xs text-casa-ciruela/70">Coach actual de estas clases</span>}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                )}

                {accion === 'cupo_canal' && (
                    <div className="space-y-2">
                        <div className="flex items-center gap-4">
                            <Button type="button" variant="outline" className="h-12 w-12 rounded-[14px] text-xl" aria-label="Un lugar menos" disabled={lugares <= minimoCupo} onClick={() => setLugares((n) => n - 1)}>−</Button>
                            <span data-testid="cupo-lote" className="min-w-10 text-center font-heading text-5xl tabular-nums">{lugares}</span>
                            <Button type="button" variant="outline" className="h-12 w-12 rounded-[14px] text-xl" aria-label="Un lugar más" disabled={lugares >= maximoCupo} onClick={() => setLugares((n) => n + 1)}>+</Button>
                            <span className="flex-1 text-sm text-casa-ciruela/70">lugares en cada clase (de {maximoCupo}).</span>
                        </div>
                        <p className="text-sm">
                            {minimoCupo > 0
                                ? `No puede bajar de ${minimoCupo}: ya hay socias inscritas.`
                                : 'Ninguna tiene socias todavía. En 0 la clase deja de ofrecerse en TotalPass.'}
                        </p>
                    </div>
                )}

                {accion === 'mover' && (
                    <div className="space-y-4">
                        <div>
                            <p className="mb-2 font-semibold">Hora</p>
                            <div role="radiogroup" aria-label="Correr la hora" className="flex flex-wrap gap-1.5">
                                {DESPLAZAMIENTOS.map(([m, texto]) => (
                                    <button
                                        key={m}
                                        type="button"
                                        role="radio"
                                        aria-checked={minutos === m}
                                        onClick={() => setMinutos(m)}
                                        className={cn(
                                            'h-10 rounded-[10px] border px-3.5 font-medium',
                                            minutos === m ? 'border-casa-verde bg-casa-verde text-casa-avena' : 'border-casa-arena bg-[hsl(var(--admin-panel))]',
                                        )}
                                    >
                                        {texto}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="lote-tipo" className="font-semibold">Clase</Label>
                            <Select value={tipoId} onValueChange={setTipoId}>
                                <SelectTrigger id="lote-tipo" aria-label="Clase nueva" className="h-11 rounded-xl">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="mismo">Misma clase</SelectItem>
                                    {(classTypes ?? []).filter((t) => t.is_active !== false).map((t) => (
                                        <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                )}

                {accion === 'cancelar' && (
                    <div className="space-y-2">
                        <Label htmlFor="lote-motivo" className="font-semibold">Motivo que verán las alumnas</Label>
                        <Input id="lote-motivo" maxLength={200} placeholder="Ej. puente del 2 de noviembre" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
                        <p className="text-sm text-casa-ciruela/70">Las clases se quedan en el calendario marcadas como canceladas.</p>
                    </div>
                )}

                {params && (
                    <section aria-label="Qué va a pasar" aria-busy={previa.isFetching} className="space-y-2 border-t border-casa-arena pt-3 text-sm">
                        {!r && previa.isFetching && (
                            <p className="flex items-center gap-2 text-casa-ciruela/70"><Loader2 className="h-4 w-4 animate-spin" /> Revisando las clases…</p>
                        )}
                        {previa.isError && <p className="text-destructive">{getErrorMessage(previa.error)}</p>}
                        {r && (
                            <>
                                <p>{textoAvisadas(accion!, r.resumen.alumnasAvisadas)}</p>
                                <p className="flex items-center gap-2">
                                    <ChannelLogo canal="totalpass" alto={10} />
                                    {accion === 'coach' && 'Se actualiza la coach; las socias conservan su lugar.'}
                                    {accion === 'cupo_canal' && (lugares === 0 ? 'Deja de ofrecerse en TotalPass.' : `Hasta ${lugares} socias por clase.`)}
                                    {accion === 'mover' && (r.resumen.sociasPierdenLugar === 0 ? 'Ninguna socia pierde su lugar.' : 'Mover la hora quita el lugar a las socias.')}
                                    {accion === 'cancelar' && 'Se retiran de TotalPass para que nadie más reserve.'}
                                </p>
                                {(r.resumen.sociasPierdenLugar > 0 || advertencias.length > 0) && (
                                    <div role="alert" className="flex gap-2 rounded-xl border border-mostaza/40 bg-mostaza/10 p-3 text-casa-ciruela">
                                        <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" aria-hidden="true" />
                                        <div className="space-y-1">
                                            {r.resumen.sociasPierdenLugar > 0 && (
                                                <p>
                                                    Mover la hora borra y vuelve a publicar la clase en TotalPass:{' '}
                                                    <strong>{r.resumen.sociasPierdenLugar} {r.resumen.sociasPierdenLugar === 1 ? 'socia pierde' : 'socias pierden'} su lugar</strong> y TotalPass les avisa.
                                                </p>
                                            )}
                                            {advertencias.map((a) => <p key={a}>{a}.</p>)}
                                        </div>
                                    </div>
                                )}
                                {bloqueadas.length > 0 && (
                                    <div className="space-y-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3">
                                        <p className="font-semibold text-destructive">
                                            {bloqueadas.length === 1 ? '1 clase no se puede cambiar' : `${bloqueadas.length} clases no se pueden cambiar`}
                                        </p>
                                        <ul aria-label="Clases bloqueadas" className="space-y-0.5">
                                            {bloqueadas.map((b) => <li key={b.classId}>{etiqueta(b.classId)}: {b.motivo}</li>)}
                                        </ul>
                                        <Button type="button" variant="outline" size="sm" onClick={() => onQuitarBloqueadas(r)}>
                                            {bloqueadas.length === 1 ? 'Quitar la bloqueada de la selección' : `Quitar las ${bloqueadas.length} bloqueadas de la selección`}
                                        </Button>
                                    </div>
                                )}
                            </>
                        )}
                    </section>
                )}

                <DialogFooter className="gap-2">
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                        {accion === 'cancelar' ? 'No cancelar' : 'Cerrar'}
                    </Button>
                    <Button
                        type="button"
                        disabled={!puedeAplicar}
                        onClick={() => {
                            if (enviando.current) return;
                            enviando.current = true;
                            aplicar.mutate();
                        }}
                        className={cn(accion === 'cancelar' ? 'bg-destructive text-white hover:bg-destructive/90' : 'bg-casa-verde text-casa-avena hover:bg-casa-profundo')}
                    >
                        {aplicar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {params ? textoBoton(accion!, params, clases.length, nombres) : accion === 'coach' ? 'Elige una coach' : 'Elige un cambio'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
