// @vitest-environment node
import { SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';

import { QR_AUDIENCE, QR_ISSUER, QR_TTL_SECONDS } from '@/lib/qr/constants';
import { generateNonce, signQrToken, verifyQrToken } from '@/lib/qr/token';

const testSecret = new TextEncoder().encode('a'.repeat(64));
const fixedNow = new Date('2026-05-23T12:00:00.000Z');

const basePayload = {
  orderId: '01926e3c-1234-7abc-9def-000000000001',
  tableId: 5 as number | null,
  nonce: 'abc123XYZ456',
};

// ─── signQrToken ─────────────────────────────────────────────────────────────

describe('signQrToken', () => {
  it('returns a compact JWT with 3 dot-separated parts', async () => {
    const { token } = await signQrToken(basePayload, testSecret, fixedNow);
    expect(token.split('.')).toHaveLength(3);
  });

  it('expiresAt equals now + 15 min', async () => {
    const { expiresAt } = await signQrToken(basePayload, testSecret, fixedNow);
    const expected = new Date(fixedNow.getTime() + QR_TTL_SECONDS * 1000);
    expect(expiresAt).toEqual(expected);
  });

  it('different nonce produces different token', async () => {
    const { token: t1 } = await signQrToken(
      { ...basePayload, nonce: 'aaaaaaaaaaaa' },
      testSecret,
      fixedNow,
    );
    const { token: t2 } = await signQrToken(
      { ...basePayload, nonce: 'bbbbbbbbbbbb' },
      testSecret,
      fixedNow,
    );
    expect(t1).not.toBe(t2);
  });

  it('same payload + secret + now produces identical token (deterministic)', async () => {
    const { token: t1 } = await signQrToken(basePayload, testSecret, fixedNow);
    const { token: t2 } = await signQrToken(basePayload, testSecret, fixedNow);
    expect(t1).toBe(t2);
  });

  it('throws when secret is shorter than 32 bytes', async () => {
    const shortSecret = new TextEncoder().encode('tooshort');
    await expect(signQrToken(basePayload, shortSecret)).rejects.toThrow();
  });
});

// ─── verifyQrToken happy path ─────────────────────────────────────────────────

describe('verifyQrToken — happy path', () => {
  it('returns ok:true with matching payload and expiresAt', async () => {
    const { token } = await signQrToken(basePayload, testSecret, fixedNow);
    const result = await verifyQrToken(token, testSecret, fixedNow);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.payload).toEqual(basePayload);
    expect(result.expiresAt).toEqual(
      new Date(fixedNow.getTime() + QR_TTL_SECONDS * 1000),
    );
  });

  it('round-trips tableId (number) correctly', async () => {
    const payload = { ...basePayload, tableId: 42 as number | null };
    const { token } = await signQrToken(payload, testSecret, fixedNow);
    const result = await verifyQrToken(token, testSecret, fixedNow);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.tableId).toBe(42);
  });

  it('round-trips tableId: null (takeaway) as null, not undefined or 0', async () => {
    const payload = { ...basePayload, tableId: null };
    const { token } = await signQrToken(payload, testSecret, fixedNow);
    const result = await verifyQrToken(token, testSecret, fixedNow);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.tableId).toBeNull();
  });
});

// ─── verifyQrToken failures ───────────────────────────────────────────────────

describe('verifyQrToken — failures', () => {
  it('random garbage string → malformed', async () => {
    const result = await verifyQrToken('not.a.jwt', testSecret);
    expect(result).toEqual({ ok: false, reason: 'malformed' });
  });

  it('valid structure but wrong secret → invalid_signature', async () => {
    const secretB = new TextEncoder().encode('b'.repeat(64));
    const { token } = await signQrToken(basePayload, testSecret, fixedNow);
    const result = await verifyQrToken(token, secretB, fixedNow);
    expect(result).toEqual({ ok: false, reason: 'invalid_signature' });
  });

  it('token whose exp is in the past → expired', async () => {
    const { token, expiresAt } = await signQrToken(basePayload, testSecret, fixedNow);
    const afterExpiry = new Date(expiresAt.getTime() + 1000);
    const result = await verifyQrToken(token, testSecret, afterExpiry);
    expect(result).toEqual({ ok: false, reason: 'expired' });
  });

  it('wrong issuer → wrong_issuer', async () => {
    const iat = Math.floor(fixedNow.getTime() / 1000);
    const token = await new SignJWT({ ...basePayload })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(iat)
      .setExpirationTime(iat + QR_TTL_SECONDS)
      .setIssuer('other-issuer')
      .setAudience(QR_AUDIENCE)
      .sign(testSecret);

    const result = await verifyQrToken(token, testSecret, fixedNow);
    expect(result).toEqual({ ok: false, reason: 'wrong_issuer' });
  });

  it('wrong audience → wrong_audience', async () => {
    const iat = Math.floor(fixedNow.getTime() / 1000);
    const token = await new SignJWT({ ...basePayload })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(iat)
      .setExpirationTime(iat + QR_TTL_SECONDS)
      .setIssuer(QR_ISSUER)
      .setAudience('other-audience')
      .sign(testSecret);

    const result = await verifyQrToken(token, testSecret, fixedNow);
    expect(result).toEqual({ ok: false, reason: 'wrong_audience' });
  });
});

// ─── generateNonce ────────────────────────────────────────────────────────────

describe('generateNonce', () => {
  it('returns exactly 12 characters', () => {
    expect(generateNonce()).toHaveLength(12);
  });

  it('only contains [A-Za-z0-9] characters', () => {
    for (let i = 0; i < 20; i++) {
      expect(generateNonce()).toMatch(/^[A-Za-z0-9]{12}$/);
    }
  });

  it('100 calls produce more than 95 unique values', () => {
    const nonces = new Set(Array.from({ length: 100 }, () => generateNonce()));
    expect(nonces.size).toBeGreaterThan(95);
  });
});
