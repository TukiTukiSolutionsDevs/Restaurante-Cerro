import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DrizzleDb } from '@/db/client';
import {
  ItemUnavailableError,
  MenuClosedError,
  OrderExpiredError,
  OrderImmutableError,
  OrderNotFoundError,
  OrderService,
  TableTakenError,
} from '@/server/services/order';

// ─── Module mocks ────────────────────────────────────────────────────────────

vi.mock('@/lib/qr/token', () => ({
  generateNonce: () => 'testnonce12345678',
  signQrToken: vi.fn().mockResolvedValue({
    token: 'mock-jwt-token',
    expiresAt: new Date('2099-05-23T13:15:00Z'),
  }),
  verifyQrToken: vi.fn().mockResolvedValue({
    ok: true,
    payload: { orderId: 'mock-order-id', tableId: null, nonce: 'testnonce' },
    expiresAt: new Date('2099-05-23T13:15:00Z'),
  }),
}));

vi.mock('@/lib/realtime/notify', () => ({
  // Call through to executor so mkExecutor's execute body is covered
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  notifyAfterTx: vi.fn((executor: any, _channel: string, _payload: unknown) =>
    executor.execute('', ['chan', '{}']),
  ),
}));

const { mockPriceOrder } = vi.hoisted(() => ({
  mockPriceOrder: vi.fn().mockReturnValue({
    lines: [
      {
        menuItemId: 1,
        variant: 'only_starter',
        quantity: 1,
        unitPriceCents: 700,
        totalCents: 700,
      },
    ],
    subtotalCents: 700,
    tupperCents: 0,
    totalCents: 700,
    detectedCombo: false,
  }),
}));

vi.mock('@/lib/money/price', () => ({ priceOrder: mockPriceOrder }));

// ─── Drizzle chain mock ───────────────────────────────────────────────────────

function chain<T>(value: T): unknown {
  const thenFn = (
    resolve: (v: T) => unknown,
    reject?: (e: unknown) => unknown,
  ) => Promise.resolve(value).then(resolve, reject);

  return new Proxy(
    { then: thenFn },
    {
      get(_target, prop) {
        if (prop === 'then') return thenFn;
        if (prop === 'catch')
          return (r: (e: unknown) => unknown) =>
            Promise.resolve(value).catch(r);
        if (prop === 'finally')
          return (cb: () => void) => Promise.resolve(value).finally(cb);
        if (prop === Symbol.toPrimitive || prop === Symbol.iterator)
          return undefined;
        return (..._args: unknown[]) => chain(value);
      },
    },
  );
}

class MockDb {
  _selects: unknown[][] = [];
  _inserts: unknown[][] = [];
  _executes: { rows: unknown[] }[] = [];

  pushSelect(...rows: unknown[][]): this {
    this._selects.push(...rows);
    return this;
  }
  pushInsert(...rows: unknown[][]): this {
    this._inserts.push(...rows);
    return this;
  }
  pushExecute(...results: { rows: unknown[] }[]): this {
    this._executes.push(...results);
    return this;
  }

  select = () => chain(this._selects.shift() ?? []);
  insert = (_t: unknown) => chain(this._inserts.shift() ?? []);
  update = (_t: unknown) => chain(undefined);
  delete = (_t: unknown) => chain(undefined);
  execute = (_q: unknown) =>
    Promise.resolve(this._executes.shift() ?? { rows: [] });
  transaction = async (fn: (tx: unknown) => Promise<unknown>) => fn(this);
}

// ─── Test fixtures ────────────────────────────────────────────────────────────

const TODAY = new Date('2026-05-23T12:00:00Z');

const MENU = {
  id: 1,
  serviceDate: '2026-05-23',
  openedAt: new Date('2026-05-23T08:00:00Z'),
  closedAt: null,
};

