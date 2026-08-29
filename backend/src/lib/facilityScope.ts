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
    const { role, requestedFacilityId } = params;
    const elevated = role === 'admin' || role === 'super_admin' || role === 'reception';
    if (elevated) {
        return requestedFacilityId
            ? { kind: 'facility', facilityId: requestedFacilityId }
            : { kind: 'all' };
    }
    return { kind: 'error', status: 403, message: 'Rol sin acceso a esta operación.' };
}
