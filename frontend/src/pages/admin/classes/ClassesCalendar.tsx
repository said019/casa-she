import { useEffect, useRef, useState } from 'react';
import { CheckSquare, ChevronLeft, ChevronRight, Copy as CopyIcon, Loader2, Plus, RefreshCw, Repeat, Sparkles, Users } from 'lucide-react';
import type { Class } from '@/types/class';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { CompanionReview } from '@/components/bookings/CompanionPanel';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuthStore } from '@/stores/authStore';
import { cn } from '@/lib/utils';
import { useSemanaClases } from './calendario/useSemanaClases';
import { RejillaSemana } from './calendario/RejillaSemana';
import { VistaDiaMovil } from './calendario/VistaDiaMovil';
import { LeyendaLugares } from './calendario/LeyendaLugares';
import { PanelClase } from './calendario/PanelClase';
import { DialogoGenerar } from './calendario/DialogoGenerar';
import { DialogoNuevaClase } from './calendario/DialogoNuevaClase';
import { DialogoEditarClase } from './calendario/DialogoEditarClase';
import { DialogoCopiarSemana } from './calendario/DialogoCopiarSemana';
import { DialogoGratis } from './calendario/DialogoGratis';
import { DialogoAlumnaNueva } from './calendario/DialogoAlumnaNueva';
import { DialogoCancelarClase } from './calendario/DialogoCancelarClase';
import { DialogoCambiarCoach } from './calendario/DialogoCambiarCoach';
import { resumenDeClases, textoResumenSemana } from './calendario/lugares';
import { tituloSemana } from './calendario/rejilla';
import { alternar, alternarGrupo, atajosDesde, clasesSeleccionadas, inversaDe, quitarBloqueadas, resumenSeleccion, textoHecho, type AccionLote, type CuerpoLote, type RespuestaLote } from './calendario/seleccion';
import { BarraSeleccion } from './calendario/BarraSeleccion';
import { DialogoLote, type LoteAplicado } from './calendario/DialogoLote';
import { useToast } from '@/components/ui/use-toast';
import { ToastAction } from '@/components/ui/toast';
import axios from 'axios';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api, { getErrorMessage } from '@/lib/api';

interface ClassesCalendarProps {
    initialGenerateOpen?: boolean;
    /** Embebido en otro shell (recepción): no envuelve AuthGuard/AdminLayout. */
    embedded?: boolean;
}

/** Programa = bolsa de créditos: Salsa (categoría 'reformer') o Clases ('multi'). */
const PROGRAMAS = [
    { valor: 'all', etiqueta: 'Todo' },
    { valor: 'multi', etiqueta: 'Clases' },
    { valor: 'reformer', etiqueta: 'Salsa' },
];

const BOTON_BARRA = 'h-11 rounded-xl border-casa-arena bg-[hsl(var(--admin-panel))] font-medium text-casa-ciruela';

