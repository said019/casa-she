/**
 * Enlace de WhatsApp con el mensaje ya redactado, para que el estudio le escriba
 * a una alumna desde el panel.
 *
 * Se usa wa.me (abre WhatsApp Web o la app) en vez de mandar el mensaje desde el
 * servidor: escribe el estudio desde su propio número y funciona aunque la
 * instancia de WhatsApp del sistema esté caída.
 *
 * Importa sobre todo con las socias de TotalPass: reservaron desde su propia app
 * y el estudio no las conoce ni tiene su contacto por otro lado.
 *
 * Módulo sin imports a propósito, para poder probarlo con `npx tsx`.
 */

export interface DatosMensajeWhatsApp {
    telefono?: string | null;
    nombre?: string | null;
    /** Nombre de la clase, ej. "Barre". */
    clase?: string | null;
    /** Fecha de la clase en YYYY-MM-DD. */
    fecha?: string | null;
    /** Hora ya formateada para leerse, ej. "08:00". */
    hora?: string | null;
}

/**
 * Devuelve el enlace, o null si no hay un teléfono utilizable (así quien llama
 * simplemente no pinta el botón).
 */
function normalizarTelefono(telefono?: string | null): string | null {
    const digitos = (telefono || '').replace(/\D/g, '');
    if (digitos.length < 10) return null;
    // 10 dígitos = número nacional: se le antepone la lada de México. Si trae
    // más, ya viene con lada (propia o extranjera) y se respeta tal cual.
    return digitos.length === 10 ? `52${digitos}` : digitos;
}

export function enlaceWhatsApp(d: DatosMensajeWhatsApp): string | null {
    const conLada = normalizarTelefono(d.telefono);
    if (!conLada) return null;

    const nombre = (d.nombre || '').trim().split(/\s+/)[0] || '';
    const saludo = nombre ? `Hola ${nombre}, ` : 'Hola, ';

    // La fecha se arma por partes (YYYY-MM-DD) para no correrse de día por zona horaria.
    const dia = d.fecha ? d.fecha.slice(0, 10).split('-').reverse().slice(0, 2).join('/') : '';
    // Solo se menciona la clase si están los tres datos; a medias el mensaje sale raro.
    const cuando = d.clase && dia && d.hora
        ? ` sobre tu clase de ${d.clase} del ${dia} a las ${d.hora}`
        : '';

    const texto = `${saludo}te escribimos de Casa Shé${cuando}.`;
    return `https://wa.me/${conLada}?text=${encodeURIComponent(texto)}`;
}

export interface DatosAccesoWhatsApp extends DatosMensajeWhatsApp {
    /** Link de acceso (`/acceso/:token`) que devuelve el backend. */
    url: string;
}

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
    'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** "2026-10-07" → "miércoles 7 de octubre". Se calcula en UTC para no correrse de día. */
function fechaLarga(fecha: string): string {
    const [y, m, d] = fecha.slice(0, 10).split('-').map(Number);
    if (!y || !m || !d) return '';
    const dia = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    return `${DIAS[dia]} ${d} de ${MESES[m - 1]}`;
}

/** Texto del mensaje de acceso (también sirve de vista previa en pantalla). */
export function mensajeAccesoWhatsApp(d: Omit<DatosAccesoWhatsApp, 'telefono'>): string {
    const nombre = (d.nombre || '').trim().split(/\s+/)[0] || '';
    const saludo = nombre ? `Hola ${nombre}, ` : 'Hola, ';
    const fecha = d.fecha ? fechaLarga(d.fecha) : '';
    const hora = (d.hora || '').replace(/^0(\d:)/, '$1');
    const lugar = d.clase && fecha && hora
        ? ` Ya tienes tu lugar en ${d.clase} el ${fecha} a las ${hora}.`
        : '';
    return `${saludo}te escribimos de Casa Shé.${lugar} Crea tu contraseña aquí para ver tus clases y reservar desde tu celular: ${d.url}\nEl link vence en 7 días.`;
}

/** Enlace wa.me con el mensaje de acceso; null si no hay teléfono utilizable. */
export function enlaceAccesoWhatsApp(d: DatosAccesoWhatsApp): string | null {
    const conLada = normalizarTelefono(d.telefono);
    if (!conLada) return null;
    return `https://wa.me/${conLada}?text=${encodeURIComponent(mensajeAccesoWhatsApp(d))}`;
}
