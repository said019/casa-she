import { useFacilityScopeStore } from '@/stores/facilityScopeStore';
import { useIsElevated } from '@/hooks/useIsElevated';

/**
 * Devuelve el facility_id que se debe agregar a las queries.
 * - Para usuarios elevados con selector activo: el id seleccionado o '' si "Todas".
 * - Para no elevados: '' (el backend forzará su sucursal por scope).
 */
export function useFacilityScope(): { facilityIdParam: string; isFiltered: boolean } {
    const elevated = useIsElevated();
    const selected = useFacilityScopeStore((s) => s.selectedFacilityId);
    if (!elevated) return { facilityIdParam: '', isFiltered: false };
    if (!selected) return { facilityIdParam: '', isFiltered: false };
    return { facilityIdParam: selected, isFiltered: true };
}
