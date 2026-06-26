// Executor: acepta el helper global `query` (devuelve rows) o un PoolClient.query (devuelve {rows}).
// No dependemos del valor de retorno (es un INSERT).
export type AuditExecutor = (text: string, params?: any[]) => Promise<unknown>;

export interface AuditInput {
  adminUserId: string;
  actionType: string;            // p.ej. 'credits_modified'
  entityType: string;            // p.ej. 'membership'
  entityId?: string | null;
  description?: string | null;
  oldData?: unknown;             // → JSONB (string JSON o null)
  newData?: unknown;             // → JSONB (string JSON o null)
  req?: { ip?: string; headers?: Record<string, unknown> };
}

export interface AuditRow {
  admin_user_id: string;
  action_type: string;
  entity_type: string;
  entity_id: string | null;
  description: string | null;
  old_data: string | null;       // JSON serializado o null
  new_data: string | null;
  ip_address: string | null;
  user_agent: string | null;
}

/** Normaliza el input a la fila lista para INSERT. Puro y testeable. */
export function buildAuditRow(input: AuditInput): AuditRow {
  const toJson = (v: unknown): string | null =>
    v === undefined || v === null ? null : JSON.stringify(v);
  const ua = input.req?.headers?.['user-agent'];
  return {
    admin_user_id: input.adminUserId,
    action_type: input.actionType,
    entity_type: input.entityType,
    entity_id: input.entityId ?? null,
    description: input.description ?? null,
    old_data: toJson(input.oldData),
    new_data: toJson(input.newData),
    ip_address: input.req?.ip ?? null,
    user_agent: typeof ua === 'string' ? ua : null,
  };
}

/**
 * Registra una acción en admin_actions. NO-FATAL: si el INSERT falla, loguea y continúa
 * (nunca rompe la operación de negocio). Llamar SIEMPRE después del COMMIT de la mutación,
 * pasando el `query` global (no el client de la tx) para no arriesgar abortar la transacción.
 */
export async function logAction(exec: AuditExecutor, input: AuditInput): Promise<void> {
  try {
    const r = buildAuditRow(input);
    await exec(
      `INSERT INTO admin_actions
        (admin_user_id, action_type, entity_type, entity_id, description, old_data, new_data, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [r.admin_user_id, r.action_type, r.entity_type, r.entity_id, r.description, r.old_data, r.new_data, r.ip_address, r.user_agent]
    );
  } catch (e) {
    console.error('logAction failed (non-fatal):', (e as Error)?.message);
  }
}
