import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface FacilityScopeState {
    selectedFacilityId: string | null; // null = "Todas"
    setSelected: (id: string | null) => void;
}

/**
 * Selector global de sucursal para usuarios elevados.
 * null = "Todas" (default). Persisted en localStorage para que sobreviva refresh.
 *
 * Reception normal NUNCA usa esto — el backend siempre fuerza su facility.
 * Solo aplica a admin/super_admin/reception+master.
 */
export const useFacilityScopeStore = create<FacilityScopeState>()(
    persist(
        (set) => ({
            selectedFacilityId: null,
            setSelected: (id) => set({ selectedFacilityId: id }),
        }),
        { name: 'bmb-facility-scope' }
    )
);
