// Fuente única de verdad de permisos de recepción.
// Pura y sin dependencias de Express/DB para ser testeable con tsx.

export const PERMISSION_KEYS = [
  // Secciones (sidebar + endpoints de la sección)
  'caja',
  'vender',
  'inventario',
  'checkin',
  'clientes',
  'reservas',
  // Acciones sensibles
  'creditos_sin_limite',
  'editar_catalogo',
  'editar_productos_precio',
  'editar_coaches',
  'ver_audit',
  'nomina',
  // Alcance
  'multi_sucursal',
  // Equipo
  'gestionar_permisos',
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];
export type PermissionMap = Record<PermissionKey, boolean>;

// Etiquetas legibles (para correos / UI). Fuente única en español.
export const PERMISSION_LABELS: Record<PermissionKey, string> = {
  caja: 'Caja',
  vender: 'Vender membresías',
  inventario: 'Inventario',
  checkin: 'Check-in',
  clientes: 'Clientes',
  reservas: 'Reservas',
  creditos_sin_limite: 'Créditos sin límite',
  editar_catalogo: 'Editar catálogo',
  editar_productos_precio: 'Editar precios de productos',
  editar_coaches: 'Editar coaches',
  ver_audit: 'Ver auditoría',
  nomina: 'Nómina',
  multi_sucursal: 'Ambas sucursales',
  gestionar_permisos: 'Gestionar permisos',
};

// Claves que SOLO admin puede otorgar (un master no puede repartirlas).
// `multi_sucursal` se sincroniza con is_reception_master (otorgarla = minar un master),
// así que también es admin-only: un master no puede crear otros masters por esta vía.
export const ADMIN_ONLY_KEYS: PermissionKey[] = ['gestionar_permisos', 'nomina', 'multi_sucursal'];

function fullMap(value: boolean): PermissionMap {
  return Object.fromEntries(PERMISSION_KEYS.map((k) => [k, value])) as PermissionMap;
}

// Preset Normal: secciones operativas ON, todo lo demás OFF (créditos con tope ±3).
export const PRESET_NORMAL: PermissionMap = {
  ...fullMap(false),
  caja: true,
  vender: true,
  inventario: true,
  checkin: true,
  clientes: true,
  reservas: true,
};

// Preset Master: todo ON.
export const PRESET_MASTER: PermissionMap = fullMap(true);

export const PRESETS = { normal: PRESET_NORMAL, master: PRESET_MASTER } as const;
export type PresetName = keyof typeof PRESETS;

/**
 * Permisos efectivos de una recepcionista: parte del preset Normal y aplica lo
 * almacenado por encima (lo explícito gana). Claves desconocidas se ignoran.
 */
export function effectivePermissions(stored: unknown): PermissionMap {
  const base: PermissionMap = { ...PRESET_NORMAL };
  if (stored && typeof stored === 'object') {
    for (const key of PERMISSION_KEYS) {
      const v = (stored as Record<string, unknown>)[key];
      if (typeof v === 'boolean') base[key] = v;
    }
  }
  return base;
}

/**
 * ¿El usuario tiene el permiso? Admin/super_admin siempre true. Reception lee
 * sus permisos efectivos. Otros roles: false (estos permisos son de operación).
 */
export function hasPermission(
  user: { role?: string; permissions?: unknown; is_reception_master?: boolean; isReceptionMaster?: boolean } | null | undefined,
  key: PermissionKey,
): boolean {
  if (!user || !user.role) return false;
  if (user.role === 'admin' || user.role === 'super_admin') return true;
  if (user.role !== 'reception') return false;
  // Recepción master = puede hacer TODO (no depende de que el objeto permissions
  // tenga cada clave; basta el flag is_reception_master). Acepta ambos casings.
  if (user.is_reception_master === true || user.isReceptionMaster === true) return true;
  return effectivePermissions(user.permissions)[key] === true;
}

/**
 * Sanea un set de permisos entrante (descarta claves desconocidas / no booleanas)
 * y lo mezcla sobre el estado actual del objetivo.
 */
export function mergeRequested(
  current: unknown,
  requested: unknown,
): PermissionMap {
  const result = effectivePermissions(current);
  if (requested && typeof requested === 'object') {
    for (const key of PERMISSION_KEYS) {
      const v = (requested as Record<string, unknown>)[key];
      if (typeof v === 'boolean') result[key] = v;
    }
  }
  return result;
}

export interface PermissionChangeContext {
  actorRole: string;                 // 'admin' | 'super_admin' | 'reception'
  actorIsSelf: boolean;              // actor edita su propio registro
  actorPerms: PermissionMap;         // permisos efectivos del actor (para reception)
  current: PermissionMap;            // permisos actuales del objetivo
  requested: PermissionMap;          // permisos pedidos (ya saneados/mezclados)
}

export interface PermissionChangeResult {
  ok: boolean;
  error?: string;
}

/**
 * Candado anti-escalación (aprobado: completo). Admin sin topes. Reception con
 * `gestionar_permisos`:
 *  1. No edita sus propios permisos.
 *  2. No otorga (false→true) un permiso que él no tiene. Revocar siempre se permite.
 *  3. No otorga `gestionar_permisos` ni `nomina` (solo admin).
 */
export function validatePermissionChange(ctx: PermissionChangeContext): PermissionChangeResult {
  if (ctx.actorRole === 'admin' || ctx.actorRole === 'super_admin') {
    return { ok: true };
  }
  if (ctx.actorRole !== 'reception' || ctx.actorPerms.gestionar_permisos !== true) {
    return { ok: false, error: 'No tienes permiso para gestionar el equipo.' };
  }
  if (ctx.actorIsSelf) {
    return { ok: false, error: 'No puedes editar tus propios permisos.' };
  }
  for (const key of PERMISSION_KEYS) {
    const granting = ctx.requested[key] === true && ctx.current[key] !== true;
    if (!granting) continue; // revocar o sin cambio: siempre permitido
    if (ADMIN_ONLY_KEYS.includes(key)) {
      return { ok: false, error: `Solo un administrador puede otorgar "${key}".` };
    }
    if (ctx.actorPerms[key] !== true) {
      return { ok: false, error: `No puedes otorgar un permiso que tú no tienes ("${key}").` };
    }
  }
  return { ok: true };
}

/** ¿El set de permisos equivale exactamente al preset Master? (para sync de is_reception_master) */
export function isMasterPreset(perms: PermissionMap): boolean {
  return PERMISSION_KEYS.every((k) => perms[k] === true);
}
