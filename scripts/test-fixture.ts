/**
 * scripts/test-fixture.ts
 *
 * Pobla el DB con datos completos para pruebas E2E:
 *  - Abre el menú del día con items por categoría + combo_config
 *  - Crea cajero "Lucía"   (PIN 742856)
 *  - Crea mozo    "Pedro"  (PIN 638491)
 *  - Setea kitchen device PIN (PIN 123890)
 *
 * Idempotente: ON CONFLICT DO NOTHING / updates.
 *
 * Run:  pnpm tsx scripts/test-fixture.ts
 */

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv();

import argon2 from "argon2";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "../src/db/schema";

const { dailyMenu, menuItem, comboConfig, staffUser, appSettings } = schema;

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

async function hashPin(pin: string): Promise<string> {
  return argon2.hash(pin, { type: argon2.argon2id });
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, { schema });

  console.log("\n▶ Test fixture — Restaurante Cerro\n");

  // 1) Asegurar daily_menu de hoy (puede existir como draft del seed)
  const today = todayDate();
  let menu = await db
    .select()
    .from(dailyMenu)
    .where(eq(dailyMenu.serviceDate, today))
    .then((rows) => rows[0]);

  if (!menu) {
    const inserted = await db
      .insert(dailyMenu)
      .values({ serviceDate: today, status: "draft" })
      .returning();
    menu = inserted[0]!;
    console.log(`  daily_menu:      +created (id=${menu.id})`);
  } else {
    console.log(`  daily_menu:      ~exists (id=${menu.id}, status=${menu.status})`);
  }

  // 2) Items del menú (entradas, segundos, bebidas, postres)
  const items = [
    { category: "starter" as const, name: "Sopa criolla", description: "Fideo, carne, leche y un toque picante", sortOrder: 1 },
    { category: "starter" as const, name: "Caldo de gallina", description: "Caldo concentrado, papa, presa y huevo", sortOrder: 2 },
    { category: "starter" as const, name: "Crema de zapallo", description: "Suavecita, con crutones y queso", sortOrder: 3 },
    { category: "main" as const, name: "Ají de gallina", description: "Pollo deshilachado en crema de ají, papa, huevo", sortOrder: 1 },
    { category: "main" as const, name: "Lomo saltado", description: "Lomo al wok con cebolla, tomate y papas fritas", sortOrder: 2 },
    { category: "main" as const, name: "Arroz con pollo", description: "Arroz verde con culantro y zarza criolla", sortOrder: 3 },
    { category: "main" as const, name: "Seco de res", description: "Res guisada en culantro con frejol canario", sortOrder: 4 },
    { category: "drink" as const, name: "Chicha morada", description: "Vaso grande, casera del día", sortOrder: 1, priceCents: 300 },
    { category: "drink" as const, name: "Limonada frozen", description: "Con hierbabuena", sortOrder: 2, priceCents: 400 },
    { category: "drink" as const, name: "Inca Kola 500ml", description: "Botella personal", sortOrder: 3, priceCents: 500 },
    { category: "dessert" as const, name: "Arroz con leche", description: "Con canela y un toque de pisco", sortOrder: 1, priceCents: 400 },
    { category: "dessert" as const, name: "Mazamorra morada", description: "Espesita, con frutos secos", sortOrder: 2, priceCents: 400 },
  ];

  const existingItems = await db
    .select({ id: menuItem.id, name: menuItem.name })
    .from(menuItem)
    .where(eq(menuItem.dailyMenuId, menu.id));
  const existingNames = new Set(existingItems.map((r) => r.name));

  let itemsInserted = 0;
  for (const it of items) {
    if (existingNames.has(it.name)) continue;
    await db.insert(menuItem).values({
      dailyMenuId: menu.id,
      category: it.category,
      name: it.name,
      description: it.description,
      sortOrder: it.sortOrder,
      priceCents: it.priceCents ?? null,
      isAvailable: true,
    });
    itemsInserted++;
  }
  console.log(`  menu_items:      +${itemsInserted} inserted  ~${items.length - itemsInserted} skipped`);

  // 3) Combo config (S/13 mesa · S/15 llevar · +S/2 tupper menú · +S/1 tupper parcial · S/6 solo entrada · S/10 solo segundo)
  // UPSERT — fuerza valores correctos en cents (corrige datos potencialmente erróneos del admin UI)
  await db.execute(sql`
    INSERT INTO combo_config (
      daily_menu_id,
      dine_in_price_cents, takeaway_price_cents,
      tupper_full_price_cents, tupper_partial_price_cents,
      partial_starter_price_cents, partial_main_price_cents
    )
    VALUES (${menu.id}, 1300, 1500, 200, 100, 600, 1000)
    ON CONFLICT (daily_menu_id) DO UPDATE SET
      dine_in_price_cents = 1300,
      takeaway_price_cents = 1500,
      tupper_full_price_cents = 200,
      tupper_partial_price_cents = 100,
      partial_starter_price_cents = 600,
      partial_main_price_cents = 1000
  `);
  console.log("  combo_config:    ✓ upserted (cents: 1300/1500/200/100/600/1000)");

  // 3b) Cleanup: borrar items basura de pruebas previas (nombres muy cortos o sin descripción real)
  // y resetear órdenes pending para liberar mesas
  await db.execute(sql`
    DELETE FROM order_item WHERE order_id IN (
      SELECT id FROM "order" WHERE status IN ('pending','cancelled')
    )
  `);
  await db.execute(sql`DELETE FROM "order" WHERE status IN ('pending','cancelled')`);
  await db.execute(sql`
    DELETE FROM menu_item
    WHERE daily_menu_id = ${menu.id}
      AND LENGTH(name) < 5
      AND NOT EXISTS (SELECT 1 FROM order_item oi WHERE oi.menu_item_id = menu_item.id)
  `);
  console.log("  cleanup:         ✓ orders pending+cancelled + items basura");

  // 4) Abrir el menú (si está draft)
  if (menu.status !== "opened") {
    await db
      .update(dailyMenu)
      .set({ status: "opened", openedAt: new Date() })
      .where(eq(dailyMenu.id, menu.id));
    console.log("  daily_menu:      ✓ opened");
  } else {
    console.log("  daily_menu:      ~already opened");
  }

  // 5) Staff: cajero Lucía (PIN 742856) y mozo Pedro (PIN 638491)
  const staff: Array<{ role: "cashier" | "waiter"; displayName: string; pin: string }> = [
    { role: "cashier", displayName: "Lucía Mamani", pin: "742856" },
    { role: "waiter", displayName: "Pedro Quispe", pin: "638491" },
  ];

  let staffInserted = 0;
  for (const s of staff) {
    const exists = await db
      .select({ id: staffUser.id })
      .from(staffUser)
      .where(eq(staffUser.displayName, s.displayName))
      .then((r) => r[0]);
    if (exists) continue;
    const pinHash = await hashPin(s.pin);
    await db.insert(staffUser).values({
      role: s.role,
      displayName: s.displayName,
      pinHash,
      isActive: true,
    });
    staffInserted++;
  }
  console.log(`  staff_user:      +${staffInserted} inserted  ~${staff.length - staffInserted} skipped`);

  // 6) Kitchen device PIN (123890) — singleton row id=1
  const kitchenPin = "123890";
  const kitchenHash = await hashPin(kitchenPin);
  await db.execute(sql`
    INSERT INTO app_settings (id, kitchen_device_pin_hash)
    VALUES (1, ${kitchenHash})
    ON CONFLICT (id) DO UPDATE SET kitchen_device_pin_hash = EXCLUDED.kitchen_device_pin_hash
  `);
  console.log(`  app_settings:    ✓ kitchen PIN set (${kitchenPin})`);

  console.log("\n✔ Test fixture ready\n");
  console.log("  Login PINs:");
  console.log("    admin   → 543210   (de seed)");
  console.log("    cajero  → 742856   (Lucía)");
  console.log("    mozo    → 638491   (Pedro)");
  console.log("    cocina  → 123890   (device pair)\n");

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
