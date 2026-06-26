// Helper puro: construye la fila de egreso (categoría 'nomina') que se registra
// automáticamente cuando se marca pagada la nómina de un coach. Aislado del endpoint
// para poder testearlo sin DB ni servidor. La escritura/transacción vive en la ruta.

const MESES_ES = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

/** 'YYYY-MM' -> 'Mes Año' en español (ej: '2026-05' -> 'Mayo 2026'). */
export function formatMonthLabelEs(month: string): string {
    const m = /^(\d{4})-(\d{2})$/.exec(month);
    if (!m) throw new Error(`Mes inválido: ${month}`);
    const year = m[1];
    const monthIdx = Number(m[2]) - 1;
    if (monthIdx < 0 || monthIdx > 11) throw new Error(`Mes fuera de rango: ${month}`);
    return `${MESES_ES[monthIdx]} ${year}`;
}

export interface CoachPayrollEgresoInput {
    payoutId: string;
    coachName: string;
    periodLabel: string; // etiqueta del periodo ya formateada (ej: 'Mayo 2026' o '1–15 May 2026')
    classesCount: number;
    payRatePerClass: number;
    amount: number;
    facilityId: string | null;
    createdBy: string;
    today: string; // 'YYYY-MM-DD' (inyectado para testeo determinista)
}

export interface CoachPayrollEgresoRow {
    category: 'nomina';
    concept: string;
    description: string;
    amount: number;
    date: string;
    status: 'pagado';
    vendor: string;
    facility_id: string | null;
    payment_method: 'transfer';
    source_payout_id: string;
    created_by: string;
}

export function buildCoachPayrollEgreso(input: CoachPayrollEgresoInput): CoachPayrollEgresoRow {
    const claseWord = input.classesCount === 1 ? 'clase' : 'clases';
    return {
        category: 'nomina',
        concept: `Nómina ${input.coachName} - ${input.periodLabel}`,
        description: `${input.classesCount} ${claseWord} × $${input.payRatePerClass}`,
        amount: input.amount,
        date: input.today,
        status: 'pagado',
        vendor: input.coachName,
        facility_id: input.facilityId,
        payment_method: 'transfer',
        source_payout_id: input.payoutId,
        created_by: input.createdBy,
    };
}
