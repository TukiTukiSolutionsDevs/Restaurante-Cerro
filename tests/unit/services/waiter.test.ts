import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  OrderAlreadyDeliveredError,
  WaiterOrderNotFoundError,
  WaiterService,
} from '@/server/services/waiter';

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('@/lib/realtime/notify', () => ({
  notifyAfterTx: vi.fn().mockResolvedValue(undefined),
}));

import { notifyAfterTx } from '@/lib/realtime/notify';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeSelectChain(data: unknown[]) {
  const p = Promise.resolve(data);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {
    from: () => chain,
    where: () => chain,
    innerJoin: () => chain,
    limit: () => chain,
    orderBy: () => chain,
  };
  chain.then = p.then.bind(p);
  chain.catch = p.catch.bind(p);
  chain.finally = p.finally.bind(p);
  return chain;
}

function makeDb({
  executeResponses = [] as { rows: unknown[] }[],
  selectResults = [] as unknown[][],
} = {}) {
  let execIdx = 0;
  let selectIdx = 0;

  const execute = vi.fn().mockImplementation(() => {
    const resp = executeResponses[execIdx++] ?? { rows: [] };
    return Promise.resolve(resp);
  });

  const select = vi.fn().mockImplementation(() => {
    const data = selectResults[selectIdx++] ?? [];
    return makeSelectChain(data);
  });

  const insertValues = vi.fn().mockResolvedValue([]);
  const insert = vi.fn().mockReturnValue({ values: insertValues });

  const tx = { execute, insert, select };
  const db = {
    execute,
    insert,
    select,
    transaction: vi.fn().mockImplementation((fn) => fn(tx)),
  };

  return { db, tx, execute, insert, insertValues, select };
}

function makeOrderRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'order-uuid-1234',
    short_code: 'A3F7',
    status: 'in_kitchen',
    order_type: 'dine_in',
    table_group_id: null,
    paid_at: '2026-05-23T14:00:00.000Z',
    total_cents: 1300,
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

describe('WaiterService.markDelivered', () => {
  it('transitions in_kitchen → delivered and notifies', async () => {
    const row = makeOrderRow();
    const { db, execute, insert, insertValues } = makeDb({
      executeResponses: [{ rows: [row] }, { rows: [] }],
    });

    const svc = new WaiterService(db as never);
    await svc.markDelivered('order-uuid-1234', 42);

    expect(execute).toHaveBeenCalledTimes(2);
    expect(insert).toHaveBeenCalledTimes(1);
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        actorType: 'staff',
        actorId: 42,
        action: 'waiter_deliver',
        entity: 'order',
        entityId: 'order-uuid-1234',
      }),
    );
    expect(notifyAfterTx).toHaveBeenCalledWith(
      expect.any(Object),
      'order_status_changed',
      {
        orderId: 'order-uuid-1234',
        from: 'in_kitchen',
        to: 'delivered',
        shortCode: 'A3F7',
        tableId: null,
      },
    );
  });

  it('throws OrderAlreadyDeliveredError when status is not in_kitchen', async () => {
    const row = makeOrderRow({ status: 'delivered' });
    const { db } = makeDb({ executeResponses: [{ rows: [row] }] });

    const svc = new WaiterService(db as never);
    await expect(svc.markDelivered('order-uuid-1234', 42)).rejects.toThrow(
      OrderAlreadyDeliveredError,
    );
  });

  it('throws OrderAlreadyDeliveredError when status is paid (not in_kitchen)', async () => {
    const row = makeOrderRow({ status: 'paid' });
    const { db } = makeDb({ executeResponses: [{ rows: [row] }] });

    const svc = new WaiterService(db as never);
    const err = await svc.markDelivered('order-uuid-1234', 42).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(OrderAlreadyDeliveredError);
    expect((err as OrderAlreadyDeliveredError).code).toBe('ALREADY_DELIVERED');
    expect((err as OrderAlreadyDeliveredError).httpStatus).toBe(409);
  });

  it('throws OrderAlreadyDeliveredError on pg 55P03 lock contention (race)', async () => {
    const { db, execute } = makeDb();
    execute.mockRejectedValueOnce(Object.assign(new Error('lock'), { code: '55P03' }));

    const svc = new WaiterService(db as never);
    const err = await svc.markDelivered('order-uuid-1234', 42).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(OrderAlreadyDeliveredError);
    expect((err as OrderAlreadyDeliveredError).message).toBe('Ya fue entregado por otro mozo');
  });

  it('throws WaiterOrderNotFoundError when order does not exist', async () => {
    const { db } = makeDb({ executeResponses: [{ rows: [] }] });

    const svc = new WaiterService(db as never);
    const err = await svc.markDelivered('order-uuid-1234', 42).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(WaiterOrderNotFoundError);
    expect((err as WaiterOrderNotFoundError).code).toBe('ORDER_NOT_FOUND');
    expect((err as WaiterOrderNotFoundError).httpStatus).toBe(404);
  });

  it('re-throws unknown errors from execute', async () => {
    const { db, execute } = makeDb();
    execute.mockRejectedValueOnce(new Error('db connection lost'));

    const svc = new WaiterService(db as never);
    await expect(svc.markDelivered('order-uuid-1234', 42)).rejects.toThrow('db connection lost');
  });

  it('does not call UPDATE or audit when order not found', async () => {
    const { db, execute } = makeDb({ executeResponses: [{ rows: [] }] });

    const svc = new WaiterService(db as never);
    await svc.markDelivered('order-uuid-1234', 42).catch(() => null);

    expect(execute).toHaveBeenCalledTimes(1);
    expect(notifyAfterTx).not.toHaveBeenCalled();
  });
});

