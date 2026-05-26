import { sql } from 'drizzle-orm';

import type { DrizzleDb } from '@/db/client';

export interface DailyReport {
  date: string;
  byStatus: {
    pending: number;
    paid: number;
    in_kitchen: number;
    delivered: number;
    cancelled: number;
  };
  revenue: {
    totalCents: number;
    cashCents: number;
    yapeCents: number;
    dineInCents: number;
    takeawayCents: number;
  };
  topItems: Array<{ menuItemId: number; name: string; quantity: number; totalCents: number }>;
  avgKitchenServiceMs: number | null;
  cancellations: Array<{ orderId: string; reason: string; cancelledAt: Date }>;
  hasActivity: boolean;
}

export class ReportService {
  constructor(private db: DrizzleDb) {}

  async daily(date: Date): Promise<DailyReport> {
    const dateStr = date.toISOString().slice(0, 10);

    const [statusResult, revenueResult, topItemsResult, avgResult, cancellationsResult] =
      await Promise.all([
        this.db.execute<{ status: string; cnt: string }>(sql`
          SELECT status, COUNT(*) AS cnt
          FROM "order"
          WHERE
            (status != 'cancelled' AND paid_at::date = ${dateStr}::date)
            OR (status = 'cancelled' AND cancelled_at::date = ${dateStr}::date)
          GROUP BY status
        `),

        this.db.execute<{
          totalCents: string | null;
          cashCents: string | null;
          yapeCents: string | null;
          dineInCents: string | null;
          takeawayCents: string | null;
        }>(sql`
          SELECT
            SUM(total_cents) FILTER (WHERE status IN ('paid','in_kitchen','delivered'))                              AS "totalCents",
            SUM(total_cents) FILTER (WHERE payment_method = 'cash'    AND status IN ('paid','in_kitchen','delivered')) AS "cashCents",
            SUM(total_cents) FILTER (WHERE payment_method = 'yape'    AND status IN ('paid','in_kitchen','delivered')) AS "yapeCents",
            SUM(total_cents) FILTER (WHERE order_type    = 'dine_in'  AND status IN ('paid','in_kitchen','delivered')) AS "dineInCents",
            SUM(total_cents) FILTER (WHERE order_type    = 'takeaway' AND status IN ('paid','in_kitchen','delivered')) AS "takeawayCents"
          FROM "order"
          WHERE paid_at::date = ${dateStr}::date
        `),

        this.db.execute<{
          menuItemId: number;
          name: string;
          quantity: string;
          totalCents: string;
        }>(sql`
          SELECT
            oi.menu_item_id                        AS "menuItemId",
            mi.name,
            SUM(oi.quantity)                       AS quantity,
            SUM(oi.quantity * oi.unit_price_cents) AS "totalCents"
          FROM order_item oi
          JOIN "order"    o  ON o.id  = oi.order_id
          JOIN menu_item  mi ON mi.id = oi.menu_item_id
          WHERE o.paid_at::date = ${dateStr}::date
            AND o.status IN ('paid','in_kitchen','delivered')
          GROUP BY oi.menu_item_id, mi.name
          ORDER BY SUM(oi.quantity) DESC
          LIMIT 5
        `),

        this.db.execute<{ avgMs: string | null }>(sql`
          SELECT AVG(EXTRACT(EPOCH FROM (delivered_at - paid_at)) * 1000) AS "avgMs"
          FROM "order"
          WHERE status = 'delivered'
            AND delivered_at IS NOT NULL
            AND paid_at     IS NOT NULL
            AND delivered_at::date = ${dateStr}::date
        `),

        this.db.execute<{
          orderId: string;
          reason: string | null;
          cancelledAt: Date;
        }>(sql`
          SELECT
            id              AS "orderId",
            cancel_reason   AS reason,
            cancelled_at    AS "cancelledAt"
          FROM "order"
          WHERE status = 'cancelled'
            AND cancelled_at::date = ${dateStr}::date
          ORDER BY cancelled_at
        `),
      ]);

    const byStatus = { pending: 0, paid: 0, in_kitchen: 0, delivered: 0, cancelled: 0 };
    for (const row of statusResult.rows) {
      const key = row.status as keyof typeof byStatus;
      if (key in byStatus) byStatus[key] = Number(row.cnt);
    }

    const rev = revenueResult.rows[0];
    const revenue = {
      totalCents:    Number(rev?.totalCents    ?? 0),
      cashCents:     Number(rev?.cashCents     ?? 0),
      yapeCents:     Number(rev?.yapeCents     ?? 0),
      dineInCents:   Number(rev?.dineInCents   ?? 0),
      takeawayCents: Number(rev?.takeawayCents ?? 0),
    };

    const topItems = topItemsResult.rows.map((r) => ({
      menuItemId: Number(r.menuItemId),
      name:       r.name,
      quantity:   Number(r.quantity),
      totalCents: Number(r.totalCents),
    }));

    const avgMs = avgResult.rows[0]?.avgMs;
    const avgKitchenServiceMs = avgMs != null ? Math.round(Number(avgMs)) : null;

    const cancellations = cancellationsResult.rows.map((r) => ({
      orderId:     r.orderId,
      reason:      r.reason ?? '',
      cancelledAt: new Date(r.cancelledAt),
    }));

    const hasActivity = Object.values(byStatus).some((v) => v > 0);

    return {
      date: dateStr,
      byStatus,
      revenue,
      topItems,
      avgKitchenServiceMs,
      cancellations,
      hasActivity,
    };
  }
}
