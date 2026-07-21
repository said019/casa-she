/** Cliente oficial de la API Partner de TotalPass.
 *
 * Se autentica con las llaves WalletClub del estudio, conserva el JWT en
 * memoria y lo renueva automáticamente. Las fechas de TotalPass son hora local
 * marcada como UTC; por eso se normalizan con slice y nunca con Date/Intl.
 */
import axios, { type AxiosInstance } from 'axios';
import { queryOne } from '../../config/database.js';

const DEFAULT_BASE = 'https://booking-api.totalpass.com';

export interface TotalPassOfficialConfig {
  partnerApiKey: string;
  placeApiKey: string;
  base?: string | null;
}

export interface TotalPassOfficialSlot {
  _id: string;
  status?: string;
  userId?: string | number;
  user?: { id?: string; name?: string; email?: string; phone?: string; document_number?: string; [key: string]: unknown };
  eventId?: number;
  startTimeId?: string;
  eventOccurrenceUuid?: string;
  occurrenceUuid?: string;
  startTime?: string;
  endTime?: string;
  slotDate?: string;
  event?: { id?: number; title?: string; responsible?: string; [key: string]: unknown };
  [key: string]: unknown;
}

export interface TotalPassOfficialOccurrence {
  id?: number;
  eventId?: number;
  occurrenceUuid?: string;
  eventOccurrenceUuid?: string;
  startTime: string;
  endTime?: string;
  eventDate: string;
  responsible?: string;
  duration?: number;
  status?: string;
  slots: number;
  slotsInUse?: number;
  maxTimeToCancel?: string | null;
  externalReference?: string | null;
  [key: string]: unknown;
}

export interface TotalPassOfficialEvent {
  id: number;
  title: string;
  responsible?: string;
  duration?: number;
  slots?: number;
  planId?: number;
  timezone?: string;
  status?: string;
  eventColor?: string;
  externalReference?: string | null;
  EventOccurrences?: TotalPassOfficialOccurrence[];
  [key: string]: unknown;
}

export interface TotalPassIndividualInput {
  title: string;
  responsible: string;
  duration: number;
  slots: number;
  planId: number;
  timezone: 'es-MX' | 'pt-BR';
  eventDate: string;
  startTime: string;
  description?: string;
  status?: 'ACTIVE' | 'INACTIVE' | 'HIDDEN';
  maxTimeToCancel?: string;
  externalReference?: string;
}

export function totalPassOccurrenceUuid(occurrence: Partial<TotalPassOfficialOccurrence> | null | undefined): string | null {
  return occurrence?.occurrenceUuid ?? occurrence?.eventOccurrenceUuid ?? null;
}

export function totalPassTime24(value: string | null | undefined): string {
  const raw = String(value ?? '').trim();
  const twelve = raw.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!twelve) return raw.slice(0, 5);
  let hour = Number(twelve[1]) % 12;
  if (twelve[3].toUpperCase() === 'PM') hour += 12;
  return `${String(hour).padStart(2, '0')}:${twelve[2]}`;
}

export function totalPassTime12(value: string): string {
  const [hh, mm = '00'] = value.slice(0, 5).split(':');
  const hour = Number(hh);
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const display = hour % 12 || 12;
  return `${String(display).padStart(2, '0')}:${mm} ${suffix}`;
}

