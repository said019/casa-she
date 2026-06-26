// Periodos de nómina de coaches. La matemática del pago se agrupa por periodo
// según la frecuencia configurada (settings.payroll_config.frequency):
//   - 'monthly'  → mes calendario completo. Token: 'YYYY-MM'.
//   - 'biweekly' → quincena estándar mexicana. Token: 'YYYY-MM-Q1' (días 1–15) o
//                  'YYYY-MM-Q2' (día 16 al fin de mes; la 2ª quincena dura 13–16 días).
// Funciones puras (sin DB) para poder testearlas; la lectura de la frecuencia y de
// "hoy" en CDMX viven en la ruta.

import { formatMonthLabelEs } from './coachPayrollEgreso.js';

export type PayFrequency = 'biweekly' | 'monthly';

export interface PayrollPeriod {
    frequency: PayFrequency;
    token: string;        // 'YYYY-MM' | 'YYYY-MM-Q1' | 'YYYY-MM-Q2'
    monthStart: string;   // 'YYYY-MM-01' (el mes al que pertenece el periodo)
    start: string;        // 'YYYY-MM-DD' inclusivo
    endIncl: string;      // 'YYYY-MM-DD' inclusivo (último día del periodo)
    endExclusive: string; // 'YYYY-MM-DD' exclusivo (inicio del siguiente periodo) — para usar `< ` en SQL
    label: string;        // 'Mayo 2026' | '1–15 May 2026' | '16–31 May 2026'
}

const MESES_ABBR = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

function pad2(n: number): string {
    return String(n).padStart(2, '0');
}

/** Último día del mes (1–12). Hecho calendario; independiente de zona horaria. */
export function lastDayOfMonth(year: number, month1: number): number {
    return new Date(year, month1, 0).getDate();
}

function nextMonthFirst(year: number, month1: number): string {
    return month1 === 12 ? `${year + 1}-01-01` : `${year}-${pad2(month1 + 1)}-01`;
}

/** Cualquier valor que no sea 'biweekly' (incluido legacy 'weekly') cae a 'monthly'. */
export function normalizeFrequency(raw?: string | null): PayFrequency {
    return raw === 'biweekly' ? 'biweekly' : 'monthly';
}

const MONTHLY_RE = /^(\d{4})-(\d{2})$/;
const BIWEEKLY_RE = /^(\d{4})-(\d{2})-Q([12])$/;

/** ¿El token tiene forma válida de periodo (mensual o quincenal)? */
export function isValidPeriodToken(token: string): boolean {
    const m = MONTHLY_RE.exec(token) || BIWEEKLY_RE.exec(token);
    if (!m) return false;
    const month1 = Number(m[2]);
    return month1 >= 1 && month1 <= 12;
}

/**
 * Resuelve un token de periodo a sus límites de fecha y etiqueta.
 * La FORMA del token determina la frecuencia (YYYY-MM = mensual, YYYY-MM-Qn = quincenal).
 */
export function resolvePeriodToken(token: string): PayrollPeriod {
    const bi = BIWEEKLY_RE.exec(token);
    if (bi) {
        const year = Number(bi[1]);
        const month1 = Number(bi[2]);
        const half = Number(bi[3]);
        if (month1 < 1 || month1 > 12) throw new Error(`Periodo inválido: ${token}`);
        const monthStart = `${year}-${pad2(month1)}-01`;
        if (half === 1) {
            return {
                frequency: 'biweekly',
                token,
                monthStart,
                start: `${year}-${pad2(month1)}-01`,
                endIncl: `${year}-${pad2(month1)}-15`,
                endExclusive: `${year}-${pad2(month1)}-16`,
                label: `1–15 ${MESES_ABBR[month1 - 1]} ${year}`,
            };
        }
        const last = lastDayOfMonth(year, month1);
        return {
            frequency: 'biweekly',
            token,
            monthStart,
            start: `${year}-${pad2(month1)}-16`,
            endIncl: `${year}-${pad2(month1)}-${pad2(last)}`,
            endExclusive: nextMonthFirst(year, month1),
            label: `16–${last} ${MESES_ABBR[month1 - 1]} ${year}`,
        };
    }

    const mo = MONTHLY_RE.exec(token);
    if (mo) {
        const year = Number(mo[1]);
        const month1 = Number(mo[2]);
        if (month1 < 1 || month1 > 12) throw new Error(`Periodo inválido: ${token}`);
        const ym = `${year}-${pad2(month1)}`;
        const last = lastDayOfMonth(year, month1);
        return {
            frequency: 'monthly',
            token: ym,
            monthStart: `${ym}-01`,
            start: `${ym}-01`,
            endIncl: `${ym}-${pad2(last)}`,
            endExclusive: nextMonthFirst(year, month1),
            label: formatMonthLabelEs(ym),
        };
    }

    throw new Error(`Periodo inválido: ${token}`);
}

/** Token del periodo que contiene la fecha `ymd` ('YYYY-MM-DD'), según la frecuencia. */
export function currentPeriodToken(frequency: PayFrequency, ymd: string): string {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
    if (!m) throw new Error(`Fecha inválida: ${ymd}`);
    const ym = `${m[1]}-${m[2]}`;
    if (frequency === 'biweekly') {
        const day = Number(m[3]);
        return `${ym}-Q${day <= 15 ? 1 : 2}`;
    }
    return ym;
}
