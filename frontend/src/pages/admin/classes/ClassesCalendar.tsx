import { useState } from 'react';
import { CompanionReview } from '@/components/bookings/CompanionPanel';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { format, isSameDay } from 'date-fns';
import { es } from 'date-fns/locale';
import api, { getErrorMessage } from '@/lib/api';
import type { Class } from '@/types/class';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { useAuthStore } from '@/stores/authStore';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { Button } from '@/components/ui/button';
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
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import {
    Loader2, ChevronLeft, ChevronRight,
    Plus, Repeat, Trash2, Sparkles,
    RefreshCw, Copy as CopyIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { DAYS } from './calendario/formato';
import { useSemanaClases } from './calendario/useSemanaClases';
import { DialogoGenerar } from './calendario/DialogoGenerar';
import { DialogoNuevaClase } from './calendario/DialogoNuevaClase';
import { DialogoEditarClase } from './calendario/DialogoEditarClase';
import { DialogoCopiarSemana } from './calendario/DialogoCopiarSemana';
import { DialogoGratis } from './calendario/DialogoGratis';
import { DialogoCancelarClase } from './calendario/DialogoCancelarClase';
import { DialogoCambiarCoach } from './calendario/DialogoCambiarCoach';
import { PanelClase } from './calendario/PanelClase';
import { TarjetaClase } from './calendario/TarjetaClase';
import { VistaDiaMovil } from './calendario/VistaDiaMovil';

interface ClassesCalendarProps {
    initialGenerateOpen?: boolean;
    /** Embebido en otro shell (recepción): no envuelve AuthGuard/AdminLayout. */
    embedded?: boolean;
}

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
    // "Cambiar coach": diálogo enfocado para reasignar el instructor con alcance (este día / serie / fechas).
    const [isChangeCoachOpen, setIsChangeCoachOpen] = useState(false);
    const [claveCoach, setClaveCoach] = useState(0);
    const [claveEdicion, setClaveEdicion] = useState(0);
    const [isAttendeesOpen, setIsAttendeesOpen] = useState(false);
    const [selectedClass, setSelectedClass] = useState<Class | null>(null);
    const { toast } = useToast();
    const queryClient = useQueryClient();
    // Acciones masivas/destructivas (limpiar semana, gratis) solo admin estricto;
    // la recepción master (elevated) ve el resto del CRUD pero NO estas.
    const user = useAuthStore((s) => s.user);
    const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';

    const {
        currentDate, setCurrentDate, weekStart, mobileSelectedDay, setMobileSelectedDay,
        classTypeFilter, setClassTypeFilter, programFilter, setProgramFilter, instructorFilter, setInstructorFilter,
        classTypes, instructors, facilities,
        classesLoading, classesError, refetchClasses,
        startStr, endStr, closedDaySet, getClosedReason, getClassesForDay, weekDays, activeClasses,
        totalBookings, openSpots, weekRange, occupancy, mobileDayClasses, mobileDayClosed, mobileClosedReason,
        handlePrevWeek, handleNextWeek, handleToday,
    } = useSemanaClases();

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

    const content = (
                <div className="space-y-5">
                    {['admin', 'super_admin', 'reception'].includes(user?.role || '') && <Button variant="outline" onClick={() => setCompanionReviewOpen(true)}>Invitadas: revisión de recepción</Button>}
                    <Dialog open={companionReviewOpen} onOpenChange={setCompanionReviewOpen}>
                        <DialogContent className="max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Invitadas por revisar</DialogTitle><DialogDescription>Seguimiento de pagos y cancelaciones.</DialogDescription></DialogHeader><CompanionReview /></DialogContent>
                    </Dialog>
                    <section className="overflow-hidden rounded-[1.6rem] bg-balance-dark text-balance-cream shadow-[0_28px_80px_-58px_rgba(22,38,26,.95)]">
                        <div className="grid lg:grid-cols-[minmax(0,1.08fr)_minmax(22rem,.92fr)]">
                            <div className="flex min-w-0 flex-col justify-between p-5 sm:p-7 lg:p-9">
                                <div>
                                    <div className="mb-5 inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-balance-cream/58">
                                        <Sparkles className="h-3.5 w-3.5 text-[#B4A248]" />
                                        Operación semanal
                                    </div>
                                    <h1 className="text-4xl font-medium capitalize tracking-[-0.045em] sm:text-5xl">
                                        {format(currentDate, 'MMMM yyyy', { locale: es })}
                                    </h1>
                                    <p className="mt-3 text-sm text-balance-cream/62">{weekRange}</p>
                                </div>
                                <div className="mt-8 grid grid-cols-3 border-y border-balance-cream/16 py-4">
                                    <CalendarStat label="Clases" value={classesLoading ? '…' : classesError ? '—' : activeClasses.length} />
                                    <CalendarStat label="Reservas" value={classesLoading ? '…' : classesError ? '—' : totalBookings} />
                                    <CalendarStat label="Libres" value={classesLoading ? '…' : classesError ? '—' : openSpots} />
                                </div>
                            </div>
                            <figure className="relative min-h-[14rem] overflow-hidden border-t border-balance-cream/12 lg:min-h-[19rem] lg:border-l lg:border-t-0">
                                <img
                                    src="/casashe/espacio-detalles.jpg"
                                    alt="Detalle del estudio Casa Shé"
                                    className="absolute inset-0 h-full w-full object-cover"
                                />
                                <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(22,38,26,.08)_20%,rgba(22,38,26,.72)_100%)] lg:bg-[linear-gradient(90deg,rgba(22,38,26,.36)_0%,rgba(22,38,26,.04)_42%,rgba(22,38,26,.45)_100%)]" />
                                <figcaption className="absolute bottom-4 left-5 text-[9px] font-semibold uppercase tracking-[0.24em] text-balance-cream/72">
                                    Casa Shé · Condesa
                                </figcaption>
                            </figure>
                        </div>
                    </section>

                    <section className="space-y-4 border-y border-balance-sand/70 bg-balance-cream/35 px-1 py-4 sm:px-3">
                        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                            <div className="flex flex-wrap items-center gap-2">
                                <div className="flex items-center overflow-hidden rounded-full border border-balance-sand/70 bg-balance-cream/82">
                                    <Button variant="ghost" size="icon" className="rounded-full" onClick={handlePrevWeek} aria-label="Semana anterior">
                                        <ChevronLeft className="h-4 w-4" />
                                    </Button>
                                    <Button variant="ghost" className="rounded-full px-4 font-semibold" onClick={handleToday}>
                                        Hoy
                                    </Button>
                                    <Button variant="ghost" size="icon" className="rounded-full" onClick={handleNextWeek} aria-label="Semana siguiente">
                                        <ChevronRight className="h-4 w-4" />
                                    </Button>
                                </div>
                                <Badge variant="outline" className="rounded-full border-balance-olive/25 bg-balance-olive/8 px-3 py-1 text-balance-olive">
                                    {occupancy}% ocupación
                                </Badge>
                                <Select value={programFilter} onValueChange={setProgramFilter}>
                                    <SelectTrigger aria-label="Filtrar por programa" className="w-[145px] rounded-full bg-balance-cream/82"><SelectValue placeholder="Programa" /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">Todos los programas</SelectItem>
                                        <SelectItem value="reformer">Salsa</SelectItem>
                                        <SelectItem value="multi">Clases</SelectItem>
                                    </SelectContent>
                                </Select>
                                {classTypes && classTypes.length > 0 && (
                                    <Select value={classTypeFilter} onValueChange={setClassTypeFilter}>
                                        <SelectTrigger aria-label="Filtrar por clase" className="w-[165px] rounded-full bg-balance-cream/82"><SelectValue placeholder="Clase" /></SelectTrigger>
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
                                        <SelectTrigger aria-label="Filtrar por coach" className="w-[165px] rounded-full bg-balance-cream/82"><SelectValue placeholder="Coach" /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">Todos los coaches</SelectItem>
                                            {instructors.map(inst => (
                                                <SelectItem key={inst.id} value={inst.id}>{inst.display_name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                )}
                            </div>

                            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap xl:justify-end">
                                <Button className="col-span-2 rounded-full bg-balance-olive text-balance-cream hover:bg-balance-dark sm:order-first sm:col-span-1" onClick={() => handleDayClick(mobileSelectedDay)}>
                                    <Plus className="mr-2 h-4 w-4" /> Nueva clase
                                </Button>
                                <Button variant="outline" className="rounded-full border-balance-sand/70 bg-balance-cream/76" onClick={() => setIsGenerateOpen(true)}>
                                    <Repeat className="mr-2 h-4 w-4" /> Generar
                                </Button>
                                <Button
                                    variant="outline"
                                    className="rounded-full border-balance-sand/70 bg-balance-cream/76"
                                    onClick={() => {
                                        // La vista previa se pide aquí y no en onOpenChange: Radix
                                        // no dispara onOpenChange cuando el diálogo se abre por
                                        // estado del padre, así que ahí nunca llegaba a pedirse.
                                        setClaveCopia((k) => k + 1);
                                        setIsCopyWeekOpen(true);
                                    }}
                                    title="Copiar esta semana a la siguiente"
                                >
                                    <CopyIcon className="mr-2 h-4 w-4" /> Copiar semana
                                </Button>
                                {isAdmin && (
                                    <Button variant="outline" className="rounded-full border-balance-olive/25 bg-balance-olive/8 text-balance-olive hover:bg-balance-olive/12" onClick={() => setIsBulkFreeOpen(true)}>
                                        <Sparkles className="mr-2 h-4 w-4" /> Gratis
                                    </Button>
                                )}
                                {isAdmin && (
                                    <Button
                                        variant="ghost"
                                        className="col-span-2 rounded-full text-destructive hover:bg-destructive/8 hover:text-destructive sm:col-span-1"
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
                            </div>
                        </div>
                    </section>

                    {classesLoading ? (
                        <div className="flex min-h-64 flex-col items-center justify-center rounded-[1.75rem] border border-balance-sand/65 bg-[hsl(var(--admin-panel))]" aria-live="polite">
                            <Loader2 className="h-6 w-6 animate-spin text-balance-olive" aria-hidden="true" />
                            <p className="mt-3 text-sm font-medium text-balance-dark/65">Cargando calendario…</p>
                        </div>
                    ) : classesError ? (
                        <div className="flex min-h-64 flex-col items-center justify-center rounded-[1.75rem] border border-destructive/25 bg-destructive/5 px-6 text-center" role="alert">
                            <p className="font-semibold text-balance-dark">No pudimos cargar las clases</p>
                            <p className="mt-1 max-w-md text-sm text-balance-dark/60">El calendario sigue guardado. Revisa la conexión con el servidor y vuelve a intentarlo.</p>
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

                    <div className="hidden overflow-hidden rounded-[1.35rem] border border-balance-sand/65 bg-[hsl(var(--admin-panel))] shadow-[0_22px_72px_-58px_rgba(51,42,34,0.75)] lg:block">
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
                                                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-balance-dark/70">{DAYS[i]}</p>
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
                                                        <TarjetaClase key={c.id} clase={c} variante="rejilla" onClick={() => handleClassClick(c)} />
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
                                                        className="mt-3 h-9 w-full rounded-full border border-dashed border-balance-sand/65 text-xs text-balance-dark/75 hover:border-balance-olive/40 hover:bg-balance-olive/8 hover:text-balance-olive"
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
                    </>
                    )}

                    <PanelClase
                        clase={selectedClass}
                        open={isAttendeesOpen}
                        onOpenChange={(open) => { setIsAttendeesOpen(open); if (!open) setSelectedClass(null); }}
                        onEditar={handleEditClass}
                        onCancelar={() => setCancelChoiceOpen(true)}
                        onClaseCambiada={setSelectedClass}
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
                        clase={selectedClass}
                        classTypes={classTypes}
                        instructors={instructors}
                        facilities={facilities}
                        onCambiarCoach={handleChangeCoach}
                        onGuardada={() => { setIsAttendeesOpen(false); setSelectedClass(null); }}
                    />
                    <DialogoCopiarSemana key={`copia-${claveCopia}`} open={isCopyWeekOpen} onOpenChange={setIsCopyWeekOpen} weekStart={weekStart} />
                    <DialogoGratis open={isBulkFreeOpen} onOpenChange={setIsBulkFreeOpen} />
                    <DialogoCancelarClase
                        open={cancelChoiceOpen}
                        onOpenChange={setCancelChoiceOpen}
                        clase={selectedClass}
                        onCancelada={() => { setIsAttendeesOpen(false); setSelectedClass(null); }}
                    />
                    <DialogoCambiarCoach
                        key={`coach-${claveCoach}`}
                        open={isChangeCoachOpen}
                        onOpenChange={setIsChangeCoachOpen}
                        clase={selectedClass}
                        instructors={instructors}
                        onAplicado={() => setIsEditOpen(false)}
                    />

                </div>
    );

    if (embedded) return content;

    return (
        <AuthGuard requiredRoles={['admin', 'super_admin', 'instructor']} allowElevated>
            <AdminLayout>{content}</AdminLayout>
        </AuthGuard>
    );
}

function CalendarStat({ label, value }: { label: string; value: number | string }) {
    return (
        <div className="border-l border-balance-cream/16 px-3 first:border-l-0 first:pl-0 sm:px-5">
            <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-balance-cream/70 sm:text-[10px]">{label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums tracking-[-0.04em] text-balance-cream sm:text-3xl">{value}</p>
        </div>
    );
}

