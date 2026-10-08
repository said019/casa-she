import { Clock, UserRoundCheck, X, XCircle } from 'lucide-react';
import { canalesConectados } from '@/lib/canales';
import { ChannelLogo } from '@/components/brands/ChannelLogo';
import { cn } from '@/lib/utils';
import type { AccionLote } from './seleccion';

interface BarraSeleccionProps {
    /** "4 clases" o "Ninguna clase". */
    titulo: string;
    /** "9 inscritas · 2 de TotalPass" o "Toca una clase para empezar". */
    detalle: string;
    /** Hay al menos una clase seleccionada. */
    activa: boolean;
    /** La acción cuya ventana está abierta (se resalta su botón). */
    abierta: AccionLote | null;
    onAccion: (accion: AccionLote) => void;
    onTerminar: () => void;
}

const BOTON = 'flex h-11 items-center gap-2 rounded-xl px-3.5 font-medium transition-colors hover:bg-white/10 disabled:pointer-events-none disabled:opacity-45';

/** Barra oscura de abajo en modo "Seleccionar varias": qué hay seleccionado y las cuatro acciones. Solo escritorio. */
export function BarraSeleccion({ titulo, detalle, activa, abierta, onAccion, onTerminar }: BarraSeleccionProps) {
    const resaltada = (a: AccionLote) => abierta === a && 'bg-casa-verde hover:bg-casa-verde';
    return (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-40 hidden justify-center px-4 lg:flex">
            <div
                role="toolbar"
                aria-label="Acciones para las clases seleccionadas"
                className="pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-1 rounded-[20px] bg-casa-profundo py-2.5 pl-5 pr-2.5 text-casa-avena shadow-[0_24px_48px_-20px_rgba(22,38,26,.65)]"
            >
                <div className="mr-3 flex min-w-[150px] flex-col" data-testid="resumen-seleccion">
                    <span className="font-heading text-2xl leading-none">{titulo}</span>
                    <span className="text-xs text-casa-avena/75">{detalle}</span>
                </div>
                <button type="button" className={cn(BOTON, resaltada('coach'))} disabled={!activa} onClick={() => onAccion('coach')}>
                    <UserRoundCheck className="h-[17px] w-[17px]" aria-hidden="true" /> Cambiar coach
                </button>
                <button type="button" className={cn(BOTON, resaltada('cupo_canal'))} disabled={!activa} onClick={() => onAccion('cupo_canal')}>
                    Cupo {canalesConectados().map((c) => <ChannelLogo key={c.clave} canal={c.clave} fondo="oscuro" alto={10} />)}
                </button>
                <button type="button" className={cn(BOTON, resaltada('mover'))} disabled={!activa} onClick={() => onAccion('mover')}>
                    <Clock className="h-[17px] w-[17px]" aria-hidden="true" /> Mover o cambiar clase
                </button>
                <button type="button" className={cn(BOTON, 'text-[#F2B8AC]', resaltada('cancelar'))} disabled={!activa} onClick={() => onAccion('cancelar')}>
                    <XCircle className="h-[17px] w-[17px]" aria-hidden="true" /> Cancelar clases
                </button>
                <button
                    type="button"
                    aria-label="Terminar selección"
                    onClick={onTerminar}
                    className="ml-1.5 grid h-11 w-11 place-items-center rounded-xl border border-casa-avena/25 hover:bg-white/10"
                >
                    <X className="h-4 w-4" aria-hidden="true" />
                </button>
            </div>
        </div>
    );
}