const COMBO = {
  id: 1,
  dailyMenuId: 1,
  dineInPriceCents: 1300,
  takeawayPriceCents: 1500,
  tupperFullPriceCents: 200,
  tupperPartialPriceCents: 100,
  partialStarterPriceCents: 700,
  partialMainPriceCents: 800,
};

const STARTER = { id: 1, dailyMenuId: 1, category: 'starter', name: 'Sopa', isAvailable: true, priceCents: null };
const MAIN = { id: 2, dailyMenuId: 1, category: 'main', name: 'Pollo', isAvailable: true, priceCents: null };
const DRINK = { id: 3, dailyMenuId: 1, category: 'drink', name: 'Chicha', isAvailable: true, priceCents: 150 };
const SOLD_OUT = { id: 4, dailyMenuId: 1, category: 'starter', name: 'Ceviche', isAvailable: false, priceCents: null };

const PENDING_ORDER = {
  id: 'order-uuid-1',
  shortCode: 'A3F7',
  status: 'pending',
  orderType: 'takeaway',
  dailyMenuId: 1,
  tableGroupId: null,
  totalCents: 700,
  qrToken: 'mock-jwt-token',
  qrExpiresAt: new Date('2099-05-23T13:15:00Z'),
  createdAt: TODAY,
  cancelledAt: null,
  cancelReason: null,
};

const PAID_ORDER = { ...PENDING_ORDER, status: 'paid' };

const DINE_IN_ORDER = {
  ...PENDING_ORDER,
  orderType: 'dine_in',
  tableGroupId: 10,
};

const SECRET = new Uint8Array(32).fill(42);

function makeService(db: MockDb) {
  return new OrderService(db as unknown as DrizzleDb, SECRET);
}

// ─── createOrder ─────────────────────────────────────────────────────────────

