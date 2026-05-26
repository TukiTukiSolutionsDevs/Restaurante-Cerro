import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DrizzleDb } from '@/db/client';
import { MenuService, MenuServiceError } from '@/server/services/menu';

vi.mock('@/lib/realtime/notify', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/realtime/notify')>();
  return { ...actual, notifyAfterTx: vi.fn().mockResolvedValue(undefined) };
});

// Dynamic import so mock is active before the module resolves
async function getNotifyMock() {
  const mod = await import('@/lib/realtime/notify');
  return vi.mocked(mod.notifyAfterTx);
}

// ── chainable mock builders ────────────────────────────────────────────────

type Thenable<T> = {
  then(
    res?: ((v: T) => unknown) | null,
    rej?: ((r: unknown) => unknown) | null,
  ): Promise<unknown>;
  catch(rej?: ((r: unknown) => unknown) | null): Promise<unknown>;
  finally(fn?: (() => void) | null): Promise<unknown>;
};

function sel<T>(rows: T[]): Record<string, unknown> & Thenable<T[]> {
  const c: Record<string, unknown> = {};
  c.from = vi.fn().mockReturnValue(c);
  c.where = vi.fn().mockReturnValue(c);
  c.orderBy = vi.fn().mockReturnValue(c);
  c.limit = vi.fn().mockReturnValue(c);
  c.then = (res?: ((v: T[]) => unknown) | null, rej?: ((r: unknown) => unknown) | null) =>
    Promise.resolve(rows).then(res ?? undefined, rej ?? undefined);
  c.catch = (rej?: ((r: unknown) => unknown) | null) =>
    Promise.resolve(rows).catch(rej as never);
  c.finally = (fn?: (() => void) | null) =>
    Promise.resolve(rows).finally(fn ?? undefined);
  return c as Record<string, unknown> & Thenable<T[]>;
}

function ins(returningRows?: unknown[]): Record<string, unknown> {
  const c: Record<string, unknown> = {};
  c.values = vi.fn().mockReturnValue(c);
  c.onConflictDoUpdate = vi.fn().mockReturnValue(c);
  c.returning = returningRows
    ? vi.fn().mockReturnValue(sel(returningRows))
    : vi.fn().mockReturnValue(sel([]));
  c.then = (res?: ((v: unknown) => unknown) | null, rej?: ((r: unknown) => unknown) | null) =>
    Promise.resolve(undefined).then(res ?? undefined, rej ?? undefined);
  c.catch = (rej?: ((r: unknown) => unknown) | null) =>
    Promise.resolve(undefined).catch(rej as never);
  c.finally = (fn?: (() => void) | null) =>
    Promise.resolve(undefined).finally(fn ?? undefined);
  return c;
}

function upd(): Record<string, unknown> {
  const c: Record<string, unknown> = {};
  c.set = vi.fn().mockReturnValue(c);
  c.where = vi.fn().mockReturnValue(c);
  c.then = (res?: ((v: unknown) => unknown) | null, rej?: ((r: unknown) => unknown) | null) =>
    Promise.resolve(undefined).then(res ?? undefined, rej ?? undefined);
  c.catch = (rej?: ((r: unknown) => unknown) | null) =>
    Promise.resolve(undefined).catch(rej as never);
  c.finally = (fn?: (() => void) | null) =>
    Promise.resolve(undefined).finally(fn ?? undefined);
  return c;
}

