import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CannotDeactivateSelfError,
  StaffService,
  StaffServiceError,
} from '@/server/services/staff';

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('@/lib/auth/pin', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/auth/pin')>();
  return {
    ...original,
    hashPin: vi.fn().mockResolvedValue('$argon2id$hashed'),
  };
});

import { hashPin } from '@/lib/auth/pin';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeSelectChain(data: unknown[]) {
  const p = Promise.resolve(data);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {
    from: () => chain,
    where: () => chain,
    limit: () => chain,
    orderBy: () => chain,
    leftJoin: () => chain,
  };
  chain.then    = p.then.bind(p);
  chain.catch   = p.catch.bind(p);
  chain.finally = p.finally.bind(p);
  return chain;
}

function makeInsertChain(returnData: unknown[] = [{ id: 42 }]) {
  const returning = vi.fn().mockResolvedValue(returnData);
  const directP   = Promise.resolve([]);
  const values    = vi.fn().mockReturnValue(
    Object.assign({ returning }, {
      then:    directP.then.bind(directP),
      catch:   directP.catch.bind(directP),
      finally: directP.finally.bind(directP),
    }),
  );
  return { values, _returning: returning };
}

function makeUpdateChain() {
  const where  = vi.fn().mockResolvedValue([]);
  const setFn  = vi.fn().mockReturnValue({ where });
  return { set: setFn, _where: where };
}

function makeDeleteChain() {
  const where = vi.fn().mockResolvedValue([]);
  return { where, _where: where };
}

function makeTxDb(opts: {
  selectRows?: unknown[];
  insertReturning?: unknown[];
} = {}) {
  const insertChain  = makeInsertChain(opts.insertReturning ?? [{ id: 42 }]);
  const updateChain  = makeUpdateChain();
  const deleteChain  = makeDeleteChain();
  const select       = vi.fn().mockReturnValue(makeSelectChain(opts.selectRows ?? [{ id: 1 }]));
  const insert       = vi.fn().mockReturnValue(insertChain);
  const update       = vi.fn().mockReturnValue(updateChain);
  const del          = vi.fn().mockReturnValue(deleteChain);

  return { select, insert, update, delete: del, _insertChain: insertChain, _updateChain: updateChain, _deleteChain: deleteChain };
}

function makeDb(opts: {
  executeRows?: unknown[];
  selectRows?: unknown[];
  insertReturning?: unknown[];
} = {}) {
  const execute = vi.fn().mockResolvedValue({ rows: opts.executeRows ?? [] });
  const txDb    = makeTxDb({ selectRows: opts.selectRows, insertReturning: opts.insertReturning });
  const transaction = vi.fn().mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb(txDb));

  return { execute, transaction, _txDb: txDb };
}

// ─── list ─────────────────────────────────────────────────────────────────────

describe('StaffService.list', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns empty array when no users', async () => {
    const db  = makeDb({ executeRows: [] });
    const svc = new StaffService(db as never);
    expect(await svc.list()).toEqual([]);
  });

  it('maps activeSessionCount from string to number', async () => {
    const db = makeDb({
      executeRows: [
        { id: 1, displayName: 'Ana', role: 'cashier', isActive: true, lastSeenAt: null, activeSessionCount: '2' },
      ],
    });
    const svc = new StaffService(db as never);
    const result = await svc.list();
    expect(result[0]!.activeSessionCount).toBe(2);
  });

  it('returns lastSeenAt as-is (null or Date)', async () => {
    const ts = new Date('2026-05-23T10:00:00Z');
    const db = makeDb({
      executeRows: [
        { id: 1, displayName: 'Bob', role: 'waiter', isActive: true, lastSeenAt: ts, activeSessionCount: '0' },
      ],
    });
    const svc = new StaffService(db as never);
    const [user] = await svc.list();
    expect(user!.lastSeenAt).toEqual(ts);
  });
});

// ─── create ───────────────────────────────────────────────────────────────────

