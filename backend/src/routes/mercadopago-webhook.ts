import { Router, Request, Response } from 'express';
import { query } from '../config/database.js';
import { verifyWebhookSignature, syncPayment } from '../lib/mercadopago.js';
import { finalizePaidOrder } from '../lib/orderFulfillment.js';

const router = Router();

// POST /webhooks/mercadopago
// MercadoPago notifica cambios de pago. Espeja el webhook de Stripe:
//   verifica firma → idempotencia en BD → consulta el estado REAL → finaliza la orden.
// No requiere raw body: la firma de MP se calcula sobre data.id (no sobre el cuerpo).
router.post('/', async (req: Request, res: Response) => {
    // MP manda data.id por body {type, data:{id}} y/o por query (?type=payment&data.id=..).
    const type = String((req.body?.type ?? req.body?.action ?? req.query.type ?? '') || '');
    const dataId = String(
        (req.body?.data?.id ?? (req.query['data.id'] as string) ?? req.query.id ?? '') || ''
    );

    // Solo procesamos notificaciones de pago. Lo demás se ignora con 200 (MP no reintenta).
    if (!dataId || !type.includes('payment')) {
        return res.status(200).json({ ignored: true });
    }

    // Verificación de firma (HMAC del panel de MP). secret vacío → se omite (log).
    const secret = process.env.MP_WEBHOOK_SECRET || '';
    const validSig = verifyWebhookSignature({
        xSignature: req.headers['x-signature'] as string | undefined,
        xRequestId: req.headers['x-request-id'] as string | undefined,
        dataId,
        secret,
    });
    if (!validSig) {
        console.warn(`[MP webhook] firma inválida para pago ${dataId}`);
        return res.status(401).send('invalid signature');
    }
    if (!secret) {
        console.warn('[MP webhook] MP_WEBHOOK_SECRET vacío — verificación de firma omitida (inseguro).');
    }

    // Idempotencia real de BD: UNIQUE(provider, event_key). Reenvíos de MP se ignoran.
    const eventKey = `payment:${dataId}:${(req.headers['x-request-id'] as string) ?? ''}`;
    const dedup = await query<{ id: string }>(
        `INSERT INTO payment_webhook_events (provider, event_key, event_type)
         VALUES ('mercadopago', $1, $2)
         ON CONFLICT (provider, event_key) DO NOTHING RETURNING id`,
        [eventKey, type]
    );
    if (dedup.length === 0) {
        return res.status(200).json({ status: 'duplicate' });
    }

    try {
        // Nunca confiar en el body: consultar el estado real a MP.
        const payment = await syncPayment(dataId);
        const orderId = payment.external_reference;

        if (orderId) {
            await query(
                `UPDATE orders SET mp_payment_id=$1, mp_payment_status=$2, mp_status_detail=$3,
                        payment_provider='mercadopago', provider_synced_at=NOW(), updated_at=NOW()
                 WHERE id=$4`,
                [String(payment.id), payment.status, payment.status_detail, orderId]
            );

            if (payment.status === 'approved') {
                // Idempotente: si la orden ya está approved, no hace nada.
                await finalizePaidOrder(orderId, { provider: 'mercadopago', paymentRef: String(payment.id) });
            } else if (payment.status === 'rejected' || payment.status === 'cancelled') {
                await query(
                    `UPDATE orders SET rejected_at=NOW(), updated_at=NOW()
                     WHERE id=$1 AND status='pending_payment'`,
                    [orderId]
                );
            }
        } else {
            console.warn(`[MP webhook] pago ${dataId} sin external_reference — no se pudo asociar a una orden.`);
        }

        return res.status(200).json({ received: true });
    } catch (err: any) {
        // Al fallar, borramos el evento para que el reintento de MP lo reprocese.
        await query(
            `DELETE FROM payment_webhook_events WHERE provider='mercadopago' AND event_key=$1`,
            [eventKey]
        );
        console.error('[MP webhook] handler falló:', err?.message);
        return res.status(500).json({ error: 'handler failed' });
    }
});

export default router;
