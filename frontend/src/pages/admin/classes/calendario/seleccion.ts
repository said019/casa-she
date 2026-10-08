/**
 * "Varias a la vez": qué clases están seleccionadas, los atajos que salen de la última
 * clase tocada, los textos de la barra y de los botones, y la acción inversa para
 * "Deshacer". También los tipos de POST /api/classes/bulk.
 *
 * Sin imports con alias "@/": lo prueba frontend/scripts/test-calendario-seleccion.ts.
 */
import { lugaresDeClase, type ClaseConLugares } from './lugares';

export interface ClaseSeleccionable extends ClaseConLugares {
    id: string;
    /** YYYY-MM-DD (puede venir con hora: "2026-11-04T00:00:00.000Z"). */
    date: string;
    start_time: string;
    status?: string | null;
    instructor_id: string;
    instructor_name?: string | null;
    class_type_id: string;
    class_type_name?: string | null;
}

// ── POST /api/classes/bulk ───────────────────────────────────────────────────

export type AccionLote = 'coach' | 'cupo_canal' | 'mover' | 'cancelar';

export interface ParametrosLote {
    instructorId?: string;
    canal?: 'totalpass' | 'fitpass';
    lugares?: number;
    minutos?: number;
    classTypeId?: string;
    motivo?: string;
}

export interface CuerpoLote extends ParametrosLote {
    classIds: string[];
    accion: AccionLote;
    vistaPrevia: boolean;
}

export interface ClaseDelLote {
    classId: string;
    estado: 'ok' | 'bloqueada';
    motivo?: string;
    alumnasAvisadas: number;
    sociasPorCanal: Record<string, number>;
    sociasPierdenLugar: number;
    advertencias: string[];
}

export interface RespuestaLote {
    clases: ClaseDelLote[];
    resumen: { ok: number; bloqueadas: number; alumnasAvisadas: number; sociasPierdenLugar: number };
    aplicado: boolean;
}

// ── Formatos ─────────────────────────────────────────────────────────────────

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const DIAS_CORTOS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

export const fechaDeClase = (c: { date: string }) => (c.date || '').slice(0, 10);
const diaDeLaSemana = (fecha: string) => new Date(`${fecha}T12:00:00Z`).getUTCDay();
/** "08:00" o "08:00:00" → "8:00". */
export const horaCorta = (hora: string) => `${Number((hora || '').slice(0, 2))}:${(hora || '').slice(3, 5)}`;
/** "1 clase", "4 clases". */
export const nClases = (n: number) => `${n} ${n === 1 ? 'clase' : 'clases'}`;
const nAlumnas = (n: number) => `${n} ${n === 1 ? 'alumna' : 'alumnas'}`;
const clave = (c: ClaseSeleccionable) => `${fechaDeClase(c)} ${(c.start_time || '').slice(0, 5)}`;

/** Las canceladas se ven pero no se seleccionan. */
export const esSeleccionable = (c: { status?: string | null }) => c.status !== 'cancelled';

// ── Selección ────────────────────────────────────────────────────────────────

/** Marca o desmarca una clase. */
export function alternar(sel: ReadonlySet<string>, id: string): Set<string> {
    const nueva = new Set(sel);
    if (nueva.has(id)) nueva.delete(id);
    else nueva.add(id);
    return nueva;
}

/** Encabezado del día: si ya están todas las seleccionables del día, las quita; si no, las agrega. */
export function alternarGrupo(sel: ReadonlySet<string>, clases: ClaseSeleccionable[]): Set<string> {
    const ids = clases.filter(esSeleccionable).map((c) => c.id);
    const nueva = new Set(sel);
    const todas = ids.length > 0 && ids.every((id) => nueva.has(id));
    for (const id of ids) {
        if (todas) nueva.delete(id);
        else nueva.add(id);
    }
    return nueva;
}

/** Las clases seleccionadas que están a la vista, por día y hora. */
export function clasesSeleccionadas<T extends ClaseSeleccionable>(sel: ReadonlySet<string>, clases: T[]): T[] {
    return clases.filter((c) => sel.has(c.id)).sort((a, b) => clave(a).localeCompare(clave(b)));
}

