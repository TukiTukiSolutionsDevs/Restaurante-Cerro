import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Hoisted mocks ─────────────────────────────────────────────────────────

const {
  mockVerifyDevicePin,
  mockSetDeviceSession,
  mockNextCookies,
  mockInsert,
  mockValues,
  mockLimiter,
} = vi.hoisted(() => {
  const mockVerifyDevicePin = vi.fn<() => Promise<boolean>>().mockResolvedValue(false);
  const mockSetDeviceSession = vi.fn().mockResolvedValue(undefined);

  const fakeCookieStore = { get: vi.fn(), set: vi.fn(), delete: vi.fn() };
  const mockNextCookies = vi.fn().mockResolvedValue(fakeCookieStore);

  const mockValues = vi.fn().mockResolvedValue([]);
  const mockInsert = vi.fn().mockReturnValue({ values: mockValues });

  const mockLimiter = {
    hit: vi.fn().mockReturnValue({ allowed: true, remaining: 4, retryAfterMs: 0 }),
    check: vi.fn(),
    reset: vi.fn(),
    clear: vi.fn(),
  };

  return {
    mockVerifyDevicePin,
    mockSetDeviceSession,
    mockNextCookies,
    mockInsert,
    mockValues,
    mockLimiter,
  };
});

vi.mock('@/db/client', () => ({
  db: { insert: mockInsert },
}));

vi.mock('@/server/services/kitchen-device', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  KitchenDeviceService: vi.fn(function (this: any) {
    this.verifyDevicePin = mockVerifyDevicePin;
  }),
}));

vi.mock('@/lib/auth/device-session', () => ({
  setDeviceSession: mockSetDeviceSession,
}));

vi.mock('@/lib/auth/next-adapter', () => ({
  nextCookies: mockNextCookies,
}));

vi.mock('@/lib/auth/rate-limit', () => ({
  createRateLimiter: vi.fn().mockReturnValue(mockLimiter),
}));

vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:crypto')>();
  return { ...actual, randomUUID: vi.fn().mockReturnValue('test-nonce-uuid') };
});

// Import after all mocks are registered
import { POST } from '@/app/api/kitchen/device-pair/route';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/kitchen/device-pair', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/kitchen/device-pair', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLimiter.hit.mockReturnValue({ allowed: true, remaining: 4, retryAfterMs: 0 });
    mockVerifyDevicePin.mockResolvedValue(false);
    mockInsert.mockReturnValue({ values: mockValues });
    mockValues.mockResolvedValue([]);
  });

  it('returns 200 and sets device session on correct PIN', async () => {
    mockVerifyDevicePin.mockResolvedValue(true);
    const req = makeRequest({ pin: '523410' });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean };
    expect(body.ok).toBe(true);
    expect(mockSetDeviceSession).toHaveBeenCalledOnce();
  });

  it('returns 401 on wrong PIN', async () => {
    mockVerifyDevicePin.mockResolvedValue(false);
    const req = makeRequest({ pin: '000000' });
    const res = await POST(req);
    expect(res.status).toBe(401);
    const body = await res.json() as { ok: boolean; error: { code: string } };
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe('INVALID_PIN');
  });

  it('returns 429 when rate limit is exceeded', async () => {
    mockLimiter.hit.mockReturnValue({ allowed: false, remaining: 0, retryAfterMs: 900_000 });
    const req = makeRequest({ pin: '523410' });
    const res = await POST(req);
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBeTruthy();
  });

  it('returns 400 on invalid body (missing pin)', async () => {
    const req = makeRequest({});
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 on non-JSON body', async () => {
    const req = new Request('http://localhost/api/kitchen/device-pair', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: 'not-json',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('writes audit log on successful pair', async () => {
    mockVerifyDevicePin.mockResolvedValue(true);
    const req = makeRequest({ pin: '523410' }, { 'x-forwarded-for': '192.168.1.100' });
    await POST(req);
    // Two inserts: one for failed-attempt guard (skipped on success), one success audit
    const successAuditCall = mockValues.mock.calls.find(
      (call) => (call[0] as Record<string, unknown>)?.action === 'kitchen_device_paired',
    );
    expect(successAuditCall).toBeDefined();
    expect((successAuditCall![0] as Record<string, unknown>).actorType).toBe('device');
  });

  it('writes audit log on failed pair attempt', async () => {
    mockVerifyDevicePin.mockResolvedValue(false);
    const req = makeRequest({ pin: '000000' });
    await POST(req);
    const failedAuditCall = mockValues.mock.calls.find(
      (call) => (call[0] as Record<string, unknown>)?.action === 'kitchen_device_pair_failed',
    );
    expect(failedAuditCall).toBeDefined();
  });

  it('does NOT set session cookie on wrong PIN', async () => {
    mockVerifyDevicePin.mockResolvedValue(false);
    const req = makeRequest({ pin: '999888' });
    await POST(req);
    expect(mockSetDeviceSession).not.toHaveBeenCalled();
  });
});
