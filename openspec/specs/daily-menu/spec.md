# Spec: `daily-menu`

**Status:** draft  
**Created:** 2026-05-23  
**Capability slug:** `daily-menu`  
**Linked capabilities:** `order-builder`, `realtime-sync`, `admin-panel`

---

## 1. Purpose

`daily-menu` is the single source of truth for what is available to eat on a given service day. The admin curates the menu (items, categories, pricing) before service opens. The menu becomes visible to customers only when the admin explicitly "opens" the day. It is hidden (404) in draft state and frozen to new orders once closed. All realtime propagation of availability changes flows through this capability via the `menu_changed` Postgres NOTIFY channel.

---

## 2. Actors

| Actor | Auth | Access level |
|---|---|---|
| **Admin** | PIN auth (`staff_user.role = 'admin'`), `iron-session` cookie | Full CRUD on `daily_menu` and `menu_item`; open/close day; set `combo_config`; toggle availability |
| **Customer** | Anonymous (no auth) | Read-only; only sees `opened` menus with `is_available = true` items |
| **Waiter** | PIN auth (`role = 'waiter'`) | Read-only awareness of current menu state (items, availability) |
| **Cashier** | PIN auth (`role = 'cashier'`) | Read-only; needs item names/prices to display order summaries |
| **Kitchen** | PIN auth (`role = 'kitchen'`, device-pinned) | Read-only; item names appear on kitchen tickets |

---

## 3. Functional Requirements

**FR-1.** Admin can create a `daily_menu` record for a given `service_date`. The database enforces a UNIQUE constraint on `service_date`; attempting to create a second menu for the same date returns HTTP 409 with code `MENU_DATE_CONFLICT`.

**FR-2.** Admin can clone a previous day's menu to today with a single action by supplying `clone_from_date` on the create endpoint. All `menu_item` rows (name, description, category, sort_order) are duplicated into the new `daily_menu`. `is_available` is reset to `true` for all cloned items. `combo_config` is also cloned if it exists for the source date.

**FR-3.** Admin can add `menu_item` rows to a `daily_menu` with the following field constraints:
- `name`: required, 1–80 characters.
- `description`: optional, 0–200 characters.
- `category`: one of `starter` | `main` | `drink` | `dessert`.
- `sort_order`: optional integer; if omitted, defaults to `MAX(sort_order) + 10` within the same `(daily_menu_id, category)` group, enabling gap-based reordering without renumbering.

**FR-4.** Admin can toggle `is_available` per `menu_item`. The server executes an `UPDATE` then emits `NOTIFY menu_changed` with `change_type = 'availability_toggled'`. All subscribed customer SSE connections reflect the change within ≤ 2 s under normal network conditions.

**FR-5.** Admin sets `combo_config` for the day with the following fields (all required, all stored as integer cents, all must be > 0):
- `dine_in_price_cents` — default 1300.
- `takeaway_price_cents` — default 1500.
- `tupper_full_price_cents` — default 200.
- `tupper_partial_price_cents` — default 100.
- `partial_starter_price_cents` — price when customer orders starter only.
- `partial_main_price_cents` — price when customer orders main only.

**FR-6.** The public `GET /api/menu/today` endpoint returns only menus where `opened_at IS NOT NULL AND closed_at IS NULL` (status `opened`). Within that, only `menu_item` rows where `is_available = true` are returned. Any other state returns HTTP 404.

**FR-7.** Admin can close the day via `POST /admin/menu/:id/close`. After closing: `closed_at` is set, the menu transitions to `closed` state, `menu_changed` NOTIFY is emitted with `change_type = 'menu_closed'`, and `POST /api/orders` rejects new order creation with HTTP 409 code `MENU_CLOSED`. Orders already in the pipeline (`pending`, `paid`, `in_kitchen`) continue their lifecycle unaffected.

**FR-8.** A `menu_item` that is referenced by at least one `order_item` row cannot be deleted. The delete endpoint returns HTTP 409 with code `ITEM_REFERENCED`. The admin must instead toggle `is_available = false`.

---

## 4. Non-Functional Requirements

