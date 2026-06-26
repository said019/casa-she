export const PERMISSION_KEYS = [
  'caja', 'vender', 'inventario', 'checkin', 'clientes', 'reservas',
  'creditos_sin_limite', 'editar_catalogo', 'editar_productos_precio',
  'editar_coaches', 'ver_audit', 'nomina',
  'multi_sucursal', 'gestionar_permisos',
] as const;
export type PermissionKey = (typeof PERMISSION_KEYS)[number];
export type PermissionMap = Record<PermissionKey, boolean>;

export const PERMISSION_GROUPS: { title: string; keys: PermissionKey[] }[] = [
  { title: 'Secciones', keys: ['caja', 'vender', 'inventario', 'checkin', 'clientes', 'reservas'] },
  { title: 'Acciones sensibles', keys: ['creditos_sin_limite', 'editar_catalogo', 'editar_productos_precio', 'editar_coaches', 'ver_audit', 'nomina'] },
  { title: 'Alcance', keys: ['multi_sucursal'] },
  { title: 'Equipo', keys: ['gestionar_permisos'] },
];

export const PERMISSION_LABELS: Record<PermissionKey, string> = {
  caja: 'Caja', vender: 'Vender', inventario: 'Inventario', checkin: 'Check-in',
  clientes: 'Clientes', reservas: 'Reservas',
  creditos_sin_limite: 'Ajustar créditos sin límite',
  editar_catalogo: 'Editar catálogo (planes/precios)',
  editar_productos_precio: 'Editar precio/costo de productos',
  editar_coaches: 'Editar coaches', ver_audit: 'Ver bitácora', nomina: 'Nómina de coaches',
  multi_sucursal: 'Operar varias sucursales', gestionar_permisos: 'Gestionar permisos del equipo',
};

// `multi_sucursal` ≡ master (se sincroniza con is_reception_master): otorgarla = minar un
// master, por eso es admin-only igual que gestionar_permisos/nomina.
export const ADMIN_ONLY_KEYS: PermissionKey[] = ['gestionar_permisos', 'nomina', 'multi_sucursal'];

function fullMap(v: boolean): PermissionMap {
  return Object.fromEntries(PERMISSION_KEYS.map((k) => [k, v])) as PermissionMap;
}
export const PRESET_NORMAL: PermissionMap = { ...fullMap(false), caja: true, vender: true, inventario: true, checkin: true, clientes: true, reservas: true };
export const PRESET_MASTER: PermissionMap = fullMap(true);

export function effectivePermissions(stored: unknown, isMaster = false): PermissionMap {
  // Recepción master = todos los permisos en ON (no depende del objeto almacenado).
  if (isMaster) return fullMap(true);
  const base: PermissionMap = { ...PRESET_NORMAL };
  if (stored && typeof stored === 'object') {
    for (const k of PERMISSION_KEYS) {
      const v = (stored as Record<string, unknown>)[k];
      if (typeof v === 'boolean') base[k] = v;
    }
  }
  return base;
}