export interface Atajo {
    etiqueta: string;
    ids: string[];
}

/**
 * Atajos según la última clase tocada: "Mismo horario (8:00)", "Las de Ana",
 * "Todas las Barre", "Todo el miércoles". Cada uno REEMPLAZA la selección por las
 * clases seleccionables a la vista que cumplen.
 */
export function atajosDesde(ancla: ClaseSeleccionable | null | undefined, visibles: ClaseSeleccionable[]): Atajo[] {
    if (!ancla) return [];
    const activas = visibles.filter(esSeleccionable);
    const ids = (f: (c: ClaseSeleccionable) => boolean) => activas.filter(f).map((c) => c.id);
    const hora = (ancla.start_time || '').slice(0, 5);
    const dia = fechaDeClase(ancla);
    const coach = ancla.instructor_name?.trim();
    const atajos: Atajo[] = [{ etiqueta: `Mismo horario (${horaCorta(hora)})`, ids: ids((c) => (c.start_time || '').slice(0, 5) === hora) }];
    if (coach) atajos.push({ etiqueta: `Las de ${coach}`, ids: ids((c) => c.instructor_id === ancla.instructor_id) });
    atajos.push({ etiqueta: `Todas las ${ancla.class_type_name || 'de este tipo'}`, ids: ids((c) => c.class_type_id === ancla.class_type_id) });
    atajos.push({ etiqueta: `Todo el ${DIAS[diaDeLaSemana(dia)]}`, ids: ids((c) => fechaDeClase(c) === dia) });
    return atajos;
}

/** Barra inferior: "4 clases" y "9 inscritas · 2 de TotalPass". */
export function resumenSeleccion(clases: ClaseSeleccionable[]): { titulo: string; detalle: string; inscritas: number; totalpass: number } {
    let inscritas = 0;
    let totalpass = 0;
    for (const c of clases) {
        const l = lugaresDeClase(c);
        inscritas += l.ocupados;
        totalpass += l.porCanal.find((x) => x.canal === 'totalpass')?.reservados ?? 0;
    }
    if (clases.length === 0) return { titulo: 'Ninguna clase', detalle: 'Toca una clase para empezar', inscritas, totalpass };
    return { titulo: nClases(clases.length), detalle: `${inscritas} inscritas · ${totalpass} de TotalPass`, inscritas, totalpass };
}

/** "Barre · lun 7:00, mié 8:00" si son del mismo tipo; si no, "Barre lun 7:00, Sculpt mié 8:00". */
export function listaSeleccion(clases: ClaseSeleccionable[]): string {
    if (clases.length === 0) return 'Ninguna clase seleccionada';
    const cuando = (c: ClaseSeleccionable) => `${DIAS_CORTOS[diaDeLaSemana(fechaDeClase(c))]} ${horaCorta(c.start_time)}`;
    const tipos = new Set(clases.map((c) => c.class_type_name || 'Clase'));
    if (tipos.size === 1) return `${[...tipos][0]} · ${clases.map(cuando).join(', ')}`;
    return clases.map((c) => `${c.class_type_name || 'Clase'} ${cuando(c)}`).join(', ');
}

/** Quita de la selección las que el servidor marcó como bloqueadas. */
export function quitarBloqueadas(sel: ReadonlySet<string>, r: RespuestaLote): Set<string> {
    const bloqueadas = new Set(r.clases.filter((c) => c.estado === 'bloqueada').map((c) => c.classId));
    return new Set([...sel].filter((id) => !bloqueadas.has(id)));
}

// ── Textos de las acciones ───────────────────────────────────────────────────

/** 30 → "30 min", 60 → "1 h", 90 → "1 h 30 min". */
export function duracion(minutos: number): string {
    const m = Math.abs(minutos);
    const h = Math.floor(m / 60);
    const resto = m % 60;
    return [h ? `${h} h` : '', resto ? `${resto} min` : ''].filter(Boolean).join(' ');
}

