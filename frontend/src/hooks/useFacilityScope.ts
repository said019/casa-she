/**
 * Casa Shé es mono-sede (Condesa). Ya no existe selector ni scope de sucursal:
 * este hook siempre devuelve "sin filtro" para que el backend resuelva la única
 * sede. Se mantiene como no-op porque varias pantallas aún lo importan.
 */
export function useFacilityScope(): { facilityIdParam: string; isFiltered: boolean } {
    return { facilityIdParam: '', isFiltered: false };
}
