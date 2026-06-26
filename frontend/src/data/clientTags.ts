// Catálogo de etiquetas de cliente (predefinido, con color).
// Mantener las KEYS en sync con backend/src/lib/clientTags.ts.
export interface ClientTag {
    key: string;
    label: string;
    color: string; // hex
}

export const CLIENT_TAGS: ClientTag[] = [
    { key: 'vip', label: 'VIP', color: '#CE9B25' },
    { key: 'primera_vez', label: 'Primera vez', color: '#7C8265' },
    { key: 'lesion', label: 'Lesión', color: '#A6776A' },
    { key: 'deudor', label: 'Deudor', color: '#AD6C20' },
    { key: 'en_riesgo', label: 'En riesgo', color: '#9A8F84' },
    { key: 'embarazo', label: 'Embarazo', color: '#DBB0B3' },
    { key: 'lead', label: 'Lead', color: '#6B8E9E' },
];

export const tagByKey = (k: string): ClientTag | undefined =>
    CLIENT_TAGS.find((t) => t.key === k);
