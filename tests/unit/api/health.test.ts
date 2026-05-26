import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — must be declared before importing the route
// ---------------------------------------------------------------------------

const { mockBus, mockGetRealtimeBus, mockExecute } = vi.hoisted(() => {
  const mockBus = {
    state: vi.fn().mockReturnValue('connected'),
    on: vi.fn(),
    onReconnect: vi.fn(),
    close: vi.fn().mockResolvedValue(undefined),
  };
  return {
    mockBus,
    mockGetRealtimeBus: vi.fn().mockReturnValue(mockBus),
    mockExecute: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('@/lib/realtime/listener', () => ({
  getRealtimeBus: mockGetRealtimeBus,
}));

vi.mock('@/db/client', () => ({
  db: { execute: mockExecute },
}));

// Import after mocks are registered
import { GET } from '@/app/api/health/route';

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('GET /api/health', () => {
  beforeEach(() => {
    mockBus.state.mockReturnValue('connected');
    mockGetRealtimeBus.mockReturnValue(mockBus);
    mockExecute.mockResolvedValue(undefined);
  });

  it('returns 200 and ok:true when DB and listener are healthy', async () => {
    const res = await GET();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.db).toBe(true);
    expect(body.listener).toBe('connected');
    expect(typeof body.uptime_ms).toBe('number');
    expect(typeof body.timestamp).toBe('string');
  });

  it('returns 503 and ok:false when DB query fails', async () => {
    mockExecute.mockRejectedValue(new Error('connection refused'));

    const res = await GET();

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.db).toBe(false);
    expect(body.listener).toBe('connected');
  });

  it('returns 200 but ok:false when listener is reconnecting', async () => {
    mockBus.state.mockReturnValue('reconnecting');

    const res = await GET();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.db).toBe(true);
    expect(body.listener).toBe('reconnecting');
  });

  it('response shape always includes all required fields', async () => {
    const res = await GET();
    const body = await res.json();

    expect(body).toMatchObject({
      ok: expect.any(Boolean),
      db: expect.any(Boolean),
      listener: expect.any(String),
      uptime_ms: expect.any(Number),
      timestamp: expect.any(String),
    });
    // timestamp should be a valid ISO-8601 date
    expect(new Date(body.timestamp).getTime()).not.toBeNaN();
  });
});
