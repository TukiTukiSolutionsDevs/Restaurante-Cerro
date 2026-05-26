import { sealData, unsealData } from 'iron-session';

import type { CookieStore } from './session.types';

export const DEVICE_COOKIE_NAME = 'cerro_kitchen';
/** 30 days in seconds — used for both iron-session TTL and cookie maxAge. */
export const DEVICE_SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

export interface DeviceSessionData {
  pairedAt: number;
  deviceNonce: string;
}

function getSecret(): string {
  const secret = process.env.SESSION_SECRET ?? '';
  if (secret.length < 32) {
    throw new Error(
      `SESSION_SECRET must be ≥32 characters (got ${secret.length}). ` +
        `Set a strong random value in your environment.`,
    );
  }
  return secret;
}

export async function setDeviceSession(
  cookies: CookieStore,
  data: DeviceSessionData,
): Promise<void> {
  const sealed = await sealData(data, {
    password: getSecret(),
    ttl: DEVICE_SESSION_TTL_SECONDS,
  });
  cookies.set(DEVICE_COOKIE_NAME, sealed, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: DEVICE_SESSION_TTL_SECONDS,
  });
}

export async function getDeviceSession(
  cookies: CookieStore,
): Promise<DeviceSessionData | null> {
  const entry = cookies.get(DEVICE_COOKIE_NAME);
  if (!entry) return null;

  try {
    const data = await unsealData<DeviceSessionData>(entry.value, {
      password: getSecret(),
      ttl: DEVICE_SESSION_TTL_SECONDS,
    });
    if (
      typeof data !== 'object' ||
      data === null ||
      typeof (data as DeviceSessionData).pairedAt !== 'number' ||
      typeof (data as DeviceSessionData).deviceNonce !== 'string'
    ) {
      return null;
    }
    return data as DeviceSessionData;
  } catch {
    return null;
  }
}
