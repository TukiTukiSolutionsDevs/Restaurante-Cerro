# Spec: `table-management`

**Capability slug:** `table-management`  
**Status:** draft  
**Created:** 2026-05-23  
**Linked change:** `001-mvp-foundation`

---

## 1. Purpose

Manage the ~30 tables in the restaurant. Tables are **personal/individual by default** (capacity 1, single diner), but can be joined into a `table_group` to seat families or larger parties. The system must reflect free / occupied / grouped state in real time so customers, waiters, and admin all see a consistent floor map without storing derived state—avoiding drift between the displayed state and the ground truth held in orders and groups.

---

## 2. Actors

| Actor | Auth | Capabilities |
|---|---|---|
| **Admin** | PIN (6-digit, argon2id) | Define table layout, set code / capacity / position; create persistent named groups; deactivate tables; force-release tables. |
| **Waiter** | PIN (6-digit, argon2id) | Join 2+ free tables on the fly; split active groups (when safe); manually release a table (with confirmation). |
| **Customer** | Anonymous | Select from the free-table list only; cannot create or manage groups. |
| **System** | Internal | Auto-derives table state from order and group records on every read; emits `table_changed` events on mutations. |

---

## 3. Functional Requirements

| ID | Requirement |
|---|---|
| FR-1 | Admin can **create** a table with `code` (e.g. `"M01"`–`"M30"`), `capacity` (default `1`), `position_x`, `position_y` (integer grid cells, 10×10 grid). |
| FR-2 | Admin can **edit** any field of an existing table. |
| FR-3 | Admin can **deactivate** a table (`is_active = false`). If the table is referenced by an open order, admin sees a warning; the table remains visible until that order closes. |
| FR-4 | Waiter can select **2 or more free tables** and **join** them → creates a `table_group` row and the corresponding `table_group_member` rows; the group's representative code is generated as `"G-<code1>+<code2>[+…]"` (e.g. `"G-M03+M04"`); group capacity = sum of member capacities. |
| FR-5 | Waiter can **split** a group → sets `table_group.closed_at = now()`; member tables return to free state (guard: no active order referencing the group). |
| FR-6 | A table that belongs to an open group **cannot** be joined into another group (enforced by partial unique index on `table_group_member` where `closed_at IS NULL`). |
| FR-7 | A group with an order in status `paid` or `in_kitchen` **cannot** be split; UI shows toast "Tiene un pedido activo". |
| FR-8 | Customer-facing free-table list shows only tables where `capacity = 1`, NOT in an active group, and NOT referenced by an active order. |
| FR-9 | Family-size seating requires waiter assistance in MVP—customers cannot create groups themselves. |
| FR-10 | Admin floor-map shows all tables with state coloring: green = free, amber = tentatively reserved, red = occupied, grey = inactive. |
| FR-11 | Waiter floor view allows tap-to-select multiple free tables; an **"Unir mesas"** action button appears when ≥ 2 free tables are selected. |
| FR-12 | Waiter can manually **release** a table (`POST /mozo/tables/:id/release`) with a confirmation dialog; action is written to `audit_log`. |

---

## 4. Table State Derivation

State is **derived on every query**, never persisted, to prevent drift between the display and the ground truth held in `order` and `table_group`.

```
state(table t) =
  inactive          if t.is_active = false
  in_active_group   if EXISTS (
                      SELECT 1 FROM table_group_member tgm
                      JOIN table_group tg ON tg.id = tgm.table_group_id
                      WHERE tgm.table_id = t.id
                        AND tg.closed_at IS NULL
                    )
  tentative         if EXISTS (
                      SELECT 1 FROM "order" o
                      JOIN table_group_member tgm ON tgm.table_group_id = o.table_group_id
                      WHERE tgm.table_id = t.id
                        AND o.status = 'pending'
                        AND o.qr_expires_at > now()
                    )
  occupied          if EXISTS (
                      SELECT 1 FROM "order" o
                      JOIN table_group_member tgm ON tgm.table_group_id = o.table_group_id
                      WHERE tgm.table_id = t.id
                        AND o.status IN ('paid', 'in_kitchen', 'delivered')
                        AND (
                          o.delivered_at IS NULL
                          OR o.delivered_at > now() - INTERVAL '30 minutes'
                        )
                    )
  free              otherwise
```

> **Power-outage safety:** Because state is fully re-derived from relational data, restarting the application after a power outage yields the correct floor map without any cache warming or event replay.

### State transition summary

```
free ──── waiter joins ──────────────────────────────► in_active_group
free ──── customer selects (pending QR) ────────────► tentative
tentative ─ cashier confirms payment ───────────────► occupied
occupied ── delivered + 30 min OR waiter release ───► free
in_active_group ── waiter splits (no active order) ─► free (members)
inactive  (no transitions while is_active = false)
```