**NFR-1. Read latency.** `GET /api/menu/today` must respond in < 100 ms at p95. Implementation: the Route Handler holds the current menu in a module-level in-memory cache (a typed object keyed by `service_date`). The cache entry is revalidated on every `menu_changed` NOTIFY event received by the realtime bus singleton. On cold start or after cache miss, the handler fetches from Postgres and populates the cache.

**NFR-2. Concurrent admin edits.** If two admin sessions update the same `menu_item` simultaneously, last-write-wins on individual fields (no optimistic locking for MVP). Each mutation writes one row to `audit_log` with `entity = 'menu_item'`, `entity_id`, `action`, and `payload` containing the previous and new values of the changed fields.

**NFR-3. Availability propagation.** From the moment the admin saves a toggle, the `menu_changed` NOTIFY must be emitted within the same DB transaction. SSE subscribers receive the event within ≤ 2 s end-to-end under a load of ≤ 50 concurrent SSE connections.

**NFR-4. Clone performance.** Cloning a full day's menu (up to ~20 items + combo_config) must complete within a single DB transaction in < 500 ms.

---

## 5. State Machine — Daily Menu

```
draft → opened → closed
```

| State | Condition | Visible to customers |
|---|---|---|
| `draft` | `opened_at IS NULL` | No (404) |
| `opened` | `opened_at IS NOT NULL AND closed_at IS NULL` | Yes (available items only) |
| `closed` | `closed_at IS NOT NULL` | No (404); customer sees "Hoy ya cerramos" |

**Transition guards (enforced server-side in `server/services/menu.ts`):**

- `draft → opened`: requires `combo_config` to exist for this `daily_menu_id`. If missing, return HTTP 422 with code `MISSING_COMBO_CONFIG`.
- `opened → closed`: always allowed regardless of item availability state.
- `closed → opened`: **forbidden**. Returns HTTP 409 with code `CANNOT_REOPEN`. Admin must create a new `daily_menu` for the next service day.
- `draft → closed`: **forbidden**. A menu that was never opened cannot be closed.

**Status derivation** (computed, not stored as an enum column — derived from `opened_at` / `closed_at` nullability):

```ts
function menuStatus(menu: { opened_at: Date | null; closed_at: Date | null }): 'draft' | 'opened' | 'closed' {
  if (!menu.opened_at) return 'draft';
  if (!menu.closed_at) return 'opened';
  return 'closed';
}
```

---

## 6. API Contracts

All admin endpoints require a valid `iron-session` cookie with `role = 'admin'`. Missing or invalid session returns HTTP 401. Wrong role returns HTTP 403.

All mutations return `{ ok: true, data } | { ok: false, error: { code: string, message: string } }`.

---

### `GET /api/menu/today`

**Auth:** None (public).  
**Kind:** Route Handler `[RH]`.

**Response 200:**
```ts
{
  menu_id: number;
  service_date: string;          // "YYYY-MM-DD"
  status: "opened";
  combo_config: {
    dine_in_price_cents: number;
    takeaway_price_cents: number;
    tupper_full_price_cents: number;
    tupper_partial_price_cents: number;
    partial_starter_price_cents: number;
    partial_main_price_cents: number;
  };
  items: Array<{
    id: number;
    name: string;
    description: string | null;
    category: "starter" | "main" | "drink" | "dessert";
    is_available: boolean;       // always true in this response (FR-6)
    sort_order: number;
  }>;
}
```

**Errors:**
| Code | HTTP | Condition |
|---|---|---|
| — | 404 | No `opened` menu exists for today |

---

### `POST /admin/menu`

**Auth:** Admin PIN session.  
**Kind:** Server Action `[SA]`.

**Request body (Zod):**
```ts
z.object({
  service_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),   // defaults to today if omitted
  clone_from_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes: z.string().max(500).optional(),
})
```

**Response 201:** `{ ok: true, data: { menu_id: number, service_date: string, cloned: boolean } }`

**Errors:**
| Code | HTTP | Condition |
|---|---|---|
| `MENU_DATE_CONFLICT` | 409 | A menu already exists for `service_date` |
| `CLONE_SOURCE_NOT_FOUND` | 404 | `clone_from_date` provided but no menu found for that date |

**Side effects:** Emits `NOTIFY menu_changed` with `change_type = 'item_added'` for each cloned item (batched as a single `change_type = 'menu_opened'` on clone).

---

### `POST /admin/menu/items`

