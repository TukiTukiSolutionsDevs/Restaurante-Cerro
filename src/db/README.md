# src/db

Drizzle ORM schema, migrations, and seed for Restaurante Cerro.

## Setup

### 1. Start the dev database

```bash
docker compose -f docker/docker-compose.dev.yml up -d db
```

The `db` service runs `postgres:16-alpine` on port 5432 (internal to Docker network).  
Exposed to the host on `localhost:5432` in the dev override.

### 2. Configure the connection

```bash
cp .env.example .env.local
# Set DATABASE_URL=postgres://postgres:postgres@localhost:5432/restaurante_cerro
```

### 3. Generate and apply migrations

```bash
# Generate SQL migration from schema changes
pnpm db:generate

# Push schema directly to the dev DB (no migration file — use for local iteration)
pnpm db:push

# Or apply the committed migration files via psql / drizzle migrate:
# psql $DATABASE_URL -f src/db/migrations/0000_initial.sql
```

### 4. Seed development data

```bash
pnpm db:seed
```

Inserts (idempotent — safe to run multiple times):
- 1 admin staff user (PIN from `SEED_ADMIN_PIN` env var, default `543210`)
- 30 restaurant tables: M01–M30, 6×5 grid
- Today's `daily_menu` row in `draft` status

> **Dev PIN:** `543210` (set `SEED_ADMIN_PIN` in `.env.local` to override).  
> Never commit real PINs. The fallback PIN is documented here only for local dev.

### 5. Browse with Drizzle Studio

```bash
pnpm db:studio
```

Opens a browser-based table inspector at `https://local.drizzle.studio`.

## Schema files

| File | Tables |
|------|--------|
| `schema/enums.ts` | All PG enums |
| `schema/menu.ts` | `daily_menu`, `menu_item`, `combo_config` |
| `schema/tables.ts` | `restaurant_table`, `table_group`, `table_group_member` |
| `schema/orders.ts` | `order`, `order_item` |
| `schema/staff.ts` | `staff_user`, `staff_session` |
| `schema/audit.ts` | `audit_log` |
| `schema/settings.ts` | `app_settings` (singleton) |
| `schema/index.ts` | Re-exports + Drizzle `relations()` |

## Migration workflow

1. Edit schema files.
2. `pnpm db:generate` — drizzle-kit outputs a new SQL file in `migrations/`.
3. Review the SQL diff.
4. Commit the migration file alongside the schema change.
5. In production: apply via `psql $DATABASE_URL -f src/db/migrations/<file>.sql`.

## Notes

- `order.id` uses `gen_random_uuid()` (UUID v4) for now. Swap to app-generated UUID v7 post-MVP.
- Partial unique index on `table_group_member(table_id) WHERE closed_at IS NULL` is enforced in the service layer for MVP. Add a DB-level partial unique index in a follow-up migration.
- All money is stored as `integer` cents. Never use floats in money paths.
