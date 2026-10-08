/**
 * Catálogo de plataformas de reserva (canales) con su marca oficial.
 * La clave es la misma que usa la base de datos en bookings.channel y
 * channel_inventory.channel. Wellhub existe en la base, pero no entra aquí
 * hasta que haya trato con ellos.
 *
 * Sin imports con alias "@/": lo usa también un script tsx de pruebas.
 */
export type CanalClave = 'totalpass' | 'fitpass';

export interface Canal {
    clave: CanalClave;
    nombre: string;
    /** Relleno del punto de lugar de una socia de este canal. */
    punto: string;
    /** Anillo del punto, más oscuro para que se distinga sobre fondo claro. */
    anillo: string;
    /** Logo para fondo claro (ruta pública). */
    logoClaro: string;
    /** Logo para fondo oscuro; null = el claro sobre una pastilla blanca. */
    logoOscuro: string | null;
    /** Multiplica el alto pedido para igualar el peso visual entre logos. */
    escalaAlto: number;
    /** Ya publica clases y trae reservas. */
    conectado: boolean;
}

export const CANALES: Record<CanalClave, Canal> = {
    totalpass: {
        clave: 'totalpass',
        nombre: 'TotalPass',
        punto: '#26D07C',
        anillo: '#0F7A45',
        logoClaro: '/brands/totalpass-claro.svg',
        logoOscuro: '/brands/totalpass-oscuro.svg',
        escalaAlto: 1,
        conectado: true,
    },
    fitpass: {
        clave: 'fitpass',
        nombre: 'Fitpass',
        punto: '#5A8AD0',
        anillo: '#2F5BA8',
        logoClaro: '/brands/fitpass.png',
        logoOscuro: null,
        // El PNG incluye el ícono circular: a igual alto, las letras salen más chicas que las de TotalPass.
        escalaAlto: 1.6,
        conectado: true,
    },
};

const ALTO_MINIMO = 8;

export function esCanal(valor: unknown): valor is CanalClave {
    return typeof valor === 'string' && Object.prototype.hasOwnProperty.call(CANALES, valor);
}

/** Plataforma escrita en el nombre de un plan interno ("Totalpass", "Socias FitPass"…). */
export function canalDePlan(nombrePlan: string | null | undefined): CanalClave | null {
    if (!nombrePlan) return null;
    const plano = nombrePlan.toLowerCase().replace(/[^a-z]/g, '');
    if (!plano) return null;
    for (const clave of Object.keys(CANALES) as CanalClave[]) {
        if (plano.includes(clave)) return clave;
    }
    return null;
}

export function canalesConectados(): Canal[] {
    return Object.values(CANALES).filter((c) => c.conectado);
}

/** Qué archivo y a qué alto pintar el logo de un canal sobre cierto fondo. */
export function logoDeCanal(
    clave: CanalClave,
    fondo: 'claro' | 'oscuro',
    alto: number,
): { src: string; alt: string; altoPx: number; pastilla: boolean } {
    const c = CANALES[clave];
    const oscuro = fondo === 'oscuro';
    return {
        src: oscuro && c.logoOscuro ? c.logoOscuro : c.logoClaro,
        alt: c.nombre,
        altoPx: Math.max(ALTO_MINIMO, Math.round(alto * c.escalaAlto)),
        pastilla: oscuro && !c.logoOscuro,
    };
}