function makeMockDb(opts: {
  txSelects?: unknown[][];
  txInserts?: (unknown[] | undefined)[];
  dbSelects?: unknown[][];
  throw23505?: boolean;
}) {
  let txSelIdx = 0;
  let txInsIdx = 0;
  let dbSelIdx = 0;
  const { txSelects = [], txInserts = [], dbSelects = [], throw23505 = false } = opts;

  const mockTx = {
    select: vi.fn().mockImplementation(() => sel(txSelects[txSelIdx++] ?? [])),
    insert: vi.fn().mockImplementation(() => {
      const idx = txInsIdx++;
      if (idx === 0 && throw23505) {
        const err = Object.assign(new Error('unique violation'), { code: '23505' });
        const rejChain: Record<string, unknown> = {};
        rejChain.values = vi.fn().mockReturnValue(rejChain);
        rejChain.returning = vi.fn().mockReturnValue({
          then: (_: unknown, rej?: ((r: unknown) => unknown) | null) =>
            Promise.reject(err).then(undefined, rej ?? undefined),
          catch: (rej?: ((r: unknown) => unknown) | null) =>
            Promise.reject(err).catch(rej as never),
          finally: (fn?: (() => void) | null) =>
            Promise.reject(err).finally(fn ?? undefined),
        });
        rejChain.then = (_: unknown, rej?: ((r: unknown) => unknown) | null) =>
          Promise.reject(err).then(undefined, rej ?? undefined);
        rejChain.catch = (rej?: ((r: unknown) => unknown) | null) =>
          Promise.reject(err).catch(rej as never);
        rejChain.finally = (fn?: (() => void) | null) =>
          Promise.reject(err).finally(fn ?? undefined);
        return rejChain;
      }
      return ins(txInserts[idx]);
    }),
    update: vi.fn().mockReturnValue(upd()),
    execute: vi.fn().mockResolvedValue(undefined),
  };

  const mockDb = {
    transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => unknown) => fn(mockTx)),
    select: vi.fn().mockImplementation(() => sel(dbSelects[dbSelIdx++] ?? [])),
    execute: vi.fn().mockResolvedValue(undefined),
    _tx: mockTx,
  };

  return mockDb as unknown as DrizzleDb & { _tx: typeof mockTx };
}

// ── menu row fixtures ──────────────────────────────────────────────────────

const menuRow = {
  id: 1,
  serviceDate: '2026-05-23',
  status: 'draft' as const,
  openedAt: null,
  closedAt: null,
  notes: null,
  createdAt: new Date(),
};

const openedMenuRow = { ...menuRow, status: 'opened' as const, openedAt: new Date() };
const closedMenuRow = { ...openedMenuRow, status: 'closed' as const, closedAt: new Date() };

const itemRow = {
  id: 99,
  dailyMenuId: 1,
  category: 'main' as const,
  name: 'Arroz con leche',
  description: null,
  isAvailable: true,
  sortOrder: 10,
  priceCents: null,
  createdAt: new Date(),
};

const comboRow = {
  id: 5,
  dailyMenuId: 1,
  dineInPriceCents: 1300,
  takeawayPriceCents: 1500,
  tupperFullPriceCents: 200,
  tupperPartialPriceCents: 100,
  partialStarterPriceCents: 700,
  partialMainPriceCents: 900,
};

// ── tests ──────────────────────────────────────────────────────────────────

