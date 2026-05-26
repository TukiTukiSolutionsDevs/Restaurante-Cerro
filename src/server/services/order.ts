import crypto from 'node:crypto';

import { and, eq, inArray, isNotNull, isNull, lt, sql } from 'drizzle-orm';

import type { DrizzleDb } from '@/db/client';
import { comboConfig, dailyMenu, menuItem } from '@/db/schema/menu';
import { order, orderItem } from '@/db/schema/orders';
import { restaurantTable, tableGroup, tableGroupMember } from '@/db/schema/tables';
import { priceOrder } from '@/lib/money/price';
import type { ItemCategory, ItemVariant } from '@/lib/money/types';
import { generateNonce, signQrToken, verifyQrToken } from '@/lib/qr/token';
import { notifyAfterTx, type SqlExecutor } from '@/lib/realtime/notify';

// ─── Error types ────────────────────────────────────────────────────────────

export class MenuClosedError extends Error {
  code = 'MENU_CLOSED' as const;
  constructor() {
    super('No hay menú abierto hoy');
    this.name = 'MenuClosedError';
  }
}

export class ItemUnavailableError extends Error {
  code = 'ITEM_UNAVAILABLE' as const;
  constructor(message = 'Plato no disponible') {
    super(message);
    this.name = 'ItemUnavailableError';
  }
}

export class TableTakenError extends Error {
  code = 'TABLE_TAKEN' as const;
  constructor(message = 'Mesa no disponible, elige otra.') {
    super(message);
    this.name = 'TableTakenError';
  }
}

export class OrderNotFoundError extends Error {
  code = 'ORDER_NOT_FOUND' as const;
  constructor() {
    super('Pedido no encontrado');
    this.name = 'OrderNotFoundError';
  }
}

export class OrderImmutableError extends Error {
  code = 'ORDER_LOCKED' as const;
  constructor() {
    super('El pedido ya no puede modificarse');
    this.name = 'OrderImmutableError';
  }
}

export class OrderExpiredError extends Error {
  code = 'ORDER_EXPIRED' as const;
  constructor() {
    super('El QR del pedido ha expirado');
    this.name = 'OrderExpiredError';
  }
}

// ─── Input / output types ────────────────────────────────────────────────────

export type OrderItemInput = {
  menuItemId: number;
  variant: ItemVariant;
  quantity: number;
  withTupper?: boolean;
};

export interface CreateOrderInput {
  orderType: 'dine_in' | 'takeaway';
  tableId?: number | null;
  items: OrderItemInput[];
}

export interface CreateOrderResult {
  orderId: string;
  shortCode: string;
  qrToken: string;
  qrExpiresAt: Date;
  totalCents: number;
  detectedCombo: boolean;
}

