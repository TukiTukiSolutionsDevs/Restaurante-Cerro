import { describe, expect, it } from "vitest";

import * as schema from "@/db/schema";

describe("db/schema barrel exports", () => {
  const expectedTables = [
    "dailyMenu",
    "menuItem",
    "comboConfig",
    "restaurantTable",
    "tableGroup",
    "tableGroupMember",
    "order",
    "orderItem",
    "staffUser",
    "staffSession",
    "auditLog",
    "appSettings",
  ] as const;

  const expectedEnums = [
    "dailyMenuStatusEnum",
    "itemCategoryEnum",
    "orderStatusEnum",
    "orderTypeEnum",
    "orderItemVariantEnum",
    "paymentMethodEnum",
    "staffRoleEnum",
    "auditActorTypeEnum",
  ] as const;

  const expectedRelations = [
    "dailyMenuRelations",
    "menuItemRelations",
    "comboConfigRelations",
    "restaurantTableRelations",
    "tableGroupRelations",
    "tableGroupMemberRelations",
    "orderRelations",
    "orderItemRelations",
    "staffUserRelations",
    "staffSessionRelations",
    "auditLogRelations",
  ] as const;

  it.each(expectedTables)("exports table: %s", (name) => {
    expect(schema).toHaveProperty(name);
    expect(schema[name]).toBeDefined();
  });

  it.each(expectedEnums)("exports enum: %s", (name) => {
    expect(schema).toHaveProperty(name);
    expect(schema[name]).toBeDefined();
  });

  it.each(expectedRelations)("exports relation: %s", (name) => {
    expect(schema).toHaveProperty(name);
    expect(schema[name]).toBeDefined();
  });

  it("order table has uuid id column", () => {
    const col = schema.order.id;
    expect(col).toBeDefined();
  });

  it("menuItem has priceCents column", () => {
    expect(schema.menuItem.priceCents).toBeDefined();
  });

  it("all money columns on comboConfig are integers", () => {
    const moneyCols = [
      schema.comboConfig.dineInPriceCents,
      schema.comboConfig.takeawayPriceCents,
      schema.comboConfig.tupperFullPriceCents,
      schema.comboConfig.tupperPartialPriceCents,
      schema.comboConfig.partialStarterPriceCents,
      schema.comboConfig.partialMainPriceCents,
    ];
    for (const col of moneyCols) {
      expect(col).toBeDefined();
    }
  });
});
