import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockExpirePendingOrders = vi.fn().mockResolvedValue({ cancelled: 0 });

vi.mock('@/db/client', () => ({ db: {} }));

vi.mock('@/server/services/order', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  OrderService: vi.fn(function (this: any) {
    this.expirePendingOrders = mockExpirePendingOrders;
  }),
}));

// Import after mocks are set up
const { startOrderExpirationCron } = await import(
  '@/server/cron/expire-orders'
);

describe('startOrderExpirationCron', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockExpirePendingOrders.mockClear();
    mockExpirePendingOrders.mockResolvedValue({ cancelled: 0 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns a stop function', () => {
    const stop = startOrderExpirationCron({ intervalMs: 1000 });
    expect(typeof stop).toBe('function');
    stop();
  });

  it('calls expirePendingOrders on each interval tick', async () => {
    startOrderExpirationCron({ intervalMs: 1000 });

    await vi.advanceTimersByTimeAsync(1000);
    expect(mockExpirePendingOrders).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(mockExpirePendingOrders).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(1000);
    expect(mockExpirePendingOrders).toHaveBeenCalledTimes(3);
  });

  it('stops calling after stop() is invoked', async () => {
    const stop = startOrderExpirationCron({ intervalMs: 1000 });

    await vi.advanceTimersByTimeAsync(1000);
    expect(mockExpirePendingOrders).toHaveBeenCalledTimes(1);

    stop();

    await vi.advanceTimersByTimeAsync(3000);
    expect(mockExpirePendingOrders).toHaveBeenCalledTimes(1);
  });

  it('uses custom intervalMs', async () => {
    startOrderExpirationCron({ intervalMs: 5000 });

    await vi.advanceTimersByTimeAsync(4999);
    expect(mockExpirePendingOrders).toHaveBeenCalledTimes(0);

    await vi.advanceTimersByTimeAsync(1);
    expect(mockExpirePendingOrders).toHaveBeenCalledTimes(1);
  });

  it('calls custom logger when orders are cancelled', async () => {
    mockExpirePendingOrders.mockResolvedValueOnce({ cancelled: 3 });
    const logger = vi.fn();

    startOrderExpirationCron({ intervalMs: 1000, logger });

    await vi.advanceTimersByTimeAsync(1000);
    expect(logger).toHaveBeenCalledWith(expect.stringContaining('3'));
  });

  it('calls logger on error without crashing', async () => {
    mockExpirePendingOrders.mockRejectedValueOnce(new Error('DB down'));
    const logger = vi.fn();

    startOrderExpirationCron({ intervalMs: 1000, logger });

    await vi.advanceTimersByTimeAsync(1000);
    expect(logger).toHaveBeenCalledWith(expect.stringContaining('DB down'));
  });
});
