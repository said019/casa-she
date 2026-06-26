export type Role = 'client' | 'instructor' | 'admin' | 'super_admin' | 'reception';

export type ScopeResult =
    | { kind: 'all' }
    | { kind: 'facility'; facilityId: string }
    | { kind: 'error'; status: number; message: string };

export function resolveFacilityScope(params: {
    role: Role;
    assignedFacilityId: string | null;
    isReceptionMaster?: boolean;
    requestedFacilityId: string | null;
}): ScopeResult {
    const { role, assignedFacilityId, isReceptionMaster, requestedFacilityId } = params;
    const elevated = role === 'admin' || role === 'super_admin' ||
                     (role === 'reception' && isReceptionMaster === true);
    if (elevated) {
        return requestedFacilityId
            ? { kind: 'facility', facilityId: requestedFacilityId }
            : { kind: 'all' };
    }
    if (role === 'reception') {
        if (!assignedFacilityId) {
            return { kind: 'error', status: 403, message: 'No tienes sucursal asignada; pide al admin que te asigne una.' };
        }
        if (requestedFacilityId && requestedFacilityId !== assignedFacilityId) {
            return { kind: 'error', status: 403, message: 'Solo puedes operar tu sucursal asignada.' };
        }
        return { kind: 'facility', facilityId: assignedFacilityId };
    }
    return { kind: 'error', status: 403, message: 'Rol sin acceso a esta operación.' };
}
