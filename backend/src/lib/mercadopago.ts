// Capa pura de MercadoPago (Checkout Pro), SIN SDK — fetch directo a la API REST.
// Espeja el rol de lib/stripe.ts pero para MercadoPago. Las funciones "build*" y
// verifyWebhookSignature son puras (testeables sin red) — ver scripts/test-mercadopago.ts
import crypto from 'crypto';

const MP_API = 'https://api.mercadopago.com';

export function mpConfigured(): boolean {
    return Boolean(process.env.MP_ACCESS_TOKEN);
}

function accessToken(): string {
    const t = process.env.MP_ACCESS_TOKEN;
    if (!t) throw new Error('MP_ACCESS_TOKEN not configured');
    return t;
}

export interface PreferenceItem { title: string; quantity: number; unit_price: number; }
export interface CreatePreferenceInput {
    orderId: string;            // → external_reference (así el webhook sabe qué orden aprobar)
    orderNumber?: string;
    items: PreferenceItem[];
    payerEmail?: string;
    backUrl: string;            // FRONTEND_URL/app/orders/:id  (a dónde regresa la clienta)
    notificationUrl?: string;   // BACKEND_URL/webhooks/mercadopago (si falta, se usa el webhook del panel)
    expiresAt?: Date;
}
export interface CreatePreferenceResult { preferenceId: string; checkoutUrl: string; }

// Cuerpo de la preferencia — PURA (testeable). MP usa el monto en PESOS (no centavos).
export function buildPreferenceBody(input: CreatePreferenceInput): Record<string, unknown> {
    if (!input.orderId) throw new Error('ORDER_ID_REQUIRED');
    if (!input.items?.length) throw new Error('ITEMS_REQUIRED');
    for (const it of input.items) {
        if (!it.title) throw new Error('ITEM_TITLE_REQUIRED');
        if (!Number.isFinite(it.unit_price) || it.unit_price <= 0) throw new Error('ITEM_PRICE_INVALID');
    }
    return {
        items: input.items.map((it) => ({
            title: it.title,
            quantity: it.quantity ?? 1,
            unit_price: Math.round(it.unit_price * 100) / 100,
            currency_id: 'MXN',
        })),
        ...(input.payerEmail ? { payer: { email: input.payerEmail } } : {}),
        external_reference: input.orderId,
        back_urls: {
            success: `${input.backUrl}?mp=success`,
            failure: `${input.backUrl}?mp=failure`,
            pending: `${input.backUrl}?mp=pending`,
        },
        auto_return: 'approved',
        ...(input.expiresAt ? {
            expires: true,
            expiration_date_from: new Date().toISOString(),
            expiration_date_to: input.expiresAt.toISOString(),
        } : {}),
        ...(input.notificationUrl ? { notification_url: input.notificationUrl } : {}),
        ...(input.orderNumber ? { metadata: { order_number: input.orderNumber } } : {}),
    };
}

export async function createPreference(input: CreatePreferenceInput): Promise<CreatePreferenceResult> {
    const body = buildPreferenceBody(input);
    const resp = await fetch(`${MP_API}/checkout/preferences`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken()}`,
            'Content-Type': 'application/json',
            'X-Idempotency-Key': `casashe:pref:${input.orderId}`,
        },
        body: JSON.stringify(body),
    });
    if (!resp.ok) {
        const txt = await resp.text().catch(() => '');
        throw new Error(`MP_PREFERENCE_FAILED ${resp.status}: ${txt.slice(0, 300)}`);
    }
    const data = await resp.json() as { id: string; init_point?: string; sandbox_init_point?: string };
    const checkoutUrl = data.init_point || data.sandbox_init_point;
    if (!checkoutUrl) throw new Error('MP_NO_CHECKOUT_URL');
    return { preferenceId: data.id, checkoutUrl };
}

// Verificación de firma del webhook — PURA. Devuelve true si es válida.
// Header x-signature: "ts=<timestamp>,v1=<hmac>". Manifest exacto que exige MP:
//   id:<dataId>;request-id:<xRequestId>;ts:<ts>;
// HMAC-SHA256 con MP_WEBHOOK_SECRET, comparación en tiempo constante.
// secret vacío → se OMITE la verificación (modo legacy; nunca en producción).
export function verifyWebhookSignature(params: {
    xSignature: string | undefined;
    xRequestId: string | undefined;
    dataId: string | undefined;
    secret: string;
}): boolean {
    const { xSignature, xRequestId, dataId, secret } = params;
    if (!secret) return true; // legacy: sin secreto configurado, no se puede verificar
    if (!xSignature || !dataId) return false;
    const parts: Record<string, string> = {};
    for (const kv of xSignature.split(',')) {
        const idx = kv.indexOf('=');
        if (idx === -1) continue;
        parts[kv.slice(0, idx).trim()] = kv.slice(idx + 1).trim();
    }
    const ts = parts['ts'];
    const v1 = parts['v1'];
    if (!ts || !v1) return false;
    const manifest = `id:${String(dataId).toLowerCase()};request-id:${xRequestId ?? ''};ts:${ts};`;
    const expected = crypto.createHmac('sha256', secret).update(manifest).digest('hex');
    try {
        const a = Buffer.from(expected, 'hex');
        const b = Buffer.from(v1, 'hex');
        return a.length === b.length && crypto.timingSafeEqual(a, b);
    } catch { return false; }
}

// Consulta el estado REAL del pago. Nunca se confía en el body del webhook.
export interface MpPayment {
    id: number | string;
    status: string;          // approved | pending | in_process | rejected | cancelled | refunded ...
    status_detail: string;
    external_reference: string | null;   // = orderId
    transaction_amount: number | null;
}
export async function syncPayment(mpPaymentId: string): Promise<MpPayment> {
    const resp = await fetch(`${MP_API}/v1/payments/${encodeURIComponent(mpPaymentId)}`, {
        headers: { 'Authorization': `Bearer ${accessToken()}` },
    });
    if (!resp.ok) {
        const txt = await resp.text().catch(() => '');
        throw new Error(`MP_PAYMENT_FETCH_FAILED ${resp.status}: ${txt.slice(0, 300)}`);
    }
    const p = await resp.json() as Partial<MpPayment>;
    return {
        id: p.id ?? mpPaymentId,
        status: String(p.status ?? ''),
        status_detail: String(p.status_detail ?? ''),
        external_reference: p.external_reference ?? null,
        transaction_amount: p.transaction_amount ?? null,
    };
}
