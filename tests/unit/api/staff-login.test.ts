import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks — declared before any import of the route
// ---------------------------------------------------------------------------

const {
  mockSelect,
  mockWhere,
  mockInsert,
  mockValues,
  mockVerifyPin,
  mockSetStaffSession,
  mockNextCookies,
  mockLimiter,
  mockGetDefaultLoginLimiter,
} = vi.hoisted(() => {
  const mockWhere = vi.fn<() => Promise<unknown[]>>().mockResolvedValue([]);
  const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
  const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });

  const mockValues = vi.fn().mockResolvedValue([]);
  const mockInsert = vi.fn().mockReturnValue({ values: mockValues });

  const mockVerifyPin = vi.fn<(pin: string, hash: string) => Promise<boolean>>().mockResolvedValue(false);
  const mockSetStaffSession = vi.fn().mockResolvedValue(undefined);

  const fakeCookieStore = { get: vi.fn(), set: vi.fn(), delete: vi.fn() };
  const mockNextCookies = vi.fn().mockResolvedValue(fakeCookieStore);

  const mockLimiter = {
    check: vi.fn().mockReturnValue({ allowed: true, remaining: 4, retryAfterMs: 0 }),
    hit: vi.fn().mockReturnValue({ allowed: false, remaining: 0, retryAfterMs: 900_000 }),
    reset: vi.fn(),
    clear: vi.fn(),
  };
  const mockGetDefaultLoginLimiter = vi.fn().mockReturnValue(mockLimiter);

  return {
    mockSelect,
    mockFrom,
    mockWhere,
    mockInsert,
    mockValues,
    mockVerifyPin,
    mockSetStaffSession,
    mockNextCookies,
    mockLimiter,
    mockGetDefaultLoginLimiter,
  };
});

vi.mock('@/db/client', () => ({
  db: { select: mockSelect, insert: mockInsert },
}));

vi.mock('@/lib/auth/pin', () => ({ verifyPin: mockVerifyPin }));

vi.mock('@/lib/auth/session', () => ({
  setStaffSession: mockSetStaffSession,
  getStaffSession: vi.fn(),
  destroyStaffSession: vi.fn(),
}));

vi.mock('@/lib/auth/next-adapter', () => ({ nextCookies: mockNextCookies }));

vi.mock('@/lib/auth/rate-limit', () => ({
  getDefaultLoginLimiter: mockGetDefaultLoginLimiter,
}));

// Import after mocks
import { POST } from '@/app/api/staff/login/route';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const activeUser = {
  id: 1,
  role: 'cashier',
  displayName: 'Lucía',
  pinHash: '$argon2id$hashed',
  isActive: true,
  createdAt: new Date(),
  lastSeenAt: null,
};

function makeRequest(body: unknown, ip = '10.0.0.1'): Request {
  return new Request('http://localhost/api/staff/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-forwarded-for': ip,
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockLimiter.check.mockReturnValue({ allowed: true, remaining: 4, retryAfterMs: 0 });
  mockLimiter.hit.mockReturnValue({ allowed: false, remaining: 0, retryAfterMs: 900_000 });
  mockWhere.mockResolvedValue([]);
  mockVerifyPin.mockResolvedValue(false);
  mockValues.mockResolvedValue([]);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/staff/login', () => {
  it('returns 200, sets cookie, and inserts audit row on valid PIN', async () => {
    mockWhere.mockResolvedValue([activeUser]);
    mockVerifyPin.mockResolvedValue(true);

    const res = await POST(makeRequest({ role: 'cashier', pin: '123456' }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.role).toBe('cashier');
    expect(body.displayName).toBe('Lucía');
    expect(body.redirectTo).toBe('/caja');
    expect(mockSetStaffSession).toHaveBeenCalledOnce();
    expect(mockValues).toHaveBeenCalledOnce();
    expect(mockLimiter.reset).toHaveBeenCalledWith('10.0.0.1:cashier');
  });

  it('returns 401 and inserts audit row on wrong PIN', async () => {
    mockWhere.mockResolvedValue([activeUser]);
    mockVerifyPin.mockResolvedValue(false);

    const res = await POST(makeRequest({ role: 'cashier', pin: '000000' }));
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toBe('invalid_credentials');
    expect(body.remaining).toBe(0);
    expect(mockSetStaffSession).not.toHaveBeenCalled();
    expect(mockValues).toHaveBeenCalledOnce(); // audit row for failure
    expect(mockLimiter.hit).toHaveBeenCalledWith('10.0.0.1:cashier');
  });

  it('returns 429 after rate limit is exhausted', async () => {
    mockLimiter.check.mockReturnValue({
      allowed: false,
      remaining: 0,
      retryAfterMs: 900_000,
    });

    const res = await POST(makeRequest({ role: 'cashier', pin: '123456' }));
    const body = await res.json();

    expect(res.status).toBe(429);
    expect(body.error).toBe('rate_limited');
    expect(body.retryAfterMs).toBe(900_000);
    expect(res.headers.get('Retry-After')).toBe('900');
    expect(mockVerifyPin).not.toHaveBeenCalled();
    expect(mockSetStaffSession).not.toHaveBeenCalled();
  });

  it('resets the rate-limit counter on successful login', async () => {
    mockWhere.mockResolvedValue([activeUser]);
    mockVerifyPin.mockResolvedValue(true);

    await POST(makeRequest({ role: 'cashier', pin: '123456' }, '192.168.1.1'));

    expect(mockLimiter.reset).toHaveBeenCalledWith('192.168.1.1:cashier');
    expect(mockLimiter.hit).not.toHaveBeenCalled();
  });

  it('different IPs use different rate-limit keys', async () => {
    mockLimiter.check.mockImplementation((key: string) => {
      if (key === '10.0.0.99:cashier') {
        return { allowed: false, remaining: 0, retryAfterMs: 900_000 };
      }
      return { allowed: true, remaining: 4, retryAfterMs: 0 };
    });

    mockWhere.mockResolvedValue([activeUser]);
    mockVerifyPin.mockResolvedValue(true);

    // IP that is blocked → 429
    const blockedRes = await POST(makeRequest({ role: 'cashier', pin: '123456' }, '10.0.0.99'));
    expect(blockedRes.status).toBe(429);

    // Different IP → passes through
    const freeRes = await POST(makeRequest({ role: 'cashier', pin: '123456' }, '10.0.0.1'));
    expect(freeRes.status).toBe(200);
  });

  it('excludes inactive staff users', async () => {
    // DB returns no active users (where clause filters isActive=true)
    mockWhere.mockResolvedValue([]);

    const res = await POST(makeRequest({ role: 'cashier', pin: '123456' }));

    expect(res.status).toBe(401);
    expect(mockVerifyPin).not.toHaveBeenCalled();
  });

  it('returns 400 with Zod issues on invalid body', async () => {
    const res = await POST(makeRequest({ role: 'unknown_role', pin: '123456' }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe('invalid_body');
    expect(Array.isArray(body.issues)).toBe(true);
  });

  it('returns 400 when body is not JSON', async () => {
    const req = new Request('http://localhost/api/staff/login', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: 'not json',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
