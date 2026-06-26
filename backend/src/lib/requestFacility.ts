import { queryOne } from '../config/database.js';
import { resolveFacilityScope, type ScopeResult, type Role } from './facilityScope.js';

/** Resuelve el scope de sucursal para el usuario del request.
 *  Para reception: lee default_facility_id e is_reception_master.
 */
export async function resolveRequestFacility(
    user: { userId?: string; role?: string; isReceptionMaster?: boolean } | undefined,
    requestedFacilityId: string | null = null,
): Promise<ScopeResult> {
    const role = (user?.role || '') as Role;
    let assigned: string | null = null;
    let isMaster = user?.isReceptionMaster === true;
    if (role === 'reception' && user?.userId) {
        const row = await queryOne<{ default_facility_id: string | null; is_reception_master: boolean }>(
            `SELECT default_facility_id, is_reception_master FROM users WHERE id = $1`,
            [user.userId]
        );
        assigned = row?.default_facility_id ?? null;
        // BD es la fuente de verdad; el flag del JWT puede estar stale tras un toggle.
        isMaster = row?.is_reception_master === true;
    }
    return resolveFacilityScope({
        role,
        assignedFacilityId: assigned,
        isReceptionMaster: isMaster,
        requestedFacilityId,
    });
}