---

## 5. Data Model

Tables involved (from `001-mvp-foundation` design §3.2):

**`table`** (SQL: `"table"`)

| Column | Type | Notes |
|---|---|---|
| `id` | `bigserial` PK | |
| `code` | `text` UNIQUE NOT NULL | e.g. `"M14"` |
| `capacity` | `int` NOT NULL DEFAULT 1 | |
| `position_x` | `int` NOT NULL | Integer grid column (0–9) |
| `position_y` | `int` NOT NULL | Integer grid row (0–9) |
| `is_active` | `boolean` NOT NULL DEFAULT true | |

**`table_group`**

| Column | Type | Notes |
|---|---|---|
| `id` | `bigserial` PK | |
| `name` | `text` NULL | Admin label e.g. `"Familia 8 pax"` or auto-generated code |
| `created_at` | `timestamptz` NOT NULL DEFAULT now() | |
| `closed_at` | `timestamptz` NULL | Set on split; NULL = open |

**`table_group_member`**

| Column | Type | Notes |
|---|---|---|
| `table_group_id` | `bigint` FK → `table_group.id` | Composite PK |
| `table_id` | `bigint` FK → `"table".id` | Composite PK |

Constraint: partial unique index `UNIQUE (table_id) WHERE closed_at IS NULL` (enforced via `table_group_member` joined to `table_group`). A table may belong to at most one open group at a time.

**`order`** — references `table_group_id` (nullable; NULL for takeaway). See `001-mvp-foundation` design §3.2 for full schema.

---

## 6. API Contracts

All staff endpoints require a valid `iron-session` cookie with the appropriate role. Public endpoints are rate-limited at the nginx layer.

### Public (no auth)

```
GET /api/tables
```
Returns all active tables with derived state.

Response `200`:
```jsonc
[
  {
    "id": 3,
    "code": "M03",
    "capacity": 1,
    "position": { "x": 2, "y": 0 },
    "state": "free" // "free" | "tentative" | "occupied" | "in_active_group" | "inactive"
  }
]
```

```
GET /api/tables/free
```
Returns only tables where `state = 'free'`. Used by the customer table picker.

Response `200`: same shape, filtered.

### Admin endpoints (`role = admin`)

```
POST /admin/tables
```
Body:
```jsonc
{ "code": "M01", "capacity": 1, "position_x": 0, "position_y": 0 }
```
Response `201`: `{ "id": 1, "code": "M01", ... }`  
Error `409`: code already exists.

```
PATCH /admin/tables/:id
```
Body: any subset of `{ code, capacity, position_x, position_y }`.  
Response `200`: updated table object.  
Error `404`: table not found.

```
POST /admin/tables/:id/deactivate
```
No body.  
Response `200`: `{ "id": 1, "is_active": false, "hasActiveOrder": true|false }`  
Side-effect: if `hasActiveOrder = true`, response includes `"warning": "Mesa tiene un pedido activo"`. Table is deactivated anyway; it stays visible on the floor map until the order closes.

### Waiter endpoints (`role = waiter`)

```
POST /mozo/tables/join
```
Body:
```jsonc
{ "table_ids": [3, 4], "name": "Familia García" }
```
Guards:
- All `table_ids` must exist, be active, and have `state = 'free'`.
- None can already belong to an open group.

Response `201`:
```jsonc
{ "group_id": 7, "code": "G-M03+M04", "capacity": 2 }
```
Error `409`: one or more tables are not free.  
Emits: `NOTIFY table_changed` with `{ tableGroupId: 7, change: "joined" }`.

```
POST /mozo/tables/group/:id/split
```
No body.  
Guard: no order with `table_group_id = :id` in status `paid` or `in_kitchen`.  
Response `200`: `{ "group_id": 7, "closed_at": "<timestamp>" }`  
Error `409`: `{ "code": "GROUP_HAS_ACTIVE_ORDER", "message": "Tiene un pedido activo" }`  
Emits: `NOTIFY table_changed` with `{ tableGroupId: 7, change: "split" }`.

```
POST /mozo/tables/:id/release
```
No body (confirmation happens client-side before calling).  
Guard: table must be in `state = 'occupied'` or `'tentative'`; only safe if the referenced order is in `delivered` or `pending` (not `paid`/`in_kitchen`).  
Response `200`: `{ "table_id": 7, "released_at": "<timestamp>" }`  
Side-effect: writes `audit_log` row `{ action: "table.force_release", entity: "table", entity_id: "7", payload: { waiter_id, previous_state } }`.  
Emits: `NOTIFY table_changed` with `{ tableId: 7, change: "state_changed" }`.

### Response envelope (all staff Server Actions)

```ts
{ ok: true, data: T } | { ok: false, error: { code: string, message: string } }
```

---

## 7. Realtime

