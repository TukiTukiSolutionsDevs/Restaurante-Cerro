import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  check,
  integer,
  pgTable,
  primaryKey,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

/** A physical table in the restaurant. position_x/y drive the floor layout grid. */
export const restaurantTable = pgTable(
  "restaurant_table",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    code: varchar("code", { length: 8 }).notNull().unique(),
    capacity: integer("capacity").notNull().default(1),
    positionX: integer("position_x").notNull().default(0),
    positionY: integer("position_y").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
  },
  (t) => [check("restaurant_table_capacity_min", sql`${t.capacity} >= 1`)],
);

/** Groups one or more tables for a shared order session (e.g. large party). Closed when the session ends. */
export const tableGroup = pgTable("table_group", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  name: varchar("name", { length: 32 }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
});

/**
 * Junction between table_group and restaurant_table.
 * A table can only belong to one OPEN group at a time — enforced in the service layer for MVP.
 * (Partial unique index WHERE closed_at IS NULL requires a manual migration post-MVP.)
 */
export const tableGroupMember = pgTable(
  "table_group_member",
  {
    tableGroupId: bigint("table_group_id", { mode: "number" })
      .notNull()
      .references(() => tableGroup.id, { onDelete: "cascade" }),
    tableId: bigint("table_id", { mode: "number" })
      .notNull()
      .references(() => restaurantTable.id, { onDelete: "restrict" }),
  },
  (t) => [primaryKey({ columns: [t.tableGroupId, t.tableId] })],
);
