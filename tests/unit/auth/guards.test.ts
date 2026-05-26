import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const { mockRedirect, mockNextCookies, mockRequireRole } = vi.hoisted(() => ({
  mockRedirect: vi.fn().mockImplementation(() => {
    throw Object.assign(new Error('NEXT_REDIRECT'), { digest: 'NEXT_REDIRECT' });
  }),
  mockNextCookies: vi.fn().mockResolvedValue({}),
  mockRequireRole: vi.fn(),
}));

vi.mock('next/navigation', () => ({ redirect: mockRedirect }));
vi.mock('@/lib/auth/next-adapter', () => ({ nextCookies: mockNextCookies }));
vi.mock('@/lib/auth/session', () => ({ requireRole: mockRequireRole }));

import { requireRoleOrRedirect } from '@/lib/auth/guards';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const validSession = {
  staffUserId: 1,
  role: 'cashier' as const,
  displayName: 'Lucía',
  loggedInAt: Date.now(),
  lastSeenAt: Date.now(),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockNextCookies.mockResolvedValue({});
  mockRedirect.mockImplementation(() => {
    throw Object.assign(new Error('NEXT_REDIRECT'), { digest: 'NEXT_REDIRECT' });
  });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('requireRoleOrRedirect', () => {
  it('returns the session when role is allowed', async () => {
    mockRequireRole.mockResolvedValue({ ok: true, session: validSession });

    const result = await requireRoleOrRedirect(['cashier']);

    expect(result).toEqual(validSession);
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it('redirects with the first allowed role when there is no session', async () => {
    mockRequireRole.mockResolvedValue({ ok: false, reason: 'no_session' });

    await expect(requireRoleOrRedirect(['cashier'])).rejects.toThrow('NEXT_REDIRECT');
    expect(mockRedirect).toHaveBeenCalledWith('/login?role=cashier');
  });

  it('redirects when the session is expired', async () => {
    mockRequireRole.mockResolvedValue({ ok: false, reason: 'expired' });

    await expect(requireRoleOrRedirect(['admin'])).rejects.toThrow('NEXT_REDIRECT');
    expect(mockRedirect).toHaveBeenCalledWith('/login?role=admin');
  });

  it('redirects when the session role does not match', async () => {
    mockRequireRole.mockResolvedValue({ ok: false, reason: 'wrong_role' });

    await expect(requireRoleOrRedirect(['admin', 'cashier'])).rejects.toThrow('NEXT_REDIRECT');
    // Uses the first element of the allowed array
    expect(mockRedirect).toHaveBeenCalledWith('/login?role=admin');
  });

  it('falls back to cashier when allowed list is empty', async () => {
    mockRequireRole.mockResolvedValue({ ok: false, reason: 'no_session' });

    await expect(requireRoleOrRedirect([])).rejects.toThrow('NEXT_REDIRECT');
    expect(mockRedirect).toHaveBeenCalledWith('/login?role=cashier');
  });
});
