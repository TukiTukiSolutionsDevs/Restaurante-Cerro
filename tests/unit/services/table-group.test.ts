import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TableGroupService } from '@/server/services/table-group';

// ---------------------------------------------------------------------------
// Thenable mock chain
// ---------------------------------------------------------------------------

function makeQueryChain(data: unknown[]) {
  const p = Promise.resolve(data);
  const chain = {
    then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => p.then(res, rej),
    catch: (rej: (e: unknown) => unknown) => p.catch(rej),
    finally: (cb: () => void) => p.finally(cb),
    limit: vi.fn().mockResolvedValue(data),
    from: vi.fn(),
    where: vi.fn(),
    innerJoin: vi.fn(),
  };
  chain.from.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  chain.innerJoin.mockReturnValue(chain);
  return chain;
}

interface MockTx {
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  select: ReturnType<typeof vi.fn>;
  execute: ReturnType<typeof vi.fn>;
}

function defaultTables() {
  return [
    { id: 1, code: 'M01', isActive: true },
    { id: 2, code: 'M02', isActive: true },
  ];
}

function buildDb() {
  const mockNotify = vi.fn().mockResolvedValue({});
  const mockInsert = vi.fn();
  const mockUpdate = vi.fn();
  const mockSelect = vi.fn();

  mockSelect.mockReturnValue(makeQueryChain(defaultTables()));

  // Default insert: group id 7, then members
  mockInsert
    .mockReturnValueOnce({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: 7 }]),
      }),
    })
    .mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) });

  mockUpdate.mockReturnValue({
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(undefined),
  });

  const tx: MockTx = {
    insert: mockInsert,
    update: mockUpdate,
    select: mockSelect,
    execute: mockNotify,
  };

  const db = {
    insert: mockInsert,
    update: mockUpdate,
    select: mockSelect,
    execute: vi.fn().mockResolvedValue({ rows: [] }),
    transaction: vi.fn().mockImplementation((fn: (tx: MockTx) => unknown) => fn(tx)),
    _tx: tx,
  };

  return db;
}

describe('TableGroupService', () => {
  let db: ReturnType<typeof buildDb>;
  let service: TableGroupService;

  beforeEach(() => {
    db = buildDb();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new TableGroupService(db as any);
  });

  // -------------------------------------------------------------------------
  // join — 8 cases
  // -------------------------------------------------------------------------

  describe('join', () => {
    it('rechaza con menos de 2 mesas (JOIN_MIN_TABLES)', async () => {
      await expect(service.join([1], null, 1)).rejects.toMatchObject({
        code: 'JOIN_MIN_TABLES',
      });
    });

    it('rechaza mesas duplicadas (JOIN_DUPLICATE_TABLES)', async () => {
      await expect(service.join([1, 1], null, 1)).rejects.toMatchObject({
        code: 'JOIN_DUPLICATE_TABLES',
      });
    });

    it('rechaza si alguna mesa no existe en la DB (TABLE_NOT_FOUND)', async () => {
      // Only 1 row returned for 2 requested IDs
      db._tx.select.mockReturnValue(makeQueryChain([{ id: 1, code: 'M01', isActive: true }]));

      await expect(service.join([1, 99], null, 1)).rejects.toMatchObject({
        code: 'TABLE_NOT_FOUND',
      });
    });

    it('rechaza si alguna mesa está inactiva (TABLE_INACTIVE)', async () => {
      db._tx.select.mockReturnValue(
        makeQueryChain([
          { id: 1, code: 'M01', isActive: true },
          { id: 2, code: 'M02', isActive: false },
        ]),
      );

      await expect(service.join([1, 2], null, 1)).rejects.toMatchObject({
        code: 'TABLE_INACTIVE',
      });
    });

    it('rechaza si alguna mesa ya está en un grupo abierto (TABLE_IN_ACTIVE_GROUP)', async () => {
      db._tx.select.mockReturnValue(makeQueryChain(defaultTables()));
      // inGroup execute returns a row
      db._tx.execute.mockResolvedValue({ rows: [{ tableId: 1 }] });

      await expect(service.join([1, 2], null, 1)).rejects.toMatchObject({
        code: 'TABLE_IN_ACTIVE_GROUP',
      });
    });

    it('rechaza si alguna mesa tiene pedido activo (TABLE_HAS_ACTIVE_ORDER)', async () => {
      db._tx.select
        .mockReturnValueOnce(makeQueryChain(defaultTables()))         // tables ok
        .mockReturnValue(makeQueryChain([{ id: 'order-1' }]));        // has active order
      db._tx.execute.mockResolvedValue({ rows: [] });                  // no open group

      await expect(service.join([1, 2], null, 1)).rejects.toMatchObject({
        code: 'TABLE_HAS_ACTIVE_ORDER',
      });
    });

    it('genera el código G- con mesas ordenadas alfabéticamente', async () => {
      const tables = [
        { id: 4, code: 'M04', isActive: true },
        { id: 3, code: 'M03', isActive: true },
      ];
      db._tx.select
        .mockReturnValueOnce(makeQueryChain(tables))
        .mockReturnValue(makeQueryChain([]));
      db._tx.execute.mockResolvedValue({ rows: [] });
      db._tx.insert
        .mockReturnValueOnce({
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ id: 7 }]),
          }),
        })
        .mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) });

      const result = await service.join([4, 3], null, 1);

      expect(result.code).toBe('G-M03+M04');
    });

    it('crea grupo y miembros, devuelve groupId y emite NOTIFY joined', async () => {
      db._tx.select
        .mockReturnValueOnce(makeQueryChain(defaultTables()))
        .mockReturnValue(makeQueryChain([]));
      db._tx.execute.mockResolvedValue({ rows: [] });
      db._tx.insert
        .mockReturnValueOnce({
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ id: 7 }]),
          }),
        })
        .mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) });

      const result = await service.join([1, 2], null, 1);

      expect(result.groupId).toBe(7);
      expect(db.transaction).toHaveBeenCalledOnce();
      expect(db._tx.execute).toHaveBeenCalled(); // pg_notify
    });
  });

  // -------------------------------------------------------------------------
  // split — 2 cases
  // -------------------------------------------------------------------------

  describe('split', () => {
    it('cierra el grupo y emite NOTIFY split', async () => {
      db._tx.select
        .mockReturnValueOnce(makeQueryChain([{ id: 7, closedAt: null }]))  // group open
        .mockReturnValue(makeQueryChain([]));                               // no blocking orders

      await service.split(7, 1);

      expect(db._tx.update).toHaveBeenCalled();
      expect(db._tx.execute).toHaveBeenCalled();
    });

    it('lanza GROUP_HAS_ACTIVE_ORDER si hay pedido paid/in_kitchen', async () => {
      db._tx.select
        .mockReturnValueOnce(makeQueryChain([{ id: 7, closedAt: null }]))   // group open
        .mockReturnValue(makeQueryChain([{ id: 'order-1' }]));              // blocking order

      await expect(service.split(7, 1)).rejects.toMatchObject({
        code: 'GROUP_HAS_ACTIVE_ORDER',
      });
    });
  });
});