export default function ClassesCalendar({ initialGenerateOpen = false, embedded = false }: ClassesCalendarProps) {
    const [companionReviewOpen, setCompanionReviewOpen] = useState(false);
    const [isGenerateOpen, setIsGenerateOpen] = useState(initialGenerateOpen);
    const [isBulkFreeOpen, setIsBulkFreeOpen] = useState(false);
    // Copiar semana: nunca se escribe sin haber mostrado antes la vista previa.
    const [isCopyWeekOpen, setIsCopyWeekOpen] = useState(false);
    // Cada apertura vuelve a montar el diálogo (key): arranca sin vista previa ni opción elegida.
    const [claveCopia, setClaveCopia] = useState(0);
    const [isClassOpen, setIsClassOpen] = useState(false);
    const [nuevaClase, setNuevaClase] = useState<{ dia: Date; clave: number }>({ dia: new Date(), clave: 0 });
    const [cancelChoiceOpen, setCancelChoiceOpen] = useState(false);
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [claveEdicion, setClaveEdicion] = useState(0);
    // "Cambiar coach": diálogo enfocado para reasignar el instructor con alcance (este día / serie / fechas).
    const [isChangeCoachOpen, setIsChangeCoachOpen] = useState(false);
    const [claveCoach, setClaveCoach] = useState(0);
    const [isAttendeesOpen, setIsAttendeesOpen] = useState(false);
    const [selectedClass, setSelectedClass] = useState<Class | null>(null);
    // Alta rápida (Entrega 5): alumna nueva desde el buscador del panel.
    const [altaNueva, setAltaNueva] = useState<{ open: boolean; nombre: string; clave: number }>({ open: false, nombre: '', clave: 0 });
    const [resaltarId, setResaltarId] = useState<string | null>(null);
    // "Gratis" en bloque solo admin estricto; la recepción master (elevated) ve el resto pero no esto.
    const user = useAuthStore((s) => s.user);
    const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
    const veInvitadas = ['admin', 'super_admin', 'reception'].includes(user?.role || '');

    const {
        setCurrentDate, weekStart, mobileSelectedDay, setMobileSelectedDay,
        classTypeFilter, setClassTypeFilter, programFilter, setProgramFilter, instructorFilter, setInstructorFilter,
        classTypes, instructors, facilities,
        classes, classesLoading, classesError, refetchClasses,
        closedDaySet, getClosedReason, getClassesForDay, weekDays,
        handlePrevWeek, handleNextWeek, handleToday,
    } = useSemanaClases();

    // "Seleccionar varias" (solo escritorio): qué clases están marcadas y la última tocada,
    // de la que salen los atajos. Cambiar de semana limpia la selección.
    const [modoSeleccion, setModoSeleccion] = useState(false);
    const [seleccion, setSeleccion] = useState<Set<string>>(() => new Set());
    const [ancla, setAncla] = useState<string | null>(null);
    const claveSemana = weekStart.getTime();
    useEffect(() => {
        setSeleccion(new Set());
        setAncla(null);
    }, [claveSemana]);
    const clasesVisibles = weekDays.flatMap((dia) => getClassesForDay(dia));
    const seleccionadas = clasesSeleccionadas(seleccion, clasesVisibles);
    const claseAncla = clasesVisibles.find((c) => c.id === ancla) ?? seleccionadas[seleccionadas.length - 1] ?? null;
    const atajos = atajosDesde(claseAncla, clasesVisibles);
    const terminarSeleccion = () => {
        setModoSeleccion(false);
        setSeleccion(new Set());
        setAncla(null);
    };
    // La ventana de la acción en bloque abierta; la clave la vuelve a montar limpia en cada apertura.
    const [accionLote, setAccionLote] = useState<AccionLote | null>(null);
    const [claveLote, setClaveLote] = useState(0);
    const { toast } = useToast();
    const queryClient = useQueryClient();
    // "Deshacer": la acción inversa en una sola llamada (solo coach y mover; ver inversaDe).
    // Candado contra doble envío: una inversa relativa (−minutos) aplicada dos veces movería de más.
    const deshaciendo = useRef(false);
    const deshacer = useMutation({
        mutationFn: async (cuerpo: Omit<CuerpoLote, 'vistaPrevia'>) =>
            (await api.post('/classes/bulk', { ...cuerpo, vistaPrevia: false })).data as RespuestaLote,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['classes'] });
            toast({ title: 'Cambio deshecho.' });
        },
        onError: (err) => {
            // 409: ya no se puede (p. ej. una clase empezó). Se dice por qué, con el motivo del servidor.
            const r = axios.isAxiosError(err) && err.response?.status === 409 ? (err.response.data as RespuestaLote) : null;
            const motivo = r?.clases.find((c) => c.estado === 'bloqueada')?.motivo;
            toast({ variant: 'destructive', title: 'No se pudo deshacer', description: motivo ?? getErrorMessage(err) });
        },
    });
    const alAplicarLote = ({ accion, params, respuesta, antes, nombres }: LoteAplicado) => {
        setAccionLote(null);
        setSeleccion(new Set());
        const inversa = inversaDe(accion, params, antes);
        // Cada aviso se puede deshacer UNA sola vez: al primer clic se cierra y ya no hace nada.
        let usado = false;
        const aviso = toast({
            title: textoHecho(accion, params, respuesta, nombres),
            action: inversa ? (
                <ToastAction
                    altText="Deshacer el cambio"
                    onClick={(e) => {
                        e.preventDefault();
                        if (usado || deshaciendo.current || deshacer.isPending) return;
                        usado = true;
                        deshaciendo.current = true;
                        aviso.dismiss();
                        deshacer.mutate(inversa, { onSettled: () => { deshaciendo.current = false; } });
                    }}
                >
                    Deshacer
                </ToastAction>
            ) : undefined,
        });
    };

    // El panel y los diálogos usan la versión más reciente de la clase abierta: después de
    // inscribir, cambiar el cupo o cerrar la clase, la lista se recarga y aquí llega ya cambiada.
    const claseVigente = (selectedClass && classes?.find((c) => c.id === selectedClass.id)) || selectedClass;

    const resumenSemana = textoResumenSemana(resumenDeClases(clasesVisibles));

    const handleDayClick = (day: Date) => {
        // Clave nueva = el diálogo se vuelve a montar con la fecha de ese día.
        setNuevaClase((prev) => ({ dia: day, clave: prev.clave + 1 }));
        setIsClassOpen(true);
    };

    const handleClassClick = (c: Class) => {
        setSelectedClass(c);
        setIsAttendeesOpen(true);
    };

    const handleEditClass = () => {
        if (!selectedClass) return;
        setClaveEdicion((k) => k + 1);
        setIsEditOpen(true);
    };

    const handleChangeCoach = () => {
        if (!selectedClass) return;
        setClaveCoach((k) => k + 1);
        setIsChangeCoachOpen(true);
    };

    const cerrarPanel = () => {
        setIsAttendeesOpen(false);
        setSelectedClass(null);
    };

    const content = (
        <div className={cn('space-y-4 font-body', modoSeleccion && 'lg:pb-28')}>
            <header className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-2.5">
                    <div className="flex gap-1">
                        <Button variant="outline" size="icon" className={cn(BOTON_BARRA, 'w-11')} onClick={handlePrevWeek} aria-label="Semana anterior">
                            <ChevronLeft className="h-[18px] w-[18px]" />
                        </Button>
                        <Button variant="outline" size="icon" className={cn(BOTON_BARRA, 'w-11')} onClick={handleNextWeek} aria-label="Semana siguiente">
                            <ChevronRight className="h-[18px] w-[18px]" />
                        </Button>
                    </div>
                    <Button variant="outline" className={cn(BOTON_BARRA, 'px-4')} onClick={handleToday}>
                        Hoy
                    </Button>
                    <h1 className="ml-1 font-heading text-3xl leading-none text-casa-profundo sm:text-4xl">{tituloSemana(weekStart)}</h1>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <Button
                        variant="outline"
                        aria-pressed={modoSeleccion}
                        className={cn(
                            BOTON_BARRA,
                            'hidden lg:inline-flex',
                            modoSeleccion && 'border-casa-verde bg-casa-verde text-casa-avena hover:bg-casa-profundo hover:text-casa-avena',
                        )}
                        onClick={() => (modoSeleccion ? terminarSeleccion() : setModoSeleccion(true))}
                    >
                        <CheckSquare className="mr-2 h-4 w-4" /> {modoSeleccion ? 'Terminar selección' : 'Seleccionar varias'}
                    </Button>
                    {veInvitadas && (
                        <Button variant="ghost" className="h-11 rounded-xl text-casa-ciruela" onClick={() => setCompanionReviewOpen(true)}>
                            <Users className="mr-2 h-4 w-4" /> Invitadas: revisión de recepción
                        </Button>
                    )}
                    <Button variant="outline" className={BOTON_BARRA} onClick={() => setIsGenerateOpen(true)}>
                        <Repeat className="mr-2 h-4 w-4" /> Generar
                    </Button>
                    <Button
                        variant="outline"
                        className={BOTON_BARRA}
                        onClick={() => {
                            // La vista previa se pide dentro del diálogo y no en onOpenChange: Radix
                            // no dispara onOpenChange cuando el diálogo se abre por estado del padre.
                            setClaveCopia((k) => k + 1);
                            setIsCopyWeekOpen(true);
                        }}
                        title="Copiar esta semana a la siguiente"
                    >
                        <CopyIcon className="mr-2 h-4 w-4" /> Copiar semana
                    </Button>
                    {isAdmin && (
                        <Button variant="outline" className={BOTON_BARRA} onClick={() => setIsBulkFreeOpen(true)}>
                            <Sparkles className="mr-2 h-4 w-4" /> Gratis
                        </Button>
                    )}
                    <Button
                        className="h-11 rounded-xl bg-casa-verde px-[18px] font-semibold text-casa-avena hover:bg-casa-profundo"
                        onClick={() => handleDayClick(mobileSelectedDay)}
                    >
                        <Plus className="mr-2 h-4 w-4" /> Nueva clase
                    </Button>
                </div>
            </header>

            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2.5">
                    <div role="group" aria-label="Programa" className="flex rounded-full bg-casa-arena/40 p-[3px]">
                        {PROGRAMAS.map((p) => (
                            <button
                                key={p.valor}
                                type="button"
                                aria-pressed={programFilter === p.valor}
                                onClick={() => setProgramFilter(p.valor)}
                                className={cn(
                                    'rounded-full px-4 py-2 text-sm text-casa-ciruela transition-colors',
                                    programFilter === p.valor
                                        ? 'bg-[hsl(var(--admin-panel))] font-semibold shadow-[0_1px_2px_rgba(42,33,24,.14)]'
                                        : 'font-medium text-casa-ciruela/70 hover:text-casa-ciruela',
                                )}
                            >
                                {p.etiqueta}
                            </button>
                        ))}
                    </div>
                    {classTypes && classTypes.length > 0 && (
                        <Select value={classTypeFilter} onValueChange={setClassTypeFilter}>
                            <SelectTrigger aria-label="Filtrar por clase" className="h-10 w-[170px] rounded-xl border-casa-arena bg-[hsl(var(--admin-panel))]">
                                <SelectValue placeholder="Clase" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Todas las clases</SelectItem>
                                {classTypes.map((ct) => (
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
                            <SelectTrigger aria-label="Filtrar por coach" className="h-10 w-[170px] rounded-xl border-casa-arena bg-[hsl(var(--admin-panel))]">
                                <SelectValue placeholder="Coach" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Todos los coaches</SelectItem>
                                {instructors.map((inst) => (
                                    <SelectItem key={inst.id} value={inst.id}>{inst.display_name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    )}
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-casa-ciruela/75">
                    <LeyendaLugares />
                    {!classesLoading && !classesError && (
                        <span data-testid="resumen-semana" className="font-semibold text-casa-ciruela">{resumenSemana}</span>
                    )}
                </div>
            </div>

            {modoSeleccion && (
                <div
                    role="group"
                    aria-label="Atajos de selección"
                    className="hidden min-h-12 flex-wrap items-center gap-2 rounded-[14px] bg-casa-verde/10 py-1.5 pl-4 pr-2 lg:flex"
                >
                    <span className="mr-1 font-semibold text-casa-profundo">Toca las clases que quieras cambiar.</span>
                    {atajos.length > 0 && <span className="text-casa-verde">Atajos:</span>}
                    {atajos.map((a) => (
                        <button
                            key={a.etiqueta}
                            type="button"
                            onClick={() => setSeleccion(new Set(a.ids))}
                            className="h-9 rounded-full border border-casa-verde/30 bg-[hsl(var(--admin-panel))] px-3 text-sm font-medium text-casa-verde hover:bg-casa-verde/5"
                        >
                            {a.etiqueta}
                        </button>
                    ))}
                    <button
                        type="button"
                        onClick={() => setSeleccion(new Set())}
                        className="ml-auto h-9 rounded-[10px] px-3 text-sm font-semibold text-casa-verde underline"
                    >
                        Quitar selección
                    </button>
                </div>
            )}


            {classesLoading ? (
                <div className="flex min-h-64 flex-col items-center justify-center rounded-[18px] border border-casa-arena bg-[hsl(var(--admin-panel))]" aria-live="polite">
                    <Loader2 className="h-6 w-6 animate-spin text-casa-verde" aria-hidden="true" />
                    <p className="mt-3 text-sm font-medium text-casa-ciruela/70">Cargando calendario…</p>
                </div>
            ) : classesError ? (
                <div className="flex min-h-64 flex-col items-center justify-center rounded-[18px] border border-destructive/25 bg-destructive/5 px-6 text-center" role="alert">
                    <p className="font-semibold text-casa-ciruela">No pudimos cargar las clases</p>
                    <p className="mt-1 max-w-md text-sm text-casa-ciruela/60">El calendario sigue guardado. Revisa la conexión con el servidor y vuelve a intentarlo.</p>
                    <Button variant="outline" className="mt-5" onClick={() => refetchClasses()}>
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Volver a intentar
                    </Button>
                </div>
            ) : (
                <>
                    <VistaDiaMovil
                        dias={weekDays}
                        diaSeleccionado={mobileSelectedDay}
                        onSeleccionarDia={setMobileSelectedDay}
                        clasesDelDia={getClassesForDay}
                        diasCerrados={closedDaySet}
                        motivoCierre={getClosedReason}
                        onClickClase={handleClassClick}
                        onNuevaClase={handleDayClick}
                    />
                    <div className="hidden lg:block">
                        <RejillaSemana
                            dias={weekDays}
                            clasesDelDia={getClassesForDay}
                            diasCerrados={closedDaySet}
                            motivoCierre={getClosedReason}
                            onClickClase={handleClassClick}
                            onClickDia={handleDayClick}
                            seleccion={modoSeleccion ? {
                                ids: seleccion,
                                onAlternarClase: (c) => {
                                    setSeleccion((actual) => alternar(actual, c.id));
                                    setAncla(c.id);
                                },
                                onAlternarDia: (_dia, clasesDia) => setSeleccion((actual) => alternarGrupo(actual, clasesDia)),
                            } : undefined}
                        />
                    </div>
                </>
            )}

            <PanelClase
                clase={claseVigente}
                open={isAttendeesOpen}
                onOpenChange={(open) => { setIsAttendeesOpen(open); if (!open) setSelectedClass(null); }}
                onEditar={handleEditClass}
                onCambiarCoach={handleChangeCoach}
                onCancelar={() => setCancelChoiceOpen(true)}
                onRegistrarNueva={(nombre) => setAltaNueva((a) => ({ open: true, nombre, clave: a.clave + 1 }))}
                resaltarId={resaltarId}
            />
            <DialogoAlumnaNueva
                key={`alta-${altaNueva.clave}`}
                open={altaNueva.open}
                onOpenChange={(open) => setAltaNueva((a) => ({ ...a, open }))}
                clase={claseVigente}
                nombreInicial={altaNueva.nombre}
                onInscrita={setResaltarId}
            />

            <DialogoGenerar open={isGenerateOpen} onOpenChange={setIsGenerateOpen} onGenerado={setCurrentDate} />
            <DialogoNuevaClase
                key={`nueva-${nuevaClase.clave}`}
                open={isClassOpen}
                onOpenChange={setIsClassOpen}
                dia={nuevaClase.dia}
                classTypes={classTypes}
                instructors={instructors}
                facilities={facilities}
            />
            <DialogoEditarClase
                key={`editar-${claveEdicion}`}
                open={isEditOpen}
                onOpenChange={setIsEditOpen}
                clase={claseVigente}
                classTypes={classTypes}
                instructors={instructors}
                facilities={facilities}
                onCambiarCoach={handleChangeCoach}
                onGuardada={cerrarPanel}
            />
            <DialogoCopiarSemana key={`copia-${claveCopia}`} open={isCopyWeekOpen} onOpenChange={setIsCopyWeekOpen} weekStart={weekStart} />
            <DialogoGratis open={isBulkFreeOpen} onOpenChange={setIsBulkFreeOpen} />
            <DialogoCancelarClase open={cancelChoiceOpen} onOpenChange={setCancelChoiceOpen} clase={claseVigente} onCancelada={cerrarPanel} />
            <DialogoCambiarCoach
                key={`coach-${claveCoach}`}
                open={isChangeCoachOpen}
                onOpenChange={setIsChangeCoachOpen}
                clase={claseVigente}
                instructors={instructors}
                onAplicado={() => setIsEditOpen(false)}
            />

            {modoSeleccion && (
                <BarraSeleccion
                    {...resumenSeleccion(seleccionadas)}
                    activa={seleccionadas.length > 0}
                    abierta={accionLote}
                    onAccion={(a) => {
                        setClaveLote((k) => k + 1);
                        setAccionLote(a);
                    }}
                    onTerminar={terminarSeleccion}
                />
            )}
            <DialogoLote
                key={`lote-${claveLote}`}
                accion={accionLote}
                onOpenChange={(open) => { if (!open) setAccionLote(null); }}
                clases={seleccionadas}
                classTypes={classTypes}
                instructors={instructors}
                onQuitarBloqueadas={(r) => {
                    const quedan = quitarBloqueadas(seleccion, r);
                    setSeleccion(quedan);
                    if (quedan.size === 0) setAccionLote(null);
                }}
                onAplicado={alAplicarLote}
            />

            <Dialog open={companionReviewOpen} onOpenChange={setCompanionReviewOpen}>
                <DialogContent className="max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Invitadas por revisar</DialogTitle>
                        <DialogDescription>Seguimiento de pagos y cancelaciones.</DialogDescription>
                    </DialogHeader>
                    <CompanionReview />
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
