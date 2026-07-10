import { createHash } from 'node:crypto';
import { z } from 'zod';

export const POS_MARKABLE_TYPES: ReadonlySet<string> = new Set([
  'free_drink',
  'bar_discount',
  'product',
  'product_discount',
  'discount',
]);

const QrPayloadSchema = z.object({
  t: z.literal('checkin'),
  m: z.string().uuid(),
  ms: z.string().uuid().nullable().optional(),
  e: z.number(),
  h: z.string().min(32),
});

export interface VerifiedQr {
  userId: string;
  membershipId: string | null;
  expiresAt: number;
}

export function verifyQrPayload(raw: string): VerifiedQr | null {
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(raw, 'base64url').toString('utf-8'));
  } catch {
    return null;
  }
  const v = QrPayloadSchema.safeParse(decoded);
  if (!v.success) return null;
  if (v.data.e < Math.floor(Date.now() / 1000)) return null;
  const secret = process.env.CHECKIN_SECRET || 'walletclub-dev';
  const base = `${v.data.m}:${v.data.ms || 'none'}:${v.data.e}:${secret}`;
  const expected = createHash('sha256').update(base).digest('hex');
  if (v.data.h !== expected) return null;
  return { userId: v.data.m, membershipId: v.data.ms ?? null, expiresAt: v.data.e };
}