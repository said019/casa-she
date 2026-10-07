import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';
import { CANALES, type CanalClave } from '@/lib/canales';

interface PuntoLugarProps extends HTMLAttributes<HTMLSpanElement> {
    /** Relleno ('transparent' para un lugar libre). */
    relleno: string;
    /** Anillo. Siempre se pinta: sin él, el verde de TotalPass queda a ~2:1 sobre crema. */
    anillo: string;
    /** Diámetro en px. */
    tamano?: number;
    /** Quién ocupa el lugar ('alumna', 'libre' o la clave del canal); lo usan las pruebas. */
    'data-lugar'?: string;
}

/** Un lugar de la clase: punto con anillo. Decorativo; el número que va al lado lo dice en texto. */
export function PuntoLugar({ relleno, anillo, tamano = 8, className, style, ...resto }: PuntoLugarProps) {
    return (
        <span
            aria-hidden="true"
            {...resto}
            className={cn('inline-block shrink-0 rounded-full', className)}
            style={{
                width: tamano,
                height: tamano,
                backgroundColor: relleno,
                boxShadow: `inset 0 0 0 ${Math.max(1.25, tamano / 10)}px ${anillo}`,
                ...style,
            }}
        />
    );
}

/** Punto de una socia de la plataforma: su color con su anillo, nunca uno sin el otro. */
export function ChannelDot({ canal, tamano = 8, className }: { canal: CanalClave; tamano?: number; className?: string }) {
    const c = CANALES[canal];
    return <PuntoLugar relleno={c.punto} anillo={c.anillo} tamano={tamano} className={className} />;
}