**Auth:** Admin PIN session.  
**Kind:** Server Action `[SA]`.

**Request body (Zod):**
```ts
z.object({
  daily_menu_id: z.number().int().positive(),
  name: z.string().min(1).max(80),
  description: z.string().max(200).optional(),
  category: z.enum(["starter", "main", "drink", "dessert"]),
  sort_order: z.number().int().nonnegative().optional(),
})
```

**Response 201:** `{ ok: true, data: { item_id: number, sort_order: number } }`

**Errors:**
| Code | HTTP | Condition |
|---|---|---|
| `MENU_NOT_FOUND` | 404 | `daily_menu_id` does not exist |
| `MENU_CLOSED` | 409 | Menu is already closed |

**Side effects:** Writes `audit_log` entry. Emits `NOTIFY menu_changed` with `change_type = 'item_added'`, `entity_id = item_id`.

---

### `PATCH /admin/menu/items/:id`

**Auth:** Admin PIN session.  
**Kind:** Server Action `[SA]`.

**Request body (Zod):**
```ts
z.object({
  name: z.string().min(1).max(80).optional(),
  description: z.string().max(200).nullable().optional(),
  category: z.enum(["starter", "main", "drink", "dessert"]).optional(),
  sort_order: z.number().int().nonnegative().optional(),
})
```
At least one field must be present.

**Response 200:** `{ ok: true, data: { item_id: number } }`

**Errors:**
| Code | HTTP | Condition |
|---|---|---|
| `ITEM_NOT_FOUND` | 404 | Item does not exist |
| `MENU_CLOSED` | 409 | Parent menu is closed |

**Side effects:** Writes `audit_log` with `payload: { prev, next }`. Emits `NOTIFY menu_changed` with `change_type = 'item_updated'`, `entity_id = id`.

---

### `POST /admin/menu/items/:id/availability`

**Auth:** Admin PIN session.  
**Kind:** Server Action `[SA]`.

**Request body (Zod):**
```ts
z.object({
  is_available: z.boolean(),
})
```

**Response 200:** `{ ok: true, data: { item_id: number, is_available: boolean } }`

**Errors:**
| Code | HTTP | Condition |
|---|---|---|
| `ITEM_NOT_FOUND` | 404 | Item does not exist |

**Side effects:** Writes `audit_log`. Emits `NOTIFY menu_changed` with `change_type = 'availability_toggled'`, `entity_id = id`. Cache invalidated immediately.

---

### `DELETE /admin/menu/items/:id`

**Auth:** Admin PIN session.  
**Kind:** Server Action `[SA]`.

**Response 200:** `{ ok: true }`

**Errors:**
| Code | HTTP | Condition |
|---|---|---|
| `ITEM_NOT_FOUND` | 404 | Item does not exist |
| `ITEM_REFERENCED` | 409 | At least one `order_item` references this `menu_item` |
| `MENU_CLOSED` | 409 | Parent menu is closed |

**Side effects:** Writes `audit_log`. Emits `NOTIFY menu_changed` with `change_type = 'item_updated'` (signals removal to subscribers).

---

### `POST /admin/menu/combo`

**Auth:** Admin PIN session.  
**Kind:** Server Action `[SA]`.

**Request body (Zod):**
```ts
z.object({
  daily_menu_id: z.number().int().positive(),
  dine_in_price_cents: z.number().int().positive(),
  takeaway_price_cents: z.number().int().positive(),
  tupper_full_price_cents: z.number().int().positive(),
  tupper_partial_price_cents: z.number().int().positive(),
  partial_starter_price_cents: z.number().int().positive(),
  partial_main_price_cents: z.number().int().positive(),
})
```

**Response 200/201:** `{ ok: true, data: { combo_config_id: number } }` (201 on create, 200 on update).

**Errors:**
| Code | HTTP | Condition |
|---|---|---|
| `MENU_NOT_FOUND` | 404 | `daily_menu_id` does not exist |
| `MENU_CLOSED` | 409 | Menu is closed |

**Side effects:** Writes `audit_log`. Emits `NOTIFY menu_changed` with `change_type = 'combo_updated'`.

---

### `POST /admin/menu/:id/open`

**Auth:** Admin PIN session.  
**Kind:** Server Action `[SA]`.

