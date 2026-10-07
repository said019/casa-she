import type { ButtonHTMLAttributes, CSSProperties } from 'react';
import { Lock } from 'lucide-react';
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
}

const claveDeLugar = (l: Lugar) => (l.tipo === 'canal' ? l.canal : l.tipo);

/**
 * Tarjeta de una clase: nombre con intensidad, hora, coach y los lugares como puntos
 * (alumnas de Casa Shé con el color del tipo, cada plataforma con el suyo, libres huecos).
 * Los props de botón pasan tal cual, para que la Entrega 3 agregue selección sin reescribirla.
 */
export function TarjetaClase({ clase, variante, completa = true, className, style, ...boton }: TarjetaClaseProps) {
    const lugares = lugaresDeClase(clase);
    const cancelada = clase.status === 'cancelled';
    const oscura = clase.category === 'reformer';
    const enLista = variante === 'lista';
    const unaLinea = !enLista && !completa;
    const coach = clase.instructor_name?.trim() || '';
    const hora = formatClassTime(clase.start_time);
    const colorAlumna = oscura ? SALSA.alumna : colorPuntoAlumna(clase.class_type_color);
    const fondo = oscura ? 'oscuro' : 'claro';
    const tamanoPunto = enLista ? 10 : 8;
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
        <span className={cn('ml-auto shrink-0 tabular-nums', enLista ? 'text-sm' : 'text-[11px]', lugares.lleno ? 'font-bold' : 'font-medium')}>
            {etiquetaCupo(lugares)}
        </span>
    );

    return (
        <button
            type="button"
            {...boton}
            aria-label={aria}
            data-clase={clase.id}
            data-oscura={oscura ? 'true' : undefined}
            className={cn(
                'flex w-full min-w-0 flex-col overflow-hidden rounded-[10px] border text-left font-body transition-shadow duration-150',
                'hover:shadow-[0_10px_24px_-16px_rgba(22,38,26,.55)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-casa-verde focus-visible:ring-offset-1',
                enLista ? 'gap-2 p-4' : unaLinea ? 'justify-center px-2 py-0.5' : 'justify-between gap-px px-2 py-1.5',
                oscura ? 'text-casa-avena' : 'text-casa-ciruela',
                cancelada && 'opacity-50',
                className,
            )}
            style={marco}
        >
            <span className="flex w-full min-w-0 items-baseline gap-1.5">
                <span
                    data-nombre-clase
                    className={cn('flex min-w-0 items-center gap-1 font-heading leading-tight', enLista ? 'text-lg' : 'text-[15px]', cancelada && 'line-through')}
                >
                    <span className="truncate">{clase.class_type_name}</span>
                    <ClassIntensity intensity={clase.intensity} />
                    {clase.booking_closed && !cancelada && <Lock className="h-3 w-3 shrink-0 opacity-70" aria-hidden="true" />}
                </span>
                <span className={cn('shrink-0 tabular-nums opacity-75', enLista ? 'text-sm' : 'text-[11px]')}>{hora}</span>
                {unaLinea && !cancelada && cupo}
            </span>

            {!unaLinea && (
                <span
                    className={cn('w-full truncate', enLista ? 'text-sm' : 'text-[11.5px] leading-4', !coach && 'font-semibold')}
                    style={coach ? undefined : { color: colorSinCoach }}
                >
                    {coach || 'Sin coach asignada'}
                </span>
            )}

            {!unaLinea && (cancelada ? (
                <span className="text-[11px] font-semibold">Cancelada</span>
            ) : (
                <span className="flex w-full min-w-0 items-center gap-[3px]">
                    {lugares.lugares.length <= MAX_PUNTOS_TARJETA ? (
                        lugares.lugares.map((l, i) => {
                            const e = estiloDeLugar(l, colorAlumna, fondo);
                            return <PuntoLugar key={i} relleno={e.relleno} anillo={e.anillo} tamano={tamanoPunto} data-lugar={claveDeLugar(l)} />;
                        })
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