export interface PublicOrder {
  orderId: string;
  shortCode: string;
  status: 'pending' | 'paid' | 'in_kitchen' | 'delivered' | 'cancelled';
  orderType: 'dine_in' | 'takeaway';
  tableCode: string | null;
  tableGroupId: number | null;
  totalCents: number;
  qrExpiresAt: Date;
  createdAt: Date;
  cancelReason: string | null;
  items: Array<{
    menuItemId: number;
    name: string;
    category: ItemCategory;
    variant: ItemVariant;
    quantity: number;
    unitPriceCents: number;
    withTupper: boolean;
  }>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const SHORT_CODE_ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function genShortCode(): string {
  return Array.from(
    { length: 4 },
    () => SHORT_CODE_ALPHA[Math.floor(Math.random() * SHORT_CODE_ALPHA.length)],
  ).join('');
}

function mkExecutor(txDb: DrizzleDb): SqlExecutor {
  return {
    execute: (_raw, params) =>
      txDb.execute(
        sql`SELECT pg_notify(${params[0] as string}, ${params[1] as string})`,
      ),
  };
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class OrderService {
  constructor(
    private db: DrizzleDb,
    private qrSecret: Uint8Array,
  ) {}

  async createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
    return this.db.transaction(async (tx) => {
      const txDb = tx as unknown as DrizzleDb;
      const now = new Date();
      const todayStr = now.toISOString().slice(0, 10);

      // 1. Load today's opened menu
      const [menu] = await txDb
        .select()
        .from(dailyMenu)
        .where(
          and(
            eq(dailyMenu.serviceDate, todayStr),
            isNotNull(dailyMenu.openedAt),
            isNull(dailyMenu.closedAt),
          ),
        );
      if (!menu) throw new MenuClosedError();

      const [combo] = await txDb
        .select()
        .from(comboConfig)
        .where(eq(comboConfig.dailyMenuId, menu.id));
      if (!combo) throw new MenuClosedError();

      // 2. Validate items against today's menu
      const allMenuItems = await txDb
        .select()
        .from(menuItem)
        .where(eq(menuItem.dailyMenuId, menu.id));
      const menuItemMap = new Map(allMenuItems.map((i) => [i.id, i]));

      for (const item of input.items) {
        const mi = menuItemMap.get(item.menuItemId);
        if (!mi) {
          throw new ItemUnavailableError(
            `El plato ${item.menuItemId} no está en el menú de hoy`,
          );
        }
        if (!mi.isAvailable) {
          throw new ItemUnavailableError(`El plato "${mi.name}" ya no está disponible`);
        }
      }

      // 3. Resolve table (dine_in only)
      let tableGroupId: number | null = null;

      if (input.orderType === 'dine_in') {
        if (!input.tableId) {
          throw new TableTakenError('Se requiere mesa para pedidos en sala');
        }

        const conflict = await txDb.execute<{ n: string }>(sql`
          SELECT 1 AS n
          FROM   "order" o
          JOIN   table_group_member tgm ON tgm.table_group_id = o.table_group_id
          WHERE  tgm.table_id = ${input.tableId}
            AND  (
              (o.status = 'pending' AND o.qr_expires_at > now())
              OR o.status IN ('paid', 'in_kitchen')
            )
          LIMIT  1
        `);
        if (conflict.rows.length > 0) throw new TableTakenError();

        const [group] = await txDb
          .insert(tableGroup)
          .values({ createdAt: now })
          .returning({ id: tableGroup.id });
        tableGroupId = group!.id;

        await txDb.insert(tableGroupMember).values({
          tableGroupId,
          tableId: input.tableId,
        });
      }

      // 4. Compute price
      const cartItems = input.items.map((item) => {
        const mi = menuItemMap.get(item.menuItemId)!;
        return {
          menuItemId: item.menuItemId,
          category: mi.category as ItemCategory,
          variant: item.variant,
          quantity: item.quantity,
          unitPriceCents: mi.priceCents ?? undefined,
        };
      });

      const anyWithTupper = input.items.some((i) => i.withTupper);
      const pricing = priceOrder({
        items: cartItems,
        orderType: input.orderType,
        withTupper: anyWithTupper,
        combo: {
          dineInPriceCents: combo.dineInPriceCents,
          takeawayPriceCents: combo.takeawayPriceCents,
          tupperFullPriceCents: combo.tupperFullPriceCents,
          tupperPartialPriceCents: combo.tupperPartialPriceCents,
          partialStarterPriceCents: combo.partialStarterPriceCents,
          partialMainPriceCents: combo.partialMainPriceCents,
        },
      });

      // 5. Generate short code (retry up to 5 on collision)
      let shortCode = '';
      for (let attempt = 0; attempt < 5; attempt++) {
        const candidate = genShortCode();
        const existing = await txDb
          .select({ id: order.id })
          .from(order)
          .where(
            and(
              eq(order.shortCode, candidate),
              sql`${order.createdAt} > now() - interval '24 hours'`,
            ),
          )
          .limit(1);

        if (existing.length === 0) {
          shortCode = candidate;
          break;
        }
        if (attempt === 4) {
          throw new Error('No se pudo generar un código único. Intenta de nuevo.');
        }
      }

      // 6. Generate QR token
      const orderId = crypto.randomUUID();
      const nonce = generateNonce();
      const { token: qrToken, expiresAt: qrExpiresAt } = await signQrToken(
        { orderId, tableId: input.tableId ?? null, nonce },
        this.qrSecret,
        now,
      );

      // 7. Insert order row
      await txDb.insert(order).values({
        id: orderId,
        shortCode,
        status: 'pending',
        orderType: input.orderType,
        dailyMenuId: menu.id,
        tableGroupId,
        totalCents: pricing.totalCents,
        qrToken,
        qrExpiresAt,
        createdAt: now,
      });

      // 8. Insert order items
      const linesByKey = new Map(
        pricing.lines.map((l) => [`${l.menuItemId}:${l.variant}`, l]),
      );
      await txDb.insert(orderItem).values(
        input.items.map((item) => {
          const line = linesByKey.get(`${item.menuItemId}:${item.variant}`);
          return {
            orderId,
            menuItemId: item.menuItemId,
            variant: item.variant,
            withTupper: item.withTupper ?? false,
            quantity: item.quantity,
            unitPriceCents: line?.unitPriceCents ?? 0,
          };
        }),
      );

      // 9. NOTIFY — from === to === 'pending' signals creation to cashier queue
      await notifyAfterTx(mkExecutor(txDb), 'order_status_changed', {
        orderId,
        from: 'pending',
        to: 'pending',
        shortCode,
        tableId: input.tableId ?? null,
      });

      if (input.orderType === 'dine_in' && input.tableId) {
        await notifyAfterTx(mkExecutor(txDb), 'table_changed', {
          tableId: input.tableId,
          change: 'state_changed',
        });
      }

      return {
        orderId,
        shortCode,
        qrToken,
        qrExpiresAt,
        totalCents: pricing.totalCents,
        detectedCombo: pricing.detectedCombo,
      };
    });
  }

  async patchItems(token: string, items: OrderItemInput[]): Promise<void> {
    return this.db.transaction(async (tx) => {
      const txDb = tx as unknown as DrizzleDb;

      const [orderRow] = await txDb
        .select()
        .from(order)
        .where(eq(order.qrToken, token));

      if (!orderRow) throw new OrderNotFoundError();
      if (orderRow.status !== 'pending') throw new OrderImmutableError();
      if (orderRow.qrExpiresAt < new Date()) throw new OrderExpiredError();

      // Validate items against the same menu
      const allMenuItems = await txDb
        .select()
        .from(menuItem)
        .where(eq(menuItem.dailyMenuId, orderRow.dailyMenuId));
      const menuItemMap = new Map(allMenuItems.map((i) => [i.id, i]));

      for (const item of items) {
        const mi = menuItemMap.get(item.menuItemId);
        if (!mi) {
          throw new ItemUnavailableError(
            `El plato ${item.menuItemId} no está en el menú`,
          );
        }
        if (!mi.isAvailable) {
          throw new ItemUnavailableError(`El plato "${mi.name}" ya no está disponible`);
        }
      }

      const [combo] = await txDb
        .select()
        .from(comboConfig)
        .where(eq(comboConfig.dailyMenuId, orderRow.dailyMenuId));
      if (!combo) throw new MenuClosedError();

      const cartItems = items.map((item) => {
        const mi = menuItemMap.get(item.menuItemId)!;
        return {
          menuItemId: item.menuItemId,
          category: mi.category as ItemCategory,
          variant: item.variant,
          quantity: item.quantity,
          unitPriceCents: mi.priceCents ?? undefined,
        };
      });

      const anyWithTupper = items.some((i) => i.withTupper);
      const pricing = priceOrder({
        items: cartItems,
        orderType: orderRow.orderType,
        withTupper: anyWithTupper,
        combo: {
          dineInPriceCents: combo.dineInPriceCents,
          takeawayPriceCents: combo.takeawayPriceCents,
          tupperFullPriceCents: combo.tupperFullPriceCents,
          tupperPartialPriceCents: combo.tupperPartialPriceCents,
          partialStarterPriceCents: combo.partialStarterPriceCents,
          partialMainPriceCents: combo.partialMainPriceCents,
        },
      });

      // Full replace: delete + re-insert
      await txDb.delete(orderItem).where(eq(orderItem.orderId, orderRow.id));

      const linesByKey = new Map(
        pricing.lines.map((l) => [`${l.menuItemId}:${l.variant}`, l]),
      );
      await txDb.insert(orderItem).values(
        items.map((item) => {
          const line = linesByKey.get(`${item.menuItemId}:${item.variant}`);
          return {
            orderId: orderRow.id,
            menuItemId: item.menuItemId,
            variant: item.variant,
            withTupper: item.withTupper ?? false,
            quantity: item.quantity,
            unitPriceCents: line?.unitPriceCents ?? 0,
          };
        }),
      );

      await txDb
        .update(order)
        .set({ totalCents: pricing.totalCents })
        .where(eq(order.id, orderRow.id));
    });
  }

  async cancelByCustomer(token: string): Promise<void> {
    return this.db.transaction(async (tx) => {
      const txDb = tx as unknown as DrizzleDb;

      const [orderRow] = await txDb
        .select()
        .from(order)
        .where(eq(order.qrToken, token));

      if (!orderRow) throw new OrderNotFoundError();
      if (orderRow.status !== 'pending') throw new OrderImmutableError();

      const now = new Date();
      await txDb
        .update(order)
        .set({ status: 'cancelled', cancelledAt: now, cancelReason: 'customer_cancel' })
        .where(eq(order.id, orderRow.id));

      if (orderRow.tableGroupId) {
        await txDb
          .update(tableGroup)
          .set({ closedAt: now })
          .where(eq(tableGroup.id, orderRow.tableGroupId));

        await notifyAfterTx(mkExecutor(txDb), 'table_changed', {
          groupId: orderRow.tableGroupId,
          change: 'state_changed',
        });
      }

      await notifyAfterTx(mkExecutor(txDb), 'order_status_changed', {
        orderId: orderRow.id,
        from: 'pending',
        to: 'cancelled',
        shortCode: orderRow.shortCode,
        tableId: null,
      });
    });
  }

  async getByToken(token: string): Promise<PublicOrder | null> {
    const verification = await verifyQrToken(token, this.qrSecret);
    // Allow expired tokens — only reject invalid signature / malformed
    if (!verification.ok && verification.reason !== 'expired') {
      return null;
    }

    const [orderRow] = await this.db
      .select()
      .from(order)
      .where(eq(order.qrToken, token));

    if (!orderRow) return null;

    const items = await this.db
      .select({
        menuItemId: orderItem.menuItemId,
        name: menuItem.name,
        category: menuItem.category,
        variant: orderItem.variant,
        quantity: orderItem.quantity,
        unitPriceCents: orderItem.unitPriceCents,
        withTupper: orderItem.withTupper,
      })
      .from(orderItem)
      .innerJoin(menuItem, eq(orderItem.menuItemId, menuItem.id))
      .where(eq(orderItem.orderId, orderRow.id));

    let tableCode: string | null = null;
    if (orderRow.tableGroupId) {
      const rows = await this.db
        .select({ code: restaurantTable.code })
        .from(restaurantTable)
        .innerJoin(tableGroupMember, eq(tableGroupMember.tableId, restaurantTable.id))
        .where(eq(tableGroupMember.tableGroupId, orderRow.tableGroupId))
        .limit(1);
      tableCode = rows[0]?.code ?? null;
    }

    return {
      orderId: orderRow.id,
      shortCode: orderRow.shortCode,
      status: orderRow.status as PublicOrder['status'],
      orderType: orderRow.orderType,
      tableCode,
      tableGroupId: orderRow.tableGroupId ?? null,
      totalCents: orderRow.totalCents,
      qrExpiresAt: orderRow.qrExpiresAt,
      createdAt: orderRow.createdAt,
      cancelReason: orderRow.cancelReason ?? null,
      items: items.map((i) => ({
        menuItemId: i.menuItemId,
        name: i.name,
        category: i.category as ItemCategory,
        variant: i.variant as ItemVariant,
        quantity: i.quantity,
        unitPriceCents: i.unitPriceCents,
        withTupper: i.withTupper,
      })),
    };
  }

  async expirePendingOrders(now?: Date): Promise<{ cancelled: number }> {
    const cutoff = now ?? new Date();

    return this.db.transaction(async (tx) => {
      const txDb = tx as unknown as DrizzleDb;

      const expired = await txDb
        .select({
          id: order.id,
          shortCode: order.shortCode,
          tableGroupId: order.tableGroupId,
        })
        .from(order)
        .where(and(eq(order.status, 'pending'), lt(order.qrExpiresAt, cutoff)));

      if (expired.length === 0) return { cancelled: 0 };

      const ids = expired.map((r) => r.id);
      await txDb
        .update(order)
        .set({ status: 'cancelled', cancelledAt: cutoff, cancelReason: 'qr_expired' })
        .where(inArray(order.id, ids));

      const groupIds = expired
        .map((r) => r.tableGroupId)
        .filter((id): id is number => id !== null && id !== undefined);

      if (groupIds.length > 0) {
        await txDb
          .update(tableGroup)
          .set({ closedAt: cutoff })
          .where(inArray(tableGroup.id, groupIds));
      }

      for (const row of expired) {
        await notifyAfterTx(mkExecutor(txDb), 'order_status_changed', {
          orderId: row.id,
          from: 'pending',
          to: 'cancelled',
          shortCode: row.shortCode,
          tableId: null,
        });
      }

      if (groupIds.length > 0) {
        await notifyAfterTx(mkExecutor(txDb), 'table_changed', {
          change: 'state_changed',
        });
      }

      return { cancelled: expired.length };
    });
  }
}
