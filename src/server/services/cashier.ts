import { eq, inArray, sql } from 'drizzle-orm';

import type { DrizzleDb } from '@/db/client';
import { auditLog } from '@/db/schema/audit';
import { menuItem } from '@/db/schema/menu';
import { order, orderItem } from '@/db/schema/orders';
import { staffUser } from '@/db/schema/staff';
import { restaurantTable, tableGroupMember } from '@/db/schema/tables';
import type { ItemCategory, ItemVariant } from '@/lib/money/types';
import { verifyQrToken } from '@/lib/qr/token';
import { notifyAfterTx, type SqlExecutor } from '@/lib/realtime/notify';

// ─── Public types ─────────────────────────────────────────────────────────────

export type OrderStatus = 'pending' | 'paid' | 'in_kitchen' | 'delivered' | 'cancelled';

export interface CashierOrderView {
  orderId: string;
  shortCode: string;
  status: OrderStatus;
  orderType: 'dine_in' | 'takeaway';
  tableCode: string | null;
  totalCents: number;
  createdAt: Date;
  paidAt: Date | null;
  paidByCashierName: string | null;
  paymentMethod: 'cash' | 'yape' | null;
  qrExpiresAt: Date;
  items: Array<{
    name: string;
    category: ItemCategory;
    variant: ItemVariant;
    quantity: number;
    withTupper: boolean;
    unitPriceCents: number;
  }>;
}

export interface ConfirmInput {
  orderId: string;
  paymentMethod: 'cash' | 'yape';
  yapeReference?: string;
  idempotencyKey: string;
  actorId: number;
  qrWasExpiredAtConfirm: boolean;
}

// ─── Error types ─────────────────────────────────────────────────────────────

export class OrderLockedError extends Error {
  readonly code = 'ORDER_LOCKED' as const;
  constructor() {
    super('Este pedido ya está siendo procesado.');
    this.name = 'OrderLockedError';
  }
}

export class OrderImmutableError extends Error {
  readonly code = 'INVALID_TRANSITION' as const;
  constructor() {
    super('El pedido ya no puede modificarse en este estado.');
    this.name = 'OrderImmutableError';
  }
}

export class UndoExpiredError extends Error {
  readonly code = 'UNDO_WINDOW_EXPIRED' as const;
  constructor() {
    super('El tiempo para deshacer ha expirado.');
    this.name = 'UndoExpiredError';
  }
}

export class ReasonTooShortError extends Error {
  readonly code = 'REASON_TOO_SHORT' as const;
  constructor() {
    super('El motivo debe tener al menos 5 caracteres.');
    this.name = 'ReasonTooShortError';
  }
}

// ─── Internal types ───────────────────────────────────────────────────────────

