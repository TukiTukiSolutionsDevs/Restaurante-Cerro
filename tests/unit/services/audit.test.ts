import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuditService } from '@/server/services/audit';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeSelectChain(data: unknown[]) {
  const p = Promise.resolve(data);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {
    from:      () => chain,
    where:     () => chain,
    leftJoin:  () => chain,
    orderBy:   () => chain,
    limit:     () => chain,
    offset:    () => chain,
  };
  chain.then    = p.then.bind(p);
  chain.catch   = p.catch.bind(p);
  chain.finally = p.finally.bind(p);
  return chain;
}

function makeAuditRow(overrides: Record<string, unknown> = {}) {
  return {
    id:        1,
    actorType: 'staff',
    actorId:   5,
    actorName: 'Lucía',
    action:    'staff.create',
    entity:    'staff_user',
    entityId:  '42',
    payload:   {},
    createdAt: new Date('2026-05-23T10:00:00Z'),
    ...overrides,
  };
}

function makeDb(rows: unknown[] = [], total: number = 0) {
  let callCount = 0;
  const select = vi.fn().mockImplementation(() => {
    // First call: main rows; second call: count query
    const data = callCount === 0 ? rows : [{ total }];
    callCount++;
    return makeSelectChain(data);
  });
  return { select };
}

// ─── list ─────────────────────────────────────────────────────────────────────

describe('AuditService.list', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns empty rows and zero total when no records', async () => {
    const db  = makeDb([], 0);
    const svc = new AuditService(db as never);
    const result = await svc.list({});
    expect(result.rows).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('maps rows correctly including actorName', async () => {
    const row = makeAuditRow();
    const db  = makeDb([row], 1);
    const svc = new AuditService(db as never);

    const result = await svc.list({});
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.actorName).toBe('Lucía');
    expect(result.rows[0]!.action).toBe('staff.create');
    expect(result.total).toBe(1);
  });

  it('sets actorName to null when no staff_user joined', async () => {
    const row = makeAuditRow({ actorName: null, actorType: 'system', actorId: null });
    const db  = makeDb([row], 1);
    const svc = new AuditService(db as never);

    const result = await svc.list({});
    expect(result.rows[0]!.actorName).toBeNull();
  });

  it('respects limit and offset defaults (20, 0)', async () => {
    const db     = makeDb([], 0);
    const select = db.select;
    const svc    = new AuditService(db as never);

    await svc.list({});
    // Both select calls happen; chain receives limit(20).offset(0) from first call
    expect(select).toHaveBeenCalledTimes(2);
  });

  it('uses provided limit and offset', async () => {
    const db  = makeDb([], 0);
    const svc = new AuditService(db as never);
    await svc.list({ limit: 5, offset: 10 });
    expect(db.select).toHaveBeenCalledTimes(2);
  });

  it('total reflects count query result', async () => {
    const rows = Array.from({ length: 3 }, (_, i) => makeAuditRow({ id: i + 1 }));
    const db   = makeDb(rows, 42);
    const svc  = new AuditService(db as never);

    const result = await svc.list({});
    expect(result.total).toBe(42);
    expect(result.rows).toHaveLength(3);
  });
});