describe('OrderService.createOrder', () => {
  let db: MockDb;

  beforeEach(() => {
    db = new MockDb();
    vi.setSystemTime(TODAY);
    mockPriceOrder.mockReturnValue({
      lines: [{ menuItemId: 1, variant: 'only_starter', quantity: 1, unitPriceCents: 700, totalCents: 700 }],
      subtotalCents: 700,
      tupperCents: 0,
      totalCents: 700,
      detectedCombo: false,
    });
  });

  it('creates a takeaway order successfully', async () => {
    db.pushSelect([MENU], [COMBO], [STARTER], []); // menu, combo, menuItems, shortCode collision check
    db.pushInsert([], []); // order, orderItem

    const svc = makeService(db);
    const result = await svc.createOrder({
      orderType: 'takeaway',
      items: [{ menuItemId: 1, variant: 'only_starter', quantity: 1 }],
    });

    expect(result.shortCode).toHaveLength(4);
    expect(result.totalCents).toBe(700);
    expect(result.qrToken).toBe('mock-jwt-token');
    expect(result.detectedCombo).toBe(false);
  });

  it('creates a dine_in order with table group', async () => {
    db.pushSelect([MENU], [COMBO], [STARTER], []); // menu, combo, menuItems, shortCode check
    db.pushExecute({ rows: [] }); // no table conflict
    db.pushInsert([{ id: 10 }], [], [], []); // tableGroup, tableGroupMember, order, orderItem

    const svc = makeService(db);
    const result = await svc.createOrder({
      orderType: 'dine_in',
      tableId: 5,
      items: [{ menuItemId: 1, variant: 'only_starter', quantity: 1 }],
    });

    expect(result.orderId).toBeDefined();
    expect(typeof result.orderId).toBe('string');
  });

  it('detects full_combo and returns detectedCombo: true', async () => {
    mockPriceOrder.mockReturnValueOnce({
      lines: [
        { menuItemId: 1, variant: 'full_combo', quantity: 1, unitPriceCents: 1300, totalCents: 1300 },
        { menuItemId: 2, variant: 'full_combo', quantity: 1, unitPriceCents: 0, totalCents: 0 },
      ],
      subtotalCents: 1300,
      tupperCents: 0,
      totalCents: 1300,
      detectedCombo: true,
    });

    db.pushSelect([MENU], [COMBO], [STARTER, MAIN], []);
    db.pushInsert([], []);

    const svc = makeService(db);
    const result = await svc.createOrder({
      orderType: 'takeaway',
      items: [
        { menuItemId: 1, variant: 'full_combo', quantity: 1 },
        { menuItemId: 2, variant: 'full_combo', quantity: 1 },
      ],
    });

    expect(result.detectedCombo).toBe(true);
    expect(result.totalCents).toBe(1300);
  });

  it('throws MenuClosedError when no open menu today', async () => {
    db.pushSelect([]); // no menu

    const svc = makeService(db);
    await expect(
      svc.createOrder({ orderType: 'takeaway', items: [{ menuItemId: 1, variant: 'only_starter', quantity: 1 }] }),
    ).rejects.toThrow(MenuClosedError);
  });

  it('throws MenuClosedError when combo config is missing', async () => {
    db.pushSelect([MENU], []); // menu but no combo

    const svc = makeService(db);
    await expect(
      svc.createOrder({ orderType: 'takeaway', items: [{ menuItemId: 1, variant: 'only_starter', quantity: 1 }] }),
    ).rejects.toThrow(MenuClosedError);
  });

  it('throws ItemUnavailableError when item not in menu', async () => {
    db.pushSelect([MENU], [COMBO], [STARTER]); // menuItems doesn't include id=99

    const svc = makeService(db);
    await expect(
      svc.createOrder({ orderType: 'takeaway', items: [{ menuItemId: 99, variant: 'only_starter', quantity: 1 }] }),
    ).rejects.toThrow(ItemUnavailableError);
  });

  it('throws ItemUnavailableError when item is sold out', async () => {
    db.pushSelect([MENU], [COMBO], [SOLD_OUT]);

    const svc = makeService(db);
    await expect(
      svc.createOrder({ orderType: 'takeaway', items: [{ menuItemId: 4, variant: 'only_starter', quantity: 1 }] }),
    ).rejects.toThrow(ItemUnavailableError);
  });

  it('throws TableTakenError when dine_in has no tableId', async () => {
    db.pushSelect([MENU], [COMBO], [STARTER]);

    const svc = makeService(db);
    await expect(
      svc.createOrder({ orderType: 'dine_in', tableId: null, items: [{ menuItemId: 1, variant: 'only_starter', quantity: 1 }] }),
    ).rejects.toThrow(TableTakenError);
  });

  it('throws TableTakenError when table has a conflicting order', async () => {
    db.pushSelect([MENU], [COMBO], [STARTER]);
    db.pushExecute({ rows: [{ n: '1' }] }); // conflict found

    const svc = makeService(db);
    await expect(
      svc.createOrder({ orderType: 'dine_in', tableId: 5, items: [{ menuItemId: 1, variant: 'only_starter', quantity: 1 }] }),
    ).rejects.toThrow(TableTakenError);
  });

  it('throws when all 5 short code attempts collide', async () => {
    const collision = [{ id: 'existing' }];
    db.pushSelect([MENU], [COMBO], [STARTER], collision, collision, collision, collision, collision);

    const svc = makeService(db);
    await expect(
      svc.createOrder({ orderType: 'takeaway', items: [{ menuItemId: 1, variant: 'only_starter', quantity: 1 }] }),
    ).rejects.toThrow('No se pudo generar un código único');
  });

  it('retries short code on collision and succeeds', async () => {
    // shortCode check returns existing on first try, empty on second
    db.pushSelect([MENU], [COMBO], [STARTER], [{ id: 'existing' }], []);
    db.pushExecute({ rows: [] }); // table conflict check for dine_in
    db.pushInsert([{ id: 10 }], [], [], []);

    const svc = makeService(db);
    const result = await svc.createOrder({
      orderType: 'dine_in',
      tableId: 5,
      items: [{ menuItemId: 1, variant: 'only_starter', quantity: 1 }],
    });

    expect(result.shortCode).toHaveLength(4);
  });

  it('handles withTupper: true and missing pricing line in createOrder', async () => {
    mockPriceOrder.mockReturnValueOnce({ lines: [], subtotalCents: 0, tupperCents: 0, totalCents: 0, detectedCombo: false });
    db.pushSelect([MENU], [COMBO], [STARTER], []);
    db.pushInsert([], []);

    const svc = makeService(db);
    const result = await svc.createOrder({
      orderType: 'takeaway',
      items: [{ menuItemId: 1, variant: 'only_starter', quantity: 1, withTupper: true }],
    });

    expect(result.totalCents).toBe(0);
  });

  it('includes drink in order with correct unitPrice', async () => {
    mockPriceOrder.mockReturnValueOnce({
      lines: [{ menuItemId: 3, variant: 'drink_extra', quantity: 1, unitPriceCents: 150, totalCents: 150 }],
      subtotalCents: 150,
      tupperCents: 0,
      totalCents: 150,
      detectedCombo: false,
    });

    db.pushSelect([MENU], [COMBO], [DRINK], []);
    db.pushInsert([], []);

    const svc = makeService(db);
    const result = await svc.createOrder({
      orderType: 'takeaway',
      items: [{ menuItemId: 3, variant: 'drink_extra', quantity: 1 }],
    });

    expect(result.totalCents).toBe(150);
  });
});

