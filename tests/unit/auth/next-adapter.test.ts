import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mock next/headers — must be hoisted before the import of nextCookies
// ---------------------------------------------------------------------------

const { mockStore, mockCookies } = vi.hoisted(() => {
  const mockStore = {
    get: vi.fn().mockReturnValue({ name: 'cerro_staff', value: 'sealed-token' }),
    set: vi.fn(),
    delete: vi.fn(),
  };
  return {
    mockStore,
    mockCookies: vi.fn().mockResolvedValue(mockStore),
  };
});

vi.mock('next/headers', () => ({ cookies: mockCookies }));

import { nextCookies } from '@/lib/auth/next-adapter';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => vi.clearAllMocks());

describe('nextCookies', () => {
  it('returns a CookieStore whose get() delegates to the Next.js store', async () => {
    const store = await nextCookies();
    const result = store.get('cerro_staff');
    expect(mockStore.get).toHaveBeenCalledWith('cerro_staff');
    expect(result).toEqual({ name: 'cerro_staff', value: 'sealed-token' });
  });

  it('returns undefined from get() when the cookie does not exist', async () => {
    mockStore.get.mockReturnValueOnce(undefined);
    const store = await nextCookies();
    expect(store.get('missing')).toBeUndefined();
  });

  it('delegates set() to the Next.js store with options', async () => {
    const store = await nextCookies();
    const opts = { httpOnly: true, path: '/' };
    store.set('cerro_staff', 'new-value', opts);
    expect(mockStore.set).toHaveBeenCalledWith('cerro_staff', 'new-value', opts);
  });

  it('delegates delete() to the Next.js store', async () => {
    const store = await nextCookies();
    store.delete('cerro_staff');
    expect(mockStore.delete).toHaveBeenCalledWith('cerro_staff');
  });
});
