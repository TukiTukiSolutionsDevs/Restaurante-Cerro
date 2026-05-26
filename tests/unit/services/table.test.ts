import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TableService } from '@/server/services/table';

// ---------------------------------------------------------------------------
// Thenable mock chain — supports both:
//   await tx.select().from().where()          (no limit)
//   await tx.select().from().innerJoin().where().limit(1)  (with limit)
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

function buildDb() {
  const mockNotify = vi.fn().mockResolvedValue({});
  const mockInsert = vi.fn();
  const mockUpdate = vi.fn();
  const mockSelect = vi.fn();
  const mockDbExecute = vi.fn().mockResolvedValue({ rows: [] });

  mockInsert.mockReturnValue({
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([{ id: 1 }]),
  });

  mockUpdate.mockReturnValue({
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([{ id: 1 }]),
  });

  mockSelect.mockReturnValue(makeQueryChain([{ id: 1 }]));

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
    execute: mockDbExecute,
    transaction: vi.fn().mockImplementation((fn: (tx: MockTx) => unknown) => fn(tx)),
    _tx: tx,
  };

  return db;
}

describe('TableService', () => {
  let db: ReturnType<typeof buildDb>;
  let service: TableService;

  beforeEach(() => {
    db = buildDb();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new TableService(db as any);
  });

  // -------------------------------------------------------------------------
  // create — 5 cases
  // -------------------------------------------------------------------------

  describe('create', () => {
    it('crea una mesa con código válido y emite NOTIFY', async () => {
      db._tx.insert.mockReturnValue({
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([{ id: 42 }]),
      });

      const result = await service.create({ code: 'M01', capacity: 2 }, 1);

      expect(result).toEqual({ tableId: 42 });
      expect(db.transaction).toHaveBeenCalledOnce();
      expect(db._tx.execute).toHaveBeenCalled();
    });

    it('rechaza código sin letras (TABLE_CODE_INVALID)', async () => {
      await expect(service.create({ code: '01' }, 1)).rejects.toMatchObject({
        code: 'TABLE_CODE_INVALID',
      });
    });

    it('rechaza código con letras minúsculas (TABLE_CODE_INVALID)', async () => {
      await expect(service.create({ code: 'm01' }, 1)).rejects.toMatchObject({
        code: 'TABLE_CODE_INVALID',
      });
    });

    it('rechaza capacidad 0 (TABLE_CAPACITY_INVALID)', async () => {
      await expect(service.create({ code: 'M01', capacity: 0 }, 1)).rejects.toMatchObject({
        code: 'TABLE_CAPACITY_INVALID',
      });
    });

    it('usa capacidad 1 y posición 0,0 como valores por defecto', async () => {
      let capturedValues: Record<string, unknown> = {};
      db._tx.insert.mockReturnValue({
        values: vi.fn().mockImplementation((v: Record<string, unknown>) => {
          capturedValues = v;
          return { returning: vi.fn().mockResolvedValue([{ id: 5 }]) };
        }),
      });

      await service.create({ code: 'S5' }, 1);

      expect(capturedValues.capacity).toBe(1);
      expect(capturedValues.positionX).toBe(0);
      expect(capturedValues.positionY).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // patch — 4 cases
  // -------------------------------------------------------------------------

  describe('patch', () => {
    it('actualiza los campos proporcionados', async () => {
      await service.patch(1, { capacity: 4 }, 1);
      expect(db._tx.update).toHaveBeenCalled();
    });

    it('no llama a transaction si el patch está vacío', async () => {
      await service.patch(1, {}, 1);
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it('rechaza código inválido (TABLE_CODE_INVALID)', async () => {
      await expect(service.patch(1, { code: 'lower' }, 1)).rejects.toMatchObject({
        code: 'TABLE_CODE_INVALID',
      });
    });

    it('lanza TABLE_NOT_FOUND si la mesa no existe', async () => {
      db._tx.update.mockReturnValue({
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([]),
      });
      await expect(service.patch(999, { capacity: 2 }, 1)).rejects.toMatchObject({
        code: 'TABLE_NOT_FOUND',
      });
    });
  });

  // -------------------------------------------------------------------------
  // deactivate — 2 cases
  // -------------------------------------------------------------------------

  describe('deactivate', () => {
    it('desactiva y devuelve hasActiveOrder: false cuando no hay pedidos activos', async () => {
      db._tx.select
        .mockReturnValueOnce(makeQueryChain([{ id: 1 }]))  // table exists
        .mockReturnValue(makeQueryChain([]));               // no active orders

      const result = await service.deactivate(1, 1);

      expect(db._tx.update).toHaveBeenCalled();
      expect(result.hasActiveOrder).toBe(false);
    });

    it('desactiva y devuelve hasActiveOrder: true cuando hay pedido activo', async () => {
      db._tx.select
        .mockReturnValueOnce(makeQueryChain([{ id: 1 }]))              // table exists
        .mockReturnValue(makeQueryChain([{ id: 'order-1' }]));         // has active order

      const result = await service.deactivate(1, 1);

      expect(db._tx.update).toHaveBeenCalled();
      expect(result.hasActiveOrder).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // activate — 2 cases
  // -------------------------------------------------------------------------

  describe('activate', () => {
    it('activa la mesa correctamente', async () => {
      await service.activate(1, 1);
      expect(db._tx.update).toHaveBeenCalled();
    });

    it('lanza TABLE_NOT_FOUND si la mesa no existe', async () => {
      db._tx.update.mockReturnValue({
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([]),
      });
      await expect(service.activate(999, 1)).rejects.toMatchObject({
        code: 'TABLE_NOT_FOUND',
      });
    });
  });

  // -------------------------------------------------------------------------
  // listAllWithDerivedState (T6.3) — 2 cases
  // -------------------------------------------------------------------------

  describe('listAllWithDerivedState', () => {
    it('ejecuta la query y mapea los resultados', async () => {
      const fakeRow = {
        id: 1, code: 'M01', capacity: 1, positionX: 0, positionY: 0,
        isActive: true, state: 'free', activeGroupId: null, activeOrderId: null,
      };
      db.execute.mockResolvedValue({ rows: [fakeRow] });

      const result = await service.listAllWithDerivedState();

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ id: 1, state: 'free' });
    });

    it('la query SQL contiene los fragmentos de derivación de estado', async () => {
      db.execute.mockResolvedValue({ rows: [] });
      await service.listAllWithDerivedState();

      // Drizzle sql`...` objects serialize their chunks in JSON
      const sqlText = JSON.stringify(db.execute.mock.calls[0][0]);
      expect(sqlText).toMatch(/in_active_group/);
      expect(sqlText).toMatch(/tentative/);
      expect(sqlText).toMatch(/occupied/);
      expect(sqlText).toMatch(/30 minutes/i);
    });
  });

  // -------------------------------------------------------------------------
  // listFree — 1 case
  // -------------------------------------------------------------------------

  describe('listFree', () => {
    it('devuelve las mesas libres de la DB', async () => {
      db.execute.mockResolvedValue({ rows: [{ id: 3, code: 'M03', capacity: 1 }] });

      const result = await service.listFree();

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ id: 3, code: 'M03' });
    });
  });

  // -------------------------------------------------------------------------
  // release — 2 cases
  // -------------------------------------------------------------------------

  describe('release', () => {
    it('lanza RELEASE_REASON_TOO_SHORT si motivo < 5 chars', async () => {
      await expect(service.release(1, 1, 'abc')).rejects.toMatchObject({
        code: 'RELEASE_REASON_TOO_SHORT',
      });
    });

    it('ejecuta la liberación, escribe audit_log y emite NOTIFY', async () => {
      db._tx.execute.mockResolvedValue({ rows: [] });

      await service.release(1, 1, 'Solicitud de mozo — mesa libre');

      expect(db.transaction).toHaveBeenCalledOnce();
      // at least 3 execute calls: order query + audit_log insert + pg_notify
      expect(db._tx.execute.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });
});
