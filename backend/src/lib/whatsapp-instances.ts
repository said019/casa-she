/**
 * Configuración de instancias de WhatsApp por sucursal.
 * BMB tiene 2 números: San Miguel (principal) y Tepa.
 * El ruteo es por sucursal de la clienta; si no se sabe (planes mixtos /
 * sin sucursal) cae a la principal (San Miguel).
 */

export interface WaInstanceDef {
    key: 'san-miguel' | 'tepa';
    name: string;        // nombre de la instancia en Evolution API
    label: string;       // etiqueta para el admin
    facilityName: string;
    facilityMatch: RegExp;
    primary: boolean;
}

export const WA_INSTANCES: WaInstanceDef[] = [
    {
        key: 'san-miguel',
        name: process.env.EVOLUTION_INSTANCE_SAN_MIGUEL || 'bmb-san-miguel',
        label: 'San Miguel',
        facilityName: 'BMB Studio San Miguel',
        facilityMatch: /san\s*miguel/i,
        primary: true,
    },
    {
        key: 'tepa',
        name: process.env.EVOLUTION_INSTANCE_TEPA || 'bmb-tepa',
        label: 'Tepa',
        facilityName: 'BMB Studio Tepa',
        facilityMatch: /tepa/i,
        primary: false,
    },
];

/** Instancia principal (San Miguel). */
export const WA_PRIMARY_INSTANCE: string =
    (WA_INSTANCES.find((i) => i.primary) ?? WA_INSTANCES[0]).name;

/**
 * Resuelve el nombre de instancia a partir del nombre de sucursal.
 * Default → principal (San Miguel).
 */
export function instanceForFacility(facilityName?: string | null): string {
    if (facilityName) {
        const match = WA_INSTANCES.find((i) => i.facilityMatch.test(facilityName));
        if (match) return match.name;
    }
    return WA_PRIMARY_INSTANCE;
}

/** Resuelve el nombre de instancia a partir de la key del admin ('san-miguel' | 'tepa'). */
export function instanceByKey(key?: string | null): string {
    const match = WA_INSTANCES.find((i) => i.key === key);
    return match ? match.name : WA_PRIMARY_INSTANCE;
}

/** Etiqueta corta de sucursal para meter en los mensajes (San Miguel / Tepa). */
export function sucursalLabel(facilityName?: string | null): string | null {
    if (!facilityName) return null;
    const match = WA_INSTANCES.find((i) => i.facilityMatch.test(facilityName));
    return match ? match.label : null;
}