**Channel:** `table_changed`  
**Transport:** Postgres `NOTIFY table_changed` → SSE via `GET /api/sse/floor`

**Payload schema:**
```ts
{
  tableId?: number;       // set for single-table events
  groupId?: number;       // set for group events
  change: 'created' | 'updated' | 'joined' | 'split' | 'state_changed' | 'deactivated';
}
```

**Subscribers:**

| Subscriber | SSE endpoint | Reaction |
|---|---|---|
| Waiter floor view | `/api/sse/floor` | Re-fetches `GET /api/tables`; updates `TableGrid` color state. |
| Customer table picker | `/api/sse/floor` | Re-fetches `GET /api/tables/free`; removes or adds table cards. |
| Admin floor map | `/api/sse/floor` | Re-fetches full table list; updates grid overlays. |

Client reconnect follows the pattern defined in `001-mvp-foundation` design §6.4: exponential backoff 1→2→4→8→15→30 s cap; full `queryClient.invalidateQueries(['tables'])` on first successful reconnect.

---

## 8. Floor Map UX

### Admin (PC)

- **Grid:** 10×10 integer cell grid rendered with CSS Grid. Each cell is a droppable zone.
- **Phase 1 (MVP):** Tables are positioned by editing `position_x` / `position_y` in a form; drag-and-drop authoring is deferred post-MVP.
- **Table card:** shows `code`, `capacity`, state badge, and an action menu (Edit / Deactivate).
- **Group overlay:** grouped tables show a coloured border and a shared group label (`"G-M03+M04"`).
- **State colors:** green = free, amber = tentative, red = occupied, grey = inactive.

### Waiter (tablet)

- Same 10×10 grid layout, touch-optimized.
- **Tap** a table card to select it. Selected tables show a highlight ring.
- **"Unir mesas"** primary button appears in a bottom action bar when ≥ 2 free tables are selected.
- **"Separar grupo"** appears when a grouped table is tapped and the group has no active order.
- **"Liberar mesa"** appears in the single-table action sheet; triggers a confirmation dialog before calling the release endpoint.
- Locked groups (active order) show a lock icon; split action is disabled with tooltip "Tiene un pedido activo".

### Customer (mobile)

- **No map in MVP.** Customer sees a scrollable list of free tables only.
- Each list item shows: table code (`"M07"`) and capacity (`"1 persona"`).
- Selecting an occupied or grouped table is prevented; if the table becomes occupied after selection and before QR generation, the server returns `TABLE_NOT_AVAILABLE` and the customer is prompted: "Esta mesa ya está ocupada, elige otra."

---

## 9. Acceptance Criteria (E2E)

| ID | Scenario | Expected result |
|---|---|---|
| AC-1 | Admin creates 30 tables M01–M30 positioned in a 5×6 grid. | All 30 appear on floor map with `state = free`. |
| AC-2 | Waiter joins M03 + M04. | Both disappear from customer free list; group "G-M03+M04" (cap=2) appears in waiter floor view with amber/green group overlay. |
| AC-3 | Customer selects M07, builds order, pays. | M07 state transitions `free → tentative → occupied` in real time across all open views within 2 s of each event. |
| AC-4 | 30 min after waiter marks M07's order delivered (or waiter taps "Liberar mesa"). | M07 state returns to `free`; appears again in customer free list. |
| AC-5 | Waiter attempts to split group G-M03+M04 while it has a `paid` order. | UI shows toast "Tiene un pedido activo"; split endpoint returns `409 GROUP_HAS_ACTIVE_ORDER`. |
| AC-6 | Admin deactivates M15 while it has an active order. | Warning shown in admin UI; M15 becomes grey on floor map but remains visible; disappears from customer list immediately. |
| AC-7 | Power outage simulation: app restarted mid-service. | Floor map re-derives all states correctly from DB without manual intervention. |

---

## 10. Edge Cases

| Case | Handling |
|---|---|
| Admin deactivates a table with an active order | Table is deactivated; admin sees `"Mesa tiene un pedido activo"` warning. Table stays on floor map (grey) until the order closes. |
| Table belongs to a closed group and a new join is attempted | Allowed; `closed_at IS NOT NULL` records do not block new memberships. |
| Waiter tries to join a table already in an open group | `POST /mozo/tables/join` returns `409`. Client disables the table card for selection and shows "Mesa en grupo". |
| Customer selects a table that becomes occupied between list load and order submit | `POST /api/orders` re-checks table state; returns `TABLE_NOT_AVAILABLE`. Customer is redirected back to table picker. |
| Group with a `delivered` order (past 30 min) | State is re-derived as `free`; split is allowed. |
| Admin tries to use a code that already exists | `POST /admin/tables` returns `409` with `code: "TABLE_CODE_EXISTS"`. |

---

## 11. UI Copy (Spanish, es-PE)

