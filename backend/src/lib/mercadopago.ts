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
// Fail-closed: sin secreto configurado, se RECHAZA el webhook (nunca se acepta como si la
// firma fuera válida). Antes esto fallaba abierto (`return true`) — si MP_WEBHOOK_SECRET
// llegara a faltar por un error de configuración/rotación, cualquier request sin firma
// habría sido aceptado como webhook legítimo, pudiendo activar membresías/pagos falsos.
// Mismo criterio que ya usa stripe-webhook.ts (rechaza si falta el secret).
export function verifyWebhookSignature(params: {
    xSignature: string | undefined;
    xRequestId: string | undefined;
    dataId: string | undefined;
    secret: string;
}): boolean {
    const { xSignature, xRequestId, dataId, secret } = params;
    if (!secret) return false;
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

/**
 * Busca un pago por external_reference (= orderId, ver createPreference) cuando NO se
 * conoce su mp_payment_id — el caso exacto de una orden pagada cuyo webhook nunca llegó
 * (deploy, timeout, MP_WEBHOOK_SECRET mal configurado). Sin esto, una clienta que sí pagó
 * quedaba sin ningún camino de reconciliación más que cancelar su orden. Devuelve el pago
 * más reciente (si hay varios intentos), priorizando cualquiera que esté 'approved'.
 */
export async function searchPaymentByExternalReference(orderId: string): Promise<MpPayment | null> {
    const resp = await fetch(
        `${MP_API}/v1/payments/search?external_reference=${encodeURIComponent(orderId)}&sort=date_created&criteria=desc`,
        { headers: { 'Authorization': `Bearer ${accessToken()}` } }
    );
    if (!resp.ok) {
        const txt = await resp.text().catch(() => '');
        throw new Error(`MP_PAYMENT_SEARCH_FAILED ${resp.status}: ${txt.slice(0, 300)}`);
    }
    const body = await resp.json() as { results?: Partial<MpPayment>[] };
    const results = body.results ?? [];
    if (results.length === 0) return null;
    const approved = results.find((p) => p.status === 'approved');
    const p = approved ?? results[0];
    return {
        id: p.id ?? '',
        status: String(p.status ?? ''),
        status_detail: String(p.status_detail ?? ''),
        external_reference: p.external_reference ?? orderId,
        transaction_amount: p.transaction_amount ?? null,
    };
}
