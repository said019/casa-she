/**
 * Inscripción de una alumna a una clase por parte del staff — UNA sola regla para
 * mostrar (buscador de candidatas) y para cobrar (POST /api/bookings/admin-book).
 *
 * API estable (la usan admin-book, GET /api/classes/:id/candidatas y el "alta rápida"):
 *  - evaluarInscripcion(db, { userId, classId, cortesia, bloquear, ignorarCupo? })
 *  - inscribirEnClase(db, { userId, classId, membresiaId, cortesia, reservadaPor })
 *
 * Contrato de transacción:
 *  - bloquear:true  → llamar DENTRO de la transacción de la reserva (BEGIN ya hecho): toma
 *    FOR UPDATE de la clase y de la membresía y el candado de límite diario. Orden de locks
 *    clase→membresía (igual que la ruta de la clienta, evita deadlock ABBA).
 *  - bloquear:false → solo lectura, sin FOR UPDATE ni advisory lock; sirve con el pool.
 * `db` es cualquier objeto con `query(text, params) => { rows, rowCount }` (usa toDbClient()).
 */
import type { DbClient } from './loyalty.js';
import { selectMembershipForBooking, type ClassCategory } from './membershipSelection.js';
import { studioBookingError } from './membershipStudio.js';
import { assertMembershipDailyLimit, MembershipDailyLimitError } from './membershipDailyLimit.js';

export type EstadoNoInscribible =
  | 'ya_inscrita' | 'sin_membresia' | 'sin_creditos' | 'limite_diario'
  | 'otro_estudio' | 'clase_llena' | 'clase_cancelada';

export interface MembresiaElegida {
  id: string;
  /** Nombre del plan. */
  plan: string;
  /** Lo que le queda en la bolsa de ESA clase; null = ilimitado. */
  restantes: number | null;
  /** Fecha de vigencia (YYYY-MM-DD) o null = sin vigencia. */
  vence: string | null;
}

export type EvaluacionInscripcion =
  | { estado: 'puede'; membresia: MembresiaElegida | null }
  | { estado: EstadoNoInscribible; mensaje: string; code?: string };

export class ClaseNoEncontradaError extends Error {
  constructor() { super('Clase no encontrada'); }
}

/** Falla al descontar crédito al inscribir (carrera: se agotó entre evaluar e inscribir). */
export class SinCreditosAlInscribirError extends Error {
  constructor() { super('El cliente no tiene créditos disponibles en esta membresía.'); }
}

