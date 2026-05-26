import { errors, jwtVerify, SignJWT } from 'jose';

import { QR_AUDIENCE, QR_ISSUER, QR_TTL_SECONDS } from './constants';

export interface QrPayload {
  orderId: string;
  tableId: number | null;
  nonce: string;
}

export interface SignedQr {
  token: string;
  expiresAt: Date;
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

export function generateNonce(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

export async function signQrToken(
  payload: QrPayload,
  secret: Uint8Array,
  now: Date = new Date(),
): Promise<SignedQr> {
  if (secret.length < 32) {
    throw new Error('QR secret must be at least 32 bytes (HS256 minimum)');
  }

  const iat = Math.floor(now.getTime() / 1000);
  const exp = iat + QR_TTL_SECONDS;

  const token = await new SignJWT({
    orderId: payload.orderId,
    tableId: payload.tableId,
    nonce: payload.nonce,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(iat)
    .setExpirationTime(exp)
    .setIssuer(QR_ISSUER)
    .setAudience(QR_AUDIENCE)
    .sign(secret);

  return { token, expiresAt: new Date(exp * 1000) };
}

type VerifyOk = { ok: true; payload: QrPayload; expiresAt: Date };
type VerifyFail = {
  ok: false;
  reason: 'malformed' | 'invalid_signature' | 'expired' | 'wrong_audience' | 'wrong_issuer';
};

export async function verifyQrToken(
  token: string,
  secret: Uint8Array,
  now?: Date,
): Promise<VerifyOk | VerifyFail> {
  try {
    const { payload } = await jwtVerify(token, secret, {
      issuer: QR_ISSUER,
      audience: QR_AUDIENCE,
      ...(now !== undefined && { currentDate: now }),
    });

    return {
      ok: true,
      payload: {
        orderId: payload['orderId'] as string,
        tableId: payload['tableId'] !== undefined ? (payload['tableId'] as number | null) : null,
        nonce: payload['nonce'] as string,
      },
      expiresAt: new Date((payload.exp as number) * 1000),
    };
  } catch (err) {
    if (err instanceof errors.JWTExpired) {
      return { ok: false, reason: 'expired' };
    }
    if (err instanceof errors.JWSSignatureVerificationFailed) {
      return { ok: false, reason: 'invalid_signature' };
    }
    if (err instanceof errors.JWTClaimValidationFailed) {
      if (err.claim === 'iss') return { ok: false, reason: 'wrong_issuer' };
      if (err.claim === 'aud') return { ok: false, reason: 'wrong_audience' };
    }
    return { ok: false, reason: 'malformed' };
  }
}
