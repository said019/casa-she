/**
 * Los lugares de una clase: quién ocupa cada uno (alumna de Casa Shé o socia de
 * una plataforma) y los resúmenes de día y de semana.
 *
 * current_bookings cuenta a TODAS las inscritas de todos los canales (trigger
 * update_class_booking_count). Alumnas de Casa Shé = current_bookings − Σ booked
 * de los canales, nunca menos de 0.
 *
 * Sin imports con alias "@/": lo prueba frontend/scripts/test-calendario-lugares.ts.
 */
import { CANALES, esCanal } from '../../../../lib/canales';

/** Más lugares que esto no caben como puntos en la tarjeta: se muestran contados. */
export const MAX_PUNTOS_TARJETA = 12;
/** Anillo de un lugar libre sobre fondo claro (el mismo de la leyenda). */
export const ANILLO_LIBRE_CLARO = '#9C8E80';
/** Anillo de un lugar libre sobre la tarjeta oscura de Salsa. */
export const ANILLO_LIBRE_OSCURO = 'rgba(246, 240, 228, 0.55)';
/** Plataforma que existe en la base pero no en el catálogo (p. ej. wellhub): neutra, también con anillo. */
const CANAL_SIN_CATALOGO = { punto: '#B8AEA2', anillo: '#6B554D' };

export interface CanalDeClase {
    channel: string;
    max: number;
    booked: number;
}

export interface ClaseConLugares {
    current_bookings?: number | string | null;
    max_capacity?: number | string | null;
    status?: string | null;
    channels?: Array<CanalDeClase | null> | null;
}

export type Lugar = { tipo: 'alumna' } | { tipo: 'canal'; canal: string } | { tipo: 'libre' };

export interface LugaresDeClase {
    capacidad: number;
    /** Alumnas + socias. */
    ocupados: number;
    alumnas: number;
    /** Solo canales con reservas, en el orden del catálogo (TotalPass, Fitpass) y luego los demás. */
    porCanal: { canal: string; reservados: number }[];
    socias: number;
    libres: number;
    lleno: boolean;
    /** Un elemento por lugar: alumnas, luego socias por canal, luego libres. */
    lugares: Lugar[];
}

export interface ResumenDeClases {
    clases: number;
    libres: number;
    socias: number;
}

const entero = (v: unknown): number => {
    const n = Math.floor(Number(v));
    return Number.isFinite(n) && n > 0 ? n : 0;
};

const ORDEN_CATALOGO = Object.keys(CANALES);

function compararCanales(a: string, b: string): number {
    const ia = ORDEN_CATALOGO.indexOf(a);
    const ib = ORDEN_CATALOGO.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
}

export function lugaresDeClase(c: ClaseConLugares): LugaresDeClase {
    const capacidad = entero(c.max_capacity);
    const reservasPorCanal = new Map<string, number>();
    for (const fila of c.channels ?? []) {
        if (!fila || typeof fila.channel !== 'string') continue;
        const n = entero(fila.booked);
        if (n > 0) reservasPorCanal.set(fila.channel, (reservasPorCanal.get(fila.channel) ?? 0) + n);
    }
    const porCanal = [...reservasPorCanal.entries()]
        .sort(([a], [b]) => compararCanales(a, b))
        .map(([canal, reservados]) => ({ canal, reservados }));
    const socias = porCanal.reduce((suma, x) => suma + x.reservados, 0);
    const alumnas = Math.max(0, entero(c.current_bookings) - socias);
    const ocupados = alumnas + socias;
    const libres = Math.max(0, capacidad - ocupados);

    const lugares: Lugar[] = [];
    for (let i = 0; i < alumnas; i++) lugares.push({ tipo: 'alumna' });
    for (const x of porCanal) for (let i = 0; i < x.reservados; i++) lugares.push({ tipo: 'canal', canal: x.canal });
    for (let i = 0; i < libres; i++) lugares.push({ tipo: 'libre' });

    return { capacidad, ocupados, alumnas, porCanal, socias, libres, lleno: capacidad > 0 && ocupados >= capacidad, lugares };
}

/** Tarjeta: "3/7" o "Lleno". */
export function etiquetaCupo(l: LugaresDeClase): string {
    return l.lleno ? 'Lleno' : `${l.ocupados}/${l.capacidad}`;
}

/** Panel: "3 de 7 · 4 libres", "6 de 7 · 1 libre" o "7 de 7 · llena". */
export function etiquetaCupoLarga(l: LugaresDeClase): string {
    const resto = l.libres === 0 ? 'llena' : l.libres === 1 ? '1 libre' : `${l.libres} libres`;
    return `${l.ocupados} de ${l.capacidad} · ${resto}`;
}

/** Relleno y anillo de un punto. Los canales SIEMPRE llevan su anillo (sin él, el verde queda a ~2:1 sobre crema). */
export function estiloDeLugar(
    lugar: Lugar,
    colorAlumna: string,
    fondo: 'claro' | 'oscuro' = 'claro',
): { relleno: string; anillo: string } {
    if (lugar.tipo === 'alumna') return { relleno: colorAlumna, anillo: colorAlumna };
    if (lugar.tipo === 'libre') return { relleno: 'transparent', anillo: fondo === 'oscuro' ? ANILLO_LIBRE_OSCURO : ANILLO_LIBRE_CLARO };
    const c = esCanal(lugar.canal) ? CANALES[lugar.canal] : CANAL_SIN_CATALOGO;
    return { relleno: c.punto, anillo: c.anillo };
}

/** Clases activas (las canceladas no cuentan), lugares libres y socias de plataformas. */
export function resumenDeClases(clases: ClaseConLugares[]): ResumenDeClases {
    return clases
        .filter((c) => c.status !== 'cancelled')
        .reduce<ResumenDeClases>((acc, c) => {
            const l = lugaresDeClase(c);
            return { clases: acc.clases + 1, libres: acc.libres + l.libres, socias: acc.socias + l.socias };
        }, { clases: 0, libres: 0, socias: 0 });
}

/** Encabezado del día: "2 clases · 4 libres" o "Sin clases". */
export function textoResumenDia(r: ResumenDeClases): string {
    if (r.clases === 0) return 'Sin clases';
    return `${r.clases} ${r.clases === 1 ? 'clase' : 'clases'} · ${r.libres} ${r.libres === 1 ? 'libre' : 'libres'}`;
}

/** Barra: "4 clases · 11 lugares libres · 3 socias". */
export function textoResumenSemana(r: ResumenDeClases): string {
    return [
        `${r.clases} ${r.clases === 1 ? 'clase' : 'clases'}`,
        `${r.libres} ${r.libres === 1 ? 'lugar libre' : 'lugares libres'}`,
        `${r.socias} ${r.socias === 1 ? 'socia' : 'socias'}`,
    ].join(' · ');
}
