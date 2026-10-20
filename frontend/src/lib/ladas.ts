/** Ladas para el selector de WhatsApp. México va primero y es el default. */
export const LADAS: Array<{ lada: string; pais: string }> = [
    { lada: '52', pais: 'México' },
    { lada: '1', pais: 'EE. UU. / Canadá' },
    { lada: '34', pais: 'España' },
    { lada: '57', pais: 'Colombia' },
    { lada: '54', pais: 'Argentina' },
    { lada: '56', pais: 'Chile' },
    { lada: '51', pais: 'Perú' },
    { lada: '58', pais: 'Venezuela' },
    { lada: '593', pais: 'Ecuador' },
    { lada: '502', pais: 'Guatemala' },
    { lada: '503', pais: 'El Salvador' },
    { lada: '504', pais: 'Honduras' },
    { lada: '506', pais: 'Costa Rica' },
    { lada: '507', pais: 'Panamá' },
    { lada: '53', pais: 'Cuba' },
    { lada: '55', pais: 'Brasil' },
    { lada: '44', pais: 'Reino Unido' },
    { lada: '33', pais: 'Francia' },
    { lada: '49', pais: 'Alemania' },
    { lada: '39', pais: 'Italia' },
];

/**
 * Junta la lada elegida con lo que se escribió. Si lo escrito ya trae "+", manda eso
 * (respeta lo que tecleó recepción). Con México se deja tal cual: la normalización
 * acepta 10 dígitos o 52/521.
 */
export function telefonoConLada(lada: string, telefono: string): string {
    const texto = telefono.trim();
    if (texto.startsWith('+') || lada === '52') return texto;
    return `+${lada}${texto.replace(/[ ()-]/g, '')}`;
}
