import { useAuthStore } from '@/stores/authStore';
import { effectivePermissions, type PermissionKey } from '@/lib/permissions';

/**
 * ¿El usuario actual tiene el permiso? Admin/super_admin siempre true. Reception lee
 * sus permisos efectivos. Espeja backend/src/lib/permissions.ts. (Gating cosmético;
 * el enforcement real es backend.)
 */
export function useHasPermission(key: PermissionKey): boolean {
  const user = useAuthStore((s) => s.user);
  if (!user) return false;
  if (user.role === 'admin' || user.role === 'super_admin') return true;
  if (user.role !== 'reception') return false;
  if (user.is_reception_master === true) return true; // master = todos los permisos
  return effectivePermissions(user.permissions)[key] === true;
}