// ─── patchItems ──────────────────────────────────────────────────────────────

describe('OrderService.patchItems', () => {
  let db: MockDb;

  beforeEach(() => {
    db = new MockDb();
    vi.setSystemTime(TODAY);
  });

  it('replaces order items and updates total', async () => {
    db.pushSelect([PENDING_ORDER], [STARTER], [COMBO]);
    db.pushInsert([]);

    const svc = makeService(db);
    await expect(
      svc.patchItems('mock-jwt-token', [{ menuItemId: 1, variant: 'only_starter', quantity: 2 }]),
    ).resolves.toBeUndefined();
  });

  it('throws OrderNotFoundError when token not found', async () => {
    db.pushSelect([]); // no order

    const svc = makeService(db);
    await expect(svc.patchItems('bad-token', [])).rejects.toThrow(OrderNotFoundError);
  });

  it('throws OrderImmutableError when order is not pending', async () => {
    db.pushSelect([PAID_ORDER]);

    const svc = makeService(db);
    await expect(
      svc.patchItems('mock-jwt-token', [{ menuItemId: 1, variant: 'only_starter', quantity: 1 }]),
    ).rejects.toThrow(OrderImmutableError);
  });

  it('throws OrderExpiredError when QR is expired', async () => {
    const expiredOrder = { ...PENDING_ORDER, qrExpiresAt: new Date('2020-01-01') };
    db.pushSelect([expiredOrder]);

    const svc = makeService(db);
    await expect(
      svc.patchItems('mock-jwt-token', [{ menuItemId: 1, variant: 'only_starter', quantity: 1 }]),
    ).rejects.toThrow(OrderExpiredError);
  });

  it('throws MenuClosedError when combo config is missing during patch', async () => {
    db.pushSelect([PENDING_ORDER], [STARTER], []); // no combo

    const svc = makeService(db);
    await expect(
      svc.patchItems('mock-jwt-token', [{ menuItemId: 1, variant: 'only_starter', quantity: 1 }]),
    ).rejects.toThrow(MenuClosedError);
  });

  it('throws ItemUnavailableError when patched item is not in the menu', async () => {
    db.pushSelect([PENDING_ORDER], [STARTER]); // STARTER id=1 returned, but requesting id=99

    const svc = makeService(db);
    await expect(
      svc.patchItems('mock-jwt-token', [{ menuItemId: 99, variant: 'only_starter', quantity: 1 }]),
    ).rejects.toThrow(ItemUnavailableError);
  });

  it('sets withTupper: true and uses 0 unitPrice when pricing line is missing', async () => {
    mockPriceOrder.mockReturnValueOnce({ lines: [], subtotalCents: 0, tupperCents: 0, totalCents: 0, detectedCombo: false });
    db.pushSelect([PENDING_ORDER], [STARTER], [COMBO]);
    db.pushInsert([]);

    const svc = makeService(db);
    await expect(
      svc.patchItems('mock-jwt-token', [{ menuItemId: 1, variant: 'only_starter', quantity: 1, withTupper: true }]),
    ).resolves.toBeUndefined();
  });

  it('throws ItemUnavailableError on unavailable item during patch', async () => {
    db.pushSelect([PENDING_ORDER], [SOLD_OUT]);

    const svc = makeService(db);
    await expect(
      svc.patchItems('mock-jwt-token', [{ menuItemId: 4, variant: 'only_starter', quantity: 1 }]),
    ).rejects.toThrow(ItemUnavailableError);
  });
});