**Response 200:** `{ ok: true, data: { menu_id: number, opened_at: string } }`

**Errors:**
| Code | HTTP | Condition |
|---|---|---|
| `MENU_NOT_FOUND` | 404 | Menu does not exist |
| `MISSING_COMBO_CONFIG` | 422 | No `combo_config` row for this menu |
| `ALREADY_OPENED` | 409 | Menu is already open |
| `CANNOT_REOPEN` | 409 | Menu was previously closed |

**Side effects:** Sets `opened_at = now()`. Writes `audit_log`. Emits `NOTIFY menu_changed` with `change_type = 'menu_opened'`.

---

### `POST /admin/menu/:id/close`

**Auth:** Admin PIN session.  
**Kind:** Server Action `[SA]`.

**Response 200:** `{ ok: true, data: { menu_id: number, closed_at: string } }`

**Errors:**
| Code | HTTP | Condition |
|---|---|---|
| `MENU_NOT_FOUND` | 404 | Menu does not exist |
| `MENU_NOT_OPEN` | 409 | Menu is not currently open (is draft or already closed) |

**Side effects:** Sets `closed_at = now()`. Writes `audit_log`. Emits `NOTIFY menu_changed` with `change_type = 'menu_closed'`. The `order-builder` capability must check `closed_at` on every `POST /api/orders`.

---

## 7. Realtime Events

**Channel:** `menu_changed`  
**Transport:** Postgres `NOTIFY menu_changed` → SSE bus singleton (`lib/realtime/bus.ts`) → SSE Route Handlers → clients.

### Payload shape

```ts
type MenuChangedPayload = {
  menu_id: number;
  change_type:
    | 'item_added'
    | 'item_updated'
    | 'availability_toggled'
    | 'combo_updated'
    | 'menu_opened'
    | 'menu_closed';
  entity_id: number | null;   // menu_item.id for item-level events; null for menu-level events
};
```

### SSE endpoint

**`GET /api/sse/menu`** — `text/event-stream`, no auth (public).  
Emits all `menu_changed` events for today's menu.

```
event: menu_changed
id: 1716480000123
data: {"menu_id":42,"change_type":"availability_toggled","entity_id":7}

: keepalive
```

- Keepalive comment every **25 s**.
- On reconnect with `Last-Event-ID`, the server re-fetches `audit_log` entries after that timestamp and replays missed events before resuming live stream.
- Client: on reconnect, `queryClient.invalidateQueries(['menu', 'today'])` is called to backfill full state.

### Subscribers

| Subscriber | Relevant events | Action on receive |
|---|---|---|
| Customer page (`(customer)/page.tsx`) | all | Patch `is_available` in TanStack Query cache; show "Se acabó este plato" badge. On `menu_closed`, show "Hoy ya cerramos" overlay. |
| Admin live view (`(staff)/admin/menu/page.tsx`) | all | Re-fetch item list or patch in-place to reflect concurrent edits. |
| `order-builder` | `availability_toggled`, `menu_closed` | Block adding sold-out items to cart; show `MENU_CLOSED` banner if applicable. |

---

## 8. Acceptance Criteria (E2E Test Scenarios)

**AC-1 — Clone yesterday's menu**  
Given a `daily_menu` with items exists for yesterday,  
when admin calls `POST /admin/menu` with `clone_from_date = yesterday`,  
then a new `daily_menu` for today is created with identical `menu_item` rows (same names, categories, sort_order) and all `is_available = true`.  
✅ Verified by Playwright test `daily-menu/clone.spec.ts`.

**AC-2 — Availability toggle propagates in real time**  
Given today's menu is `opened` and a customer has the page open,  
when admin toggles "Caldo de gallina" to `is_available = false`,  
then within 2 s the customer tab shows the item as unavailable (badge "Se acabó este plato") without a page refresh.  
✅ Verified by Playwright test `daily-menu/realtime-availability.spec.ts`.

**AC-3 — Draft menu not visible to customers**  
Given a `daily_menu` exists for today but `opened_at IS NULL`,  
when a customer requests `GET /api/menu/today`,  
then the response is HTTP 404.  
✅ Verified by Vitest integration test.

