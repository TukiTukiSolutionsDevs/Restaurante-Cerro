import { pgEnum } from "drizzle-orm/pg-core";

export const dailyMenuStatusEnum = pgEnum("daily_menu_status", [
  "draft",
  "opened",
  "closed",
]);

export const itemCategoryEnum = pgEnum("item_category", [
  "starter",
  "main",
  "drink",
  "dessert",
]);

export const orderStatusEnum = pgEnum("order_status", [
  "pending",
  "paid",
  "in_kitchen",
  "delivered",
  "cancelled",
]);

export const orderTypeEnum = pgEnum("order_type", ["dine_in", "takeaway"]);

export const orderItemVariantEnum = pgEnum("order_item_variant", [
  "full_combo",
  "only_starter",
  "only_main",
  "drink_extra",
  "dessert_extra",
]);

export const paymentMethodEnum = pgEnum("payment_method", ["cash", "yape"]);

export const staffRoleEnum = pgEnum("staff_role", [
  "cashier",
  "waiter",
  "admin",
]);

export const auditActorTypeEnum = pgEnum("audit_actor_type", [
  "staff",
  "system",
  "device",
]);
