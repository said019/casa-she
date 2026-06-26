import { useAuthStore } from '@/stores/authStore';

/**
 * Devuelve true si el usuario actual puede ejecutar acciones elevadas.
 * Espeja exactamente lib/elevation.ts del backend.
 */
export function useIsElevated(): boolean {
    const user = useAuthStore((s) => s.user);
    if (!user) return false;
    if (user.role === 'admin' || user.role === 'super_admin') return true;
    if (user.role === 'reception' && user.is_reception_master === true) return true;
    return false;
}
