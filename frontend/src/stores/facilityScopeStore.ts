import { create } from 'zustand';

interface FacilityScopeState {
    selectedFacilityId: string | null; // siempre null → la única sede
    setSelected: (id: string | null) => void;
}

/**
 * Casa Shé es mono-sede (Condesa). El antiguo selector de sucursal de BMB ya no
 * existe: este store queda como no-op para no romper los imports que sobreviven.
 * `selectedFacilityId` siempre es null (= la única sede) y `setSelected` no hace nada.
 */
export const useFacilityScopeStore = create<FacilityScopeState>()(() => ({
    selectedFacilityId: null,
    setSelected: () => {},
}));
