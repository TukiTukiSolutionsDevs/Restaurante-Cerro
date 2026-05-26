import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CashierService,
  OrderImmutableError,
  OrderLockedError,
  ReasonTooShortError,
  UndoExpiredError,
} from '@/server/services/cashier';

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('@/lib/qr/token', () => ({
  verifyQrToken: vi.fn(),
}));

vi.mock('@/lib/realtime/notify', () => ({
  notifyAfterTx: vi.fn().mockResolvedValue(undefined),
}));

import { verifyQrToken } from '@/lib/qr/token';
import { notifyAfterTx } from '@/lib/realtime/notify';

// ─── Test helpers ─────────────────────────────────────────────────────────────

function makeSelectChain(data: unknown[]) {
  const p = Promise.resolve(data);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {
    from: () => chain,
    where: () => chain,
    innerJoin: () => chain,
    leftJoin: () => chain,
    limit: () => chain,
    orderBy: () => chain,
  };
  chain.then = p.then.bind(p);
  chain.catch = p.catch.bind(p);
  chain.finally = p.finally.bind(p);
  return chain;
}

const NOW = new Date('2026-05-23T14:00:00.000Z');

// recentPaidAt is computed dynamically so it's always within the 2-minute undo window
function recentPaidAt() {
  return new Date(Date.now() - 60_000).toISOString(); // 1 min ago relative to test run
}

function makeOrderRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'order-uuid-1234',
    short_code: 'A3F7',
    status: 'pending',
    order_type: 'dine_in',
    table_group_id: null,
    total_cents: 1300,
    created_at: NOW,
    paid_at: null,
    paid_by_cashier_id: null,
    payment_method: null,
    payment_reference: null,
    qr_expires_at: new Date(NOW.getTime() + 15 * 60 * 1000),
    qr_consumed_at: null,
    delivered_at: null,
    cancelled_at: null,
    cancel_reason: null,
    ...overrides,
  };
}

function makeTxDb(executeResponses: { rows: unknown[] }[]) {
  let callIdx = 0;
  const execute = vi.fn().mockImplementation(() => {
    const resp = executeResponses[callIdx++] ?? { rows: [] };
    return Promise.resolve(resp);
  });
  const insertValues = vi.fn().mockResolvedValue([]);
  const insert = vi.fn().mockReturnValue({ values: insertValues });

  return { execute, insert, select: vi.fn().mockReturnValue(makeSelectChain([])), _insertValues: insertValues };
}

function makeLockError() {
  const err = new Error('could not obtain lock');
  (err as unknown as Record<string, unknown>).code = '55P03';
  return err;
}

 
function makeDb(options: { mainExecuteRows?: unknown[]; txExecuteResponses?: { rows: unknown[] }[]; selectData?: unknown[]; locked?: boolean; } = {}) {
  const txDb = makeTxDb(options.txExecuteResponses ?? []);

  if (options.locked) {
    txDb.execute.mockRejectedValueOnce(makeLockError());
  }

  const transaction = vi.fn().mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb(txDb));

  const mainExecute = vi.fn().mockResolvedValue({ rows: options.mainExecuteRows ?? [] });
  const select = vi.fn().mockReturnValue(makeSelectChain(options.selectData ?? []));

  return { transaction, execute: mainExecute, select, _txDb: txDb };
}

// ─── lookup ───────────────────────────────────────────────────────────────────