**AC-4 — Delete blocked when item is referenced by an order**  
Given `menu_item` id=7 is referenced by at least one `order_item`,  
when admin calls `DELETE /admin/menu/items/7`,  
then the response is HTTP 409 with `{ code: "ITEM_REFERENCED" }`.  
✅ Verified by Vitest integration test.

**AC-5 — Close day with unsold items**  
Given today's menu is `opened` with items still `is_available = true`,  
when admin calls `POST /admin/menu/:id/close`,  
then `closed_at` is set, the operation succeeds (HTTP 200), and the customer landing page shows "Hoy ya cerramos, regresa mañana".  
✅ Verified by Playwright test `daily-menu/close-day.spec.ts`.

---

## 9. Edge Cases

**E-1 — Simultaneous open by two admin sessions.**  
Both call `POST /admin/menu/:id/open` concurrently. The server wraps the `opened_at` update in a transaction that checks `opened_at IS NULL` before writing. The second transaction sees `opened_at` already set and returns HTTP 409 `ALREADY_OPENED`. The `UNIQUE(service_date)` constraint on `daily_menu` provides an additional guard against two menus being created for the same day.

**E-2 — High SSE subscriber count (> 50 concurrent customers).**  
The SSE bus uses a module-level `Set<(payload: MenuChangedPayload) => void>` of listener callbacks. Emitting to all subscribers is O(n) fan-out within the same Node.js event loop tick. No per-connection state is required beyond the callback reference. This is acceptable at MVP scale on a single VPS process.

**E-3 — Admin tries to open a menu without combo_config.**  
Returns HTTP 422 `MISSING_COMBO_CONFIG`. The admin UI must disable the "Abrir día de atención" button and show an inline warning until `combo_config` is saved.

**E-4 — Clone from a date with no menu.**  
Returns HTTP 404 `CLONE_SOURCE_NOT_FOUND`. The UI shows a toast and remains on the create form.

**E-5 — Item sold-out via order volume (auto sold-out).**  
Auto sold-out based on order count is **out of scope for MVP** (see §11). Admins mark items unavailable manually.

---

## 10. UI Copy (Spanish, es-PE)

| Key | String |
|---|---|
| `menu.open_day_action` | "Abrir día de atención" |
| `menu.close_day_action` | "Cerrar día" |
| `menu.mark_sold_out` | "Marcar como agotado" |
| `menu.mark_available` | "Disponible" |
| `menu.closed_message` | "Hoy ya cerramos, regresa mañana" |
| `menu.item_sold_out_badge` | "Se acabó este plato" |
| `menu.missing_combo_warning` | "Configura los precios del combo antes de abrir el día" |
| `menu.clone_action` | "Clonar menú de ayer" |
| `menu.draft_status` | "Borrador — no visible para clientes" |
| `menu.opened_status` | "Abierto" |
| `menu.closed_status` | "Cerrado" |

---

## 11. Out of Scope (MVP)

- **Multi-day scheduling** — menus are created one day at a time; no recurring or future-dated menu templates beyond single-day clone.
- **Per-item photos** — menu items are text-only in MVP.
- **Allergen / dietary tags** — no labeling system.
- **Auto sold-out from order count** — system does not decrement availability automatically when an order is placed; admin manages availability manually (FR-4, E-5).
- **Menu item reordering UI** — `sort_order` is settable via API but drag-and-drop reordering interface is post-MVP.
- **Partial combo pricing per course combination** — only `partial_starter_price_cents` and `partial_main_price_cents` are stored; pricing for arbitrary multi-course partial combos is handled by the `order-builder` capability.

---

## 12. Data Model Reference

Tables owned by this capability (full schema in `design.md §3.2`):

| Table | Key columns |
|---|---|
| `daily_menu` | `id`, `service_date` (UNIQUE), `opened_at`, `closed_at`, `notes` |
| `menu_item` | `id`, `daily_menu_id` FK, `category`, `name`, `description`, `is_available`, `sort_order` |
| `combo_config` | `id`, `daily_menu_id` (UNIQUE FK), price columns (cents) |

Index required by this capability: `menu_item(daily_menu_id, sort_order)` (already specified in design.md).

Service module: `server/services/menu.ts`  
Validation schemas: `lib/validation/menuSchemas.ts`  
In-memory cache: module-level object in `app/api/menu/today/route.ts`, invalidated by `lib/realtime/bus.ts` `menu_changed` event.