describe('MenuService', () => {
  let notifyMock: Awaited<ReturnType<typeof getNotifyMock>>;

  beforeEach(async () => {
    notifyMock = await getNotifyMock();
    vi.clearAllMocks();
  });

  // ── FR-1: createForDate ──────────────────────────────────────────────────

  it('FR-1: createForDate returns menuId and itemsCloned=0 on basic create', async () => {
    const db = makeMockDb({ txInserts: [[{ id: 42 }]] });
    const service = new MenuService(db);
    const result = await service.createForDate({
      serviceDate: new Date('2026-05-23'),
      actorId: 1,
    });
    expect(result).toEqual({ menuId: 42, itemsCloned: 0 });
    expect(db._tx.insert).toHaveBeenCalledTimes(2); // dailyMenu + auditLog
  });

  it('FR-1: createForDate throws MENU_DATE_CONFLICT on duplicate serviceDate', async () => {
    const db = makeMockDb({ throw23505: true });
    const service = new MenuService(db);
    await expect(
      service.createForDate({ serviceDate: new Date('2026-05-23'), actorId: 1 }),
    ).rejects.toMatchObject({ code: 'MENU_DATE_CONFLICT' });
  });

  // ── FR-2: clone ───────────────────────────────────────────────────────────

  it('FR-2: createForDate with cloneFromDate copies items and combo', async () => {
    const db = makeMockDb({
      txInserts: [[{ id: 100 }], undefined, undefined, undefined], // dailyMenu, menuItem, comboConfig, auditLog
      txSelects: [[menuRow], [itemRow], [comboRow]],               // source menu, source items, source combo
    });
    const service = new MenuService(db);
    const result = await service.createForDate({
      serviceDate: new Date('2026-05-23'),
      cloneFromDate: new Date('2026-05-22'),
      actorId: 1,
    });
    expect(result).toEqual({ menuId: 100, itemsCloned: 1 });
    expect(notifyMock).toHaveBeenCalledWith(
      expect.anything(),
      'menu_changed',
      expect.objectContaining({ menuId: 100, changeType: 'menu_opened' }),
    );
  });

  it('FR-2: createForDate throws CLONE_SOURCE_NOT_FOUND when source date has no menu', async () => {
    const db = makeMockDb({
      txInserts: [[{ id: 10 }]],
      txSelects: [[]], // source menu not found
    });
    const service = new MenuService(db);
    await expect(
      service.createForDate({
        serviceDate: new Date('2026-05-23'),
        cloneFromDate: new Date('2026-05-01'),
        actorId: 1,
      }),
    ).rejects.toMatchObject({ code: 'CLONE_SOURCE_NOT_FOUND' });
  });

  it('FR-2: createForDate with clone and empty source returns itemsCloned=0', async () => {
    const db = makeMockDb({
      txInserts: [[{ id: 10 }], undefined], // dailyMenu, auditLog
      txSelects: [[menuRow], [], []], // source menu, 0 items, no combo
    });
    const service = new MenuService(db);
    const result = await service.createForDate({
      serviceDate: new Date('2026-05-23'),
      cloneFromDate: new Date('2026-05-22'),
      actorId: 1,
    });
    expect(result.itemsCloned).toBe(0);
  });

  // ── FR-3: addItem ─────────────────────────────────────────────────────────

  it('FR-3: addItem inserts item and returns itemId', async () => {
    const db = makeMockDb({
      txSelects: [[{ maxSort: null }]],
      txInserts: [undefined, [{ id: 77 }], undefined], // select maxSort, insert item, insert auditLog
    });
    // Rebuild: first insert is actually item, second is auditLog
    const db2 = makeMockDb({
      txSelects: [[{ maxSort: null }]],
      txInserts: [[{ id: 77 }], undefined],
    });
    const service = new MenuService(db2);
    const result = await service.addItem({
      dailyMenuId: 1,
      category: 'main',
      name: 'Pollo a la brasa',
      actorId: 1,
    });
    expect(result).toEqual({ itemId: 77 });
    expect(notifyMock).toHaveBeenCalledWith(
      expect.anything(),
      'menu_changed',
      expect.objectContaining({ menuId: 1, changeType: 'item_added', entityId: 77 }),
    );
  });

  it('FR-3: addItem with explicit sortOrder skips MAX query', async () => {
    const db = makeMockDb({
      txInserts: [[{ id: 55 }], undefined],
    });
    const service = new MenuService(db);
    const result = await service.addItem({
      dailyMenuId: 1,
      category: 'drink',
      name: 'Chicha morada',
      sortOrder: 30,
      actorId: 1,
    });
    expect(result.itemId).toBe(55);
    expect(db._tx.select).not.toHaveBeenCalled(); // no MAX query
  });

  it('FR-3: addItem throws VALIDATION_ERROR when name is empty', async () => {
    const db = makeMockDb({});
    const service = new MenuService(db);
    await expect(
      service.addItem({ dailyMenuId: 1, category: 'main', name: '', actorId: 1 }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('FR-3: addItem throws VALIDATION_ERROR when name exceeds 80 chars', async () => {
    const db = makeMockDb({});
    const service = new MenuService(db);
    await expect(
      service.addItem({
        dailyMenuId: 1,
        category: 'main',
        name: 'a'.repeat(81),
        actorId: 1,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('FR-3: addItem throws VALIDATION_ERROR when description exceeds 200 chars', async () => {
    const db = makeMockDb({});
    const service = new MenuService(db);
    await expect(
      service.addItem({
        dailyMenuId: 1,
        category: 'main',
        name: 'Pollo',
        description: 'x'.repeat(201),
        actorId: 1,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  // ── FR-4: toggleAvailability ──────────────────────────────────────────────

  it('FR-4: toggleAvailability updates item and emits availability_toggled', async () => {
    const db = makeMockDb({
      txSelects: [[itemRow]],
      txInserts: [undefined],
    });
    const service = new MenuService(db);
    await service.toggleAvailability(99, false, 1);
    expect(db._tx.update).toHaveBeenCalledTimes(1);
    expect(notifyMock).toHaveBeenCalledWith(
      expect.anything(),
      'menu_changed',
      expect.objectContaining({ changeType: 'availability_toggled', entityId: 99 }),
    );
  });

  it('FR-4: toggleAvailability throws ITEM_NOT_FOUND when item missing', async () => {
    const db = makeMockDb({ txSelects: [[]] });
    const service = new MenuService(db);
    await expect(
      service.toggleAvailability(999, false, 1),
    ).rejects.toMatchObject({ code: 'ITEM_NOT_FOUND' });
  });

  // ── FR-5: setComboConfig ──────────────────────────────────────────────────

  it('FR-5: setComboConfig upserts and emits combo_updated', async () => {
    const db = makeMockDb({ txInserts: [undefined, undefined] });
    const service = new MenuService(db);
    await service.setComboConfig(
      1,
      {
        dineInPriceCents: 1300,
        takeawayPriceCents: 1500,
        tupperFullPriceCents: 200,
        tupperPartialPriceCents: 100,
        partialStarterPriceCents: 700,
        partialMainPriceCents: 900,
      },
      1,
    );
    expect(db._tx.insert).toHaveBeenCalledTimes(2); // comboConfig + auditLog
    expect(notifyMock).toHaveBeenCalledWith(
      expect.anything(),
      'menu_changed',
      expect.objectContaining({ changeType: 'combo_updated' }),
    );
  });

  it('FR-5: setComboConfig throws VALIDATION_ERROR when price is zero', async () => {
    const db = makeMockDb({});
    const service = new MenuService(db);
    await expect(
      service.setComboConfig(
        1,
        {
          dineInPriceCents: 0, // invalid
          takeawayPriceCents: 1500,
          tupperFullPriceCents: 200,
          tupperPartialPriceCents: 100,
          partialStarterPriceCents: 700,
          partialMainPriceCents: 900,
        },
        1,
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  // ── FR-6: getTodayPublicMenu ───────────────────────────────────────────────

  it('FR-6: getTodayPublicMenu returns null when no opened menu', async () => {
    const db = makeMockDb({ dbSelects: [[]] });
    const service = new MenuService(db);
    const result = await service.getTodayPublicMenu();
    expect(result).toBeNull();
  });

  it('FR-6: getTodayPublicMenu returns null when menu has no combo', async () => {
    const db = makeMockDb({ dbSelects: [[openedMenuRow], []] });
    const service = new MenuService(db);
    const result = await service.getTodayPublicMenu();
    expect(result).toBeNull();
  });

  it('FR-6: getTodayPublicMenu returns menu with available items only', async () => {
    const db = makeMockDb({
      dbSelects: [[openedMenuRow], [comboRow], [itemRow]],
    });
    const service = new MenuService(db);
    const result = await service.getTodayPublicMenu();
    expect(result).not.toBeNull();
    expect(result?.menuId).toBe(openedMenuRow.id);
    expect(result?.items).toHaveLength(1);
  });

  // ── FR-7: openDay / closeDay ──────────────────────────────────────────────

  it('FR-7: openDay opens shift 1 from draft and emits menu_opened', async () => {
    const db = makeMockDb({
      // selects in order: dailyMenu, comboConfig, max(shiftNumber)
      txSelects: [[menuRow], [{ id: comboRow.id }], [{ maxShift: null }]],
      // inserts in order: menuSession, auditLog
      txInserts: [undefined, undefined],
    });
    const service = new MenuService(db);
    const result = await service.openDay(1, 1);
    expect(result).toEqual({ shiftNumber: 1 });
    expect(db._tx.update).toHaveBeenCalledTimes(1);
    expect(notifyMock).toHaveBeenCalledWith(
      expect.anything(),
      'menu_changed',
      expect.objectContaining({ changeType: 'menu_opened', shiftNumber: 1 }),
    );
  });

  it('FR-7: openDay throws MISSING_COMBO_CONFIG when no combo', async () => {
    const db = makeMockDb({
      txSelects: [[menuRow], []],
    });
    const service = new MenuService(db);
    await expect(service.openDay(1, 1)).rejects.toMatchObject({
      code: 'MISSING_COMBO_CONFIG',
    });
  });

  it('FR-7: openDay throws ALREADY_OPENED on double-open', async () => {
    const db = makeMockDb({ txSelects: [[openedMenuRow]] });
    const service = new MenuService(db);
    await expect(service.openDay(1, 1)).rejects.toMatchObject({
      code: 'ALREADY_OPENED',
    });
  });

  it('FR-7: openDay reopens a closed menu as next shift', async () => {
    const db = makeMockDb({
      txSelects: [[closedMenuRow], [{ id: comboRow.id }], [{ maxShift: 1 }]],
      txInserts: [undefined, undefined],
    });
    const service = new MenuService(db);
    const result = await service.openDay(1, 1);
    expect(result).toEqual({ shiftNumber: 2 });
    expect(notifyMock).toHaveBeenCalledWith(
      expect.anything(),
      'menu_changed',
      expect.objectContaining({ changeType: 'menu_opened', shiftNumber: 2 }),
    );
  });

  it('FR-7: closeDay transitions opened → closed and emits menu_closed', async () => {
    const openSessionRow = {
      id: 10,
      dailyMenuId: 1,
      shiftNumber: 1,
      openedAt: new Date(),
      closedAt: null,
      openedByActorId: 1,
      closedByActorId: null,
      notes: null,
    };
    const db = makeMockDb({
      // selects: dailyMenu, menuSession (open)
      txSelects: [[openedMenuRow], [openSessionRow]],
      txInserts: [undefined],
    });
    const service = new MenuService(db);
    const result = await service.closeDay(1, 1);
    expect(result).toEqual({ shiftNumber: 1 });
    // updates: menuSession + dailyMenu
    expect(db._tx.update).toHaveBeenCalledTimes(2);
    expect(notifyMock).toHaveBeenCalledWith(
      expect.anything(),
      'menu_changed',
      expect.objectContaining({ changeType: 'menu_closed', shiftNumber: 1 }),
    );
  });

  it('FR-7: closeDay throws MENU_NOT_OPEN when menu is draft', async () => {
    const db = makeMockDb({ txSelects: [[menuRow]] });
    const service = new MenuService(db);
    await expect(service.closeDay(1, 1)).rejects.toMatchObject({
      code: 'MENU_NOT_OPEN',
    });
  });

  // ── edge: patchItem ───────────────────────────────────────────────────────

  it('patchItem throws ITEM_NOT_FOUND when item missing', async () => {
    const db = makeMockDb({ txSelects: [[]] });
    const service = new MenuService(db);
    await expect(service.patchItem(999, { name: 'Nuevo' }, 1)).rejects.toMatchObject({
      code: 'ITEM_NOT_FOUND',
    });
  });

  it('patchItem updates name and emits item_updated', async () => {
    const db = makeMockDb({
      txSelects: [[itemRow]],
      txInserts: [undefined],
    });
    const service = new MenuService(db);
    await service.patchItem(99, { name: 'Nuevo nombre' }, 1);
    expect(db._tx.update).toHaveBeenCalledTimes(1);
    expect(notifyMock).toHaveBeenCalledWith(
      expect.anything(),
      'menu_changed',
      expect.objectContaining({ changeType: 'item_updated', entityId: 99 }),
    );
  });
});
