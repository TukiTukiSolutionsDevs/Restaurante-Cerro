import {
  bigint,
  bigserial,
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { staffRoleEnum } from "./enums";

/** Restaurant staff member with a role-based PIN for authentication. */
export const staffUser = pgTable("staff_user", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  role: staffRoleEnum("role").notNull(),
  displayName: varchar("display_name", { length: 80 }).notNull(),
  pinHash: text("pin_hash").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
});

/** Active session for a staff member. Expires after the role's TTL (8 h cashier/waiter, 12 h admin). */
export const staffSession = pgTable(
  "staff_session",
  {
  id: uuid("id").primaryKey().defaultRandom(),
  staffUserId: bigint("staff_user_id", { mode: "number" })
    .notNull()
    .references(() => staffUser.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  userAgent: varchar("user_agent", { length: 256 }),
  ip: varchar("ip", { length: 45 }),
  },
  (t) => [index("staff_session_expires_at_idx").on(t.expiresAt)],
);
