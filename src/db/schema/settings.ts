import { sql } from "drizzle-orm";
import {
  check,
  pgTable,
  smallint,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

/** Singleton application settings row. Always id = 1; use INSERT … ON CONFLICT DO UPDATE. */
export const appSettings = pgTable(
  "app_settings",
  {
    id: smallint("id").primaryKey(),
    kitchenDevicePinHash: text("kitchen_device_pin_hash"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [check("app_settings_singleton", sql`${t.id} = 1`)],
);
