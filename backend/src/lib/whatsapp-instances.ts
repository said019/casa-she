/**
 * Configuración de WhatsApp de Casa Shé.
 *
 * Casa Shé opera una sola sede. Conservamos como último fallback el nombre técnico
 * de la instancia histórica para no desconectar una sesión ya vinculada en Evolution;
 * ese identificador no se usa como etiqueta ni se muestra como marca al usuario.
 */

export interface WaInstanceDef {
    key: 'casa-she';
    name: string;        // nombre de la instancia en Evolution API
    label: string;       // etiqueta para el admin
    facilityName: string;
    facilityMatch: RegExp;
    primary: boolean;
}

export const WA_INSTANCES: WaInstanceDef[] = [
    {
        key: 'casa-she',
        name:
            process.env.EVOLUTION_INSTANCE_CASA_SHE
            || process.env.EVOLUTION_INSTANCE_NAME
            || process.env.EVOLUTION_INSTANCE_SAN_MIGUEL
            || 'bmb-san-miguel',
        label: 'Casa Shé',
        facilityName: 'Casa Shé — Condesa',
        facilityMatch: /casa\s*sh[eé]|condesa/i,
        primary: true,
    },
];

/** Instancia única/principal de Casa Shé. */
export const WA_PRIMARY_INSTANCE: string =
    (WA_INSTANCES.find((i) => i.primary) ?? WA_INSTANCES[0]).name;

/**
 * Resuelve el nombre de instancia a partir del nombre de sede.
 * Default → instancia única de Casa Shé.
 */
export function instanceForFacility(facilityName?: string | null): string {
    if (facilityName) {
        const match = WA_INSTANCES.find((i) => i.facilityMatch.test(facilityName));
        if (match) return match.name;
    }
    return WA_PRIMARY_INSTANCE;
}

/** Resuelve el nombre técnico a partir de la key del admin ('casa-she'). */
export function instanceByKey(key?: string | null): string {
    const match = WA_INSTANCES.find((i) => i.key === key);
    return match ? match.name : WA_PRIMARY_INSTANCE;
}

/** Etiqueta corta de sede para los mensajes. */
export function sucursalLabel(facilityName?: string | null): string | null {
    if (!facilityName) return null;
    const match = WA_INSTANCES.find((i) => i.facilityMatch.test(facilityName));
    return match ? match.label : null;
}