// ─── cancelByCustomer ────────────────────────────────────────────────────────

describe('OrderService.cancelByCustomer', () => {
  let db: MockDb;

  beforeEach(() => {
    db = new MockDb();
    vi.setSystemTime(TODAY);
  });

  it('cancels a pending takeaway order', async () => {
    db.pushSelect([PENDING_ORDER]);

    const svc = makeService(db);
    await expect(svc.cancelByCustomer('mock-jwt-token')).resolves.toBeUndefined();
  });

  it('cancels a dine_in order and closes the table group', async () => {
    db.pushSelect([DINE_IN_ORDER]);

    const svc = makeService(db);
    await expect(svc.cancelByCustomer('mock-jwt-token')).resolves.toBeUndefined();
  });

  it('throws OrderNotFoundError when order not found', async () => {
    db.pushSelect([]);

    const svc = makeService(db);
    await expect(svc.cancelByCustomer('bad-token')).rejects.toThrow(OrderNotFoundError);
  });

  it('throws OrderImmutableError when order is already paid', async () => {
    db.pushSelect([PAID_ORDER]);

    const svc = makeService(db);
    await expect(svc.cancelByCustomer('mock-jwt-token')).rejects.toThrow(OrderImmutableError);
  });
});

// ─── getByToken ──────────────────────────────────────────────────────────────