describe('WaiterService.listActive', () => {
  it('returns empty array when no active orders', async () => {
    const { db } = makeDb({ executeResponses: [{ rows: [] }] });

    const svc = new WaiterService(db as never);
    const result = await svc.listActive();

    expect(result).toEqual([]);
  });

  it('returns orders sorted by paidAt (SQL ordering respected)', async () => {
    const paidAt1 = '2026-05-23T09:00:00.000Z';
    const paidAt2 = '2026-05-23T10:30:00.000Z';
    const rows = [
      makeOrderRow({ id: 'order-a', short_code: 'AAA1', paid_at: paidAt1, table_group_id: null }),
      makeOrderRow({ id: 'order-b', short_code: 'BBB2', paid_at: paidAt2, table_group_id: null }),
    ];
    const { db } = makeDb({
      executeResponses: [{ rows }],
      selectResults: [[], []], // empty items for both orders
    });

    const svc = new WaiterService(db as never);
    const result = await svc.listActive();

    expect(result).toHaveLength(2);
    expect(result[0].orderId).toBe('order-a');
    expect(result[1].orderId).toBe('order-b');
    expect(result[0].paidAt).toEqual(new Date(paidAt1));
  });

  it('sets tableCode null and tableGroupId null for takeaway orders', async () => {
    const rows = [makeOrderRow({ order_type: 'takeaway', table_group_id: null, status: 'in_kitchen' })];
    const { db } = makeDb({
      executeResponses: [{ rows }],
      selectResults: [[]], // one select call for items
    });

    const svc = new WaiterService(db as never);
    const result = await svc.listActive();

    expect(result[0].tableCode).toBeNull();
    expect(result[0].tableGroupId).toBeNull();
    expect(result[0].orderType).toBe('takeaway');
  });

  it('combines multiple table codes with + sorted alphabetically for a group', async () => {
    const rows = [makeOrderRow({ table_group_id: 5, status: 'in_kitchen' })];
    const tableCodeRows = [
      { tableGroupId: 5, code: 'M04' },
      { tableGroupId: 5, code: 'M03' },
    ];
    const { db } = makeDb({
      executeResponses: [{ rows }],
      selectResults: [[], tableCodeRows], // items empty, then table codes
    });

    const svc = new WaiterService(db as never);
    const result = await svc.listActive();

    expect(result[0].tableCode).toBe('M03+M04');
    expect(result[0].tableGroupId).toBe(5);
  });

  it('correctly maps item fields from joined rows', async () => {
    const rows = [makeOrderRow({ table_group_id: null })];
    const itemRows = [
      {
        orderId: 'order-uuid-1234',
        name: 'Sopa de letras',
        category: 'starter',
        variant: 'full_combo',
        quantity: 2,
        withTupper: true,
      },
    ];
    const { db } = makeDb({
      executeResponses: [{ rows }],
      selectResults: [itemRows],
    });

    const svc = new WaiterService(db as never);
    const result = await svc.listActive();

    expect(result[0].items).toHaveLength(1);
    expect(result[0].items[0]).toEqual({
      name: 'Sopa de letras',
      category: 'starter',
      variant: 'full_combo',
      quantity: 2,
      withTupper: true,
    });
  });

  it('handles both paid and in_kitchen statuses', async () => {
    const rows = [
      makeOrderRow({ id: 'order-p', short_code: 'PAI1', status: 'paid', table_group_id: null }),
      makeOrderRow({ id: 'order-k', short_code: 'KIT2', status: 'in_kitchen', table_group_id: null }),
    ];
    const { db } = makeDb({
      executeResponses: [{ rows }],
      selectResults: [[], []],
    });

    const svc = new WaiterService(db as never);
    const result = await svc.listActive();

    expect(result.find((r) => r.orderId === 'order-p')?.status).toBe('paid');
    expect(result.find((r) => r.orderId === 'order-k')?.status).toBe('in_kitchen');
  });

  it('maps totalCents correctly from string or number', async () => {
    const rows = [makeOrderRow({ total_cents: '1500', table_group_id: null })];
    const { db } = makeDb({
      executeResponses: [{ rows }],
      selectResults: [[]],
    });

    const svc = new WaiterService(db as never);
    const result = await svc.listActive();

    expect(result[0].totalCents).toBe(1500);
    expect(typeof result[0].totalCents).toBe('number');
  });

  it('does not call loadTableCodesBatch when all orders are takeaway', async () => {
    const rows = [makeOrderRow({ order_type: 'takeaway', table_group_id: null })];
    const { db, select } = makeDb({
      executeResponses: [{ rows }],
      selectResults: [[]], // only one select call (items)
    });

    const svc = new WaiterService(db as never);
    await svc.listActive();

    expect(select).toHaveBeenCalledTimes(1); // only items batch
  });

  it('single table group returns just the table code without +', async () => {
    const rows = [makeOrderRow({ table_group_id: 3, status: 'paid' })];
    const tableCodeRows = [{ tableGroupId: 3, code: 'M07' }];
    const { db } = makeDb({
      executeResponses: [{ rows }],
      selectResults: [[], tableCodeRows],
    });

    const svc = new WaiterService(db as never);
    const result = await svc.listActive();

    expect(result[0].tableCode).toBe('M07');
  });
});
