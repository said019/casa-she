// Textos y formatos del calendario de clases.
import { enlaceWhatsApp } from '@/lib/whatsapp';
import type { Class } from '@/types/class';
import type { Attendee } from './tipos';

export const DAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

export function formatClassTime(value?: string) {
    return value?.slice(0, 5) || '--:--';
}

export const whatsAppDeAsistente = (attendee: Attendee, clase?: Class | null) => enlaceWhatsApp({
    telefono: attendee.phone,
    nombre: attendee.display_name,
    clase: clase?.class_type_name,
    fecha: clase?.date,
    hora: clase?.start_time ? formatClassTime(clase.start_time) : null,
});

// "Reservó": si booked_by es la propia alumna (o null) se reservó sola; si difiere, lo hizo ese staff.
export function attendeeBookedBy(a: Attendee): string {
    if (!a.booked_by || a.booked_by === a.user_id) return 'la alumna';
    const r = a.booked_by_role;
    const roleEs = r === 'reception' ? 'recepción' : (r === 'admin' || r === 'super_admin') ? 'admin' : r === 'instructor' ? 'coach' : (r || 'staff');
    return `${a.booked_by_name || 'staff'} · ${roleEs}`;
}

export const getInitials = (name: string) => {
    return name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '??';
};
