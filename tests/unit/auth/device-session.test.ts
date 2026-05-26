import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  DEVICE_COOKIE_NAME,
  DEVICE_SESSION_TTL_SECONDS,
  getDeviceSession,
  setDeviceSession,
} from '@/lib/auth/device-session';
import type { CookieStore } from '@/lib/auth/session.types';

const TEST_SECRET = 'a'.repeat(64);
const ALT_SECRET = 'b'.repeat(64);

function fakeCookies(initial?: Record<string, string>): CookieStore & {
  store: Map<string, string>;
} {
  const store = new Map<string, string>(Object.entries(initial ?? {}));
  return {
    store,
    get: (name) => {
      const v = store.get(name);
      return v !== undefined ? { value: v } : undefined;
    },
    set: (name, value) => store.set(name, value),
    delete: (name) => store.delete(name),
  };
}

beforeAll(() => {
  vi.stubEnv('SESSION_SECRET', TEST_SECRET);
});

afterAll(() => {
  vi.unstubAllEnvs();
});

describe('setDeviceSession / getDeviceSession', () => {
  it('round-trip: sealed session can be read back', async () => {
    const cookies = fakeCookies();
    const data = { pairedAt: 1_000_000, deviceNonce: 'abc-nonce-123' };

    await setDeviceSession(cookies, data);
    expect(cookies.store.has(DEVICE_COOKIE_NAME)).toBe(true);

    const result = await getDeviceSession(cookies);
    expect(result).toEqual(data);
  });

  it('TTL constant is 30 days in seconds', () => {
    expect(DEVICE_SESSION_TTL_SECONDS).toBe(30 * 24 * 60 * 60);
  });

  it('cookie is set with correct maxAge matching TTL', async () => {
    const cookies = fakeCookies();
    const setOpts: unknown[] = [];
    const spy = vi.fn((name: string, value: string, opts: unknown) => {
      cookies.store.set(name, value);
      setOpts.push(opts);
    });
    const spiedCookies: CookieStore = {
      get: cookies.get,
      set: spy,
      delete: cookies.delete,
    };

    await setDeviceSession(spiedCookies, { pairedAt: Date.now(), deviceNonce: 'x' });
    expect(spy).toHaveBeenCalledOnce();
    expect((setOpts[0] as Record<string, unknown>).maxAge).toBe(DEVICE_SESSION_TTL_SECONDS);
    expect((setOpts[0] as Record<string, unknown>).httpOnly).toBe(true);
  });

  it('secret validation: cookie sealed with different secret returns null', async () => {
    // Seal with TEST_SECRET
    const cookies = fakeCookies();
    await setDeviceSession(cookies, { pairedAt: 1, deviceNonce: 'nonce' });
    const sealed = cookies.store.get(DEVICE_COOKIE_NAME)!;

    // Try to unseal with ALT_SECRET
    vi.stubEnv('SESSION_SECRET', ALT_SECRET);
    const altCookies = fakeCookies({ [DEVICE_COOKIE_NAME]: sealed });
    const result = await getDeviceSession(altCookies);
    expect(result).toBeNull();

    vi.stubEnv('SESSION_SECRET', TEST_SECRET);
  });

  it('garbage cookie value returns null', async () => {
    const cookies = fakeCookies({ [DEVICE_COOKIE_NAME]: 'not-a-valid-seal.garbage' });
    const result = await getDeviceSession(cookies);
    expect(result).toBeNull();
  });

  it('missing cookie returns null', async () => {
    const cookies = fakeCookies();
    const result = await getDeviceSession(cookies);
    expect(result).toBeNull();
  });

  it('cookie with wrong shape returns null', async () => {
    // Seal a payload that lacks required fields
    const { sealData } = await import('iron-session');
    const sealed = await sealData(
      { wrongField: 'oops' },
      { password: TEST_SECRET, ttl: DEVICE_SESSION_TTL_SECONDS },
    );
    const cookies = fakeCookies({ [DEVICE_COOKIE_NAME]: sealed });
    const result = await getDeviceSession(cookies);
    expect(result).toBeNull();
  });
});
