import { and, eq, inArray, sql } from 'drizzle-orm';

import { db } from '@/db/client';
import { order } from '@/db/schema/orders';
import { restaurantTable, tableGroupMember } from '@/db/schema/tables';
import { notifyAfterTx, type SqlExecutor } from '@/lib/realtime/notify';

export type TableState = 'inactive' | 'in_active_group' | 'tentative' | 'occupied' | 'free';

export interface TableWithState {
  id: number;
  code: string;
  capacity: number;
  positionX: number;
  positionY: number;
  isActive: boolean;
  state: TableState;
  activeGroupId: number | null;
  activeOrderId: string | null;
}

type DrizzleDb = typeof db;
type DrizzleTx = Parameters<Parameters<DrizzleDb['transaction']>[0]>[0];

const CODE_REGEX = /^[A-Z]{1,3}[0-9]{1,3}$/;

function mkExecutor(tx: DrizzleTx): SqlExecutor {
  return {
    execute: (_raw, params) =>
      tx.execute(sql`SELECT pg_notify(${params[0] as string}, ${params[1] as string})`),
  };
}

export class TableService {
  constructor(private db: DrizzleDb) {}

  async create(
    input: { code: string; capacity?: number; positionX?: number; positionY?: number },
    _actorId: number,
  ): Promise<{ tableId: number }> {
    if (!CODE_REGEX.test(input.code)) {
      throw Object.assign(
        new Error('Código inválido. Debe ser 1-3 letras mayúsculas seguidas de 1-3 dígitos (ej: M01, S5, BAR1).'),
        { code: 'TABLE_CODE_INVALID' },
      );
    }
    if (input.capacity !== undefined && input.capacity < 1) {
      throw Object.assign(new Error('La capacidad debe ser ≥ 1.'), { code: 'TABLE_CAPACITY_INVALID' });
    }

    return this.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(restaurantTable)
        .values({
          code: input.code,
          capacity: input.capacity ?? 1,
          positionX: input.positionX ?? 0,
          positionY: input.positionY ?? 0,
          isActive: true,
        })
        .returning({ id: restaurantTable.id });

      if (!created) throw new Error('Insert sin resultado');

      await notifyAfterTx(mkExecutor(tx), 'table_changed', {
        tableId: created.id,
        change: 'created',
      });

      return { tableId: created.id };
    });
  }

  async patch(
    tableId: number,
    patch: Partial<{ code: string; capacity: number; positionX: number; positionY: number }>,
    _actorId: number,
  ): Promise<void> {
    if (patch.code !== undefined && !CODE_REGEX.test(patch.code)) {
      throw Object.assign(new Error('Código inválido.'), { code: 'TABLE_CODE_INVALID' });
    }
    if (patch.capacity !== undefined && patch.capacity < 1) {
      throw Object.assign(new Error('La capacidad debe ser ≥ 1.'), { code: 'TABLE_CAPACITY_INVALID' });
    }
    if (Object.keys(patch).length === 0) return;

    await this.db.transaction(async (tx) => {
      const values: Record<string, unknown> = {};
      if (patch.code !== undefined) values.code = patch.code;
      if (patch.capacity !== undefined) values.capacity = patch.capacity;
      if (patch.positionX !== undefined) values.positionX = patch.positionX;
      if (patch.positionY !== undefined) values.positionY = patch.positionY;

      const [updated] = await tx
        .update(restaurantTable)
        .set(values)
        .where(eq(restaurantTable.id, tableId))
        .returning({ id: restaurantTable.id });

      if (!updated) {
        throw Object.assign(new Error('Mesa no encontrada.'), { code: 'TABLE_NOT_FOUND' });
      }

      await notifyAfterTx(mkExecutor(tx), 'table_changed', { tableId, change: 'updated' });
    });
  }

  async deactivate(tableId: number, _actorId: number): Promise<{ hasActiveOrder: boolean }> {
    return this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: restaurantTable.id })
        .from(restaurantTable)
        .where(eq(restaurantTable.id, tableId));
      if (!existing) {
        throw Object.assign(new Error('Mesa no encontrada.'), { code: 'TABLE_NOT_FOUND' });
      }

      // Check for active orders — deactivate regardless, return flag for UI warning
      const activeRows = await tx
        .select({ id: order.id })
        .from(order)
        .innerJoin(tableGroupMember, eq(tableGroupMember.tableGroupId, order.tableGroupId!))
        .where(
          and(
            eq(tableGroupMember.tableId, tableId),
            inArray(order.status, ['pending', 'paid', 'in_kitchen']),
          ),
        )
        .limit(1);

      await tx
        .update(restaurantTable)
        .set({ isActive: false })
        .where(eq(restaurantTable.id, tableId));

      await notifyAfterTx(mkExecutor(tx), 'table_changed', { tableId, change: 'deactivated' });

      return { hasActiveOrder: activeRows.length > 0 };
    });
  }

  async activate(tableId: number, _actorId: number): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(restaurantTable)
        .set({ isActive: true })
        .where(eq(restaurantTable.id, tableId))
        .returning({ id: restaurantTable.id });

      if (!updated) {
        throw Object.assign(new Error('Mesa no encontrada.'), { code: 'TABLE_NOT_FOUND' });
      }

      await notifyAfterTx(mkExecutor(tx), 'table_changed', { tableId, change: 'updated' });
    });
  }

  /*
   * Derived-state query — single SQL round-trip using CASE WHEN correlated sub-selects.
   *
   * Priority chain (first matching wins):
   *   1. inactive        → is_active = false
   *   2. in_active_group → table belongs to a group whose closed_at IS NULL
   *   3. tentative       → pending order with qr_expires_at > now()
   *   4. occupied        → paid/in_kitchen/delivered order, delivered_at within 30 min
   *   5. free            → none of the above
   *
   * The SQL table in Postgres is "restaurant_table" (not the reserved word "table").
   */
  async listAllWithDerivedState(): Promise<TableWithState[]> {
    const result = await this.db.execute<{
      id: number;
      code: string;
      capacity: number;
      positionX: number;
      positionY: number;
      isActive: boolean;
      state: TableState;
      activeGroupId: number | null;
      activeOrderId: string | null;
    }>(sql`
      SELECT
        t.id,
        t.code,
        t.capacity,
        t.position_x        AS "positionX",
        t.position_y        AS "positionY",
        t.is_active         AS "isActive",
        CASE
          WHEN NOT t.is_active THEN 'inactive'
          WHEN EXISTS (
            SELECT 1
            FROM   table_group_member tgm
            JOIN   table_group        tg  ON tg.id = tgm.table_group_id
            WHERE  tgm.table_id = t.id
              AND  tg.closed_at IS NULL
          ) THEN 'in_active_group'
          WHEN EXISTS (
            SELECT 1
            FROM   "order"            o
            JOIN   table_group_member tgm ON tgm.table_group_id = o.table_group_id
            WHERE  tgm.table_id = t.id
              AND  o.status      = 'pending'
              AND  o.qr_expires_at > now()
          ) THEN 'tentative'
          WHEN EXISTS (
            SELECT 1
            FROM   "order"            o
            JOIN   table_group_member tgm ON tgm.table_group_id = o.table_group_id
            WHERE  tgm.table_id = t.id
              AND  o.status IN ('paid', 'in_kitchen', 'delivered')
              AND  (
                o.delivered_at IS NULL
                OR o.delivered_at > now() - INTERVAL '30 minutes'
              )
          ) THEN 'occupied'
          ELSE 'free'
        END                 AS state,
        (
          SELECT tg.id
          FROM   table_group_member tgm
          JOIN   table_group        tg  ON tg.id = tgm.table_group_id
          WHERE  tgm.table_id = t.id
            AND  tg.closed_at IS NULL
          LIMIT  1
        )                   AS "activeGroupId",
        (
          SELECT o.id
          FROM   "order"            o
          JOIN   table_group_member tgm ON tgm.table_group_id = o.table_group_id
          WHERE  tgm.table_id = t.id
            AND  o.status IN ('pending', 'paid', 'in_kitchen', 'delivered')
          ORDER  BY o.created_at DESC
          LIMIT  1
        )                   AS "activeOrderId"
      FROM  restaurant_table t
      ORDER BY t.id
    `);

    return result.rows as TableWithState[];
  }

  async listFree(): Promise<Array<{ id: number; code: string; capacity: number }>> {
    const result = await this.db.execute<{ id: number; code: string; capacity: number }>(sql`
      SELECT t.id, t.code, t.capacity
      FROM   restaurant_table t
      WHERE  t.is_active = true
        AND  NOT EXISTS (
          SELECT 1
          FROM   table_group_member tgm
          JOIN   table_group        tg  ON tg.id = tgm.table_group_id
          WHERE  tgm.table_id = t.id
            AND  tg.closed_at IS NULL
        )
        AND  NOT EXISTS (
          SELECT 1
          FROM   "order"            o
          JOIN   table_group_member tgm ON tgm.table_group_id = o.table_group_id
          WHERE  tgm.table_id = t.id
            AND  o.status      = 'pending'
            AND  o.qr_expires_at > now()
        )
        AND  NOT EXISTS (
          SELECT 1
          FROM   "order"            o
          JOIN   table_group_member tgm ON tgm.table_group_id = o.table_group_id
          WHERE  tgm.table_id = t.id
            AND  o.status IN ('paid', 'in_kitchen', 'delivered')
            AND  (
              o.delivered_at IS NULL
              OR o.delivered_at > now() - INTERVAL '30 minutes'
            )
        )
      ORDER BY t.id
    `);

    return result.rows as Array<{ id: number; code: string; capacity: number }>;
  }

  async release(tableId: number, actorId: number, confirmReason: string): Promise<void> {
    if (confirmReason.length < 5) {
      throw Object.assign(
        new Error('El motivo debe tener al menos 5 caracteres.'),
        { code: 'RELEASE_REASON_TOO_SHORT' },
      );
    }

    await this.db.transaction(async (tx) => {
      const orderResult = await tx.execute<{
        id: string;
        status: string;
      }>(sql`
        SELECT o.id, o.status
        FROM   "order"            o
        JOIN   table_group_member tgm ON tgm.table_group_id = o.table_group_id
        WHERE  tgm.table_id = ${tableId}
          AND  o.status IN ('pending', 'delivered')
        ORDER  BY o.created_at DESC
        LIMIT  1
      `);

      const activeOrder = orderResult.rows[0] ?? null;

      if (activeOrder) {
        if (activeOrder.status === 'pending') {
          await tx
            .update(order)
            .set({
              status: 'cancelled',
              cancelledAt: new Date(),
              cancelReason: confirmReason.slice(0, 200),
            })
            .where(eq(order.id, activeOrder.id));
        } else {
          // delivered: push delivered_at past the 30-min window so state re-derives as free
          await tx.execute(sql`
            UPDATE "order"
            SET    delivered_at = now() - INTERVAL '31 minutes'
            WHERE  id = ${activeOrder.id}
          `);
        }
      }

      await tx.execute(sql`
        INSERT INTO audit_log (actor_type, actor_id, action, entity, entity_id, payload)
        VALUES (
          'staff',
          ${actorId},
          'table.force_release',
          'table',
          ${String(tableId)},
          ${JSON.stringify({ actorId, confirmReason, releasedOrderId: activeOrder?.id ?? null })}::jsonb
        )
      `);

      await notifyAfterTx(mkExecutor(tx), 'table_changed', {
        tableId,
        change: 'state_changed',
      });
    });
  }
}
