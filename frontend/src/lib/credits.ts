// Fuente única para MOSTRAR los créditos de una membresía.
//
// Modelo real (verificado en prod): NINGÚN plan usa el contador genérico
// `classes_remaining` — todos definen créditos por categoría reformer/multi
// (uno puede ser 0). Por eso el número útil es el **Total = reformer + multi**,
// que SIEMPRE cuadra (se calcula de los dos buckets). En planes Mixta mostramos
// además el desglose Reformer/Multi; en planes de una sola categoría basta el Total.

export interface CreditCell {
    label: string;
    /** null = ilimitado (∞). */
    value: number | null;
}

interface CreditFields {
    reformer_remaining?: number | null;
    multi_remaining?: number | null;
    classes_remaining?: number | null;
}

/**
 * Celdas a mostrar para una membresía:
 *  - BOLSA COMPARTIDA (ej. planes de plataforma Totalpass/Wellhub/Fitpass): sin créditos
 *    por categoría (reformer y multi en null) pero con un total en `classes_remaining` →
 *    son N clases para CUALQUIER tipo. Se muestra un solo cell "Clases (cualquier tipo)".
 *  - Mixta (reformer>0 Y multi>0): [Reformer, Multi, Total]
 *  - Una sola categoría / genérico: [Total]
 * Total = reformer + multi (null si cualquiera es ilimitado).
 */
export function creditCells(m: CreditFields): CreditCell[] {
    const r = m.reformer_remaining;
    const mu = m.multi_remaining;
    const rNum = typeof r === 'number';
    const muNum = typeof mu === 'number';
    // Bolsa compartida: ni reformer ni multi tienen número, pero classes_remaining sí.
    if (!rNum && !muNum && typeof m.classes_remaining === 'number') {
        return [{ label: 'Clases (cualquier tipo)', value: m.classes_remaining }];
    }
    const cells: CreditCell[] = [];
    // SIEMPRE mostrar Reformer y Multi por separado (recepción necesita ver cuántos
    // de cada uno), aunque sea 0 o ilimitado (null = ∞).
    if (rNum) cells.push({ label: 'Reformer', value: r as number });
    else if (r === null) cells.push({ label: 'Reformer', value: null });
    if (muNum) cells.push({ label: 'Multi', value: mu as number });
    else if (mu === null) cells.push({ label: 'Multi', value: null });
    // Total solo en Mixta (ambas categorías finitas y > 0) — ahí sí aporta info.
    if (rNum && muNum && (r as number) > 0 && (mu as number) > 0) {
        cells.push({ label: 'Total', value: (r as number) + (mu as number) });
    }
    if (cells.length === 0) cells.push({ label: 'Total', value: null });
    return cells;
}

/** Texto compacto: "Reformer: 8 · Multi: 9 · Total: 17" o "Total: 20" o "Ilimitado". */
export function creditLabel(m: CreditFields): string {
    const cells = creditCells(m);
    if (cells.length === 1 && cells[0].value === null) return 'Ilimitado';
    return cells.map((c) => `${c.label}: ${c.value === null ? '∞' : c.value}`).join(' · ');
}

interface PlanCreditFields {
    reformer_credits?: number | null;
    multi_credits?: number | null;
    class_limit?: number | null;
}

/**
 * Número de clases de un PLAN para mostrar al vender/asignar: "20 clases" / "Ilimitado".
 * Los planes definen sus clases por categoría (reformer_credits + multi_credits);
 * `class_limit` casi siempre es NULL, por eso usarlo mostraba ∞. Si una categoría es
 * NULL (ilimitada) → "Ilimitado".
 */
export function planClassLabel(plan: PlanCreditFields): string {
    const r = plan.reformer_credits;
    const mu = plan.multi_credits;
    const rNum = typeof r === 'number';
    const muNum = typeof mu === 'number';
    if (rNum && muNum) return `${(r as number) + (mu as number)} clases`;
    if (rNum || muNum) return 'Ilimitado'; // una categoría ilimitada (null)
    if (typeof plan.class_limit === 'number' && plan.class_limit > 0) return `${plan.class_limit} clases`;
    return 'Ilimitado';
}
