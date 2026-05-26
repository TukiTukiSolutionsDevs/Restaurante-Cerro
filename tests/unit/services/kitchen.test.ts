import { describe, expect, it, vi } from 'vitest';

import { KitchenService } from '@/server/services/kitchen';

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

// ─── Fixture helpers ──────────────────────────────────────────────────────────

function makeOrder(overrides = {}) {
  return {
    id: 'order-uuid-1',
    shortCode: 'A1B2',
    orderType: 'dine_in',
    tableGroupId: 10,
    paidAt: new Date('2026-05-23T18:00:00Z'),
    ...overrides,
  };
}

function makeItem(overrides = {}) {
  return {
    orderId: 'order-uuid-1',
    name: 'Caldo de gallina',
    category: 'main',
    variant: 'full_combo',
    withTupper: false,
    quantity: 1,
    ...overrides,
  };
}

function makeTableRow(overrides = {}) {
  return { tableGroupId: 10, code: 'M14', ...overrides };
}

// makeDb: accepts a sequence of result arrays that .select() returns in order
function makeDb(selectSequence: unknown[][]) {
  let callIdx = 0;
  const mockSelect = vi.fn(() => chain(selectSequence[callIdx++] ?? []));
  return {
    db: { select: mockSelect } as unknown,
    mockSelect,
  };
}

// ─── listInKitchen ────────────────────────────────────────────────────────────

describe('KitchenService.listInKitchen', () => {
  it('returns empty array when no in_kitchen orders', async () => {
    const { db } = makeDb([[]]);
    const svc = new KitchenService(db as never);
    expect(await svc.listInKitchen()).toEqual([]);
  });

  it('returns one ticket for an in_kitchen dine_in order', async () => {
    const order = makeOrder();
    const item = makeItem();
    const tableRow = makeTableRow();
    const { db } = makeDb([[order], [item], [tableRow]]);
    const svc = new KitchenService(db as never);
    const tickets = await svc.listInKitchen();
    expect(tickets).toHaveLength(1);
    expect(tickets[0]).toMatchObject({
      orderId: 'order-uuid-1',
      shortCode: 'A1B2',
      orderType: 'dine_in',
      tableCode: 'M14',
      withTupper: false,
      paidAt: '2026-05-23T18:00:00.000Z',
      items: [{ name: 'Caldo de gallina', category: 'main', variant: 'full_combo', quantity: 1 }],
    });
  });

  it('sets tableCode to null for takeaway order', async () => {
    const order = makeOrder({ orderType: 'takeaway', tableGroupId: null });
    const item = makeItem({ orderId: 'order-uuid-1' });
    // No table query expected since tableGroupId is null
    const { db } = makeDb([[order], [item]]);
    const svc = new KitchenService(db as never);
    const tickets = await svc.listInKitchen();
    expect(tickets[0]!.tableCode).toBeNull();
    expect(tickets[0]!.orderType).toBe('takeaway');
  });

  it('sets withTupper=true when any item has with_tupper=true', async () => {
    const order = makeOrder();
    const items = [
      makeItem({ withTupper: false }),
      makeItem({ name: 'Ensalada', category: 'starter', withTupper: true }),
    ];
    const { db } = makeDb([[order], items, [makeTableRow()]]);
    const svc = new KitchenService(db as never);
    const tickets = await svc.listInKitchen();
    expect(tickets[0]!.withTupper).toBe(true);
  });

  it('sets withTupper=false when no items have with_tupper=true', async () => {
    const order = makeOrder();
    const items = [makeItem({ withTupper: false }), makeItem({ withTupper: false })];
    const { db } = makeDb([[order], items, [makeTableRow()]]);
    const svc = new KitchenService(db as never);
    const tickets = await svc.listInKitchen();
    expect(tickets[0]!.withTupper).toBe(false);
  });

  it('maps paidAt=null to current ISO timestamp without throwing', async () => {
    const order = makeOrder({ paidAt: null });
    const item = makeItem();
    const { db } = makeDb([[order], [item], [makeTableRow()]]);
    const svc = new KitchenService(db as never);
    const tickets = await svc.listInKitchen();
    expect(typeof tickets[0]!.paidAt).toBe('string');
  });

  it('returns multiple tickets and respects item grouping per order', async () => {
    const o1 = makeOrder({ id: 'ord-1', shortCode: 'AA11' });
    const o2 = makeOrder({ id: 'ord-2', shortCode: 'BB22', tableGroupId: 20 });
    const items = [
      makeItem({ orderId: 'ord-1', name: 'Arroz con leche', category: 'dessert' }),
      makeItem({ orderId: 'ord-2', name: 'Jugo de naranja', category: 'drink' }),
    ];
    const tableRows = [
      { tableGroupId: 10, code: 'M14' },
      { tableGroupId: 20, code: 'M05' },
    ];
    const { db } = makeDb([[o1, o2], items, tableRows]);
    const svc = new KitchenService(db as never);
    const tickets = await svc.listInKitchen();
    expect(tickets).toHaveLength(2);
    expect(tickets[0]!.items[0]!.name).toBe('Arroz con leche');
    expect(tickets[1]!.items[0]!.name).toBe('Jugo de naranja');
    expect(tickets[1]!.tableCode).toBe('M05');
  });

  it('skips table query when all orders are takeaway', async () => {
    const order = makeOrder({ orderType: 'takeaway', tableGroupId: null });
    const item = makeItem({ orderId: 'order-uuid-1' });
    const { db, mockSelect } = makeDb([[order], [item]]);
    const svc = new KitchenService(db as never);
    await svc.listInKitchen();
    // select called twice: orders + items (no table query)
    expect(mockSelect).toHaveBeenCalledTimes(2);
  });

  it('returns variant label and quantity correctly', async () => {
    const order = makeOrder();
    const item = makeItem({ variant: 'only_starter', quantity: 3 });
    const { db } = makeDb([[order], [item], [makeTableRow()]]);
    const svc = new KitchenService(db as never);
    const tickets = await svc.listInKitchen();
    expect(tickets[0]!.items[0]).toMatchObject({ variant: 'only_starter', quantity: 3 });
  });
});

// ─── getTicket ────────────────────────────────────────────────────────────────

describe('KitchenService.getTicket', () => {
  it('returns null when order does not exist', async () => {
    const { db } = makeDb([[]]);
    const svc = new KitchenService(db as never);
    expect(await svc.getTicket('non-existent-id')).toBeNull();
  });

  it('returns a ticket for an existing in_kitchen order', async () => {
    const order = makeOrder();
    const item = makeItem();
    const { db } = makeDb([[order], [item], [makeTableRow()]]);
    const svc = new KitchenService(db as never);
    const ticket = await svc.getTicket('order-uuid-1');
    expect(ticket).not.toBeNull();
    expect(ticket!.shortCode).toBe('A1B2');
    expect(ticket!.tableCode).toBe('M14');
  });

  it('returns tableCode=null for takeaway order', async () => {
    const order = makeOrder({ orderType: 'takeaway', tableGroupId: null });
    const item = makeItem();
    const { db } = makeDb([[order], [item]]);
    const svc = new KitchenService(db as never);
    const ticket = await svc.getTicket('order-uuid-1');
    expect(ticket!.tableCode).toBeNull();
  });
});
