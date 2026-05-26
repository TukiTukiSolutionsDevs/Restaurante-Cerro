import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, types } from "pg";

import * as schema from "./schema";

// Parse bigint (INT8, OID 20) as JS number.
// Safe: nuestros IDs son bigserial pero siempre < 2^53 en este MVP.
// Si llegamos cerca, migrar a BigInt o cambiar a int4.
types.setTypeParser(20, (val) => parseInt(val, 10));

const globalForDb = globalThis as unknown as { _pgPool?: Pool };

const pool =
  globalForDb._pgPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb._pgPool = pool;
}

export const db = drizzle(pool, { schema });
export { pool };
export type DrizzleDb = typeof db;
