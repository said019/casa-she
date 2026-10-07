/**
 * Qué cambió en el formulario "Editar clase". PUT /api/classes/:id marca la clase para
 * resincronizar con TotalPass en cuanto recibe tipo, coach, fecha u hora, aunque traigan el
 * mismo valor; por eso solo se manda lo que de verdad cambió.
 *
 * Sin imports con alias "@/": lo prueba frontend/scripts/test-calendario-cambios.ts.
 */
export interface DatosClaseEditables {
    classTypeId: string;
    instructorId: string;
    facilityId: string | null;
    /** YYYY-MM-DD */
    date: string;
    /** HH:MM */
    startTime: string;
    /** HH:MM */
    endTime: string;
    maxCapacity: number;
    intensity: number | null;
}

interface ClaseOrigen {
    class_type_id: string;
    instructor_id: string;
    facility_id?: string | null;
    date: string;
    start_time: string;
    end_time: string;
    max_capacity: number;
    intensity?: number | null;
}

/** Misma forma para los dos lados: sin sala = null, fecha sin hora, horas sin segundos, números como número. */
function normalizar(d: DatosClaseEditables): DatosClaseEditables {
    return {
        classTypeId: d.classTypeId || '',
        instructorId: d.instructorId || '',
        facilityId: d.facilityId || null,
        date: String(d.date || '').slice(0, 10),
        startTime: String(d.startTime || '').slice(0, 5),
        endTime: String(d.endTime || '').slice(0, 5),
        maxCapacity: Number(d.maxCapacity),
        intensity: d.intensity ?? null,
    };
}

/** Los datos editables de una clase tal como llega de GET /api/classes. */
export function datosEditablesDeClase(c: ClaseOrigen): DatosClaseEditables {
    return normalizar({
        classTypeId: c.class_type_id,
        instructorId: c.instructor_id,
        facilityId: c.facility_id ?? null,
        date: c.date,
        startTime: c.start_time,
        endTime: c.end_time,
        maxCapacity: c.max_capacity,
        intensity: c.intensity ?? null,
    });
}

/** Solo los campos distintos, con el valor nuevo. Quitar la intensidad o la sala manda null. */
export function cambiosDeClase(antes: DatosClaseEditables, despues: DatosClaseEditables): Partial<DatosClaseEditables> {
    const a = normalizar(antes);
    const d = normalizar(despues);
    const cambios: Partial<Record<keyof DatosClaseEditables, unknown>> = {};
    for (const campo of Object.keys(d) as (keyof DatosClaseEditables)[]) {
        if (a[campo] !== d[campo]) cambios[campo] = d[campo];
    }
    return cambios as Partial<DatosClaseEditables>;
}
