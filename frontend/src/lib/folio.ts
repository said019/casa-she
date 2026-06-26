// Folio legible de una reserva (booking). El backend guarda un entero secuencial
// en `bookings.folio`; aquí lo formateamos como "R-00042" para mostrar y rastrear.
export function formatFolio(folio?: number | string | null): string {
    if (folio === null || folio === undefined || folio === '') return '—';
    const n = typeof folio === 'string' ? parseInt(folio, 10) : folio;
    if (!Number.isFinite(n)) return String(folio);
    return `R-${String(n).padStart(5, '0')}`;
}
