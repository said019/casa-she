/**
 * Helper único de elevación. Devuelve true si el caller puede ejecutar acciones
 * elevadas (admin, super_admin, o reception con is_reception_master=true).
 *
 * Esta función es la fuente única de verdad para "puede hacer X que era admin-only".
 * Endpoints que solo aceptan admin estricto siguen usando requireRole('admin').
 */
export function isElevated(user?: {
    role?: string;
    isReceptionMaster?: boolean;
} | null | undefined): boolean {
    if (!user) return false;
    if (user.role === 'admin' || user.role === 'super_admin') return true;
    if (user.role === 'reception' && user.isReceptionMaster === true) return true;
    return false;
}
