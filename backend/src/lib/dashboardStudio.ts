export interface StudioFacility { id: string; name: string; }
export interface RawStudioCount { facility_id: string | null; count: string | number; }
export interface StudioClassCount { facilityId: string; name: string; count: number; }

/** Devuelve un conteo por estudio en el orden de `facilities`, incluyendo los que tienen 0. */
export function fillStudioCounts(
    facilities: StudioFacility[],
    rows: RawStudioCount[]
): StudioClassCount[] {
    const byId = new Map<string, number>();
    for (const r of rows) {
        if (!r.facility_id) continue;
        byId.set(r.facility_id, Number(r.count) || 0);
    }
    return facilities.map((f) => ({
        facilityId: f.id,
        name: f.name,
        count: byId.get(f.id) ?? 0,
    }));
}
