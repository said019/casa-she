// Periodos de nómina de coaches (espejo de backend/src/lib/payrollPeriod.ts).
//   - 'monthly'  → mes calendario. Token: 'YYYY-MM'.
//   - 'biweekly' → quincena mexicana. Token: 'YYYY-MM-Q1' (1–15) o 'YYYY-MM-Q2' (16–fin).
// Para el selector de periodo y las etiquetas locales. El backend valida/recalcula y
// devuelve `period_label` autoritativo, pero el front necesita armar el token.

export type PayFrequency = 'biweekly' | 'monthly';

const MESES_ABBR = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const MESES_FULL = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

function pad2(n: number): string {
    return String(n).padStart(2, '0');
}

export function lastDayOfMonth(year: number, month1: number): number {
    return new Date(year, month1, 0).getDate();
}

/** Cualquier valor que no sea 'biweekly' (incluido legacy 'weekly') cae a 'monthly'. */
export function normalizeFrequency(raw?: string | null): PayFrequency {
    return raw === 'biweekly' ? 'biweekly' : 'monthly';
}

const MONTHLY_RE = /^(\d{4})-(\d{2})$/;
const BIWEEKLY_RE = /^(\d{4})-(\d{2})-Q([12])$/;

export interface ParsedToken {
    frequency: PayFrequency;
    month: string;        // 'YYYY-MM'
    half: 1 | 2 | null;   // null para mensual
}

/** Descompone un token en mes + quincena (o null). Tolerante a tokens inválidos. */
export function parseToken(token: string): ParsedToken {
    const bi = BIWEEKLY_RE.exec(token);
    if (bi) return { frequency: 'biweekly', month: `${bi[1]}-${bi[2]}`, half: Number(bi[3]) as 1 | 2 };
    const mo = MONTHLY_RE.exec(token);
    if (mo) return { frequency: 'monthly', month: `${mo[1]}-${mo[2]}`, half: null };
    return { frequency: 'monthly', month: token, half: null };
}

/** Arma el token a partir de la frecuencia, un mes 'YYYY-MM' y (si quincenal) la mitad. */
export function buildToken(frequency: PayFrequency, month: string, half: 1 | 2 = 1): string {
    return frequency === 'biweekly' ? `${month}-Q${half}` : month;
}

/** Etiqueta legible del token. 'Junio 2026' | '1–15 Jun 2026' | '16–30 Jun 2026'. */
export function periodLabel(token: string): string {
    const { frequency, month, half } = parseToken(token);
    const m = MONTHLY_RE.exec(month);
    if (!m) return token;
    const year = Number(m[1]);
    const month1 = Number(m[2]);
    if (frequency === 'biweekly') {
        if (half === 1) return `1–15 ${MESES_ABBR[month1 - 1]} ${year}`;
        return `16–${lastDayOfMonth(year, month1)} ${MESES_ABBR[month1 - 1]} ${year}`;
    }
    return `${MESES_FULL[month1 - 1]} ${year}`;
}

/** Token del periodo que contiene `date` (default: hoy, hora local del dispositivo). */
export function currentPeriodToken(frequency: PayFrequency, date: Date = new Date()): string {
    const ym = `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
    if (frequency === 'biweekly') {
        return `${ym}-Q${date.getDate() <= 15 ? 1 : 2}`;
    }
    return ym;
}
