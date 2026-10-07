import { capacityError } from './schedule.js';

/** Lo mínimo que se necesita para consultar: sirve tanto el pool como un client en transacción. */
interface Consultable {
    query: (text: string, params?: unknown[]) => Promise<{ rows: any[] }>;
}

/**
 * Valida el cupo al editar una clase (PUT /api/classes/:id).
 *
 * El frontend manda solo los campos que cambiaron, así que hay que cubrir los dos caminos:
 * - viene `maxCapacity`: se valida contra la categoría del tipo nuevo (o el actual);
 * - viene solo `classTypeId`: se valida el cupo que YA tiene la clase contra la
 *   categoría del tipo nuevo (una multi de 10 no puede volverse Reformer de 8 máquinas).
 *
 * Devuelve el mensaje de error o null. Si la clase no existe devuelve null y deja que
 * la ruta responda 404.
 */
export async function errorDeCupoAlEditar(
    db: Consultable,
    classId: string,
    data: { classTypeId?: string; maxCapacity?: number },
): Promise<string | null> {
    if (data.maxCapacity === undefined && data.classTypeId === undefined) return null;

    const actual = (await db.query(
        `SELECT c.max_capacity, ct.category
           FROM classes c LEFT JOIN class_types ct ON ct.id = c.class_type_id
          WHERE c.id = $1`,
        [classId],
    )).rows[0] as { max_capacity: number; category: string | null } | undefined;

    let categoria = actual?.category ?? 'multi';
    if (data.classTypeId !== undefined) {
        const nuevo = (await db.query(`SELECT category FROM class_types WHERE id = $1`, [data.classTypeId])).rows[0];
        categoria = nuevo?.category ?? 'multi';
    }

    if (data.maxCapacity !== undefined) return capacityError(categoria, data.maxCapacity);
    if (!actual) return null;
    return capacityError(categoria, Number(actual.max_capacity));
}
