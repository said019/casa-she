/** The order itself is the durable admin feed entry; push is an extra channel. */
export function studioOrderAlert(plan: string, amount: number) {
    return {
        title: 'Pago pendiente en estudio',
        body: `${plan} · $${amount.toLocaleString('es-MX')} MXN. Revisa Pagos para identificar a la alumna y confirmar el cobro.`,
        url: '/admin/payments',
        tag: 'studio_order',
    };
}

export async function notifyAdminsOfStudioOrder(plan: string, amount: number): Promise<void> {
    try {
        const { query } = await import('../config/database.js');
        const { sendWebPushToUser } = await import('./web-push.js');
        const admins = await query<{id: string}>(
            `SELECT id FROM users WHERE role IN ('admin', 'super_admin') AND is_active = true`,
        );
        await Promise.allSettled(admins.map(a => sendWebPushToUser(a.id, studioOrderAlert(plan, amount))));
    } catch (error) {
        console.error('[studio-order-alert] push failed; order remains visible in admin feed:', error);
    }
}
