import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const { mockHashPin, mockVerifyPin, mockIsInsecurePin } = vi.hoisted(() => ({
  mockHashPin: vi.fn<(pin: string) => Promise<string>>().mockResolvedValue('hashed-pin'),
  mockVerifyPin: vi.fn<(pin: string, hash: string) => Promise<boolean>>().mockResolvedValue(false),
  mockIsInsecurePin: vi.fn<(pin: string) => { insecure: boolean; reason?: string }>().mockReturnValue({ insecure: false }),
}));

vi.mock('@/lib/auth/pin', () => ({
  hashPin: mockHashPin,
  verifyPin: mockVerifyPin,
  isInsecurePin: mockIsInsecurePin,
}));

// ─── Drizzle chain helper ─────────────────────────────────────────────────────

function chain<T>(value: T): unknown {
  const thenFn = (resolve: (v: T) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(value).then(resolve, reject);
  return new Proxy(
    { then: thenFn },
    {
      get(_t, prop) {
        if (prop === 'then') return thenFn;
        if (prop === 'catch') return (r: (e: unknown) => unknown) => Promise.resolve(value).catch(r);
        if (prop === 'finally') return (cb: () => void) => Promise.resolve(value).finally(cb);
        if (prop === Symbol.toPrimitive || prop === Symbol.iterator) return undefined;
        return (..._args: unknown[]) => chain(value);
      },
    },
  );
}

// ─── DB mock factory ──────────────────────────────────────────────────────────

function makeDb(overrides?: {
  selectRows?: unknown[];
  insertReturn?: unknown;
}) {
  const selectRows = overrides?.selectRows ?? [];
  const mockValues = vi.fn().mockResolvedValue(overrides?.insertReturn ?? []);
  const mockOnConflict = vi.fn().mockResolvedValue([]);
  const mockInsertChain = { values: vi.fn().mockReturnValue({ onConflictDoUpdate: mockOnConflict }) };
  const mockInsert = vi.fn().mockReturnValue(mockInsertChain);

  const mockSelect = vi.fn().mockReturnValue(chain(selectRows));

  return {
    db: { select: mockSelect, insert: mockInsert } as unknown,
    mockSelect,
    mockInsert,
    mockValues,
    mockOnConflict,
    mockInsertChain,
  };
}

import {
  InsecurePinError,
  KitchenDeviceService,
  NotAdminError,
} from '@/server/services/kitchen-device';

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('KitchenDeviceService', () => {
  describe('setDevicePin', () => {
    it('throws NotAdminError when actor does not exist', async () => {
      const { db } = makeDb({ selectRows: [] });
      const svc = new KitchenDeviceService(db as never);
      await expect(svc.setDevicePin('123456', 99)).rejects.toBeInstanceOf(NotAdminError);
    });

    it('throws NotAdminError when actor is not admin', async () => {
      const { db } = makeDb({ selectRows: [{ role: 'cashier' }] });
      const svc = new KitchenDeviceService(db as never);
      await expect(svc.setDevicePin('123456', 1)).rejects.toBeInstanceOf(NotAdminError);
    });

    it('throws InsecurePinError for insecure PIN', async () => {
      mockIsInsecurePin.mockReturnValueOnce({ insecure: true, reason: 'all_same' });
      const { db } = makeDb({ selectRows: [{ role: 'admin' }] });
      const svc = new KitchenDeviceService(db as never);
      await expect(svc.setDevicePin('111111', 1)).rejects.toBeInstanceOf(InsecurePinError);
    });

    it('upserts pin hash in app_settings', async () => {
      mockHashPin.mockResolvedValueOnce('secure-hash');
      const { db, mockInsert, mockInsertChain } = makeDb({ selectRows: [{ role: 'admin' }] });
      const svc = new KitchenDeviceService(db as never);
      await svc.setDevicePin('523410', 1);
      expect(mockInsert).toHaveBeenCalledTimes(2); // settings + audit
      expect(mockInsertChain.values).toHaveBeenCalledWith(
        expect.objectContaining({ id: 1, kitchenDevicePinHash: 'secure-hash' }),
      );
    });

    it('writes audit log entry with actorId', async () => {
      const { db, mockInsert } = makeDb({ selectRows: [{ role: 'admin' }] });
      const svc = new KitchenDeviceService(db as never);
      await svc.setDevicePin('523410', 42);
      const auditCall = mockInsert.mock.calls[1];
      expect(auditCall).toBeDefined();
      // second insert is for audit log
      const auditInsertArg = mockInsert.mock.results[1]?.value as { values: ReturnType<typeof vi.fn> };
      expect(auditInsertArg.values).toHaveBeenCalledWith(
        expect.objectContaining({ actorType: 'staff', actorId: 42, action: 'kitchen_device_pin_set' }),
      );
    });

    it('is idempotent — second call also resolves without error', async () => {
      const { db } = makeDb({ selectRows: [{ role: 'admin' }] });
      const svc = new KitchenDeviceService(db as never);
      await svc.setDevicePin('523410', 1);
      await svc.setDevicePin('674523', 1);
    });
  });

  describe('verifyDevicePin', () => {
    it('returns true when PIN matches stored hash', async () => {
      mockVerifyPin.mockResolvedValueOnce(true);
      const { db } = makeDb({ selectRows: [{ hash: 'stored-hash' }] });
      const svc = new KitchenDeviceService(db as never);
      const result = await svc.verifyDevicePin('523410');
      expect(result).toBe(true);
      expect(mockVerifyPin).toHaveBeenCalledWith('523410', 'stored-hash');
    });

    it('returns false when PIN does not match', async () => {
      mockVerifyPin.mockResolvedValueOnce(false);
      const { db } = makeDb({ selectRows: [{ hash: 'stored-hash' }] });
      const svc = new KitchenDeviceService(db as never);
      expect(await svc.verifyDevicePin('000000')).toBe(false);
    });

    it('returns false when no PIN is set', async () => {
      const { db } = makeDb({ selectRows: [] });
      const svc = new KitchenDeviceService(db as never);
      expect(await svc.verifyDevicePin('523410')).toBe(false);
    });

    it('returns false when hash field is null', async () => {
      const { db } = makeDb({ selectRows: [{ hash: null }] });
      const svc = new KitchenDeviceService(db as never);
      expect(await svc.verifyDevicePin('523410')).toBe(false);
    });
  });

  describe('isDevicePinSet', () => {
    it('returns false when no settings row exists', async () => {
      const { db } = makeDb({ selectRows: [] });
      const svc = new KitchenDeviceService(db as never);
      expect(await svc.isDevicePinSet()).toBe(false);
    });

    it('returns false when kitchenDevicePinHash is null', async () => {
      const { db } = makeDb({ selectRows: [{ hash: null }] });
      const svc = new KitchenDeviceService(db as never);
      expect(await svc.isDevicePinSet()).toBe(false);
    });

    it('returns true when hash is set', async () => {
      const { db } = makeDb({ selectRows: [{ hash: 'some-hash' }] });
      const svc = new KitchenDeviceService(db as never);
      expect(await svc.isDevicePinSet()).toBe(true);
    });
  });
});
