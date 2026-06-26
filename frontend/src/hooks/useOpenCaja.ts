import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api, { getErrorMessage } from '@/lib/api';
import { toast } from 'sonner';
import { useIsElevated } from '@/hooks/useIsElevated';
import { useFacilityScopeStore } from '@/stores/facilityScopeStore';

export interface OpenCajaFacility {
    id: string;
    name: string;
}

/**
 * Lógica única para abrir caja, robusta para TODOS los casos:
 * - Recepción normal (1 sucursal asignada): el backend fuerza su sucursal; no envía facility_id.
 * - Recepción master / admin (multi-sucursal): DEBEN elegir sucursal y enviarla, o el backend
 *   no sabe cuál abrir (devolvía 400 "Falta sucursal"). Por eso aquí los elevados eligen
 *   explícitamente la sucursal (default = la del selector del header) y se manda facility_id.
 */
export function useOpenCaja(onOpened?: () => void) {
    const elevated = useIsElevated();
    const scopeSelected = useFacilityScopeStore((s) => s.selectedFacilityId);
    const queryClient = useQueryClient();

    const { data: facilities = [] } = useQuery<OpenCajaFacility[]>({
        queryKey: ['facilities'],
        queryFn: async () => (await api.get('/facilities')).data,
        enabled: elevated, // recepción normal no necesita elegir
    });

    const [facilityId, setFacilityId] = useState<string>('');

    // Default para elevados: la sucursal del header (o la primera) una vez cargada la lista.
    useEffect(() => {
        if (!elevated || facilityId) return;
        const next = scopeSelected || facilities[0]?.id || '';
        if (next) setFacilityId(next);
    }, [elevated, scopeSelected, facilities, facilityId]);

    const openMutation = useMutation({
        mutationFn: async (openingFloat: number) =>
            (await api.post('/cash-shifts/open', {
                opening_float: Number.isFinite(openingFloat) ? openingFloat : 0,
                // Elevados mandan la sucursal elegida; recepción normal la resuelve el backend.
                ...(elevated && facilityId ? { facility_id: facilityId } : {}),
            })).data,
        onSuccess: () => {
            toast.success('Caja abierta correctamente');
            queryClient.invalidateQueries({ queryKey: ['cash-current'] });
            queryClient.invalidateQueries({ queryKey: ['reception-dashboard'] });
            onOpened?.();
        },
        onError: (e) => toast.error(getErrorMessage(e)),
    });

    // Un elevado debe elegir sucursal antes de poder abrir (evita el 400 silencioso).
    const needsFacility = elevated && !facilityId;

    return { elevated, facilities, facilityId, setFacilityId, openMutation, needsFacility };
}