| Context | String |
|---|---|
| Table state — free | "Mesa libre" |
| Table state — occupied | "Mesa ocupada" |
| Table state — tentative | "Reservada" |
| Table state — in group | "En grupo" |
| Table state — inactive | "Desactivada" |
| Waiter action — join | "Unir mesas" |
| Waiter action — split | "Separar grupo" |
| Waiter action — release | "Liberar mesa" |
| Customer error — table taken | "Esta mesa ya está ocupada, elige otra" |
| Split blocked toast | "Tiene un pedido activo" |
| Admin deactivate warning | "Mesa tiene un pedido activo" |
| Confirmation — release | "¿Seguro que deseas liberar esta mesa? El pedido asociado no será cancelado." |
| Group label prefix | "G-" (e.g. "G-M03+M04") |

---

## 12. Out of Scope

- Free-form pixel-perfect drag-and-drop layout editor (Phase 2).
- Time-based reservations or advance booking.
- Per-table static QR codes (each table having its own printed QR linking to a pre-selected table).
- Capacity enforcement beyond display (no hard block on oversized parties).
- Table assignment by waiter zone (all waiters see all tables in MVP).

---

## 13. Implementation Notes

### Service layer

`server/services/tables.ts` exports:

```ts
deriveTableState(tableId: number, db: DrizzleClient): Promise<TableState>
listTablesWithState(db: DrizzleClient): Promise<TableWithState[]>
joinTables(input: { tableIds: number[]; name?: string }, db: DrizzleClient): Promise<TableGroup>
splitGroup(groupId: number, db: DrizzleClient): Promise<void>
releaseTable(tableId: number, actorId: number, db: DrizzleClient): Promise<void>
```

All mutations run inside a single Drizzle transaction. `NOTIFY table_changed` is issued via `db.execute(sql\`SELECT pg_notify('table_changed', ${payload})\`)` within the same transaction so the notification is only delivered if the transaction commits.

### Drizzle schema additions

```ts
// schema.ts
export const table = pgTable('table', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  code: text('code').unique().notNull(),
  capacity: integer('capacity').notNull().default(1),
  positionX: integer('position_x').notNull(),
  positionY: integer('position_y').notNull(),
  isActive: boolean('is_active').notNull().default(true),
});

export const tableGroup = pgTable('table_group', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  name: text('name'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  closedAt: timestamp('closed_at', { withTimezone: true }),
});

export const tableGroupMember = pgTable(
  'table_group_member',
  {
    tableGroupId: bigint('table_group_id', { mode: 'number' })
      .references(() => tableGroup.id)
      .notNull(),
    tableId: bigint('table_id', { mode: 'number' })
      .references(() => table.id)
      .notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.tableGroupId, t.tableId] }) }),
);
```

Partial unique index (raw SQL migration):
```sql
CREATE UNIQUE INDEX table_group_member_one_open_group_per_table
  ON table_group_member (table_id)
  WHERE (
    SELECT closed_at FROM table_group WHERE id = table_group_id
  ) IS NULL;
```

### Auto-free trigger (30-minute rule)

No background job in MVP. State is re-derived on every `GET /api/tables` call. If a periodic sweep is added post-MVP (e.g. a cron every 5 min), it should only emit `NOTIFY table_changed` for tables that crossed the 30-min threshold since the last sweep—no writes to the `table` row.

---

## 14. Linked Capabilities

| Capability | Dependency |
|---|---|
| `order-builder` | Reads `GET /api/tables/free` to present the table picker; submits `table_group_id` on order creation. |
| `cashier-checkout` | Payment confirmation indirectly changes table state (order moves to `paid`). |
| `waiter-console` | Consumes `/api/sse/floor` for live floor map; calls join/split/release endpoints. |
| `admin-panel` | Hosts the table layout editor and group management UI. |
| `realtime-sync` | Provides `table_changed` channel and SSE infrastructure reused here. |

---

## Return Envelope

```jsonc
{
  "status": "ok",
  "artifacts": [
    "openspec/specs/table-management/spec.md"
  ],
  "executive_summary": "La especificación define cómo se crean, unen y liberan las ~30 mesas del restaurante, con estado derivado en tiempo real (libre/reservada/ocupada/en grupo) para que clientes, mozos y admin vean siempre el mismo mapa de sala. Las tablas `table`, `table_group` y `table_group_member` ya existen en el diseño fundacional; esta spec añade los contratos de API, las reglas de negocio de join/split, la lógica SSE y los criterios de aceptación E2E. El siguiente paso recomendado es especificar `order-builder`, que consume directamente la lista de mesas libres.",
  "linked_capabilities": [
    "order-builder",
    "cashier-checkout",
    "waiter-console",
    "admin-panel",
    "realtime-sync"
  ],
  "next_recommended": "order-builder"
}
```
