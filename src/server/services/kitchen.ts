import { eq, inArray } from 'drizzle-orm';

import type { DrizzleDb } from '@/db/client';
import { menuItem } from '@/db/schema/menu';
import { order, orderItem } from '@/db/schema/orders';
import { restaurantTable, tableGroupMember } from '@/db/schema/tables';
import type { ItemCategory, ItemVariant } from '@/lib/money/types';

export type { ItemCategory, ItemVariant };

export interface KitchenTicket {
  orderId: string;
  shortCode: string;
  tableCode: string | null;
  orderType: 'dine_in' | 'takeaway';
  withTupper: boolean;
  paidAt: string;
  items: Array<{
    name: string;
    category: ItemCategory;
    variant: ItemVariant;
    quantity: number;
  }>;
}

export class KitchenService {
  constructor(private db: DrizzleDb) {}

  async listInKitchen(): Promise<KitchenTicket[]> {
    const orders = await this.db
      .select({
        id: order.id,
        shortCode: order.shortCode,
        orderType: order.orderType,
        tableGroupId: order.tableGroupId,
        paidAt: order.paidAt,
      })
      .from(order)
      .where(eq(order.status, 'in_kitchen'))
      .orderBy(order.paidAt);

    if (orders.length === 0) return [];

    const orderIds = orders.map((o) => o.id);

    const items = await this.db
      .select({
        orderId: orderItem.orderId,
        name: menuItem.name,
        category: menuItem.category,
        variant: orderItem.variant,
        withTupper: orderItem.withTupper,
        quantity: orderItem.quantity,
      })
      .from(orderItem)
      .innerJoin(menuItem, eq(orderItem.menuItemId, menuItem.id))
      .where(inArray(orderItem.orderId, orderIds));

    const tableGroupIds = orders
      .filter((o) => o.tableGroupId !== null)
      .map((o) => o.tableGroupId as number);

    const tableCodeMap = new Map<number, string>();
    if (tableGroupIds.length > 0) {
      const tableRows = await this.db
        .select({
          tableGroupId: tableGroupMember.tableGroupId,
          code: restaurantTable.code,
        })
        .from(tableGroupMember)
        .innerJoin(restaurantTable, eq(tableGroupMember.tableId, restaurantTable.id))
        .where(inArray(tableGroupMember.tableGroupId, tableGroupIds));

      for (const row of tableRows) {
        tableCodeMap.set(row.tableGroupId, row.code);
      }
    }

    const itemsByOrder = new Map<string, typeof items>();
    for (const item of items) {
      const arr = itemsByOrder.get(item.orderId) ?? [];
      arr.push(item);
      itemsByOrder.set(item.orderId, arr);
    }

    return orders.map((o) => {
      const orderItems = itemsByOrder.get(o.id) ?? [];
      const withTupper = orderItems.some((i) => i.withTupper);
      const tableCode = o.tableGroupId ? (tableCodeMap.get(o.tableGroupId) ?? null) : null;

      return {
        orderId: o.id,
        shortCode: o.shortCode,
        tableCode,
        orderType: o.orderType as 'dine_in' | 'takeaway',
        withTupper,
        paidAt: (o.paidAt ?? new Date()).toISOString(),
        items: orderItems.map((i) => ({
          name: i.name,
          category: i.category as ItemCategory,
          variant: i.variant as ItemVariant,
          quantity: i.quantity,
        })),
      };
    });
  }

  async getTicket(orderId: string): Promise<KitchenTicket | null> {
    const [orderRow] = await this.db
      .select({
        id: order.id,
        shortCode: order.shortCode,
        orderType: order.orderType,
        tableGroupId: order.tableGroupId,
        paidAt: order.paidAt,
      })
      .from(order)
      .where(eq(order.id, orderId));

    if (!orderRow) return null;

    const items = await this.db
      .select({
        orderId: orderItem.orderId,
        name: menuItem.name,
        category: menuItem.category,
        variant: orderItem.variant,
        withTupper: orderItem.withTupper,
        quantity: orderItem.quantity,
      })
      .from(orderItem)
      .innerJoin(menuItem, eq(orderItem.menuItemId, menuItem.id))
      .where(eq(orderItem.orderId, orderId));

    let tableCode: string | null = null;
    if (orderRow.tableGroupId) {
      const [tableRow] = await this.db
        .select({ code: restaurantTable.code })
        .from(restaurantTable)
        .innerJoin(tableGroupMember, eq(tableGroupMember.tableId, restaurantTable.id))
        .where(eq(tableGroupMember.tableGroupId, orderRow.tableGroupId))
        .limit(1);
      tableCode = tableRow?.code ?? null;
    }

    const withTupper = items.some((i) => i.withTupper);

    return {
      orderId: orderRow.id,
      shortCode: orderRow.shortCode,
      tableCode,
      orderType: orderRow.orderType as 'dine_in' | 'takeaway',
      withTupper,
      paidAt: (orderRow.paidAt ?? new Date()).toISOString(),
      items: items.map((i) => ({
        name: i.name,
        category: i.category as ItemCategory,
        variant: i.variant as ItemVariant,
        quantity: i.quantity,
      })),
    };
  }
}
