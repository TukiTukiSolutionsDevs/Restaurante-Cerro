import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

import { auditActorTypeEnum } from "./enums";

/** Immutable audit trail for all significant mutations (payment confirms, cancellations, staff CRUD). */
export const auditLog = pgTable(
  "audit_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    actorType: auditActorTypeEnum("actor_type").notNull(),
    actorId: bigint("actor_id", { mode: "number" }),
    action: varchar("action", { length: 64 }).notNull(),
    entity: varchar("entity", { length: 64 }).notNull(),
    entityId: text("entity_id"),
    payload: jsonb("payload").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("audit_log_created_at_idx").on(t.createdAt)],
);
