import { Router, Request, Response } from 'express';
import express from 'express';
import { query } from '../config/database.js';
import { verifyWebhookSignature } from '../lib/stripe.js';
import { finalizePaidOrder, reversePaymentByReference } from '../lib/orderFulfillment.js';
import type { Event as StripeEvent } from 'stripe/cjs/resources/Events.js';

const router = Router();

router.post('/', express.raw({ type: 'application/json' }), async (req: Request, res: Response) => {
    const signature = req.headers['stripe-signature'] as string | undefined;
    if (!signature) return res.status(400).send('missing stripe-signature header');
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) return res.status(500).send('webhook secret not configured');

    let event: StripeEvent;
    try { event = verifyWebhookSignature(req.body, signature, secret); }
    catch (e: any) { return res.status(400).send(`signature invalid: ${e.message}`); }

    const inserted = await query<{ event_id: string }>(
        `INSERT INTO stripe_webhook_events (event_id, type) VALUES ($1, $2)
         ON CONFLICT (event_id) DO NOTHING RETURNING event_id`, [event.id, event.type]);
    if (inserted.length === 0) return res.status(200).json({ status: 'duplicate', event_id: event.id });

    try {
        await dispatchEvent(event);
        return res.status(200).json({ received: true, event_id: event.id });
    } catch (err: any) {
        await query(`DELETE FROM stripe_webhook_events WHERE event_id = $1`, [event.id]);
        return res.status(500).json({ error: 'handler failed', message: err?.message });
    }
});

async function dispatchEvent(event: StripeEvent): Promise<void> {
    switch (event.type) {
        case 'checkout.session.completed': {
            const s = event.data.object as any;
            if (s.metadata?.test === 'true') return;
            if (s.payment_status === 'paid' && s.client_reference_id) {
                const pi = typeof s.payment_intent === 'string' ? s.payment_intent : s.payment_intent?.id ?? null;
                await finalizePaidOrder(s.client_reference_id, { provider: 'stripe', paymentRef: pi });
            }
            break;
        }
        case 'checkout.session.expired': {
            const s = event.data.object as any;
            if (s.client_reference_id) {
                await query(`UPDATE orders SET stripe_payment_status='expired', updated_at=NOW()
                             WHERE id=$1 AND status='pending_payment'`, [s.client_reference_id]);
            }
            break;
        }
        case 'payment_intent.payment_failed': {
            const pi = event.data.object as any;
            const orderId = pi.metadata?.orderId;
            const reason = pi.last_payment_error?.message || 'payment_failed';
            if (orderId) {
                await query(`UPDATE orders SET stripe_payment_status=$1, updated_at=NOW()
                             WHERE id=$2 AND status='pending_payment'`, [String(reason).slice(0, 250), orderId]);
            }
            break;
        }
        case 'charge.refunded': {
            const c = event.data.object as any;
            if (c.amount_refunded === c.amount && c.payment_intent) {
                const pi = typeof c.payment_intent === 'string' ? c.payment_intent : c.payment_intent.id;
                await query(`UPDATE orders SET stripe_payment_status='refunded', updated_at=NOW()
                             WHERE stripe_payment_intent_id=$1`, [pi]);
                // Reembolso TOTAL confirmado por Stripe: revierte acceso y valor otorgado
                // (membresía, puntos, bono de referido) dentro de una transacción real — ver
                // reversePaymentByReference en lib/orderFulfillment.ts.
                await reversePaymentByReference(pi, 'Reembolso total confirmado por Stripe');
            }
            break;
        }
        case 'charge.dispute.created': {
            // Solo se ABRE el contracargo — Stripe aún puede fallar a favor del estudio. No se
            // revierte nada aquí (sería prematuro); la reversión real ocurre en
            // charge.dispute.closed cuando el resultado es 'lost' (fondos ya retirados de verdad).
            console.warn('Stripe dispute creada:', (event.data.object as any).id);
            break;
        }
        case 'charge.dispute.closed': {
            const d = event.data.object as any;
            if (d.status === 'lost' && d.payment_intent) {
                const pi = typeof d.payment_intent === 'string' ? d.payment_intent : d.payment_intent.id;
                await query(`UPDATE orders SET stripe_payment_status='charged_back', updated_at=NOW()
                             WHERE stripe_payment_intent_id=$1`, [pi]);
                await reversePaymentByReference(pi, 'Contracargo perdido (dispute) confirmado por Stripe');
            }
            break;
        }
        default: break;
    }
}

export default router;
