/**
 * Regla de negocio: un paquete "individual" queda atado a un solo estudio.
 * @param boundFacilityId  estudio atado a la membresía (null = sin atadura / mixto)
 * @param classFacilityId  estudio de la clase a reservar (null = desconocido)
 * @param boundFacilityName nombre legible del estudio atado (para el mensaje)
 * @returns null si la reserva es válida; string con el mensaje de error (es-MX) si no.
 */
export function studioBookingError(
    boundFacilityId: string | null | undefined,
    classFacilityId: string | null | undefined,
    boundFacilityName: string | null | undefined
): string | null {
    if (!boundFacilityId) return null; // mixto / sin atadura
    if (classFacilityId && classFacilityId === boundFacilityId) return null;
    const name = boundFacilityName || 'tu estudio asignado';
    return `Tu paquete individual es solo para el estudio ${name}. Elige una clase de ese estudio o usa un paquete Mixto.`;
}
