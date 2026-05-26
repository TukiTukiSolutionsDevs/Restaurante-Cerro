import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import {
  orderItemVariantEnum,
  orderStatusEnum,
  orderTypeEnum,
  paymentMethodEnum,
} from "./enums";
import { dailyMenu, menuItem } from "./menu";
import { staffUser } from "./staff";
import { tableGroup } from "./tables";

/**
 * Customer order. UUID PK for time-safe public exposure.
 * NOTE: uses gen_random_uuid() (v4) — swap to app-generated UUID v7 post-MVP.
 */
export const order = pgTable(
  "order",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    shortCode: varchar("short_code", { length: 4 }).notNull(),
    status: orderStatusEnum("status").notNull().default("pending"),
    orderType: orderTypeEnum("order_type").notNull(),
    dailyMenuId: bigint("daily_menu_id", { mode: "number" })
      .notNull()
      .references(() => dailyMenu.id, { onDelete: "restrict" }),
    tableGroupId: bigint("table_group_id", { mode: "number" }).references(
      () => tableGroup.id,
      { onDelete: "restrict" },
    ),
    totalCents: integer("total_cents").notNull(),
    qrToken: text("qr_token").notNull().unique(),
    qrExpiresAt: timestamp("qr_expires_at", { withTimezone: true }).notNull(),
    qrConsumedAt: timestamp("qr_consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    paidByCashierId: bigint("paid_by_cashier_id", { mode: "number" }).references(
      () => staffUser.id,
      { onDelete: "restrict" },
    ),
    paymentMethod: paymentMethodEnum("payment_method"),
    paymentReference: varchar("payment_reference", { length: 32 }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelReason: varchar("cancel_reason", { length: 200 }),
  },
  (t) => [
    check("order_total_cents_positive", sql`${t.totalCents} >= 0`),
    index("order_short_code_idx").on(t.shortCode),
    index("order_status_created_at_idx").on(t.status, t.createdAt),
    index("order_table_group_status_idx").on(t.tableGroupId, t.status),
  ],
);

/** One line in an order. unit_price_cents is frozen at order creation time. */
export const orderItem = pgTable(
  "order_item",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => order.id, { onDelete: "cascade" }),
    menuItemId: bigint("menu_item_id", { mode: "number" })
      .notNull()
      .references(() => menuItem.id, { onDelete: "restrict" }),
    variant: orderItemVariantEnum("variant").notNull(),
    withTupper: boolean("with_tupper").notNull().default(false),
    quantity: integer("quantity").notNull(),
    unitPriceCents: integer("unit_price_cents").notNull(),
  },
  (t) => [
    check("order_item_quantity_min", sql`${t.quantity} >= 1`),
    check("order_item_unit_price_min", sql`${t.unitPriceCents} >= 0`),
  ],
);