type OrderRow = {
  id: string;
  short_code: string;
  status: string;
  order_type: string;
  table_group_id: string | number | null;
  total_cents: number | string;
  created_at: Date | string;
  paid_at: Date | string | null;
  paid_by_cashier_id: string | number | null;
  payment_method: string | null;
  payment_reference: string | null;
  qr_expires_at: Date | string;
  qr_consumed_at: Date | string | null;
  delivered_at: Date | string | null;
  cancelled_at: Date | string | null;
  cancel_reason: string | null;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mkExecutor(txDb: DrizzleDb): SqlExecutor {
  return {
    execute: (_raw, params) =>
      txDb.execute(
        sql`SELECT pg_notify(${params[0] as string}, ${params[1] as string})`,
      ),
  };
}

function toDate(v: Date | string | null | undefined): Date | null {
  if (v == null) return null;
  return v instanceof Date ? v : new Date(v as string);
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class CashierService {
  constructor(private db: DrizzleDb) {}

  private get qrSecret(): Uint8Array {
    return new TextEncoder().encode(process.env.QR_SECRET ?? '');
  }

  async lookup(code: string): Promise<CashierOrderView | null> {
    let row: OrderRow | undefined;

    if (code.includes('.')) {
      // JWT path — allow expired tokens
      const result = await verifyQrToken(code, this.qrSecret);
      if (!result.ok && result.reason !== 'expired') return null;

      const res = await this.db.execute<OrderRow>(sql`
        SELECT id, short_code, status, order_type, table_group_id,
               total_cents, created_at, paid_at, paid_by_cashier_id,
               payment_method, payment_reference, qr_expires_at, qr_consumed_at,
               delivered_at, cancelled_at, cancel_reason
        FROM   "order"
        WHERE  qr_token = ${code}
        LIMIT  1
      `);
      row = res.rows[0];
    } else if (/^M\d+$/i.test(code.trim())) {
      // Mesa-code path — last 24 h, active statuses, most recent for that table
      const mesaCode = code.trim().toUpperCase();
      const res = await this.db.execute<OrderRow>(sql`
        SELECT o.id, o.short_code, o.status, o.order_type, o.table_group_id,
               o.total_cents, o.created_at, o.paid_at, o.paid_by_cashier_id,
               o.payment_method, o.payment_reference, o.qr_expires_at, o.qr_consumed_at,
               o.delivered_at, o.cancelled_at, o.cancel_reason
        FROM   "order" o
        JOIN   "table_group_member" tgm ON tgm.table_group_id = o.table_group_id
        JOIN   "restaurant_table" rt ON rt.id = tgm.table_id
        WHERE  rt.code = ${mesaCode}
          AND  o.created_at > now() - interval '24 hours'
          AND  o.status IN ('pending', 'paid', 'in_kitchen')
        ORDER  BY o.created_at DESC
        LIMIT  1
      `);
      row = res.rows[0];
    } else {
      // Short-code path — last 24 h, active statuses only, most recent first
      const res = await this.db.execute<OrderRow>(sql`
        SELECT id, short_code, status, order_type, table_group_id,
               total_cents, created_at, paid_at, paid_by_cashier_id,
               payment_method, payment_reference, qr_expires_at, qr_consumed_at,
               delivered_at, cancelled_at, cancel_reason
        FROM   "order"
        WHERE  short_code = ${code.toUpperCase()}
          AND  created_at > now() - interval '24 hours'
          AND  status IN ('pending', 'paid', 'in_kitchen')
        ORDER  BY created_at DESC
        LIMIT  1
      `);
      row = res.rows[0];
    }

    if (!row) return null;
    return this.buildView(row);
  }

  async confirmPayment(input: ConfirmInput): Promise<void> {
    await this.db.transaction(async (tx) => {
      const txDb = tx as unknown as DrizzleDb;

      // 1. Lock — NOWAIT throws pg error 55P03 on contention
      let row: OrderRow;
      try {
        const res = await txDb.execute<OrderRow>(sql`
          SELECT id, short_code, status, order_type, table_group_id,
                 total_cents, created_at, paid_at, paid_by_cashier_id,
                 payment_method, payment_reference, qr_expires_at, qr_consumed_at,
                 delivered_at, cancelled_at, cancel_reason
          FROM   "order"
          WHERE  id = ${input.orderId}
          FOR UPDATE NOWAIT
        `);
        if (!res.rows[0]) throw new OrderImmutableError();
        row = res.rows[0];
      } catch (err) {
        if ((err as { code?: string }).code === '55P03') throw new OrderLockedError();
        throw err;
      }

      // 2. Status guard
      if (row.status !== 'pending') throw new OrderImmutableError();

      // 3. Idempotency — re-use audit_log as dedup store
      const dup = await txDb.execute<{ cnt: string }>(sql`
        SELECT COUNT(*)::text AS cnt
        FROM   audit_log
        WHERE  action = 'cashier_confirm'
          AND  payload->>'idempotencyKey' = ${input.idempotencyKey}
      `);
      if (Number(dup.rows[0]?.cnt ?? 0) > 0) return;

      // 4. Promote order
      const now = new Date().toISOString();
      await txDb.execute(sql`
        UPDATE "order"
        SET    status             = 'in_kitchen',
               paid_at            = ${now}::timestamptz,
               paid_by_cashier_id = ${input.actorId},
               payment_method     = ${input.paymentMethod},
               payment_reference  = ${input.yapeReference ?? null},
               qr_consumed_at     = ${now}::timestamptz
        WHERE  id = ${input.orderId}
      `);

      // 5. Audit
      await txDb.insert(auditLog).values({
        actorType: 'staff',
        actorId: input.actorId,
        action: 'cashier_confirm',
        entity: 'order',
        entityId: input.orderId,
        payload: {
          paymentMethod: input.paymentMethod,
          idempotencyKey: input.idempotencyKey,
          qrWasExpiredAtConfirm: input.qrWasExpiredAtConfirm,
          yapeReference: input.yapeReference ?? null,
        },
      });

      // 6. NOTIFY (inside tx — fires only on commit)
      await notifyAfterTx(mkExecutor(txDb), 'order_status_changed', {
        orderId: input.orderId,
        from: 'pending',
        to: 'in_kitchen',
        shortCode: row.short_code,
        tableId: null,
      });
    });
  }

  async undo(orderId: string, actorId: number): Promise<void> {
    await this.db.transaction(async (tx) => {
      const txDb = tx as unknown as DrizzleDb;

      let row: OrderRow;
      try {
        const res = await txDb.execute<OrderRow>(sql`
          SELECT id, short_code, status, order_type, table_group_id,
                 total_cents, created_at, paid_at, paid_by_cashier_id,
                 payment_method, payment_reference, qr_expires_at, qr_consumed_at,
                 delivered_at, cancelled_at, cancel_reason
          FROM   "order"
          WHERE  id = ${orderId}
          FOR UPDATE NOWAIT
        `);
        if (!res.rows[0]) throw new OrderImmutableError();
        row = res.rows[0];
      } catch (err) {
        if ((err as { code?: string }).code === '55P03') throw new OrderLockedError();
        throw err;
      }

      if (row.status !== 'in_kitchen') throw new UndoExpiredError();
      if (row.delivered_at) throw new UndoExpiredError();

      const paidAt = toDate(row.paid_at);
      if (!paidAt || Date.now() - paidAt.getTime() > 2 * 60 * 1000) {
        throw new UndoExpiredError();
      }

      await txDb.execute(sql`
        UPDATE "order"
        SET    status             = 'pending',
               paid_at            = NULL,
               paid_by_cashier_id = NULL,
               payment_method     = NULL,
               payment_reference  = NULL,
               qr_consumed_at     = NULL
        WHERE  id = ${orderId}
      `);

      await txDb.insert(auditLog).values({
        actorType: 'staff',
        actorId,
        action: 'cashier_undo',
        entity: 'order',
        entityId: orderId,
        payload: { previousStatus: 'in_kitchen' },
      });

      await notifyAfterTx(mkExecutor(txDb), 'order_status_changed', {
        orderId,
        from: 'in_kitchen',
        to: 'pending',
        shortCode: row.short_code,
        tableId: null,
      });
    });
  }

  async cancel(orderId: string, reason: string, actorId: number): Promise<void> {
    if (reason.length < 5) throw new ReasonTooShortError();

    await this.db.transaction(async (tx) => {
      const txDb = tx as unknown as DrizzleDb;

      let row: OrderRow;
      try {
        const res = await txDb.execute<OrderRow>(sql`
          SELECT id, short_code, status, order_type, table_group_id,
                 total_cents, created_at, paid_at, paid_by_cashier_id,
                 payment_method, payment_reference, qr_expires_at, qr_consumed_at,
                 delivered_at, cancelled_at, cancel_reason
          FROM   "order"
          WHERE  id = ${orderId}
          FOR UPDATE NOWAIT
        `);
        if (!res.rows[0]) throw new OrderImmutableError();
        row = res.rows[0];
      } catch (err) {
        if ((err as { code?: string }).code === '55P03') throw new OrderLockedError();
        throw err;
      }

      if (row.status !== 'pending') throw new OrderImmutableError();

      const now = new Date().toISOString();
      await txDb.execute(sql`
        UPDATE "order"
        SET    status        = 'cancelled',
               cancelled_at  = ${now}::timestamptz,
               cancel_reason = ${reason}
        WHERE  id = ${orderId}
      `);

      await txDb.insert(auditLog).values({
        actorType: 'staff',
        actorId,
        action: 'cashier_cancel',
        entity: 'order',
        entityId: orderId,
        payload: { reason },
      });

      await notifyAfterTx(mkExecutor(txDb), 'order_status_changed', {
        orderId,
        from: 'pending',
        to: 'cancelled',
        shortCode: row.short_code,
        tableId: null,
      });
    });
  }

  async listPendingToday(): Promise<CashierOrderView[]> {
    const res = await this.db.execute<OrderRow>(sql`
      SELECT id, short_code, status, order_type, table_group_id,
             total_cents, created_at, paid_at, paid_by_cashier_id,
             payment_method, payment_reference, qr_expires_at, qr_consumed_at,
             delivered_at, cancelled_at, cancel_reason
      FROM   "order"
      WHERE  status = 'pending'
        AND  created_at::date = CURRENT_DATE
      ORDER  BY created_at ASC
    `);
    return this.buildViews(res.rows);
  }

  async listRecentConfirmed(limit = 5): Promise<CashierOrderView[]> {
    const res = await this.db.execute<OrderRow>(sql`
      SELECT id, short_code, status, order_type, table_group_id,
             total_cents, created_at, paid_at, paid_by_cashier_id,
             payment_method, payment_reference, qr_expires_at, qr_consumed_at,
             delivered_at, cancelled_at, cancel_reason
      FROM   "order"
      WHERE  status IN ('in_kitchen', 'delivered')
        AND  paid_at::date = CURRENT_DATE
      ORDER  BY paid_at DESC
      LIMIT  ${limit}
    `);
    return this.buildViews(res.rows);
  }

  async dailySummary(now?: Date): Promise<{ paidCount: number; cashCents: number; yapeCents: number }> {
    const dateStr = (now ?? new Date()).toISOString().slice(0, 10);
    const res = await this.db.execute<{
      paid_count: string;
      cash_cents: string;
      yape_cents: string;
    }>(sql`
      SELECT
        COUNT(*) FILTER (WHERE status != 'cancelled')                        AS paid_count,
        COALESCE(SUM(total_cents) FILTER (WHERE payment_method = 'cash'), 0) AS cash_cents,
        COALESCE(SUM(total_cents) FILTER (WHERE payment_method = 'yape'), 0) AS yape_cents
      FROM   "order"
      WHERE  paid_at::date = ${dateStr}::date
    `);
    const row = res.rows[0];
    return {
      paidCount: Number(row?.paid_count ?? 0),
      cashCents: Number(row?.cash_cents ?? 0),
      yapeCents: Number(row?.yape_cents ?? 0),
    };
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private async buildView(row: OrderRow): Promise<CashierOrderView> {
    const views = await this.buildViews([row]);
    return views[0]!;
  }

  private async buildViews(rows: OrderRow[]): Promise<CashierOrderView[]> {
    if (rows.length === 0) return [];

    const orderIds = rows.map((r) => r.id);
    const tableGroupIds = [
      ...new Set(
        rows
          .map((r) => r.table_group_id)
          .filter((id): id is string | number => id != null)
          .map(Number),
      ),
    ];
    const cashierIds = [
      ...new Set(
        rows
          .map((r) => r.paid_by_cashier_id)
          .filter((id): id is string | number => id != null)
          .map(Number),
      ),
    ];

    const [itemsMap, tableCodeMap, cashierNameMap] = await Promise.all([
      this.loadItemsBatch(orderIds),
      tableGroupIds.length > 0
        ? this.loadTableCodesBatch(tableGroupIds)
        : Promise.resolve(new Map<number, string>()),
      cashierIds.length > 0
        ? this.loadCashierNamesBatch(cashierIds)
        : Promise.resolve(new Map<number, string>()),
    ]);

    return rows.map((row) => {
      const tgId = row.table_group_id != null ? Number(row.table_group_id) : null;
      const cId = row.paid_by_cashier_id != null ? Number(row.paid_by_cashier_id) : null;
      return {
        orderId: row.id,
        shortCode: row.short_code,
        status: row.status as OrderStatus,
        orderType: row.order_type as 'dine_in' | 'takeaway',
        tableCode: tgId != null ? (tableCodeMap.get(tgId) ?? null) : null,
        totalCents: Number(row.total_cents),
        createdAt: toDate(row.created_at) ?? new Date(),
        paidAt: toDate(row.paid_at),
        paidByCashierName: cId != null ? (cashierNameMap.get(cId) ?? null) : null,
        paymentMethod: (row.payment_method as 'cash' | 'yape' | null) ?? null,
        qrExpiresAt: toDate(row.qr_expires_at) ?? new Date(),
        items: itemsMap.get(row.id) ?? [],
      };
    });
  }

  private async loadItemsBatch(
    orderIds: string[],
  ): Promise<Map<string, CashierOrderView['items']>> {
    if (orderIds.length === 0) return new Map();

    const rows = await this.db
      .select({
        orderId: orderItem.orderId,
        name: menuItem.name,
        category: menuItem.category,
        variant: orderItem.variant,
        quantity: orderItem.quantity,
        withTupper: orderItem.withTupper,
        unitPriceCents: orderItem.unitPriceCents,
      })
      .from(orderItem)
      .innerJoin(menuItem, eq(orderItem.menuItemId, menuItem.id))
      .where(inArray(orderItem.orderId, orderIds));

    const map = new Map<string, CashierOrderView['items']>();
    for (const r of rows) {
      const list = map.get(r.orderId) ?? [];
      list.push({
        name: r.name,
        category: r.category as ItemCategory,
        variant: r.variant as ItemVariant,
        quantity: r.quantity,
        withTupper: r.withTupper,
        unitPriceCents: r.unitPriceCents,
      });
      map.set(r.orderId, list);
    }
    return map;
  }

  private async loadTableCodesBatch(tableGroupIds: number[]): Promise<Map<number, string>> {
    if (tableGroupIds.length === 0) return new Map();

    const rows = await this.db
      .select({
        tableGroupId: tableGroupMember.tableGroupId,
        code: restaurantTable.code,
      })
      .from(tableGroupMember)
      .innerJoin(restaurantTable, eq(tableGroupMember.tableId, restaurantTable.id))
      .where(inArray(tableGroupMember.tableGroupId, tableGroupIds));

    const map = new Map<number, string>();
    for (const r of rows) {
      if (!map.has(r.tableGroupId)) map.set(r.tableGroupId, r.code);
    }
    return map;
  }

  private async loadCashierNamesBatch(cashierIds: number[]): Promise<Map<number, string>> {
    if (cashierIds.length === 0) return new Map();

    const rows = await this.db
      .select({ id: staffUser.id, displayName: staffUser.displayName })
      .from(staffUser)
      .where(inArray(staffUser.id, cashierIds));

    return new Map(rows.map((r) => [r.id, r.displayName]));
  }
}
