/**
 * Geometría de la semana por horas: qué horas se ven, cuáles se compactan,
 * dónde va cada clase, qué hacer cuando dos se enciman y dónde va la línea de
 * "ahora" (siempre en hora de CDMX, nunca la del navegador ni la del servidor).
 *
 * Sin imports con alias "@/": lo prueba frontend/scripts/test-calendario-rejilla.ts.
 */
import { addDays, format } from 'date-fns';
import { es } from 'date-fns/locale';

/** Alto de una hora visible, en px. */
export const ALTO_HORA = 76;
/** Alto de la franja que reemplaza un tramo de horas sin clases en toda la semana. */
export const ALTO_FRANJA = 32;
/** Un hueco más corto que esto se deja a tamaño normal: compactarlo casi no ahorra y rompe el ritmo. */
export const HORAS_MINIMAS_PARA_COMPACTAR = 2;
/** Aire entre la tarjeta y la línea de la hora, arriba y abajo. */
export const MARGEN_TARJETA = 2;
/** Desde este alto la tarjeta cabe completa (nombre, coach y lugares); abajo va en una línea. */
export const ALTO_TARJETA_COMPLETA = 56;
/** Ninguna tarjeta mide menos que esto, aunque la clase dure 10 minutos. */
export const ALTO_TARJETA_MINIMO = 24;
/** Semana sin clases: de 7:00 a 21:00. */
export const RANGO_SIN_CLASES = { desde: 7 * 60, hasta: 21 * 60 };
/** Clase sin hora de fin válida: se dibuja como si durara esto. */
export const DURACION_SIN_FIN = 60;

const ZONA_ESTUDIO = 'America/Mexico_City';

export interface Intervalo {
    inicio: number;
    fin: number;
}

export type Tramo =
    | { tipo: 'horas'; desde: number; hasta: number; top: number; alto: number }
    | { tipo: 'franja'; desde: number; hasta: number; top: number; alto: number; etiqueta: string };

export interface Rejilla {
    tramos: Tramo[];
    altoTotal: number;
    /** Etiquetas del eje: una por cada hora en punto de los tramos de horas. */
    horas: { minuto: number; etiqueta: string; top: number }[];
}

interface ConHorario {
    start_time?: string | null;
    end_time?: string | null;
}

/** "07:30" o "07:30:00" → 450. Vacío o inválido → null. */
export function aMinutos(hora: string | null | undefined): number | null {
    if (!hora) return null;
    const m = /^(\d{1,2}):(\d{2})/.exec(hora.trim());
    if (!m) return null;
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (h > 23 || min > 59) return null;
    return h * 60 + min;
}

/** Inicio y fin en minutos. Sin fin, o con fin que no es posterior, dura DURACION_SIN_FIN (sin pasar de medianoche). */
export function intervaloDeClase(c: ConHorario): Intervalo | null {
    const inicio = aMinutos(c.start_time);
    if (inicio === null) return null;
    const fin = aMinutos(c.end_time);
    return { inicio, fin: fin !== null && fin > inicio ? fin : Math.min(inicio + DURACION_SIN_FIN, 24 * 60) };
}

/** Horas visibles de la semana: las que tienen alguna clase; los huecos de 2 h o más se vuelven una franja. */
export function construirRejilla(clases: ConHorario[]): Rejilla {
    const ocupadas = new Set<number>();
    for (const c of clases) {
        const iv = intervaloDeClase(c);
        if (!iv) continue;
        for (let h = Math.floor(iv.inicio / 60); h < Math.ceil(iv.fin / 60); h++) ocupadas.add(h);
    }
    if (ocupadas.size === 0) {
        for (let h = RANGO_SIN_CLASES.desde / 60; h < RANGO_SIN_CLASES.hasta / 60; h++) ocupadas.add(h);
    }
    const primera = Math.min(...ocupadas);
    const ultima = Math.max(...ocupadas);

    // visible[i] dice si la hora (primera + i) se dibuja completa.
    const visible: boolean[] = [];
    for (let h = primera; h <= ultima; h++) visible.push(ocupadas.has(h));
    for (let i = 0; i < visible.length; ) {
        if (visible[i]) { i++; continue; }
        let j = i;
        while (j < visible.length && !visible[j]) j++;
        if (j - i < HORAS_MINIMAS_PARA_COMPACTAR) for (let k = i; k < j; k++) visible[k] = true;
        i = j;
    }

    const tramos: Tramo[] = [];
    let top = 0;
    for (let i = 0; i < visible.length; ) {
        let j = i;
        while (j < visible.length && visible[j] === visible[i]) j++;
        const desde = (primera + i) * 60;
        const hasta = (primera + j) * 60;
        if (visible[i]) {
            const alto = (j - i) * ALTO_HORA;
            tramos.push({ tipo: 'horas', desde, hasta, top, alto });
            top += alto;
        } else {
            tramos.push({ tipo: 'franja', desde, hasta, top, alto: ALTO_FRANJA, etiqueta: `${primera + i} – ${primera + j}` });
            top += ALTO_FRANJA;
        }
        i = j;
    }

    const horas: Rejilla['horas'] = [];
    for (const t of tramos) {
        if (t.tipo !== 'horas') continue;
        for (let m = t.desde; m < t.hasta; m += 60) {
            horas.push({ minuto: m, etiqueta: `${m / 60}:00`, top: t.top + ((m - t.desde) / 60) * ALTO_HORA });
        }
    }
    return { tramos, altoTotal: top, horas };
}

