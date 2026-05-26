import { and, eq, inArray, sql } from 'drizzle-orm';

import { db } from '@/db/client';
import { order } from '@/db/schema/orders';
import { restaurantTable, tableGroup, tableGroupMember } from '@/db/schema/tables';
import { notifyAfterTx, type SqlExecutor } from '@/lib/realtime/notify';

type DrizzleDb = typeof db;
type DrizzleTx = Parameters<Parameters<DrizzleDb['transaction']>[0]>[0];

function mkExecutor(tx: DrizzleTx): SqlExecutor {
  return {
    execute: (_raw, params) =>
      tx.execute(sql`SELECT pg_notify(${params[0] as string}, ${params[1] as string})`),
  };
}

export class TableGroupService {
  constructor(private db: DrizzleDb) {}

  async join(
    tableIds: number[],
    name: string | null,
    _actorId: number,
  ): Promise<{ groupId: number; code: string }> {
    if (tableIds.length < 2) {
      throw Object.assign(
        new Error('Se requieren al menos 2 mesas para unir.'),
        { code: 'JOIN_MIN_TABLES' },
      );
    }
    if (new Set(tableIds).size !== tableIds.length) {
      throw Object.assign(new Error('Las mesas deben ser distintas.'), { code: 'JOIN_DUPLICATE_TABLES' });
    }

    return this.db.transaction(async (tx) => {
      // Validate all tables exist and are active
      const tables = await tx
        .select({ id: restaurantTable.id, code: restaurantTable.code, isActive: restaurantTable.isActive })
        .from(restaurantTable)
        .where(inArray(restaurantTable.id, tableIds));

      if (tables.length !== tableIds.length) {
        throw Object.assign(new Error('Una o más mesas no existen.'), { code: 'TABLE_NOT_FOUND' });
      }

      const inactive = tables.filter((t) => !t.isActive);
      if (inactive.length > 0) {
        throw Object.assign(
          new Error(`Las mesas ${inactive.map((t) => t.code).join(', ')} están inactivas.`),
          { code: 'TABLE_INACTIVE' },
        );
      }

      // Check none is in an open group — use parameterized array
      const inGroup = await tx.execute<{ tableId: number }>(sql`
        SELECT tgm.table_id AS "tableId"
        FROM   table_group_member tgm
        JOIN   table_group        tg  ON tg.id = tgm.table_group_id
        WHERE  tgm.table_id IN (${sql.join(tableIds.map((id) => sql`${id}`), sql`, `)})
          AND  tg.closed_at IS NULL
        LIMIT  1
      `);
      if (inGroup.rows.length > 0) {
        throw Object.assign(
          new Error('Una o más mesas ya pertenecen a un grupo activo.'),
          { code: 'TABLE_IN_ACTIVE_GROUP' },
        );
      }

      // Check none has an active order (pending/paid/in_kitchen)
      const withOrder = await tx
        .select({ id: order.id })
        .from(order)
        .innerJoin(tableGroupMember, eq(tableGroupMember.tableGroupId, order.tableGroupId!))
        .where(
          and(
            inArray(tableGroupMember.tableId, tableIds),
            inArray(order.status, ['pending', 'paid', 'in_kitchen']),
          ),
        )
        .limit(1);
      if (withOrder.length > 0) {
        throw Object.assign(
          new Error('Una o más mesas tienen un pedido activo.'),
          { code: 'TABLE_HAS_ACTIVE_ORDER' },
        );
      }

      // Generate group code: "G-" + alphabetically sorted codes joined with "+"
      const sortedCodes = [...tables]
        .sort((a, b) => a.code.localeCompare(b.code))
        .map((t) => t.code);
      const code = `G-${sortedCodes.join('+')}`.slice(0, 32);

      const [group] = await tx
        .insert(tableGroup)
        .values({ name: name ?? code })
        .returning({ id: tableGroup.id });

      if (!group) throw new Error('Error al crear el grupo.');

      await tx.insert(tableGroupMember).values(
        tableIds.map((tableId) => ({ tableGroupId: group.id, tableId })),
      );

      await notifyAfterTx(mkExecutor(tx), 'table_changed', {
        groupId: group.id,
        change: 'joined',
      });

      return { groupId: group.id, code };
    });
  }

  async split(groupId: number, _actorId: number): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [group] = await tx
        .select({ id: tableGroup.id, closedAt: tableGroup.closedAt })
        .from(tableGroup)
        .where(eq(tableGroup.id, groupId));

      if (!group) {
        throw Object.assign(new Error('Grupo no encontrado.'), { code: 'GROUP_NOT_FOUND' });
      }
      if (group.closedAt !== null) {
        throw Object.assign(new Error('El grupo ya fue cerrado.'), { code: 'GROUP_ALREADY_CLOSED' });
      }

      // Guard: no active order in paid or in_kitchen
      const blocking = await tx
        .select({ id: order.id })
        .from(order)
        .where(
          and(
            eq(order.tableGroupId, groupId),
            inArray(order.status, ['paid', 'in_kitchen']),
          ),
        )
        .limit(1);

      if (blocking.length > 0) {
        throw Object.assign(
          new Error('Tiene un pedido activo.'),
          { code: 'GROUP_HAS_ACTIVE_ORDER' },
        );
      }

      await tx
        .update(tableGroup)
        .set({ closedAt: new Date() })
        .where(eq(tableGroup.id, groupId));

      await notifyAfterTx(mkExecutor(tx), 'table_changed', { groupId, change: 'split' });
    });
  }
}