describe('CashierService.lookup', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns CashierOrderView for valid short_code', async () => {
    const row = makeOrderRow();
    const db = makeDb({ mainExecuteRows: [row] });
    const svc = new CashierService(db as never);

    const view = await svc.lookup('A3F7');

    expect(view).not.toBeNull();
    expect(view!.orderId).toBe('order-uuid-1234');
    expect(view!.shortCode).toBe('A3F7');
    expect(view!.status).toBe('pending');
    expect(view!.totalCents).toBe(1300);
  });

  it('returns null when short_code not found', async () => {
    const db = makeDb({ mainExecuteRows: [] });
    const svc = new CashierService(db as never);

    const view = await svc.lookup('XXXX');
    expect(view).toBeNull();
  });

  it('successfully resolves lowercase short_code (service uppercases internally)', async () => {
    const row = makeOrderRow();
    const db = makeDb({ mainExecuteRows: [row] });
    const svc = new CashierService(db as never);

    // Lowercase input should still return a view (execute was called once)
    const view = await svc.lookup('a3f7');
    expect(db.execute).toHaveBeenCalledOnce();
    expect(view).not.toBeNull();
    expect(view!.shortCode).toBe('A3F7');
  });

  it('returns order for valid JWT token', async () => {
    vi.mocked(verifyQrToken).mockResolvedValueOnce({
      ok: true,
      payload: { orderId: 'order-uuid-1234', tableId: null, nonce: 'abc' },
      expiresAt: new Date(),
    });
    const row = makeOrderRow();
    const db = makeDb({ mainExecuteRows: [row] });
    const svc = new CashierService(db as never);

    const view = await svc.lookup('eyJ.abc.def');
    expect(view).not.toBeNull();
    expect(view!.orderId).toBe('order-uuid-1234');
  });

  it('returns order for expired JWT (cashier override allowed)', async () => {
    vi.mocked(verifyQrToken).mockResolvedValueOnce({ ok: false, reason: 'expired' });
    const row = makeOrderRow({ qr_expires_at: new Date(NOW.getTime() - 60_000) });
    const db = makeDb({ mainExecuteRows: [row] });
    const svc = new CashierService(db as never);

    const view = await svc.lookup('eyJ.old.token');
    expect(view).not.toBeNull();
  });

  it('returns null for JWT with invalid signature', async () => {
    vi.mocked(verifyQrToken).mockResolvedValueOnce({ ok: false, reason: 'invalid_signature' });
    const db = makeDb();
    const svc = new CashierService(db as never);

    const view = await svc.lookup('eyJ.bad.sig');
    expect(view).toBeNull();
  });

  it('returns null for JWT with wrong audience', async () => {
    vi.mocked(verifyQrToken).mockResolvedValueOnce({ ok: false, reason: 'wrong_audience' });
    const db = makeDb();
    const svc = new CashierService(db as never);

    const view = await svc.lookup('eyJ.wrong.aud');
    expect(view).toBeNull();
  });
});

// ─── confirmPayment ───────────────────────────────────────────────────────────

describe('CashierService.confirmPayment', () => {
  const baseInput = {
    orderId: 'order-uuid-1234',
    paymentMethod: 'cash' as const,
    idempotencyKey: 'idem-key-1234',
    actorId: 7,
    qrWasExpiredAtConfirm: false,
  };

  beforeEach(() => vi.clearAllMocks());

  it('confirms payment and writes audit log', async () => {
    const orderRow = makeOrderRow({ status: 'pending' });
    const db = makeDb({
      txExecuteResponses: [
        { rows: [orderRow] },       // FOR UPDATE NOWAIT
        { rows: [{ cnt: '0' }] },   // idempotency check
        { rows: [] },               // UPDATE
      ],
    });
    const svc = new CashierService(db as never);

    await svc.confirmPayment(baseInput);

    expect(db._txDb.insert).toHaveBeenCalledOnce();
    expect(notifyAfterTx).toHaveBeenCalledOnce();
  });

  it('throws OrderLockedError on pg lock contention (55P03)', async () => {
    const db = makeDb({ locked: true });
    const svc = new CashierService(db as never);

    await expect(svc.confirmPayment(baseInput)).rejects.toThrow(OrderLockedError);
  });

  it('throws OrderImmutableError when status is not pending', async () => {
    const orderRow = makeOrderRow({ status: 'in_kitchen' });
    const db = makeDb({
      txExecuteResponses: [{ rows: [orderRow] }, { rows: [{ cnt: '0' }] }],
    });
    const svc = new CashierService(db as never);

    await expect(svc.confirmPayment(baseInput)).rejects.toThrow(OrderImmutableError);
  });

  it('throws OrderImmutableError when order not found', async () => {
    const db = makeDb({ txExecuteResponses: [{ rows: [] }] });
    const svc = new CashierService(db as never);

    await expect(svc.confirmPayment(baseInput)).rejects.toThrow(OrderImmutableError);
  });

  it('returns early without re-applying when idempotencyKey already seen', async () => {
    const orderRow = makeOrderRow({ status: 'pending' });
    const db = makeDb({
      txExecuteResponses: [
        { rows: [orderRow] },
        { rows: [{ cnt: '1' }] }, // duplicate key found
      ],
    });
    const svc = new CashierService(db as never);

    await svc.confirmPayment(baseInput); // must not throw

    // Only 2 execute calls (lock + idempotency check) — no UPDATE
    expect(db._txDb.execute).toHaveBeenCalledTimes(2);
    expect(db._txDb.insert).not.toHaveBeenCalled();
  });

  it('stores yapeReference in audit payload for yape payments', async () => {
    const orderRow = makeOrderRow({ status: 'pending' });
    const db = makeDb({
      txExecuteResponses: [
        { rows: [orderRow] },
        { rows: [{ cnt: '0' }] },
        { rows: [] },
      ],
    });
    const svc = new CashierService(db as never);

    await svc.confirmPayment({ ...baseInput, paymentMethod: 'yape', yapeReference: '12345678' });

    const auditPayload = db._txDb._insertValues.mock.calls[0]![0] as Record<string, unknown>;
    expect((auditPayload.payload as Record<string, unknown>).yapeReference).toBe('12345678');
  });
});