describe('StaffService.create', () => {
  beforeEach(() => vi.clearAllMocks());

  it('inserts user and writes audit log', async () => {
    const db  = makeDb({ insertReturning: [{ id: 99 }] });
    const svc = new StaffService(db as never);

    const result = await svc.create({ displayName: 'Lucía', role: 'cashier', pin: '248135' }, 1);

    expect(result).toEqual({ staffUserId: 99 });
    expect(hashPin).toHaveBeenCalledWith('248135');
    expect(db._txDb.insert).toHaveBeenCalledTimes(2); // staff_user + audit_log
  });

  it('throws INVALID_PIN for insecure PIN (all same)', async () => {
    const db  = makeDb();
    const svc = new StaffService(db as never);
    await expect(
      svc.create({ displayName: 'Ana', role: 'cashier', pin: '000000' }, 1),
    ).rejects.toThrow(StaffServiceError);
  });

  it('throws INVALID_PIN for sequential PIN', async () => {
    const db  = makeDb();
    const svc = new StaffService(db as never);
    await expect(
      svc.create({ displayName: 'Ana', role: 'cashier', pin: '123456' }, 1),
    ).rejects.toThrow(StaffServiceError);
  });

  it('throws VALIDATION_ERROR for empty displayName', async () => {
    const db  = makeDb();
    const svc = new StaffService(db as never);
    await expect(
      svc.create({ displayName: '', role: 'cashier', pin: '248135' }, 1),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('throws VALIDATION_ERROR for displayName > 80 chars', async () => {
    const db  = makeDb();
    const svc = new StaffService(db as never);
    await expect(
      svc.create({ displayName: 'A'.repeat(81), role: 'cashier', pin: '248135' }, 1),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('includes role in audit payload', async () => {
    const db  = makeDb({ insertReturning: [{ id: 5 }] });
    const svc = new StaffService(db as never);
    await svc.create({ displayName: 'Mario', role: 'admin', pin: '248135' }, 1);

    const auditCall = db._txDb._insertChain.values.mock.calls.find(
      (args: unknown[]) => (args[0] as Record<string, unknown>).action === 'staff.create',
    );
    expect((auditCall?.[0] as Record<string, unknown>)?.payload).toMatchObject({ role: 'admin' });
  });
});

// ─── patch ────────────────────────────────────────────────────────────────────

describe('StaffService.patch', () => {
  beforeEach(() => vi.clearAllMocks());

  it('updates displayName and writes audit log', async () => {
    const db  = makeDb({ selectRows: [{ id: 7 }] });
    const svc = new StaffService(db as never);
    await svc.patch(7, { displayName: 'Nuevo Nombre' }, 1);
    expect(db._txDb.update).toHaveBeenCalled();
    expect(db._txDb.insert).toHaveBeenCalled();
  });

  it('throws NOT_FOUND when user does not exist', async () => {
    const db  = makeDb({ selectRows: [] });
    const svc = new StaffService(db as never);
    await expect(svc.patch(99, { displayName: 'X' }, 1)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('throws VALIDATION_ERROR when new displayName is empty', async () => {
    const db  = makeDb();
    const svc = new StaffService(db as never);
    await expect(svc.patch(1, { displayName: '' }, 1)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(db.transaction).not.toHaveBeenCalled();
  });
});

// ─── resetPin ─────────────────────────────────────────────────────────────────

describe('StaffService.resetPin', () => {
  beforeEach(() => vi.clearAllMocks());

  it('updates pinHash and deletes sessions', async () => {
    const db  = makeDb({ selectRows: [{ id: 3 }] });
    const svc = new StaffService(db as never);
    await svc.resetPin(3, '248135', 1);
    expect(hashPin).toHaveBeenCalledWith('248135');
    expect(db._txDb.update).toHaveBeenCalled();
    expect(db._txDb.delete).toHaveBeenCalled();
    expect(db._txDb.insert).toHaveBeenCalled();
  });

  it('throws INVALID_PIN for insecure new PIN', async () => {
    const db  = makeDb();
    const svc = new StaffService(db as never);
    await expect(svc.resetPin(1, '111111', 1)).rejects.toMatchObject({ code: 'INVALID_PIN' });
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('throws NOT_FOUND when target user does not exist', async () => {
    const db  = makeDb({ selectRows: [] });
    const svc = new StaffService(db as never);
    await expect(svc.resetPin(99, '248135', 1)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

// ─── forceLogout ──────────────────────────────────────────────────────────────

describe('StaffService.forceLogout', () => {
  beforeEach(() => vi.clearAllMocks());

  it('deletes sessions and writes audit log', async () => {
    const db  = makeDb({ selectRows: [{ id: 4 }] });
    const svc = new StaffService(db as never);
    await svc.forceLogout(4, 1);
    expect(db._txDb.delete).toHaveBeenCalled();
    expect(db._txDb.insert).toHaveBeenCalled();
  });

  it('throws NOT_FOUND when user does not exist', async () => {
    const db  = makeDb({ selectRows: [] });
    const svc = new StaffService(db as never);
    await expect(svc.forceLogout(99, 1)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('succeeds even when user has no sessions (0 deleted)', async () => {
    const db = makeDb({ selectRows: [{ id: 5 }] });
    db._txDb._deleteChain._where.mockResolvedValue([]);
    const svc = new StaffService(db as never);
    await expect(svc.forceLogout(5, 1)).resolves.toBeUndefined();
  });
});

// ─── deactivate ───────────────────────────────────────────────────────────────

describe('StaffService.deactivate', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sets isActive=false and writes audit log', async () => {
    const db  = makeDb({ selectRows: [{ id: 6 }] });
    const svc = new StaffService(db as never);
    await svc.deactivate(6, 1);
    expect(db._txDb.update).toHaveBeenCalled();
    expect(db._txDb.insert).toHaveBeenCalled();
  });

  it('throws CannotDeactivateSelfError when actorId === staffUserId', async () => {
    const db  = makeDb();
    const svc = new StaffService(db as never);
    await expect(svc.deactivate(1, 1)).rejects.toThrow(CannotDeactivateSelfError);
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('throws NOT_FOUND when user does not exist', async () => {
    const db  = makeDb({ selectRows: [] });
    const svc = new StaffService(db as never);
    await expect(svc.deactivate(99, 1)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('CannotDeactivateSelfError has code SELF_DEACTIVATION_FORBIDDEN', () => {
    const err = new CannotDeactivateSelfError();
    expect(err.code).toBe('SELF_DEACTIVATION_FORBIDDEN');
    expect(err.message).toBe('No puedes desactivar tu propia cuenta');
  });
});
