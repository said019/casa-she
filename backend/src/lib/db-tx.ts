/**
 * Consultas que pueden correr dentro de una transacción ajena.
 *
 * Las funciones de soporte (cancelar una clase, fijar el cupo de TotalPass, marcar
 * retiro o resincronización) siempre usaron el pool. Los cambios en bloque
 * (POST /api/classes/bulk) necesitan correrlas dentro de UNA transacción para que
 * todo se aplique o nada: por eso aceptan un `db` opcional. Sin `db` se comportan
 * igual que siempre.
 */
import type { PoolClient } from 'pg';
import { query } from '../config/database.js';

/** Cliente con una transacción abierta (BEGIN … COMMIT/ROLLBACK). */
export type ClienteTx = PoolClient;

/** Corre la consulta en la transacción si viene `db`; si no, en el pool. Devuelve las filas. */
export async function filas<T = any>(db: ClienteTx | undefined, sql: string, params: unknown[] = []): Promise<T[]> {
    if (db) return (await db.query(sql, params as any[])).rows as T[];
    return query<T>(sql, params as any[]);
}