/** Posición vertical (px) de un minuto del día; dentro de una franja es proporcional. Fuera de la rejilla → null. */
export function yDeMinuto(rejilla: Rejilla, minuto: number): number | null {
    for (const t of rejilla.tramos) {
        if (minuto < t.desde || minuto > t.hasta) continue;
        return t.top + ((minuto - t.desde) / (t.hasta - t.desde)) * t.alto;
    }
    return null;
}

/** Dónde se dibuja una clase: top y alto en px, y si cabe completa. Fuera de la rejilla → null. */
export function posicionDeClase(rejilla: Rejilla, c: ConHorario): { top: number; alto: number; completa: boolean } | null {
    const iv = intervaloDeClase(c);
    if (!iv) return null;
    const y0 = yDeMinuto(rejilla, iv.inicio);
    const y1 = yDeMinuto(rejilla, iv.fin);
    if (y0 === null || y1 === null) return null;
    const alto = Math.max(Math.round(y1) - Math.round(y0) - 2 * MARGEN_TARJETA, ALTO_TARJETA_MINIMO);
    return { top: Math.round(y0) + MARGEN_TARJETA, alto, completa: alto >= ALTO_TARJETA_COMPLETA };
}

/**
 * Clases del mismo día que se enciman (p. ej. una cancelada y la que la reemplaza a la
 * misma hora) van lado a lado: `carril` es su columna y `total` cuántas columnas usa su grupo.
 */
export function carriles(items: Array<{ id: string } & Intervalo>): Map<string, { carril: number; total: number }> {
    const orden = [...items].sort((a, b) => a.inicio - b.inicio || a.fin - b.fin || a.id.localeCompare(b.id));
    const resultado = new Map<string, { carril: number; total: number }>();
    let grupo: Array<{ id: string; carril: number }> = [];
    let finesPorCarril: number[] = [];
    let finDelGrupo = -Infinity;
    const cerrarGrupo = () => {
        for (const g of grupo) resultado.set(g.id, { carril: g.carril, total: finesPorCarril.length });
        grupo = [];
        finesPorCarril = [];
        finDelGrupo = -Infinity;
    };
    for (const it of orden) {
        if (grupo.length > 0 && it.inicio >= finDelGrupo) cerrarGrupo();
        let carril = finesPorCarril.findIndex((fin) => fin <= it.inicio);
        if (carril === -1) {
            carril = finesPorCarril.length;
            finesPorCarril.push(it.fin);
        } else {
            finesPorCarril[carril] = it.fin;
        }
        grupo.push({ id: it.id, carril });
        finDelGrupo = Math.max(finDelGrupo, it.fin);
    }
    if (grupo.length > 0) cerrarGrupo();
    return resultado;
}

const FORMATO_CDMX = new Intl.DateTimeFormat('en-US', {
    timeZone: ZONA_ESTUDIO,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
});

/** Fecha (YYYY-MM-DD) y minuto del día en el estudio para un instante dado. */
export function ahoraEnCdmx(instante: Date): { fecha: string; minutos: number } {
    const partes = FORMATO_CDMX.formatToParts(instante);
    const parte = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? '';
    return {
        fecha: `${parte('year')}-${parte('month')}-${parte('day')}`,
        minutos: (Number(parte('hour')) % 24) * 60 + Number(parte('minute')),
    };
}

/** Línea de "ahora": solo si hoy está en la semana y la hora cae dentro de la rejilla. */
export function lineaAhora(
    rejilla: Rejilla,
    fechasDeLaSemana: string[],
    ahora: { fecha: string; minutos: number },
): { fecha: string; top: number } | null {
    if (!fechasDeLaSemana.includes(ahora.fecha)) return null;
    const y = yDeMinuto(rejilla, ahora.minutos);
    return y === null ? null : { fecha: ahora.fecha, top: Math.round(y) };
}

/** "2 – 8 de noviembre de 2026", "28 de septiembre – 4 de octubre de 2026", o con los dos años si cruza. */
export function tituloSemana(lunes: Date): string {
    const domingo = addDays(lunes, 6);
    const completo = "d 'de' MMMM 'de' yyyy";
    if (lunes.getFullYear() !== domingo.getFullYear()) {
        return `${format(lunes, completo, { locale: es })} – ${format(domingo, completo, { locale: es })}`;
    }
    if (lunes.getMonth() !== domingo.getMonth()) {
        return `${format(lunes, "d 'de' MMMM", { locale: es })} – ${format(domingo, completo, { locale: es })}`;
    }
    return `${format(lunes, 'd')} – ${format(domingo, completo, { locale: es })}`;
}
