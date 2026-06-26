import Stripe from 'stripe';
import type { Checkout as StripeCheckout } from 'stripe/cjs/resources/Checkout/Sessions.js';
import type { Event as StripeEvent } from 'stripe/cjs/resources/Events.js';
import type { Refund as StripeRefund } from 'stripe/cjs/resources/Refunds.js';
import type { LatestApiVersion as StripeLatestApiVersion } from 'stripe/cjs/lib.js';
import { query, queryOne } from '../config/database.js';

const APP = process.env.APP_SLUG || 'app';
type StripeInstance = Stripe.Stripe;

export interface CreateLineItemInput { name: string; description?: string; amountMxn: number; quantity?: number; }

export function buildLineItem(input: CreateLineItemInput): StripeCheckout.SessionCreateParams.LineItem {
    if (!input.name) throw new Error('NAME_REQUIRED');
    if (!Number.isFinite(input.amountMxn) || input.amountMxn <= 0) throw new Error('AMOUNT_INVALID');
    return {
        price_data: {
            currency: 'mxn',
            unit_amount: Math.round(input.amountMxn * 100),
            product_data: { name: input.name, ...(input.description ? { description: input.description } : {}) },
        },
        quantity: input.quantity ?? 1,
    };
}

export function buildIdempotencyKey(orderId: string, attemptCount = 0): string {
    return `${APP}:${orderId}${attemptCount > 0 ? `:retry-${attemptCount}` : ''}`;
}

export function validateStripeConfig(env: NodeJS.ProcessEnv): { ok: boolean; errors: string[] } {
    const errors: string[] = [];
    const secret = env.STRIPE_SECRET_KEY;
    if (!secret) errors.push('STRIPE_SECRET_KEY missing');
    else if (env.NODE_ENV === 'production' && secret.startsWith('sk_test_')) errors.push('test key in production');
    if (!env.STRIPE_WEBHOOK_SECRET) errors.push('STRIPE_WEBHOOK_SECRET missing');
    const d = env.STRIPE_STATEMENT_DESCRIPTOR;
    if (!d) errors.push('STRIPE_STATEMENT_DESCRIPTOR missing');
    else if (d.length < 3 || d.length > 22) errors.push('statement descriptor must be 3–22 chars');
    return { ok: errors.length === 0, errors };
}

let _stripe: StripeInstance | null = null;
export function getStripe(): StripeInstance {
    if (_stripe) return _stripe;
    const secret = process.env.STRIPE_SECRET_KEY;
    if (!secret) throw new Error('STRIPE_SECRET_KEY not configured');
    _stripe = new Stripe(secret, {
        apiVersion: (process.env.STRIPE_API_VERSION as StripeLatestApiVersion) || '2026-04-22.dahlia',
        typescript: true,
    });
    return _stripe;
}

export function verifyWebhookSignature(payload: Buffer | string, signature: string, secret: string): StripeEvent {
    return getStripe().webhooks.constructEvent(payload, signature, secret);
}

export async function createOrGetStripeCustomer(input: { userId: string; email: string; name?: string; }): Promise<string> {
    const stripe = getStripe();
    const row = await queryOne<{ stripe_customer_id: string | null }>(`SELECT stripe_customer_id FROM users WHERE id = $1`, [input.userId]);
    if (!row) throw new Error('USER_NOT_FOUND');
    if (row.stripe_customer_id) {
        try {
            const existing = await stripe.customers.retrieve(row.stripe_customer_id);
            if (!existing.deleted) return row.stripe_customer_id;
        } catch (e: any) { if (e.code !== 'resource_missing') throw e; }
    }
    const customer = await stripe.customers.create({
        email: input.email, ...(input.name ? { name: input.name } : {}), metadata: { userId: input.userId },
    });
    await query(`UPDATE users SET stripe_customer_id = $1 WHERE id = $2`, [customer.id, input.userId]);
    return customer.id;
}

export interface CreateCheckoutInput {
    orderId: string; orderType: string; customerId: string;
    lineItems: StripeCheckout.SessionCreateParams.LineItem[];
    metadata: Record<string, string>; successUrl: string; cancelUrl: string;
    paymentMethodTypes?: ('card')[]; attemptCount?: number;
}
export interface CreateCheckoutResult { sessionId: string; url: string; paymentIntentId: string | null; }

export async function createCheckoutSession(input: CreateCheckoutInput): Promise<CreateCheckoutResult> {
    const stripe = getStripe();
    const descriptor = process.env.STRIPE_STATEMENT_DESCRIPTOR || APP.toUpperCase();
    const meta = { orderId: input.orderId, orderType: input.orderType, ...input.metadata };
    const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        payment_method_types: input.paymentMethodTypes ?? ['card'],
        customer: input.customerId,
        line_items: input.lineItems,
        client_reference_id: input.orderId,
        metadata: meta,
        success_url: `${input.successUrl}${input.successUrl.includes('?') ? '&' : '?'}checkout=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${input.cancelUrl}${input.cancelUrl.includes('?') ? '&' : '?'}checkout=cancelled`,
        expires_at: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
        payment_intent_data: { statement_descriptor: descriptor.slice(0, 22), metadata: meta },
    }, { idempotencyKey: buildIdempotencyKey(input.orderId, input.attemptCount ?? 0) });
    if (!session.url) throw new Error('NO_CHECKOUT_URL_RETURNED');
    return {
        sessionId: session.id, url: session.url,
        paymentIntentId: typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id ?? null,
    };
}

export async function refundCharge(input: { paymentIntentId: string; amountMxn?: number; reason?: 'duplicate' | 'fraudulent' | 'requested_by_customer'; }): Promise<StripeRefund> {
    return getStripe().refunds.create({
        payment_intent: input.paymentIntentId,
        ...(input.amountMxn !== undefined ? { amount: Math.round(input.amountMxn * 100) } : {}),
        ...(input.reason ? { reason: input.reason } : {}),
    }, { idempotencyKey: `${APP}-refund:${input.paymentIntentId}:${input.amountMxn ?? 'full'}` });
}
