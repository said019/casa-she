import type { ButtonHTMLAttributes, CSSProperties } from 'react';
import { Check, Lock } from 'lucide-react';
import { ClassIntensity, isClassIntensity } from '@/components/classes/ClassIntensity';
import { PuntoLugar } from '@/components/brands/ChannelDot';
import { cn } from '@/lib/utils';
import type { Class } from '@/types/class';
import { formatClassTime } from './formato';
import { MAX_PUNTOS_TARJETA, estiloDeLugar, etiquetaCupo, lugaresDeClase, type Lugar } from './lugares';
import { bordeDeTarjeta, colorPuntoAlumna, fondoDeTarjeta } from './colores';

/** Salsa usa otra bolsa de créditos: su tarjeta va oscura para no confundirla con Clases. */
const SALSA = { fondo: '#2E1B22', alumna: '#F6F0E4', sinCoach: '#F2B8AC' };

export interface TarjetaClaseProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'type'> {
    clase: Class;
    /** 'rejilla': semana por horas (quien la posiciona pone top y alto). 'lista': día en móvil. */
    variante: 'rejilla' | 'lista';
    /** Solo en rejilla: cabe completa (nombre, coach y lugares). Si no, va en una sola línea. */
    completa?: boolean;
    /** Modo "Seleccionar varias": la tarjeta muestra su casilla y es un botón que se marca. */
    seleccionable?: boolean;
    seleccionada?: boolean;
}

const claveDeLugar = (l: Lugar) => (l.tipo === 'canal' ? l.canal : l.tipo);

/**
 * Tarjeta de una clase: nombre con intensidad, hora, coach y los lugares como puntos
 * (alumnas de Casa Shé con el color del tipo, cada plataforma con el suyo, libres huecos).
 * Los props de botón pasan tal cual. En modo "Seleccionar varias" muestra su casilla (`seleccionable`, `seleccionada`).
 */
