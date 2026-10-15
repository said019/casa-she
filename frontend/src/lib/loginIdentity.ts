import { z } from 'zod';

/** Keep aligned with the backend: Mexican account identities are ten digits. */
export function normalizeLoginPhone(value: string): string | null {
    const text = value.trim();
    if (!/^\+?[0-9 ()-]+$/.test(text)) return null;
    const digits = text.replace(/[ ()-]/g, '').replace(/^\+/, '');
    if (/^(?:52|521)?0{10}$/.test(digits)) return null;
    if (/^[0-9]{10}$/.test(digits) && !text.startsWith('+')) return digits;
    if (/^52[0-9]{10}$/.test(digits)) return digits.slice(2);
    if (/^521[0-9]{10}$/.test(digits)) return digits.slice(3);
    return null;
}

export const clientPhoneSchema = z.string()
    .refine(value => normalizeLoginPhone(value) !== null, 'WhatsApp inválido: usa 10 dígitos o la lada +52')
    .transform(value => normalizeLoginPhone(value)!);

export const optionalClientEmailSchema = z.string().trim()
    .pipe(z.string().email('Email inválido').or(z.literal(''))).optional();
