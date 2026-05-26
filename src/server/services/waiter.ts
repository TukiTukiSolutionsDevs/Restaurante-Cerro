import { eq, inArray, sql } from 'drizzle-orm';

import type { DrizzleDb } from '@/db/client';
import { auditLog } from '@/db/schema/audit';
import { menuItem } from '@/db/schema/menu';
import { orderItem } from '@/db/schema/orders';
import { restaurantTable, tableGroupMember } from '@/db/schema/tables';
import type { ItemCategory, ItemVariant } from '@/lib/money/types';
import { notifyAfterTx, type SqlExecutor } from '@/lib/realtime/notify';

// ─── Error types ─────────────────────────────────────────────────────────────

export class OrderAlreadyDeliveredError extends Error {
  readonly code = 'ALREADY_DELIVERED' as const;
  readonly httpStatus = 409;
  constructor() {
    super('Ya fue entregado por otro mozo');
    this.name = 'OrderAlreadyDeliveredError';
  }
}

export class WaiterOrderNotFoundError extends Error {
  readonly code = 'ORDER_NOT_FOUND' as const;
  readonly httpStatus = 404;
  constructor() {
    super('Pedido no encontrado');
    this.name = 'WaiterOrderNotFoundError';
  }
}

// ─── Public types ─────────────────────────────────────────────────────────────

export interface WaiterOrderView {
  orderId: string;
  shortCode: string;
  status: 'paid' | 'in_kitchen';
  orderType: 'dine_in' | 'takeaway';
  tableCode: string | null;
  tableGroupId: number | null;
  paidAt: Date;
  totalCents: number;
  items: Array<{
    name: string;
    category: ItemCategory;
    variant: ItemVariant;
    quantity: number;
    withTupper: boolean;
  }>;
}

// ─── Internal types ───────────────────────────────────────────────────────────

type OrderRow = {
  id: string;
  short_code: string;
  status: string;
  order_type: string;
  table_group_id: number | string | null;
  paid_at: Date | string;
  total_cents: number | string;
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

export class WaiterService {
  constructor(private db: DrizzleDb) {}

  async markDelivered(orderId: string, actorId: number): Promise<void> {
    await this.db.transaction(async (tx) => {
      const txDb = tx as unknown as DrizzleDb;

      let row: OrderRow;
      try {
        const res = await txDb.execute<OrderRow>(sql`
          SELECT id, short_code, status, order_type, table_group_id,
                 paid_at, total_cents
          FROM   "order"
          WHERE  id = ${orderId}
          FOR UPDATE NOWAIT
        `);
        if (!res.rows[0]) throw new WaiterOrderNotFoundError();
        row = res.rows[0];
      } catch (err) {
        if ((err as { code?: string }).code === '55P03') {
          throw new OrderAlreadyDeliveredError();
        }
        throw err;
      }

      if (row.status !== 'in_kitchen') {
        throw new OrderAlreadyDeliveredError();
      }

      const now = new Date().toISOString();
      await txDb.execute(sql`
        UPDATE "order"
        SET    status       = 'delivered',
               delivered_at = ${now}::timestamptz
        WHERE  id = ${orderId}
      `);

      await txDb.insert(auditLog).values({
        actorType: 'staff',
        actorId,
        action: 'waiter_deliver',
        entity: 'order',
        entityId: orderId,
        payload: {},
      });

      await notifyAfterTx(mkExecutor(txDb), 'order_status_changed', {
        orderId,
        from: 'in_kitchen',
        to: 'delivered',
        shortCode: row.short_code,
        tableId: null,
      });
    });
  }

  async listActive(): Promise<WaiterOrderView[]> {
    const res = await this.db.execute<OrderRow>(sql`
      SELECT id, short_code, status, order_type, table_group_id,
             paid_at, total_cents
      FROM   "order"
      WHERE  status IN ('paid', 'in_kitchen')
        AND  paid_at IS NOT NULL
      ORDER BY paid_at ASC
    `);

    const rows = res.rows;
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

    const [itemsMap, tableCodeMap] = await Promise.all([
      this.loadItemsBatch(orderIds),
      tableGroupIds.length > 0
        ? this.loadTableCodesBatch(tableGroupIds)
        : Promise.resolve(new Map<number, string>()),
    ]);

    return rows.map((row) => {
      const tgId = row.table_group_id != null ? Number(row.table_group_id) : null;
      return {
        orderId: row.id,
        shortCode: row.short_code,
        status: row.status as 'paid' | 'in_kitchen',
        orderType: row.order_type as 'dine_in' | 'takeaway',
        tableCode: tgId != null ? (tableCodeMap.get(tgId) ?? null) : null,
        tableGroupId: tgId,
        paidAt: toDate(row.paid_at) ?? new Date(),
        totalCents: Number(row.total_cents),
        items: itemsMap.get(row.id) ?? [],
      };
    });
  }

  private async loadItemsBatch(
    orderIds: string[],
  ): Promise<Map<string, WaiterOrderView['items']>> {
    if (orderIds.length === 0) return new Map();

    const rows = await this.db
      .select({
        orderId: orderItem.orderId,
        name: menuItem.name,
        category: menuItem.category,
        variant: orderItem.variant,
        quantity: orderItem.quantity,
        withTupper: orderItem.withTupper,
      })
      .from(orderItem)
      .innerJoin(menuItem, eq(orderItem.menuItemId, menuItem.id))
      .where(inArray(orderItem.orderId, orderIds));

    const map = new Map<string, WaiterOrderView['items']>();
    for (const r of rows) {
      const list = map.get(r.orderId) ?? [];
      list.push({
        name: r.name,
        category: r.category as ItemCategory,
        variant: r.variant as ItemVariant,
        quantity: r.quantity,
        withTupper: r.withTupper,
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

    const groupCodes = new Map<number, string[]>();
    for (const r of rows) {
      const codes = groupCodes.get(r.tableGroupId) ?? [];
      codes.push(r.code);
      groupCodes.set(r.tableGroupId, codes);
    }

    const result = new Map<number, string>();
    for (const [groupId, codes] of groupCodes) {
      result.set(groupId, codes.sort().join('+'));
    }
    return result;
  }
}
