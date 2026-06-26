// Fuente de verdad (backend) de las claves de etiqueta válidas para clientes.
// Mantener en sync con frontend/src/data/clientTags.ts.
export const CLIENT_TAG_KEYS = [
    'vip',
    'primera_vez',
    'lesion',
    'deudor',
    'en_riesgo',
    'embarazo',
    'lead',
] as const;

export type ClientTagKey = (typeof CLIENT_TAG_KEYS)[number];

export const isValidTag = (k: string): k is ClientTagKey =>
    (CLIENT_TAG_KEYS as readonly string[]).includes(k);
