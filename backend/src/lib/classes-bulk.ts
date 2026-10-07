/**
 * Cambios en bloque del calendario (POST /api/classes/bulk): cambiar coach, cupo de
 * TotalPass, mover la hora o cambiar el tipo, y cancelar, sobre varias clases a la vez.
 *
 * Una sola función, `procesarLote`, evalúa cada clase (vista previa) y, si se pidió
 * aplicar y ninguna está bloqueada, aplica TODO con el cliente de la transacción que
 * abrió la ruta. Lo que sale del sistema (avisos, correos, barridos de TotalPass) no se
 * hace aquí: se devuelve en `trasCommit` para hacerlo una sola vez después del COMMIT.
 */
import { z } from 'zod';
import type { ClienteTx } from './db-tx.js';
import { localDateTimeUtc } from './mx-time.js';
import { capacityError } from './schedule.js';

// ── Entrada ──────────────────────────────────────────────────────────────────

export const ACCIONES_LOTE = ['coach', 'cupo_canal', 'mover', 'cancelar'] as const;
export type AccionLote = (typeof ACCIONES_LOTE)[number];

export const LoteSchema = z.object({
    classIds: z.array(z.string().uuid()).min(1, 'Elige al menos una clase').max(200, 'Máximo 200 clases a la vez')
        .refine((ids) => new Set(ids).size === ids.length, 'Hay clases repetidas'),
    accion: z.enum(ACCIONES_LOTE),
    vistaPrevia: z.boolean(),
    instructorId: z.string().uuid().optional(),
    canal: z.literal('totalpass').optional(),
    lugares: z.number().int().min(0).optional(),
    minutos: z.number().int().min(-180).max(180).refine((m) => m % 15 === 0, 'Múltiplo de 15 minutos').optional(),
    classTypeId: z.string().uuid().optional(),
    motivo: z.string().trim().max(200).optional(),
}).superRefine((d, ctx) => {
    const falta = (path: string, message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
    if (d.accion === 'coach' && !d.instructorId) falta('instructorId', 'Elige la coach');
    if (d.accion === 'cupo_canal' && !d.canal) falta('canal', 'Elige la plataforma');
    if (d.accion === 'cupo_canal' && d.lugares === undefined) falta('lugares', 'Indica cuántos lugares');
    if (d.accion === 'mover' && !d.classTypeId && !d.minutos) falta('minutos', 'Mueve la hora o elige otro tipo de clase');
});

export type EntradaLote = z.infer<typeof LoteSchema>;

/** Quién pide el cambio. `sucursalPermitida` = null: todas (admin, o recepción sin sucursal asignada). */
export interface ActorLote {
    userId: string;
    sucursalPermitida: string | null;
}

// ── Salida ───────────────────────────────────────────────────────────────────

export interface ClaseDelLote {
    classId: string;
    estado: 'ok' | 'bloqueada';
    /** Por qué está bloqueada, en español para recepción. */
    motivo?: string;
    /** Inscritas de Casa Shé (app) que reciben aviso. */
    alumnasAvisadas: number;
    sociasPorCanal: Record<string, number>;
    /** Solo mover con minutos ≠ 0 en una clase publicada en TotalPass. */
    sociasPierdenLugar: number;
    advertencias: string[];
}

export interface RespuestaLote {
    clases: ClaseDelLote[];
    resumen: { ok: number; bloqueadas: number; alumnasAvisadas: number; sociasPierdenLugar: number };
    aplicado: boolean;
}

/** Aviso in-app (+ push) a una alumna, para mandar después del COMMIT. */
export interface AvisoAlumnaLote {
    userId: string;
    title: string;
    body: string;
    type: 'class_updated';
    data: { classId: string };
}

/** Correo a la coach nueva de una clase, para mandar después del COMMIT. */
export interface CorreoCoachLote {
    instructorId: string;
    className: string;
    classDate: string;
    startTime: string;
    endTime: string;
    capacity: number;
}

/** Lo que sale del sistema: se hace una sola vez, después del COMMIT. */
export interface TrasCommitLote {
    avisosCancelacion: Array<{ userId: string; payload: { title: string; body: string; url?: string; tag?: string } }>;
    avisosAlumnas: AvisoAlumnaLote[];
    correosCoach: CorreoCoachLote[];
    /** Hay clases marcadas para retirarse de TotalPass: disparar el barrido. */
    retiro: boolean;
    /** Hay clases marcadas para resincronizar con TotalPass: disparar el barrido. */
    resync: boolean;
    /** Cómo estaban las clases antes del cambio (para la auditoría). */
    antes: Array<{ id: string; instructor_id: string; class_type_id: string; inicio: string; fin: string; status: string }>;
}

export interface ResultadoLote {
    respuesta: RespuestaLote;
    trasCommit: TrasCommitLote;
}

/** Error de la petición (coach o tipo inexistente…): la ruta lo responde con `status`. */
export class ErrorLote extends Error {
    constructor(public status: number, message: string) {
        super(message);
    }
}

// ── Contexto: lo que se lee de la base ───────────────────────────────────────

interface FilaClase {
    id: string;
    fecha: string;       // YYYY-MM-DD
    inicio: string;      // HH:MM
    fin: string;         // HH:MM
    status: string;
    facility_id: string | null;
    instructor_id: string;
    coach: string;
    class_type_id: string;
    tipo: string;
    categoria: string;   // 'reformer' (Salsa) | 'multi' (Clases)
    max_capacity: number;
}

interface OtraClase {
    id: string;
    instructor_id: string;
    fecha: string;
    inicio: string;
    fin: string;
    tipo: string;
}

interface ContextoLote {
    clases: Map<string, FilaClase>;
    /** Reservas de cada canal: { totalpass: 2 }. */
    canales: Map<string, Record<string, number>>;
    /** user_id de las inscritas de la app (confirmadas y en espera), sin repetir. */
    alumnas: Map<string, string[]>;
    /** Publicada en TotalPass (mapping 'published' o 'pending_resync'). */
    publicadas: Set<string>;
    coachNueva: { id: string; nombre: string } | null;
    tipoNuevo: { id: string; nombre: string; categoria: string } | null;
    /** Clases activas fuera de la selección de las coaches involucradas, en las fechas de la selección. */
    otras: OtraClase[];
}

const HORA_APERTURA = 5 * 60;
const HORA_CIERRE = 23 * 60;
const HORAS_AVISO_TOTALPASS = 5;
export const ADVERTENCIA_TOTALPASS = 'TotalPass no republica con menos de 4.5 h';

const aMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const deMin = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
/** "08:00" → "8:00", como se lee en el calendario. */
export const horaLegible = (hhmm: string) => `${Number(hhmm.slice(0, 2))}:${hhmm.slice(3, 5)}`;
const bolsa = (categoria: string) => (categoria === 'reformer' ? 'Salsa' : 'Clases');
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;
const seEnciman = (a: { inicio: number; fin: number }, b: { inicio: number; fin: number }) => a.inicio < b.fin && b.inicio < a.fin;

/** "2026-11-04" → "miércoles 4 de noviembre". */
export function fechaLarga(fecha: string): string {
    return new Intl.DateTimeFormat('es-MX', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
        .format(new Date(`${fecha}T12:00:00Z`))
        .replace(',', '');
}

async function cargarContexto(db: ClienteTx, e: EntradaLote, bloquear: boolean): Promise<ContextoLote> {
    const ids = e.classIds;
    if (bloquear) {
        // Fija las clases mientras dura la transacción: nadie las cambia entre revisar y aplicar.
        // (Sin agregados: FOR UPDATE no se puede combinar con GROUP BY ni json_agg.)
        await db.query(`SELECT id FROM classes WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE`, [ids]);
    }
    const filasClases = (await db.query(
        `SELECT c.id, to_char(c.date, 'YYYY-MM-DD') AS fecha,
                to_char(c.start_time, 'HH24:MI') AS inicio, to_char(c.end_time, 'HH24:MI') AS fin,
                c.status::text AS status, c.facility_id, c.instructor_id, i.display_name AS coach,
                c.class_type_id, ct.name AS tipo, ct.category::text AS categoria, c.max_capacity
           FROM classes c
           JOIN class_types ct ON ct.id = c.class_type_id
           JOIN instructors i ON i.id = c.instructor_id
          WHERE c.id = ANY($1::uuid[])`,
        [ids],
    )).rows as FilaClase[];
    const clases = new Map(filasClases.map((c) => [c.id, { ...c, max_capacity: Number(c.max_capacity) }]));

    const canales = new Map<string, Record<string, number>>();
    for (const r of (await db.query(
        `SELECT class_id, channel, booked_spots FROM channel_inventory WHERE class_id = ANY($1::uuid[])`, [ids],
    )).rows) {
        const actual = canales.get(r.class_id) ?? {};
        actual[r.channel] = Number(r.booked_spots);
        canales.set(r.class_id, actual);
    }

    const alumnas = new Map<string, string[]>();
    for (const r of (await db.query(
        `SELECT DISTINCT class_id, user_id FROM bookings
          WHERE class_id = ANY($1::uuid[]) AND status IN ('confirmed', 'waitlist') AND channel = 'app'`, [ids],
    )).rows) {
        alumnas.set(r.class_id, [...(alumnas.get(r.class_id) ?? []), r.user_id]);
    }

    const publicadas = new Set<string>((await db.query(
        `SELECT class_id FROM partner_class_mappings
          WHERE class_id = ANY($1::uuid[]) AND channel = 'totalpass' AND sync_status IN ('published', 'pending_resync')`, [ids],
    )).rows.map((r) => r.class_id as string));

    let coachNueva: ContextoLote['coachNueva'] = null;
    if (e.accion === 'coach' && e.instructorId) {
        const i = (await db.query(`SELECT id, display_name, is_active FROM instructors WHERE id = $1`, [e.instructorId])).rows[0];
        if (!i) throw new ErrorLote(404, 'No encontramos a esa coach.');
        if (i.is_active === false) throw new ErrorLote(400, 'Esa coach está inactiva.');
        coachNueva = { id: i.id, nombre: i.display_name };
    }

    let tipoNuevo: ContextoLote['tipoNuevo'] = null;
    if (e.accion === 'mover' && e.classTypeId) {
        const t = (await db.query(`SELECT id, name, category::text AS categoria FROM class_types WHERE id = $1`, [e.classTypeId])).rows[0];
        if (!t) throw new ErrorLote(404, 'No encontramos ese tipo de clase.');
        tipoNuevo = { id: t.id, nombre: t.name, categoria: t.categoria };
    }

    // Choques de horario de coach: en TODAS las sucursales (una coach no está en dos lados).
    const coaches = e.accion === 'coach' && coachNueva
        ? [coachNueva.id]
        : e.accion === 'mover' && e.minutos
            ? [...new Set(filasClases.map((c) => c.instructor_id))]
            : [];
    const fechas = [...new Set(filasClases.map((c) => c.fecha))];
    const otras = coaches.length === 0 ? [] : (await db.query(
        `SELECT c.id, c.instructor_id, to_char(c.date, 'YYYY-MM-DD') AS fecha,
                to_char(c.start_time, 'HH24:MI') AS inicio, to_char(c.end_time, 'HH24:MI') AS fin, ct.name AS tipo
           FROM classes c JOIN class_types ct ON ct.id = c.class_type_id
          WHERE c.instructor_id = ANY($1::uuid[]) AND c.date = ANY($2::date[])
            AND c.status <> 'cancelled' AND NOT (c.id = ANY($3::uuid[]))`,
        [coaches, fechas, ids],
    )).rows as OtraClase[];

    return { clases, canales, alumnas, publicadas, coachNueva, tipoNuevo, otras };
}

// ── Evaluación (vista previa) ────────────────────────────────────────────────

function motivoComun(c: FilaClase | undefined, actor: ActorLote, ahora: Date): string | null {
    if (!c) return 'Esta clase ya no existe.';
    if (c.status === 'cancelled') return 'Ya está cancelada.';
    if (actor.sucursalPermitida && c.facility_id !== actor.sucursalPermitida) return 'Es de otra sucursal.';
    if (localDateTimeUtc(c.fecha, c.fin).getTime() <= ahora.getTime()) return 'Ya pasó.';
    if (localDateTimeUtc(c.fecha, c.inicio).getTime() <= ahora.getTime()) return 'Ya empezó.';
    return null;
}

function evaluarClase(id: string, ctx: ContextoLote, e: EntradaLote, actor: ActorLote, ahora: Date): ClaseDelLote {
    const c = ctx.clases.get(id);
    const sociasPorCanal = { ...(ctx.canales.get(id) ?? {}) };
    const inscritas = ctx.alumnas.get(id)?.length ?? 0;
    const r: ClaseDelLote = { classId: id, estado: 'ok', alumnasAvisadas: 0, sociasPorCanal, sociasPierdenLugar: 0, advertencias: [] };
    const bloquear = (motivo: string) => ({ ...r, estado: 'bloqueada' as const, motivo, alumnasAvisadas: 0, sociasPierdenLugar: 0 });

    const comun = motivoComun(c, actor, ahora);
    if (comun || !c) return bloquear(comun ?? 'Esta clase ya no existe.');
    const iv = { inicio: aMin(c.inicio), fin: aMin(c.fin) };

    if (e.accion === 'coach') {
        const coach = ctx.coachNueva!;
        if (c.instructor_id === coach.id) return { ...r, advertencias: [`Ya la da ${coach.nombre}`] };
        const choque = ctx.otras.find((o) => o.instructor_id === coach.id && o.fecha === c.fecha
            && seEnciman(iv, { inicio: aMin(o.inicio), fin: aMin(o.fin) }));
        if (choque) return bloquear(`${coach.nombre} ya tiene ${choque.tipo} a las ${horaLegible(choque.inicio)}.`);
        // Dos clases de la selección a la misma hora no las puede dar la misma coach.
        const enLaSeleccion = [...ctx.clases.values()].find((o) => o.id !== c.id && o.status !== 'cancelled'
            && o.fecha === c.fecha && seEnciman(iv, { inicio: aMin(o.inicio), fin: aMin(o.fin) }));
        if (enLaSeleccion) return bloquear(`Se encima con ${enLaSeleccion.tipo} de las ${horaLegible(enLaSeleccion.inicio)}, también seleccionada.`);
        return { ...r, alumnasAvisadas: inscritas };
    }

    if (e.accion === 'cupo_canal') {
        const canal = e.canal!;
        const lugares = e.lugares!;
        const reservadas = sociasPorCanal[canal] ?? 0;
        if (lugares < reservadas) return bloquear(`Tiene ${plural(reservadas, 'socia inscrita', 'socias inscritas')}: no puede bajar de ${reservadas}.`);
        if (lugares > c.max_capacity) return bloquear(`La clase tiene ${c.max_capacity} lugares: no caben ${lugares}.`);
        return r;
    }

    if (e.accion === 'mover') {
        const minutos = e.minutos ?? 0;
        const nuevo = { inicio: iv.inicio + minutos, fin: iv.fin + minutos };
        if (nuevo.inicio < HORA_APERTURA || nuevo.fin > HORA_CIERRE) {
            return bloquear(`Quedaría de ${horaLegible(deMin(Math.max(0, nuevo.inicio)))} a ${horaLegible(deMin(Math.min(24 * 60 - 1, nuevo.fin)))}, fuera del horario (5:00 a 23:00).`);
        }
        const inicioNuevoUtc = localDateTimeUtc(c.fecha, deMin(nuevo.inicio)).getTime();
        if (minutos !== 0 && inicioNuevoUtc <= ahora.getTime()) return bloquear('La hora nueva ya pasó.');
        if (minutos !== 0) {
            const choque = ctx.otras.find((o) => o.instructor_id === c.instructor_id && o.fecha === c.fecha
                && seEnciman(nuevo, { inicio: aMin(o.inicio), fin: aMin(o.fin) }));
            if (choque) return bloquear(`${c.coach} ya tiene ${choque.tipo} a las ${horaLegible(choque.inicio)}.`);
        }
        const tipo = ctx.tipoNuevo;
        if (tipo && tipo.categoria !== c.categoria && inscritas > 0) {
            return bloquear(`Tiene ${plural(inscritas, 'alumna', 'alumnas')} con créditos de ${bolsa(c.categoria)}: no puede volverse ${bolsa(tipo.categoria)}.`);
        }
        if (tipo) {
            const cupo = capacityError(tipo.categoria, c.max_capacity);
            if (cupo) return bloquear(cupo);
        }
        const res = { ...r, alumnasAvisadas: inscritas };
        if (minutos !== 0 && ctx.publicadas.has(id)) {
            res.sociasPierdenLugar = sociasPorCanal.totalpass ?? 0;
            if (inicioNuevoUtc - ahora.getTime() < HORAS_AVISO_TOTALPASS * 3600_000) res.advertencias = [ADVERTENCIA_TOTALPASS];
        }
        return res;
    }

    // cancelar: solo las reglas comunes.
    return { ...r, alumnasAvisadas: inscritas };
}

function armarRespuesta(clases: ClaseDelLote[], ctx: ContextoLote, aplicado: boolean): RespuestaLote {
    const clave = (x: ClaseDelLote) => {
        const c = ctx.clases.get(x.classId);
        return c ? `${c.fecha} ${c.inicio}` : '9999';
    };
    const ordenadas = [...clases].sort((a, b) => clave(a).localeCompare(clave(b)));
    const ok = ordenadas.filter((c) => c.estado === 'ok');
    return {
        clases: ordenadas,
        resumen: {
            ok: ok.length,
            bloqueadas: ordenadas.length - ok.length,
            alumnasAvisadas: ok.reduce((t, c) => t + c.alumnasAvisadas, 0),
            sociasPierdenLugar: ok.reduce((t, c) => t + c.sociasPierdenLugar, 0),
        },
        aplicado,
    };
}

const SIN_CAMBIOS = (): TrasCommitLote => ({
    avisosCancelacion: [], avisosAlumnas: [], correosCoach: [], retiro: false, resync: false, antes: [],
});

/**
 * Evalúa el lote y, si `vistaPrevia` es false y ninguna clase está bloqueada, lo aplica
 * con `db` (que ya debe estar en BEGIN). Con alguna bloqueada no escribe nada y devuelve
 * `aplicado: false`: la ruta responde 409 con la misma respuesta.
 */
export async function procesarLote(db: ClienteTx, e: EntradaLote, actor: ActorLote, ahora: Date = new Date()): Promise<ResultadoLote> {
    const ctx = await cargarContexto(db, e, !e.vistaPrevia);
    const clases = e.classIds.map((id) => evaluarClase(id, ctx, e, actor, ahora));
    const respuesta = armarRespuesta(clases, ctx, false);
    if (e.vistaPrevia || respuesta.resumen.bloqueadas > 0) return { respuesta, trasCommit: SIN_CAMBIOS() };
    // Aplicar cada acción llega en el siguiente cambio de esta rama.
    throw new ErrorLote(501, 'Todavía no se pueden aplicar cambios en bloque.');
}