describe('OrderService.getByToken', () => {
  let db: MockDb;

  beforeEach(() => {
    db = new MockDb();
  });

  it('returns PublicOrder for a valid token', async () => {
    db.pushSelect(
      [PENDING_ORDER],
      [{ menuItemId: 1, name: 'Sopa', category: 'starter', variant: 'only_starter', quantity: 1, unitPriceCents: 700, withTupper: false }],
      [], // table code lookup (takeaway)
    );

    const svc = makeService(db);
    const result = await svc.getByToken('mock-jwt-token');

    expect(result).not.toBeNull();
    expect(result!.shortCode).toBe('A3F7');
    expect(result!.status).toBe('pending');
    expect(result!.items).toHaveLength(1);
    expect(result!.tableCode).toBeNull();
  });

  it('returns null tableCode when dine_in table lookup is empty', async () => {
    db.pushSelect(
      [DINE_IN_ORDER],
      [{ menuItemId: 1, name: 'Sopa', category: 'starter', variant: 'only_starter', quantity: 1, unitPriceCents: 700, withTupper: false }],
      [], // table code lookup returns empty rows
    );

    const svc = makeService(db);
    const result = await svc.getByToken('mock-jwt-token');

    expect(result).not.toBeNull();
    expect(result!.tableCode).toBeNull();
    expect(result!.tableGroupId).toBe(10);
  });

  it('returns tableCode for a dine_in order', async () => {
    db.pushSelect(
      [DINE_IN_ORDER],
      [{ menuItemId: 1, name: 'Sopa', category: 'starter', variant: 'only_starter', quantity: 1, unitPriceCents: 700, withTupper: false }],
      [{ code: 'M07' }],
    );

    const svc = makeService(db);
    const result = await svc.getByToken('mock-jwt-token');

    expect(result!.tableCode).toBe('M07');
    expect(result!.tableGroupId).toBe(10);
  });

  it('returns null when order not found in DB', async () => {
    db.pushSelect([PENDING_ORDER]); // but verifyQrToken is mocked to ok=true

    // Force DB to return no order
    db._selects = [[]]; // override

    const svc = makeService(db);
    const result = await svc.getByToken('mock-jwt-token');

    expect(result).toBeNull();
  });

  it('returns null when token has invalid signature', async () => {
    const { verifyQrToken } = await import('@/lib/qr/token');
    vi.mocked(verifyQrToken).mockResolvedValueOnce({
      ok: false,
      reason: 'invalid_signature',
    });

    const svc = makeService(db);
    const result = await svc.getByToken('tampered-token');

    expect(result).toBeNull();
  });

  it('returns order even for an expired token', async () => {
    const { verifyQrToken } = await import('@/lib/qr/token');
    vi.mocked(verifyQrToken).mockResolvedValueOnce({
      ok: false,
      reason: 'expired',
    });

    db.pushSelect(
      [{ ...PENDING_ORDER, status: 'cancelled' }],
      [],
      [],
    );

    const svc = makeService(db);
    const result = await svc.getByToken('expired-token');

    expect(result).not.toBeNull();
    expect(result!.status).toBe('cancelled');
  });
});

// ─── expirePendingOrders ─────────────────────────────────────────────────────

describe('OrderService.expirePendingOrders', () => {
  let db: MockDb;

  beforeEach(() => {
    db = new MockDb();
  });

  it('returns {cancelled: 0} when no expired orders', async () => {
    db.pushSelect([]); // no expired orders found

    const svc = makeService(db);
    const result = await svc.expirePendingOrders(new Date());

    expect(result.cancelled).toBe(0);
  });

  it('cancels expired orders and returns count', async () => {
    const expiredRow = { id: 'exp-1', shortCode: 'EX01', tableGroupId: null };
    db.pushSelect([expiredRow]);

    const svc = makeService(db);
    const result = await svc.expirePendingOrders(new Date());

    expect(result.cancelled).toBe(1);
  });

  it('closes table groups for expired dine_in orders', async () => {
    const expiredDineIn = { id: 'exp-2', shortCode: 'EX02', tableGroupId: 7 };
    db.pushSelect([expiredDineIn]);

    const svc = makeService(db);
    const result = await svc.expirePendingOrders(new Date());

    expect(result.cancelled).toBe(1);
  });

  it('handles multiple expired orders in a single run', async () => {
    const expired = [
      { id: 'exp-1', shortCode: 'EX01', tableGroupId: null },
      { id: 'exp-2', shortCode: 'EX02', tableGroupId: 5 },
      { id: 'exp-3', shortCode: 'EX03', tableGroupId: null },
    ];
    db.pushSelect(expired);

    const svc = makeService(db);
    const result = await svc.expirePendingOrders(new Date());

    expect(result.cancelled).toBe(3);
  });

  it('uses current time as default when no date is passed', async () => {
    db.pushSelect([]);

    const svc = makeService(db);
    const result = await svc.expirePendingOrders(); // no date arg

    expect(result.cancelled).toBe(0);
  });

  it('uses provided cutoff date', async () => {
    db.pushSelect([]);

    const svc = makeService(db);
    const cutoff = new Date('2026-05-23T10:00:00Z');
    const result = await svc.expirePendingOrders(cutoff);

    expect(result.cancelled).toBe(0);
  });
});
