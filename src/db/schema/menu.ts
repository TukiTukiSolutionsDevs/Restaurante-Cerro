import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  check,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

import { dailyMenuStatusEnum, itemCategoryEnum } from "./enums";
import { staffUser } from "./staff";

/** One row per calendar service day. Tracks menu lifecycle: draft → opened → closed. */
export const dailyMenu = pgTable("daily_menu", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  serviceDate: date("service_date").notNull().unique(),
  status: dailyMenuStatusEnum("status").notNull().default("draft"),
  openedAt: timestamp("opened_at", { withTimezone: true }),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/** A single dish or drink/dessert offered in a daily_menu. price_cents is required for drink/dessert. */
export const menuItem = pgTable(
  "menu_item",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    dailyMenuId: bigint("daily_menu_id", { mode: "number" })
      .notNull()
      .references(() => dailyMenu.id, { onDelete: "restrict" }),
    category: itemCategoryEnum("category").notNull(),
    name: varchar("name", { length: 80 }).notNull(),
    description: varchar("description", { length: 200 }),
    isAvailable: boolean("is_available").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    priceCents: integer("price_cents"),
    /** Filename of the uploaded image inside the uploads volume (e.g. "42.jpg").
     *  Null = no image, render placeholder. The /api/images/<filename> route serves it. */
    imagePath: varchar("image_path", { length: 200 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check("menu_item_price_cents_positive", sql`${t.priceCents} IS NULL OR ${t.priceCents} > 0`),
    index("menu_item_daily_menu_sort_idx").on(t.dailyMenuId, t.sortOrder),
  ],
);

/** Combo pricing for a specific service day. One row per day (enforced by unique FK). */
export const comboConfig = pgTable(
  "combo_config",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    dailyMenuId: bigint("daily_menu_id", { mode: "number" })
      .notNull()
      .unique()
      .references(() => dailyMenu.id, { onDelete: "restrict" }),
    dineInPriceCents: integer("dine_in_price_cents").notNull(),
    takeawayPriceCents: integer("takeaway_price_cents").notNull(),
    tupperFullPriceCents: integer("tupper_full_price_cents")
      .notNull()
      .default(200),
    tupperPartialPriceCents: integer("tupper_partial_price_cents")
      .notNull()
      .default(100),
    partialStarterPriceCents: integer("partial_starter_price_cents").notNull(),
    partialMainPriceCents: integer("partial_main_price_cents").notNull(),
  },
  (t) => [
    check(
      "combo_config_dine_in_positive",
      sql`${t.dineInPriceCents} > 0`,
    ),
    check(
      "combo_config_takeaway_positive",
      sql`${t.takeawayPriceCents} > 0`,
    ),
    check(
      "combo_config_partial_starter_positive",
      sql`${t.partialStarterPriceCents} > 0`,
    ),
    check(
      "combo_config_partial_main_positive",
      sql`${t.partialMainPriceCents} > 0`,
    ),
  ],
);

/**
 * Each open→close cycle of a daily_menu. Allows reopening a closed day
 * (e.g. unplanned evening event) as a new shift, preserving the timeline
 * of the previous shifts for audit and per-shift reporting.
 */
export const menuSession = pgTable(
  "menu_session",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    dailyMenuId: bigint("daily_menu_id", { mode: "number" })
      .notNull()
      .references(() => dailyMenu.id, { onDelete: "restrict" }),
    shiftNumber: integer("shift_number").notNull(),
    openedAt: timestamp("opened_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    openedByActorId: bigint("opened_by_actor_id", { mode: "number" })
      .notNull()
      .references(() => staffUser.id, { onDelete: "restrict" }),
    closedByActorId: bigint("closed_by_actor_id", { mode: "number" }).references(
      () => staffUser.id,
      { onDelete: "restrict" },
    ),
    notes: text("notes"),
  },
  (t) => [
    uniqueIndex("menu_session_daily_shift_idx").on(
      t.dailyMenuId,
      t.shiftNumber,
    ),
    check("menu_session_shift_positive", sql`${t.shiftNumber} > 0`),
  ],
);
