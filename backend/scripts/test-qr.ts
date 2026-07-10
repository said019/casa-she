import assert from 'node:assert/strict';
import { verifyQrPayload, POS_MARKABLE_TYPES } from '../src/lib/qr.js';

async function buildRaw(userId: string, membershipId: string | null, expiresAt: number) {
  const crypto = await import('node:crypto');
  const secret = process.env.CHECKIN_SECRET || 'walletclub-dev';
  const base = `${userId}:${membershipId || 'none'}:${expiresAt}:${secret}`;
  const h = crypto.createHash('sha256').update(base).digest('hex');
  const payload = { t: 'checkin', m: userId, ms: membershipId, e: expiresAt, h };
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

async function main() {
  const userId = '00000000-0000-0000-0000-000000000001';
  const ms = '00000000-0000-0000-0000-000000000002';
  const future = Math.floor(Date.now() / 1000) + 3600;
  const past = Math.floor(Date.now() / 1000) - 3600;

  // válido
  assert.ok(verifyQrPayload(await buildRaw(userId, ms, future)), 'QR válido debe resolver');
  const v = verifyQrPayload(await buildRaw(userId, ms, future))!;
  assert.equal(v.userId, userId);
  assert.equal(v.membershipId, ms);

  // expirado
  assert.equal(verifyQrPayload(await buildRaw(userId, ms, past)), null, 'expirado → null');

  // hash alterado
  const bad = { t: 'checkin', m: userId, ms, e: future, h: '0'.repeat(64) };
  const badRaw = Buffer.from(JSON.stringify(bad)).toString('base64url');
  assert.equal(verifyQrPayload(badRaw), null, 'hash alterado → null');

  // no-parseable
  assert.equal(verifyQrPayload('no-es-json'), null);

  // tipos POS
  assert.equal(POS_MARKABLE_TYPES.has('free_drink'), true);
  assert.equal(POS_MARKABLE_TYPES.has('free_class'), false);

  console.log('OK: verifyQrPayload + POS_MARKABLE_TYPES');
}
main().catch((e) => { console.error(e); process.exit(1); });