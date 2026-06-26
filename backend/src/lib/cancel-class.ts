import { query, queryOne } from '../config/database.js';

/**
 * Cancel a class and all its active bookings, refunding membership credits.
 * Reusable across: manual cancel, event overlap cancel, closed-day cancel.
 */
export async function cancelClassWithRefunds(
    classId: string,
    cancelledBy: string,
    reason: string
): Promise<{ class: any; cancelledBookings: number; refundedCredits: number }> {
    // Cancel the class
    const result = await queryOne(
        `UPDATE classes
         SET status = 'cancelled',
             cancelled_at = NOW(),
             cancelled_by = $1,
             cancellation_reason = $2
         WHERE id = $3 RETURNING *`,
        [cancelledBy, reason, classId]
    );

    if (!result) {
        return { class: null, cancelledBookings: 0, refundedCredits: 0 };
    }

    // Get all active bookings for this class
    const bookingsToCancel = await query(
        `SELECT b.*, m.id as membership_id
         FROM bookings b
         LEFT JOIN memberships m ON b.membership_id = m.id
         WHERE b.class_id = $1 AND b.status IN ('confirmed', 'waitlist')`,
        [classId]
    );

    let cancelledBookings = 0;
    let refundedCredits = 0;

    for (const booking of bookingsToCancel) {
        await query(
            `UPDATE bookings
             SET status = 'cancelled',
                 cancelled_at = NOW(),
                 cancellation_reason = $1
             WHERE id = $2`,
            [reason, booking.id]
        );
        cancelledBookings++;

        // Refund credit to the bucket the booking consumed
        if (booking.status === 'confirmed' && booking.membership_id && booking.consumed_category) {
            const col = booking.consumed_category === 'reformer' ? 'reformer_remaining' : 'multi_remaining';
            await query(
                `UPDATE memberships SET ${col} = ${col} + 1 WHERE id = $1 AND ${col} IS NOT NULL`,
                [booking.membership_id]
            );
            refundedCredits++;
        }
    }

    return { class: result, cancelledBookings, refundedCredits };
}
