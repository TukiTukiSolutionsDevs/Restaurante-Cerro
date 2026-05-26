import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv();

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { fileURLToPath } from "url";

import * as schema from "./schema";

const { restaurantTable, staffUser, dailyMenu } = schema;

async function hashPin(pin: string): Promise<string> {
  const argon2 = await import("argon2");
  return argon2.hash(pin, { type: argon2.argon2id });
}

function color(code: number, text: string) {
  return `\x1b[${code}m${text}\x1b[0m`;
}
const green = (t: string) => color(32, t);
const yellow = (t: string) => color(33, t);
const cyan = (t: string) => color(36, t);

export async function seed() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, { schema });

  console.log(cyan("\n▶ Restaurante Cerro — seed\n"));

  // PIN read from env; fallback for local dev only.
  const adminPin = process.env.SEED_ADMIN_PIN ?? "543210";
  const pinHash = await hashPin(adminPin);

  const staffResult = await db
    .insert(staffUser)
    .values({
      role: "admin",
      displayName: "Admin Dev",
      pinHash,
      isActive: true,
    })
    .onConflictDoNothing()
    .returning({ id: staffUser.id });

  const staffInserted = staffResult.length;
  const staffSkipped = staffInserted === 0 ? 1 : 0;
  console.log(
    `  staff_user:        ${green(`+${staffInserted} inserted`)}  ${yellow(`~${staffSkipped} skipped`)}`,
  );

  // Tables M01–M30 in a 6×5 grid
  const tables = Array.from({ length: 30 }, (_, i) => {
    const num = i + 1;
    return {
      code: `M${String(num).padStart(2, "0")}`,
      capacity: 1,
      positionX: i % 6,
      positionY: Math.floor(i / 6),
      isActive: true,
    };
  });

  const tableResult = await db
    .insert(restaurantTable)
    .values(tables)
    .onConflictDoNothing()
    .returning({ id: restaurantTable.id });

  const tablesInserted = tableResult.length;
  const tablesSkipped = 30 - tablesInserted;
  console.log(
    `  restaurant_table:  ${green(`+${tablesInserted} inserted`)}  ${yellow(`~${tablesSkipped} skipped`)}`,
  );

  const today = new Date().toISOString().slice(0, 10);
  const menuResult = await db
    .insert(dailyMenu)
    .values({ serviceDate: today, status: "draft" })
    .onConflictDoNothing()
    .returning({ id: dailyMenu.id });

  const menuInserted = menuResult.length;
  const menuSkipped = menuInserted === 0 ? 1 : 0;
  console.log(
    `  daily_menu:        ${green(`+${menuInserted} inserted`)}  ${yellow(`~${menuSkipped} skipped`)}`,
  );

  console.log(cyan("\n✔ Seed complete\n"));
  await pool.end();
}

// Auto-run only when executed directly: tsx src/db/seed.ts
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  seed().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