/** Lo que dice el botón de aplicar: exactamente lo que va a pasar. */
export function textoBoton(accion: AccionLote, p: ParametrosLote, n: number, nombres: { coach?: string; tipo?: string } = {}): string {
    const clases = nClases(n);
    if (accion === 'coach') return `Cambiar a ${nombres.coach ?? 'la coach'} en ${clases}`;
    if (accion === 'cupo_canal') return `Guardar ${p.lugares} ${p.lugares === 1 ? 'lugar' : 'lugares'} en ${clases}`;
    if (accion === 'cancelar') return `Cancelar ${clases}`;
    const m = p.minutos ?? 0;
    const mover = m === 0 ? '' : `${duracion(m)} ${m > 0 ? 'más tarde' : 'antes'}`;
    if (mover && p.classTypeId) return `Mover ${clases} ${mover} y cambiarlas a ${nombres.tipo ?? 'otro tipo'}`;
    if (mover) return `Mover ${clases} ${mover}`;
    return `Cambiar ${clases} a ${nombres.tipo ?? 'otro tipo'}`;
}

/** Aviso al terminar. */
export function textoHecho(accion: AccionLote, p: ParametrosLote, r: RespuestaLote, nombres: { coach?: string } = {}): string {
    const clases = nClases(r.resumen.ok);
    const avisadas = r.resumen.alumnasAvisadas ? ` Avisamos a ${nAlumnas(r.resumen.alumnasAvisadas)}.` : '';
    if (accion === 'coach') return `Listo: ${clases} ahora con ${nombres.coach ?? 'la coach nueva'}.${avisadas}`;
    if (accion === 'cupo_canal') return `Guardado: ${p.lugares} ${p.lugares === 1 ? 'lugar' : 'lugares'} para ${p.canal === 'fitpass' ? 'Fitpass' : 'TotalPass'} en ${clases}.`;
    if (accion === 'cancelar') return `${clases} ${r.resumen.ok === 1 ? 'cancelada' : 'canceladas'}. Siguen en el calendario, marcadas.`;
    return `Listo: ${clases} ${r.resumen.ok === 1 ? 'actualizada' : 'actualizadas'}.${avisadas}`;
}

/** Impacto en alumnas de la app según la vista previa. */
export function textoAvisadas(accion: AccionLote, n: number, canal: 'totalpass' | 'fitpass' = 'totalpass'): string {
    if (accion === 'cupo_canal') return `Las alumnas no reciben aviso: solo cambia el cupo de ${canal === 'fitpass' ? 'Fitpass' : 'TotalPass'}.`;
    if (n === 0) return 'No hay alumnas inscritas que avisar.';
    if (accion === 'cancelar') return `${nAlumnas(n)} ${n === 1 ? 'recupera su crédito y recibe' : 'recuperan su crédito y reciben'} aviso.`;
    return `Avisamos del cambio a ${nAlumnas(n)} por la app.`;
}

/**
 * La llamada que deshace un cambio, o null si no cabe en una sola: coach, solo si todas
 * tenían la misma coach antes; mover, con −minutos y, si cambió el tipo, solo si todas
 * tenían el mismo tipo antes. Cupo y cancelar no se deshacen.
 */
export function inversaDe(accion: AccionLote, p: ParametrosLote, antes: ClaseSeleccionable[]): Omit<CuerpoLote, 'vistaPrevia'> | null {
    if (antes.length === 0) return null;
    const classIds = antes.map((c) => c.id);
    if (accion === 'coach') {
        const coaches = new Set(antes.map((c) => c.instructor_id));
        const [anterior] = [...coaches];
        if (coaches.size !== 1 || anterior === p.instructorId) return null;
        return { classIds, accion: 'coach', instructorId: anterior };
    }
    if (accion === 'mover') {
        const minutos = p.minutos ? -p.minutos : 0;
        const tipos = new Set(antes.map((c) => c.class_type_id));
        const [tipoAnterior] = [...tipos];
        const cambioTipo = !!p.classTypeId && !(tipos.size === 1 && tipoAnterior === p.classTypeId);
        if (cambioTipo && tipos.size !== 1) return null;
        if (!cambioTipo && minutos === 0) return null;
        return { classIds, accion: 'mover', minutos, ...(cambioTipo ? { classTypeId: tipoAnterior } : {}) };
    }
    return null;
}
