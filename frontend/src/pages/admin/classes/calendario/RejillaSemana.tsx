import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import type { Class } from '@/types/class';
import { DAYS } from './formato';
import { EncabezadoDia } from './EncabezadoDia';
import { TarjetaClase } from './TarjetaClase';
import { resumenDeClases, textoResumenDia } from './lugares';
import { ALTO_HORA, ahoraEnCdmx, carriles, construirRejilla, intervaloDeClase, lineaAhora, posicionDeClase } from './rejilla';

export interface RejillaSemanaProps {
    /** Lunes a domingo. */
    dias: Date[];
    /** Clases ya filtradas de un día. */
    clasesDelDia: (dia: Date) => Class[];
    diasCerrados: Set<string>;
    motivoCierre: (dia: Date) => string | undefined;
    onClickClase: (clase: Class) => void;
    onClickDia: (dia: Date) => void;
    /**
     * Modo "Seleccionar varias": clic en una tarjeta la marca o desmarca (las canceladas no
     * se seleccionan) y clic en el encabezado del día marca o desmarca todo el día.
     */
    seleccion?: {
        ids: ReadonlySet<string>;
        onAlternarClase: (clase: Class) => void;
        onAlternarDia: (dia: Date, clases: Class[]) => void;
    };
}

/** Fecha y minuto actuales en CDMX; se refresca cada minuto para mover la línea de "ahora". */
function useAhoraCdmx() {
    const [ahora, setAhora] = useState(() => ahoraEnCdmx(new Date()));
    useEffect(() => {
        const id = window.setInterval(() => setAhora(ahoraEnCdmx(new Date())), 60_000);
        return () => window.clearInterval(id);
    }, []);
    return ahora;
}

const LINEA_DE_HORA = `repeating-linear-gradient(to bottom, transparent 0, transparent ${ALTO_HORA - 1}px, #ECE6D6 ${ALTO_HORA - 1}px, #ECE6D6 ${ALTO_HORA}px)`;
const RAYADO_FRANJA = 'repeating-linear-gradient(135deg, #F1E9D8 0, #F1E9D8 5px, transparent 5px, transparent 11px)';

/**
 * Semana por horas (escritorio): eje de horas a la izquierda y una columna por día.
 * Cada clase va a la altura de su hora de inicio y mide lo que dura; las horas sin
 * clases en toda la semana se compactan en una franja. Línea de "ahora" en el día de hoy.
 */
export function RejillaSemana({ dias, clasesDelDia, diasCerrados, motivoCierre, onClickClase, onClickDia, seleccion }: RejillaSemanaProps) {
    const ahora = useAhoraCdmx();
    const columnas = dias.map((dia) => ({ dia, clave: format(dia, 'yyyy-MM-dd'), clases: clasesDelDia(dia) }));
    const rejilla = construirRejilla(columnas.flatMap((c) => c.clases));
    const linea = lineaAhora(rejilla, columnas.map((c) => c.clave), ahora);

    return (
        <div className="overflow-x-auto rounded-[18px] border border-casa-arena bg-[hsl(var(--admin-panel))]">
            {/* 60 px de eje + 7 días de ~120 px: cabe en una laptop de 1280 con la barra lateral
                abierta. Si aun así hay scroll, el eje de horas se queda fijo a la izquierda
                (fondo opaco del panel; por encima de las tarjetas, por debajo de los diálogos). */}
            <div className="flex min-w-[900px]">
                <div className="sticky left-0 z-[5] w-[60px] flex-none border-r border-casa-arena/60 bg-[hsl(var(--admin-panel))]">
                    <div className="h-[68px] border-b border-casa-arena" />
                    <div className="relative" style={{ height: rejilla.altoTotal }}>
                        {rejilla.horas.map((h) => (
                            <span key={h.minuto} className="absolute right-2.5 pt-1 text-xs tabular-nums text-casa-ciruela/70" style={{ top: h.top }}>
                                {h.etiqueta}
                            </span>
                        ))}
                        {rejilla.tramos.map((t) => t.tipo === 'franja' && (
                            <span
                                key={t.desde}
                                data-testid="franja-compactada"
                                title="Horas sin clases en toda la semana"
                                className="absolute inset-x-0 flex items-center justify-center text-[11px] text-casa-ciruela/55"
                                style={{ top: t.top, height: t.alto }}
                            >
                                {t.etiqueta}
                            </span>
                        ))}
                    </div>
                </div>

                {columnas.map(({ dia, clave, clases }, i) => {
                    const cerrado = diasCerrados.has(clave);
                    const esHoy = clave === ahora.fecha;
                    const lanes = carriles(clases.flatMap((c) => {
                        const iv = intervaloDeClase(c);
                        return iv ? [{ id: c.id, ...iv }] : [];
                    }));
                    return (
                        <div
                            key={clave}
                            className={cn('min-w-0 flex-1 border-r border-casa-arena/60 last:border-r-0', esHoy && 'bg-casa-verde/[0.03]', cerrado && 'bg-destructive/5')}
                        >
                            <EncabezadoDia
                                fecha={dia}
                                etiqueta={DAYS[i]}
                                esHoy={esHoy}
                                cerrado={cerrado}
                                motivoCierre={motivoCierre(dia)}
                                resumen={textoResumenDia(resumenDeClases(clases))}
                                modoSeleccion={!!seleccion}
                                onClick={() => (seleccion ? seleccion.onAlternarDia(dia, clases) : onClickDia(dia))}
                            />
                            <div data-testid={`columna-${clave}`} className="relative" style={{ height: rejilla.altoTotal }}>
                                {rejilla.tramos.map((t) => (
                                    <div
                                        key={t.desde}
                                        aria-hidden="true"
                                        className={cn('absolute inset-x-0', t.tipo === 'franja' && 'border-y border-casa-arena/70')}
                                        style={{ top: t.top, height: t.alto, backgroundImage: t.tipo === 'horas' ? LINEA_DE_HORA : RAYADO_FRANJA }}
                                    />
                                ))}
                                {linea?.fecha === clave && (
                                    <div
                                        data-testid="linea-ahora"
                                        aria-hidden="true"
                                        className="pointer-events-none absolute inset-x-0 z-[3] h-0 border-t-2 border-casa-arcilla"
                                        style={{ top: linea.top }}
                                    >
                                        <span className="absolute -left-px -top-[6px] h-2.5 w-2.5 rounded-full bg-casa-arcilla" />
                                    </div>
                                )}
                                {clases.map((c) => {
                                    const pos = posicionDeClase(rejilla, c);
                                    if (!pos) return null;
                                    const carril = lanes.get(c.id) ?? { carril: 0, total: 1 };
                                    const seleccionable = !!seleccion && c.status !== 'cancelled';
                                    return (
                                        <TarjetaClase
                                            key={c.id}
                                            clase={c}
                                            variante="rejilla"
                                            completa={pos.completa}
                                            seleccionable={seleccionable}
                                            seleccionada={seleccionable && seleccion!.ids.has(c.id)}
                                            onClick={() => {
                                                if (!seleccion) onClickClase(c);
                                                else if (seleccionable) seleccion.onAlternarClase(c);
                                            }}
                                            className="absolute z-[2]"
                                            style={{
                                                top: pos.top,
                                                height: pos.alto,
                                                left: `calc(${(carril.carril / carril.total) * 100}% + 4px)`,
                                                width: `calc(${100 / carril.total}% - 8px)`,
                                            }}
                                        />
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
