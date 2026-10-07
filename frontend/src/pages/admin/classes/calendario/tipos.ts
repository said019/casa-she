// Tipos compartidos del calendario de clases (admin y recepción).

export interface Facility {
    id: string;
    name: string;
    description: string | null;
    capacity: number;
    is_active: boolean;
}

export interface Attendee {
    booking_id: string;
    status: string;
    checked_in_at: string | null;
    waitlist_position: number | null;
    user_id: string;
    display_name: string;
    email: string;
    photo_url: string | null;
    phone: string;
    plan_name: string | null;
    is_free_booking?: boolean;
    booked_by?: string | null;
    booked_by_name?: string | null;
    booked_by_role?: string | null;
    /** 'app' | 'totalpass' | 'wellhub' | 'fitpass' — de dónde vino la reserva. */
    channel?: string | null;
}

/** Lo que devuelve /classes/copy-week, en vista previa y en la copia real. */
export interface CopiaSemanaResumen {
    creadas: number;
    yaExistian: number;
    enDiaCerrado: number;
    enElPasado: number;
    canceladasConservadas: number;
    canceladasOmitidas: number;
    includeCancelled: boolean;
    dryRun: boolean;
    mensaje?: string;
    detalle: Array<{ fecha: string; hora: string; clase: string; resultado: string }>;
}
