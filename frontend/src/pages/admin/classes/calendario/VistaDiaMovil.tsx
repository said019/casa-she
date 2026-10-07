import { format, isSameDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Class } from '@/types/class';
import { DAYS } from './formato';
import { TarjetaClase } from './TarjetaClase';

interface VistaDiaMovilProps {
    dias: Date[];
    diaSeleccionado: Date;
    onSeleccionarDia: (dia: Date) => void;
    clasesDelDia: (dia: Date) => Class[];
    diasCerrados: Set<string>;
    motivoCierre: (dia: Date) => string | undefined;
    onClickClase: (clase: Class) => void;
    onNuevaClase: (dia: Date) => void;
}

/** Debajo de lg: la tira de días de la semana y la lista del día elegido. */
export function VistaDiaMovil({
    dias, diaSeleccionado, onSeleccionarDia, clasesDelDia, diasCerrados, motivoCierre, onClickClase, onNuevaClase,
}: VistaDiaMovilProps) {
    const clasesDia = clasesDelDia(diaSeleccionado)
        .slice()
        .sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));
    const cerrado = diasCerrados.has(format(diaSeleccionado, 'yyyy-MM-dd'));
    const motivo = motivoCierre(diaSeleccionado);

    return (
        <div className="space-y-4 lg:hidden">
            <div className="grid grid-cols-7 border-y border-balance-sand/70 py-2" aria-label="Días de la semana">
                {dias.map((day, i) => {
                    const clave = format(day, 'yyyy-MM-dd');
                    const selected = isSameDay(day, diaSeleccionado);
                    const today = isSameDay(day, new Date());
                    const isClosed = diasCerrados.has(clave);
                    const dayClasses = clasesDelDia(day);
                    return (
                        <button
                            key={clave}
                            type="button"
                            data-dia={clave}
                            onClick={() => onSeleccionarDia(day)}
                            aria-pressed={selected}
                            className={cn(
                                'relative min-w-0 px-0.5 py-2 text-center transition-[color,transform] active:scale-[0.96]',
                                selected
                                    ? 'text-balance-dark after:absolute after:inset-x-1 after:bottom-0 after:h-[2px] after:bg-balance-olive'
                                    : today
                                        ? 'text-balance-dark'
                                        : 'text-balance-dark/55',
                                isClosed && !selected && 'text-destructive'
                            )}
                        >
                            <span className="block text-[9px] font-semibold uppercase tracking-[0.08em] opacity-65">{DAYS[i].slice(0, 2)}</span>
                            <span className={cn(
                                'mx-auto mt-1 flex h-8 w-8 items-center justify-center rounded-full text-lg font-semibold tabular-nums',
                                selected && 'bg-balance-olive text-balance-cream',
                                today && !selected && 'border border-balance-olive/55'
                            )}>{format(day, 'd')}</span>
                            <span className="mt-1 block text-[8px] font-semibold opacity-55">{dayClasses.length}</span>
                        </button>
                    );
                })}
            </div>

            <section className="overflow-hidden rounded-[1.35rem] border border-balance-sand/65 bg-[hsl(var(--admin-panel))] shadow-[0_22px_70px_-58px_rgba(51,42,34,.72)]">
                <header className="flex items-end justify-between gap-4 border-b border-balance-sand/60 bg-balance-cream/48 px-4 py-4">
                    <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-balance-dark/70">
                            {format(diaSeleccionado, 'EEEE', { locale: es })}
                        </p>
                        <h2 className="mt-1 text-2xl font-semibold capitalize tracking-[-0.035em] text-balance-dark">
                            {format(diaSeleccionado, 'd MMMM', { locale: es })}
                        </h2>
                    </div>
                    <Badge variant="outline" className="rounded-full border-balance-sand/70 bg-balance-cream/75 text-balance-dark/75">
                        {clasesDia.length} {clasesDia.length === 1 ? 'clase' : 'clases'}
                    </Badge>
                </header>

                {cerrado && (
                    <div className="m-4 rounded-[1rem] border border-destructive/20 bg-destructive/8 px-4 py-3 text-sm font-medium text-destructive">
                        {motivo || 'Studio cerrado'}
                    </div>
                )}

                {clasesDia.length > 0 ? (
                    <div className="space-y-3 p-3">
                        {clasesDia.map((item) => (
                            <TarjetaClase key={item.id} clase={item} variante="lista" onClick={() => onClickClase(item)} />
                        ))}
                        {!cerrado && (
                            <Button
                                variant="ghost"
                                className="h-11 w-full rounded-full border border-dashed border-balance-sand/70 text-balance-dark/75"
                                onClick={() => onNuevaClase(diaSeleccionado)}
                            >
                                <Plus className="mr-2 h-4 w-4" /> Agregar otra clase
                            </Button>
                        )}
                    </div>
                ) : !cerrado ? (
                    <button
                        type="button"
                        onClick={() => onNuevaClase(diaSeleccionado)}
                        className="flex min-h-[13rem] w-full flex-col items-center justify-center px-6 text-center text-balance-dark/48 transition-colors hover:bg-balance-olive/6 hover:text-balance-olive"
                    >
                        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-balance-olive/8 text-balance-olive">
                            <Plus className="h-5 w-5" />
                        </span>
                        <span className="mt-4 text-sm font-semibold">Agregar la primera clase</span>
                        <span className="mt-1 text-xs">No hay sesiones programadas para este día.</span>
                    </button>
                ) : null}
            </section>
        </div>
    );
}