function jwtExpirationMs(token: string): number | null {
  try {
    const encoded = token.split('.')[1];
    const payload = JSON.parse(Buffer.from(encoded.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
    return typeof payload.exp === 'number' ? (payload.exp < 1e12 ? payload.exp * 1000 : payload.exp) : null;
  } catch {
    return null;
  }
}

export class TotalPassOfficial {
  private readonly http: AxiosInstance;
  private token: string | null = null;
  private tokenExpiresAt = 0;

  constructor(private readonly config: TotalPassOfficialConfig) {
    this.http = axios.create({
      baseURL: String(config.base || DEFAULT_BASE).replace(/\/+$/, ''),
      timeout: 30_000,
      headers: { accept: 'application/json' },
      validateStatus: () => true,
    });
  }

  async authenticate(force = false): Promise<string> {
    if (!force && this.token && Date.now() < this.tokenExpiresAt - 60_000) return this.token;
    const response = await this.http.post('/partner/auth', {
      place_api_key: this.config.placeApiKey,
      partner_api_key: this.config.partnerApiKey,
    }, { headers: { 'content-type': 'application/json' } });
    if (response.status < 200 || response.status >= 300 || typeof response.data?.token !== 'string') {
      const body = typeof response.data === 'object' ? JSON.stringify(response.data) : String(response.data ?? '');
      throw new Error(`TotalPass /partner/auth falló (${response.status}): ${body.slice(0, 300)}`);
    }
    this.token = response.data.token;
    this.tokenExpiresAt = jwtExpirationMs(this.token!) ?? Date.now() + 23 * 60 * 60 * 1000;
    return this.token!;
  }

  private async request<T>(method: 'get' | 'post' | 'put' | 'delete', path: string, options: { params?: object; body?: unknown } = {}): Promise<T> {
    const execute = async (token: string) => this.http.request({
      method,
      url: path,
      params: options.params,
      data: options.body,
      headers: { authorization: `Bearer ${token}`, ...(options.body === undefined ? {} : { 'content-type': 'application/json' }) },
    });
    let response = await execute(await this.authenticate());
    if (response.status === 401) response = await execute(await this.authenticate(true));
    if (response.status < 200 || response.status >= 300) {
      const body = typeof response.data === 'object' ? JSON.stringify(response.data) : String(response.data ?? '');
      throw new Error(`TotalPass ${method.toUpperCase()} ${path} → ${response.status}: ${body.slice(0, 500)}`);
    }
    return response.data as T;
  }

  getPlace(): Promise<Record<string, any>> { return this.request('get', '/partner/plans'); }
  listEvents(): Promise<TotalPassOfficialEvent[]> { return this.request('get', '/partner/events'); }
  findEventByOccurrence(uuid: string): Promise<TotalPassOfficialEvent> { return this.request('get', `/partner/events/${uuid}`); }
  listSlots(filter?: { slotDateFrom?: string; slotDateTo?: string; eventOccurrenceUuid?: string; userId?: string; id?: string }): Promise<TotalPassOfficialSlot[]> {
    return this.request('get', '/partner/slot', { params: filter });
  }
  createIndividualEvent(input: TotalPassIndividualInput): Promise<TotalPassOfficialEvent> {
    return this.request('post', '/partner/event-occurrence', { body: input });
  }
  updateOccurrence(uuid: string, patch: Partial<TotalPassIndividualInput>): Promise<unknown> {
    return this.request('put', `/partner/event-occurrence/${uuid}`, { body: patch });
  }
  setOccurrenceSlots(uuid: string, slots: number): Promise<TotalPassOfficialOccurrence> {
    return this.request('put', `/partner/event-occurrence/${uuid}/slot`, { body: { slots } });
  }
  deleteOccurrence(uuid: string): Promise<unknown> { return this.request('delete', `/partner/event-occurrence/${uuid}`); }
  cancelSlot(slotId: string): Promise<unknown> { return this.request('delete', `/partner/slot/${slotId}`); }
  subscribeWebhook(url: string): Promise<unknown> { return this.request('post', '/partner/webhook/subscribe', { body: { webhook_url: url } }); }
  getWebhook(): Promise<Record<string, unknown>> { return this.request('get', '/partner/webhook'); }
}

/** true si el error viene de un 429 (rate limit) de la API de TotalPass. */
export function isTotalPassRateLimit(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /→\s*429\b|\(429\)/.test(message);
}

let cached: TotalPassOfficial | null = null;
let cacheKey = '';

/** Construye el cliente oficial leyendo las llaves de `platform_credentials` (canal 'totalpass'). */
export async function totalPassOfficialFromDb(): Promise<TotalPassOfficial | null> {
  const row = await queryOne<{ partner_api_key: string | null; place_api_key: string | null; booking_base_url: string | null }>(
    `SELECT partner_api_key, place_api_key, booking_base_url
       FROM platform_credentials WHERE channel = 'totalpass'`,
  ).catch(() => null);
  const partnerApiKey = row?.partner_api_key || process.env.TOTALPASS_PARTNER_API_KEY || '';
  const placeApiKey = row?.place_api_key || process.env.TOTALPASS_PLACE_API_KEY || '';
  if (!partnerApiKey || !placeApiKey) return null;
  const nextKey = `${partnerApiKey}:${placeApiKey}:${row?.booking_base_url || DEFAULT_BASE}`;
  if (cached && cacheKey === nextKey) return cached;
  cached = new TotalPassOfficial({ partnerApiKey, placeApiKey, base: row?.booking_base_url });
  cacheKey = nextKey;
  return cached;
}

/** Extrae el plan que pertenece al place autenticado sin hardcodear ids. */
export function totalPassPlanId(place: Record<string, any>): number | null {
  const plans = Array.isArray(place?.Plans) ? place.Plans : Array.isArray(place?.plans) ? place.plans : [];
  for (const plan of plans) {
    const id = Number(plan?.id ?? plan?.planId ?? plan?._id);
    if (Number.isFinite(id) && id > 0) return id;
  }
  return null;
}