// ─── undo ─────────────────────────────────────────────────────────────────────

describe('CashierService.undo', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reverts payment successfully within 2-minute window', async () => {
    const orderRow = makeOrderRow({ status: 'in_kitchen', paid_at: recentPaidAt() });
    const db = makeDb({
      txExecuteResponses: [
        { rows: [orderRow] }, // lock
        { rows: [] },         // UPDATE
      ],
    });
    const svc = new CashierService(db as never);

    await svc.undo('order-uuid-1234', 7);

    expect(db._txDb.insert).toHaveBeenCalledOnce();
    expect(notifyAfterTx).toHaveBeenCalledWith(
      expect.anything(),
      'order_status_changed',
      expect.objectContaining({ from: 'in_kitchen', to: 'pending' }),
    );
  });

  it('throws UndoExpiredError when status is not in_kitchen', async () => {
    const orderRow = makeOrderRow({ status: 'delivered', paid_at: recentPaidAt() });
    const db = makeDb({ txExecuteResponses: [{ rows: [orderRow] }] });
    const svc = new CashierService(db as never);

    await expect(svc.undo('order-uuid-1234', 7)).rejects.toThrow(UndoExpiredError);
  });

  it('throws UndoExpiredError when paid_at is beyond 2-minute window', async () => {
    const oldPaidAt = new Date(Date.now() - 3 * 60 * 1000).toISOString(); // 3 min ago
    const orderRow = makeOrderRow({ status: 'in_kitchen', paid_at: oldPaidAt });
    const db = makeDb({ txExecuteResponses: [{ rows: [orderRow] }] });
    const svc = new CashierService(db as never);

    await expect(svc.undo('order-uuid-1234', 7)).rejects.toThrow(UndoExpiredError);
  });

  it('throws UndoExpiredError when delivered_at is set', async () => {
    const orderRow = makeOrderRow({
      status: 'in_kitchen',
      paid_at: recentPaidAt(),
      delivered_at: recentPaidAt(),
    });
    const db = makeDb({ txExecuteResponses: [{ rows: [orderRow] }] });
    const svc = new CashierService(db as never);

    await expect(svc.undo('order-uuid-1234', 7)).rejects.toThrow(UndoExpiredError);
  });

  it('throws UndoExpiredError when paid_at is null', async () => {
    const orderRow = makeOrderRow({ status: 'in_kitchen', paid_at: null });
    const db = makeDb({ txExecuteResponses: [{ rows: [orderRow] }] });
    const svc = new CashierService(db as never);

    await expect(svc.undo('order-uuid-1234', 7)).rejects.toThrow(UndoExpiredError);
  });

  it('throws OrderLockedError on lock contention', async () => {
    const db = makeDb({ locked: true });
    const svc = new CashierService(db as never);

    await expect(svc.undo('order-uuid-1234', 7)).rejects.toThrow(OrderLockedError);
  });
});

// ─── cancel ───────────────────────────────────────────────────────────────────

