import { sealData, unsealData } from 'iron-session';

import type { CookieStore, RequireRoleResult, StaffRole, StaffSessionData } from './session.types';

export type { CookieStore, RequireRoleResult, StaffRole, StaffSessionData } from './session.types';

export const SESSION_COOKIE_NAME = 'cerro_staff';
export const SESSION_IDLE_TTL_MS = 12 * 60 * 60 * 1000;

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

function sealOpts() {
  return { password: getSecret(), ttl: 0 };
}

function cookieOpts() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
  };
}

export async function setStaffSession(
  cookies: CookieStore,
  data: StaffSessionData,
): Promise<void> {
  const sealed = await sealData(data, sealOpts());
  cookies.set(SESSION_COOKIE_NAME, sealed, cookieOpts());
}

export async function getStaffSession(
  cookies: CookieStore,
): Promise<StaffSessionData | null> {
  const password = getSecret();
  const entry = cookies.get(SESSION_COOKIE_NAME);
  if (!entry) return null;

  try {
    const data = await unsealData<StaffSessionData>(entry.value, { password, ttl: 0 });
    if (
      typeof data !== 'object' ||
      data === null ||
      typeof data.staffUserId !== 'number' ||
      typeof data.role !== 'string' ||
      typeof data.displayName !== 'string' ||
      typeof data.loggedInAt !== 'number' ||
      typeof data.lastSeenAt !== 'number'
    ) {
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

export async function touchStaffSession(
  cookies: CookieStore,
): Promise<StaffSessionData | null> {
  const session = await getStaffSession(cookies);
  if (session === null) return null;

  if (isSessionExpired(session)) {
    cookies.delete(SESSION_COOKIE_NAME);
    return null;
  }

  const updated: StaffSessionData = { ...session, lastSeenAt: Date.now() };
  await setStaffSession(cookies, updated);
  return updated;
}

export async function destroyStaffSession(cookies: CookieStore): Promise<void> {
  cookies.delete(SESSION_COOKIE_NAME);
}

export function isSessionExpired(s: StaffSessionData, now: Date = new Date()): boolean {
  return now.getTime() - s.lastSeenAt > SESSION_IDLE_TTL_MS;
}

export async function requireRole(
  cookies: CookieStore,
  allowedRoles: StaffRole[],
): Promise<RequireRoleResult> {
  const session = await getStaffSession(cookies);
  if (session === null) return { ok: false, reason: 'no_session' };
  if (isSessionExpired(session)) return { ok: false, reason: 'expired' };
  if (!allowedRoles.includes(session.role)) return { ok: false, reason: 'wrong_role' };
  return { ok: true, session };
}
