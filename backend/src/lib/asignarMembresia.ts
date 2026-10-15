/**
 * Asigna un paquete a una clienta por parte del staff: membresía + pago + puntos de lealtad.
 * Es la lógica de POST /api/memberships/assign extraída para que el "alta rápida" venda el
 * paquete con EXACTAMENTE las mismas reglas (fechas, cancelaciones, descuento founder,
 * ajuste manual, turno de caja, puntos).
 *
 * Contrato de transacción: NO hace BEGIN/COMMIT; se llama con un cliente dentro de la
 * transacción de quien llama. Las notificaciones (correo, WhatsApp, wallet, push de puntos)
 * y la bitácora van DESPUÉS del commit, a cargo de quien llama.
 */
import { awardPaymentLoyaltyPoints, consumeFounderFirstPackageDiscount } from './loyalty.js';
import { openShiftForUser } from './openShift.js';
import { manualDiscountNote, type ManualPriceAdjustmentResult } from './manual-price-adjustment.js';
import { addDaysToDate, cdmxToday } from './schedule.js';
import { resolveStaffMembershipDates } from './membershipActivation.js';

type Tx = { query: (text: string, params?: any[]) => Promise<{ rows: any[]; rowCount?: number | null }> };

export interface AsignarMembresiaParams {
    userId: string;
    plan: any; // fila completa de plans
    startDate: string;
    endDate?: string;
    paymentDate?: string;
    respectExplicitDates?: boolean;
    status: 'active' | 'pending_payment' | 'pending_activation';
    /** Ya normalizado ('bank_transfer' → 'transfer'); null = sin pago. */
    paymentMethod: string | null;
    isGratis: boolean;
    gratisReason: string;
    notes?: string | null;
    /** Resultado de resolveManualPriceAdjustment (ok:true). */
    manualAdjustment: Extract<ManualPriceAdjustmentResult, { ok: true }>;
    /** Staff que asigna. */
    actorUserId: string | null;
}

export interface AsignarMembresiaResultado {
    membership: any;
    start: string;
    end: string;
    purchasePointsAwarded: number;
}

export async function asignarMembresiaEnTx(
    client: Tx,
    p: AsignarMembresiaParams,
): Promise<AsignarMembresiaResultado> {
    const { userId, plan, status, isGratis, gratisReason, notes, manualAdjustment, actorUserId } = p;
    let start = p.startDate;
    let end = p.endDate || addDaysToDate(p.startDate, Number(plan.duration_days || 0));
    let purchasePointsAwarded = 0;

    if (status === 'active') {
        const dates = await resolveStaffMembershipDates(client as any, {
            userId,
            durationDays: Number(plan.duration_days || 0),
            requestedStartDate: p.startDate,
            requestedEndDate: p.endDate,
            respectExplicitDates: p.respectExplicitDates,
        });
        start = dates.startDate;
        end = dates.endDate;
    }

    // 1. Create membership
    const policyRowAdmin = await client.query(`SELECT value FROM system_settings WHERE key = 'cancellation_policy'`);
    const cancellationLimit = Number(policyRowAdmin.rows[0]?.value?.cancellations_per_membership ?? 2);

    const membershipResult = await client.query(
        `INSERT INTO memberships (
          user_id, plan_id, start_date, end_date, status, classes_remaining, reformer_remaining, multi_remaining, payment_method, payment_reference, cancellation_limit, activated_by, activated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
        RETURNING *`,
        [
            userId,
            plan.id,
            status === 'active' ? start : null,
            status === 'active' ? end : null,
            status,
            plan.class_limit ?? null,
            plan.reformer_credits ?? null,
            plan.multi_credits ?? null,
            p.paymentMethod,
            notes || null,
            cancellationLimit,
            actorUserId,
        ],
    );
    const membership = membershipResult.rows[0];

    // 2. Record payment if method provided
    if (p.paymentMethod) {
        // Cortesía $0: amount=0 (no da puntos ni suma a caja), sin descuento founder.
        const discount = isGratis
            ? { amount: 0, applied: false, discountAmount: 0 }
            : manualAdjustment.applied
                ? manualAdjustment
                : await consumeFounderFirstPackageDiscount({
                    db: client as any,
                    userId,
                    listPrice: Number(plan.price),
                });
        const paymentAmount = discount.amount;
        const paymentNotes = isGratis
            ? [notes, `Cortesía gratis. Motivo: ${gratisReason}`].filter(Boolean).join(' | ')
            : manualAdjustment.applied
                ? [notes, manualDiscountNote(manualAdjustment)].filter(Boolean).join(' | ')
                : discount.applied
                    ? [notes, `Descuento founder 10% aplicado (-$${discount.discountAmount})`].filter(Boolean).join(' | ')
                    : (notes || null);

        const shiftA = await openShiftForUser(actorUserId || '');
        const historicalPayment = !!p.paymentDate && p.paymentDate < cdmxToday();
        const staffFacility = !shiftA?.facility_id && actorUserId
            ? (await client.query('SELECT default_facility_id FROM users WHERE id=$1', [actorUserId])).rows[0]?.default_facility_id
            : null;
        const payResult = await client.query(
            `INSERT INTO payments (
            user_id, membership_id, amount, currency,
            payment_method, reference, notes, status, processed_by, shift_id, facility_id, paid_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'completed', $8, $9, $10,
              CASE WHEN $11::date IS NULL THEN NOW() ELSE ($11::date + TIME '12:00') AT TIME ZONE 'America/Mexico_City' END)
          RETURNING id`,
            [
                userId,
                membership.id,
                paymentAmount,
                plan.currency,
                p.paymentMethod,
                null,
                paymentNotes,
                actorUserId,
                historicalPayment ? null : shiftA?.id || null,
                shiftA?.facility_id || staffFacility || null,
                p.paymentDate || null,
            ],
        );

        // Award loyalty points for payment — puntos por precio
        // (computePaymentPoints; efectivo 2×). classLimit ya no se usa.
        if (payResult.rows[0]?.id) {
            purchasePointsAwarded = await awardPaymentLoyaltyPoints({
                db: client as any,
                userId,
                paymentId: payResult.rows[0].id,
                amount: paymentAmount,
                paymentMethod: p.paymentMethod,
                classLimit: plan.class_limit ?? null,
            }).catch(e => { console.error('Loyalty points error:', e); return 0; });
        }
    }

    return { membership, start, end, purchasePointsAwarded };
}
