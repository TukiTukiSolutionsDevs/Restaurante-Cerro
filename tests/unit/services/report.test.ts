import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ReportService } from '@/server/services/report';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeDb(executeResponses: { rows: unknown[] }[]) {
  let callIdx = 0;
  const execute = vi.fn().mockImplementation(() => {
    const resp = executeResponses[callIdx++] ?? { rows: [] };
    return Promise.resolve(resp);
  });
  return { execute };
}

const TEST_DATE = new Date('2026-05-23T00:00:00.000Z');

// ─── daily ────────────────────────────────────────────────────────────────────

describe('ReportService.daily', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns correct status counts', async () => {
    const db = makeDb([
      { rows: [
          { status: 'paid',      cnt: '5' },
          { status: 'delivered', cnt: '3' },
          { status: 'cancelled', cnt: '1' },
      ] },
      { rows: [{ totalCents: '8000', cashCents: '5000', yapeCents: '3000', dineInCents: '6000', takeawayCents: '2000' }] },
      { rows: [] },
      { rows: [{ avgMs: null }] },
      { rows: [] },
    ]);
    const svc    = new ReportService(db as never);
    const report = await svc.daily(TEST_DATE);

    expect(report.byStatus.paid).toBe(5);
    expect(report.byStatus.delivered).toBe(3);
    expect(report.byStatus.cancelled).toBe(1);
    expect(report.byStatus.pending).toBe(0);
    expect(report.byStatus.in_kitchen).toBe(0);
  });

  it('returns correct revenue totals', async () => {
    const db = makeDb([
      { rows: [{ status: 'paid', cnt: '2' }] },
      { rows: [{ totalCents: '5000', cashCents: '3000', yapeCents: '2000', dineInCents: '4000', takeawayCents: '1000' }] },
      { rows: [] },
      { rows: [{ avgMs: null }] },
      { rows: [] },
    ]);
    const svc    = new ReportService(db as never);
    const report = await svc.daily(TEST_DATE);

    expect(report.revenue.totalCents).toBe(5000);
    expect(report.revenue.cashCents).toBe(3000);
    expect(report.revenue.yapeCents).toBe(2000);
    expect(report.revenue.dineInCents).toBe(4000);
    expect(report.revenue.takeawayCents).toBe(1000);
  });

  it('handles null revenue fields as zero', async () => {
    const db = makeDb([
      { rows: [] },
      { rows: [{ totalCents: null, cashCents: null, yapeCents: null, dineInCents: null, takeawayCents: null }] },
      { rows: [] },
      { rows: [{ avgMs: null }] },
      { rows: [] },
    ]);
    const svc    = new ReportService(db as never);
    const report = await svc.daily(TEST_DATE);

    expect(report.revenue.totalCents).toBe(0);
    expect(report.revenue.cashCents).toBe(0);
  });

  it('returns top 5 items sorted by quantity', async () => {
    const items = [
      { menuItemId: 1, name: 'Arroz', quantity: '10', totalCents: '5000' },
      { menuItemId: 2, name: 'Sopa',  quantity: '7',  totalCents: '3500' },
    ];
    const db = makeDb([
      { rows: [{ status: 'paid', cnt: '2' }] },
      { rows: [{ totalCents: '8500', cashCents: '8500', yapeCents: '0', dineInCents: '8500', takeawayCents: '0' }] },
      { rows: items },
      { rows: [{ avgMs: null }] },
      { rows: [] },
    ]);
    const svc    = new ReportService(db as never);
    const report = await svc.daily(TEST_DATE);

    expect(report.topItems).toHaveLength(2);
    expect(report.topItems[0]!.name).toBe('Arroz');
    expect(report.topItems[0]!.quantity).toBe(10);
    expect(report.topItems[0]!.totalCents).toBe(5000);
  });

  it('returns avgKitchenServiceMs rounded to integer', async () => {
    const db = makeDb([
      { rows: [{ status: 'delivered', cnt: '1' }] },
      { rows: [{ totalCents: '1000', cashCents: '1000', yapeCents: '0', dineInCents: '1000', takeawayCents: '0' }] },
      { rows: [] },
      { rows: [{ avgMs: '185000.7' }] },
      { rows: [] },
    ]);
    const svc    = new ReportService(db as never);
    const report = await svc.daily(TEST_DATE);

    expect(report.avgKitchenServiceMs).toBe(185001);
  });

  it('returns null avgKitchenServiceMs when no delivered orders', async () => {
    const db = makeDb([
      { rows: [] },
      { rows: [{ totalCents: null, cashCents: null, yapeCents: null, dineInCents: null, takeawayCents: null }] },
      { rows: [] },
      { rows: [{ avgMs: null }] },
      { rows: [] },
    ]);
    const svc    = new ReportService(db as never);
    const report = await svc.daily(TEST_DATE);

    expect(report.avgKitchenServiceMs).toBeNull();
  });

  it('returns cancellations with orderId and reason', async () => {
    const cancelledAt = new Date('2026-05-23T12:00:00Z');
    const db = makeDb([
      { rows: [{ status: 'cancelled', cnt: '1' }] },
      { rows: [{ totalCents: null, cashCents: null, yapeCents: null, dineInCents: null, takeawayCents: null }] },
      { rows: [] },
      { rows: [{ avgMs: null }] },
      { rows: [{ orderId: 'order-123', reason: 'cliente sin dinero', cancelledAt }] },
    ]);
    const svc    = new ReportService(db as never);
    const report = await svc.daily(TEST_DATE);

    expect(report.cancellations).toHaveLength(1);
    expect(report.cancellations[0]!.reason).toBe('cliente sin dinero');
    expect(report.cancellations[0]!.orderId).toBe('order-123');
  });

  it('hasActivity is false when all statuses are zero', async () => {
    const db = makeDb([
      { rows: [] },
      { rows: [{ totalCents: null, cashCents: null, yapeCents: null, dineInCents: null, takeawayCents: null }] },
      { rows: [] },
      { rows: [{ avgMs: null }] },
      { rows: [] },
    ]);
    const svc    = new ReportService(db as never);
    const report = await svc.daily(TEST_DATE);

    expect(report.hasActivity).toBe(false);
  });

  it('hasActivity is true when at least one status has orders', async () => {
    const db = makeDb([
      { rows: [{ status: 'pending', cnt: '1' }] },
      { rows: [{ totalCents: null, cashCents: null, yapeCents: null, dineInCents: null, takeawayCents: null }] },
      { rows: [] },
      { rows: [{ avgMs: null }] },
      { rows: [] },
    ]);
    const svc    = new ReportService(db as never);
    const report = await svc.daily(TEST_DATE);

    expect(report.hasActivity).toBe(true);
  });
});
