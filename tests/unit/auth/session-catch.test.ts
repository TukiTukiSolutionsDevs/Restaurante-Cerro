import { beforeAll, describe, expect, it, vi } from 'vitest';

// Mock iron-session before any imports so the mocked unsealData is used
// when @/lib/auth/session binds its import at load time.
vi.mock('iron-session', async (importOriginal) => {
  const mod = await importOriginal<typeof import('iron-session')>();
  return {
    ...mod,
    unsealData: vi.fn().mockRejectedValue(new Error('unexpected crypto error')),
  };
});

import { getStaffSession, SESSION_COOKIE_NAME } from '@/lib/auth/session';
import type { CookieStore } from '@/lib/auth/session.types';

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

beforeAll(() => {
  vi.stubEnv('SESSION_SECRET', '0'.repeat(64));
});

// ─── catch path ──────────────────────────────────────────────────────────────

describe('getStaffSession — catch path', () => {
  it('returns null (not throws) when unsealData rejects unexpectedly', async () => {
    const cookies = fakeCookies({ [SESSION_COOKIE_NAME]: 'any-cookie-value' });
    expect(await getStaffSession(cookies)).toBeNull();
  });
});