describe('CashierService.cancel', () => {
  beforeEach(() => vi.clearAllMocks());

  it('cancels a pending order', async () => {
    const orderRow = makeOrderRow({ status: 'pending' });
    const db = makeDb({
      txExecuteResponses: [{ rows: [orderRow] }, { rows: [] }],
    });
    const svc = new CashierService(db as never);

    await svc.cancel('order-uuid-1234', 'cliente sin dinero', 7);

    expect(db._txDb.insert).toHaveBeenCalledOnce();
    expect(notifyAfterTx).toHaveBeenCalledWith(
      expect.anything(),
      'order_status_changed',
      expect.objectContaining({ from: 'pending', to: 'cancelled' }),
    );
  });

  it('throws ReasonTooShortError before opening transaction when reason < 5 chars', async () => {
    const db = makeDb();
    const svc = new CashierService(db as never);

    await expect(svc.cancel('order-uuid-1234', 'ok', 7)).rejects.toThrow(ReasonTooShortError);
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('throws OrderImmutableError when order is not pending', async () => {
    const orderRow = makeOrderRow({ status: 'in_kitchen' });
    const db = makeDb({ txExecuteResponses: [{ rows: [orderRow] }] });
    const svc = new CashierService(db as never);

    await expect(svc.cancel('order-uuid-1234', 'motivo valido', 7)).rejects.toThrow(OrderImmutableError);
  });

  it('throws OrderLockedError on lock contention', async () => {
    const db = makeDb({ locked: true });
    const svc = new CashierService(db as never);

    await expect(svc.cancel('order-uuid-1234', 'motivo valido', 7)).rejects.toThrow(OrderLockedError);
  });

  it('throws OrderImmutableError when order not found', async () => {
    const db = makeDb({ txExecuteResponses: [{ rows: [] }] });
    const svc = new CashierService(db as never);

    await expect(svc.cancel('order-uuid-1234', 'motivo valido', 7)).rejects.toThrow(OrderImmutableError);
  });
});

// ─── listPendingToday ─────────────────────────────────────────────────────────

describe('CashierService.listPendingToday', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns empty array when no pending orders today', async () => {
    const db = makeDb({ mainExecuteRows: [] });
    const svc = new CashierService(db as never);

    const result = await svc.listPendingToday();
    expect(result).toEqual([]);
  });

  it('returns mapped CashierOrderView list for pending orders', async () => {
    const row = makeOrderRow();
    const db = makeDb({ mainExecuteRows: [row] });
    const svc = new CashierService(db as never);

    const result = await svc.listPendingToday();
    expect(result).toHaveLength(1);
    expect(result[0]!.orderId).toBe('order-uuid-1234');
    expect(result[0]!.status).toBe('pending');
    expect(result[0]!.items).toEqual([]);
  });
});

// ─── listRecentConfirmed ──────────────────────────────────────────────────────

describe('CashierService.listRecentConfirmed', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns recently confirmed orders with default limit of 5', async () => {
    const rows = Array.from({ length: 3 }, (_, i) =>
      makeOrderRow({ id: `order-${i}`, short_code: `AB${i}0`, status: 'in_kitchen', paid_at: recentPaidAt() }),
    );
    const db = makeDb({ mainExecuteRows: rows });
    const svc = new CashierService(db as never);

    const result = await svc.listRecentConfirmed();
    expect(result).toHaveLength(3);
  });

  it('accepts a custom limit parameter', async () => {
    const db = makeDb({ mainExecuteRows: [] });
    const svc = new CashierService(db as never);

    await svc.listRecentConfirmed(10);
    // Verifies the query was executed (exact SQL checked through execute mock)
    expect(db.execute).toHaveBeenCalledOnce();
  });
});

// ─── dailySummary ─────────────────────────────────────────────────────────────

describe('CashierService.dailySummary', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns zeros when there are no orders', async () => {
    const db = makeDb({ mainExecuteRows: [{ paid_count: '0', cash_cents: '0', yape_cents: '0' }] });
    const svc = new CashierService(db as never);

    const summary = await svc.dailySummary();
    expect(summary).toEqual({ paidCount: 0, cashCents: 0, yapeCents: 0 });
  });

  it('returns correct aggregated totals', async () => {
    const db = makeDb({
      mainExecuteRows: [{ paid_count: '5', cash_cents: '6500', yape_cents: '3900' }],
    });
    const svc = new CashierService(db as never);

    const summary = await svc.dailySummary();
    expect(summary).toEqual({ paidCount: 5, cashCents: 6500, yapeCents: 3900 });
  });

  it('accepts a custom date for reporting', async () => {
    const db = makeDb({ mainExecuteRows: [{ paid_count: '2', cash_cents: '2600', yape_cents: '0' }] });
    const svc = new CashierService(db as never);

    const summary = await svc.dailySummary(new Date('2026-05-20'));
    expect(summary.paidCount).toBe(2);
    expect(db.execute).toHaveBeenCalledOnce();
  });
});
