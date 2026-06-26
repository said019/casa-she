import type { DbClient } from './loyalty.js';

/**
 * Adapt a raw query executor into the DbClient shape the selector expects.
 *
 * Accepts either:
 *  - a `pg` PoolClient (already returns `{ rows, rowCount }`) — passed through, or
 *  - the repo `query(text, params) => Promise<T[]>` helper — wrapped so the
 *    rows array becomes `{ rows, rowCount }`.
 *
 * Use this at every call site instead of hand-writing the adapter, so the
 * shape stays consistent and a future change is one edit here.
 */
export function toDbClient(
  exec:
    | { query: (text: string, params?: any[]) => Promise<{ rows: any[]; rowCount?: number | null }> }
    | ((text: string, params?: any[]) => Promise<any[]>),
): DbClient {
  if (typeof exec === 'function') {
    return {
      query: (text: string, params?: unknown[]) =>
        exec(text, params as any[]).then(rows => ({ rows, rowCount: rows.length })),
    };
  }
  return {
    query: (text: string, params?: unknown[]) =>
      exec.query(text, params as any[]).then(r => ({
        rows: r.rows,
        rowCount: r.rowCount ?? r.rows.length,
      })),
  };
}

export type ClassCategory = 'reformer' | 'multi';

/**
 * Conteo legacy/display de créditos: NULL si CUALQUIER bucket es ilimitado (NULL),
 * si no la suma de ambos. El motor de reservas NO lo usa (opera por bucket); sirve
 * solo para mostrar/notificar un número agregado de "clases restantes".
 */
export function legacyRemaining(reformer: number | null, multi: number | null): number | null {
  return (reformer === null || multi === null) ? null : reformer + multi;
}

export interface CandidateMembership {
  id: string;
  reformer_remaining: number | null; // null = ilimitado, 0 = sin acceso
  multi_remaining: number | null;
  end_date: string | null;           // ISO date o null = sin vigencia
  created_at: string;                // ISO timestamp
  bound_facility_id: string | null;  // null = mixto / sin atar
}

function remainingFor(m: CandidateMembership, category: ClassCategory): number | null {
  return category === 'reformer' ? m.reformer_remaining : m.multi_remaining;
}

/** Estudio: elegible si no está atada, o atada exactamente al estudio de la clase. */
function isStudioEligible(m: CandidateMembership, classFacilityId: string | null): boolean {
  if (m.bound_facility_id === null) return true;
  return classFacilityId !== null && m.bound_facility_id === classFacilityId;
}

/** Categoría: elegible si ilimitada (null) o con al menos 1 crédito del bucket. */
function isCategoryEligible(m: CandidateMembership, category: ClassCategory): boolean {
  const r = remainingFor(m, category);
  return r === null || r >= 1;
}

/**
 * Elige la membresía a consumir para una clase de `category`: entre las elegibles
 * por estudio y categoría, acotada antes que ilimitada, luego vigencia más próxima
 * (nulls al final), luego created_at más antiguo. Pura — sin DB.
 */
export function pickBestMembership(
  candidates: CandidateMembership[],
  category: ClassCategory,
  classFacilityId: string | null,
): CandidateMembership | null {
  const eligible = candidates.filter(
    m => isStudioEligible(m, classFacilityId) && isCategoryEligible(m, category),
  );
  if (eligible.length === 0) return null;

  const rank = (m: CandidateMembership) => (remainingFor(m, category) === null ? 1 : 0);
  const endKey = (m: CandidateMembership) =>
    m.end_date === null ? Number.MAX_SAFE_INTEGER : new Date(m.end_date).getTime();

  eligible.sort((a, b) => {
    const ra = rank(a), rb = rank(b);
    if (ra !== rb) return ra - rb;            // acotada primero
    const ea = endKey(a), eb = endKey(b);
    if (ea !== eb) return ea - eb;            // vigencia más próxima
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });
  return eligible[0];
}

/** Fila cruda de la query de selección. */
export type MembershipRow = Record<string, unknown> & {
  id: string;
  reformer_remaining: number | null;
  multi_remaining: number | null;
  end_date: string | Date | null;
  created_at: string | Date;
  bound_facility_id: string | null;
};

/**
 * Bloquea (FOR UPDATE) y devuelve la membresía a consumir para una clase de
 * `category`, o null. Debe llamarse dentro de la transacción de la reserva.
 */
export async function selectMembershipForBooking(params: {
  db: DbClient;
  userId: string;
  category: ClassCategory;
  classFacilityId: string | null;
  requiredCredits: number;
  /**
   * Fecha de la CLASE ('YYYY-MM-DD'). La vigencia se compara contra la fecha de la
   * clase, no contra "hoy": una membresía es válida si su start_date es en o antes
   * del día de la clase Y su end_date es en o después. NULL start/end = sin límite
   * por ese lado. Así una membresía que arranca el lunes NO sirve para el sábado.
   */
  classDate: string;
}): Promise<MembershipRow | null> {
  const { db, userId, category, classFacilityId, requiredCredits, classDate } = params;
  // `col` se interpola en SQL: el ternario lo restringe a dos literales fijos
  // (nunca entra input del usuario), así que es seguro frente a inyección.
  const col = category === 'reformer' ? 'reformer_remaining' : 'multi_remaining';
  const { rows } = await db.query(
    `SELECT m.*,
            COALESCE(m.facility_id, o.facility_id) AS bound_facility_id
       FROM memberships m
       LEFT JOIN orders o ON o.id = m.order_id
      WHERE m.user_id = $1
        AND m.status = 'active'
        AND (m.start_date IS NULL OR m.start_date <= $3::date)
        AND (m.end_date IS NULL OR m.end_date >= $3::date)
        AND (m.${col} IS NULL OR m.${col} >= $2)
      FOR UPDATE OF m`,
    [userId, requiredCredits, classDate],
  );

  const candidates: CandidateMembership[] = rows.map(r => ({
    id: r.id,
    reformer_remaining: r.reformer_remaining,
    multi_remaining: r.multi_remaining,
    end_date: r.end_date ? new Date(r.end_date).toISOString() : null,
    created_at: new Date(r.created_at).toISOString(),
    bound_facility_id: r.bound_facility_id ?? null,
  }));

  const winner = pickBestMembership(candidates, category, classFacilityId);
  if (!winner) return null;
  return (rows.find(r => r.id === winner.id) as MembershipRow | undefined) ?? null;
}
