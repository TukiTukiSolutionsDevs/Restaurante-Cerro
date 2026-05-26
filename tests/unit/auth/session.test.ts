import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  destroyStaffSession,
  getStaffSession,
  isSessionExpired,
  requireRole,
  SESSION_COOKIE_NAME,
  SESSION_IDLE_TTL_MS,
  setStaffSession,
  touchStaffSession,
} from '@/lib/auth/session';
import type { CookieStore, StaffSessionData } from '@/lib/auth/session.types';

const TEST_SECRET = '0'.repeat(64);

function fakeCookies(initial?: Record<string, string>): CookieStore {
  const store = new Map<string, string>(Object.entries(initial ?? {}));
  return {
    get: (name) => {
      const v = store.get(name);
      return v !== undefined ? { value: v } : undefined;
    },
    set: (name, value) => {
      store.set(name, value);
    },
    delete: (name) => {
      store.delete(name);
    },
  };
}

function makeSession(overrides?: Partial<StaffSessionData>): StaffSessionData {
  const now = Date.now();
  return {
    staffUserId: 1,
    role: 'cashier',
    displayName: 'Lucía',
    loggedInAt: now,
    lastSeenAt: now,
    ...overrides,
  };
}

beforeAll(() => {
  vi.stubEnv('SESSION_SECRET', TEST_SECRET);
});

afterAll(() => {
  vi.unstubAllEnvs();
});

// ─── isSessionExpired ────────────────────────────────────────────────────────

describe('isSessionExpired', () => {
  it('returns false when lastSeenAt is 11 h ago', () => {
    const now = new Date();
    const s = makeSession({ lastSeenAt: now.getTime() - 11 * 60 * 60 * 1000 });
    expect(isSessionExpired(s, now)).toBe(false);
  });

  it('returns true when lastSeenAt is 12 h + 1 s ago', () => {
    const now = new Date();
    const s = makeSession({ lastSeenAt: now.getTime() - SESSION_IDLE_TTL_MS - 1_000 });
    expect(isSessionExpired(s, now)).toBe(true);
  });
});

// ─── setStaffSession + getStaffSession ───────────────────────────────────────

describe('setStaffSession + getStaffSession', () => {
  it('round-trips session data correctly', async () => {
    const cookies = fakeCookies();
    const session = makeSession();
    await setStaffSession(cookies, session);
    expect(await getStaffSession(cookies)).toEqual(session);
  });

  it('returns null when the cookie value is garbage', async () => {
    const cookies = fakeCookies({ [SESSION_COOKIE_NAME]: 'not-a-valid-seal' });
    expect(await getStaffSession(cookies)).toBeNull();
  });

  it('returns null when the cookie store is empty', async () => {
    expect(await getStaffSession(fakeCookies())).toBeNull();
  });

  it('returns null when the cookie was sealed with a different secret', async () => {
    vi.stubEnv('SESSION_SECRET', 'a'.repeat(64));
    const altCookies = fakeCookies();
    await setStaffSession(altCookies, makeSession());
    const sealedValue = altCookies.get(SESSION_COOKIE_NAME)!.value;

    vi.stubEnv('SESSION_SECRET', TEST_SECRET);

    const cookies = fakeCookies({ [SESSION_COOKIE_NAME]: sealedValue });
    expect(await getStaffSession(cookies)).toBeNull();
  });
});

// ─── touchStaffSession ───────────────────────────────────────────────────────

describe('touchStaffSession', () => {
  it('returns null when no session exists in the cookie store', async () => {
    expect(await touchStaffSession(fakeCookies())).toBeNull();
  });

  it('updates lastSeenAt after 100 ms', async () => {
    vi.useFakeTimers();
    try {
      const t0 = 1_000_000;
      vi.setSystemTime(t0);

      const cookies = fakeCookies();
      await setStaffSession(cookies, makeSession({ lastSeenAt: t0, loggedInAt: t0 }));

      vi.setSystemTime(t0 + 100);

      const touched = await touchStaffSession(cookies);
      expect(touched).not.toBeNull();
      expect(touched!.lastSeenAt).toBeGreaterThan(t0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('returns null and clears the cookie when the session is expired', async () => {
    const cookies = fakeCookies();
    const expired = makeSession({ lastSeenAt: Date.now() - SESSION_IDLE_TTL_MS - 1_000 });
    await setStaffSession(cookies, expired);

    const result = await touchStaffSession(cookies);
    expect(result).toBeNull();
    expect(cookies.get(SESSION_COOKIE_NAME)).toBeUndefined();
  });
});

// ─── destroyStaffSession ─────────────────────────────────────────────────────

describe('destroyStaffSession', () => {
  it('getStaffSession returns null after destroy', async () => {
    const cookies = fakeCookies();
    await setStaffSession(cookies, makeSession());
    await destroyStaffSession(cookies);
    expect(await getStaffSession(cookies)).toBeNull();
  });

  it('is a no-op on an empty cookie store', async () => {
    await expect(destroyStaffSession(fakeCookies())).resolves.toBeUndefined();
  });
});

// ─── requireRole ─────────────────────────────────────────────────────────────

describe('requireRole', () => {
  it('returns no_session when the cookie store is empty', async () => {
    expect(await requireRole(fakeCookies(), ['cashier'])).toEqual({
      ok: false,
      reason: 'no_session',
    });
  });

  it('returns expired when the session has timed out', async () => {
    const cookies = fakeCookies();
    await setStaffSession(
      cookies,
      makeSession({ lastSeenAt: Date.now() - SESSION_IDLE_TTL_MS - 1_000 }),
    );
    expect(await requireRole(cookies, ['cashier'])).toEqual({ ok: false, reason: 'expired' });
  });

  it('returns wrong_role when the session role is not in allowedRoles', async () => {
    const cookies = fakeCookies();
    await setStaffSession(cookies, makeSession({ role: 'cashier' }));
    expect(await requireRole(cookies, ['admin'])).toEqual({ ok: false, reason: 'wrong_role' });
  });

  it('returns ok:true with the session when role matches', async () => {
    const cookies = fakeCookies();
    const session = makeSession({ role: 'admin' });
    await setStaffSession(cookies, session);
    expect(await requireRole(cookies, ['admin', 'cashier'])).toEqual({ ok: true, session });
  });
});

// ─── secret validation ───────────────────────────────────────────────────────

describe('secret validation', () => {
  it('throws when SESSION_SECRET is shorter than 32 characters', async () => {
    vi.stubEnv('SESSION_SECRET', 'too-short');
    try {
      await expect(getStaffSession(fakeCookies())).rejects.toThrow('SESSION_SECRET');
    } finally {
      vi.stubEnv('SESSION_SECRET', TEST_SECRET);
    }
  });

  it('throws when SESSION_SECRET is not set (undefined)', async () => {
    const backup = process.env.SESSION_SECRET;
    delete process.env.SESSION_SECRET;
    try {
      await expect(getStaffSession(fakeCookies())).rejects.toThrow('SESSION_SECRET');
    } finally {
      process.env.SESSION_SECRET = backup;
    }
  });
});

// ─── cookie security options ─────────────────────────────────────────────────

describe('cookie security options', () => {
  it('sets secure:true when NODE_ENV is production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    let capturedOptions: unknown;
    const spy: CookieStore = {
      get: () => undefined,
      set: (_n, _v, opts) => {
        capturedOptions = opts;
      },
      delete: () => {},
    };
    try {
      await setStaffSession(spy, makeSession());
      expect((capturedOptions as { secure?: boolean })?.secure).toBe(true);
    } finally {
      vi.stubEnv('NODE_ENV', 'test');
    }
  });
});
