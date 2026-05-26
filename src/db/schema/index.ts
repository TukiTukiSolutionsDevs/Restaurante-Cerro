export * from "./audit";
export * from "./enums";
export * from "./menu";
export * from "./orders";
export * from "./settings";
export * from "./staff";
export * from "./tables";

import { relations } from "drizzle-orm";

import { auditLog } from "./audit";
import { comboConfig, dailyMenu, menuItem, menuSession } from "./menu";
import { order, orderItem } from "./orders";
import { staffSession, staffUser } from "./staff";
import { restaurantTable, tableGroup, tableGroupMember } from "./tables";

export const dailyMenuRelations = relations(dailyMenu, ({ many, one }) => ({
  menuItems: many(menuItem),
  comboConfig: one(comboConfig, {
    fields: [dailyMenu.id],
    references: [comboConfig.dailyMenuId],
  }),
  orders: many(order),
  sessions: many(menuSession),
}));

export const menuSessionRelations = relations(menuSession, ({ one }) => ({
  dailyMenu: one(dailyMenu, {
    fields: [menuSession.dailyMenuId],
    references: [dailyMenu.id],
  }),
  openedBy: one(staffUser, {
    fields: [menuSession.openedByActorId],
    references: [staffUser.id],
    relationName: "menu_session_opened_by",
  }),
  closedBy: one(staffUser, {
    fields: [menuSession.closedByActorId],
    references: [staffUser.id],
    relationName: "menu_session_closed_by",
  }),
}));

export const menuItemRelations = relations(menuItem, ({ one, many }) => ({
  dailyMenu: one(dailyMenu, {
    fields: [menuItem.dailyMenuId],
    references: [dailyMenu.id],
  }),
  orderItems: many(orderItem),
}));

export const comboConfigRelations = relations(comboConfig, ({ one }) => ({
  dailyMenu: one(dailyMenu, {
    fields: [comboConfig.dailyMenuId],
    references: [dailyMenu.id],
  }),
}));

export const restaurantTableRelations = relations(
  restaurantTable,
  ({ many }) => ({
    tableGroupMembers: many(tableGroupMember),
  }),
);

export const tableGroupRelations = relations(tableGroup, ({ many }) => ({
  tableGroupMembers: many(tableGroupMember),
  orders: many(order),
}));

export const tableGroupMemberRelations = relations(
  tableGroupMember,
  ({ one }) => ({
    tableGroup: one(tableGroup, {
      fields: [tableGroupMember.tableGroupId],
      references: [tableGroup.id],
    }),
    restaurantTable: one(restaurantTable, {
      fields: [tableGroupMember.tableId],
      references: [restaurantTable.id],
    }),
  }),
);

export const orderRelations = relations(order, ({ one, many }) => ({
  orderItems: many(orderItem),
  tableGroup: one(tableGroup, {
    fields: [order.tableGroupId],
    references: [tableGroup.id],
  }),
  dailyMenu: one(dailyMenu, {
    fields: [order.dailyMenuId],
    references: [dailyMenu.id],
  }),
  paidByCashier: one(staffUser, {
    fields: [order.paidByCashierId],
    references: [staffUser.id],
  }),
}));

export const orderItemRelations = relations(orderItem, ({ one }) => ({
  order: one(order, {
    fields: [orderItem.orderId],
    references: [order.id],
  }),
  menuItem: one(menuItem, {
    fields: [orderItem.menuItemId],
    references: [menuItem.id],
  }),
}));

export const staffUserRelations = relations(staffUser, ({ many }) => ({
  sessions: many(staffSession),
  paidOrders: many(order),
  auditLogs: many(auditLog),
}));

export const staffSessionRelations = relations(staffSession, ({ one }) => ({
  staffUser: one(staffUser, {
    fields: [staffSession.staffUserId],
    references: [staffUser.id],
  }),
}));

export const auditLogRelations = relations(auditLog, ({ one }) => ({
  staffUser: one(staffUser, {
    fields: [auditLog.actorId],
    references: [staffUser.id],
  }),
}));