export function TarjetaClase({ clase, variante, completa = true, seleccionable = false, seleccionada = false, className, style, ...boton }: TarjetaClaseProps) {
    const lugares = lugaresDeClase(clase);
    const cancelada = clase.status === 'cancelled';
    const oscura = clase.category === 'reformer';
    const enLista = variante === 'lista';
    const unaLinea = !enLista && !completa;
    const coach = clase.instructor_name?.trim() || '';
    const hora = formatClassTime(clase.start_time);
    const colorAlumna = oscura ? SALSA.alumna : colorPuntoAlumna(clase.class_type_color);
    const fondo = oscura ? 'oscuro' : 'claro';
    // En la rejilla los puntos van de 7 px con 2 px de aire: así caben 7 lugares y "Lleno"
    // en una columna de 120 px (laptop de 1280 con la barra lateral abierta).
    const tamanoPunto = enLista ? 10 : 7;
    const colorSinCoach = oscura ? SALSA.sinCoach : 'hsl(var(--destructive))';

    const aria = [
        `${clase.class_type_name || 'Clase'}${isClassIntensity(clase.intensity) ? `, Intensidad ${clase.intensity} de 3` : ''}`,
        hora,
        coach || 'sin coach asignada',
        cancelada ? 'cancelada' : `${lugares.ocupados} de ${lugares.capacidad} lugares`,
        clase.is_free ? 'gratis' : '',
        clase.booking_closed && !cancelada ? 'cupo cerrado' : '',
    ].filter(Boolean).join(', ');

    const marco: CSSProperties = {
        backgroundColor: oscura ? SALSA.fondo : fondoDeTarjeta(clase.class_type_color),
        borderColor: oscura ? SALSA.fondo : bordeDeTarjeta(clase.class_type_color),
        // En una línea no cabe "Sin coach asignada": la falta de coach se marca con el borde izquierdo.
        ...(unaLinea && !coach ? { borderLeftColor: colorSinCoach, borderLeftWidth: 3 } : {}),
        ...style,
    };

    const cupo = (
        <span data-cupo className={cn('ml-auto shrink-0 tabular-nums', enLista ? 'text-sm' : 'text-[11px] leading-[14px]', lugares.lleno ? 'font-bold' : 'font-medium')}>
            {etiquetaCupo(lugares)}
        </span>
    );

    return (
        <button
            type="button"
            {...boton}
            aria-label={aria}
            aria-pressed={seleccionable ? seleccionada : undefined}
            data-clase={clase.id}
            data-oscura={oscura ? 'true' : undefined}
            className={cn(
                'relative flex w-full min-w-0 flex-col overflow-hidden rounded-[10px] border text-left font-body transition-shadow duration-150',
                'hover:shadow-[0_10px_24px_-16px_rgba(22,38,26,.55)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-casa-verde focus-visible:ring-offset-1',
                // Rejilla: cada renglón con su alto fijo y sin encogerse; antes el de la coach
                // (truncate = overflow oculto) se aplastaba a 0 en las clases de 50 min.
                enLista ? 'gap-2 p-4' : unaLinea ? 'justify-center px-1.5 py-0.5' : 'justify-between px-1.5 py-1',
                oscura ? 'text-casa-avena' : 'text-casa-ciruela',
                cancelada && 'opacity-50',
                seleccionada && 'ring-2 ring-casa-verde ring-offset-1',
                className,
            )}
            style={marco}
        >
            {seleccionable && (
                <span
                    aria-hidden="true"
                    data-casilla
                    className={cn(
                        'absolute right-1 top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full border',
                        seleccionada ? 'border-casa-verde bg-casa-verde text-casa-avena' : 'border-[#9C8E80] bg-[#FCF8EF]',
                    )}
                >
                    {seleccionada && <Check className="h-2.5 w-2.5" strokeWidth={3.5} />}
                </span>
            )}
            <span className={cn('flex w-full min-w-0 shrink-0 items-baseline gap-1.5', seleccionable && !enLista && 'pr-4')}>
                <span
                    data-nombre-clase
                    className={cn('flex min-w-0 items-center gap-1 font-heading', enLista ? 'text-lg leading-tight' : 'text-[14px] leading-[18px]', cancelada && 'line-through')}
                >
                    <span className="truncate">{clase.class_type_name}</span>
                    <ClassIntensity intensity={clase.intensity} />
                    {clase.booking_closed && !cancelada && <Lock className="h-3 w-3 shrink-0 opacity-70" aria-hidden="true" />}
                </span>
                <span data-hora className={cn('shrink-0 tabular-nums opacity-75', enLista ? 'text-sm' : 'text-[11px]')}>{hora}</span>
                {unaLinea && !cancelada && cupo}
            </span>

            {!unaLinea && (
                <span
                    data-coach
                    className={cn('w-full shrink-0 truncate', enLista ? 'text-sm' : 'text-[11px] leading-[14px]', !coach && 'font-semibold')}
                    style={coach ? undefined : { color: colorSinCoach }}
                >
                    {coach || 'Sin coach asignada'}
                </span>
            )}

            {!unaLinea && (cancelada ? (
                <span className="shrink-0 text-[11px] font-semibold leading-[14px]">Cancelada</span>
            ) : (
                <span className={cn('flex w-full min-w-0 shrink-0 items-center', enLista ? 'gap-[3px]' : 'gap-[2px]')}>
                    {lugares.lugares.length <= MAX_PUNTOS_TARJETA ? (
                        // Con muchos lugares en columnas angostas los puntos se recortan; el cupo ("3/7") siempre se ve.
                        <span data-puntos className={cn('flex min-w-0 items-center overflow-hidden', enLista ? 'gap-[3px]' : 'gap-[2px]')}>
                            {lugares.lugares.map((l, i) => {
                                const e = estiloDeLugar(l, colorAlumna, fondo);
                                return <PuntoLugar key={i} relleno={e.relleno} anillo={e.anillo} tamano={tamanoPunto} data-lugar={claveDeLugar(l)} />;
                            })}
                        </span>
                    ) : (
                        // Cupo grande: los puntos no caben; se cuentan por tipo.
                        <span className="flex items-center gap-1 text-[11px] tabular-nums">
                            <PuntoLugar {...estiloDeLugar({ tipo: 'alumna' }, colorAlumna, fondo)} tamano={tamanoPunto} data-lugar="alumna" />
                            {lugares.alumnas}
                            {lugares.porCanal.map((x) => (
                                <span key={x.canal} className="ml-1 flex items-center gap-1">
                                    <PuntoLugar {...estiloDeLugar({ tipo: 'canal', canal: x.canal }, colorAlumna, fondo)} tamano={tamanoPunto} data-lugar={x.canal} />
                                    {x.reservados}
                                </span>
                            ))}
                        </span>
                    )}
                    {clase.is_free && (
                        <span className="ml-1 shrink-0 rounded-full bg-emerald-700 px-1.5 text-[9px] font-semibold uppercase tracking-wider text-white">Gratis</span>
                    )}
                    {cupo}
                </span>
            ))}
        </button>
    );
}
