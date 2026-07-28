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
export function enlaceWhatsApp(d: DatosMensajeWhatsApp): string | null {
    const digitos = (d.telefono || '').replace(/\D/g, '');
    if (digitos.length < 10) return null;
    // 10 dígitos = número nacional: se le antepone la lada de México. Si trae
    // más, ya viene con lada (propia o extranjera) y se respeta tal cual.
    const conLada = digitos.length === 10 ? `52${digitos}` : digitos;

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
