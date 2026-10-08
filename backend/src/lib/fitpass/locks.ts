/**
 * Locks advisory de FitPass (sobre withPgAdvisoryLock de lib/totalpass/lock.ts).
 *
 * API estable:
 *   FP_LOCKS = { FP_SYNC_CYCLE, FP_MUTATE, FP_IMPORT, FP_POOL, FP_PUBLISH }  (llaves enteras, distintas de 47100x de TotalPass)
 *   withFitpassLock(name, fn)            -> Promise<T | null>   (null = lock ocupado: el caller registra skip retryable)
 *   withFitpassClassEditLock(classId, fn)-> Promise<T | null>   (CLASS_EDIT:<id>, llave derivada del id)
 *   fitpassClassEditLockKey(classId)     -> number
 *
 * Semántica (de Hundred): FP_SYNC_CYCLE serializa snapshot remoto + import + push de cupo
 * (y los imports manuales); FP_MUTATE serializa TODA mutación del panel; FP_IMPORT/FP_POOL/
 * FP_PUBLISH cubren las operaciones internas. Orden de anidado recomendado:
 * FP_SYNC_CYCLE -> FP_IMPORT -> FP_MUTATE -> FP_POOL | FP_PUBLISH. Nunca esperan: ocupado => null.
 */
import { withPgAdvisoryLock } from '../totalpass/lock.js';

export const FP_LOCKS = {
    FP_SYNC_CYCLE: 472001,
    FP_MUTATE: 472002,
    FP_IMPORT: 472003,
    FP_POOL: 472004,
    FP_PUBLISH: 472005,
} as const;

export type FitpassLockName = keyof typeof FP_LOCKS;

export function withFitpassLock<T>(name: FitpassLockName, fn: () => Promise<T>): Promise<T | null> {
    return withPgAdvisoryLock(FP_LOCKS[name], fn);
}

/** Llave determinista por clase en [473_000_000, 473_999_999] (no choca con FP_LOCKS ni TotalPass). */
export function fitpassClassEditLockKey(classId: string): number {
    let h = 5381;
    for (let i = 0; i < classId.length; i += 1) h = ((h * 33) ^ classId.charCodeAt(i)) >>> 0;
    return 473_000_000 + (h % 1_000_000);
}

export function withFitpassClassEditLock<T>(classId: string, fn: () => Promise<T>): Promise<T | null> {
    return withPgAdvisoryLock(fitpassClassEditLockKey(classId), fn);
}