const dia = (v: unknown): string | null => {
  if (v == null) return null;
  if (v instanceof Date) {
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`;
  }
  return String(v).split('T')[0];
};

const nombreBolsa = (c: ClassCategory) => (c === 'reformer' ? 'Salsa' : 'Clases');
const columna = (c: ClassCategory) => (c === 'reformer' ? 'reformer_remaining' : 'multi_remaining');

/**
 * Decide si `userId` puede inscribirse a `classId` y con qué membresía. NO escribe nada.
 * @param cortesia  true = sin plan ni crédito (la clase gratis también cuenta como cortesía).
 * @param ignorarCupo  true = permite sobrecupo (solo admin forzando, como admin-book).
 * @throws ClaseNoEncontradaError si la clase no existe.
 */
export async function evaluarInscripcion(
  db: DbClient,
  params: { userId: string; classId: string; cortesia: boolean; bloquear: boolean; ignorarCupo?: boolean },
): Promise<EvaluacionInscripcion> {
  const { userId, classId, cortesia, bloquear, ignorarCupo = false } = params;

  // Con bloquear, la clase se bloquea primero (orden clase→membresía) y revalida cupo dentro de la tx.
  const cls = (await db.query(
    `SELECT c.id, c.status, c.date, c.facility_id, c.is_free, c.current_bookings, c.max_capacity,
            ct.category AS class_category
       FROM classes c JOIN class_types ct ON ct.id = c.class_type_id
      WHERE c.id = $1 ${bloquear ? 'FOR UPDATE OF c' : ''}`,
    [classId],
  )).rows[0];
  if (!cls) throw new ClaseNoEncontradaError();

  if (cls.status === 'cancelled') {
    return { estado: 'clase_cancelada', mensaje: 'Esta clase está cancelada' };
  }
  const existente = await db.query(
    `SELECT 1 FROM bookings WHERE class_id = $1 AND user_id = $2 AND status != 'cancelled' LIMIT 1`,
    [classId, userId],
  );
  if (existente.rows.length > 0) {
    return { estado: 'ya_inscrita', mensaje: 'Este usuario ya tiene una reserva para esta clase' };
  }
  if (Number(cls.current_bookings) >= Number(cls.max_capacity) && !ignorarCupo) {
    return { estado: 'clase_llena', mensaje: 'Clase llena' };
  }

  if (cortesia || cls.is_free) return { estado: 'puede', membresia: null };

  const categoria: ClassCategory = cls.class_category;
  const fechaClase = dia(cls.date)!;
  const picked = await selectMembershipForBooking({
    db, userId, category: categoria, classFacilityId: cls.facility_id ?? null,
    requiredCredits: 1, classDate: fechaClase, bloquear,
  });

  if (!picked) {
    // ¿Por qué no hay? Diagnóstico (sin bloquear): membresías vigentes ese día.
    const col = columna(categoria);
    const vigentes = (await db.query(
      `SELECT m.${col} AS restantes, COALESCE(m.facility_id, o.facility_id) AS bound_facility_id, f.name AS bound_facility_name
         FROM memberships m
         LEFT JOIN orders o ON o.id = m.order_id
         LEFT JOIN facilities f ON f.id = COALESCE(m.facility_id, o.facility_id)
        WHERE m.user_id = $1 AND m.status = 'active'
          AND (m.start_date IS NULL OR m.start_date <= $2::date)
          AND (m.end_date IS NULL OR m.end_date >= $2::date)`,
      [userId, fechaClase],
    )).rows;
    const conCredito = vigentes.filter(v => v.restantes === null || v.restantes >= 1);
    if (vigentes.length === 0) {
      return { estado: 'sin_membresia', mensaje: 'Sin membresía vigente' };
    }
    if (conCredito.length === 0) {
      return { estado: 'sin_creditos', mensaje: `Sin créditos de ${nombreBolsa(categoria)}` };
    }
    // Hay con crédito pero ninguna sirve → todas atadas a otro estudio.
    const v = conCredito[0];
    const msg = studioBookingError(v.bound_facility_id, cls.facility_id, v.bound_facility_name)
      ?? 'Su paquete no es válido para este estudio.';
    return { estado: 'otro_estudio', mensaje: msg };
  }

  const col = columna(categoria);
  const restantes: number | null = (picked as any)[col] ?? null;
  try {
    await assertMembershipDailyLimit({ db, userId, classId, remaining: restantes, bloquear });
  } catch (e) {
    if (e instanceof MembershipDailyLimitError) {
      return { estado: 'limite_diario', mensaje: e.message, code: e.code };
    }
    throw e;
  }

  const plan = (await db.query(`SELECT name FROM plans WHERE id = $1`, [(picked as any).plan_id])).rows[0]?.name ?? 'Plan';
  return {
    estado: 'puede',
    membresia: { id: picked.id, plan, restantes, vence: dia(picked.end_date) },
  };
}

/**
 * Crea la reserva confirmada y descuenta 1 crédito de la bolsa de la clase (si la membresía
 * no es ilimitada). Llamar dentro de la transacción, después de evaluarInscripcion(bloquear:true).
 * @param membresiaId  la de `evaluacion.membresia.id`; null para cortesía / clase gratis.
 * @param cortesia     marca is_free_booking (cortesía o clase gratis) — sin descontar crédito.
 * @param reservadaPor id del staff que inscribe (booked_by).
 * @returns la fila completa de `bookings`.
 * @throws SinCreditosAlInscribirError si el crédito se agotó entre evaluar e inscribir.
 */
export async function inscribirEnClase(
  db: DbClient,
  params: { userId: string; classId: string; membresiaId: string | null; cortesia: boolean; reservadaPor: string | null },
): Promise<any> {
  const { userId, classId, membresiaId, cortesia, reservadaPor } = params;
  let categoriaConsumida: ClassCategory | null = null;

  if (!cortesia && membresiaId) {
    const cat: ClassCategory = (await db.query(
      `SELECT ct.category FROM classes c JOIN class_types ct ON ct.id = c.class_type_id WHERE c.id = $1`,
      [classId],
    )).rows[0]?.category;
    const col = columna(cat);
    const cred = (await db.query(`SELECT ${col} AS remaining FROM memberships WHERE id = $1`, [membresiaId])).rows[0];
    if (cred && cred.remaining !== null) {
      const dec = await db.query(`UPDATE memberships SET ${col} = ${col} - 1 WHERE id = $1 AND ${col} > 0`, [membresiaId]);
      if (dec.rowCount === 0) throw new SinCreditosAlInscribirError();
      categoriaConsumida = cat;
    }
  }

  const ins = await db.query(
    `INSERT INTO bookings (class_id, user_id, membership_id, status, is_free_booking, consumed_category, booked_by)
     VALUES ($1, $2, $3, 'confirmed', $4, $5, $6)
     RETURNING *`,
    [classId, userId, cortesia ? null : membresiaId, cortesia, categoriaConsumida, reservadaPor],
  );
  return ins.rows[0];
}

export interface Candidata {
  userId: string;
  nombre: string;
  telefono: string | null;
  email: string | null;
}
export type CandidataEvaluada = Candidata & EvaluacionInscripcion;

/** Normaliza igual que GET /users: minúsculas, sin acentos, espacios colapsados. */
const norm = (col: string) => `regexp_replace(translate(lower(${col}), 'áéíóúüñ', 'aeiouun'), '\\s+', ' ', 'g')`;

/**
 * Buscador de alumnas para inscribir a `classId`: solo role='client' activas (nunca coaches
 * ni staff), por nombre (sin acentos ni espacios extra), email o teléfono. Máximo 8, cada una
 * con su evaluarInscripcion(bloquear:false). `q` debe traer al menos 2 caracteres (si no, []).
 */
export async function buscarCandidatas(db: DbClient, classId: string, q: string): Promise<CandidataEvaluada[]> {
  const termino = q.trim();
  if (termino.length < 2) return [];
  const { rows } = await db.query(
    `SELECT u.id, u.display_name, u.phone, u.email
       FROM users u
      WHERE u.role = 'client' AND u.is_active = true
        AND (${norm('u.display_name')} ILIKE ${norm('$1')} OR u.email ILIKE $1 OR u.phone ILIKE $1)
      ORDER BY u.display_name ASC
      LIMIT 8`,
    [`%${termino}%`],
  );
  const out: CandidataEvaluada[] = [];
  for (const u of rows) {
    const ev = await evaluarInscripcion(db, { userId: u.id, classId, cortesia: false, bloquear: false });
    out.push({ userId: u.id, nombre: u.display_name, telefono: u.phone ?? null, email: u.email ?? null, ...ev });
  }
  return out;
}
